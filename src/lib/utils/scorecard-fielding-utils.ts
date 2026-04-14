import type { ScorecardBatter, ScorecardBowler, ScorecardFielder } from '@/types';

// ─── Name Matching ────────────────────────────────────────────────────────────

/**
 * Build a canonical name map from full player names in batting + bowling tables.
 * Used to resolve abbreviated names in dismissal text.
 *
 * e.g. "Atharv P" → "Atharv Pilkhane"
 *      "Aryan S"  → "Aryan Sharma"
 */
function buildNameMap(
  batting: ScorecardBatter[],
  bowling: ScorecardBowler[],
  didNotBat: string[] = []
): Map<string, string> {
  const fullNames = new Set<string>();
  batting.forEach(b => fullNames.add(b.name.trim()));
  bowling.forEach(b => fullNames.add(b.name.trim()));
  didNotBat.forEach(n => fullNames.add(n.trim()));

  const map = new Map<string, string>();

  for (const full of fullNames) {
    const parts = full.trim().split(/\s+/);
    if (parts.length < 2) {
      map.set(full.toLowerCase(), full);
      continue;
    }

    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const lastInitial = lastName[0];

    // Full name → itself
    map.set(full.toLowerCase(), full);

    // "FirstName L" → full name (most common CricClubs abbreviation)
    const abbrev1 = `${firstName} ${lastInitial}`.toLowerCase();
    if (!map.has(abbrev1)) map.set(abbrev1, full);

    // "F LastName" → full name
    const abbrev2 = `${firstName[0]} ${lastName}`.toLowerCase();
    if (!map.has(abbrev2)) map.set(abbrev2, full);

    // First name only → full name (only if unique)
    const fn = firstName.toLowerCase();
    if (!map.has(fn)) map.set(fn, full);
    else if (map.get(fn) !== full) map.set(fn, ''); // ambiguous, clear it
  }

  return map;
}

/**
 * Resolve an abbreviated name from dismissal text to its full name.
 * Falls back to the abbreviated name if no match found.
 */
function resolveName(raw: string, nameMap: Map<string, string>): string {
  const cleaned = raw.trim().replace(/^\†/, '');
  const key = cleaned.toLowerCase();

  // Direct match
  if (nameMap.has(key) && nameMap.get(key)) return nameMap.get(key)!;

  const parts = cleaned.split(/\s+/);

  // Fuzzy: first 3 chars of first name + last initial
  if (parts.length >= 1 && parts[0].length >= 3) {
    const prefix = parts[0].toLowerCase().slice(0, 3);
    const lastInit = parts.length > 1 ? parts[parts.length - 1][0]?.toLowerCase() : null;

    for (const [mapKey, mapVal] of nameMap) {
      if (!mapVal) continue;
      const mkParts = mapKey.split(/\s+/);
      if (
        mkParts[0].startsWith(prefix) &&
        (!lastInit || (mkParts.length > 1 && mkParts[mkParts.length - 1][0]?.toLowerCase() === lastInit))
      ) {
        return mapVal;
      }
    }
  }

  return cleaned;
}

// ─── Derive Fielding Stats ────────────────────────────────────────────────────

/**
 * Derives fielding performance from batting dismissal text.
 * Uses full player names from batting/bowling tables to resolve abbreviations.
 *
 * Patterns:
 * - "c Vinuk U b Atharv P"          → Vinuk U: catch
 * - "c †Vihaan B b Ahnay G"         → Vihaan B: keeper catch
 * - "st †Vihaan B b Nirwan D"       → Vihaan B: stumping
 * - "run out (Mikael Q/Jeyadev K)"  → both: run out
 */
export function deriveFieldingStats(
  batting: ScorecardBatter[],
  byesConceded: number = 0,
  bowling: ScorecardBowler[] = [],
  didNotBat: string[] = []
): ScorecardFielder[] {
  const nameMap = buildNameMap(batting, bowling, didNotBat);
  const fielderMap = new Map<string, ScorecardFielder>();

  const getOrCreate = (rawName: string): ScorecardFielder => {
    const resolved = resolveName(rawName, nameMap);
    if (!fielderMap.has(resolved)) {
      fielderMap.set(resolved, { name: resolved, catches: 0, runOuts: 0, stumpings: 0, keeperCatches: 0 });
    }
    return fielderMap.get(resolved)!;
  };

  for (const batter of batting) {
    const raw = (batter.dismissal || '').trim();
    const lower = raw.toLowerCase();

    if (!raw || lower === 'not out' || lower === 'absent' || lower === 'retired hurt' || lower === 'hit wicket') continue;

    // Keeper catch: "c †Name b ..."
    const keeperCatchMatch = raw.match(/^c\s+†([^b]+?)\s+b\s+/i);
    if (keeperCatchMatch) { getOrCreate(keeperCatchMatch[1].trim()).keeperCatches++; continue; }

    // Regular catch: "c Name b ..."
    const catchMatch = raw.match(/^c\s+(?!†)(.+?)\s+b\s+/i);
    if (catchMatch) { getOrCreate(catchMatch[1].trim()).catches++; continue; }

    // Stumping: "st †?Name b ..."
    const stumpMatch = raw.match(/^st\s+†?(.+?)\s+b\s+/i);
    if (stumpMatch) { getOrCreate(stumpMatch[1].trim()).stumpings++; continue; }

    // Run out: "run out (Name)" or "run out (Name1/Name2)"
    const runOutMatch = raw.match(/^run\s+out\s+\(([^)]+)\)/i);
    if (runOutMatch) {
      runOutMatch[1].split('/').forEach(name => getOrCreate(name.trim()).runOuts++);
      continue;
    }
  }

  // Attach byes to keeper
  if (byesConceded > 0) {
    for (const f of fielderMap.values()) {
      if (f.stumpings > 0 || f.keeperCatches > 0) { f.byesConceded = byesConceded; break; }
    }
  }

  return Array.from(fielderMap.values()).filter(f =>
    f.catches > 0 || f.runOuts > 0 || f.stumpings > 0 || f.keeperCatches > 0
  );
}

// ─── Player Performance Summary ───────────────────────────────────────────────

export interface PlayerPerformance {
  name: string;
  batting?: { runs: number; balls: number; strikeRate: number; fours: number; sixes: number; dismissal: string };
  bowling?: { overs: number; wickets: number; runs: number; economy: number; dots: number; wides: number; noballs: number };
  fielding?: { catches: number; runOuts: number; stumpings: number; keeperCatches: number; byesConceded?: number };
}

export function buildPlayerPerformances(innings: import('@/types').ScorecardInnings[]): PlayerPerformance[] {
  const map = new Map<string, PlayerPerformance>();
  const get = (name: string) => { if (!map.has(name)) map.set(name, { name }); return map.get(name)!; };

  for (const inn of innings) {
    for (const b of inn.batting) {
      get(b.name).batting = { runs: b.runs, balls: b.balls, strikeRate: b.strikeRate, fours: b.fours, sixes: b.sixes, dismissal: b.dismissal };
    }
    for (const b of inn.bowling) {
      get(b.name).bowling = { overs: b.overs, wickets: b.wickets, runs: b.runs, economy: b.economy, dots: b.dots, wides: b.wides, noballs: b.noballs };
    }

    const fielding = deriveFieldingStats(inn.batting, inn.extras?.byes || 0, inn.bowling, inn.didNotBat);
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
