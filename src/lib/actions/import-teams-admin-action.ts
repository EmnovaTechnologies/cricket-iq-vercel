'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import { AGE_CATEGORIES } from '../constants';
import type { AgeCategory } from '../../types';

interface CsvTeamImportRow {
  TeamName: string;
  ClubName?: string;
  AgeCategory?: string;
  TeamManagerEmails?: string;
  [key: string]: string | undefined;
}

interface TeamImportError {
  rowNumber: number;
  csvRow: Record<string, any>;
  error: string;
}

interface TeamImportResult {
  success: boolean;
  message: string;
  successfulImports: number;
  failedImports: number;
  errors: TeamImportError[];
}

export async function importTeamsAdminAction(
  teamsData: CsvTeamImportRow[],
  organizationId: string
): Promise<TeamImportResult> {
  const errors: TeamImportError[] = [];
  let successfulImports = 0;

  if (!organizationId) {
    return {
      success: false,
      message: 'Organization ID is required.',
      successfulImports: 0,
      failedImports: teamsData.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: 'Organization ID missing.' }],
    };
  }

  try {
    // Fetch org clubs for validation
    const orgSnap = await adminDb.collection('organizations').doc(organizationId).get();
    const orgClubs: string[] = orgSnap.exists ? (orgSnap.data()?.clubs || []) : [];
    const clubsLower = new Set(orgClubs.map(c => c.toLowerCase()));

    const teamsToAdd: Array<{
      name: string;
      clubName?: string;
      ageCategory?: AgeCategory;
      organizationId: string;
      teamManagerUids: string[];
    }> = [];

    for (let i = 0; i < teamsData.length; i++) {
      const row = teamsData[i];
      const rowNumber = i + 2;

      try {
        const TeamName = row.TeamName?.trim();
        const ClubName = row.ClubName?.trim();
        const RawAgeCategory = row.AgeCategory?.trim();
        const TeamManagerEmails = row.TeamManagerEmails?.trim();

        // Validate TeamName
        if (!TeamName) {
          errors.push({ rowNumber, csvRow: row, error: 'TeamName is missing.' }); continue;
        }

        // Check uniqueness within org
        const existingSnap = await adminDb.collection('teams')
          .where('name', '==', TeamName)
          .where('organizationId', '==', organizationId)
          .limit(1)
          .get();
        if (!existingSnap.empty) {
          errors.push({ rowNumber, csvRow: row, error: `Team "${TeamName}" already exists in this organization.` }); continue;
        }

        // Validate ClubName if provided
        if (ClubName && !clubsLower.has(ClubName.toLowerCase())) {
          errors.push({ rowNumber, csvRow: row, error: `ClubName "${ClubName}" does not match any club defined for this organization. Valid clubs: ${orgClubs.join(', ')}.` }); continue;
        }

        // Validate AgeCategory if provided
        let ageCategory: AgeCategory | undefined;
        if (RawAgeCategory) {
          if (!AGE_CATEGORIES.includes(RawAgeCategory as AgeCategory)) {
            errors.push({ rowNumber, csvRow: row, error: `Invalid AgeCategory: "${RawAgeCategory}". Must be one of: ${AGE_CATEGORIES.join(', ')}.` }); continue;
          }
          ageCategory = RawAgeCategory as AgeCategory;
        }

        // Resolve manager emails to UIDs
        const teamManagerUids: string[] = [];
        if (TeamManagerEmails) {
          const emails = TeamManagerEmails.split(',').map(e => e.trim()).filter(Boolean);
          for (const email of emails) {
            const userSnap = await adminDb.collection('users')
              .where('email', '==', email)
              .limit(1)
              .get();
            if (!userSnap.empty) {
              teamManagerUids.push(userSnap.docs[0].id);
            } else {
              console.warn(`Row ${rowNumber}: Manager email "${email}" not found. Skipping.`);
            }
          }
        }

        teamsToAdd.push({
          name: TeamName,
          clubName: ClubName || undefined,
          ageCategory,
          organizationId,
          teamManagerUids,
        });

      } catch (rowError: any) {
        errors.push({ rowNumber, csvRow: row, error: `Unexpected error: ${rowError.message || 'Unknown error'}` });
      }
    }

    // Batch write
    if (teamsToAdd.length > 0) {
      const batch = adminDb.batch();

      for (const teamData of teamsToAdd) {
        const teamRef = adminDb.collection('teams').doc();

        const firestoreData: Record<string, any> = {
          name: teamData.name,
          organizationId: teamData.organizationId,
          playerIds: [],
          teamManagerUids: teamData.teamManagerUids,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (teamData.clubName) firestoreData.clubName = teamData.clubName;
        if (teamData.ageCategory) firestoreData.ageCategory = teamData.ageCategory;

        batch.set(teamRef, firestoreData);

        // Update manager user docs
        for (const uid of teamData.teamManagerUids) {
          const userRef = adminDb.collection('users').doc(uid);
          batch.update(userRef, {
            assignedTeamIds: admin.firestore.FieldValue.arrayUnion(teamRef.id),
            assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(teamData.organizationId),
          });
        }
      }

      await batch.commit();
      successfulImports = teamsToAdd.length;
    }

    const failedImportsCount = teamsData.length - successfulImports;
    let finalMessage = '';
    if (successfulImports > 0 && errors.length === 0) finalMessage = `All ${successfulImports} teams imported successfully.`;
    else if (successfulImports > 0 && errors.length > 0) finalMessage = `${successfulImports} teams imported. ${errors.length} failed. See details below.`;
    else if (successfulImports === 0 && errors.length > 0) finalMessage = `Import failed. ${errors.length} teams had errors. See details below.`;
    else finalMessage = 'No teams were imported.';

    return {
      success: errors.length === 0 && successfulImports > 0,
      message: finalMessage,
      successfulImports,
      failedImports: failedImportsCount,
      errors,
    };

  } catch (actionError: any) {
    console.error('FATAL ERROR in importTeamsAdminAction:', actionError);
    return {
      success: false,
      message: `A fatal error occurred: ${actionError.message || 'Unknown error'}. No teams were imported.`,
      successfulImports: 0,
      failedImports: teamsData.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: `Fatal error: ${actionError.message}` }],
    };
  }
}
