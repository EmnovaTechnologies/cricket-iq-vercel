/**
 * FILE: src/lib/utils/cricclubs-xls-parser.ts
 *
 * Parses CricClubs Excel/CSV scorecard exports into MatchScorecard innings data.
 *
 * Handles:
 * - CSV exports (.csv) from CricClubs viewScorecard Excel download
 * - Excel files (.xlsx, .xls) via SheetJS — converted to CSV then parsed
 *
 * Format assumptions (based on CricClubs export):
 * - Line 1: "{SeriesName}: {ResultString} ({Date})"  e.g. "SCCAY - Socal Practice Games: LeagueWYCA won by 6 Wickets (12/20/2025)"
 * - Line 2: "{Team1} Vs {Team2}"
 * - Sections delimited by "{Team} Batting", "{Team} Bowling", "{Team} Fall of Wickets"
 * - Batting rows: Name, How Out, Fielder, Bowler, Runs, Balls, Fours, Sixers
 * - Bowling rows: Bowler, Overs, Maidens, Runs, Wickets, Wides, No Balls, Hattricks, Dot Balls
 * - Extras line: "Byes: N , Leg Byes: N, Wickets : N  Wides : N, No Balls: N Penalty : N, TotalRuns, Overs"
 * - Fall of wickets: "PlayerShort, Score-Wicket , Over X.Y"
 * - Did not bat: rows after extras with 0 balls (and not in the fielding column of dismissals)
 */

import type { ScorecardInnings, ScorecardBatter, ScorecardBowler, ScorecardFielder, ScorecardExtras } from '@/types';

// ─── Public result type ───────────────────────────────────────────────────────

