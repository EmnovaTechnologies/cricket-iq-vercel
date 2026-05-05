'use server';

/**
 * FILE: src/lib/actions/match-report-ai-action.ts
 * Server action: analyse all match report sections with AI,
 * return per-player per-dimension delta suggestions.
 */

import Anthropic from '@anthropic-ai/sdk';
import { adminDb } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export interface MatchReportDelta {
  playerId: string;
  playerName: string;
  dimension: 'batting' | 'bowling' | 'fielding' | 'keeping' | 'attitude';
  delta: number; // -2 to +2
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'pending' | 'accepted' | 'rejected';
}

export interface AnalyseMatchReportInput {
  scorecardId: string;
  gameId: string;
  organizationId: string;
  rosterPlayers: { id: string; name: string }[];
  sections: {
    highlights: string;
    missedCatches: string;
    missedRunOuts: string;
    greatCatchesRunOuts: string;
    sportsmanship: string;
  };
}

export async function analyseMatchReportAction(
  input: AnalyseMatchReportInput
): Promise<{ success: boolean; deltas?: MatchReportDelta[]; error?: string }> {
  try {
    const client = new Anthropic();

    const rosterList = input.rosterPlayers.map(p => `- ${p.name} (id: ${p.id})`).join('\n');

    const prompt = `You are a cricket match analyst. Analyse the match report notes below and suggest rating deltas for players.

PLAYER ROSTER (only suggest deltas for these players):
${rosterList}

MATCH REPORT SECTIONS:
=== Game Highlights ===
${input.sections.highlights || '(empty)'}

=== Missed Catches ===
${input.sections.missedCatches || '(empty)'}

=== Missed Run-Outs ===
${input.sections.missedRunOuts || '(empty)'}

=== Great Catches / Run-Outs ===
${input.sections.greatCatchesRunOuts || '(empty)'}

=== Overall Sportsmanship ===
${input.sections.sportsmanship || '(empty)'}

RULES:
1. Section headers are HINTS ONLY — analyse actual text sentiment regardless of section
2. Determine positive/negative intent from MEANING not notation — some coaches use +ve/-ve markers, others write plain text. Judge the actual sentiment regardless
3. IGNORE any phrases containing: "negated by umpire", "given not out", "umpire decision", "umpire call" — these are external factors
4. "Uncharacteristically" reduces weight of negative observation by ~50%
5. Same player mentioned multiple times → aggregate per dimension (do not double count)
6. Only suggest deltas for players in the roster above
7. Dimension mapping:
   - batting: runs, shot selection, timing, boundaries
   - bowling: wickets, economy, line/length, variations  
   - fielding: catches, run outs, ground fielding, throwing
   - keeping: wicket keeping catches, stumpings, handling wides/byes
   - attitude: conduct, arguing, sportsmanship, effort, teamwork
8. Delta scale: +2 (exceptional), +1 (good), +0.5 (minor positive), -0.5 (minor negative), -1 (poor), -2 (very poor)
9. Confidence: high (explicit clear mention), medium (implied), low (vague or context unclear)
10. If a player has both positive and negative mentions for same dimension, create separate entries

Respond ONLY with a JSON array. No markdown, no explanation. Example format:
[
  {
    "playerId": "abc123",
    "playerName": "Abdul Bayes",
    "dimension": "bowling",
    "delta": 0.5,
    "reason": "good bowling, middle order wickets",
    "confidence": "high"
  }
]`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('');

    const clean = text.replace(/```json|```/g, '').trim();
    const rawDeltas = JSON.parse(clean) as Omit<MatchReportDelta, 'status'>[];

    const deltas: MatchReportDelta[] = rawDeltas
      .filter(d => input.rosterPlayers.some(p => p.id === d.playerId || p.name === d.playerName))
      .map(d => {
        // Ensure playerId is set even if AI used name
        const player = input.rosterPlayers.find(p => p.id === d.playerId || p.name === d.playerName);
        return {
          ...d,
          playerId: player?.id || d.playerId,
          playerName: player?.name || d.playerName,
          delta: Math.max(-2, Math.min(2, d.delta)), // clamp to -2..+2
          status: 'pending' as const,
        };
      });

    return { success: true, deltas };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function saveMatchReportDeltasAction(
  scorecardId: string,
  gameId: string,
  organizationId: string,
  deltas: MatchReportDelta[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const batch = adminDb.batch();
    // Delete existing pending deltas for this scorecard
    const existing = await adminDb.collection('matchReportDeltas')
      .where('scorecardId', '==', scorecardId)
      .where('status', '==', 'pending')
      .get();
    existing.docs.forEach(d => batch.delete(d.ref));

    // Save new deltas
    deltas.forEach(delta => {
      const ref = adminDb.collection('matchReportDeltas').doc();
      batch.set(ref, {
        ...delta,
        scorecardId,
        gameId,
        organizationId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateDeltaStatusAction(
  deltaId: string,
  status: 'accepted' | 'rejected',
  appliedByUid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('matchReportDeltas').doc(deltaId).update({
      status,
      appliedByUid,
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getDeltasForScorecardAction(
  scorecardId: string
): Promise<{ success: boolean; deltas?: (MatchReportDelta & { id: string })[]; error?: string }> {
  try {
    const snap = await adminDb.collection('matchReportDeltas')
      .where('scorecardId', '==', scorecardId)
      .get();
    const deltas = snap.docs.map(d => ({ id: d.id, ...d.data() } as MatchReportDelta & { id: string }));
    return { success: true, deltas };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getAcceptedDeltasForSeriesAction(
  organizationId: string,
  seriesGameIds: string[]
): Promise<{ success: boolean; deltas?: (MatchReportDelta & { id: string; gameId: string })[]; error?: string }> {
  try {
    if (!seriesGameIds.length) return { success: true, deltas: [] };
    // Firestore 'in' limit is 30
    const chunks = [];
    for (let i = 0; i < seriesGameIds.length; i += 30) {
      chunks.push(seriesGameIds.slice(i, i + 30));
    }
    const results = await Promise.all(chunks.map(chunk =>
      adminDb.collection('matchReportDeltas')
        .where('organizationId', '==', organizationId)
        .where('gameId', 'in', chunk)
        .where('status', '==', 'accepted')
        .get()
    ));
    const deltas = results.flatMap(snap =>
      snap.docs.map(d => ({ id: d.id, ...d.data() } as MatchReportDelta & { id: string; gameId: string }))
    );
    return { success: true, deltas };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
