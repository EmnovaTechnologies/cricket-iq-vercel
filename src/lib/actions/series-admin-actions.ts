'use server';

import { adminDb } from '../firebase-admin';

/**
 * Checks if a series can be deleted.
 * A series can only be deleted if it has no games.
 */
export async function checkSeriesDeletableAction(
  seriesId: string
): Promise<{ canDelete: boolean; reason?: string }> {
  try {
    const gamesSnap = await adminDb.collection('games')
      .where('seriesId', '==', seriesId)
      .limit(1)
      .get();

    if (!gamesSnap.empty) {
      const game = gamesSnap.docs[0].data();
      return {
        canDelete: false,
        reason: `Series has games (e.g. ${game.team1} vs ${game.team2}). Delete all games first.`,
      };
    }

    return { canDelete: true };
  } catch (error: any) {
    console.error('[checkSeriesDeletableAction] Error:', error);
    return { canDelete: false, reason: 'Could not verify series deletion eligibility. Please try again.' };
  }
}

/**
 * Deletes a series after safety check.
 * Only deletes the series doc — no cascade.
 */
export async function deleteSeriesAdminAction(
  seriesId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const check = await checkSeriesDeletableAction(seriesId);
    if (!check.canDelete) {
      return { success: false, error: check.reason };
    }

    await adminDb.collection('series').doc(seriesId).delete();
    return { success: true };
  } catch (error: any) {
    console.error('[deleteSeriesAdminAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
