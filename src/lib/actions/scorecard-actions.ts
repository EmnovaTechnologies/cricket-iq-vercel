'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type { MatchScorecard, ScorecardPlayer, ScorecardInnings } from '@/types';

// ─── Save Scorecard ────────────────────────────────────────────────────────────

export async function saveScorecardAction(
  scorecard: Omit<MatchScorecard, 'id' | 'importedAt'>,
  importedBy: string
): Promise<{ success: boolean; scorecardId?: string; error?: string }> {
  try {
    const data = {
      ...scorecard,
      importedBy,
      importedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await adminDb.collection('matchScorecards').add(data);
    await upsertScorecardPlayers(scorecard.innings, scorecard.organizationId, ref.id);
    return { success: true, scorecardId: ref.id };
  } catch (error: any) {
    console.error('[saveScorecardAction] Error:', error);
    return { success: false, error: error.message || 'Failed to save scorecard.' };
  }
}

// ─── Delete Scorecard ─────────────────────────────────────────────────────────

export async function deleteScorecardAction(
  scorecardId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get scorecard to find all player names
    const scorecardDoc = await adminDb.collection('matchScorecards').doc(scorecardId).get();
    if (!scorecardDoc.exists) return { success: false, error: 'Scorecard not found.' };

    const scorecard = scorecardDoc.data() as MatchScorecard;

    // 2. Collect all unique player names from this scorecard
    const playerNames = new Set<string>();
    (scorecard.innings || []).forEach(inn => {
      (inn.batting || []).forEach(b => playerNames.add(b.name));
      (inn.bowling || []).forEach(b => playerNames.add(b.name));
      (inn.didNotBat || []).forEach(n => { if (n) playerNames.add(n); });
    });

    const batch = adminDb.batch();

    // 3. For each player — delete or decrement gamesAppeared
    for (const name of playerNames) {
      if (!name) continue;

      const playerSnap = await adminDb.collection('scorecardPlayers')
        .where('organizationId', '==', organizationId)
        .where('name', '==', name)
        .limit(1)
        .get();

      if (playerSnap.empty) continue;

      const playerDoc = playerSnap.docs[0];
      const gamesAppeared = playerDoc.data().gamesAppeared || 1;

      if (gamesAppeared <= 1) {
        // Only on this scorecard — delete
        batch.delete(playerDoc.ref);
      } else {
        // On other scorecards — decrement
        batch.update(playerDoc.ref, {
          gamesAppeared: admin.firestore.FieldValue.increment(-1),
        });
      }
    }

    // 4. Delete the scorecard
    batch.delete(adminDb.collection('matchScorecards').doc(scorecardId));
    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error('[deleteScorecardAction] Error:', error);
    return { success: false, error: error.message || 'Failed to delete scorecard.' };
  }
}

// ─── Upsert ScorecardPlayers ──────────────────────────────────────────────────

async function upsertScorecardPlayers(
  innings: ScorecardInnings[],
  organizationId: string,
  scorecardId: string
): Promise<void> {
  const playerNames = new Set<string>();

  innings.forEach(inn => {
    inn.batting.forEach(b => playerNames.add(b.name));
    inn.bowling.forEach(b => playerNames.add(b.name));
    inn.didNotBat.forEach(name => { if (name) playerNames.add(name); });
  });

  const batch = adminDb.batch();
  const now = new Date().toISOString();

  for (const name of playerNames) {
    if (!name) continue;
    const existing = await adminDb.collection('scorecardPlayers')
      .where('organizationId', '==', organizationId)
      .where('name', '==', name)
      .limit(1)
      .get();

    if (existing.empty) {
      const newRef = adminDb.collection('scorecardPlayers').doc();
      batch.set(newRef, { organizationId, name, firstSeenAt: now, lastSeenAt: now, gamesAppeared: 1 });
    } else {
      batch.update(existing.docs[0].ref, {
        lastSeenAt: now,
        gamesAppeared: admin.firestore.FieldValue.increment(1),
      });
    }
  }

  await batch.commit();
}

// ─── Get Scorecards for Org ───────────────────────────────────────────────────

