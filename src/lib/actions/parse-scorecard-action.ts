'use server';

import Anthropic from '@anthropic-ai/sdk';
import type { ScorecardInnings } from '@/types';

const anthropic = new Anthropic();

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ImageInput {
  base64: string;
  mediaType: MediaType;
  label: string; // e.g. "Innings 1 Batting", "Innings 2 Bowling"
}

export interface ParseAllResult {
  success: boolean;
  innings?: ScorecardInnings[];
  error?: string;
}

/**
 * Send all available scorecard screenshots to Claude in a single API call.
 * Claude sees all images at once and can cross-reference full names across all tables,
 * eliminating the abbreviated name problem in fielding/dismissals.
 */
export async function parseAllScorecardImagesAction(
  images: ImageInput[],
  team1: string,
  team2: string
): Promise<ParseAllResult> {
  try {
    if (!images.length) return { success: false, error: 'No images provided.' };

    // Build image content blocks
    const imageBlocks: any[] = images.flatMap((img, i) => [
      {
        type: 'text',
        text: `--- Image ${i + 1}: ${img.label} ---`,
      },
      {
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      },
    ]);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          {
            type: 'text',
            text: `You have been given ${images.length} cricket scorecard screenshot(s) for a match between ${team1} and ${team2}.

Extract the complete scorecard data and return ONLY a valid JSON object with no other text, markdown, or code fences.

The JSON structure must be:
{
  "innings": [
    {
      "inningsNumber": 1,
      "battingTeam": "exact team name e.g. ${team1}",
      "totalRuns": 0,
      "wickets": 0,
      "overs": "20.1",
      "extras": { "byes": 0, "legByes": 0, "wides": 0, "noballs": 0, "total": 0 },
      "batting": [
        {
          "name": "Full Name",
          "runs": 0,
          "balls": 0,
          "fours": 0,
          "sixes": 0,
          "strikeRate": 0.00,
          "dismissal": "c Full Fielder Name b Full Bowler Name"
        }
      ],
      "bowling": [
        {
          "name": "Full Name",
          "overs": 3.0,
          "maidens": 0,
          "dots": 0,
          "runs": 0,
          "wickets": 0,
          "economy": 0.00,
          "wides": 0,
          "noballs": 0
        }
      ],
      "fallOfWickets": ["1-10 (Over 1.6)", "2-25 (Over 5.3)"],
      "didNotBat": ["Full Name", "Full Name"]
    }
  ]
}

CRITICAL RULES:

1. FULL NAMES EVERYWHERE — This is the most important rule:
   - Use full player names from the Name column of batting/bowling tables
   - In dismissal text, ALWAYS expand abbreviated names to full names by cross-referencing ALL visible player name columns across ALL images
   - Example: "c Dhruva S b Nihaar G" → look up "Dhruva S" and "Nihaar G" in all batting/bowling tables across all images → expand to "c Dhruva Sharma b Nihaar Gaikwad"
   - The wicket keeper dagger symbol † MUST be preserved exactly as-is before the keeper's name. This is critical for identifying the wicket keeper. Example: "c †Nihaar Gaikwad b Varun Thomas" — the † must appear before Nihaar Gaikwad's name. Never remove or replace the † symbol.
   - For run outs expand all names: "run out (Mikael Qazi/Jeyadev Kumar)"
   - NEVER leave abbreviated names in dismissals if the full name appears anywhere in any of the provided images

2. TEAM LOGIC:
   - ${team1} innings 1: ${team1} bats, ${team2} bowls and fields
   - ${team2} innings 2: ${team2} bats, ${team1} bowls and fields
   - Assign inningsNumber based on which innings each screenshot shows

3. BATTING TABLE:
   - Extract ALL batters including "not out" players
   - Set dismissal to "not out" for not out batters
   - didNotBat: all names under "Did not bat" (strip asterisk * symbol)
   - Extras: parse (b X lb X w X nb X) format

4. BOWLING TABLE:
   - Wides/noballs may appear in a notes column like "(3 w)" or "(5 w1 nb)"
   - If Dot column missing set dots to 0

5. Only include innings for screenshots that are provided. If only 2 images are given, only return those innings. Do not fabricate data.

6. All numeric values must be numbers, not strings.`,
          },
        ],
      }],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Validate structure
    if (!parsed.innings || !Array.isArray(parsed.innings)) {
      return { success: false, error: 'Invalid response structure from Claude.' };
    }

    return { success: true, innings: parsed.innings as ScorecardInnings[] };
  } catch (error: any) {
    console.error('[parseAllScorecardImagesAction] Error:', error);
    return { success: false, error: error.message || 'Failed to parse scorecard images.' };
  }
}

// ─── Keep individual actions for backwards compatibility ──────────────────────
// These are no longer used by the import form but kept in case needed elsewhere

export async function parseBattingImageAction(
  base64Image: string,
  mediaType: MediaType,
  inningsNumber: 1 | 2
): Promise<{ success: boolean; data?: any; error?: string }> {
  const result = await parseAllScorecardImagesAction(
    [{ base64: base64Image, mediaType, label: `Innings ${inningsNumber} Batting` }],
    'Team 1', 'Team 2'
  );
  if (!result.success) return { success: false, error: result.error };
  const inn = result.innings?.find(i => i.inningsNumber === inningsNumber);
  return { success: true, data: inn };
}

export async function parseBowlingImageAction(
  base64Image: string,
  mediaType: MediaType,
  inningsNumber: 1 | 2
): Promise<{ success: boolean; data?: any; error?: string }> {
  const result = await parseAllScorecardImagesAction(
    [{ base64: base64Image, mediaType, label: `Innings ${inningsNumber} Bowling` }],
    'Team 1', 'Team 2'
  );
  if (!result.success) return { success: false, error: result.error };
  const inn = result.innings?.find(i => i.inningsNumber === inningsNumber);
  return { success: true, data: { bowling: inn?.bowling, fallOfWickets: inn?.fallOfWickets } };
}
