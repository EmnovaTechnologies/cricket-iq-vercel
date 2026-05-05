import type { MatchScorecard, AggregatedPlayerStats, ScorecardScoringConfig, MatchReport } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';
import { calculatePlayerScores } from './scorecard-scoring-engine';

/** Fuzzy name match — returns true if names are likely the same player */
function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim();
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  // Check if first word matches (Aarush Datla vs Aarush D)
  const firstA = na.split(' ')[0], firstB = nb.split(' ')[0];
  if (firstA === firstB && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

/** Count how many times a player appears in top3 across all reports */
function countCoachMentions(playerName: string, reports: MatchReport[]): number {
  let count = 0;
  for (const report of reports) {
    for (const mention of report.top3Players) {
      if (namesMatch(playerName, mention)) { count++; break; } // max 1 per report
    }
  }
  return count;
}

/**
 * Aggregates player performance across all scorecards in a series.
 * Optionally applies coachTopRatingScore from match reports.
 * Returns sorted list by totalScore descending.
 */
export function aggregatePlayerStats(
  scorecards: MatchScorecard[],
  config: ScorecardScoringConfig | typeof DEFAULT_SCORING_CONFIG,
  matchReports: MatchReport[] = []
): AggregatedPlayerStats[] {
  const playerMap = new Map<string, AggregatedPlayerStats>();

  for (const sc of scorecards) {
    if (!sc.innings?.length) continue;

    const scores = calculatePlayerScores(sc.innings, config, sc.team1, sc.team2);

    for (const s of scores) {
      const existing = playerMap.get(s.name);

      if (!existing) {
        playerMap.set(s.name, {
          name: s.name,
          team: s.team,
          gamesPlayed: 1,
          // Batting
          totalRuns: s.batting?.runs || 0,
          totalBalls: s.batting?.balls || 0,
          totalFours: s.batting?.fours || 0,
          totalSixes: s.batting?.sixes || 0,
          avgStrikeRate: s.batting?.strikeRate || 0,
          // Bowling
          totalWickets: s.bowling?.wickets || 0,
          totalOvers: s.bowling?.overs || 0,
          totalDots: s.bowling?.dots || 0,
          avgEconomy: s.bowling?.economy || 0,
          totalWides: s.bowling?.wides || 0,
          totalNoballs: s.bowling?.noballs || 0,
          // Fielding
          totalCatches: s.fielding?.catches || 0,
          totalRunOuts: s.fielding?.runOuts || 0,
          totalStumpings: s.fielding?.stumpings || 0,
          totalKeeperCatches: s.fielding?.keeperCatches || 0,
          // Scores (coach rating applied later)
          totalBattingScore: s.battingScore,
          totalBowlingScore: s.bowlingScore,
          totalFieldingScore: s.fieldingScore,
          totalCoachTopRatingScore: 0,
          coachMentions: 0,
          totalScore: s.totalScore,
          avgScorePerGame: s.totalScore,
        });
      } else {
        // Accumulate
        existing.gamesPlayed++;
        existing.totalRuns += s.batting?.runs || 0;
        existing.totalBalls += s.batting?.balls || 0;
        existing.totalFours += s.batting?.fours || 0;
        existing.totalSixes += s.batting?.sixes || 0;
        existing.totalWickets += s.bowling?.wickets || 0;
        existing.totalOvers += s.bowling?.overs || 0;
        existing.totalDots += s.bowling?.dots || 0;
        existing.totalWides += s.bowling?.wides || 0;
        existing.totalNoballs += s.bowling?.noballs || 0;
        existing.totalCatches += s.fielding?.catches || 0;
        existing.totalRunOuts += s.fielding?.runOuts || 0;
        existing.totalStumpings += s.fielding?.stumpings || 0;
        existing.totalKeeperCatches += s.fielding?.keeperCatches || 0;
        existing.totalBattingScore += s.battingScore;
        existing.totalBowlingScore += s.bowlingScore;
        existing.totalFieldingScore += s.fieldingScore;
        existing.totalScore += s.totalScore;
      }
    }
  }

  // Apply coach top rating scores from match reports
  const perMention = (config as ScorecardScoringConfig).coachTopRatingPerMention ?? 15;
  for (const p of playerMap.values()) {
    const mentions = countCoachMentions(p.name, matchReports);
    const cappedMentions = Math.min(mentions, 3);
    p.coachMentions = mentions;
    p.totalCoachTopRatingScore = Math.round(cappedMentions * perMention * 10) / 10;
    p.totalScore += p.totalCoachTopRatingScore;
  }

  // Compute derived averages
  for (const p of playerMap.values()) {
    p.avgScorePerGame = Math.round((p.totalScore / p.gamesPlayed) * 10) / 10;
    p.avgStrikeRate = p.totalBalls > 0
      ? Math.round((p.totalRuns / p.totalBalls) * 1000) / 10
      : 0;
    p.avgEconomy = p.totalOvers > 0
      ? Math.round((p.totalWickets > 0 ? p.totalBowlingScore / p.totalOvers : 0) * 10) / 10
      : 0;
    // Round all scores
    p.totalBattingScore = Math.round(p.totalBattingScore * 10) / 10;
    p.totalBowlingScore = Math.round(p.totalBowlingScore * 10) / 10;
    p.totalFieldingScore = Math.round(p.totalFieldingScore * 10) / 10;
    p.totalScore = Math.round(p.totalScore * 10) / 10;
  }

  return Array.from(playerMap.values())
    .sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Classify players into roles based on their aggregated stats.
 */
export function classifyPlayers(
  players: AggregatedPlayerStats[],
  minBowlerOversPerGame: number = 2,
  scorecards: MatchScorecard[] = []
) {
  // Build keeper name set from dismissal text across all scorecards
  // This catches cases where keeper was identified in dismissals but fielding wasn't stored correctly
  const keeperNames = new Set<string>();
  for (const sc of scorecards) {
    for (const inn of (sc.innings || [])) {
      for (const b of (inn.batting || [])) {
        const d = b.dismissal || '';
        // Match "c †Name b ..." or "st †?Name b ..."
        const keeperMatch = d.match(/^(?:c|st)\s+[†+✝]([^b]+?)\s+b\s+/i);
        if (keeperMatch) keeperNames.add(keeperMatch[1].trim().toLowerCase());
        const stumpMatch = d.match(/^st\s+(?![†+✝])(.+?)\s+b\s+/i);
        if (stumpMatch) keeperNames.add(stumpMatch[1].trim().toLowerCase());
      }
    }
  }

  return players.map(p => {
    const avgOvers = p.totalOvers / p.gamesPlayed;
    const isKeeperByFielding = p.totalStumpings > 0 || p.totalKeeperCatches > 0;
    const isKeeperByDismissal = keeperNames.has(p.name.toLowerCase()) ||
      Array.from(keeperNames).some(k => p.name.toLowerCase().includes(k) || k.includes(p.name.toLowerCase().split(' ')[0]));
    const isKeeper = isKeeperByFielding || isKeeperByDismissal;
    const isBowler = avgOvers >= minBowlerOversPerGame;
    const isBatter = p.totalRuns > 0 || p.totalBalls > 0;
    const isAllRounder = isBatter && isBowler;

    return {
      ...p,
      isKeeper,
      isBowler,
      isBatter,
      isAllRounder,
      avgOvers: Math.round(avgOvers * 10) / 10,
    };
  });
}
