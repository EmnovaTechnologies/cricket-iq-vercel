'use client';

import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  serverTimestamp,
  orderBy,
  QueryConstraint,
  limit,
  setDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Game, Series, Player, UserProfile, PlayerRating, RatingValue, SelectorCertificationData } from '../../types';
import type { GameFormValues as GameFormValuesType } from '@/components/game-form';

// DB function imports
import {
  getSeriesByIdFromDB,
  getPlayerByIdFromDB,
  addGameToDB,
  getGameByIdFromDB as getGameByIdFromDBFunction, // Alias to avoid conflict if any local wrapper
  getTeamsForSeriesFromDB,
  getPlayersFromIds,
  isPlayerAgeEligibleForSeriesFromDB,
  getAllGamesFromDB, // Added for getGamesForUserViewAction
  getTeamByIdFromDB, // Added for getGamesForUserViewAction
  getGamesByIdsFromDB, // Added for getGamesForUserViewAction
} from '../db';
import { getUserProfile } from '../user-actions'; // For admin checks or getting display names
import { isValid, parse, format } from 'date-fns';

// --- Game Actions ---
export async function addGameAction(gameData: GameFormValuesType & { selectorUserIds?: string[] }): Promise<Game> {
  const currentSeries = await getSeriesByIdFromDB(gameData.seriesId);
  if (!currentSeries) {
    throw new Error("Selected series not found.");
  }
  if (currentSeries.status === 'archived') {
    throw new Error(`Cannot add game to archived series "${currentSeries.name}".`);
  }
  if (!currentSeries.organizationId) {
    throw new Error("Parent series is not associated with an organization.");
  }

  let normalizedDateString: string;
  if (typeof gameData.date === 'string') {
    const parsedDate = new Date(gameData.date); // Attempt to parse if string
    if (!isValid(parsedDate)) {
        throw new Error(`Invalid date string received: ${gameData.date}`);
    }
    normalizedDateString = parsedDate.toISOString();
  } else if (gameData.date instanceof Date && isValid(gameData.date)) {
    normalizedDateString = gameData.date.toISOString();
  } else {
    throw new Error('Game date is missing or invalid.');
  }

  const seriesTeams = await getTeamsForSeriesFromDB(gameData.seriesId);
  const team1Object = seriesTeams.find(t => t.name === gameData.team1);
  const team2Object = seriesTeams.find(t => t.name === gameData.team2);

  let team1EligiblePlayerIds: string[] = [];
  if (team1Object && team1Object.playerIds.length > 0) {
    const prospectiveTeam1Players = await getPlayersFromIds(team1Object.playerIds);
    for (const player of prospectiveTeam1Players) {
      if (player && isPlayerAgeEligibleForSeriesFromDB(player, currentSeries)) {
        team1EligiblePlayerIds.push(player.id);
      }
    }
  }

  let team2EligiblePlayerIds: string[] = [];
  if (team2Object && team2Object.playerIds.length > 0) {
    const prospectiveTeam2Players = await getPlayersFromIds(team2Object.playerIds);
    for (const player of prospectiveTeam2Players) {
      if (player && isPlayerAgeEligibleForSeriesFromDB(player, currentSeries) && !team1EligiblePlayerIds.includes(player.id) ) {
        team2EligiblePlayerIds.push(player.id);
      }
    }
  }

  const gameToSave: Omit<Game, 'id' | 'seriesName' | 'status' | 'createdAt' | 'selectorCertifications' | 'ratingsFinalized'> = {
    seriesId: gameData.seriesId,
    organizationId: currentSeries.organizationId, // Ensure organizationId from series is saved
    date: normalizedDateString,
    venue: gameData.venue,
    team1: gameData.team1,
    team2: gameData.team2,
    team1Players: team1EligiblePlayerIds,
    team2Players: team2EligiblePlayerIds,
    selectorUserIds: gameData.selectorUserIds || [],
  };

  const newGame = await (async () => {
    const { createGameAdminAction } = await import('./create-game-admin-action');
    const result = await createGameAdminAction({
      seriesId: gameToSave.seriesId,
      organizationId: gameToSave.organizationId,
      date: normalizedDateString,
      venue: gameToSave.venue,
      team1: gameToSave.team1,
      team2: gameToSave.team2,
      team1Players: team1EligiblePlayerIds,
      team2Players: team2EligiblePlayerIds,
      selectorUserIds: gameData.selectorUserIds || [],
    });
    if (!result.success || !result.game) throw new Error(result.error || 'Failed to create game.');
    return result.game;
  })();

  return { ...newGame, seriesName: currentSeries.name };
}

