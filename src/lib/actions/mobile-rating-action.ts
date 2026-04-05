'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';

interface MobileRatingEntry {
  batting: string;
  bowling: string;
  fielding: string;
  wicketKeeping: string;
  battingComment?: string;
  bowlingComment?: string;
  fieldingComment?: string;
  wicketKeepingComment?: string;
}

interface SaveMobileRatingsParams {
  gameId: string;
  playerId: string;
  rating: MobileRatingEntry;
  savingUid: string;
}

interface SaveMobileRatingsResult {
  success: boolean;
  error?: string;
}

export async function saveMobileRatingAction({
  gameId,
  playerId,
  rating,
  savingUid,
}: SaveMobileRatingsParams): Promise<SaveMobileRatingsResult> {
  try {
    // Fetch game to get organizationId and validate
    const gameSnap = await adminDb.collection('games').doc(gameId).get();
    if (!gameSnap.exists) return { success: false, error: 'Game not found.' };

    const gameData = gameSnap.data()!;
    if (!gameData.organizationId) return { success: false, error: 'Game has no organization.' };
    if (gameData.ratingsFinalized) return { success: false, error: 'Ratings for this game are finalized.' };
    if (gameData.status === 'archived') return { success: false, error: 'Cannot save ratings for an archived game.' };

    // Validate savingUid is an assigned selector
    const selectorUserIds: string[] = gameData.selectorUserIds || [];
    if (!selectorUserIds.includes(savingUid)) {
      return { success: false, error: 'You are not assigned as a selector for this game.' };
    }

    const organizationId = gameData.organizationId;

    // Check for existing rating doc
    const existingSnap = await adminDb.collection('playerRatings')
      .where('gameId', '==', gameId)
      .where('playerId', '==', playerId)
      .limit(1)
      .get();

    const ratingDoc: Record<string, any> = {
      gameId,
      playerId,
      organizationId,
      batting: rating.batting,
      bowling: rating.bowling,
      fielding: rating.fielding,
      wicketKeeping: rating.wicketKeeping,
    };

    // Handle comments — merge with existing comments from other selectors
    const commentFields = ['batting', 'bowling', 'fielding', 'wicketKeeping'] as const;
    for (const skill of commentFields) {
      const commentKey = `${skill}Comments`;
      const commentValue = rating[`${skill}Comment` as keyof MobileRatingEntry] || '';
      let existingComments: Record<string, string> = {};

      if (!existingSnap.empty) {
        existingComments = existingSnap.docs[0].data()[commentKey] || {};
      }

      if (commentValue.trim()) {
        existingComments[savingUid] = commentValue.trim();
      } else {
        delete existingComments[savingUid];
      }
      ratingDoc[commentKey] = existingComments;
    }

    // Save or update rating
    if (!existingSnap.empty) {
      await existingSnap.docs[0].ref.set(ratingDoc, { merge: true });
    } else {
      await adminDb.collection('playerRatings').add(ratingDoc);
    }

    // Update game timestamp and reset other selectors' certifications
    const gameUpdates: Record<string, any> = {
      ratingsLastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      ratingsLastModifiedBy: savingUid,
    };

    const certifications = gameData.selectorCertifications || {};
    let changed = false;
    for (const selectorId of selectorUserIds) {
      if (selectorId !== savingUid) {
        const cert = certifications[selectorId];
        if (cert?.status === 'certified') {
          certifications[selectorId] = { ...cert, status: 'pending' };
          changed = true;
        }
      }
    }
    if (changed) gameUpdates.selectorCertifications = certifications;

    await adminDb.collection('games').doc(gameId).update(gameUpdates);

    return { success: true };
  } catch (error: any) {
    console.error('[saveMobileRatingAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
