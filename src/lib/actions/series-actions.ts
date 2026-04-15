
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
  setDoc, // Added setDoc
  deleteField, // Added deleteField
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Series, Team, Venue, Game, UserProfile, PlayerRating, RankedBatsman, RankedBowler, RankedWicketKeeper, RankedFielder, RatingValue, FitnessTestType, RankedAllRounder, SuggestedTeam } from '../../types';
import {
  addSeriesToDB,
  getSeriesByIdFromDB,
  addTeamToSeriesInDB,
  getTeamByIdFromDB, 
  addVenueToSeriesInDB,
  getVenueByIdFromDB,
  getTeamsForSeriesFromDB,
  getVenuesForSeriesFromDB as getVenuesForSeriesFromDBFunction,
  getGamesForSeriesFromDB as getGamesForSeriesFromDBFunction,
  getAllSeriesFromDB,
  getPlayersFromIds,
  ratingValueToNumber,
  getAllGamesFromDB,
  getGamesByIdsFromDB,
  updateSeriesInDB, // Ensure updateSeriesInDB is imported
} from '../db';
// The problematic import from 'user-actions' has been removed as it was unused in this file.

// --- Series Actions ---
type AddSeriesActionParams = Omit<Series, 'id' | 'participatingTeams' | 'venueIds' | 'seriesAdminUids' | 'status' | 'createdAt'> & { 
  seriesAdminUids?: string[]; 
  maleCutoffDate?: string | null; 
  femaleCutoffDate?: string | null; 
  organizationId: string;
  fitnessTestType?: FitnessTestType; // Added
  fitnessTestPassingScore?: string; // Added
};

export async function addSeriesAction(seriesData: AddSeriesActionParams): Promise<Series> {
  try {
    const { createSeriesAdminAction } = await import('./create-series-admin-action');
    const result = await createSeriesAdminAction({
      name: seriesData.name,
      ageCategory: seriesData.ageCategory,
      year: seriesData.year,
      organizationId: seriesData.organizationId,
      seriesAdminUids: seriesData.seriesAdminUids || [],
      maleCutoffDate: seriesData.maleCutoffDate || null,
      femaleCutoffDate: seriesData.femaleCutoffDate || null,
      fitnessTestType: seriesData.fitnessTestType,
      fitnessTestPassingScore: seriesData.fitnessTestPassingScore,
    });

    if (!result.success || !result.seriesId || !result.series) {
      throw new Error(result.error || 'Failed to create series.');
    }

    return result.series;

  } catch (error: any) {
    console.error("Error in addSeriesAction:", error);
    let message = "Failed to add series to the database.";
    if (error.code === 'permission-denied') {
      message = "Firestore permission denied. Please check your security rules for the 'series' collection to allow writes.";
    } else if (error instanceof Error && error.message) {
      message = error.message;
    }
    throw new Error(message);
  }
}

export async function updateSeriesAdminsAction(seriesId: string, newSeriesAdminUids: string[]): Promise<{ success: boolean; message: string }> {
  try {
    const seriesRef = doc(db, 'series', seriesId);
    const seriesSnap = await getDoc(seriesRef);

    if (!seriesSnap.exists()) {
      return { success: false, message: "Series not found." };
    }
    const currentSeriesData = seriesSnap.data() as Series;
    if (currentSeriesData.status === 'archived') {
        return { success: false, message: "Cannot update administrators for an archived series." };
    }
    if (!currentSeriesData.organizationId) {
        return { success: false, message: "Cannot assign admins: Series is not linked to an organization." };
    }

    const oldSeriesAdminUids = currentSeriesData.seriesAdminUids || [];

    // Update series doc with new admin UIDs
    const batch = writeBatch(db);
    batch.update(seriesRef, { seriesAdminUids: newSeriesAdminUids });
    await batch.commit();

    // Update user docs via Admin SDK server actions
    const { assignSeriesAdminsAction, removeSeriesAdminsAction } = await import('./assign-series-admins-action');

    const adminsToAdd = newSeriesAdminUids.filter(uid => !oldSeriesAdminUids.includes(uid));
    if (adminsToAdd.length > 0) {
      await assignSeriesAdminsAction(seriesId, currentSeriesData.organizationId, adminsToAdd);
    }

    const adminsToRemove = oldSeriesAdminUids.filter(uid => !newSeriesAdminUids.includes(uid));
    if (adminsToRemove.length > 0) {
      await removeSeriesAdminsAction(seriesId, adminsToRemove);
    }

    return { success: true, message: "Series administrators updated successfully." };
  } catch (error) {
    console.error("Error updating series administrators:", error);
    return { success: false, message: "An unexpected error occurred." };
  }
}


