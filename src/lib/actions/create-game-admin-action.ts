'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import type { Game } from '@/types';

interface CreateGameParams {
  seriesId: string;
  organizationId: string;
  date: string; // ISO string
  venue: string;
  team1: string;
  team2: string;
  team1Players: string[];
  team2Players: string[];
  selectorUserIds: string[];
}

export async function createGameAdminAction(
  gameData: CreateGameParams
): Promise<{ success: boolean; game?: Game; error?: string }> {
  if (!gameData.seriesId || !gameData.organizationId) {
    return { success: false, error: 'Series ID and Organization ID are required.' };
  }

  try {
    // Verify series exists and is not archived
    const seriesDoc = await adminDb.collection('series').doc(gameData.seriesId).get();
    if (!seriesDoc.exists) {
      return { success: false, error: 'Selected series not found.' };
    }
    const seriesData = seriesDoc.data()!;
    if (seriesData.status === 'archived') {
      return { success: false, error: `Cannot add game to archived series "${seriesData.name}".` };
    }

    const firestoreData: Record<string, any> = {
      seriesId: gameData.seriesId,
      organizationId: gameData.organizationId,
      date: gameData.date,
      venue: gameData.venue.trim(),
      team1: gameData.team1.trim(),
      team2: gameData.team2.trim(),
      team1Players: gameData.team1Players || [],
      team2Players: gameData.team2Players || [],
      selectorUserIds: gameData.selectorUserIds || [],
      status: 'active',
      selectorCertifications: {},
      ratingsFinalized: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const gameRef = await adminDb.collection('games').add(firestoreData);

    // Update selector user docs
    if (gameData.selectorUserIds && gameData.selectorUserIds.length > 0) {
      const batch = adminDb.batch();
      for (const uid of gameData.selectorUserIds) {
        batch.update(adminDb.collection('users').doc(uid), {
          assignedGameIds: admin.firestore.FieldValue.arrayUnion(gameRef.id),
          assignedOrganizationIds: admin.firestore.FieldValue.arrayUnion(gameData.organizationId),
        });
      }
      await batch.commit();
    }

    const game: Game = {
      id: gameRef.id,
      seriesId: gameData.seriesId,
      seriesName: seriesData.name,
      organizationId: gameData.organizationId,
      date: gameData.date,
      venue: gameData.venue.trim(),
      team1: gameData.team1.trim(),
      team2: gameData.team2.trim(),
      team1Players: gameData.team1Players || [],
      team2Players: gameData.team2Players || [],
      selectorUserIds: gameData.selectorUserIds || [],
      status: 'active',
      selectorCertifications: {},
      ratingsFinalized: false,
      createdAt: new Date().toISOString(),
    };

    return { success: true, game };
  } catch (error: any) {
    console.error('[createGameAdminAction] Error:', error);
    return { success: false, error: error.message || 'Failed to create game.' };
  }
}
