'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type { MatchReport } from '@/types';

const COLLECTION = 'matchReports';

// ─── Submit Report ────────────────────────────────────────────────────────────

export async function submitMatchReportAction(
  report: Omit<MatchReport, 'id' | 'submittedAt' | 'isCertified'>
): Promise<{ success: boolean; reportId?: string; error?: string }> {
  try {
    // One report per submitter per game
    const existing = await adminDb.collection(COLLECTION)
      .where('gameId', '==', report.gameId)
      .where('submittedBy', '==', report.submittedBy)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { success: false, error: 'You have already submitted a report for this game.' };
    }

    const ref = await adminDb.collection(COLLECTION).add({
      ...report,
      isCertified: false,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, reportId: ref.id };
  } catch (error: any) {
    console.error('[submitMatchReportAction] Error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Get Reports for Game ─────────────────────────────────────────────────────

export async function getMatchReportsForGameAction(
  gameId: string
): Promise<{ success: boolean; reports?: MatchReport[]; error?: string }> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('gameId', '==', gameId)
      .orderBy('submittedAt', 'desc')
      .get();

    const reports = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      submittedAt: d.data().submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      certifiedAt: d.data().certifiedAt?.toDate?.()?.toISOString() || undefined,
    })) as MatchReport[];

    return { success: true, reports };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Get Reports for Scorecard ────────────────────────────────────────────────

export async function getMatchReportsForScorecardAction(
  scorecardId: string
): Promise<{ success: boolean; reports?: MatchReport[]; error?: string }> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('scorecardId', '==', scorecardId)
      .orderBy('submittedAt', 'desc')
      .get();

    const reports = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      submittedAt: d.data().submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      certifiedAt: d.data().certifiedAt?.toDate?.()?.toISOString() || undefined,
    })) as MatchReport[];

    return { success: true, reports };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Get Reports for Series (Series Admin view) ───────────────────────────────

export async function getMatchReportsForSeriesAction(
  seriesId: string,
  organizationId: string
): Promise<{ success: boolean; reports?: MatchReport[]; error?: string }> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('organizationId', '==', organizationId)
      .where('seriesId', '==', seriesId)
      .orderBy('submittedAt', 'desc')
      .get();

    const reports = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      submittedAt: d.data().submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      certifiedAt: d.data().certifiedAt?.toDate?.()?.toISOString() || undefined,
    })) as MatchReport[];

    return { success: true, reports };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Certify Report ───────────────────────────────────────────────────────────

export async function certifyMatchReportAction(
  reportId: string,
  certifiedBy: string,
  certifiedByName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection(COLLECTION).doc(reportId).update({
      isCertified: true,
      certifiedBy,
      certifiedByName,
      certifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Check if user already submitted ─────────────────────────────────────────

export async function getUserReportForGameAction(
  gameId: string,
  userId: string
): Promise<MatchReport | null> {
  try {
    const snap = await adminDb.collection(COLLECTION)
      .where('gameId', '==', gameId)
      .where('submittedBy', '==', userId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return {
      id: snap.docs[0].id,
      ...snap.docs[0].data(),
      submittedAt: snap.docs[0].data().submittedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    } as MatchReport;
  } catch {
    return null;
  }
}
