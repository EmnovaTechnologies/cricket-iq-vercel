'use server';

import { adminDb } from '../firebase-admin';
import type { ScorecardScoringConfig } from '@/types';
import { DEFAULT_SCORING_CONFIG } from '@/types';

const COLLECTION = 'scorecardScoringConfig';

export async function getScoringConfigAction(
  organizationId: string
): Promise<ScorecardScoringConfig> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (snap.empty) {
      return { ...DEFAULT_SCORING_CONFIG, organizationId };
    }

    return { id: snap.docs[0].id, ...snap.docs[0].data() } as ScorecardScoringConfig;
  } catch {
    return { ...DEFAULT_SCORING_CONFIG, organizationId };
  }
}

export async function saveScoringConfigAction(
  config: ScorecardScoringConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const { id, ...data } = config;
    const payload = { ...data, updatedAt: new Date().toISOString() };

    if (id) {
      await adminDb.collection(COLLECTION).doc(id).set(payload, { merge: true });
    } else {
      const existing = await adminDb.collection(COLLECTION)
        .where('organizationId', '==', config.organizationId)
        .limit(1)
        .get();

      if (existing.empty) {
        await adminDb.collection(COLLECTION).add(payload);
      } else {
        await existing.docs[0].ref.set(payload, { merge: true });
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
