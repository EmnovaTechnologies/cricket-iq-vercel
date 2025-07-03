
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
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Team, Player, UserProfile, AgeCategory, GlobalPlayerSearchResult } from '../../types'; // Added AgeCategory
import {
  addTeamToDB,
  getTeamByIdFromDB,
  addPlayerToTeamInDB,
  getPlayerByIdFromDB,
  isPlayerAgeEligibleForTeamCategory,
  getOrganizationsByIdsFromDB,
} from '../db';
import { differenceInYears, parseISO, isValid } from 'date-fns';

// --- Team Actions ---
type AddTeamActionParams = Omit<Team, 'id' | 'playerIds'> & { teamManagerUids?: string[]; organizationId: string; };

export async function addTeamAction(teamData: AddTeamActionParams): Promise<Team> {
  const batch = writeBatch(db);
  try {
    // Ensure organizationId is present, as it's now required by addTeamToDB
    if (!teamData.organizationId) {
      throw new Error("Organization ID is required when adding a team.");
    }

    const newTeam = await addTeamToDB({
      name: teamData.name,
      clubName: teamData.clubName, // FIX: Pass clubName to the DB function
      ageCategory: teamData.ageCategory,
      organizationId: teamData.organizationId,
      teamManagerUids: teamData.teamManagerUids || [],
      // playerIds will be initialized as empty by addTeamToDB
    });

    // If team managers are provided, update their user profiles to include this team
    if (newTeam.teamManagerUids && newTeam.teamManagerUids.length > 0) {
      newTeam.teamManagerUids.forEach(managerUid => {
        const managerRef = doc(db, 'users', managerUid);
        // Assuming UserProfile has an 'assignedTeamIds' field
        batch.update(managerRef, { 
            assignedTeamIds: arrayUnion(newTeam.id),
            assignedOrganizationIds: arrayUnion(newTeam.organizationId)
        });
      });
    }
    await batch.commit();

    return newTeam;
  } catch (error) {
    console.error("Error in addTeamAction:", error);
    if (error instanceof Error) {
      // Re-throw the original error message or a more specific one
      throw new Error(error.message || "Failed to add team to the database.");
    }
    // Fallback for non-Error objects
    throw new Error("Failed to add team to the database due to an unexpected error.");
  }
}

