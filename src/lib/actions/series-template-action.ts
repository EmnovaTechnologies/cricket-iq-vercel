'use server';

import { adminDb } from '../firebase-admin';

export interface SeriesTemplateData {
  selectorEmails: string[];
}

export async function getSeriesTemplateData(organizationId: string): Promise<SeriesTemplateData> {
  if (!organizationId) throw new Error('Organization ID is required.');

  const emailSet = new Set<string>();

  // 1. Fetch super admins globally (they are not in assignedOrganizationIds)
  const superAdminSnap = await adminDb.collection('users')
    .where('roles', 'array-contains', 'admin')
    .get();
  superAdminSnap.docs.forEach(d => {
    const email = d.data().email?.trim();
    if (email) emailSet.add(email);
  });

  // 2. Fetch Series Admins scoped to this org
  const orgUsersSnap = await adminDb.collection('users')
    .where('assignedOrganizationIds', 'array-contains', organizationId)
    .get();
  orgUsersSnap.docs.forEach(d => {
    const data = d.data();
    const roles: string[] = data.roles || [];
    if (roles.includes('Series Admin')) {
      const email = data.email?.trim();
      if (email) emailSet.add(email);
    }
  });

  return {
    selectorEmails: Array.from(emailSet).sort(),
  };
}
