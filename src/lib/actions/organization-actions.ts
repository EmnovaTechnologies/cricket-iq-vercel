'use client';

import type { Organization, OrganizationStatus, OrganizationBranding, UserProfile } from '../../types';
import {
  getOrganizationsByIdsFromDB,
} from '../db';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

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

export async function updateOrgSelectionSettingsAction(
  orgId: string,
  settings: {
    selectionModel?: 'rating' | 'performance' | 'hybrid';
    ratingScope?: 'opposing_only' | 'own_team' | 'both_teams';
    ratingVisibility?: 'admin_only' | 'selectors_own' | 'all_selectors';
    ratingAggregation?: 'average' | 'latest';
    selectorReportScope?: 'opposing_only' | 'both_teams' | 'own_team_only';
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(settings)) {
      if (v !== undefined) updates[k] = v;
    }
    await updateDoc(doc(db, 'organizations', orgId), updates);
    return { success: true };
  } catch (error: any) {
    console.error('[updateOrgSelectionSettingsAction]', error);
    return { success: false, error: error.message };
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
