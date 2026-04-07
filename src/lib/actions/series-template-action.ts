'use server';

import { adminDb } from '../firebase-admin';

export interface SeriesTemplateData {
  selectorEmails: string[];
}

export async function getSeriesTemplateData(organizationId: string): Promise<SeriesTemplateData> {
  if (!organizationId) throw new Error('Organization ID is required.');

  // Fetch users assigned to this org who have selector or Series Admin role
  const usersSnap = await adminDb.collection('users')
    .where('assignedOrganizationIds', 'array-contains', organizationId)
    .get();

  const selectorEmails: string[] = [];
  usersSnap.docs.forEach(d => {
    const data = d.data();
    const roles: string[] = data.roles || [];
    if (
      roles.includes('selector') ||
      roles.includes('Series Admin') ||
      roles.includes('Organization Admin') ||
      roles.includes('admin')
    ) {
      const email = data.email?.trim();
      if (email) selectorEmails.push(email);
    }
  });

  return {
    selectorEmails: selectorEmails.sort(),
  };
}
