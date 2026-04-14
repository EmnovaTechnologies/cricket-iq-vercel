import type { MatchScorecard, AggregatedPlayerStats, ScorecardScoringConfig } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';
import { calculatePlayerScores } from './scorecard-scoring-engine';

/**
 * Aggregates player performance across all scorecards in a series.
 * Returns sorted list by totalScore descending.
 */
export function aggregatePlayerStats(
  scorecards: MatchScorecard[],
  config: ScorecardScoringConfig | typeof DEFAULT_SCORING_CONFIG
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
          // Scores
          totalBattingScore: s.battingScore,
          totalBowlingScore: s.bowlingScore,
          totalFieldingScore: s.fieldingScore,
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
  minBowlerOversPerGame: number = 2
) {
  return players.map(p => {
    const avgOvers = p.totalOvers / p.gamesPlayed;
    const isKeeper = p.totalStumpings > 0 || p.totalKeeperCatches > 0;
    const isBowler = avgOvers >= minBowlerOversPerGame && p.totalWickets > 0;
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
