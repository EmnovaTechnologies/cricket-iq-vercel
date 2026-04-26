'use server';

/**
 * FILE: src/lib/actions/selector-sync-actions.ts
 *
 * Bi-directional selector sync between linked scorecards and games.
 * Uses admin SDK exclusively to bypass Firestore security rules.
 *
 * Called after:
 * - assignSelectorToScorecardAction  → syncSelectorAssignToGame
 * - removeSelectorFromScorecardAction → syncSelectorRemoveFromGame
 * - updateGameSelectorsAction         → syncGameSelectorsToScorecard
 */

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type { ScorecardSelectorAssignment } from '@/types';

// ─── Scorecard → Game ─────────────────────────────────────────────────────────

/**
 * After a selector is assigned to a scorecard, sync to the linked game.
 * No-op if scorecard has no linkedGameId.
 */
export async function syncSelectorAssignToGame(
  scorecardId: string,
  assignment: { uid: string; name: string; teamAssociation: string; assignedAt: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const scSnap = await adminDb.collection('matchScorecards').doc(scorecardId).get();
    if (!scSnap.exists) return { success: true }; // no-op

    const linkedGameId = scSnap.data()?.linkedGameId;
    if (!linkedGameId) return { success: true }; // not linked

    const gameRef = adminDb.collection('games').doc(linkedGameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) return { success: true }; // game gone

    const gameData = gameSnap.data()!;
    const gameAssignments: any[] = gameData.selectorAssignments || [];
    const gameSelectorIds: string[] = gameData.selectorUserIds || [];

    // Already synced — skip
    if (gameAssignments.some((a: any) => a.uid === assignment.uid)) return { success: true };

    await gameRef.update({
      selectorAssignments: admin.firestore.FieldValue.arrayUnion(assignment),
      selectorUserIds: gameSelectorIds.includes(assignment.uid)
        ? gameSelectorIds
        : admin.firestore.FieldValue.arrayUnion(assignment.uid),
    });

    return { success: true };
  } catch (error: any) {
    console.error('[syncSelectorAssignToGame] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * After a selector is removed from a scorecard, sync removal to the linked game.
 * No-op if scorecard has no linkedGameId.
 */
export async function syncSelectorRemoveFromGame(
  scorecardId: string,
  uid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const scSnap = await adminDb.collection('matchScorecards').doc(scorecardId).get();
    if (!scSnap.exists) return { success: true };

    const linkedGameId = scSnap.data()?.linkedGameId;
    if (!linkedGameId) return { success: true };

    const gameRef = adminDb.collection('games').doc(linkedGameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) return { success: true };

    const gameData = gameSnap.data()!;
    const gameAssignments: any[] = gameData.selectorAssignments || [];
    const gameSelectorIds: string[] = gameData.selectorUserIds || [];

    await gameRef.update({
      selectorAssignments: gameAssignments.filter((a: any) => a.uid !== uid),
      selectorUserIds: gameSelectorIds.filter((id: string) => id !== uid),
    });

    return { success: true };
  } catch (error: any) {
    console.error('[syncSelectorRemoveFromGame] Error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Game → Scorecard ─────────────────────────────────────────────────────────

/**
 * After game selectors are updated via updateGameSelectorsAction,
 * sync the new selector list to the linked scorecard.
 * No-op if game has no existingScorecardId.
 */
export async function syncGameSelectorsToScorecard(
  gameId: string,
  newSelectorUserIds: string[],
  newSelectorAssignments: ScorecardSelectorAssignment[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const gameSnap = await adminDb.collection('games').doc(gameId).get();
    if (!gameSnap.exists) return { success: true };

    const existingScorecardId = gameSnap.data()?.existingScorecardId;
    if (!existingScorecardId) return { success: true };

    const scRef = adminDb.collection('matchScorecards').doc(existingScorecardId);
    const scSnap = await scRef.get();
    if (!scSnap.exists) return { success: true };

    const scAssignments: any[] = scSnap.data()?.selectorAssignments || [];

    // Keep scorecard assignments not in game (may have been added directly on scorecard)
    // then merge/overwrite with game assignments
    const gameUids = new Set(newSelectorUserIds);
    const gameAssignmentMap = new Map(newSelectorAssignments.map(a => [a.uid, a]));

    // Remove uids no longer in game selectors
    const filtered = scAssignments.filter((a: any) => gameUids.has(a.uid));
    const filteredUids = new Set(filtered.map((a: any) => a.uid));

    // Add game assignments not yet on scorecard
    for (const [uid, ga] of gameAssignmentMap) {
      if (!filteredUids.has(uid)) filtered.push(ga);
    }

    await scRef.update({ selectorAssignments: filtered });

    return { success: true };
  } catch (error: any) {
    console.error('[syncGameSelectorsToScorecard] Error:', error);
    return { success: false, error: error.message };
  }
}
