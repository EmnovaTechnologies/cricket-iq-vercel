import type { ScorecardInnings, ScorecardScoringConfig, PlayerScore } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';
import { buildPlayerPerformances } from './scorecard-fielding-utils';

/**
 * Normalize a battingTeam string to match team1/team2.
 * CricClubs stores "SCCAY innings (35 overs maximum)" — extract just the team name.
 */
function normalizeTeamName(raw: string, team1: string, team2: string): string {
  const r = raw.toLowerCase();
  if (r.includes(team1.toLowerCase())) return team1;
  if (r.includes(team2.toLowerCase())) return team2;
  // Fallback — take first word
  return raw.split(/\s+/)[0];
}

export function calculatePlayerScores(
  innings: ScorecardInnings[],
  config: ScorecardScoringConfig | typeof DEFAULT_SCORING_CONFIG,
  team1: string,
  team2: string
): PlayerScore[] {
  const performances = buildPlayerPerformances(innings);

  // Build team map — batters belong to their batting team, bowlers/fielders to the other team
  const playerTeamMap = new Map<string, string>();

  for (const inn of innings) {
    const battingTeam = normalizeTeamName(inn.battingTeam, team1, team2);
    const bowlingTeam = battingTeam === team1 ? team2 : team1;

    for (const b of inn.batting) playerTeamMap.set(b.name, battingTeam);
    for (const name of (inn.didNotBat || [])) { if (name) playerTeamMap.set(name, battingTeam); }
    for (const b of inn.bowling) {
      if (!playerTeamMap.has(b.name)) playerTeamMap.set(b.name, bowlingTeam);
    }
    for (const f of (inn.fielding || [])) {
      if (!playerTeamMap.has(f.name)) playerTeamMap.set(f.name, bowlingTeam);
    }
  }

  const c = config as ScorecardScoringConfig;

  return performances.map(p => {
    // ── Batting score ────────────────────────────────────────────────────
    let battingScore = 0;
    if (p.batting) {
      const { runs, strikeRate, fours, sixes, balls } = p.batting;
      battingScore += runs * c.batting.runsMultiplier;
      battingScore += fours * c.batting.foursMultiplier;
      battingScore += sixes * c.batting.sixesMultiplier;

      if (strikeRate > 200) battingScore += c.batting.srBonus200;
      else if (strikeRate > 150) battingScore += c.batting.srBonus150;
      else if (strikeRate > 100) battingScore += c.batting.srBonus100;
      else if (strikeRate < 50 && balls >= 5) battingScore += c.batting.srPenaltySub50;
    }

    // ── Bowling score ────────────────────────────────────────────────────
    let bowlingScore = 0;
    if (p.bowling) {
      const { wickets, economy, dots, wides, noballs, overs } = p.bowling;
      bowlingScore += wickets * c.bowling.wicketsMultiplier;
      bowlingScore += dots * c.bowling.dotsMultiplier;
      bowlingScore += wides * c.bowling.widesMultiplier;
      bowlingScore += noballs * c.bowling.noballsMultiplier;

      if (overs >= 1) {
        if (economy < 4) bowlingScore += c.bowling.econBonus4;
        else if (economy < 6) bowlingScore += c.bowling.econBonus6;
        else if (economy > 8) bowlingScore += c.bowling.econPenalty8;
      }
    }

    // ── Fielding score ───────────────────────────────────────────────────
    let fieldingScore = 0;
    if (p.fielding) {
      const { catches, runOuts, stumpings, keeperCatches, byesConceded } = p.fielding;
      fieldingScore += catches * c.fielding.catchesMultiplier;
      fieldingScore += runOuts * c.fielding.runOutsMultiplier;
      fieldingScore += stumpings * c.fielding.stumpingsMultiplier;
      fieldingScore += keeperCatches * c.fielding.keeperCatchesMultiplier;
      if (byesConceded) fieldingScore += byesConceded * c.fielding.byesMultiplier;
    }

    return {
      name: p.name,
      team: playerTeamMap.get(p.name) || 'Unknown',
      battingScore: Math.round(battingScore * 10) / 10,
      bowlingScore: Math.round(bowlingScore * 10) / 10,
      fieldingScore: Math.round(fieldingScore * 10) / 10,
      totalScore: Math.round((battingScore + bowlingScore + fieldingScore) * 10) / 10,
      batting: p.batting,
      bowling: p.bowling,
      fielding: p.fielding,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

export function getTopPlayers(scores: PlayerScore[], n = 3) {
  return {
    overall: scores.slice(0, n),
    batters: [...scores].filter(s => s.batting).sort((a, b) => b.battingScore - a.battingScore).slice(0, n),
    bowlers: [...scores].filter(s => s.bowling).sort((a, b) => b.bowlingScore - a.bowlingScore).slice(0, n),
    fielders: [...scores].filter(s => s.fielding).sort((a, b) => b.fieldingScore - a.fieldingScore).slice(0, n),
  };
}

export function getTopPlayersByTeam(scores: PlayerScore[], teams: string[], n = 3) {
  return teams.map(team => ({
    team,
    overall: scores.filter(s => s.team === team).slice(0, n),
    batters: [...scores].filter(s => s.team === team && s.batting).sort((a, b) => b.battingScore - a.battingScore).slice(0, n),
    bowlers: [...scores].filter(s => s.team === team && s.bowling).sort((a, b) => b.bowlingScore - a.bowlingScore).slice(0, n),
    fielders: [...scores].filter(s => s.team === team && s.fielding).sort((a, b) => b.fieldingScore - a.fieldingScore).slice(0, n),
  }));
}
