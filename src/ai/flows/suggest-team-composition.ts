'use server';

/**
 * @fileOverview Suggests a cricket team composition using Anthropic Claude.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const TeamCompositionCriteriaSchema = z.object({
  numBatsmen: z.number(),
  numTopOrderBatsmen: z.number(),
  numMiddleOrderBatsmen: z.number(),
  numWicketKeepers: z.number(),
  numFastBowlers: z.number(),
  numMediumBowlers: z.number(),
  numSpinners: z.number(),
  totalPlayers: z.number(),
  playerData: z.string(),
});
export type TeamCompositionCriteria = z.infer<typeof TeamCompositionCriteriaSchema>;

const PlayerSchema = z.object({
  playerName: z.string(),
  primarySkill: z.string(),
  battingOrder: z.string().optional(),
  dominantHandBatting: z.string(),
  bowlingStyle: z.string().optional(),
  dominantHandBowling: z.string().optional(),
  averageScore: z.number(),
  suitabilityScore: z.number().min(0).max(100),
});

const SuggestedTeamSchema = z.array(PlayerSchema);
export type SuggestedTeam = z.infer<typeof SuggestedTeamSchema>;

export async function suggestTeamComposition(criteria: TeamCompositionCriteria): Promise<SuggestedTeam> {
  if (!criteria.playerData || criteria.playerData.trim() === '') {
    return [];
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const prompt = `You are an expert cricket team selector. Your goal is to construct the best possible team based on the criteria and player data provided.

Team Composition Criteria:
- Total Players Required: ${criteria.totalPlayers}
- Total Specialist Batsmen: ${criteria.numBatsmen}
  - Top Order Batsmen: ${criteria.numTopOrderBatsmen}
  - Middle Order Batsmen: ${criteria.numMiddleOrderBatsmen}
- Wicket Keepers: ${criteria.numWicketKeepers}
- Fast Bowlers: ${criteria.numFastBowlers}
- Medium Pace Bowlers: ${criteria.numMediumBowlers}
- Spinners (Off-Spin & Leg-Spin): ${criteria.numSpinners}

Filtered Player Data:
${criteria.playerData}

Your Task:
1. Construct a team of exactly ${criteria.totalPlayers} players.
2. Strictly adhere to the number of players required for each specialist role.
3. Prioritize players with the highest averageScore relevant to their role.
4. Assign each player a suitabilityScore (0-100) reflecting their averageScore, role fulfillment, and versatility.
5. Return the team ranked from highest to lowest suitabilityScore.

You MUST respond with ONLY a valid JSON array, no explanation, no markdown, no code blocks. Each object must have these exact fields:
- playerName (string)
- primarySkill (string: "Batting", "Bowling", or "Wicket Keeping")
- battingOrder (string, optional: "Top Order", "Middle Order", or "Low Order")
- dominantHandBatting (string: "Right" or "Left")
- bowlingStyle (string, optional: "Fast", "Medium", "OffSpin", or "LegSpin")
- dominantHandBowling (string, optional)
- averageScore (number)
- suitabilityScore (number 0-100)

Example format:
[{"playerName":"John Smith","primarySkill":"Batting","battingOrder":"Top Order","dominantHandBatting":"Right","averageScore":75.5,"suitabilityScore":92}]`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');

  // Strip any accidental markdown fences
  const cleaned = responseText.replace(/```json|```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse Claude response as JSON:', cleaned);
    throw new Error('AI returned an unexpected response format. Please try again.');
  }

  const validated = SuggestedTeamSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('Claude response failed schema validation:', validated.error);
    throw new Error('AI response did not match expected structure. Please try again.');
  }

  return validated.data;
}
