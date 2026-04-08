'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';

export async function assignOrgToUserAction(
  targetUid: string,
  orgId: string,
  action: 'add' | 'remove'
): Promise<{ success: boolean; error?: string }> {
  if (!targetUid || !orgId) {
    return { success: false, error: 'Missing user ID or organization ID.' };
  }

  try {
    const userRef = adminDb.collection('users').doc(targetUid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return { success: false, error: 'User not found.' };
    }

    // Prevent modifying super admins
    const roles: string[] = userSnap.data()!.roles || [];
    if (roles.includes('admin')) {
      return { success: false, error: 'Cannot modify organization assignments for super admins.' };
    }

    if (action === 'add') {
      await userRef.update({
        assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(orgId),
      });
    } else {
      await userRef.update({
        assignedOrganizationIds: admin.firestore.FieldValue.arrayRemove(orgId),
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('[assignOrgToUserAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
