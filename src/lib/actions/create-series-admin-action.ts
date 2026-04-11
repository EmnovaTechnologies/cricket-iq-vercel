'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type { Series, FitnessTestType, AgeCategory } from '@/types';

interface CreateSeriesParams {
  name: string;
  ageCategory: string;
  year: number;
  organizationId: string;
  seriesAdminUids?: string[];
  maleCutoffDate?: string | null;
  femaleCutoffDate?: string | null;
  fitnessTestType?: FitnessTestType;
  fitnessTestPassingScore?: string;
}

export async function createSeriesAdminAction(
  seriesData: CreateSeriesParams
): Promise<{ success: boolean; seriesId?: string; series?: Series; error?: string }> {
  if (!seriesData.organizationId) {
    return { success: false, error: 'Organization ID is required.' };
  }

  try {
    const firestoreData: Record<string, any> = {
      name: seriesData.name.trim(),
      ageCategory: seriesData.ageCategory,
      year: seriesData.year,
      organizationId: seriesData.organizationId,
      seriesAdminUids: seriesData.seriesAdminUids || [],
      maleCutoffDate: seriesData.maleCutoffDate || null,
      femaleCutoffDate: seriesData.femaleCutoffDate || null,
      participatingTeams: [],
      venueIds: [],
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (seriesData.fitnessTestType) {
      firestoreData.fitnessTestType = seriesData.fitnessTestType;
    }
    if (seriesData.fitnessTestPassingScore?.trim()) {
      firestoreData.fitnessTestPassingScore = seriesData.fitnessTestPassingScore.trim();
    }

    const seriesRef = await adminDb.collection('series').add(firestoreData);

    // Update seriesAdminUids on user docs
    if (seriesData.seriesAdminUids && seriesData.seriesAdminUids.length > 0) {
      const batch = adminDb.batch();
      for (const uid of seriesData.seriesAdminUids) {
        batch.update(adminDb.collection('users').doc(uid), {
          assignedSeriesIds: admin.firestore.FieldValue.arrayUnion(seriesRef.id),
          assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(seriesData.organizationId),
        });
      }
      await batch.commit();
    }

    // Build and return series object directly — no client SDK read needed
    const series: Series = {
      id: seriesRef.id,
      name: seriesData.name.trim(),
      ageCategory: seriesData.ageCategory as AgeCategory,
      year: seriesData.year,
      organizationId: seriesData.organizationId,
      seriesAdminUids: seriesData.seriesAdminUids || [],
      maleCutoffDate: seriesData.maleCutoffDate || null,
      femaleCutoffDate: seriesData.femaleCutoffDate || null,
      participatingTeams: [],
      venueIds: [],
      status: 'active',
      createdAt: new Date().toISOString(),
      fitnessTestType: seriesData.fitnessTestType,
      fitnessTestPassingScore: seriesData.fitnessTestPassingScore?.trim() || undefined,
    };

    return { success: true, seriesId: seriesRef.id, series };
  } catch (error: any) {
    console.error('[createSeriesAdminAction] Error:', error);
    return { success: false, error: error.message || 'Failed to create series.' };
  }
}