export async function updateTeamManagersAction(teamId: string, newManagerUids: string[]): Promise<{ success: boolean; message: string }> {
  const batch = writeBatch(db);
  const teamRef = doc(db, 'teams', teamId);
  try {
    const teamSnap = await getDoc(teamRef);
    if (!teamSnap.exists()) {
      return { success: false, message: "Team not found." };
    }
    const teamData = teamSnap.data() as Team;
    const oldManagerUids = teamData.teamManagerUids || [];

    // Update the team document with the new list of manager UIDs
    batch.update(teamRef, { teamManagerUids: newManagerUids });

    // For users added as managers, add this teamId and the team's orgId to their assignments
    const managersToAdd = newManagerUids.filter(uid => !oldManagerUids.includes(uid));
    managersToAdd.forEach(uid => {
      const managerRef = doc(db, 'users', uid);
      batch.update(managerRef, { 
        assignedTeamIds: arrayUnion(teamId),
        assignedOrganizationIds: arrayUnion(teamData.organizationId)
      });
    });

    // For users removed as managers, remove this teamId from their assignedTeamIds
    const managersToRemove = oldManagerUids.filter(uid => !newManagerUids.includes(uid));
    managersToRemove.forEach(uid => {
      const managerRef = doc(db, 'users', uid);
      batch.update(managerRef, { assignedTeamIds: arrayRemove(teamId) });
    });

    await batch.commit();
    return { success: true, message: "Team managers updated successfully." };
  } catch (error) {
    console.error("Error in updateTeamManagersAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, message };
  }
}


export async function linkPlayerToTeamAction(playerId: string, teamId: string): Promise<{ success: boolean; message: string }> {
  try {
    const player = await getPlayerByIdFromDB(playerId);
    const team = await getTeamByIdFromDB(teamId);

    if (!player) {
      return { success: false, message: `Player with ID ${playerId} not found.` };
    }
    if (!team) {
      return { success: false, message: `Team with ID ${teamId} not found.` };
    }

    // Eligibility check for adding player to team based on team's age category
    // Assuming a general reference year like current year for this check.
    // For series-specific eligibility, that check happens when adding to a game/series roster.
    const isEligible = isPlayerAgeEligibleForTeamCategory(player, team.ageCategory, new Date().getFullYear());
    if (!isEligible) {
      return { success: false, message: `${player.name} is not age-eligible for ${team.name}'s ${team.ageCategory} category.` };
    }

    const success = await addPlayerToTeamInDB(playerId, teamId);

    if (success) {
      return { success: true, message: `${player.name} successfully added to ${team.name}.` };
    } else {
      // addPlayerToTeamInDB returns false if team not found, or could be expanded for other reasons
      return { success: false, message: `Failed to add ${player.name} to ${team.name}. Player might already be in the team.` };
    }
  } catch (error) {
    console.error("Error in linkPlayerToTeamAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, message };
  }
}

interface SearchGlobalPlayersResult {
  success: boolean;
  players: GlobalPlayerSearchResult[];
  message?: string;
  error?: string;
}

export async function searchGlobalPlayersAction(
  searchTerm: string,
  targetTeamAgeCategory: AgeCategory,
  currentTeamOrgId: string // The ID of the organization of the team we are viewing
): Promise<SearchGlobalPlayersResult> {
  const trimmedSearchTerm = searchTerm.trim();
  if (!trimmedSearchTerm) {
    return { success: true, players: [], message: "Search term is empty." };
  }
  if (!currentTeamOrgId) {
    return { success: false, players: [], error: "Current team organization ID is required for a global search." };
  }

  try {
    // Query by name tokens for partial match
    const nameQuery = query(
      collection(db, 'players'),
      where('searchableNameTokens', 'array-contains', trimmedSearchTerm.toLowerCase()),
      limit(20) // Limit results to avoid performance issues
    );

    // Query by CricClubs ID (exact match)
    const cricIdQuery = query(
      collection(db, 'players'),
      where('cricClubsId', '==', trimmedSearchTerm),
      limit(1)
    );

    const [nameSnapshot, cricIdSnapshot] = await Promise.all([
      getDocs(nameQuery),
      getDocs(cricIdQuery),
    ]);

    const foundPlayersMap = new Map<string, Player>();
    nameSnapshot.forEach(doc => {
      if (!foundPlayersMap.has(doc.id)) {
        foundPlayersMap.set(doc.id, { id: doc.id, ...doc.data() } as Player);
      }
    });
    cricIdSnapshot.forEach(doc => {
      if (!foundPlayersMap.has(doc.id)) {
        foundPlayersMap.set(doc.id, { id: doc.id, ...doc.data() } as Player);
      }
    });
    
    // Filter out players belonging to the current team's organization
    const foundPlayers = Array.from(foundPlayersMap.values()).filter(
      p => p.organizationId !== currentTeamOrgId
    );

    if (foundPlayers.length === 0) {
      return { success: true, players: [], message: "No players found matching the search term in other organizations." };
    }

    // Batch fetch organization names for the remaining (external) players
    const orgIds = [...new Set(foundPlayers.map(p => p.organizationId).filter(Boolean) as string[])];
    const orgs = orgIds.length > 0 ? await getOrganizationsByIdsFromDB(orgIds) : [];
    const orgNamesMap = new Map(orgs.map(org => [org.id, org.name]));
    
    const yearForEligibility = new Date().getFullYear();

    const searchResults: GlobalPlayerSearchResult[] = foundPlayers.map(player => {
      let age: number | undefined;
      if (player.dateOfBirth) {
        try {
          const dob = parseISO(player.dateOfBirth);
          if (isValid(dob)) {
            age = differenceInYears(new Date(), dob);
          }
        } catch (e) { /* ignore */ }
      }

      const isEligible = isPlayerAgeEligibleForTeamCategory(
        { dateOfBirth: player.dateOfBirth, gender: player.gender },
        targetTeamAgeCategory,
        yearForEligibility
      );

      return {
        id: player.id,
        name: player.name,
        cricClubsId: player.cricClubsId,
        age: age,
        primarySkill: player.primarySkill,
        avatarUrl: player.avatarUrl,
        organizationId: player.organizationId,
        organizationName: player.organizationId ? orgNamesMap.get(player.organizationId) || 'Unknown Org' : 'No Org Assigned',
        isEligible: isEligible,
      };
    });

    return {
      success: true,
      players: searchResults.sort((a,b) => a.name.localeCompare(b.name)),
      message: `${searchResults.length} player(s) found.`,
    };

  } catch (error) {
    console.error("Error in searchGlobalPlayersAction:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { success: false, players: [], error: message };
  }
}
