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

interface CertifyMobileRatingsResult {
  success: boolean;
  error?: string;
  autoFinalized?: boolean;
}

export async function saveMobileRatingAction({
  gameId,
  playerId,
  rating,
  savingUid,
}: SaveMobileRatingsParams): Promise<SaveMobileRatingsResult> {
  try {
    const gameSnap = await adminDb.collection('games').doc(gameId).get();
    if (!gameSnap.exists) return { success: false, error: 'Game not found.' };

    const gameData = gameSnap.data()!;
    if (!gameData.organizationId) return { success: false, error: 'Game has no organization.' };
    if (gameData.ratingsFinalized) return { success: false, error: 'Ratings for this game are finalized.' };
    if (gameData.status === 'archived') return { success: false, error: 'Cannot save ratings for an archived game.' };

    const selectorUserIds: string[] = gameData.selectorUserIds || [];
    if (!selectorUserIds.includes(savingUid)) {
      return { success: false, error: 'You are not assigned as a selector for this game.' };
    }

    const organizationId = gameData.organizationId;

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

    if (!existingSnap.empty) {
      await existingSnap.docs[0].ref.set(ratingDoc, { merge: true });
    } else {
      await adminDb.collection('playerRatings').add(ratingDoc);
    }

    const gameUpdates: Record<string, any> = {
      ratingsLastModifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      ratingsLastModifiedBy: savingUid,
    };

    // Reset other selectors' certifications since ratings changed
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

export async function certifyMobileRatingAction(
  gameId: string,
  selectorUid: string,
  selectorDisplayName: string
): Promise<CertifyMobileRatingsResult> {
  try {
    const gameSnap = await adminDb.collection('games').doc(gameId).get();
    if (!gameSnap.exists) return { success: false, error: 'Game not found.' };

    const gameData = gameSnap.data()!;
    if (gameData.ratingsFinalized) return { success: false, error: 'Ratings are already finalized.' };

    const selectorUserIds: string[] = gameData.selectorUserIds || [];
    if (!selectorUserIds.includes(selectorUid)) {
      return { success: false, error: 'You are not assigned as a selector for this game.' };
    }

    // Build ratings snapshot for this selector
    const ratingsSnap = await adminDb.collection('playerRatings')
      .where('gameId', '==', gameId)
      .get();

    const ratingsSnapshot: Record<string, any> = {};
    ratingsSnap.docs.forEach(doc => {
      const d = doc.data();
      ratingsSnapshot[d.playerId] = {
        batting: d.batting,
        bowling: d.bowling,
        fielding: d.fielding,
        wicketKeeping: d.wicketKeeping,
      };
    });

    // Mark this selector as certified
    const certifications = gameData.selectorCertifications || {};
    certifications[selectorUid] = {
      status: 'certified',
      certifiedAt: admin.firestore.Timestamp.now(),
      displayName: selectorDisplayName,
      ratingsSnapshot,
    };

    const gameUpdates: Record<string, any> = {
      selectorCertifications: certifications,
    };

    // Check if all selectors are now certified → auto-finalize
    const allCertified = selectorUserIds.every(uid => certifications[uid]?.status === 'certified');
    let autoFinalized = false;

    if (allCertified && selectorUserIds.length > 0) {
      gameUpdates.ratingsFinalized = true;
      gameUpdates.finalizedAt = admin.firestore.FieldValue.serverTimestamp();
      gameUpdates.finalizedBy = selectorUid;
      autoFinalized = true;
    }

    await adminDb.collection('games').doc(gameId).update(gameUpdates);

    return { success: true, autoFinalized };
  } catch (error: any) {
    console.error('[certifyMobileRatingAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}


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
