'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';

/**
 * Checks if a team can be deleted.
 * Rules:
 * 1. No games associated (checked via series participatingTeams → games in those series)
 * 2. No players on the team roster
 */
export async function checkTeamDeletableAction(
  teamId: string,
  playerIds: string[]
): Promise<{ canDelete: boolean; reason?: string }> {
  try {
    // Rule 2: No players on roster
    if (playerIds && playerIds.length > 0) {
      return {
        canDelete: false,
        reason: `Team has ${playerIds.length} player(s) on its roster. Remove all players before deleting.`,
      };
    }

    // Rule 1: No games — find all series containing this team, then check for games
    const seriesSnap = await adminDb.collection('series')
      .where('participatingTeams', 'array-contains', teamId)
      .get();

    if (!seriesSnap.empty) {
      const seriesIds = seriesSnap.docs.map(d => d.id);

      // Check games in those series (Firestore 'in' supports up to 30)
      for (let i = 0; i < seriesIds.length; i += 30) {
        const chunk = seriesIds.slice(i, i + 30);
        const gamesSnap = await adminDb.collection('games')
          .where('seriesId', 'in', chunk)
          .limit(1)
          .get();

        if (!gamesSnap.empty) {
          const game = gamesSnap.docs[0].data();
          return {
            canDelete: false,
            reason: `Team is associated with games in series "${seriesSnap.docs.find(d => d.id === game.seriesId)?.data().name || 'a series'}". Cannot delete teams with associated games.`,
          };
        }
      }
    }

    return { canDelete: true };
  } catch (error: any) {
    console.error('[checkTeamDeletableAction] Error:', error);
    return { canDelete: false, reason: 'Could not verify team deletion eligibility. Please try again.' };
  }
}

/**
 * Deletes a team after all safety checks pass.
 * Also cleans up: removes team from any series participatingTeams arrays.
 */
export async function deleteTeamAdminAction(
  teamId: string,
  playerIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // Run checks
    const check = await checkTeamDeletableAction(teamId, playerIds);
    if (!check.canDelete) {
      return { success: false, error: check.reason };
    }

    // Remove team from any series participatingTeams
    const seriesSnap = await adminDb.collection('series')
      .where('participatingTeams', 'array-contains', teamId)
      .get();

    if (!seriesSnap.empty) {
      const batch = adminDb.batch();
      seriesSnap.docs.forEach(d => {
        const current: string[] = d.data().participatingTeams || [];
        batch.update(d.ref, {
          participatingTeams: current.filter(id => id !== teamId),
        });
      });
      await batch.commit();
    }

    // Delete the team document
    await adminDb.collection('teams').doc(teamId).delete();

    return { success: true };
  } catch (error: any) {
    console.error('[deleteTeamAdminAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