export async function updatePlayerGameInclusionAction(
  gameId: string,
  playerId: string,
  teamIdentifier: 'team1' | 'team2',
  isIncluded: boolean
): Promise<{ success: boolean; message: string }> {
  try {
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) {
      return { success: false, message: "Game not found." };
    }
    const gameData = gameSnap.data() as Game;

    if (gameData.seriesId) {
        const series = await getSeriesByIdFromDB(gameData.seriesId);
        if (series?.status === 'archived') {
            return { success: false, message: `Cannot update roster for a game in an archived series (${series.name}).`};
        }
    }

    if (isIncluded) {
        const otherTeamPlayersKey = teamIdentifier === 'team1' ? 'team2Players' : 'team1Players';
        const otherTeamName = teamIdentifier === 'team1' ? gameData.team2 : gameData.team1;
        const playerDoc = await getPlayerByIdFromDB(playerId);
        if (gameData[otherTeamPlayersKey]?.includes(playerId)) {
            return {
                success: false,
                message: `${playerDoc?.name || 'Player'} is already included in ${otherTeamName}'s roster. A player cannot be in both teams.`,
            };
        }
    }

    const fieldToUpdate = teamIdentifier === 'team1' ? 'team1Players' : 'team2Players';
    const updateData = isIncluded
      ? { [fieldToUpdate]: arrayUnion(playerId) }
      : { [fieldToUpdate]: arrayRemove(playerId) };

    await updateDoc(gameRef, updateData);

    const playerForMessage = await getPlayerByIdFromDB(playerId);
    const teamNameForMessage = teamIdentifier === 'team1' ? gameData.team1 : gameData.team2;
    const actionText = isIncluded ? "added to" : "removed from";

    return { success: true, message: `${playerForMessage?.name || 'Player'} ${actionText} ${teamNameForMessage}'s game roster.` };
  } catch (error) {
    console.error("Error in updatePlayerGameInclusionAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred while updating game roster.";
    return { success: false, message };
  }
}


export async function addPlayerToGameRosterAction(gameId: string, playerId: string, teamIdentifier: 'team1' | 'team2'): Promise<{ success: boolean; message: string; playerName?: string; teamName?: string }> {
  const result = await updatePlayerGameInclusionAction(gameId, playerId, teamIdentifier, true);
  if (result.success) {
    const player = await getPlayerByIdFromDB(playerId);
    const game = await getGameByIdFromDBFunction(gameId); // Use aliased DB function
    const teamName = teamIdentifier === 'team1' ? game?.team1 : game?.team2;
    return { ...result, playerName: player?.name, teamName };
  } else {
    return result;
  }
}


export async function updateGameSelectorsAction(gameId: string, newSelectorUserIds: string[]): Promise<{ success: boolean; message: string }> {
  try {
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);

    if (!gameSnap.exists()) {
      return { success: false, message: "Game not found." };
    }
    const currentGameData = gameSnap.data() as Game;

    if (!currentGameData.organizationId) {
        console.error(`Game ${gameId} is missing organizationId. Cannot reliably update selector organization assignments.`);
        return { success: false, message: "Game data is incomplete (missing organizationId), selectors cannot be updated." };
    }

    if (currentGameData.seriesId) {
        const series = await getSeriesByIdFromDB(currentGameData.seriesId);
        if (series?.status === 'archived') {
            return { success: false, message: `Cannot update selectors for a game in an archived series (${series.name}).`};
        }
    }

    const oldSelectorUserIds = currentGameData.selectorUserIds || [];

    const batch = writeBatch(db);
    batch.update(gameRef, { selectorUserIds: newSelectorUserIds });

    // Add to new selectors' assignedGameIds and assignedOrganizationIds
    const selectorsToAdd = newSelectorUserIds.filter(uid => !oldSelectorUserIds.includes(uid));
    selectorsToAdd.forEach(uid => {
      const userRef = doc(db, 'users', uid);
      batch.update(userRef, {
        assignedGameIds: arrayUnion(gameId),
        assignedOrganizationIds: arrayUnion(currentGameData.organizationId) // Add organization assignment
      });
    });

    // Remove from old selectors' assignedGameIds
    // Note: We are not removing them from assignedOrganizationIds here,
    // as they might have other roles or game assignments in that organization.
    // A more complex cleanup logic would be needed if full unassignment is desired.
    const selectorsToRemove = oldSelectorUserIds.filter(uid => !newSelectorUserIds.includes(uid));
    selectorsToRemove.forEach(uid => {
      const userRef = doc(db, 'users', uid);
      batch.update(userRef, { assignedGameIds: arrayRemove(gameId) });
    });

    await batch.commit();
    return { success: true, message: "Game selectors updated successfully." };
  } catch (error) {
    console.error("Error updating game selectors:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, message };
  }
}

