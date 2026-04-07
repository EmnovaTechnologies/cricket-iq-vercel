'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import { isValid, parse, format } from 'date-fns';
import { AGE_CATEGORIES } from '../constants';
import type { AgeCategory, CsvSeriesImportRow } from '../../types';

interface SeriesImportError {
  rowNumber: number;
  csvRow: Record<string, any>;
  error: string;
}

interface SeriesImportResult {
  success: boolean;
  message: string;
  successfulImports: number;
  failedImports: number;
  errors: SeriesImportError[];
}

export async function importSeriesAdminAction(
  seriesDataRows: CsvSeriesImportRow[],
  organizationId: string
): Promise<SeriesImportResult> {
  const errors: SeriesImportError[] = [];
  let successfulImports = 0;

  if (!organizationId) {
    return {
      success: false,
      message: 'Organization ID is required.',
      successfulImports: 0,
      failedImports: seriesDataRows.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: 'Organization ID missing.' }],
    };
  }

  try {
    const seriesToAdd: Array<{
      name: string;
      ageCategory: AgeCategory;
      year: number;
      organizationId: string;
      maleCutoffDate: string;
      femaleCutoffDate: string;
      seriesAdminUids: string[];
    }> = [];

    for (let i = 0; i < seriesDataRows.length; i++) {
      const row = seriesDataRows[i];
      const rowNumber = i + 2;

      try {
        const SeriesName = row.SeriesName?.trim();
        const RawAgeCategory = row.AgeCategory?.trim();
        const RawYear = row.Year?.trim();
        const MaleCutoffDate = row.MaleCutoffDate?.trim();
        const FemaleCutoffDate = row.FemaleCutoffDate?.trim();
        const SeriesAdminEmails = row.SeriesAdminEmails?.trim();

        if (!SeriesName) { errors.push({ rowNumber, csvRow: row, error: 'SeriesName is missing.' }); continue; }

        // Check for existing series with same name in org
        const existingSnap = await adminDb.collection('series')
          .where('name', '==', SeriesName)
          .where('organizationId', '==', organizationId)
          .limit(1)
          .get();
        if (!existingSnap.empty) { errors.push({ rowNumber, csvRow: row, error: `Series "${SeriesName}" already exists in this organization.` }); continue; }

        if (!RawAgeCategory) { errors.push({ rowNumber, csvRow: row, error: 'AgeCategory is missing.' }); continue; }
        if (!AGE_CATEGORIES.includes(RawAgeCategory as AgeCategory)) {
          errors.push({ rowNumber, csvRow: row, error: `Invalid AgeCategory: "${RawAgeCategory}". Must be one of: ${AGE_CATEGORIES.join(', ')}.` }); continue;
        }
        const ageCategory = RawAgeCategory as AgeCategory;

        if (!RawYear) { errors.push({ rowNumber, csvRow: row, error: 'Year is missing.' }); continue; }
        const year = parseInt(RawYear, 10);
        if (isNaN(year) || year < 2000 || year > 2100) {
          errors.push({ rowNumber, csvRow: row, error: `Invalid Year: "${RawYear}". Must be between 2000 and 2100.` }); continue;
        }

        if (!MaleCutoffDate) { errors.push({ rowNumber, csvRow: row, error: 'MaleCutoffDate is missing.' }); continue; }
        const parsedMale = parse(MaleCutoffDate, 'MM/dd/yyyy', new Date());
        if (!isValid(parsedMale)) {
          errors.push({ rowNumber, csvRow: row, error: `Invalid MaleCutoffDate: "${MaleCutoffDate}". Use MM/DD/YYYY with 4-digit year.` }); continue;
        }

        if (!FemaleCutoffDate) { errors.push({ rowNumber, csvRow: row, error: 'FemaleCutoffDate is missing.' }); continue; }
        const parsedFemale = parse(FemaleCutoffDate, 'MM/dd/yyyy', new Date());
        if (!isValid(parsedFemale)) {
          errors.push({ rowNumber, csvRow: row, error: `Invalid FemaleCutoffDate: "${FemaleCutoffDate}". Use MM/DD/YYYY with 4-digit year.` }); continue;
        }

        // Resolve admin emails to UIDs
        const seriesAdminUids: string[] = [];
        if (SeriesAdminEmails) {
          const emails = SeriesAdminEmails.split(',').map(e => e.trim()).filter(Boolean);
          for (const email of emails) {
            const userSnap = await adminDb.collection('users')
              .where('email', '==', email)
              .limit(1)
              .get();
            if (!userSnap.empty) {
              seriesAdminUids.push(userSnap.docs[0].id);
            } else {
              console.warn(`Row ${rowNumber}: Admin email "${email}" not found. Skipping.`);
            }
          }
        }

        seriesToAdd.push({
          name: SeriesName,
          ageCategory,
          year,
          organizationId,
          maleCutoffDate: format(parsedMale, 'yyyy-MM-dd'),
          femaleCutoffDate: format(parsedFemale, 'yyyy-MM-dd'),
          seriesAdminUids,
        });

      } catch (rowError: any) {
        errors.push({ rowNumber, csvRow: row, error: `Unexpected error: ${rowError.message || 'Unknown error'}` });
      }
    }

    // Batch write using Admin SDK
    if (seriesToAdd.length > 0) {
      const batch = adminDb.batch();

      for (const seriesData of seriesToAdd) {
        const seriesRef = adminDb.collection('series').doc();
        batch.set(seriesRef, {
          name: seriesData.name,
          ageCategory: seriesData.ageCategory,
          year: seriesData.year,
          organizationId: seriesData.organizationId,
          maleCutoffDate: seriesData.maleCutoffDate,
          femaleCutoffDate: seriesData.femaleCutoffDate,
          seriesAdminUids: seriesData.seriesAdminUids,
          participatingTeams: [],
          venueIds: [],
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update series admin user docs
        for (const uid of seriesData.seriesAdminUids) {
          const userRef = adminDb.collection('users').doc(uid);
          batch.update(userRef, {
            assignedSeriesIds: admin.firestore.FieldValue.arrayUnion(seriesRef.id),
            assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(seriesData.organizationId),
          });
        }
      }

      await batch.commit();
      successfulImports = seriesToAdd.length;
    }

    const failedImportsCount = seriesDataRows.length - successfulImports;
    let finalMessage = '';
    if (successfulImports > 0 && errors.length === 0) finalMessage = `All ${successfulImports} series imported successfully.`;
    else if (successfulImports > 0 && errors.length > 0) finalMessage = `${successfulImports} series imported. ${errors.length} failed. See details below.`;
    else if (successfulImports === 0 && errors.length > 0) finalMessage = `Import failed. ${errors.length} series had errors. See details below.`;
    else finalMessage = 'No series were imported.';

    return {
      success: errors.length === 0 && successfulImports > 0,
      message: finalMessage,
      successfulImports,
      failedImports: failedImportsCount,
      errors,
    };

  } catch (actionError: any) {
    console.error('FATAL ERROR in importSeriesAdminAction:', actionError);
    return {
      success: false,
      message: `A fatal error occurred: ${actionError.message || 'Unknown error'}. No series were imported.`,
      successfulImports: 0,
      failedImports: seriesDataRows.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: `Fatal error: ${actionError.message}` }],
    };
  }
}
