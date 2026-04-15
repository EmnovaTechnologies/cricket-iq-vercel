'use server';

import Anthropic from '@anthropic-ai/sdk';
import type { AggregatedPlayerStats, ScorecardSelectionConstraints } from '@/types';

const anthropic = new Anthropic();

export interface SuggestedPlayer {
  name: string;
  team: string;
  role: string;
  reason: string;
  stats: {
    gamesPlayed: number;
    totalScore: number;
    avgScorePerGame: number;
    totalRuns?: number;
    totalWickets?: number;
    totalCatches?: number;
  };
}

export interface SelectionResult {
  xi: SuggestedPlayer[];
  captain: string;
  viceCaptain: string;
  summary: string;
  teamBalance: string;
}

export async function suggestXIFromScorecardAction(
  players: AggregatedPlayerStats[],
  constraints: ScorecardSelectionConstraints,
  seriesName: string
): Promise<{ success: boolean; result?: SelectionResult; error?: string }> {
  try {
    const playerData = players.map(p => ({
      name: p.name,
      team: p.team,
      gamesPlayed: p.gamesPlayed,
      totalScore: p.totalScore,
      avgScorePerGame: p.avgScorePerGame,
      totalRuns: p.totalRuns,
      totalBalls: p.totalBalls,
      avgStrikeRate: p.avgStrikeRate,
      totalWickets: p.totalWickets,
      totalOvers: p.totalOvers,
      avgOversPerGame: Math.round((p.totalOvers / p.gamesPlayed) * 10) / 10,
      totalDots: p.totalDots,
      totalCatches: p.totalCatches,
      totalRunOuts: p.totalRunOuts,
      totalStumpings: p.totalStumpings,
      totalKeeperCatches: p.totalKeeperCatches,
      isBowler: (p.totalOvers / p.gamesPlayed) >= constraints.minBowlerOversPerGame,
      isKeeper: p.totalStumpings > 0 || p.totalKeeperCatches > 0,
    }));

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are a cricket team selector. Based on scorecard performance points from the "${seriesName}" series, suggest the best XI players.

PLAYER DATA (sorted by total score):
${JSON.stringify(playerData, null, 2)}

SELECTION CONSTRAINTS:
- Team size: ${constraints.teamSize} players
- Minimum openers: ${constraints.minOpeners}
- Minimum middle order batters: ${constraints.minMiddleOrder}
- Must have wicket keeper: ${constraints.mustHaveKeeper}
- Minimum bowlers: ${constraints.minBowlers} (who bowl at least ${constraints.minBowlerOversPerGame} overs per game on average)
- Minimum all-rounders: ${constraints.minAllRounders}

SELECTION RULES:
1. Prioritize players with higher totalScore across the series
2. Players with more gamesPlayed are more reliable — prefer them over one-game wonders unless the performance gap is significant
3. Must satisfy all constraints above
4. A player marked isKeeper=true should be selected as wicket keeper if mustHaveKeeper is true
5. All-rounders (bat AND bowl) are valuable — they can count toward both batting and bowling quotas
6. Captain should be the highest overall scorer who bats
7. Vice captain should be the second best performer

Return ONLY valid JSON with no other text:
{
  "xi": [
    {
      "name": "Player Name",
      "team": "Team Name",
      "role": "Opener|Middle Order|Lower Order|Wicket Keeper|Bowler|All-Rounder",
      "reason": "Brief 1-sentence reason for selection based on their stats",
      "stats": {
        "gamesPlayed": 0,
        "totalScore": 0,
        "avgScorePerGame": 0,
        "totalRuns": 0,
        "totalWickets": 0,
        "totalCatches": 0
      }
    }
  ],
  "captain": "Player Name",
  "viceCaptain": "Player Name",
  "summary": "2-3 sentence overview of the team composition and why this XI was chosen",
  "teamBalance": "Brief description of team balance e.g. 5 batters, 1 keeper, 3 bowlers, 2 all-rounders"
}`,
      }],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const result = JSON.parse(clean) as SelectionResult;

    return { success: true, result };
  } catch (error: any) {
    console.error('[suggestXIFromScorecardAction] Error:', error);
    return { success: false, error: error.message || 'Failed to generate team suggestion.' };
  }
}
