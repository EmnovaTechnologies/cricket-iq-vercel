'use server';

/**
 * FILE: src/lib/actions/update-user-club-action.ts
 *
 * Server action to update a user's club association.
 * Uses Admin SDK to bypass Firestore security rules —
 * required because org admins don't have direct write
 * access to the users collection.
 */

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';

export async function updateUserClubAdminAction(
  uid: string,
  clubName: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!uid) return { success: false, error: 'Missing user ID.' };

  try {
    const userRef = adminDb.collection('users').doc(uid);

    if (clubName && clubName.trim() !== '') {
      await userRef.update({ clubName: clubName.trim() });
    } else {
      await userRef.update({ clubName: admin.firestore.FieldValue.delete() });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[updateUserClubAdminAction] Error:', error);
    return { success: false, error: error.message };
  }
}
