'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type { OrganizationBranding, OrganizationStatus } from '@/types';

interface SaveOrgData {
  name: string;
  status: OrganizationStatus;
  branding: OrganizationBranding;
  organizationAdminUids: string[];
  clubs: string[];
}

export async function updateOrganizationAction(
  orgId: string,
  data: SaveOrgData,
  previousAdminUids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!orgId) return { success: false, error: 'Organization ID is required.' };

  try {
    const orgRef = adminDb.collection('organizations').doc(orgId);

    // Update the organization document
    await orgRef.update({
      name: data.name,
      status: data.status,
      branding: data.branding,
      organizationAdminUids: data.organizationAdminUids,
      clubs: data.clubs,
    });

    // Update newly added admins — assign Organization Admin role and org
    const adminsToAdd = data.organizationAdminUids.filter(uid => !previousAdminUids.includes(uid));
    if (adminsToAdd.length > 0) {
      const batch = adminDb.batch();
      for (const uid of adminsToAdd) {
        const userSnap = await adminDb.collection('users').doc(uid).get();
        if (!userSnap.exists) continue;
        const roles: string[] = userSnap.data()!.roles || [];
        if (roles.includes('admin')) continue; // super admins don't need role assignment
        let newRoles = [...roles];
        if (!newRoles.includes('Organization Admin')) {
          newRoles.push('Organization Admin');
          newRoles = newRoles.filter(r => r !== 'unassigned');
        }
        const userRef = adminDb.collection('users').doc(uid);
        batch.update(userRef, {
          roles: newRoles,
          assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(orgId),
        });
      }
      await batch.commit();
    }

    return { success: true };
  } catch (error: any) {
    console.error('[updateOrganizationAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

export async function createOrganizationAction(
  orgId: string,
  data: SaveOrgData
): Promise<{ success: boolean; error?: string }> {
  if (!orgId) return { success: false, error: 'Organization ID is required.' };

  try {
    const orgRef = adminDb.collection('organizations').doc(orgId);
    await orgRef.set({
      name: data.name,
      status: data.status,
      branding: data.branding,
      organizationAdminUids: data.organizationAdminUids,
      clubs: data.clubs,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Assign Organization Admin role to new admins
    if (data.organizationAdminUids.length > 0) {
      const batch = adminDb.batch();
      for (const uid of data.organizationAdminUids) {
        const userSnap = await adminDb.collection('users').doc(uid).get();
        if (!userSnap.exists) continue;
        const roles: string[] = userSnap.data()!.roles || [];
        if (roles.includes('admin')) continue;
        let newRoles = [...roles];
        if (!newRoles.includes('Organization Admin')) {
          newRoles.push('Organization Admin');
          newRoles = newRoles.filter(r => r !== 'unassigned');
        }
        batch.update(adminDb.collection('users').doc(uid), {
          roles: newRoles,
          assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(orgId),
        });
      }
      await batch.commit();
    }

    return { success: true };
  } catch (error: any) {
    console.error('[createOrganizationAction] Error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}
