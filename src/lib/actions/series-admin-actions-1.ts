'use server';

import { adminDb } from '../firebase-admin';

/**
 * Checks if a single series can be deleted.
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

    // Also check for scorecards linked to this series
    const scorecardsSnap = await adminDb.collection('matchScorecards')
      .where('seriesId', '==', seriesId)
      .limit(1)
      .get();

    if (!scorecardsSnap.empty) {
      const sc = scorecardsSnap.docs[0].data();
      return {
        canDelete: false,
        reason: `Series has imported scorecards (e.g. ${sc.team1} vs ${sc.team2}). Remove scorecards first.`,
      };
    }

    return { canDelete: true };
  } catch (error: any) {
    console.error('[checkSeriesDeletableAction] Error:', error);
    return { canDelete: false, reason: 'Could not verify series deletion eligibility. Please try again.' };
  }
}

/**
 * Bulk check deletability for multiple series in ONE query.
 * Returns a map of seriesId -> canDelete.
 */
export async function checkSeriesBulkDeletableAction(
  seriesIds: string[],
  organizationId: string
): Promise<Record<string, boolean>> {
  if (!seriesIds.length) return {};

  try {
    const seriesWithGames = new Set<string>();
    const seriesIdSet = new Set(seriesIds);

    // Approach 1: query by seriesId in chunks
    for (let i = 0; i < seriesIds.length; i += 30) {
      const chunk = seriesIds.slice(i, i + 30);
      const gamesSnap = await adminDb.collection('games')
        .where('seriesId', 'in', chunk)
        .get();
      gamesSnap.docs.forEach(d => {
        const sid = d.data().seriesId;
        if (sid) seriesWithGames.add(sid);
      });
    }

    // Approach 2: also check by organizationId in case seriesId indexing differs
    if (organizationId) {
      const orgGamesSnap = await adminDb.collection('games')
        .where('organizationId', '==', organizationId)
        .get();
      orgGamesSnap.docs.forEach(d => {
        const sid = d.data().seriesId;
        if (sid && seriesIdSet.has(sid)) seriesWithGames.add(sid);
      });
    }

    // Approach 3: check scorecards linked to these series
    for (let i = 0; i < seriesIds.length; i += 30) {
      const chunk = seriesIds.slice(i, i + 30);
      const scorecardsSnap = await adminDb.collection('matchScorecards')
        .where('seriesId', 'in', chunk)
        .get();
      scorecardsSnap.docs.forEach(d => {
        const sid = d.data().seriesId;
        if (sid) seriesWithGames.add(sid);
      });
    }

    const result: Record<string, boolean> = {};
    seriesIds.forEach(id => { result[id] = !seriesWithGames.has(id); });
    return result;
  } catch (error: any) {
    console.error('[checkSeriesBulkDeletableAction] Error:', error);
    const result: Record<string, boolean> = {};
    seriesIds.forEach(id => { result[id] = false; });
    return result;
  }
}

/**
 * Deletes a series after safety check.
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