export async function addTeamToSeriesAction(teamId: string, seriesId: string): Promise<{ success: boolean; message: string; teamName?: string; seriesName?: string }> {
  try {
    const team = await getTeamByIdFromDB(teamId);
    const series = await getSeriesByIdFromDB(seriesId);

    if (!team || !series) {
      return { success: false, message: "Team or Series not found." };
    }
    if (series.status === 'archived') {
        return { success: false, message: `Cannot add team to archived series "${series.name}".` };
    }
    if (team.organizationId !== series.organizationId) {
        return { success: false, message: `Team "${team.name}" and Series "${series.name}" belong to different organizations.` };
    }

    const success = await addTeamToSeriesInDB(teamId, seriesId);
    if (success) {
      return { success: true, message: `${team.name} added to ${series.name}.`, teamName: team.name, seriesName: series.name };
    } else {
      return { success: false, message: `Could not add ${team.name} to ${series.name}. This might be due to age category mismatch (if series has no explicit cutoff dates) or the team already being part of the series.`, teamName: team.name, seriesName: series.name };
    }
  } catch (error) {
    console.error("Error in addTeamToSeriesAction:", error);
    return { success: false, message: "An unexpected error occurred while adding team to series." };
  }
}


export async function addVenueToSeriesAction(venueId: string, seriesId: string): Promise<{ success: boolean; message: string; venueName?: string; seriesName?: string }> {
  try {
    const venue = await getVenueByIdFromDB(venueId);
    const series = await getSeriesByIdFromDB(seriesId);

    if (!venue || !series) {
      return { success: false, message: "Venue or Series not found." };
    }
     if (series.status === 'archived') {
        return { success: false, message: `Cannot add venue to archived series "${series.name}".` };
    }
     if (venue.organizationId !== series.organizationId) {
        return { success: false, message: `Venue "${venue.name}" and Series "${series.name}" belong to different organizations.` };
    }
    if (venue.status !== 'active') {
        return { success: false, message: `Venue "${venue.name}" is not active and cannot be added to the series.` };
    }

    const success = await addVenueToSeriesInDB(venueId, seriesId);
    if (success) {
      return { success: true, message: `Venue "${venue.name}" added to series "${series.name}".`, venueName: venue.name, seriesName: series.name, };
    } else {
      return { success: false, message: `Could not add venue "${venue.name}" to series "${series.name}". It might already be added.`, venueName: venue.name, seriesName: series.name, };
    }
  } catch (error) {
    console.error("Error in addVenueToSeriesAction:", error);
    return { success: false, message: "An unexpected error occurred while adding venue to series." };
  }
}

export async function getTeamsForSeriesAction(seriesId: string): Promise<Team[]> {
  if (!seriesId) return [];
  const series = await getSeriesByIdFromDB(seriesId);
  if (!series || series.status === 'archived') return [];
  return getTeamsForSeriesFromDB(seriesId);
}

export async function getVenuesForSeriesAction(seriesId: string): Promise<Venue[]> {
  if (!seriesId) return [];
  const series = await getSeriesByIdFromDB(seriesId);
  if (!series || series.status === 'archived') return [];
  return getVenuesForSeriesFromDBFunction(seriesId);
}

export async function getGamesForSeriesAction(seriesId: string): Promise<Game[]> {
  if (!seriesId) return [];
  const series = await getSeriesByIdFromDB(seriesId);
  if (!series || series.status === 'archived') return [];
  return getGamesForSeriesFromDBFunction(seriesId);
}

