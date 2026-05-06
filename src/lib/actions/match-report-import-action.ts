'use server';

/**
 * FILE: src/lib/actions/match-report-import-action.ts
 * Parses uploaded match report (image or docx) using Claude Vision/text.
 * Returns TWO parsed reports — one per team — so the selector can review
 * and submit independently for each side.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ParsedMatchReport {
  highlights: string;
  missedCatches: string;
  missedRunOuts: string;
  greatCatchesRunOuts: string;
  sportsmanship: string;
  top3: string[];         // raw names from AI
  top3Matched: string[];  // fuzzy-matched against roster (empty string = no match)
  unmatchedCount: number;
  rawText?: string;
}

export interface ParsedMatchReportPair {
  teamA: ParsedMatchReport;
  teamB: ParsedMatchReport;
}

// ─── Fuzzy name matching ──────────────────────────────────────────────────────

function fuzzyMatchName(aiName: string, roster: string[]): string {
  if (!aiName?.trim() || !roster.length) return '';
  const norm = (s: string) => s.toLowerCase().trim();
  const na = norm(aiName);

  // 1. Exact match
  const exact = roster.find(r => norm(r) === na);
  if (exact) return exact;

  // 2. Roster name starts with AI name (e.g. "Aman" matches "Aman Sharma")
  const startsWith = roster.find(r => norm(r).startsWith(na + ' ') || norm(r) === na);
  if (startsWith) return startsWith;

  // 3. AI name is first name + last initial (e.g. "Aman S" matches "Aman Sharma")
  const parts = na.split(' ');
  if (parts.length === 2 && parts[1].length === 1) {
    const initMatch = roster.find(r => {
      const rn = norm(r).split(' ');
      return rn[0] === parts[0] && rn[1]?.startsWith(parts[1]);
    });
    if (initMatch) return initMatch;
  }

  // 4. First name only match (if unique in roster)
  const firstNameOnly = roster.filter(r => norm(r).split(' ')[0] === na.split(' ')[0]);
  if (firstNameOnly.length === 1) return firstNameOnly[0];

  return '';
}

function applyFuzzyMatching(top3: string[], roster: string[]): { matched: string[]; unmatchedCount: number } {
  const matched = top3.map(name => fuzzyMatchName(name, roster));
  const unmatchedCount = matched.filter(m => m === '').length;
  return { matched, unmatchedCount };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(team1: string, team2: string, rosterTeam1: string[], rosterTeam2: string[]): string {
  return `You are extracting a cricket match report that covers BOTH teams. Split the content into two separate reports — one for each team.

TEAM A: ${team1}
Roster: ${rosterTeam1.join(', ') || 'not provided'}

TEAM B: ${team2}
Roster: ${rosterTeam2.join(', ') || 'not provided'}

DETECTING POSITIVE vs NEGATIVE INTENT:
- "good", "great", "excellent", "sharp", "economical" → positive
- "missed", "dropped", "did not", "let go", "struggling", "poor" → negative
- Plain observations with no markers — analyse the meaning
- "Uncharacteristically" before a negative → still negative, weight lower
- Umpire negation phrases ("negated by umpire", "given not out", "umpire decision") → note the positive performance, ignore umpire outcome
- Mixed mentions → split into relevant sections

MAP content to these 5 fields FOR EACH TEAM:
- highlights: Positive batting, bowling, general fielding contributions for THIS team
- missedCatches: Dropped catches, missed catch opportunities for THIS team
- missedRunOuts: Missed run-out attempts, fumbled throws for THIS team
- greatCatchesRunOuts: Catches taken, run-outs completed, stumpings for THIS team
- sportsmanship: Attitude, conduct, arguing, respect, team spirit for THIS team

RULES:
- Preserve original wording closely — minimal paraphrasing
- Assign each observation to the correct team based on player names and context
- If an observation mentions both teams or is genuinely neutral, include in both
- top3: Extract up to 3 top performers per team. Use names exactly as written in the report.
- If a section has no content for a team, return ""

Respond ONLY with valid JSON, no markdown:
{
  "teamA": {
    "highlights": "...",
    "missedCatches": "...",
    "missedRunOuts": "...",
    "greatCatchesRunOuts": "...",
    "sportsmanship": "...",
    "top3": ["name1", "name2"]
  },
  "teamB": {
    "highlights": "...",
    "missedCatches": "...",
    "missedRunOuts": "...",
    "greatCatchesRunOuts": "...",
    "sportsmanship": "...",
    "top3": ["name1", "name2"]
  }
}`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseAIResponse(
  text: string,
  rosterTeam1: string[],
  rosterTeam2: string[]
): ParsedMatchReportPair {
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  const buildReport = (raw: any, roster: string[]): ParsedMatchReport => {
    const top3 = Array.isArray(raw.top3) ? raw.top3.slice(0, 3) : [];
    const { matched, unmatchedCount } = applyFuzzyMatching(top3, roster);
    return {
      highlights: raw.highlights || '',
      missedCatches: raw.missedCatches || '',
      missedRunOuts: raw.missedRunOuts || '',
      greatCatchesRunOuts: raw.greatCatchesRunOuts || '',
      sportsmanship: raw.sportsmanship || '',
      top3,
      top3Matched: matched,
      unmatchedCount,
      rawText: text,
    };
  };

  return {
    teamA: buildReport(parsed.teamA || {}, rosterTeam1),
    teamB: buildReport(parsed.teamB || {}, rosterTeam2),
  };
}

// ─── Image import ─────────────────────────────────────────────────────────────

export async function parseMatchReportImageAction(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  team1: string,
  team2: string,
  rosterTeam1: string[],
  rosterTeam2: string[]
): Promise<{ success: boolean; parsed?: ParsedMatchReportPair; error?: string }> {
  try {
    const client = new Anthropic();
    const prompt = buildPrompt(team1, team2, rosterTeam1, rosterTeam2);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    return { success: true, parsed: parseAIResponse(text, rosterTeam1, rosterTeam2) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── Docx import ─────────────────────────────────────────────────────────────

export async function parseMatchReportDocxAction(
  docxText: string,
  team1: string,
  team2: string,
  rosterTeam1: string[],
  rosterTeam2: string[]
): Promise<{ success: boolean; parsed?: ParsedMatchReportPair; error?: string }> {
  try {
    const client = new Anthropic();
    const prompt = buildPrompt(team1, team2, rosterTeam1, rosterTeam2);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Here is extracted text from a match report Word document:\n\n${docxText}\n\n${prompt}`,
      }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    return { success: true, parsed: parseAIResponse(text, rosterTeam1, rosterTeam2) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
