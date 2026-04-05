'use server';

import { adminDb } from '../firebase-admin';

interface PublicOrgDetails {
  id: string;
  name: string;
  status: string;
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
    };
  } catch (error) {
    console.error('[getPublicOrganizationDetails] Error:', error);
    return null;
  }
}
