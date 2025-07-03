
'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting a cricket team composition based on specified criteria.
 * The player data provided to this flow is expected to be pre-filtered based on series, age eligibility, and any minimum performance scores or games played.
 *
 * - suggestTeamComposition - A function that takes team criteria and a list of eligible player data, and returns a ranked list of players.
 * - TeamCompositionCriteria - The input type for the suggestTeamComposition function.
 * - SuggestedTeam - The return type for the suggestTeamComposition function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TeamCompositionCriteriaSchema = z.object({
  numBatsmen: z.number().describe('The total number of specialist batsmen required in the team.'),
  numTopOrderBatsmen: z.number().describe('Of the specialist batsmen, the number who should primarily bat in the Top Order.'),
  numMiddleOrderBatsmen: z.number().describe('Of the specialist batsmen, the number who should primarily bat in the Middle Order.'),
  numWicketKeepers: z.number().describe('The number of wicket keepers required in the team.'),
  numFastBowlers: z.number().describe('The number of fast bowlers required in the team.'),
  numMediumBowlers: z.number().describe('The number of medium pace bowlers required in the team.'),
  numSpinners: z.number().describe('The number of spin bowlers required in the team (off-spin and leg-spin).'),
  totalPlayers: z.number().describe('The total number of players required in the team.'),
  playerData: z.string().describe('A string containing information for pre-filtered, eligible players, including name, primary skill (Batting, Bowling, or Wicket Keeping), batting order (Top, Middle, Low), bowling style (Fast, Medium, OffSpin, LegSpin), dominant batting hand (Right, Left), dominant bowling hand (Right, Left, if applicable), average score (relevant to primary skill), and games played. This player data has already been filtered for series eligibility, age appropriateness, and potentially minimum performance scores, games played, or other criteria if specified by the user. This should be formatted so the AI can easily understand it, typically as "PlayerName: Key1=Value1, Key2=Value2; ..."')
});
export type TeamCompositionCriteria = z.infer<typeof TeamCompositionCriteriaSchema>;

const SuggestedTeamSchema = z.array(
  z.object({
    playerName: z.string().describe('The name of the player.'),
    primarySkill: z.string().describe('The primary skill of the player (Batting, Bowling, or Wicket Keeping).'),
    battingOrder: z.string().optional().describe('The batting order of the player (Top, Middle, Low), if applicable.'),
    dominantHandBatting: z.string().describe('The dominant batting hand of the player (Right or Left).'),
    bowlingStyle: z.string().optional().describe('The bowling style of the player (Fast, Medium, OffSpin, LegSpin), if applicable.'),
    dominantHandBowling: z.string().optional().describe('The dominant bowling hand of the player (Right or Left), if applicable to the player.'),
    averageScore: z.number().describe("The average score of the player relevant to their primary skill."),
    suitabilityScore: z.number().min(0).max(100).describe('A score (0-100, higher is better) indicating how well the player fits the team composition criteria, based on their average score, role fulfillment, and versatility.')
  })
);
export type SuggestedTeam = z.infer<typeof SuggestedTeamSchema>;

export async function suggestTeamComposition(criteria: TeamCompositionCriteria): Promise<SuggestedTeam> {
  return suggestTeamCompositionFlow(criteria);
}

