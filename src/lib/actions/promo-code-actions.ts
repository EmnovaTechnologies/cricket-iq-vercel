'use server';

/**
 * FILE: src/lib/actions/promo-code-actions.ts
 */

import { adminDb } from '../firebase-admin';

export interface PromoCodeRow {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  seriesId?: string;
  seriesName?: string;
  maxUses: number;
  usedCount: number;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

export async function getPromoCodesAction(orgId: string): Promise<PromoCodeRow[]> {
  try {
    const snap = await adminDb
      .collection('promoCodes')
      .where('organizationId', '==', orgId)
      .orderBy('createdAt', 'desc')
      .get();

    if (snap.empty) return [];
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    const seriesIds = [...new Set(rows.map((r: any) => r.seriesId).filter(Boolean))];
    const seriesSnaps = seriesIds.length > 0
      ? await Promise.all(seriesIds.map((id: string) => adminDb.doc(`series/${id}`).get()))
      : [];
    const seriesMap: Record<string, string> = {};
    seriesSnaps.forEach((s: any) => { if (s.exists) seriesMap[s.id] = s.data().name; });

    return rows.map((r: any) => ({
      id: r.id,
      code: r.code,
      discountType: r.discountType,
      discountValue: r.discountValue,
      seriesId: r.seriesId,
      seriesName: r.seriesId ? (seriesMap[r.seriesId] || 'Unknown Series') : undefined,
      maxUses: r.maxUses ?? 0,
      usedCount: r.usedCount ?? 0,
      expiresAt: r.expiresAt,
      isActive: r.isActive ?? true,
      createdAt: r.createdAt,
    }));
  } catch (e: any) {
    console.error('[getPromoCodesAction]', e);
    return [];
  }
}

export interface CreatePromoCodeInput {
  code: string;
  orgId: string;
  seriesId?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  maxUses: number;
  expiresAt?: string;
}

export async function createPromoCodeAction(
  input: CreatePromoCodeInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { code, orgId, seriesId, discountType, discountValue, maxUses, expiresAt } = input;

    if (!code.trim()) return { success: false, error: 'Code is required.' };
    if (discountValue <= 0) return { success: false, error: 'Discount value must be greater than 0.' };
    if (discountType === 'percent' && discountValue > 100) return { success: false, error: 'Percent discount cannot exceed 100.' };

    const upperCode = code.trim().toUpperCase();

    const existing = await adminDb
      .collection('promoCodes')
      .where('code', '==', upperCode)
      .where('organizationId', '==', orgId)
      .limit(1)
      .get();
    if (!existing.empty) return { success: false, error: `Code "${upperCode}" already exists for this organization.` };

    const data: Record<string, any> = {
      code: upperCode,
      organizationId: orgId,
      discountType,
      discountValue,
      maxUses: maxUses ?? 0,
      usedCount: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    if (seriesId) data.seriesId = seriesId;
    if (expiresAt) data.expiresAt = expiresAt;

    await adminDb.collection('promoCodes').add(data);
    return { success: true };
  } catch (e: any) {
    console.error('[createPromoCodeAction]', e);
    return { success: false, error: e.message };
  }
}

export async function togglePromoCodeAction(
  promoCodeId: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.doc(`promoCodes/${promoCodeId}`).update({ isActive });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deletePromoCodeAction(
  promoCodeId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.doc(`promoCodes/${promoCodeId}`).delete();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
