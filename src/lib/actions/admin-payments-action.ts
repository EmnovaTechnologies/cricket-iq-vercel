'use server';

/**
 * FILE: src/lib/actions/admin-payments-action.ts
 */

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';

export interface PaymentRow {
  id: string;
  playerId: string;
  playerName: string;
  userId: string;
  seriesId: string;
  seriesName: string;
  organizationId: string;
  organizationName: string;
  amount: number;
  originalAmount: number;
  status: 'succeeded' | 'failed' | 'waived' | 'pending';
  stripeSessionId: string;
  receiptUrl?: string;
  promoCodeId?: string;
  waivedBy?: string;
  paidAt?: string;
  createdAt: string;
}

export async function getPaymentsAction(orgId?: string): Promise<PaymentRow[]> {
  try {
    let query: admin.firestore.Query = adminDb.collection('playerPayments')
      .orderBy('createdAt', 'desc')
      .limit(200);

    if (orgId) {
      query = adminDb.collection('playerPayments')
        .where('organizationId', '==', orgId)
        .orderBy('createdAt', 'desc')
        .limit(200);
    }

    const snap = await query.get();
    if (snap.empty) return [];

    // Enrich with player names and series names in parallel
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Batch fetch player names, series names, and org names
    const playerIds = [...new Set(rows.map((r: any) => r.playerId).filter(Boolean))];
    const seriesIds = [...new Set(rows.map((r: any) => r.seriesId).filter(Boolean))];
    const orgIds = [...new Set(rows.map((r: any) => r.organizationId).filter(Boolean))];

    const [playerSnaps, seriesSnaps, orgSnaps] = await Promise.all([
      playerIds.length > 0
        ? Promise.all(playerIds.map(id => adminDb.doc(`players/${id}`).get()))
        : Promise.resolve([]),
      seriesIds.length > 0
        ? Promise.all(seriesIds.map(id => adminDb.doc(`series/${id}`).get()))
        : Promise.resolve([]),
      orgIds.length > 0
        ? Promise.all(orgIds.map(id => adminDb.doc(`organizations/${id}`).get()))
        : Promise.resolve([]),
    ]);

    const playerMap: Record<string, string> = {};
    playerSnaps.forEach((s: any) => {
      if (s.exists) playerMap[s.id] = s.data().name || s.data().firstName + ' ' + s.data().lastName;
    });

    const seriesMap: Record<string, string> = {};
    seriesSnaps.forEach((s: any) => {
      if (s.exists) seriesMap[s.id] = s.data().name;
    });

    const orgMap: Record<string, string> = {};
    orgSnaps.forEach((s: any) => {
      if (s.exists) orgMap[s.id] = s.data().name;
    });

    return rows.map((r: any) => ({
      id: r.id,
      playerId: r.playerId,
      playerName: playerMap[r.playerId] || 'Unknown Player',
      userId: r.userId,
      seriesId: r.seriesId,
      seriesName: seriesMap[r.seriesId] || 'Unknown Series',
      organizationId: r.organizationId,
      organizationName: orgMap[r.organizationId] || 'Unknown Org',
      amount: r.amount,
      originalAmount: r.originalAmount,
      status: r.status,
      stripeSessionId: r.stripeSessionId,
      receiptUrl: r.receiptUrl,
      promoCodeId: r.promoCodeId,
      waivedBy: r.waivedBy,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
    }));
  } catch (e: any) {
    console.error('[getPaymentsAction]', e);
    return [];
  }
}

export async function waivePaymentAction(
  playerId: string,
  seriesId: string,
  orgId: string,
  waivedByUid: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();

    // Check if already paid/waived
    const existing = await adminDb
      .collection('playerPayments')
      .where('playerId', '==', playerId)
      .where('seriesId', '==', seriesId)
      .limit(1)
      .get();

    if (!existing.empty) {
      const status = existing.docs[0].data().status;
      if (status === 'succeeded' || status === 'waived') {
        // Update existing to waived
        await existing.docs[0].ref.update({
          status: 'waived',
          waivedBy: waivedByUid,
          paidAt: now,
        });
        return { success: true };
      }
    }

    // Create new waived payment doc
    await adminDb.collection('playerPayments').add({
      playerId,
      userId: '',   // will be empty if player not yet linked
      seriesId,
      organizationId: orgId,
      stripeSessionId: `waived-${playerId}-${seriesId}`,
      amount: 0,
      originalAmount: 0,
      status: 'waived',
      waivedBy: waivedByUid,
      paidAt: now,
      createdAt: now,
    });

    return { success: true };
  } catch (e: any) {
    console.error('[waivePaymentAction]', e);
    return { success: false, error: e.message };
  }
}
