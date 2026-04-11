'use server';

import { adminDb } from '../firebase-admin';

/**
 * Checks if a venue can be deleted.
 * A venue can be deleted if no game associated with it has any player ratings.
 * Returns { canDelete: true } or { canDelete: false, reason: string }
 */
export async function checkVenueDeletableAction(
  venueId: string,
  venueName: string,
  organizationId: string
): Promise<{ canDelete: boolean; reason?: string }> {
  try {
    // Find all games at this venue for this org (match by name as games store venue name)
    const gamesSnap = await adminDb.collection('games')
      .where('organizationId', '==', organizationId)
      .get();

    const gamesAtVenue = gamesSnap.docs.filter(d => {
      const name: string = d.data().venue || '';
      return name.trim().toLowerCase() === venueName.trim().toLowerCase();
    });

    if (gamesAtVenue.length === 0) return { canDelete: true };

    // Check if any of those games have player ratings
    for (const gameDoc of gamesAtVenue) {
      const ratingsSnap = await adminDb.collection('playerRatings')
        .where('gameId', '==', gameDoc.id)
        .limit(1)
        .get();

      if (!ratingsSnap.empty) {
        const game = gameDoc.data();
        return {
          canDelete: false,
          reason: `Venue has player ratings recorded for game: ${game.team1} vs ${game.team2}. Venues with rated games cannot be deleted.`,
        };
      }
    }

    return { canDelete: true };
  } catch (error: any) {
    console.error('[checkVenueDeletableAction] Error:', error);
    return { canDelete: false, reason: 'Could not verify venue deletion eligibility. Please try again.' };
  }
}

/**
 * Deletes a venue after all safety checks pass.
 * Checks: no series association, no games with player ratings.
 */
export async function deleteVenueAdminAction(
  venueId: string,
  venueName: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Only check: no games with player ratings
    const deletable = await checkVenueDeletableAction(venueId, venueName, organizationId);
    if (!deletable.canDelete) {
      return { success: false, error: deletable.reason };
    }

    // Remove venue from any series venueIds arrays before deleting
    const seriesSnap = await adminDb.collection('series')
      .where('venueIds', 'array-contains', venueId)
      .get();

    if (!seriesSnap.empty) {
      const batch = adminDb.batch();
      seriesSnap.docs.forEach(d => {
        const currentVenueIds: string[] = d.data().venueIds || [];
        batch.update(d.ref, {
          venueIds: currentVenueIds.filter(id => id !== venueId),
        });
      });
      await batch.commit();
    }

    // Delete the venue
    await adminDb.collection('venues').doc(venueId).delete();

    return { success: true };
  } catch (error: any) {
    console.error('[deleteVenueAdminAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
