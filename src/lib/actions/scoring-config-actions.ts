'use server';

import { adminDb } from '../firebase-admin';
import type { ScorecardScoringConfig } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';

const COLLECTION = 'scorecardScoringConfig';

/**
 * Get scoring config with series-level override support.
 * Priority: series config → org config → default
 */
export async function getScoringConfigAction(
  organizationId: string,
  seriesId?: string
): Promise<ScorecardScoringConfig> {
  try {
    // 1. Try series-level config first
    if (seriesId) {
      const seriesSnap = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', organizationId)
        .where('seriesId', '==', seriesId)
        .limit(1)
        .get();

      if (!seriesSnap.empty) {
        return { id: seriesSnap.docs[0].id, ...seriesSnap.docs[0].data() } as ScorecardScoringConfig;
      }
    }

    // 2. Fall back to org-level (fetch all and find one without seriesId)
    const allSnap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', organizationId)
      .limit(20)
      .get();

    const orgDoc = allSnap.docs.find(d => !d.data().seriesId);
    if (orgDoc) {
      return { id: orgDoc.id, ...orgDoc.data() } as ScorecardScoringConfig;
    }

    // 3. Legacy: any doc for this org
    if (!allSnap.empty) {
      return { id: allSnap.docs[0].id, ...allSnap.docs[0].data() } as ScorecardScoringConfig;
    }

    return { ...DEFAULT_SCORING_CONFIG, organizationId };
  } catch {
    return { ...DEFAULT_SCORING_CONFIG, organizationId };
  }
}

/**
 * Get org-level scoring config only (no series override).
 */
export async function getOrgScoringConfigAction(
  organizationId: string
): Promise<ScorecardScoringConfig> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', organizationId)
      .limit(20)
      .get();

    const orgDoc = snap.docs.find(d => !d.data().seriesId);
    if (orgDoc) return { id: orgDoc.id, ...orgDoc.data() } as ScorecardScoringConfig;
    return { ...DEFAULT_SCORING_CONFIG, organizationId };
  } catch {
    return { ...DEFAULT_SCORING_CONFIG, organizationId };
  }
}

/**
 * Get series-level config only (null if not set).
 */
export async function getSeriesScoringConfigAction(
  organizationId: string,
  seriesId: string
): Promise<ScorecardScoringConfig | null> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', organizationId)
      .where('seriesId', '==', seriesId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as ScorecardScoringConfig;
  } catch {
    return null;
  }
}

/**
 * Save scoring config — org or series level.
 */
export async function saveScoringConfigAction(
  config: ScorecardScoringConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const { id, ...data } = config;
    const payload = { ...data, updatedAt: new Date().toISOString() };

    if (id) {
      await adminDb.collection(COLLECTION).doc(id).set(payload, { merge: true });
      return { success: true };
    }

    // Find existing for this org + seriesId combo
    let snap;
    if (config.seriesId) {
      snap = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', config.organizationId)
        .where('seriesId', '==', config.seriesId)
        .limit(1)
        .get();
    } else {
      // Org level — find doc without seriesId
      const all = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', config.organizationId)
        .limit(20)
        .get();
      const orgDocs = all.docs.filter(d => !d.data().seriesId);
      snap = { empty: orgDocs.length === 0, docs: orgDocs };
    }

    if (snap.empty) {
      await adminDb.collection(COLLECTION).add(payload);
    } else {
      await snap.docs[0].ref.set(payload, { merge: true });
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete series-level scoring config (reverts series to org default).
 */
export async function deleteSeriesScoringConfigAction(
  organizationId: string,
  seriesId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', organizationId)
      .where('seriesId', '==', seriesId)
      .limit(1)
      .get();

    if (!snap.empty) await snap.docs[0].ref.delete();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
