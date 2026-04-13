import type { ScorecardBatter, ScorecardFielder } from '@/types';

/**
 * Derives fielding performance from batting dismissal text.
 *
 * Dismissal patterns:
 * - "c Vinuk U b Atharv P"         → Vinuk U: catch
 * - "c †Vihaan B b Ahnay G"        → Vihaan B: keeper catch († prefix)
 * - "st Vihaan B b Nirwan D"       → Vihaan B: stumping (keeper)
 * - "run out (Mikael Q/Jeyadev K)" → both get run out credit
 * - "run out (Mikael Q)"           → Mikael Q gets run out credit
 * - "b Bowler", "lbw b Bowler", "not out", "hit wicket" → no fielder credit
 */
export function deriveFieldingStats(
  batting: ScorecardBatter[],
  byesConceded: number = 0
): ScorecardFielder[] {
  const fielderMap = new Map<string, ScorecardFielder>();

  const getOrCreate = (name: string): ScorecardFielder => {
    const clean = name.trim().replace(/^\†/, ''); // strip keeper dagger
    if (!fielderMap.has(clean)) {
      fielderMap.set(clean, { name: clean, catches: 0, runOuts: 0, stumpings: 0, keeperCatches: 0 });
    }
    return fielderMap.get(clean)!;
  };

  for (const batter of batting) {
    const d = (batter.dismissal || '').trim().toLowerCase();

    if (!d || d === 'not out' || d === 'absent' || d === 'retired hurt' || d === 'hit wicket') {
      continue;
    }

    // Keeper catch: "c †Name b ..."
    const keeperCatchMatch = batter.dismissal.match(/^c\s+†([^b]+)\s+b\s+/i);
    if (keeperCatchMatch) {
      const fielder = getOrCreate(keeperCatchMatch[1].trim());
      fielder.keeperCatches++;
      continue;
    }

    // Regular catch: "c Name b ..."
    const catchMatch = batter.dismissal.match(/^c\s+(?!†)(.+?)\s+b\s+/i);
    if (catchMatch) {
      const fielder = getOrCreate(catchMatch[1].trim());
      fielder.catches++;
      continue;
    }

    // Stumping: "st Name b ..."
    const stumpMatch = batter.dismissal.match(/^st\s+†?(.+?)\s+b\s+/i);
    if (stumpMatch) {
      const fielder = getOrCreate(stumpMatch[1].trim());
      fielder.stumpings++;
      continue;
    }

    // Run out: "run out (Name)" or "run out (Name1/Name2)"
    const runOutMatch = batter.dismissal.match(/^run\s+out\s+\(([^)]+)\)/i);
    if (runOutMatch) {
      const names = runOutMatch[1].split('/');
      for (const name of names) {
        const fielder = getOrCreate(name.trim());
        fielder.runOuts++;
      }
      continue;
    }
  }

  // Attach byes to keeper (whoever has stumpings or keeperCatches)
  if (byesConceded > 0) {
    let keeper: ScorecardFielder | undefined;
    for (const f of fielderMap.values()) {
      if (f.stumpings > 0 || f.keeperCatches > 0) { keeper = f; break; }
    }
    if (keeper) keeper.byesConceded = byesConceded;
  }

  // Only return players with at least one contribution
  return Array.from(fielderMap.values()).filter(f =>
    f.catches > 0 || f.runOuts > 0 || f.stumpings > 0 || f.keeperCatches > 0
  );
}

/**
 * Builds a player performance summary across all innings of a scorecard.
 * Used for the performance tab on the scorecard details page.
 */
export interface PlayerPerformance {
  name: string;
  // Batting
  batting?: { runs: number; balls: number; strikeRate: number; fours: number; sixes: number; dismissal: string };
  // Bowling
  bowling?: { overs: number; wickets: number; runs: number; economy: number; dots: number; wides: number; noballs: number };
  // Fielding
  fielding?: { catches: number; runOuts: number; stumpings: number; keeperCatches: number; byesConceded?: number };
}

export function buildPlayerPerformances(innings: import('@/types').ScorecardInnings[]): PlayerPerformance[] {
  const map = new Map<string, PlayerPerformance>();

  const get = (name: string) => {
    if (!map.has(name)) map.set(name, { name });
    return map.get(name)!;
  };

  for (const inn of innings) {
    // Batting
    for (const b of inn.batting) {
      const p = get(b.name);
      p.batting = { runs: b.runs, balls: b.balls, strikeRate: b.strikeRate, fours: b.fours, sixes: b.sixes, dismissal: b.dismissal };
    }
    // Bowling
    for (const b of inn.bowling) {
      const p = get(b.name);
      p.bowling = { overs: b.overs, wickets: b.wickets, runs: b.runs, economy: b.economy, dots: b.dots, wides: b.wides, noballs: b.noballs };
    }
    // Fielding
    const fielding = deriveFieldingStats(inn.batting, inn.extras?.byes || 0);
    for (const f of fielding) {
      const p = get(f.name);
      if (!p.fielding) p.fielding = { catches: 0, runOuts: 0, stumpings: 0, keeperCatches: 0 };
      p.fielding.catches += f.catches;
      p.fielding.runOuts += f.runOuts;
      p.fielding.stumpings += f.stumpings;
      p.fielding.keeperCatches += f.keeperCatches;
      if (f.byesConceded) p.fielding.byesConceded = (p.fielding.byesConceded || 0) + f.byesConceded;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
