
'use client';

import type { Player, PlayerWithRatings, Gender, PrimarySkill, DominantHand, BattingOrder, BowlingStyle, UserProfile } from '../../types';
import type { PlayerFormValues as PlayerFormValuesType } from '@/components/player-form';

import {
  getPlayerWithDetailsByIdFromDB,
} from '../db';

// The 'savePlayerAction' has been moved to the client-side `PlayerForm` component.
// This refactoring was done to better handle client-side state, such as file uploads for avatars,
// and to align with the pattern used in other forms like `OrganizationForm`.
// The form now directly interacts with Firestore for creating and updating player documents.
// This file is kept for read actions or any future player-related server-side logic.

export async function getPlayerDetailsAction(playerId: string): Promise<PlayerWithRatings | null> {
  try {
    const playerDetails = await getPlayerWithDetailsByIdFromDB(playerId);
    return playerDetails || null;
  } catch (error) {
    console.error(`Error in getPlayerDetailsAction for player ${playerId}:`, error);
    return null;
  }
}
