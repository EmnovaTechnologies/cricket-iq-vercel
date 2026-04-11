'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';

export async function assignSeriesAdminsAction(
  seriesId: string,
  organizationId: string,
  adminUids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!seriesId || !organizationId || !adminUids.length) return { success: true };

  try {
    const batch = adminDb.batch();
    for (const uid of adminUids) {
      const userRef = adminDb.collection('users').doc(uid);
      batch.update(userRef, {
        assignedSeriesIds: admin.firestore.FieldValue.arrayUnion(seriesId),
        assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(organizationId),
      });
    }
    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error('[assignSeriesAdminsAction] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function removeSeriesAdminsAction(
  seriesId: string,
  adminUids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!seriesId || !adminUids.length) return { success: true };

  try {
    const batch = adminDb.batch();
    for (const uid of adminUids) {
      const userRef = adminDb.collection('users').doc(uid);
      batch.update(userRef, {
        assignedSeriesIds: admin.firestore.FieldValue.arrayRemove(seriesId),
      });
    }
    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error('[removeSeriesAdminsAction] Error:', error);
    return { success: false, error: error.message };
  }
}
