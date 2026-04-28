'use server';

/**
 * @fileOverview Suggests a cricket camp selection team using Anthropic Claude.
 * Uses camp assessments + fitness results + series performance (optional).
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const CampSelectionCriteriaSchema = z.object({
  campName: z.string(),
  totalPlayers: z.number(),
  batters: z.number(),
  bowlers: z.number(),
  allRounders: z.number(),
  wicketKeepers: z.number(),
  reserves: z.number(),
  requireFitnessPass: z.boolean(),
  // Weights (must sum to 100)
  weightAssessment: z.number(),     // coach camp assessment weight
  weightFitness: z.number(),        // fitness test weight
  weightSeriesPerformance: z.number(), // existing series ratings weight
  playerData: z.string(),           // formatted player data string
});
export type CampSelectionCriteria = z.infer<typeof CampSelectionCriteriaSchema>;

const CampSelectedPlayerSchema = z.object({
  bibNumber: z.number(),
  playerName: z.string(),
  suggestedRole: z.string(),        // 'Batting', 'Bowling', 'Wicket Keeping', 'Batting Allrounder', 'Bowling Allrounder'
  selectionType: z.enum(['selected', 'reserve']),
  campAssessmentAvg: z.number(),
  suitabilityScore: z.number().min(0).max(100),
  selectionReason: z.string(),
});

const CampSuggestedTeamSchema = z.array(CampSelectedPlayerSchema);
export type CampSuggestedTeam = z.infer<typeof CampSuggestedTeamSchema>;

export async function suggestCampTeam(criteria: CampSelectionCriteria): Promise<CampSuggestedTeam> {
  if (!criteria.playerData || criteria.playerData.trim() === '') return [];

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const totalWithReserves = criteria.totalPlayers + criteria.reserves;

  const prompt = `You are an expert cricket talent scout and selector. Your goal is to select the best ${totalWithReserves} players (${criteria.totalPlayers} main squad + ${criteria.reserves} reserves) for the final camp selection based on multiple weighted criteria.

Camp: ${criteria.campName}

Selection Criteria:
- Main Squad: ${criteria.totalPlayers} players
- Reserves: ${criteria.reserves} players
- Role breakdown (main squad):
  - Specialist Batters: ${criteria.batters}
  - Specialist Bowlers: ${criteria.bowlers}
  - All-Rounders: ${criteria.allRounders}
  - Wicket Keepers: ${criteria.wicketKeepers}
${criteria.requireFitnessPass ? '- MANDATORY: Only players who PASSED the fitness test are eligible' : '- Fitness test pass is NOT mandatory for selection'}

Scoring Weights (must be applied to composite score):
- Camp Assessment Score (coach ratings): ${criteria.weightAssessment}%
- Fitness Test Score: ${criteria.weightFitness}%
- Series Performance Score: ${criteria.weightSeriesPerformance}%

Player Data (one player per line):
${criteria.playerData}

Each player line format:
Bib#N | Name: [name] | PlayerSkill: [skill] | CoachSkill: [skill or 'same'] | AvgAssessment: [0-5] | Batting: [0-5] | Bowling: [0-5] | Fielding: [0-5] | Fitness: [0-5] | Attitude: [0-5] | Coaches: [N] | FitnessScore: [score or 'N/A'] | FitnessPass: [Pass/Fail/N/A] | SeriesAvg: [0-5 or 'N/A']

Your Task:
1. Apply the weighted scoring to compute a composite score per player.
2. If fitness pass is mandatory, exclude all players with FitnessPass=Fail.
3. Select exactly ${criteria.totalPlayers} main squad + ${criteria.reserves} reserves.
4. Respect the role breakdown for the main squad.
5. For each selected player, use the CoachSkill if provided (not 'same'), otherwise PlayerSkill.
6. Return players ranked by suitabilityScore descending.

You MUST respond with ONLY a valid JSON array, no explanation, no markdown, no code blocks.
Each object must have exactly these fields:
- bibNumber (number)
- playerName (string)
- suggestedRole (string: "Batting", "Bowling", "Wicket Keeping", "Batting Allrounder", "Bowling Allrounder")
- selectionType (string: "selected" or "reserve")
- campAssessmentAvg (number: 0-5, rounded to 1 decimal)
- suitabilityScore (number: 0-100)
- selectionReason (string: 1 sentence explaining why selected)

Example:
[{"bibNumber":12,"playerName":"Aarav Sharma","suggestedRole":"Batting","selectionType":"selected","campAssessmentAvg":4.2,"suitabilityScore":88,"selectionReason":"Highest batting assessment score with excellent fitness and strong series performance."}]`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  const cleaned = responseText.replace(/```json|```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse camp AI response:', cleaned);
    throw new Error('AI returned an unexpected response format. Please try again.');
  }

  const validated = CampSuggestedTeamSchema.safeParse(parsed);
  if (!validated.success) {
    console.error('Camp AI response failed validation:', validated.error);
    throw new Error('AI response did not match expected structure. Please try again.');
  }

  return validated.data;
}
