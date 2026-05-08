'use server';

/**
 * FILE: src/lib/actions/registration-settings-action.ts
 */

import { adminDb } from '../firebase-admin';
import type { RegistrationFeeConfig } from '@/types';

export async function getRegistrationSettingsAction(): Promise<RegistrationFeeConfig> {
  try {
    const snap = await adminDb.doc('systemSettings/registration').get();
    if (!snap.exists) return { defaultFee: 399, currency: 'usd', isActive: true };
    const d = snap.data()!;
    return { defaultFee: d.defaultFee ?? 399, currency: d.currency ?? 'usd', isActive: d.isActive ?? true };
  } catch (e: any) {
    console.error('[getRegistrationSettingsAction]', e);
    return { defaultFee: 399, currency: 'usd', isActive: true };
  }
}

export async function saveRegistrationSettingsAction(
  defaultFee: number,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (defaultFee < 0) return { success: false, error: 'Fee cannot be negative.' };
    await adminDb.doc('systemSettings/registration').set(
      { defaultFee, currency: 'usd', isActive, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return { success: true };
  } catch (e: any) {
    console.error('[saveRegistrationSettingsAction]', e);
    return { success: false, error: e.message };
  }
}
