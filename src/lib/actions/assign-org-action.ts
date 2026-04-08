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

    const roles: string[] = userSnap.data()!.roles || [];
    const isSuperAdmin = roles.includes('admin');

    // Prevent modifying super admins
    if (isSuperAdmin) {
      return { success: false, error: 'Cannot modify organization assignments for super admins.' };
    }

    if (action === 'add') {
      // Enforce one-org limit for non-super-admins
      const existingOrgs: string[] = userSnap.data()!.assignedOrganizationIds || [];
      if (existingOrgs.length > 0 && !existingOrgs.includes(orgId)) {
        const orgSnap = await adminDb.collection('organizations').doc(existingOrgs[0]).get();
        const existingOrgName = orgSnap.exists ? (orgSnap.data()!.name || existingOrgs[0]) : existingOrgs[0];
        return {
          success: false,
          error: `This user is already assigned to "${existingOrgName}". Remove that organization first, or contact a Super Admin.`,
        };
      }
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
