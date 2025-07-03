'use client';

import type { Organization, OrganizationStatus, OrganizationBranding, UserProfile } from '../../types';
import {
  getOrganizationsByIdsFromDB,
} from '../db';

// Note: Create and Update actions were moved to the client-side component (OrganizationForm)
// to resolve authentication context issues with server actions using the client Firebase SDK.
// This file remains for read actions or future server-side logic that uses the Admin SDK.

export async function getOrganizationsByIdsAction(orgIds: string[]): Promise<Organization[]> {
  if (!orgIds || orgIds.length === 0) return [];
  try {
    return await getOrganizationsByIdsFromDB(orgIds);
  } catch (error) {
    console.error("Error in getOrganizationsByIdsAction:", error);
    return [];
  }
}

export async function getOrganizationByIdAction(id: string): Promise<Organization | undefined> {
  // This function is now a simple wrapper around the db function
  // It's kept for consistency in case server-side logic (e.g., using Admin SDK)
  // is added here in the future.
  try {
    const { getOrganizationByIdFromDB } = await import('../db');
    return await getOrganizationByIdFromDB(id);
  } catch (error) {
    console.error(`Error in getOrganizationByIdAction for id ${id}:`, error);
    return undefined;
  }
}
