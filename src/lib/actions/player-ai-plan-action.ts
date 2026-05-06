'use server';

/**
 * FILE: src/lib/actions/player-ai-plan-action.ts
 *
 * Calls Claude to synthesise a player's stats, benchmarks, selector feedback
 * and camp ratings into 3 prioritised, actionable improvement suggestions.
 *
 * Privacy guarantees:
 * - No other player names are passed in
 * - Benchmarks are anonymous percentiles only
 * - Selector feedback is already distilled (reasons only, no names)
 * - Camp ratings are averaged — no individual coach breakdown
 */

import Anthropic from '@anthropic-ai/sdk';
import type { PlayerStatsResult } from './player-stats-action';

export interface AIPlanSuggestion {
  rank: number;
  dimension: string;
  suggestion: string;
  impact: 'high' | 'medium' | 'low';
}

export interface AIPlanResult {
  success: boolean;
  suggestions?: AIPlanSuggestion[];
  error?: string;
}

export async function generatePlayerAIPlanAction(
  stats: PlayerStatsResult
): Promise<AIPlanResult> {
  try {
    if (!stats.aggregated) {
      return { success: false, error: 'Not enough data to generate an improvement plan.' };
    }

    const client = new Anthropic();

    const agg = stats.aggregated;
    const camp = stats.campPerformance[0]; // most recent camp if any

    // Build benchmark summary
    const benchmarkSummary = stats.benchmarks.map(b => {
      const tier = b.percentile >= 75 ? 'top 25%' : b.percentile >= 50 ? 'above median' : b.percentile >= 25 ? 'below median' : 'bottom 25%';
      return `- ${b.label}: player value ${b.playerValue} (${tier} of series, series median ${b.seriesMedian})`;
    }).join('\n');

    // Build feedback summary (dimension + reason only, no names)
    const feedbackSummary = stats.feedback.length === 0
      ? 'No selector feedback available.'
      : stats.feedback.map(f => `- ${f.dimension} (${f.delta > 0 ? '+' : ''}${f.delta}): ${f.reason}`).join('\n');

    // Build camp summary
    const campSummary = !camp
      ? 'No camp data available.'
      : `Batting: ${camp.avgBatting}/5, Bowling: ${camp.avgBowling}/5, Fielding: ${camp.avgFielding}/5, Fitness: ${camp.avgFitness}/5, Attitude: ${camp.avgAttitude}/5, Overall: ${camp.avgOverall}/5. Fitness test: ${camp.fitnessPassed === true ? 'Passed' : camp.fitnessPassed === false ? 'Failed' : 'No data'}.`;

    const prompt = `You are an expert cricket coach providing a personalised improvement plan for a player. Your goal is to give specific, actionable advice based on their actual performance data.

PLAYER PROFILE:
- Name: ${stats.playerName}
- Primary skill: ${stats.primarySkill || 'Not set'}
- Batting hand: ${stats.dominantHandBatting || 'Not set'}
- Bowling style: ${stats.bowlingStyle || 'Not set'}

AGGREGATED STATS (${agg.gamesPlayed} games):
- Batting: ${agg.totalRuns} runs, SR ${agg.avgStrikeRate}, ${agg.totalFours} fours, ${agg.totalSixes} sixes
- Bowling: ${agg.totalWickets} wickets, ${agg.totalOvers} overs, economy ${agg.avgEconomy}
- Fielding: ${agg.totalCatches} catches, ${agg.totalRunOuts} run outs, ${agg.totalStumpings} stumpings
- XI Selector score: ${agg.avgScorePerGame} avg per game

ANONYMOUS SERIES BENCHMARKS (no player names):
${benchmarkSummary || 'No benchmark data.'}

SELECTOR FEEDBACK (distilled from match observations, no selector names):
${feedbackSummary}

CAMP COACH RATINGS (averaged across all coaches):
${campSummary}

INSTRUCTIONS:
1. Analyse all data sources together
2. Identify the 3 most impactful areas for improvement
3. For each: write ONE specific, actionable suggestion (2-3 sentences)
4. Reference actual numbers from the data (e.g. "your economy of 6.8...")
5. Tone: encouraging, direct, coach-like — not generic
6. Do NOT mention other player names or ranks
7. Do NOT say "based on your data" or "according to the stats" — just give the advice

Respond ONLY with a JSON array. No markdown, no preamble. Format:
[
  {
    "rank": 1,
    "dimension": "Fielding",
    "suggestion": "...",
    "impact": "high"
  },
  ...
]`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    const clean = text.replace(/```json|```/g, '').trim();
    const suggestions = JSON.parse(clean) as AIPlanSuggestion[];

    return {
      success: true,
      suggestions: suggestions.slice(0, 3).map((s, i) => ({
        ...s,
        rank: i + 1,
      })),
    };
  } catch (e: any) {
    console.error('[generatePlayerAIPlanAction] Error:', e);
    return { success: false, error: e.message };
  }
}
