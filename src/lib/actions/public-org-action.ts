'use server';

import { adminDb } from '../firebase-admin';

interface PublicOrgDetails {
  id: string;
  name: string;
  status: string;
  branding?: {
    logoUrl?: string;
    bannerUrl?: string;
    themeName?: string;
  };
  clubs?: string[];
}

interface PublicTeam {
  id: string;
  name: string;
  ageCategory: string;
  organizationId: string;
  playerIds: string[];
  clubName?: string;
  teamManagerUids?: string[];
}

export async function getPublicOrganizationDetails(orgId: string): Promise<PublicOrgDetails | null> {
  if (!orgId) return null;
  try {
    const snap = await adminDb.collection('organizations').doc(orgId).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    return {
      id: snap.id,
      name: data.name?.trim() || '',
      status: data.status || 'active',
      branding: data.branding || {},
      clubs: data.clubs || [],
    };
  } catch (error) {
    console.error('[getPublicOrganizationDetails] Error:', error);
    return null;
  }
}

export async function getAllPublicActiveOrganizations(): Promise<PublicOrgDetails[]> {
  try {
    const snap = await adminDb.collection('organizations')
      .where('status', '==', 'active')
      .orderBy('name')
      .get();
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name?.trim() || '',
        status: data.status || 'active',
        branding: data.branding || {},
        clubs: data.clubs || [],
      };
    });
  } catch (error) {
    console.error('[getAllPublicActiveOrganizations] Error:', error);
    return [];
  }
}

export async function getPublicOrgTeams(orgId: string): Promise<PublicTeam[]> {
  if (!orgId) return [];
  try {
    const snap = await adminDb.collection('teams')
      .where('organizationId', '==', orgId)
      .orderBy('name')
      .get();
    return snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name?.trim() || '',
        ageCategory: data.ageCategory || '',
        organizationId: data.organizationId || orgId,
        playerIds: data.playerIds || [],
        clubName: data.clubName || '',
        teamManagerUids: data.teamManagerUids || [],
      };
    });
  } catch (error) {
    console.error('[getPublicOrgTeams] Error:', error);
    return [];
  }
}
