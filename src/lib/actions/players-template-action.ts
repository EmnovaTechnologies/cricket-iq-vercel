'use server';

import { adminDb } from '../firebase-admin';

export interface PlayerTemplateData {
  clubs: string[];
  teams: string[];
}

export async function getPlayersTemplateData(organizationId: string): Promise<PlayerTemplateData> {
  if (!organizationId) throw new Error('Organization ID is required.');

  // Fetch org to get club list
  const orgSnap = await adminDb.collection('organizations').doc(organizationId).get();
  const clubs: string[] = orgSnap.exists ? (orgSnap.data()?.clubs || []) : [];

  // Fetch teams for org
  const teamsSnap = await adminDb.collection('teams')
    .where('organizationId', '==', organizationId)
    .get();
  const teams = teamsSnap.docs
    .map(d => (d.data().name || '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return { clubs: clubs.sort(), teams };
}
