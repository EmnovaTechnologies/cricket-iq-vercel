'use server';

import { adminDb } from '../firebase-admin';
import type { UserProfile } from '@/types';

function docToProfile(d: FirebaseFirestore.QueryDocumentSnapshot): UserProfile {
  const data = d.data();
  return {
    uid: d.id,
    email: data.email || null,
    displayName: data.displayName || null,
    roles: data.roles || ['unassigned'],
    activeOrganizationId: data.activeOrganizationId || null,
    assignedOrganizationIds: data.assignedOrganizationIds || [],
    assignedSeriesIds: data.assignedSeriesIds || [],
    assignedTeamIds: data.assignedTeamIds || [],
    assignedGameIds: data.assignedGameIds || [],
    createdAt: null,
    lastLogin: null,
    phoneNumber: data.phoneNumber || null,
    playerId: null,
  };
}

export async function getEligibleOrgAdminsAction(organizationId: string): Promise<UserProfile[]> {
  try {
    const seen = new Set<string>();
    const results: UserProfile[] = [];

    // 1. Super admins (globally, not in assignedOrganizationIds)
    const superAdminSnap = await adminDb.collection('users')
      .where('roles', 'array-contains', 'admin')
      .get();
    superAdminSnap.docs.forEach(d => {
      if (!seen.has(d.id)) { seen.add(d.id); results.push(docToProfile(d)); }
    });

    // 2. All users assigned to this org, then filter for Organization Admin role in memory
    // (avoids compound index requirement for array-contains on two fields)
    const orgUsersSnap = await adminDb.collection('users')
      .where('assignedOrganizationIds', 'array-contains', organizationId)
      .get();
    orgUsersSnap.docs.forEach(d => {
      const roles: string[] = d.data().roles || [];
      if (roles.includes('Organization Admin') && !seen.has(d.id)) {
        seen.add(d.id);
        results.push(docToProfile(d));
      }
    });

    return results.sort((a, b) =>
      (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '')
    );
  } catch (error) {
    console.error('[getEligibleOrgAdminsAction] Error:', error);
    return [];
  }
}