// --- Rating Actions ---
export async function certifyRatingsAction(gameId: string, selectorUid: string, selectorDisplayName: string, ratingsSnapshot: Record<string, RatingValue>): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return { success: false, error: "Game not found." };
    const gameData = gameSnap.data() as Game;
    if (gameData.status === 'archived' || (gameData.seriesId && (await getSeriesByIdFromDB(gameData.seriesId))?.status === 'archived')) return { success: false, error: "Cannot certify ratings for an archived game or a game in an archived series." };
    if (!gameData.selectorUserIds?.includes(selectorUid)) return { success: false, error: "User is not an assigned selector for this game."};

    const newCertificationData: SelectorCertificationData = {
      status: 'certified',
      certifiedAt: new Date().toISOString(), // Use ISO string
      displayName: selectorDisplayName,
      lastCertifiedValues: ratingsSnapshot, // Store the snapshot
    };

    const updatePayload = {
      [`selectorCertifications.${selectorUid}`]: newCertificationData,
      // ratingsLastModifiedAt: serverTimestamp(), // Certifying implies ratings were "touched"
      // ratingsLastModifiedBy: selectorUid,
    };
    await updateDoc(gameRef, updatePayload);
    return { success: true, message: `Ratings certified by ${selectorDisplayName} and snapshot stored.` };
  } catch (error) {
    console.error("Error in certifyRatingsAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred during certification.";
    return { success: false, error: message };
  }
}

export async function finalizeGameRatingsAction(gameId: string, finalizingUserId: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return { success: false, error: "Game not found." };
    const gameData = gameSnap.data() as Game;
    if (gameData.status === 'archived' || (gameData.seriesId && (await getSeriesByIdFromDB(gameData.seriesId))?.status === 'archived')) return { success: false, error: "Cannot finalize ratings for an archived game or a game in an archived series." };
    if (gameData.ratingsFinalized) return { success: false, error: "Ratings for this game have already been finalized." };

    const assignedSelectors = gameData.selectorUserIds || [];
    if (assignedSelectors.length === 0) return { success: false, error: "No selectors are assigned to this game. Cannot finalize." };

    const certifications = gameData.selectorCertifications || {};
    for (const selectorId of assignedSelectors) {
      const certData = certifications[selectorId];
      if (!certData || certData.status !== 'certified') {
        return { success: false, error: `Not all selectors have certified. Selector ${certData?.displayName || selectorId} is pending.` };
      }
      // Check if ratings were modified *after* this selector certified
      if (gameData.ratingsLastModifiedAt && new Date(gameData.ratingsLastModifiedAt) > new Date(certData.certifiedAt)) {
        return { success: false, error: `Ratings were modified after Selector ${certData.displayName || selectorId} certified. Re-certification is required.`};
      }
    }

    await updateDoc(gameRef, {
      ratingsFinalized: true,
      ratingsFinalizedBy: finalizingUserId,
      ratingsFinalizedAt: serverTimestamp(),
    });
    return { success: true, message: "Game ratings have been successfully finalized." };
  } catch (error) {
    console.error("Error in finalizeGameRatingsAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred during finalization.";
    return { success: false, error: message };
  }
}

