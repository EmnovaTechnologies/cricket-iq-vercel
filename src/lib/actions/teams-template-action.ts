'use server';

import { adminDb } from '../firebase-admin';

export interface TeamTemplateData {
  clubs: string[];
  managerEmails: string[];
}

export async function getTeamsTemplateData(organizationId: string): Promise<TeamTemplateData> {
  if (!organizationId) throw new Error('Organization ID is required.');

  // Fetch org clubs
  const orgSnap = await adminDb.collection('organizations').doc(organizationId).get();
  const clubs: string[] = orgSnap.exists ? (orgSnap.data()?.clubs || []).sort() : [];

  const emailSet = new Set<string>();

  // 1. Fetch super admins globally
  const superAdminSnap = await adminDb.collection('users')
    .where('roles', 'array-contains', 'admin')
    .get();
  superAdminSnap.docs.forEach(d => {
    const email = d.data().email?.trim();
    if (email) emailSet.add(email);
  });

  // 2. Fetch Team Managers and Series Admins scoped to this org
  const orgUsersSnap = await adminDb.collection('users')
    .where('assignedOrganizationIds', 'array-contains', organizationId)
    .get();
  orgUsersSnap.docs.forEach(d => {
    const data = d.data();
    const roles: string[] = data.roles || [];
    if (roles.includes('Team Manager') || roles.includes('Series Admin')) {
      const email = data.email?.trim();
      if (email) emailSet.add(email);
    }
  });

  return { clubs, managerEmails: Array.from(emailSet).sort() };
}
