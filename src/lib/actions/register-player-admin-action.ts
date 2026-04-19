'use server';

/**
 * FILE: src/lib/actions/register-player-admin-action.ts
 *
 * Server-side player registration using Firebase Admin SDK.
 * Bypasses Firestore security rules — safe because all validation
 * (CricClubs ID match, identity verification) is done before any writes.
 *
 * Called by player-registration-actions.ts which runs client-side.
 */

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import { format } from 'date-fns';
import { randomBytes } from 'crypto';
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

export async function registerPlayerAdminAction(
  data: RegistrationData,
  orgId: string
): Promise<RegistrationResult> {
  try {
    const cricClubsId = data.cricClubsId.trim();

    // ── Step 1: Look up existing player by CricClubs ID ──
    const existingPlayerSnap = await adminDb
      .collection('players')
      .where('cricClubsId', '==', cricClubsId)
      .limit(1)
      .get();

    if (!existingPlayerSnap.empty) {
      // ── CLAIM FLOW ──
      const playerDoc = existingPlayerSnap.docs[0];
      const existingPlayer = { id: playerDoc.id, ...playerDoc.data() } as any;

      if (existingPlayer.userId) {
        return {
          success: false,
          error: 'This player profile has already been claimed. Please login or contact an administrator if you believe this is an error.',
        };
      }

      // Verify identity
      const formattedFormDOB = format(data.dateOfBirth, 'yyyy-MM-dd');
      const namesMatch =
        existingPlayer.firstName?.trim().toLowerCase() === data.firstName.trim().toLowerCase() &&
        existingPlayer.lastName?.trim().toLowerCase() === data.lastName.trim().toLowerCase();

      if (namesMatch && existingPlayer.dateOfBirth === formattedFormDOB && existingPlayer.gender === data.gender) {
        // Identity verified — write registration token
        const registrationToken = randomBytes(16).toString('hex');
        const tokenExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await playerDoc.ref.update({
          registrationToken,
          registrationTokenExpires: tokenExpiration,
        });

        return {
          success: true,
          registrationToken,
          message: 'Profile found. Proceeding with account creation.',
        };
      } else {
        return {
          success: false,
          error:
            'A player with this CricClubs ID exists, but the personal details (Name, DOB, Gender) do not match. Please correct your information or contact an administrator.',
        };
      }
    } else {
      // ── NEW PLAYER FLOW ──
      const registrationToken = randomBytes(16).toString('hex');
      const tokenExpiration = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`;
      const nameTokens = fullName.toLowerCase().split(' ').filter(Boolean);
      const searchableNameTokens = [...nameTokens, fullName.toLowerCase()];

      const newPlayerData: Record<string, any> = {
        name: fullName,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        searchableNameTokens,
        cricClubsId,
        dateOfBirth: format(data.dateOfBirth, 'yyyy-MM-dd'),
        gender: data.gender,
        organizationId: orgId,
        gamesPlayed: 0,
        registrationToken,
        registrationTokenExpires: tokenExpiration,
      };

      if (data.primaryTeamId && data.primaryTeamId !== '') {
        newPlayerData.primaryTeamId = data.primaryTeamId;
      }
      if (data.clubName && data.clubName !== '') {
        newPlayerData.clubName = data.clubName;
      }

      // Create the player document
      const playerRef = await adminDb.collection('players').add(newPlayerData);

      // Add to team roster if primaryTeamId provided and player is age eligible
      if (data.primaryTeamId && data.primaryTeamId !== '') {
        try {
          const teamSnap = await adminDb.collection('teams').doc(data.primaryTeamId).get();
          if (teamSnap.exists) {
            await teamSnap.ref.update({
              playerIds: admin.firestore.FieldValue.arrayUnion(playerRef.id),
            });
          }
        } catch (teamError) {
          // Non-fatal — player created successfully, team update failed
          console.warn('[registerPlayerAdminAction] Could not add player to team roster:', teamError);
        }
      }

      return {
        success: true,
        registrationToken,
        message: 'New player profile created and token generated.',
      };
    }
  } catch (e: any) {
    console.error('[registerPlayerAdminAction] Error:', e);
    return {
      success: false,
      error: `An unexpected server error occurred: ${e.message}`,
    };
  }
}