const prompt = ai.definePrompt({
  name: 'suggestTeamCompositionPrompt',
  input: {schema: TeamCompositionCriteriaSchema},
  output: {schema: SuggestedTeamSchema},
  prompt: `You are an expert cricket team selector. Your goal is to construct the best possible team based on the criteria and player data provided.

Team Composition Criteria:
- Total Players Required: {{{totalPlayers}}}
- Total Specialist Batsmen: {{{numBatsmen}}}
  - Top Order Batsmen: {{{numTopOrderBatsmen}}}
  - Middle Order Batsmen: {{{numMiddleOrderBatsmen}}}
- Wicket Keepers: {{{numWicketKeepers}}}
- Fast Bowlers: {{{numFastBowlers}}}
- Medium Pace Bowlers: {{{numMediumBowlers}}}
- Spinners (Off-Spin & Leg-Spin): {{{numSpinners}}}

Filtered Player Data:
{{{playerData}}}
This player data has already been filtered for series eligibility, age appropriateness, and any minimum performance scores or games played if specified by the user. Each player entry includes their name, primary skill (e.g. Batting, Bowling, Wicket Keeping), batting order (e.g., Top Order), bowling style (e.g., Off Spin), dominant batting hand (e.g., Right Hand), dominant bowling hand (e.g., Left Hand, if applicable), average score (this is specific to their primary skill), and games played.

Your Task:
1.  Construct a team of exactly \`{{{totalPlayers}}}\` players.
2.  Strictly adhere to the number of players required for each specialist role and sub-role:
    *   First, select \`{{{numTopOrderBatsmen}}}\` specialist batsmen whose \`battingOrder\` is 'Top Order'.
    *   Next, select \`{{{numMiddleOrderBatsmen}}}\` specialist batsmen whose \`battingOrder\` is 'Middle Order'.
    *   If \`{{{numTopOrderBatsmen}}} + {{{numMiddleOrderBatsmen}}} < {{{numBatsmen}}}\`, select the remaining \`{{{numBatsmen}}} - ({{{numTopOrderBatsmen}}} + {{{numMiddleOrderBatsmen}}})\` specialist batsmen. These players should have 'Batting' as their primary skill and can have any batting order (Top Order, Middle Order, or Low Order), prioritizing those with higher average scores.
    *   Select \`{{{numWicketKeepers}}}\` players for the Wicket Keeper role. Prioritize players whose primary skill is 'Wicket Keeping'. If insufficient, consider versatile players with high fielding/batting scores who might also perform wicket keeping duties if their player data indicates any prior experience or suitability (though primary skill 'Wicket Keeping' is preferred).
    *   Select \`{{{numFastBowlers}}}\` Fast Bowlers.
    *   Select \`{{{numMediumBowlers}}}\` Medium Pace Bowlers.
    *   Select \`{{{numSpinners}}}\` Spinners (Off-Spin or Leg-Spin).
    *   When selecting for these specialist roles, prioritize players with the highest \`averageScore\` relevant to that role from the \`Filtered Player Data\`.
3.  If, after filling all specialist quotas, the team size is still less than \`{{{totalPlayers}}}\`, select additional players from the remaining pool in the \`Filtered Player Data\` to meet the \`{{{totalPlayers}}}\` requirement. These additional players should be chosen based on their overall \`averageScore\` and versatility.
4.  For each selected player, assign a \`suitabilityScore\` (0-100, higher is better). This score should reflect:
    *   Their \`averageScore\`.
    *   How well they fulfill a required role (or sub-role like Top Order Batsman) in the team composition.
    *   Their versatility if they are chosen to fill a non-specialist spot.
5.  The final output must be a JSON array of the selected players, ranked from highest to lowest \`suitabilityScore\`.

Output Format:
Ensure the output is a JSON array of players, with each player object containing: \`playerName\`, \`primarySkill\`, \`battingOrder\` (optional), \`dominantHandBatting\`, \`bowlingStyle\` (optional), \`dominantHandBowling\` (optional, if applicable to the player), \`averageScore\`, and \`suitabilityScore\`. The primarySkill should be one of 'Batting', 'Bowling', or 'Wicket Keeping'.`,
});

const suggestTeamCompositionFlow = ai.defineFlow(
  {
    name: 'suggestTeamCompositionFlow',
    inputSchema: TeamCompositionCriteriaSchema,
    outputSchema: SuggestedTeamSchema,
  },
  async (input): Promise<SuggestedTeam> => {
    try {
      if (!input.playerData || input.playerData.trim() === '') {
        // If playerData is empty after all filters, return an empty array.
        return [];
      }
      const {output} = await prompt(input);
      
      if (!output) {
        console.error('AI prompt in suggestTeamCompositionFlow returned successfully but output was null or undefined. Input:', JSON.stringify(input));
        // Consider if an empty array is appropriate or if an error should be thrown.
        // For now, let's throw an error to make it visible that the AI didn't produce the expected output.
        throw new Error('AI prompt did not return the expected output structure.');
      }
      return output;
    } catch (flowError) {
      console.error('Error within suggestTeamCompositionFlow execution. Input:', JSON.stringify(input), 'Error:', flowError);
      // Re-throw the error so it can be caught by the calling server action
      // and potentially transformed into a user-friendly message.
      throw flowError;
    }
  }
);