export async function getScorecardsForOrgAction(
  organizationId: string
): Promise<{ success: boolean; scorecards?: MatchScorecard[]; error?: string }> {
  try {
    const snap = await adminDb.collection('matchScorecards')
      .where('organizationId', '==', organizationId)
      .orderBy('importedAt', 'desc')
      .limit(50)
      .get();

    const scorecards: MatchScorecard[] = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      importedAt: d.data().importedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    })) as MatchScorecard[];

    return { success: true, scorecards };
  } catch (error: any) {
    console.error('[getScorecardsForOrgAction] Error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Get Single Scorecard ─────────────────────────────────────────────────────

export async function getScorecardByIdAction(
  scorecardId: string
): Promise<{ success: boolean; scorecard?: MatchScorecard; error?: string }> {
  try {
    const doc = await adminDb.collection('matchScorecards').doc(scorecardId).get();
    if (!doc.exists) return { success: false, error: 'Scorecard not found.' };

    const scorecard = {
      id: doc.id,
      ...doc.data(),
      importedAt: doc.data()?.importedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    } as MatchScorecard;

    return { success: true, scorecard };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Get ScorecardPlayers for Org ────────────────────────────────────────────

export async function getScorecardPlayersAction(
  organizationId: string
): Promise<ScorecardPlayer[]> {
  try {
    const snap = await adminDb.collection('scorecardPlayers')
      .where('organizationId', '==', organizationId)
      .orderBy('name')
      .get();

    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as ScorecardPlayer[];
  } catch {
    return [];
  }
}

// ─── Link Scorecard to Series ─────────────────────────────────────────────────

export async function linkScorecardToSeriesAction(
  scorecardId: string,
  seriesId: string,
  seriesName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('matchScorecards').doc(scorecardId).update({ seriesId, seriesName });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function unlinkScorecardFromSeriesAction(
  scorecardId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('matchScorecards').doc(scorecardId).update({
      seriesId: admin.firestore.FieldValue.delete(),
      seriesName: admin.firestore.FieldValue.delete(),
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Get Scorecards by Series ─────────────────────────────────────────────────

export async function getScorecardsBySeriesAction(
  seriesId: string,
  organizationId: string
): Promise<{ success: boolean; scorecards?: MatchScorecard[]; error?: string }> {
  try {
    const snap = await adminDb.collection('matchScorecards')
      .where('organizationId', '==', organizationId)
      .where('seriesId', '==', seriesId)
      .orderBy('date', 'asc')
      .get();

    const scorecards: MatchScorecard[] = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      importedAt: d.data().importedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    })) as MatchScorecard[];

    return { success: true, scorecards };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

export async function checkDuplicateScorecardAction(params: {
  organizationId: string;
  team1: string;
  team2: string;
  date: string;
  seriesId?: string;
  linkedGameId?: string;
}): Promise<{ isDuplicate: boolean; message?: string; existingScorecardId?: string }> {
  try {
    const { organizationId, team1, team2, date, seriesId, linkedGameId } = params;

    // 1. Check by linkedGameId first — most reliable
    if (linkedGameId) {
      const gameSnap = await adminDb.collection('matchScorecards')
        .where('organizationId', '==', organizationId)
        .where('linkedGameId', '==', linkedGameId)
        .limit(1)
        .get();

      if (!gameSnap.empty) {
        return {
          isDuplicate: true,
          existingScorecardId: gameSnap.docs[0].id,
          message: `A scorecard already exists for this game.`,
        };
      }
    }

    // 2. Check by org + date + teams
    const snap = await adminDb.collection('matchScorecards')
      .where('organizationId', '==', organizationId)
      .where('date', '==', date)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const teamsMatch =
        (data.team1 === team1 && data.team2 === team2) ||
        (data.team1 === team2 && data.team2 === team1);

      if (teamsMatch) {
        if (seriesId && data.seriesId && data.seriesId === seriesId) {
          return {
            isDuplicate: true,
            existingScorecardId: doc.id,
            message: `A scorecard for ${team1} vs ${team2} on this date already exists in this series.`,
          };
        }
        if (!seriesId || !data.seriesId) {
          return {
            isDuplicate: true,
            existingScorecardId: doc.id,
            message: `A scorecard for ${team1} vs ${team2} on this date already exists.`,
          };
        }
      }
    }

    return { isDuplicate: false };
  } catch (error: any) {
    console.error('[checkDuplicateScorecardAction] Error:', error);
    return { isDuplicate: false };
  }
}

// ─── Get Scorecard for Game ───────────────────────────────────────────────────

export async function getScorecardForGameAction(
  gameId: string,
  organizationId: string
): Promise<{ scorecardId?: string; exists: boolean }> {
  try {
    const snap = await adminDb.collection('matchScorecards')
      .where('organizationId', '==', organizationId)
      .where('linkedGameId', '==', gameId)
      .limit(1)
      .get();

    if (snap.empty) return { exists: false };
    return { exists: true, scorecardId: snap.docs[0].id };
  } catch {
    return { exists: false };
  }
}
