'use server';

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp';

// ─── Parse Batting Screenshot ─────────────────────────────────────────────────

export async function parseBattingImageAction(
  base64Image: string,
  mediaType: MediaType,
  inningsNumber: 1 | 2
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          {
            type: 'text',
            text: `Extract ONLY the batting data from this cricket scorecard screenshot. Return ONLY valid JSON with no other text.

{
  "battingTeam": "exact team name from innings header e.g. WYCA innings or SCCAY innings",
  "totalRuns": 120,
  "wickets": 4,
  "overs": "20.1",
  "extras": { "byes": 0, "legByes": 0, "wides": 4, "noballs": 0, "total": 4 },
  "batting": [
    {
      "name": "Full player name as shown",
      "runs": 18,
      "balls": 21,
      "fours": 2,
      "sixes": 0,
      "strikeRate": 85.71,
      "dismissal": "c Vinuk U b Atharv P"
    }
  ],
  "didNotBat": ["Aarav Arora", "Siddhanth Kaul"]
}

Rules:
- Extract ALL batters in the batting table
- For extras: parse (b X lb X w X nb X) — if a value is missing assume 0
- didNotBat: extract all names listed under "Did not bat" (ignore the asterisk * symbol)
- Use exact player names as shown
- For "not out" dismissal, set dismissal to "not out"
- All numbers must be actual numbers not strings`,
          },
        ],
      }],
    });

    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const data = JSON.parse(clean);
    return { success: true, data };
  } catch (error: any) {
    console.error('[parseBattingImageAction] Error:', error);
    return { success: false, error: error.message || 'Failed to parse batting image.' };
  }
}

// ─── Parse Bowling Screenshot ─────────────────────────────────────────────────

export async function parseBowlingImageAction(
  base64Image: string,
  mediaType: MediaType,
  inningsNumber: 1 | 2
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          {
            type: 'text',
            text: `Extract ONLY the bowling data and fall of wickets from this cricket scorecard screenshot. Return ONLY valid JSON with no other text.

{
  "bowling": [
    {
      "name": "Full player name as shown",
      "overs": 5.0,
      "maidens": 1,
      "dots": 19,
      "runs": 30,
      "wickets": 1,
      "economy": 6.00,
      "wides": 3,
      "noballs": 0
    }
  ],
  "fallOfWickets": [
    "1-10 (Over 1.6)",
    "2-25 (Over 5.3)"
  ]
}

Rules:
- Extract ALL bowlers shown in the bowling table
- Columns are: O (overs), M (maidens), Dot (dot balls), R (runs), W (wickets), Econ (economy)
- Wides and no-balls may appear in a notes column like "(3 w)" or "(5 w1 nb)" — extract them
- If Dot column is missing set dots to 0
- If wides/noballs not shown set to 0
- Fall of wickets: extract each entry as "score-runs (Over X.Y)" format
- If no fall of wickets section visible set to empty array []
- Use exact player names
- All numbers must be actual numbers not strings`,
          },
        ],
      }],
    });

    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const data = JSON.parse(clean);
    return { success: true, data };
  } catch (error: any) {
    console.error('[parseBowlingImageAction] Error:', error);
    return { success: false, error: error.message || 'Failed to parse bowling image.' };
  }
}