export interface ParsedCricClubsScorecard {
  team1: string;
  team2: string;
  date: string;          // ISO YYYY-MM-DD
  result: string;
  seriesNameRaw: string; // raw series string from line 1, before team names
  innings: ScorecardInnings[];
  parseWarnings: string[];
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Parse raw CSV text from a CricClubs scorecard export.
 * For XLSX files, convert to CSV first using SheetJS (caller's responsibility).
 */
export function parseCricClubsCsv(csvText: string): ParsedCricClubsScorecard {
  const lines = csvText.split(/\r?\n/);
  const warnings: string[] = [];

  // ── Header parsing ──────────────────────────────────────────────────────────
  const headerLine = cleanLine(lines[0] || '');
  const teamVsLine = cleanLine(lines[1] || '');

  // Extract team names from "Team1 Vs Team2"
  const vsMatch = teamVsLine.match(/^(.+?)\s+[Vv][Ss]\.?\s+(.+)$/);
  const team1 = vsMatch ? vsMatch[1].trim() : '';
  const team2 = vsMatch ? vsMatch[2].trim() : '';

  // Extract date from header "(MM/DD/YYYY)" or "(YYYY-MM-DD)"
  const dateMatch = headerLine.match(/\((\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\)/);
  const date = dateMatch ? normalizeDate(dateMatch[1]) : '';

  // Extract result — everything between the last team name and the date
  // e.g. "...LeagueWYCA won by 6 Wickets (12/20/2025)" → "WYCA won by 6 Wickets"
  // CricClubs smashes the league name into the team name: "LeagueWYCA" → strip leading word
  const resultMatch = headerLine.match(/([A-Z][A-Za-z0-9\s]+won\s+by\s+[^(]+)/i);
  let result = resultMatch ? resultMatch[1].trim() : '';
  // Strip leading non-team token (e.g. "League" prefix smashed before team name like "LeagueWYCA")
  // Find the first all-caps team name token and start the result from there
  const teamStartMatch = result.match(/([A-Z]{2,}(?:\s+[A-Za-z0-9]+)*\s+won\s+by\s+[^(]+)/);
  if (teamStartMatch) result = teamStartMatch[1].trim();

  // Extract series name — everything before the result in line 1
  // "SCCAY - Socal Practice Games: LeagueWYCA won by 6 Wickets"
  // → series = "SCCAY - Socal Practice Games"
  let seriesNameRaw = headerLine;
  if (result) {
    const idx = headerLine.indexOf(result);
    if (idx > 0) seriesNameRaw = headerLine.slice(0, idx).trim().replace(/:?\s*$/, '').trim();
  }
  // Strip trailing "League" or "league" that CricClubs sometimes appends before team name
  seriesNameRaw = seriesNameRaw.replace(/\s*League\s*$/i, '').trim();

  // ── Section detection ───────────────────────────────────────────────────────
  // Find all section header line indices
  const sections: Array<{ type: 'batting' | 'bowling' | 'fow'; team: string; lineIdx: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const cl = cleanLine(lines[i]);
    const battingMatch = cl.match(/^(.+?)\s+Batting[\s,]*$/i);
    const bowlingMatch = cl.match(/^(.+?)\s+Bowling[\s,]*$/i);
    const fowMatch = cl.match(/^(.+?)\s+Fall\s+of\s+[Ww]ickets?[\s,]*$/i);
    if (battingMatch) sections.push({ type: 'batting', team: battingMatch[1].trim(), lineIdx: i });
    else if (bowlingMatch) sections.push({ type: 'bowling', team: bowlingMatch[1].trim(), lineIdx: i });
    else if (fowMatch) sections.push({ type: 'fow', team: fowMatch[1].trim(), lineIdx: i });
  }

  // ── Build innings ───────────────────────────────────────────────────────────
  // CricClubs alternates: Team1 Batting, Team2 Bowling, [FoW], Team2 Batting, Team1 Bowling, [FoW]
  const battingSections = sections.filter(s => s.type === 'batting');
  const bowlingSections = sections.filter(s => s.type === 'bowling');
  const fowSections = sections.filter(s => s.type === 'fow');

  const innings: ScorecardInnings[] = [];

  for (let i = 0; i < battingSections.length; i++) {
    const batSec = battingSections[i];
    const nextSectionIdx = sections.find(s => s.lineIdx > batSec.lineIdx && s.type !== 'batting')?.lineIdx ?? lines.length;

    // Get batting lines (from after header until next section)
    const batLines = lines.slice(batSec.lineIdx + 1, nextSectionIdx);

    // Find corresponding bowling section for this innings (bowling team = other team)
    const bowlTeam = batSec.team === team1 ? team2 : team1;
    const bowlSec = bowlingSections.find(s => s.team === bowlTeam && s.lineIdx > batSec.lineIdx);
    const nextAfterBowl = sections.find(s => s.lineIdx > (bowlSec?.lineIdx ?? 0) && s.type !== 'bowling')?.lineIdx ?? lines.length;
    const bowlLines = bowlSec ? lines.slice(bowlSec.lineIdx + 1, nextAfterBowl) : [];

    // Find FoW for this batting team
    const fowSec = fowSections.find(s => s.team === batSec.team && s.lineIdx > batSec.lineIdx);
    const nextAfterFow = sections.find(s => s.lineIdx > (fowSec?.lineIdx ?? 0))?.lineIdx ?? lines.length;
    const fowLines = fowSec ? lines.slice(fowSec.lineIdx + 1, nextAfterFow) : [];

    const { batting, didNotBat, extras, totalRuns, wickets, overs } = parseBattingSection(batLines, warnings);
    const bowling = parseBowlingSection(bowlLines, warnings);
    const fallOfWickets = parseFow(fowLines);
    const fielding = deriveFielding(batting);

    innings.push({
      inningsNumber: (i + 1) as 1 | 2,
      battingTeam: batSec.team,
      totalRuns,
      wickets,
      overs,
      extras,
      batting,
      bowling,
      fielding,
      fallOfWickets,
      didNotBat,
    });
  }

  return { team1, team2, date, result, seriesNameRaw, innings, parseWarnings: warnings };
}

// ─── Batting section parser ───────────────────────────────────────────────────

function parseBattingSection(lines: string[], warnings: string[]): {
  batting: ScorecardBatter[];
  didNotBat: string[];
  extras: ScorecardExtras;
  totalRuns: number;
  wickets: number;
  overs: string;
} {
  const batting: ScorecardBatter[] = [];
  const didNotBat: string[] = [];
  let extras: ScorecardExtras = { byes: 0, legByes: 0, wides: 0, noballs: 0, total: 0 };
  let totalRuns = 0;
  let wickets = 0;
  let overs = '0';
  let extrasLineIdx = -1;

  // Find extras line first — it contains "Byes:"
  for (let i = 0; i < lines.length; i++) {
    const cl = cleanLine(lines[i]);
    if (/Byes:/i.test(cl)) {
      extrasLineIdx = i;
      extras = parseExtras(cl);
      // Total runs and overs follow in the same cell (comma-separated at end)
      const parts = lines[i].split(',').map(p => p.trim());
      // Last two non-empty parts are totalRuns and overs
      const nums = parts.filter(p => /^[\d.]+$/.test(p));
      if (nums.length >= 2) {
        totalRuns = parseInt(nums[nums.length - 2]) || 0;
        overs = nums[nums.length - 1] || '0';
      }
      break;
    }
  }

  // Parse batting rows — those before the extras line
  const battingLines = extrasLineIdx >= 0 ? lines.slice(0, extrasLineIdx) : lines;
  // Rows after extras line = did not bat candidates
  const afterExtras = extrasLineIdx >= 0 ? lines.slice(extrasLineIdx + 1) : [];

  // Build set of fielder names from dismissals (to help DNB detection)
  const fielderNames = new Set<string>();

  for (const line of battingLines) {
    const cl = cleanLine(line);
    if (!cl) continue;
    // Skip header row
    if (/^BatsMan/i.test(cl)) continue;

    const cols = parseCsvRow(line);
    if (cols.length < 6) continue;

    const name = cols[0]?.trim();
    const howOut = cols[1]?.trim() || '';
    const fielder = cols[2]?.trim() || '';
    const bowler = cols[3]?.trim() || '';
    const runs = parseInt(cols[4]) || 0;
    const balls = parseInt(cols[5]) || 0;
    const fours = parseInt(cols[6]) || 0;
    const sixes = parseInt(cols[7]) || 0;

    if (!name) continue;
    if (fielder) fielderNames.add(fielder);

    const strikeRate = balls > 0 ? Math.round((runs / balls) * 100 * 10) / 10 : 0;
    const dismissal = buildDismissal(howOut, fielder, bowler);

    batting.push({ name, runs, balls, fours, sixes, strikeRate, dismissal });
  }

  // Derive wickets from batting (non-not-out, non-DNB dismissals)
  wickets = batting.filter(b => b.dismissal && b.dismissal !== 'not out' && b.balls > 0).length;

  // DNB: rows where balls=0 AND howOut is empty AND not a confirmed fielder
  // These can appear anywhere in the batting section (CricClubs puts them before extras)
  // Separate pass: identify DNB from already-parsed batting array
  const toRemove: string[] = [];
  for (const b of batting) {
    if (b.balls === 0 && (!b.dismissal || b.dismissal === 'not out')) {
      // Check if they appeared as a fielder — if so they batted (just faced 0 balls)
      if (!fielderNames.has(b.name) && !fielderNames.has(b.name.split(' ')[0])) {
        didNotBat.push(b.name);
        toRemove.push(b.name);
      }
    }
  }
  // Remove DNB players from batting array
  for (const name of toRemove) {
    const idx = batting.findIndex(b => b.name === name);
    if (idx !== -1) batting.splice(idx, 1);
  }

  // Also check afterExtras for any remaining DNB rows
  for (const line of afterExtras) {
    const cl = cleanLine(line);
    if (!cl) continue;
    if (/^BatsMan/i.test(cl)) continue;
    const cols = parseCsvRow(line);
    if (cols.length < 2) continue;
    const name = cols[0]?.trim();
    if (name && !didNotBat.includes(name)) {
      didNotBat.push(name);
    }
  }

  return { batting, didNotBat, extras, totalRuns, wickets, overs };
}

// ─── Bowling section parser ───────────────────────────────────────────────────

function parseBowlingSection(lines: string[], warnings: string[]): ScorecardBowler[] {
  const bowling: ScorecardBowler[] = [];

  for (const line of lines) {
    const cl = cleanLine(line);
    if (!cl) continue;
    if (/^Bowler/i.test(cl)) continue;
    if (/^Total/i.test(cl)) continue;

    const cols = parseCsvRow(line);
    if (cols.length < 6) continue;

    const name = cols[0]?.trim();
    if (!name) continue;

    const overs = parseFloat(cols[1]) || 0;
    const maidens = parseInt(cols[2]) || 0;
    const runs = parseInt(cols[3]) || 0;
    const wickets = parseInt(cols[4]) || 0;
    const wides = parseInt(cols[5]) || 0;
    const noballs = parseInt(cols[6]) || 0;
    // cols[7] = hattricks (skip)
    const dots = parseInt(cols[8]) || 0;
    const economy = overs > 0 ? Math.round((runs / overs) * 10) / 10 : 0;

    bowling.push({ name, overs, maidens, runs, wickets, economy, wides, noballs, dots });
  }

  return bowling;
}

// ─── Fall of wickets parser ───────────────────────────────────────────────────

function parseFow(lines: string[]): string[] {
  const fow: string[] = [];
  for (const line of lines) {
    const cl = cleanLine(line);
    if (!cl) continue;
    // Format: "PlayerShort, 1-0 ,  Over 0.4"
    const m = cl.match(/^(.+?),\s*(\d+-\d+[A-Za-z]*)\s*,\s*Over\s*([\d.]+)/i);
    if (m) fow.push(`${m[2]} (${m[3]} ov) - ${m[1].trim()}`);
  }
  return fow;
}

// ─── Extras parser ────────────────────────────────────────────────────────────

function parseExtras(line: string): ScorecardExtras {
  const byes = parseInt(line.match(/Byes:\s*(\d+)/i)?.[1] || '0');
  const legByes = parseInt(line.match(/Leg\s+Byes:\s*(\d+)/i)?.[1] || '0');
  const wides = parseInt(line.match(/Wides\s*:\s*(\d+)/i)?.[1] || '0');
  const noballs = parseInt(line.match(/No\s+Balls:\s*(\d+)/i)?.[1] || '0');
  const total = byes + legByes + wides + noballs;
  return { byes, legByes, wides, noballs, total };
}

// ─── Dismissal builder ────────────────────────────────────────────────────────

function buildDismissal(howOut: string, fielder: string, bowler: string): string {
  if (!howOut) return 'not out';
  const h = howOut.toLowerCase().trim();
  if (h === 'b') return `b ${bowler}`;
  if (h === 'ct') return `c ${fielder} b ${bowler}`;
  if (h === 'ctw' || h === 'st') return `st ${fielder} b ${bowler}`;
  if (h === 'lbw') return `lbw b ${bowler}`;
  if (h === 'ro' || h === 'runout') return `run out (${fielder})`;
  if (h === 'hb' || h === 'hit wicket') return `hit wicket b ${bowler}`;
  return howOut;
}

// ─── Fielding derivation from dismissals ──────────────────────────────────────

function deriveFielding(batting: ScorecardBatter[]): ScorecardFielder[] {
  const map = new Map<string, ScorecardFielder>();
  const get = (name: string) => {
    if (!map.has(name)) map.set(name, { name, catches: 0, runOuts: 0, stumpings: 0, keeperCatches: 0 });
    return map.get(name)!;
  };

  for (const b of batting) {
    const d = b.dismissal || '';
    const catchMatch = d.match(/^c\s+(.+?)\s+b\s+/i);
    const stumpMatch = d.match(/^st\s+(.+?)\s+b\s+/i);
    const runOutMatch = d.match(/^run\s+out\s+\((.+?)\)/i);
    if (catchMatch) get(catchMatch[1].trim()).catches++;
    if (stumpMatch) get(stumpMatch[1].trim()).stumpings++;
    if (runOutMatch) get(runOutMatch[1].trim()).runOuts++;
  }

  return Array.from(map.values());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanLine(line: string): string {
  // Strip leading and trailing tabs, commas, and whitespace
  return line.replace(/^[\t,\s]+/, '').replace(/[,\s]+$/, '').trim();
}

function parseCsvRow(line: string): string[] {
  // Strip leading tabs/whitespace from the whole line before splitting
  const cleanedLine = line.replace(/^[\t\s,]+/, '');
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of cleanedLine) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function normalizeDate(raw: string): string {
  // Handle MM/DD/YYYY or YYYY-MM-DD
  const parts = raw.split(/[\/\-]/);
  if (parts.length !== 3) return raw;
  if (parts[2].length === 4) {
    // MM/DD/YYYY
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  // Already YYYY-MM-DD
  return raw;
}

// ─── XLSX → CSV conversion (client-side, uses SheetJS) ───────────────────────

/**
 * Convert an XLSX/XLS file to CSV text using SheetJS.
 * Import SheetJS dynamically to avoid bundle bloat.
 * Returns the CSV string of the first sheet.
 */
export async function xlsxToCsv(file: File): Promise<string> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(firstSheet, { blankrows: true });
}