export async function adminForceFinalizeGameRatingsAction(gameId: string, adminUserId: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return { success: false, error: "Game not found." };
    const gameData = gameSnap.data() as Game;
    if (gameData.status === 'archived' || (gameData.seriesId && (await getSeriesByIdFromDB(gameData.seriesId))?.status === 'archived')) return { success: false, error: "Cannot force finalize ratings for an archived game or a game in an archived series." };
    if (gameData.ratingsFinalized) return { success: false, error: "Ratings for this game have already been finalized." };

    // Permission check: User must be 'admin' or 'Series Admin' for this series
    const adminUserProfile = await getUserProfile(adminUserId);
    if (!adminUserProfile) return { success: false, error: "Admin user profile not found." };

    const isOverallAdmin = adminUserProfile.roles.includes('admin');
    let isSeriesAdminForGame = false;
    if (gameData.seriesId && adminUserProfile.roles.includes('Series Admin')) {
      const seriesDetails = await getSeriesByIdFromDB(gameData.seriesId);
      if (seriesDetails?.seriesAdminUids?.includes(adminUserId)) {
        isSeriesAdminForGame = true;
      }
    }

    if (!isOverallAdmin && !isSeriesAdminForGame) {
      return { success: false, error: "User is not authorized to force finalize ratings for this game." };
    }

    await updateDoc(gameRef, {
      ratingsFinalized: true,
      ratingsFinalizedBy: adminUserId, // Log who forced it
      ratingsFinalizedAt: serverTimestamp(),
    });
    return { success: true, message: `Game ratings have been force finalized by admin (${adminUserProfile.displayName || adminUserProfile.email}).` };
  } catch (error) {
    console.error("Error in adminForceFinalizeGameRatingsAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred during force finalization.";
    return { success: false, error: message };
  }
}

export async function getGamesForUserViewAction(userProfile: UserProfile | null, activeOrganizationId: string | null): Promise<Game[]> {
  if (!userProfile) { console.log("[getGamesForUserViewAction] No user profile. Returning empty."); return []; }
  const isSuperAdmin = userProfile.roles.includes('admin');

  if (isSuperAdmin) {
    // Super admin sees all active games for the active org, or all active games from all orgs if no active org.
    if (!activeOrganizationId) return getAllGamesFromDB('all', undefined);
    return getAllGamesFromDB('all', activeOrganizationId);
  }

  // For all other roles, an active organization must be selected.
  if (!activeOrganizationId) {
    console.log(`[getGamesForUserViewAction] Non-admin ${userProfile.uid} no active org. Empty.`);
    return [];
  }

  // Fetch active games within the active organization.
  const orgGames = await getAllGamesFromDB('all', activeOrganizationId);
  if (orgGames.length === 0) return []; // No active games in this org, no need to proceed.

  let gamesToDisplaySet = new Set<string>();

  if (userProfile.roles.includes('Organization Admin')) {
    // Organization Admin sees all active games for their active organization.
    orgGames.forEach(game => gamesToDisplaySet.add(game.id));
  } else {
    // For Series Admin, Team Manager, and Selector, filter based on their assignments within orgGames.
    if (userProfile.roles.includes('Series Admin') && userProfile.assignedSeriesIds && userProfile.assignedSeriesIds.length > 0) {
      const seriesAdminGames = orgGames.filter(game => game.seriesId && userProfile.assignedSeriesIds!.includes(game.seriesId));
      seriesAdminGames.forEach(game => gamesToDisplaySet.add(game.id));
    }
    if (userProfile.roles.includes('Team Manager') && userProfile.assignedTeamIds && userProfile.assignedTeamIds.length > 0) {
      const managedTeamDetails = (await Promise.all(userProfile.assignedTeamIds.map(teamId => getTeamByIdFromDB(teamId))))
        .filter(team => team && team.organizationId === activeOrganizationId); // Ensure team is in the active org
      const managedTeamNamesInActiveOrg = managedTeamDetails.map(team => team!.name);
      if (managedTeamNamesInActiveOrg.length > 0) {
        const teamManagerGames = orgGames.filter(game => managedTeamNamesInActiveOrg.includes(game.team1) || managedTeamNamesInActiveOrg.includes(game.team2));
        teamManagerGames.forEach(game => gamesToDisplaySet.add(game.id));
      }
    }
    if (userProfile.roles.includes('selector')) {
      // Directly filter orgGames by checking if the user's UID is in the game's selectorUserIds list.
      // This is more robust than relying on userProfile.assignedGameIds which might be stale.
      const selectorGames = orgGames.filter(game => game.selectorUserIds?.includes(userProfile.uid));
      selectorGames.forEach(game => gamesToDisplaySet.add(game.id));
    }
  }

  if (gamesToDisplaySet.size > 0) {
    const finalGameIds = Array.from(gamesToDisplaySet);
    // Since orgGames are already filtered by active status and org, we can just filter them by ID here.
    // This avoids re-fetching and re-checking series status if getGamesByIdsFromDB were less filtered.
    const detailedGames = orgGames.filter(game => finalGameIds.includes(game.id));
    return detailedGames.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return [];
}