export async function archiveSeriesAction(seriesId: string): Promise<{ success: boolean; message: string }> {
  try {
    const seriesRef = doc(db, 'series', seriesId);
    await updateDoc(seriesRef, { status: 'archived' });
    return { success: true, message: "Series archived successfully." };
  } catch (error) {
    console.error("Error archiving series:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, message: `Failed to archive series: ${message}` };
  }
}

export async function unarchiveSeriesAction(seriesId: string): Promise<{ success: boolean; message: string }> {
  try {
    const seriesRef = doc(db, 'series', seriesId);
    await updateDoc(seriesRef, { status: 'active' });
    return { success: true, message: "Series unarchived successfully." };
  } catch (error) {
    console.error("Error unarchiving series:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, message: `Failed to unarchive series: ${message}` };
  }
}

interface BattingRankingsResult {
  success: boolean;
  rankings?: RankedBatsman[];
  error?: string;
  message?: string;
}
export async function getBattingRankingsForSeriesAction(seriesId: string): Promise<BattingRankingsResult> {
  try {
    const series = await getSeriesByIdFromDB(seriesId); if (!series) return { success: false, error: "Series not found." }; if (series.status === 'archived') return { success: false, error: "Cannot get rankings for an archived series." };
    const gamesInSeries = await getGamesForSeriesFromDBFunction(seriesId); if (gamesInSeries.length === 0) return { success: true, rankings: [], message: "No games found in this series to rank players." }; const gameIdsInSeries = gamesInSeries.map(g => g.id);
    const teamsInSeries = await getTeamsForSeriesFromDB(seriesId); const playerIdsInSeriesSet = new Set<string>(); teamsInSeries.forEach(team => team.playerIds.forEach(pid => playerIdsInSeriesSet.add(pid)));
    if (playerIdsInSeriesSet.size === 0) return { success: true, rankings: [], message: "No players found in the teams participating in this series." }; const playersDetailsList = await getPlayersFromIds(Array.from(playerIdsInSeriesSet));
    const allPlayerRatingsForSeries: PlayerRating[] = []; const playerIdsArray = Array.from(playerIdsInSeriesSet);
    for (let i = 0; i < playerIdsArray.length; i += 30) { const playerChunk = playerIdsArray.slice(i, i + 30); if (playerChunk.length > 0) { const ratingsQuery = query(collection(db, 'playerRatings'), where('playerId', 'in', playerChunk)); const ratingsSnapshot = await getDocs(ratingsQuery); ratingsSnapshot.forEach(docSnap => { const rating = { id: docSnap.id, ...docSnap.data() } as PlayerRating; if (gameIdsInSeries.includes(rating.gameId)) allPlayerRatingsForSeries.push(rating); }); }}
    const rankings: RankedBatsman[] = [];
    for (const player of playersDetailsList) {
      const playerRatingsInSeries = allPlayerRatingsForSeries.filter(r => r.playerId === player.id); if (playerRatingsInSeries.length === 0) continue;
      const battingScores = playerRatingsInSeries.map(r => ratingValueToNumber(r.batting)).filter(score => score !== null) as number[]; if (battingScores.length === 0) continue; 
      const sumOfScores = battingScores.reduce((acc, score) => acc + score, 0); const averageBattingScoreInSeries = parseFloat((sumOfScores / battingScores.length).toFixed(1));
      const gamesPlayedInSeries = new Set(playerRatingsInSeries.map(r => r.gameId)).size;
      rankings.push({ id: player.id, name: player.name, avatarUrl: player.avatarUrl, dominantHandBatting: player.dominantHandBatting, battingOrder: player.battingOrder, gamesPlayedInSeries, averageBattingScoreInSeries, });
    }
    rankings.sort((a, b) => b.averageBattingScoreInSeries - a.averageBattingScoreInSeries);
    return { success: true, rankings, message: "Batting rankings generated." };
  } catch (error) { console.error("Error in getBattingRankingsForSeriesAction:", error); const message = error instanceof Error ? error.message : "An unexpected error occurred."; return { success: false, error: message }; }
}

interface BowlingRankingsResult {
  success: boolean;
  rankings?: RankedBowler[];
  error?: string;
  message?: string;
}
export async function getBowlingRankingsForSeriesAction(seriesId: string): Promise<BowlingRankingsResult> {
  try {
    const series = await getSeriesByIdFromDB(seriesId); if (!series) return { success: false, error: "Series not found." }; if (series.status === 'archived') return { success: false, error: "Cannot get rankings for an archived series." };
    const gamesInSeries = await getGamesForSeriesFromDBFunction(seriesId); if (gamesInSeries.length === 0) return { success: true, rankings: [], message: "No games found in this series to rank players." }; const gameIdsInSeries = gamesInSeries.map(g => g.id);
    const teamsInSeries = await getTeamsForSeriesFromDB(seriesId); const playerIdsInSeriesSet = new Set<string>(); teamsInSeries.forEach(team => team.playerIds.forEach(pid => playerIdsInSeriesSet.add(pid)));
    if (playerIdsInSeriesSet.size === 0) return { success: true, rankings: [], message: "No players found in the teams participating in this series." }; const playersDetailsList = await getPlayersFromIds(Array.from(playerIdsInSeriesSet));
    const allPlayerRatingsForSeries: PlayerRating[] = []; const playerIdsArray = Array.from(playerIdsInSeriesSet);
    for (let i = 0; i < playerIdsArray.length; i += 30) { const playerChunk = playerIdsArray.slice(i, i + 30); if (playerChunk.length > 0) { const ratingsQuery = query(collection(db, 'playerRatings'), where('playerId', 'in', playerChunk)); const ratingsSnapshot = await getDocs(ratingsQuery); ratingsSnapshot.forEach(docSnap => { const rating = { id: docSnap.id, ...docSnap.data() } as PlayerRating; if (gameIdsInSeries.includes(rating.gameId)) allPlayerRatingsForSeries.push(rating); }); }}
    const rankings: RankedBowler[] = [];
    for (const player of playersDetailsList) {
      const playerRatingsInSeries = allPlayerRatingsForSeries.filter(r => r.playerId === player.id); if (playerRatingsInSeries.length === 0) continue;
      const bowlingScores = playerRatingsInSeries.map(r => ratingValueToNumber(r.bowling)).filter(score => score !== null) as number[]; if (bowlingScores.length === 0) continue;
      const sumOfScores = bowlingScores.reduce((acc, score) => acc + score, 0); const averageBowlingScoreInSeries = parseFloat((sumOfScores / bowlingScores.length).toFixed(1)); const gamesPlayedInSeries = new Set(playerRatingsInSeries.map(r => r.gameId)).size;
      rankings.push({ id: player.id, name: player.name, avatarUrl: player.avatarUrl, dominantHandBowling: player.dominantHandBowling, bowlingStyle: player.bowlingStyle, gamesPlayedInSeries, averageBowlingScoreInSeries, });
    }
    rankings.sort((a, b) => b.averageBowlingScoreInSeries - a.averageBowlingScoreInSeries);
    return { success: true, rankings, message: "Bowling rankings generated." };
  } catch (error) { console.error("Error in getBowlingRankingsForSeriesAction:", error); const message = error instanceof Error ? error.message : "An unexpected error occurred while fetching bowling rankings."; return { success: false, error: message }; }
}

interface WicketKeepingRankingsResult {
  success: boolean;
  rankings?: RankedWicketKeeper[];
  error?: string;
  message?: string;
}
export async function getWicketKeepingRankingsForSeriesAction(seriesId: string): Promise<WicketKeepingRankingsResult> {
  try {
    const series = await getSeriesByIdFromDB(seriesId); if (!series) return { success: false, error: "Series not found." }; if (series.status === 'archived') return { success: false, error: "Cannot get rankings for an archived series." };
    const gamesInSeries = await getGamesForSeriesFromDBFunction(seriesId); if (gamesInSeries.length === 0) return { success: true, rankings: [], message: "No games found in this series to rank players." }; const gameIdsInSeries = gamesInSeries.map(g => g.id);
    const teamsInSeries = await getTeamsForSeriesFromDB(seriesId); const playerIdsInSeriesSet = new Set<string>(); teamsInSeries.forEach(team => team.playerIds.forEach(pid => playerIdsInSeriesSet.add(pid)));
    if (playerIdsInSeriesSet.size === 0) return { success: true, rankings: [], message: "No players found in the teams participating in this series." };
    const allPlayersInSeriesTeams = await getPlayersFromIds(Array.from(playerIdsInSeriesSet)); const wicketKeepersInSeries = allPlayersInSeriesTeams.filter(p => p.primarySkill === 'Wicket Keeping');
    if (wicketKeepersInSeries.length === 0) return { success: true, rankings: [], message: "No players with primary skill 'Wicket Keeper' found in this series." };
    const wicketKeeperPlayerIds = wicketKeepersInSeries.map(p => p.id); const allPlayerRatingsForSeries: PlayerRating[] = [];
    for (let i = 0; i < wicketKeeperPlayerIds.length; i += 30) { const playerChunk = wicketKeeperPlayerIds.slice(i, i + 30); if (playerChunk.length > 0) { const ratingsQuery = query(collection(db, 'playerRatings'), where('playerId', 'in', playerChunk)); const ratingsSnapshot = await getDocs(ratingsQuery); ratingsSnapshot.forEach(docSnap => { const rating = { id: docSnap.id, ...docSnap.data() } as PlayerRating; if (gameIdsInSeries.includes(rating.gameId)) allPlayerRatingsForSeries.push(rating); }); }}
    const rankings: RankedWicketKeeper[] = [];
    for (const player of wicketKeepersInSeries) {
      const playerRatingsInSeries = allPlayerRatingsForSeries.filter(r => r.playerId === player.id); if (playerRatingsInSeries.length === 0) continue;
      const wicketKeepingScores = playerRatingsInSeries.map(r => ratingValueToNumber(r.wicketKeeping)).filter(score => score !== null) as number[]; if (wicketKeepingScores.length === 0) continue;
      const sumOfScores = wicketKeepingScores.reduce((acc, score) => acc + score, 0); const averageWicketKeepingScoreInSeries = parseFloat((sumOfScores / wicketKeepingScores.length).toFixed(1)); const gamesPlayedInSeries = new Set(playerRatingsInSeries.map(r => r.gameId)).size;
      rankings.push({ id: player.id, name: player.name, avatarUrl: player.avatarUrl, gamesPlayedInSeries, averageWicketKeepingScoreInSeries, });
    }
    rankings.sort((a, b) => b.averageWicketKeepingScoreInSeries - a.averageWicketKeepingScoreInSeries);
    return { success: true, rankings, message: "Wicket Keeping rankings generated." };
  } catch (error) { console.error("Error in getWicketKeepingRankingsForSeriesAction:", error); const message = error instanceof Error ? error.message : "An unexpected error occurred while fetching Wicket Keeping rankings."; return { success: false, error: message }; }
}

interface FieldingRankingsResult { success: boolean; rankings?: RankedFielder[]; error?: string; message?: string; }
export async function getFieldingRankingsForSeriesAction(seriesId: string): Promise<FieldingRankingsResult> {
  try {
    const series = await getSeriesByIdFromDB(seriesId); if (!series) return { success: false, error: "Series not found." }; if (series.status === 'archived') return { success: false, error: "Cannot get rankings for an archived series." };
    const gamesInSeries = await getGamesForSeriesFromDBFunction(seriesId); if (gamesInSeries.length === 0) return { success: true, rankings: [], message: "No games found in this series to rank players." }; const gameIdsInSeries = gamesInSeries.map(g => g.id);
    const teamsInSeries = await getTeamsForSeriesFromDB(seriesId); const playerIdsInSeriesSet = new Set<string>(); teamsInSeries.forEach(team => team.playerIds.forEach(pid => playerIdsInSeriesSet.add(pid)));
    if (playerIdsInSeriesSet.size === 0) return { success: true, rankings: [], message: "No players found in the teams participating in this series." }; const playersDetailsList = await getPlayersFromIds(Array.from(playerIdsInSeriesSet));
    const allPlayerRatingsForSeries: PlayerRating[] = []; const playerIdsArray = Array.from(playerIdsInSeriesSet);
    for (let i = 0; i < playerIdsArray.length; i += 30) { const playerChunk = playerIdsArray.slice(i, i + 30); if (playerChunk.length > 0) { const ratingsQuery = query(collection(db, 'playerRatings'), where('playerId', 'in', playerChunk)); const ratingsSnapshot = await getDocs(ratingsQuery); ratingsSnapshot.forEach(docSnap => { const rating = { id: docSnap.id, ...docSnap.data() } as PlayerRating; if (gameIdsInSeries.includes(rating.gameId)) allPlayerRatingsForSeries.push(rating); }); }}
    const rankings: RankedFielder[] = [];
    for (const player of playersDetailsList) {
      const playerRatingsInSeries = allPlayerRatingsForSeries.filter(r => r.playerId === player.id); if (playerRatingsInSeries.length === 0) continue;
      const fieldingScores = playerRatingsInSeries.map(r => ratingValueToNumber(r.fielding)).filter(score => score !== null) as number[]; if (fieldingScores.length === 0) continue;
      const sumOfScores = fieldingScores.reduce((acc, curr) => acc + curr, 0); const averageFieldingScoreInSeries = parseFloat((sumOfScores / fieldingScores.length).toFixed(1)); const gamesPlayedInSeries = new Set(playerRatingsInSeries.map(r => r.gameId)).size;
      rankings.push({ id: player.id, name: player.name, avatarUrl: player.avatarUrl, primarySkill: player.primarySkill, gamesPlayedInSeries, averageFieldingScoreInSeries, });
    }
    rankings.sort((a, b) => b.averageFieldingScoreInSeries - a.averageFieldingScoreInSeries);
    return { success: true, rankings, message: "Fielding rankings generated." };
  } catch (error) { console.error("Error in getFieldingRankingsForSeriesAction:", error); const message = error instanceof Error ? error.message : "An unexpected error occurred while fetching fielding rankings."; return { success: false, error: message }; }
}

interface UpdateSeriesFitnessCriteriaParams {
  fitnessTestType?: FitnessTestType;
  fitnessTestPassingScore?: string;
}
export async function updateSeriesFitnessCriteriaAction(
  seriesId: string,
  data: UpdateSeriesFitnessCriteriaParams
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const series = await getSeriesByIdFromDB(seriesId);
    if (!series) {
      return { success: false, error: "Series not found." };
    }
    if (series.status === 'archived') {
      return { success: false, error: "Cannot update fitness criteria for an archived series." };
    }

    const updatePayload: Partial<Pick<Series, 'fitnessTestType' | 'fitnessTestPassingScore'>> = {};

    if (data.fitnessTestType) {
      updatePayload.fitnessTestType = data.fitnessTestType;
      if (data.fitnessTestPassingScore && data.fitnessTestPassingScore.trim() !== "") {
        const score = parseFloat(data.fitnessTestPassingScore.trim());
        if (isNaN(score)) {
          return { success: false, error: "Passing score must be a valid number." };
        }
        updatePayload.fitnessTestPassingScore = data.fitnessTestPassingScore.trim();
      } else {
        // If type is set but score is not, this is an invalid state (should be caught by form/client validation ideally)
        // For safety, we can either clear both or return an error. Let's clear passing score if type is set but score is empty.
        updatePayload.fitnessTestPassingScore = undefined; // Will be handled by updateSeriesInDB to use deleteField
      }
    } else {
      // If fitnessTestType is not provided (e.g., "None" was selected), clear both fields.
      updatePayload.fitnessTestType = undefined; // Will be handled by updateSeriesInDB to use deleteField
      updatePayload.fitnessTestPassingScore = undefined; // Will be handled by updateSeriesInDB to use deleteField
    }
    
    await updateSeriesInDB(seriesId, updatePayload);
    return { success: true, message: "Fitness criteria updated successfully." };
  } catch (error) {
    console.error("Error in updateSeriesFitnessCriteriaAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, error: message };
  }
}

interface AllRounderRankingsResult {
  success: boolean;
  rankings?: RankedAllRounder[];
  error?: string;
  message?: string;
}

export async function getAllRounderRankingsForSeriesAction(seriesId: string): Promise<AllRounderRankingsResult> {
  try {
    const series = await getSeriesByIdFromDB(seriesId); if (!series) return { success: false, error: "Series not found." }; if (series.status === 'archived') return { success: false, error: "Cannot get rankings for an archived series." };
    const gamesInSeries = await getGamesForSeriesFromDBFunction(seriesId); if (gamesInSeries.length === 0) return { success: true, rankings: [], message: "No games found in this series to rank players." }; const gameIdsInSeries = gamesInSeries.map(g => g.id);
    const teamsInSeries = await getTeamsForSeriesFromDB(seriesId); const playerIdsInSeriesSet = new Set<string>(); teamsInSeries.forEach(team => team.playerIds.forEach(pid => playerIdsInSeriesSet.add(pid)));
    if (playerIdsInSeriesSet.size === 0) return { success: true, rankings: [], message: "No players found in the teams participating in this series." }; const playersDetailsList = await getPlayersFromIds(Array.from(playerIdsInSeriesSet));
    
    const allPlayerRatingsForSeries: PlayerRating[] = []; const playerIdsArray = Array.from(playerIdsInSeriesSet);
    for (let i = 0; i < playerIdsArray.length; i += 30) { 
        const playerChunk = playerIdsArray.slice(i, i + 30); 
        if (playerChunk.length > 0) { 
            const ratingsQuery = query(collection(db, 'playerRatings'), where('playerId', 'in', playerChunk)); 
            const ratingsSnapshot = await getDocs(ratingsQuery); 
            ratingsSnapshot.forEach(docSnap => { 
                const rating = { id: docSnap.id, ...docSnap.data() } as PlayerRating; 
                if (gameIdsInSeries.includes(rating.gameId)) allPlayerRatingsForSeries.push(rating); 
            }); 
        }
    }
    
    const rankings: RankedAllRounder[] = [];
    for (const player of playersDetailsList) {
      const playerRatingsInSeries = allPlayerRatingsForSeries.filter(r => r.playerId === player.id); if (playerRatingsInSeries.length === 0) continue;
      
      const battingScores = playerRatingsInSeries.map(r => ratingValueToNumber(r.batting)).filter(score => score !== null) as number[];
      const bowlingScores = playerRatingsInSeries.map(r => ratingValueToNumber(r.bowling)).filter(score => score !== null) as number[];
      
      // An all-rounder must have ratings for both skills
      if (battingScores.length === 0 || bowlingScores.length === 0) continue;

      const sumBatting = battingScores.reduce((acc, score) => acc + score, 0);
      const averageBattingScoreInSeries = parseFloat((sumBatting / battingScores.length).toFixed(1));

      const sumBowling = bowlingScores.reduce((acc, score) => acc + score, 0);
      const averageBowlingScoreInSeries = parseFloat((sumBowling / bowlingScores.length).toFixed(1));

      const averageAllRounderScore = parseFloat(((averageBattingScoreInSeries + averageBowlingScoreInSeries) / 2).toFixed(1));
      
      const gamesPlayedInSeries = new Set(playerRatingsInSeries.map(r => r.gameId)).size;

      rankings.push({ 
        id: player.id, 
        name: player.name, 
        avatarUrl: player.avatarUrl,
        gamesPlayedInSeries,
        averageBattingScoreInSeries,
        averageBowlingScoreInSeries,
        averageAllRounderScore,
      });
    }

    rankings.sort((a, b) => b.averageAllRounderScore - a.averageAllRounderScore);

    return { success: true, rankings, message: "All-Rounder rankings generated." };
  } catch (error) { 
    console.error("Error in getAllRounderRankingsForSeriesAction:", error); 
    const message = error instanceof Error ? error.message : "An unexpected error occurred."; 
    return { success: false, error: message }; 
  }
}

export async function saveAITeamToSeriesAction(seriesId: string, suggestedTeam: SuggestedTeam): Promise<{ success: boolean; error?: string }> {
  try {
    const seriesRef = doc(db, 'series', seriesId);
    await updateDoc(seriesRef, {
      savedAiTeam: suggestedTeam,
      savedAiTeamAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error in saveAITeamToSeriesAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred while saving the team.";
    return { success: false, error: message };
  }
}

export async function saveScorecardXIAction(
  seriesId: string,
  result: any,
  savedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    const seriesRef = doc(db, 'series', seriesId);
    await updateDoc(seriesRef, {
      savedScorecardXI: result,
      savedScorecardXIAt: serverTimestamp(),
      savedScorecardXIBy: savedBy,
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function clearScorecardXIAction(
  seriesId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { doc, updateDoc, deleteField } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    const seriesRef = doc(db, 'series', seriesId);
    await updateDoc(seriesRef, {
      savedScorecardXI: deleteField(),
      savedScorecardXIAt: deleteField(),
      savedScorecardXIBy: deleteField(),
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
