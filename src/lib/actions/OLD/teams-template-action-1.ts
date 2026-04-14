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

  // Fetch users with eligible roles assigned to this org
  const usersSnap = await adminDb.collection('users')
    .where('assignedOrganizationIds', 'array-contains', organizationId)
    .get();

  const managerEmails: string[] = [];
  const eligibleRoles = ['Team Manager', 'selector', 'Series Admin', 'Organization Admin', 'admin'];
  usersSnap.docs.forEach(d => {
    const data = d.data();
    const roles: string[] = data.roles || [];
    if (roles.some(r => eligibleRoles.includes(r))) {
      const email = data.email?.trim();
      if (email) managerEmails.push(email);
    }
  });

  return { clubs, managerEmails: managerEmails.sort() };
}
