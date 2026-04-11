'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type { Team, AgeCategory } from '@/types';

interface CreateTeamParams {
  name: string;
  clubName: string;
  ageCategory: AgeCategory;
  organizationId: string;
  teamManagerUids?: string[];
}

export async function createTeamAdminAction(
  teamData: CreateTeamParams
): Promise<{ success: boolean; team?: Team; error?: string }> {
  if (!teamData.organizationId) {
    return { success: false, error: 'Organization ID is required.' };
  }

  try {
    const firestoreData: Record<string, any> = {
      name: teamData.name.trim(),
      clubName: teamData.clubName.trim(),
      ageCategory: teamData.ageCategory,
      organizationId: teamData.organizationId,
      teamManagerUids: teamData.teamManagerUids || [],
      playerIds: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const teamRef = await adminDb.collection('teams').add(firestoreData);

    // Update team manager user docs
    if (teamData.teamManagerUids && teamData.teamManagerUids.length > 0) {
      const batch = adminDb.batch();
      for (const uid of teamData.teamManagerUids) {
        batch.update(adminDb.collection('users').doc(uid), {
          assignedTeamIds: admin.firestore.FieldValue.arrayUnion(teamRef.id),
          assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(teamData.organizationId),
        });
      }
      await batch.commit();
    }

    const team: Team = {
      id: teamRef.id,
      name: teamData.name.trim(),
      clubName: teamData.clubName.trim(),
      ageCategory: teamData.ageCategory,
      organizationId: teamData.organizationId,
      teamManagerUids: teamData.teamManagerUids || [],
      playerIds: [],
    };

    return { success: true, team };
  } catch (error: any) {
    console.error('[createTeamAdminAction] Error:', error);
    return { success: false, error: error.message || 'Failed to create team.' };
  }
}
