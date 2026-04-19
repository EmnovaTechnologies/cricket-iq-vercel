'use client';

/**
 * FILE: src/lib/actions/player-registration-actions.ts
 *
 * Client-side wrapper — delegates all Firestore writes to the server action
 * (register-player-admin-action.ts) which uses the Admin SDK and bypasses
 * security rules. This is required because the user is unauthenticated at
 * the point of registration.
 */

import { registerPlayerAdminAction } from './register-player-admin-action';
import type { RegistrationResult } from '@/types';

interface RegistrationData {
  firstName: string;
  lastName: string;
  gender: 'Male' | 'Female';
  dateOfBirth: Date;
  cricClubsId: string;
  email: string;
  password: string;
  primaryTeamId?: string;
  clubName?: string;
}

export async function registerPlayerAction(
  data: RegistrationData,
  orgId: string
): Promise<RegistrationResult> {
  return registerPlayerAdminAction(data, orgId);
}
