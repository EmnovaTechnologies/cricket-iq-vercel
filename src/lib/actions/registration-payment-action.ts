'use server';

/**
 * FILE: src/lib/actions/registration-payment-action.ts
 *
 * Server actions for the Stripe-gated player registration flow.
 *
 * Responsibilities:
 *  - Fetch the active registration fee from systemSettings/registration
 *  - Fetch active series for an org (Step 2 of registration)
 *  - Validate promo codes
 *  - Create a pendingRegistrations doc before redirecting to Stripe Checkout
 *  - Check payment status for a player (access gate)
 */

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import { format } from 'date-fns';
import type {
  RegistrationFeeConfig,
  PromoCode,
  PendingRegistration,
  PlayerPayment,
} from '@/types';

// ─── Fee Config ───────────────────────────────────────────────────────────────

export async function getRegistrationFeeAction(): Promise<RegistrationFeeConfig> {
  try {
    const snap = await adminDb.doc('systemSettings/registration').get();
    if (!snap.exists) {
      // Sensible default if not configured yet
      return { defaultFee: 399, currency: 'usd', isActive: true };
    }
    const data = snap.data()!;
    return {
      defaultFee: data.defaultFee ?? 399,
      currency: data.currency ?? 'usd',
      isActive: data.isActive ?? true,
    };
  } catch (e: any) {
    console.error('[getRegistrationFeeAction]', e);
    return { defaultFee: 399, currency: 'usd', isActive: true };
  }
}

// ─── Active Series for Org ────────────────────────────────────────────────────

export interface PublicSeriesInfo {
  id: string;
  name: string;
  ageCategory: string;
  year: number;
}

export async function getActiveSeriesForOrgAction(
  orgId: string,
): Promise<PublicSeriesInfo[]> {
  try {
    const snap = await adminDb
      .collection('series')
      .where('organizationId', '==', orgId)
      .where('status', '==', 'active')
      .orderBy('year', 'desc')
      .get();

    return snap.docs.map((d) => ({
      id: d.id,
      name: d.data().name,
      ageCategory: d.data().ageCategory,
      year: d.data().year,
    }));
  } catch (e: any) {
    console.error('[getActiveSeriesForOrgAction]', e);
    return [];
  }
}

// ─── Promo Code Validation ────────────────────────────────────────────────────

export interface PromoValidationResult {
  valid: boolean;
  error?: string;
  promoCodeId?: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  finalFee?: number;    // cents
}

export async function validatePromoCodeAction(
  code: string,
  orgId: string,
  seriesId: string,
  originalFee: number,
): Promise<PromoValidationResult> {
  try {
    const upperCode = code.trim().toUpperCase();

    // Find promo by code — filter candidates, then check constraints
    const snap = await adminDb
      .collection('promoCodes')
      .where('code', '==', upperCode)
      .where('isActive', '==', true)
      .limit(10)
      .get();

    if (snap.empty) {
      return { valid: false, error: 'Promo code not found or inactive.' };
    }

    const now = new Date();

    for (const doc of snap.docs) {
      const p = doc.data() as PromoCode;

      // Scope check
      if (p.seriesId && p.seriesId !== seriesId) continue;
      if (p.organizationId && p.organizationId !== orgId) continue;

      // Expiry
      if (p.expiresAt && new Date(p.expiresAt) < now) {
        return { valid: false, error: 'This promo code has expired.' };
      }

      // Max uses
      if (p.maxUses > 0 && p.usedCount >= p.maxUses) {
        return { valid: false, error: 'This promo code has reached its usage limit.' };
      }

      // Calculate discounted fee
      let discount = 0;
      if (p.discountType === 'percent') {
        discount = Math.round((originalFee * p.discountValue) / 100);
      } else {
        discount = p.discountValue;
      }
      const finalFee = Math.max(0, originalFee - discount);

      return {
        valid: true,
        promoCodeId: doc.id,
        discountType: p.discountType,
        discountValue: p.discountValue,
        finalFee,
      };
    }

    return { valid: false, error: 'Promo code is not valid for this series.' };
  } catch (e: any) {
    console.error('[validatePromoCodeAction]', e);
    return { valid: false, error: 'Could not validate promo code. Please try again.' };
  }
}

// ─── Create Pending Registration ──────────────────────────────────────────────

export interface PendingRegistrationInput {
  orgId: string;
  seriesId: string;
  playerData: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    gender: string;
    cricClubsId: string;
    email: string;
    primaryTeamId?: string;
    clubName?: string;
  };
  fee: number;
  originalFee: number;
  promoCodeId?: string;
}

export interface CreatePendingResult {
  success: boolean;
  pendingId?: string;   // used as Stripe client_reference_id
  error?: string;
}

export async function createPendingRegistrationAction(
  input: PendingRegistrationInput,
): Promise<CreatePendingResult> {
  try {
    const {
      orgId, seriesId, playerData,
      fee, originalFee, promoCodeId,
    } = input;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    const pendingData: Omit<PendingRegistration, 'id'> = {
  stripeSessionId: '',
  orgId,
  seriesId,
  playerData: {
    firstName: playerData.firstName.trim(),
    lastName: playerData.lastName.trim(),
    dateOfBirth: format(playerData.dateOfBirth, 'yyyy-MM-dd'),
    gender: playerData.gender,
    cricClubsId: playerData.cricClubsId.trim(),
    email: playerData.email.trim().toLowerCase(),
    ...(playerData.primaryTeamId ? { primaryTeamId: playerData.primaryTeamId } : {}),
    ...(playerData.clubName ? { clubName: playerData.clubName } : {}),
  },
  fee,
  originalFee,
  ...(promoCodeId ? { promoCodeId } : {}),
  expiresAt,
  createdAt,
  };

    // Write to pendingRegistrations — Stripe session ID added by create-checkout route
    const ref = await adminDb.collection('pendingRegistrations').add(pendingData);

    return { success: true, pendingId: ref.id };
  } catch (e: any) {
    console.error('[createPendingRegistrationAction]', e);
    return { success: false, error: e.message };
  }
}

// ─── Payment Gate Check ───────────────────────────────────────────────────────

export interface PaymentStatus {
  isPaid: boolean;
  isWaived: boolean;
  seriesIds: string[];            // series the player has paid for
}

export async function getPlayerPaymentStatusAction(
  playerId: string,
): Promise<PaymentStatus> {
  try {
    const snap = await adminDb
      .collection('playerPayments')
      .where('playerId', '==', playerId)
      .where('status', 'in', ['succeeded', 'waived'])
      .get();

    if (snap.empty) {
      return { isPaid: false, isWaived: false, seriesIds: [] };
    }

    const seriesIds = snap.docs.map((d) => d.data().seriesId as string);
    const hasWaiver = snap.docs.some((d) => d.data().status === 'waived');

    return { isPaid: true, isWaived: hasWaiver, seriesIds };
  } catch (e: any) {
    console.error('[getPlayerPaymentStatusAction]', e);
    // Fail open — don't block players if Firestore is temporarily unavailable
    return { isPaid: true, isWaived: false, seriesIds: [] };
  }
}
