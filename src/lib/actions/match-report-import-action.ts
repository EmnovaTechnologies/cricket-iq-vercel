'use server';

/**
 * FILE: src/lib/actions/match-report-import-action.ts
 * Parses uploaded match report (image or docx) using Claude Vision/text
 * and maps content to the 5 match report textarea fields.
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ParsedMatchReport {
  highlights: string;
  missedCatches: string;
  missedRunOuts: string;
  greatCatchesRunOuts: string;
  sportsmanship: string;
  top3: string[];
  rawText?: string;
}

export async function parseMatchReportImageAction(
  base64Image: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  rosterPlayerNames: string[]
): Promise<{ success: boolean; parsed?: ParsedMatchReport; error?: string }> {
  try {
    const client = new Anthropic();
    const roster = rosterPlayerNames.join(', ');

    const prompt = buildPrompt(roster);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    return { success: true, parsed: parseAIResponse(text) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function parseMatchReportDocxAction(
  docxText: string,
  rosterPlayerNames: string[]
): Promise<{ success: boolean; parsed?: ParsedMatchReport; error?: string }> {
  try {
    const client = new Anthropic();
    const roster = rosterPlayerNames.join(', ');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Here is extracted text from a match report Word document:\n\n${docxText}\n\n${buildPrompt(roster)}`,
      }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    return { success: true, parsed: parseAIResponse(text) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

function buildPrompt(roster: string): string {
  return `You are extracting and organising a cricket match report into 5 structured fields.

Known player roster (use for name matching if helpful): ${roster || 'not provided'}

DETECTING POSITIVE vs NEGATIVE INTENT:
Coaches write in many different styles. Determine intent from the actual meaning, not notation:
- Some use "+ve"/"-ve" or "(+ve)"/"(-ve)" markers — use these as hints but verify the text
- Some use "good", "great", "excellent", "sharp", "economical" → positive
- Some use "missed", "dropped", "did not", "let go", "struggling", "poor" → negative
- Some write plain observations with no markers — analyse the meaning
- "Uncharacteristically" before a negative → still negative but weight it lower
- Player did something despite being dismissed/out → still note the positive effort
- Umpire negation phrases ("negated by umpire", "given not out", "umpire decision") → note the positive performance, ignore umpire outcome for scoring
- "Did not argue umpire" → positive attitude
- Mixed mentions (e.g. "good batting but dropped a catch") → split into both relevant sections

MAP content to these fields:
- highlights: Positive batting, bowling, and general fielding contributions. Good performances, notable plays. Include BOTH teams.
- missedCatches: Negative — dropped catches, missed catch opportunities, fumbles
- missedRunOuts: Negative — missed run-out attempts, fumbled throws at stumps
- greatCatchesRunOuts: Positive — catches taken, run-outs completed, stumpings executed
- sportsmanship: Attitude, conduct, arguing with officials (negative), showing respect (positive), team spirit, effort

RULES:
- Preserve the original wording as closely as possible — minimal paraphrasing
- Include observations from BOTH teams/coaches
- Top 3 performers: extract names mentioned as top performers (max 6 combining both teams)
- If a section has no relevant content, return empty string ""

Respond ONLY with valid JSON, no markdown backticks:
{
  "highlights": "...",
  "missedCatches": "...",
  "missedRunOuts": "...",
  "greatCatchesRunOuts": "...",
  "sportsmanship": "...",
  "top3": ["name1", "name2", "name3"]
}`;
}

function parseAIResponse(text: string): ParsedMatchReport {
  const clean = text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  return {
    highlights: parsed.highlights || '',
    missedCatches: parsed.missedCatches || '',
    missedRunOuts: parsed.missedRunOuts || '',
    greatCatchesRunOuts: parsed.greatCatchesRunOuts || '',
    sportsmanship: parsed.sportsmanship || '',
    top3: Array.isArray(parsed.top3) ? parsed.top3.slice(0, 6) : [],
    rawText: text,
  };
}
