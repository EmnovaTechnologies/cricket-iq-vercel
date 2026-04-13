import type { ScorecardInnings, ScorecardScoringConfig, PlayerScore, DEFAULT_SCORING_CONFIG } from '@/types';
import { buildPlayerPerformances } from './scorecard-fielding-utils';

export function calculatePlayerScores(
  innings: ScorecardInnings[],
  config: ScorecardScoringConfig | typeof DEFAULT_SCORING_CONFIG
): PlayerScore[] {
  const performances = buildPlayerPerformances(innings);

  // Build team map from innings — batting team per innings
  const playerTeamMap = new Map<string, string>();
  for (const inn of innings) {
    for (const b of inn.batting) playerTeamMap.set(b.name, inn.battingTeam);
    for (const b of inn.bowling) {
      // Bowling team is opposite of batting team
      const bowlingTeam = innings.find(i => i.battingTeam !== inn.battingTeam)?.battingTeam || 'Unknown';
      playerTeamMap.set(b.name, bowlingTeam);
    }
    for (const f of (inn.fielding || [])) {
      const fieldingTeam = innings.find(i => i.battingTeam !== inn.battingTeam)?.battingTeam || 'Unknown';
      playerTeamMap.set(f.name, fieldingTeam);
    }
  }

  return performances.map(p => {
    const c = config as ScorecardScoringConfig;

    // ── Batting score ──────────────────────────────────────────────────────
    let battingScore = 0;
    if (p.batting) {
      const { runs, strikeRate, fours, sixes } = p.batting;
      battingScore += runs * c.batting.runsMultiplier;
      battingScore += fours * c.batting.foursMultiplier;
      battingScore += sixes * c.batting.sixesMultiplier;

      if (strikeRate > 200) battingScore += c.batting.srBonus200;
      else if (strikeRate > 150) battingScore += c.batting.srBonus150;
      else if (strikeRate > 100) battingScore += c.batting.srBonus100;
      else if (strikeRate < 50 && p.batting.balls >= 5) battingScore += c.batting.srPenaltySub50;
    }

    // ── Bowling score ──────────────────────────────────────────────────────
    let bowlingScore = 0;
    if (p.bowling) {
      const { wickets, economy, dots, wides, noballs, overs } = p.bowling;
      bowlingScore += wickets * c.bowling.wicketsMultiplier;
      bowlingScore += dots * c.bowling.dotsMultiplier;
      bowlingScore += wides * c.bowling.widesMultiplier;
      bowlingScore += noballs * c.bowling.noballsMultiplier;

      // Economy bonus only if bowled at least 1 over
      if (overs >= 1) {
        if (economy < 4) bowlingScore += c.bowling.econBonus4;
        else if (economy < 6) bowlingScore += c.bowling.econBonus6;
        else if (economy > 8) bowlingScore += c.bowling.econPenalty8;
      }
    }

    // ── Fielding score ─────────────────────────────────────────────────────
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
