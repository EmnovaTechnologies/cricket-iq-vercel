
import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  arrayUnion,
  arrayRemove,
  Timestamp,
  orderBy,
  QueryConstraint,
  limit,
  serverTimestamp,
  deleteField,
  setDoc, 
} from 'firebase/firestore';
import { db } from './firebase';
import type { Player, Game, PlayerRating, Team, Series, Venue, AgeCategory, PlayerWithRatings, RatingValue, Gender, BattingOrder, BowlingStyle, DominantHand, PrimarySkill, UserProfile, Organization, OrganizationStatus, OrganizationBranding, PredefinedThemeName, VenueStatus, FitnessTestType, FitnessTestHeader, FitnessTestResult, UserRole, PermissionKey } from '../../types';
import { differenceInYears, parseISO, isValid, format } from 'date-fns';

export const ratingValueToNumber = (value?: RatingValue): number | null => {
  if (value === undefined || value === 'Not Rated' || value === 'Not Applicable' || value === 'NR') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

// Helper function to safely convert a Firestore Timestamp or an ISO string to an ISO string
const safeToISOString = (dateValue: Timestamp | string | Date | undefined | null): string | null => {
  if (!dateValue) return null;
  if (dateValue instanceof Timestamp) {
    return dateValue.toDate().toISOString();
  }
  if (dateValue instanceof Date) { 
    return dateValue.toISOString();
  }
  if (typeof dateValue === 'string') {
    try {
      return new Date(dateValue).toISOString();
    } catch (e) {
      console.warn(`safeToISOString received potentially invalid date string: ${dateValue}`);
      return dateValue.includes('T') && dateValue.endsWith('Z') ? dateValue : null;
    }
  }
  return null;
};


// --- Organization Functions ---
// `addOrganizationToDB` and `updateOrganizationInDB` are removed.
// The logic is now handled client-side in `organization-form.tsx`
// to ensure file uploads and database writes happen with proper authentication.

export async function getAllOrganizationsFromDB(): Promise<Organization[]> {
  const orgsCol = collection(db, 'organizations');
  const orgSnapshot = await getDocs(query(orgsCol, orderBy('name')));
  return orgSnapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      name: data.name.trim(),
      clubs: data.clubs || [], // Explicitly map clubs
      createdAt: safeToISOString(data.createdAt as Timestamp | string),
    } as Organization;
  });
}

export async function getOrganizationByIdFromDB(id: string): Promise<Organization | undefined> {
  if (!id) return undefined;
  const orgDocRef = doc(db, 'organizations', id);
  const orgSnap = await getDoc(orgDocRef);
  if (orgSnap.exists()) {
    const data = orgSnap.data();
    return {
      id: orgSnap.id,
      ...data,
      name: data.name.trim(),
      clubs: data.clubs || [], // Explicitly map clubs
      createdAt: safeToISOString(data.createdAt as Timestamp | string),
    } as Organization;
  }
  return undefined;
}

export async function getOrganizationsByIdsFromDB(orgIds: string[]): Promise<Organization[]> {
  if (!orgIds || orgIds.length === 0) return [];
  const organizations: Organization[] = [];
  for (let i = 0; i < orgIds.length; i += 30) {
    const chunk = orgIds.slice(i, i + 30);
    if (chunk.length > 0) {
      const orgsQuery = query(collection(db, 'organizations'), where('__name__', 'in', chunk));
      const orgSnapshot = await getDocs(orgsQuery);
      orgSnapshot.docs.forEach(docSnapshot => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          organizations.push({
            id: docSnapshot.id,
            ...data,
            name: data.name.trim(),
            clubs: data.clubs || [], // Explicitly map clubs
            createdAt: safeToISOString(data.createdAt as Timestamp | string),
          } as Organization);
        }
      });
    }
  }
  return organizations.sort((a, b) => a.name.localeCompare(b.name));
}


// --- User Profile Functions ---
export async function getUserProfileFromDB(uid: string): Promise<UserProfile | null> {
  if (!uid) return null;
  try {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      const createdAtTimestamp = data.createdAt as Timestamp | undefined;
      const lastLoginTimestamp = data.lastLogin as Timestamp | undefined;

      const assignedOrganizationIds = data.assignedOrganizationIds || [];
      const activeOrganizationId = data.activeOrganizationId || null;
      
      let playerId: string | null = null;
      if (data.roles?.includes('player')) {
        const playerQuery = query(collection(db, 'players'), where('userId', '==', uid), limit(1));
        const playerSnapshot = await getDocs(playerQuery);
        if (!playerSnapshot.empty) {
          playerId = playerSnapshot.docs[0].id;
        }
      }

      return {
        uid: data.uid,
        email: data.email,
        displayName: data.displayName || null,
        roles: data.roles || ['unassigned'],
        activeOrganizationId: activeOrganizationId,
        assignedOrganizationIds: assignedOrganizationIds,
        assignedSeriesIds: data.assignedSeriesIds || [],
        assignedTeamIds: data.assignedTeamIds || [],
        assignedGameIds: data.assignedGameIds || [],
        createdAt: createdAtTimestamp?.toDate?.().toISOString() || null,
        lastLogin: lastLoginTimestamp?.toDate?.().toISOString() || null,
        phoneNumber: data.phoneNumber || null,
        playerId: playerId,
      };
    }
    return null;
  } catch (error) {
    console.error(`[getUserProfileFromDB] Error fetching user profile for UID ${uid}:`, error);
    return null;
  }
}

export async function getAllUsersFromDB(): Promise<UserProfile[]> {
  const usersCol = collection(db, 'users');
  // Removed orderBy('displayName') to avoid needing a composite index for queries that filter on 'roles'
  const userSnapshot = await getDocs(query(usersCol));
  const users: UserProfile[] = [];
  userSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    const createdAtTimestamp = data.createdAt as Timestamp | undefined;
    const lastLoginTimestamp = data.lastLogin as Timestamp | undefined;
    users.push({
      uid: data.uid,
      email: data.email || null,
      displayName: data.displayName || null,
      roles: data.roles || ['unassigned'],
      activeOrganizationId: data.activeOrganizationId || null,
      assignedOrganizationIds: data.assignedOrganizationIds || [],
      assignedSeriesIds: data.assignedSeriesIds || [],
      assignedTeamIds: data.assignedTeamIds || [], 
      assignedGameIds: data.assignedGameIds || [],
      createdAt: createdAtTimestamp?.toDate?.().toISOString() || null,
      lastLogin: lastLoginTimestamp?.toDate?.().toISOString() || null,
      phoneNumber: data.phoneNumber || null,
    });
  });
  // Perform sorting in the code instead of the database query
  return users.sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
}

export async function getUsersForOrgAdminViewFromDB(organizationId: string): Promise<UserProfile[]> {
  const usersQuery = query(
    collection(db, 'users'),
    where('assignedOrganizationIds', 'array-contains', organizationId)
  );
  const userSnapshot = await getDocs(usersQuery);
  const allUsersInOrg: UserProfile[] = [];
  userSnapshot.forEach(docSnap => {
    const data = docSnap.data();
    const createdAtTimestamp = data.createdAt as Timestamp | undefined;
    const lastLoginTimestamp = data.lastLogin as Timestamp | undefined;
    allUsersInOrg.push({
      uid: data.uid,
      email: data.email || null,
      displayName: data.displayName || null,
      roles: data.roles || ['unassigned'],
      activeOrganizationId: data.activeOrganizationId || null,
      assignedOrganizationIds: data.assignedOrganizationIds || [],
      assignedSeriesIds: data.assignedSeriesIds || [],
      assignedTeamIds: data.assignedTeamIds || [],
      assignedGameIds: data.assignedGameIds || [],
      createdAt: createdAtTimestamp?.toDate?.().toISOString() || null,
      lastLogin: lastLoginTimestamp?.toDate?.().toISOString() || null,
      phoneNumber: data.phoneNumber || null,
    });
  });

  const filteredUsers = allUsersInOrg.filter(user => !user.roles.includes('admin'));

  return filteredUsers.sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
}


// --- Player Functions ---
export async function getAllPlayersFromDB(organizationId?: string): Promise<Player[]> {
  const playersCol = collection(db, 'players');
  const queryConstraints: QueryConstraint[] = [];
  if (organizationId) {
    queryConstraints.unshift(where('organizationId', '==', organizationId));
  }
  // Remove sorting from the DB query to avoid index issues. It's handled client-side where needed or after fetch.
  const playerSnapshot = await getDocs(query(playersCol, ...queryConstraints));
  const players = playerSnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as Player));
  return players.sort((a,b) => a.name.localeCompare(b.name));
}


export async function getPlayerByIdFromDB(id: string): Promise<Player | undefined> {
  if (!id) return undefined;
  const playerDocRef = doc(db, 'players', id);
  const playerSnap = await getDoc(playerDocRef);
  if (playerSnap.exists()) {
    return { id: playerSnap.id, ...playerSnap.data() } as Player;
  }
  return undefined;
}

export async function getPlayerByCricClubsIdFromDB(cricClubsId: string): Promise<Player | undefined> {
  if (!cricClubsId || cricClubsId.trim() === "") return undefined;
  const playersQuery = query(collection(db, 'players'), where('cricClubsId', '==', cricClubsId.trim()), limit(1));
  const snapshot = await getDocs(playersQuery);
  if (!snapshot.empty) {
    const docSnapshot = snapshot.docs[0];
    return { id: docSnapshot.id, ...docSnapshot.data() } as Player;
  }
  return undefined;
}

export async function getPlayersFromIds(playerIds: string[]): Promise<Player[]> {
  if (!playerIds || playerIds.length === 0) return [];
  const players: Player[] = [];
  for (let i = 0; i < playerIds.length; i += 30) {
    const chunk = playerIds.slice(i, i + 30);
    if (chunk.length > 0) {
      const playersQuery = query(collection(db, 'players'), where('__name__', 'in', chunk));
      const playerSnapshot = await getDocs(playersQuery);
      playerSnapshot.docs.forEach(docSnapshot => {
        if (docSnapshot.exists()) {
          players.push({ id: docSnapshot.id, ...docSnapshot.data() } as Player);
        }
      });
    }
  }
  return players;
}


export async function checkCricClubsIdExists(cricClubsId: string, excludePlayerId?: string): Promise<boolean> {
  if (!cricClubsId) return false;
  const q = query(collection(db, 'players'), where('cricClubsId', '==', cricClubsId.trim()), limit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return false;
  // If we are excluding an ID (i.e., during an update), check if the found doc is the one we're excluding
  if (excludePlayerId && snapshot.docs[0].id === excludePlayerId) {
    return false;
  }
  return true;
}

export async function addPlayerToDB(playerData: Omit<Player, 'id' | 'gamesPlayed'> & { organizationId?: string }): Promise<Player> {
  const dataToSave: { [key: string]: any } = {
    ...playerData,
    name: playerData.name.trim(), 
    cricClubsId: playerData.cricClubsId.trim(), 
    organizationId: playerData.organizationId, 
  };

  Object.keys(dataToSave).forEach(key => {
    if (dataToSave[key] === undefined) {
      delete dataToSave[key];
    }
  });

  const playerRef = await addDoc(collection(db, 'players'), {
    ...dataToSave,
    gamesPlayed: 0,
  });
  return { id: playerRef.id, ...playerData, name: dataToSave.name, cricClubsId: dataToSave.cricClubsId, gamesPlayed: 0 };
}


export async function updatePlayerInDB(id: string, playerData: Partial<Omit<Player, 'id'>>): Promise<void> {
  const playerDocRef = doc(db, 'players', id);
  const dataToUpdate: { [key: string]: any } = { ...playerData };
  if (dataToUpdate.name) dataToUpdate.name = dataToUpdate.name.trim();
  if (dataToUpdate.cricClubsId) dataToUpdate.cricClubsId = dataToUpdate.cricClubsId.trim();

  // Handle potential undefined values which Firestore doesn't like
  Object.keys(dataToUpdate).forEach(key => {
    if (dataToUpdate[key] === undefined) {
      dataToUpdate[key] = deleteField();
    }
  });

  await updateDoc(playerDocRef, dataToUpdate);
}

export async function deletePlayerFromDB(id: string): Promise<void> {
  const playerDocRef = doc(db, 'players', id);
  await deleteDoc(playerDocRef);
}


// --- Team Functions ---
export async function getAllTeamsFromDB(organizationId?: string): Promise<Team[]> {
  const teamsCol = collection(db, 'teams');
  const queryConstraints: QueryConstraint[] = [orderBy('name')];
  if (organizationId) {
    queryConstraints.unshift(where('organizationId', '==', organizationId));
  }
  const teamSnapshot = await getDocs(query(teamsCol, ...queryConstraints));
  return teamSnapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      name: data.name.trim(),
      clubName: data.clubName || 'N/A', // Add default
      teamManagerUids: data.teamManagerUids || [],
    } as Team;
  });
}

export async function getTeamByIdFromDB(id: string): Promise<Team | undefined> {
  if (!id) return undefined;
  const teamDocRef = doc(db, 'teams', id);
  const teamSnap = await getDoc(teamDocRef);
  if (teamSnap.exists()) {
    const data = teamSnap.data();
    return {
      id: teamSnap.id,
      ...data,
      name: data.name.trim(),
      clubName: data.clubName || 'N/A', // Add default
      teamManagerUids: data.teamManagerUids || [],
    } as Team;
  }
  return undefined;
}

export async function getTeamByNameFromDB(name: string, organizationId?: string): Promise<Team | undefined> {
  if (!name || name.trim() === "") return undefined;
  const trimmedName = name.trim();
  const queryConstraints: QueryConstraint[] = [where('name', '==', trimmedName), limit(1)];
  if (organizationId) {
    queryConstraints.push(where('organizationId', '==', organizationId));
  }
  const teamsQuery = query(collection(db, 'teams'), ...queryConstraints);
  const teamSnapshot = await getDocs(teamsQuery);
  if (!teamSnapshot.empty) {
    const docSnapshot = teamSnapshot.docs[0];
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      name: data.name.trim(),
      clubName: data.clubName || 'N/A', // Add default
      teamManagerUids: data.teamManagerUids || [],
    } as Team;
  }
  return undefined;
}

export async function addTeamToDB(teamData: Omit<Team, 'id' | 'playerIds'> & { organizationId: string }): Promise<Team> {
  if (!teamData.organizationId) {
    throw new Error("Organization ID is required to create a team.");
  }
  const dataToSave: Team = {
    ...teamData,
    name: teamData.name.trim(), 
    id: '',
    playerIds: [],
    teamManagerUids: teamData.teamManagerUids || [],
  };
  delete (dataToSave as any).id;

  const teamRef = await addDoc(collection(db, 'teams'), dataToSave);
  return { ...dataToSave, id: teamRef.id };
}

export async function updateTeamInDB(id: string, teamData: Partial<Omit<Team, 'id'>>): Promise<void> {
  const teamDocRef = doc(db, 'teams', id);
  const dataToUpdate: { [key: string]: any } = { ...teamData };
  if (dataToUpdate.name) dataToUpdate.name = dataToUpdate.name.trim();
  await updateDoc(teamDocRef, dataToUpdate);
}

export async function addPlayerToTeamInDB(playerId: string, teamId: string): Promise<boolean> {
  const teamRef = doc(db, 'teams', teamId);
  const teamSnap = await getDoc(teamRef);
  if (!teamSnap.exists()) return false;

  const playerRef = doc(db, 'players', playerId);
  const playerSnap = await getDoc(playerRef);
  if (!playerSnap.exists()) return false;
  
  const batch = writeBatch(db);
  batch.update(teamRef, {
    playerIds: arrayUnion(playerId)
  });
  batch.update(playerRef, {
    primaryTeamId: teamId
  });
  await batch.commit();
  return true;
}

export async function removePlayerFromTeamInDB(playerId: string, teamId: string): Promise<boolean> {
  const teamRef = doc(db, 'teams', teamId);
  const teamSnap = await getDoc(teamRef);
  if (!teamSnap.exists()) return false;

  await updateDoc(teamRef, {
    playerIds: arrayRemove(playerId)
  });
  return true;
}

export async function getPlayersForTeamFromDB(teamId: string): Promise<Player[]> {
  const team = await getTeamByIdFromDB(teamId);
  if (!team || !team.playerIds || team.playerIds.length === 0) return [];

  const players: Player[] = [];
  for (let i = 0; i < team.playerIds.length; i += 30) {
    const chunk = team.playerIds.slice(i, i + 30);
    if (chunk.length > 0) {
      const playersQuery = query(collection(db, 'players'), where('__name__', 'in', chunk));
      const playerSnapshot = await getDocs(playersQuery);
      playerSnapshot.docs.forEach(docSnapshot => {
        players.push({ id: docSnapshot.id, ...docSnapshot.data() } as Player);
      });
    }
  }
  return players.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeamsByAgeCategoryFromDB(ageCategory: AgeCategory, organizationId?: string): Promise<Team[]> {
  const queryConstraints: QueryConstraint[] = [where('ageCategory', '==', ageCategory), orderBy('name')];
  if (organizationId) {
    queryConstraints.push(where('organizationId', '==', organizationId));
  }
  const teamsQuery = query(collection(db, 'teams'), ...queryConstraints);
  const teamSnapshot = await getDocs(teamsQuery);
  return teamSnapshot.docs.map(docSnapshot => {
     const data = docSnapshot.data();
     return {
      id: docSnapshot.id,
      ...data,
      name: data.name.trim(),
      clubName: data.clubName || 'N/A', // Add default
      teamManagerUids: data.teamManagerUids || [],
    } as Team;
  });
}


// --- Series Functions ---
export async function getAllSeriesFromDB(status?: Series['status'] | 'all', organizationId?: string): Promise<Series[]> {
  const seriesCol = collection(db, 'series');
  const queryConstraints: QueryConstraint[] = [orderBy('year', 'desc'), orderBy('name')];

  if (organizationId) {
    queryConstraints.unshift(where('organizationId', '==', organizationId));
  }
  if (status && status !== 'all') {
    queryConstraints.unshift(where('status', '==', status));
  }

  const seriesSnapshot = await getDocs(query(seriesCol, ...queryConstraints));
  return seriesSnapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      name: data.name.trim(),
      participatingTeams: data.participatingTeams || [],
      venueIds: data.venueIds || [],
      seriesAdminUids: data.seriesAdminUids || [],
      status: data.status || 'active',
      maleCutoffDate: data.maleCutoffDate || null,
      femaleCutoffDate: data.femaleCutoffDate || null,
      fitnessTestType: data.fitnessTestType || undefined,
      fitnessTestPassingScore: data.fitnessTestPassingScore || undefined,
      createdAt: safeToISOString(data.createdAt as Timestamp | string),
    } as Series;
  });
}

export async function getSeriesByIdFromDB(id: string): Promise<Series | undefined> {
  if (!id) return undefined;
  const seriesDocRef = doc(db, 'series', id);
  const seriesSnap = await getDoc(seriesDocRef);
  if (seriesSnap.exists()) {
    const data = seriesSnap.data();
    return {
      id: seriesSnap.id,
      ...data,
      name: data.name.trim(),
      participatingTeams: data.participatingTeams || [],
      venueIds: data.venueIds || [],
      seriesAdminUids: data.seriesAdminUids || [],
      status: data.status || 'active',
      maleCutoffDate: data.maleCutoffDate || null,
      femaleCutoffDate: data.femaleCutoffDate || null,
      fitnessTestType: data.fitnessTestType || undefined,
      fitnessTestPassingScore: data.fitnessTestPassingScore || undefined,
      createdAt: safeToISOString(data.createdAt as Timestamp | string),
    } as Series;
  }
  return undefined;
}

export async function getSeriesByNameFromDB(name: string, organizationId: string): Promise<Series | undefined> {
  if (!name || name.trim() === "" || !organizationId) return undefined;
  const trimmedName = name.trim();
  const queryConstraints: QueryConstraint[] = [
    where('name', '==', trimmedName),
    where('organizationId', '==', organizationId),
    limit(1)
  ];

  const seriesQuery = query(collection(db, 'series'), ...queryConstraints);
  const seriesSnapshot = await getDocs(seriesQuery);
  if (!seriesSnapshot.empty) {
    const docSnapshot = seriesSnapshot.docs[0];
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      name: data.name.trim(),
      participatingTeams: data.participatingTeams || [],
      venueIds: data.venueIds || [],
      seriesAdminUids: data.seriesAdminUids || [],
      status: data.status || 'active',
      maleCutoffDate: data.maleCutoffDate || null,
      femaleCutoffDate: data.femaleCutoffDate || null,
      fitnessTestType: data.fitnessTestType || undefined,
      fitnessTestPassingScore: data.fitnessTestPassingScore || undefined,
      createdAt: safeToISOString(data.createdAt as Timestamp | string),
    } as Series;
  }
  return undefined;
}


export async function addSeriesToDB(
  seriesData: Omit<Series, 'id' | 'createdAt' | 'participatingTeams' | 'venueIds' | 'status'> & { organizationId: string }
): Promise<Series> {
  if (!seriesData.organizationId) {
    throw new Error("Organization ID is required to create a series.");
  }

  const baseData: Omit<Series, 'id' | 'createdAt' | 'participatingTeams' | 'venueIds' | 'status'> = {
    name: seriesData.name.trim(),
    ageCategory: seriesData.ageCategory,
    year: seriesData.year,
    organizationId: seriesData.organizationId,
    seriesAdminUids: seriesData.seriesAdminUids || [],
    maleCutoffDate: seriesData.maleCutoffDate || null,
    femaleCutoffDate: seriesData.femaleCutoffDate || null,
  };

  const firestoreDocData: { [key: string]: any } = {
    ...baseData,
    participatingTeams: [],
    venueIds: [],
    status: 'active',
    createdAt: Timestamp.now(),
  };

  if (seriesData.fitnessTestType) {
    firestoreDocData.fitnessTestType = seriesData.fitnessTestType;
  }
  if (seriesData.fitnessTestPassingScore && seriesData.fitnessTestPassingScore.trim() !== "") {
    firestoreDocData.fitnessTestPassingScore = seriesData.fitnessTestPassingScore.trim();
  }


  const seriesRef = await addDoc(collection(db, 'series'), firestoreDocData);

  const newSeriesObject: Series = {
    ...baseData,
    id: seriesRef.id,
    participatingTeams: [],
    venueIds: [],
    status: 'active',
    createdAt: (firestoreDocData.createdAt as Timestamp).toDate().toISOString(),
  };

  if (firestoreDocData.fitnessTestType) {
    newSeriesObject.fitnessTestType = firestoreDocData.fitnessTestType;
  }
  if (firestoreDocData.fitnessTestPassingScore) {
    newSeriesObject.fitnessTestPassingScore = firestoreDocData.fitnessTestPassingScore;
  }

  return newSeriesObject;
}


export async function updateSeriesInDB(id: string, seriesData: Partial<Omit<Series, 'id'>>): Promise<void> {
  const seriesDocRef = doc(db, 'series', id);
  const dataToUpdate: { [key: string]: any } = { ...seriesData };
  if (dataToUpdate.name) dataToUpdate.name = dataToUpdate.name.trim();

  if (seriesData.hasOwnProperty('fitnessTestType')) {
    dataToUpdate.fitnessTestType = seriesData.fitnessTestType ? seriesData.fitnessTestType : deleteField();
  }

  if (seriesData.hasOwnProperty('fitnessTestPassingScore')) {
    dataToUpdate.fitnessTestPassingScore = (seriesData.fitnessTestPassingScore && seriesData.fitnessTestPassingScore.trim() !== "")
      ? seriesData.fitnessTestPassingScore.trim()
      : deleteField();
  }

  await updateDoc(seriesDocRef, dataToUpdate);
}

export async function addTeamToSeriesInDB(teamId: string, seriesId: string): Promise<boolean> {
  const seriesRef = doc(db, 'series', seriesId);
  const seriesSnap = await getDoc(seriesRef);
  if (!seriesSnap.exists()) return false;
  const seriesData = seriesSnap.data() as Series;
  if (seriesData.status === 'archived') return false;

  const teamRef = doc(db, 'teams', teamId);
  const teamSnap = await getDoc(teamRef);
  if (!teamSnap.exists()) return false;
  const teamData = teamSnap.data() as Team;

  if (seriesData.organizationId !== teamData.organizationId) {
    console.warn(`Team ${teamData.name} (org: ${teamData.organizationId}) cannot be added to series ${seriesData.name} (org: ${seriesData.organizationId}) due to organization mismatch.`);
    return false;
  }

  if (!seriesData.maleCutoffDate && !seriesData.femaleCutoffDate) {
    if (seriesData.ageCategory !== teamData.ageCategory) {
      console.warn(`Team ${teamData.name} age category ${teamData.ageCategory} does not match series ${seriesData.name} age category ${seriesData.ageCategory}, and series has no explicit cutoff dates.`);
      return false;
    }
  }

  await updateDoc(seriesRef, {
    participatingTeams: arrayUnion(teamId)
  });
  return true;
}

export async function getTeamsForSeriesFromDB(seriesId: string): Promise<Team[]> {
  const series = await getSeriesByIdFromDB(seriesId);
  if (!series || !series.participatingTeams || series.participatingTeams.length === 0 || series.status === 'archived') return [];

  const teams: Team[] = [];
  for (let i = 0; i < series.participatingTeams.length; i += 30) {
    const chunk = series.participatingTeams.slice(i, i + 30);
    if (chunk.length > 0) {
      const teamsQuery = query(collection(db, 'teams'), where('__name__', 'in', chunk), where('organizationId', '==', series.organizationId));
      const teamSnapshot = await getDocs(teamsQuery);
      teamSnapshot.docs.forEach(docSnapshot => {
        const data = docSnapshot.data();
        teams.push({
          id: docSnapshot.id,
          ...data,
          name: data.name.trim(),
          clubName: data.clubName || 'N/A', // Add default
          teamManagerUids: data.teamManagerUids || [],
        } as Team);
      });
    }
  }
  return teams.sort((a,b) => a.name.localeCompare(b.name));
}

export async function addVenueToSeriesInDB(venueId: string, seriesId: string): Promise<boolean> {
    const seriesRef = doc(db, 'series', seriesId);
    const seriesSnap = await getDoc(seriesRef);
    if (!seriesSnap.exists()) return false;
    const seriesData = seriesSnap.data() as Series;
    if (seriesData.status === 'archived') return false;

    const venueRef = doc(db, 'venues', venueId);
    const venueSnap = await getDoc(venueRef);
    if (!venueSnap.exists()) return false;
    const venueData = venueSnap.data() as Venue;

    if (seriesData.organizationId !== venueData.organizationId) {
      console.warn(`Venue ${venueData.name} (org: ${venueData.organizationId}) cannot be added to series ${seriesData.name} (org: ${seriesData.organizationId}) due to organization mismatch.`);
      return false;
    }
    const venueStatus = venueData.status || 'active'; 
    if (venueStatus !== 'active') {
        console.warn(`Venue ${venueData.name} is not active and cannot be added to series ${seriesData.name}.`);
        return false;
    }

    await updateDoc(seriesRef, {
        venueIds: arrayUnion(venueId)
    });
    return true;
}

export async function getVenuesForSeriesFromDB(seriesId: string): Promise<Venue[]> {
    const series = await getSeriesByIdFromDB(seriesId);
    if (!series || !series.venueIds || series.venueIds.length === 0) return [];

    const venues: Venue[] = [];
    for (let i = 0; i < series.venueIds.length; i += 30) {
        const chunk = series.venueIds.slice(i, i + 30);
        if (chunk.length > 0) {
            const venuesQuery = query(collection(db, 'venues'), where('__name__', 'in', chunk), where('organizationId', '==', series.organizationId));
            const venueSnapshot = await getDocs(venuesQuery);
            venueSnapshot.docs.forEach(docSnapshot => {
                const data = docSnapshot.data();
                const status = data.status || 'active'; 
                if (status === 'active') {
                    venues.push({ id: docSnapshot.id, ...data, status } as Venue);
                }
            });
        }
    }
    return venues.sort((a,b) => a.name.localeCompare(b.name));
}

// --- Game Functions ---
export async function getAllGamesFromDB(statusFilter?: Game['status'] | 'all', organizationId?: string): Promise<Game[]> {
  const gamesCol = collection(db, 'games');
  const queryConstraints: QueryConstraint[] = [orderBy('date', 'desc')];

  if (organizationId) {
      queryConstraints.unshift(where('organizationId', '==', organizationId));
  }

  const gameSnapshot = await getDocs(query(gamesCol, ...queryConstraints));

  const gamesWithSeriesNamesAndStatus = await Promise.all(
    gameSnapshot.docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();
      let seriesName: string | undefined = undefined;
      let gameIsEffectivelyArchived = data.status === 'archived';

      let series: Series | undefined;
      if (data.seriesId) {
        series = await getSeriesByIdFromDB(data.seriesId as string);
        seriesName = series?.name;
        if (series?.status === 'archived') {
          gameIsEffectivelyArchived = true;
        }
      }

      if (statusFilter === 'active' && gameIsEffectivelyArchived) {
        return null;
      }
      if (statusFilter === 'archived' && !gameIsEffectivelyArchived) {
        return null;
      }

      if (organizationId && series && series.organizationId !== organizationId) {
        return null;
      }

      return {
          id: docSnapshot.id,
          ...data,
          date: safeToISOString(data.date as Timestamp | string),
          seriesName,
          organizationId: data.organizationId,
          selectorUserIds: data.selectorUserIds || [],
          status: gameIsEffectivelyArchived ? 'archived' : (data.status || 'active'),
          createdAt: safeToISOString(data.createdAt as Timestamp | string),
          ratingsLastModifiedAt: safeToISOString(data.ratingsLastModifiedAt as Timestamp | string),
          ratingsFinalizedAt: safeToISOString(data.ratingsFinalizedAt as Timestamp | string),
          selectorCertifications: data.selectorCertifications || {},
          ratingsFinalizedBy: data.ratingsFinalizedBy || null,
          ratingsFinalized: data.ratingsFinalized || false,
      } as Game;
    })
  );

  return gamesWithSeriesNamesAndStatus.filter(game => game !== null) as Game[];
}

export async function getGameByIdFromDB(id: string): Promise<Game | undefined> {
  if (!id) return undefined;
  const gameDocRef = doc(db, 'games', id);
  const gameSnap = await getDoc(gameDocRef);
  if (gameSnap.exists()) {
    const data = gameSnap.data();
    let seriesName: string | undefined = undefined;
    let gameStatus = data.status || 'active';
    let gameOrganizationId = data.organizationId;

    if (data.seriesId) {
        const series = await getSeriesByIdFromDB(data.seriesId as string);
        seriesName = series?.name;
        if (series?.status === 'archived') {
            gameStatus = 'archived';
        }
        if (series?.organizationId && !gameOrganizationId) {
            gameOrganizationId = series.organizationId;
        }
    }

    return {
        id: gameSnap.id,
        ...data,
        date: safeToISOString(data.date as Timestamp | string),
        seriesName,
        organizationId: gameOrganizationId,
        selectorUserIds: data.selectorUserIds || [],
        status: gameStatus,
        createdAt: safeToISOString(data.createdAt as Timestamp | string),
        selectorCertifications: data.selectorCertifications || {},
        ratingsLastModifiedAt: safeToISOString(data.ratingsLastModifiedAt as Timestamp | string),
        ratingsFinalizedAt: safeToISOString(data.ratingsFinalizedAt as Timestamp | string),
        ratingsFinalizedBy: data.ratingsFinalizedBy || null,
        ratingsFinalized: data.ratingsFinalized || false,
    } as Game;
  }
  return undefined;
}

export async function getGamesByIdsFromDB(gameIds: string[]): Promise<Game[]> {
  if (!gameIds || gameIds.length === 0) return [];

  const games: Game[] = [];
  for (let i = 0; i < gameIds.length; i += 30) {
    const chunk = gameIds.slice(i, i + 30);
    if (chunk.length > 0) {
      const gamesQuery = query(collection(db, 'games'), where('__name__', 'in', chunk));
      const gameSnapshot = await getDocs(gamesQuery);

      const chunkGames = await Promise.all(
        gameSnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          let seriesName: string | undefined = undefined;
          let gameStatus = data.status || 'active';
          let gameOrganizationId = data.organizationId;

          if (data.seriesId) {
            const series = await getSeriesByIdFromDB(data.seriesId as string);
            seriesName = series?.name;
            if (series?.status === 'archived') {
                gameStatus = 'archived';
            }
            if (series?.organizationId && !gameOrganizationId) {
                gameOrganizationId = series.organizationId;
            }
          }

          return {
              id: docSnapshot.id,
              ...data,
              date: safeToISOString(data.date as Timestamp | string),
              seriesName,
              organizationId: gameOrganizationId,
              selectorUserIds: data.selectorUserIds || [],
              status: gameStatus,
              createdAt: safeToISOString(data.createdAt as Timestamp | string),
              selectorCertifications: data.selectorCertifications || {},
              ratingsLastModifiedAt: safeToISOString(data.ratingsLastModifiedAt as Timestamp | string),
              ratingsFinalizedAt: safeToISOString(data.ratingsFinalizedAt as Timestamp | string),
              ratingsFinalizedBy: data.ratingsFinalizedBy || null,
              ratingsFinalized: data.ratingsFinalized || false,
          } as Game;
        })
      );
      games.push(...chunkGames.filter(game => game !== null) as Game[]);
    }
  }
  return games;
}


export async function addGameToDB(gameData: Omit<Game, 'id' | 'seriesName' | 'status' | 'createdAt'> & { seriesId: string, organizationId: string }): Promise<Game> {
  const series = await getSeriesByIdFromDB(gameData.seriesId);
  if (!series) {
    throw new Error("Series not found to associate with the game.");
  }
  if (series.organizationId !== gameData.organizationId) {
      throw new Error("Game's organizationId does not match its series' organizationId.");
  }

  const gamePayload: Omit<Game, 'id' | 'seriesName' | 'createdAt'> = {
    ...gameData,
    date: gameData.date,
    team1: gameData.team1.trim(),
    team2: gameData.team2.trim(),
    venue: gameData.venue.trim(),
    team1Players: gameData.team1Players || [],
    team2Players: gameData.team2Players || [],
    selectorUserIds: gameData.selectorUserIds || [],
    status: 'active' as Game['status'],
    selectorCertifications: {},
    ratingsFinalized: false,
  };
  const gameRef = await addDoc(collection(db, 'games'), { ...gamePayload, createdAt: Timestamp.now() });
  return { id: gameRef.id, ...gamePayload, seriesName: series.name, createdAt: new Date().toISOString() };
}

export async function updateGameInDB(id: string, gameData: Partial<Omit<Game, 'id'| 'seriesName' | 'createdAt'>>): Promise<void> {
  const gameDocRef = doc(db, 'games', id);
  const dataToUpdate: Record<string, any> = { ...gameData };
  if (dataToUpdate.team1) dataToUpdate.team1 = dataToUpdate.team1.trim();
  if (dataToUpdate.team2) dataToUpdate.team2 = dataToUpdate.team2.trim();
  if (dataToUpdate.venue) dataToUpdate.venue = dataToUpdate.venue.trim();

  if (gameData.date && typeof gameData.date !== 'string' && isValid(gameData.date)) {
    dataToUpdate.date = gameData.date.toISOString();
  }
  if (gameData.ratingsLastModifiedAt && typeof gameData.ratingsLastModifiedAt !== 'string' && (gameData.ratingsLastModifiedAt as any) instanceof Timestamp) {
    dataToUpdate.ratingsLastModifiedAt = (gameData.ratingsLastModifiedAt as unknown as Timestamp).toDate().toISOString();
  }
   if (gameData.ratingsFinalizedAt && typeof gameData.ratingsFinalizedAt !== 'string' && (gameData.ratingsFinalizedAt as any) instanceof Timestamp) {
    dataToUpdate.ratingsFinalizedAt = (gameData.ratingsFinalizedAt as unknown as Timestamp).toDate().toISOString();
  }

  await updateDoc(gameDocRef, dataToUpdate);
}


export async function getGamesForSeriesFromDB(seriesId: string): Promise<Game[]> {
  const series = await getSeriesByIdFromDB(seriesId);
  if (!series) return [];

  const queryConstraints: QueryConstraint[] = [
    where('seriesId', '==', seriesId),
    orderBy('date', 'desc')
  ];
  if (series.organizationId) {
      queryConstraints.unshift(where('organizationId', '==', series.organizationId));
  }

  if (series.status === 'archived') {
    return [];
  }

  const gamesQuery = query(collection(db, 'games'), ...queryConstraints);
  const gameSnapshot = await getDocs(gamesQuery);
  const seriesName = series.name.trim();
  const seriesOrgId = series.organizationId;

  const games = gameSnapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    const gameStatus = data.status === 'archived' ? 'archived' : 'active';

    return {
        id: docSnapshot.id,
        ...data,
        date: safeToISOString(data.date as Timestamp | string),
        seriesName,
        organizationId: data.organizationId || seriesOrgId,
        selectorUserIds: data.selectorUserIds || [],
        status: gameStatus,
        createdAt: safeToISOString(data.createdAt as Timestamp | string),
        selectorCertifications: data.selectorCertifications || {},
        ratingsLastModifiedAt: safeToISOString(data.ratingsLastModifiedAt as Timestamp | string),
        ratingsFinalizedAt: safeToISOString(data.ratingsFinalizedAt as Timestamp | string),
        ratingsFinalizedBy: data.ratingsFinalizedBy || null,
        ratingsFinalized: data.ratingsFinalized || false,
    } as Game;
  });
  return games.filter(g => g.status === 'active');
}


export async function addPlayerToGameRosterInDB(gameId: string, playerId: string, teamIdentifier: 'team1' | 'team2'): Promise<boolean> {
    const gameRef = doc(db, 'games', gameId);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) return false;
    const gameData = gameSnap.data() as Game;

    let seriesArchived = false;
    if (gameData.seriesId) {
        const series = await getSeriesByIdFromDB(gameData.seriesId);
        if (series?.status === 'archived') seriesArchived = true;
    }
    if (gameData.status === 'archived' || seriesArchived) return false;

    const updateData = teamIdentifier === 'team1'
        ? { team1Players: arrayUnion(playerId) }
        : { team2Players: arrayUnion(playerId) };

    await updateDoc(gameRef, updateData);
    return true;
}


// --- Player Rating Functions ---
export async function getRatingsForGameFromDB(gameId: string): Promise<PlayerRating[]> {
  const ratingsQuery = query(collection(db, 'playerRatings'), where('gameId', '==', gameId));
  const ratingSnapshot = await getDocs(ratingsQuery);
  const ratings: PlayerRating[] = [];

  if (ratingSnapshot.empty) {
    return [];
  }

  const gameData = await getGameByIdFromDB(gameId); 
  let seriesName: string | undefined;
  if (gameData?.seriesId) {
    const seriesData = await getSeriesByIdFromDB(gameData.seriesId);
    seriesName = seriesData?.name;
  }
  const gameName = gameData ? `${gameData.team1} vs ${gameData.team2} on ${format(parseISO(safeToISOString(gameData.date as Timestamp | string)!), 'PP')}` : 'Unknown Game';


  ratingSnapshot.docs.forEach(docSnapshot => {
    const data = docSnapshot.data();
    ratings.push({
      id: docSnapshot.id,
      ...data,
      gameName,
      seriesName,
    } as PlayerRating);
  });
  return ratings;
}

export async function getRatingsForPlayerFromDB(playerId: string): Promise<PlayerRating[]> {
  const ratingsQuery = query(collection(db, 'playerRatings'), where('playerId', '==', playerId));
  const ratingSnapshot = await getDocs(ratingsQuery);
  const ratings: PlayerRating[] = [];

  if (ratingSnapshot.empty) {
    return [];
  }

  const gameIds = new Set<string>();
  ratingSnapshot.docs.forEach(docSnapshot => {
    const data = docSnapshot.data();
    if (data.gameId) {
      gameIds.add(data.gameId);
    }
    ratings.push({ id: docSnapshot.id, ...data } as PlayerRating);
  });

  if (gameIds.size === 0) {
    return ratings;
  }

  const gameDetailsMap = new Map<string, { name: string, seriesId?: string }>();
  const gameDocsPromises = Array.from(gameIds).map(gameId => getDoc(doc(db, 'games', gameId)));
  const gameDocsSnaps = await Promise.all(gameDocsPromises);

  const seriesIdsToFetch = new Set<string>();
  gameDocsSnaps.forEach(gameSnap => {
    if (gameSnap.exists()) {
      const gameData = gameSnap.data() as Game;
      const gameDateStr = safeToISOString(gameData.date as Timestamp | string);
      const gameDate = gameDateStr ? format(parseISO(gameDateStr), 'PP') : 'Unknown Date';
      gameDetailsMap.set(gameSnap.id, {
        name: `${gameData.team1} vs ${gameData.team2} on ${gameDate}`,
        seriesId: gameData.seriesId,
      });
      if (gameData.seriesId) {
        seriesIdsToFetch.add(gameData.seriesId);
      }
    }
  });

  const seriesNameMap = new Map<string, string>();
  if (seriesIdsToFetch.size > 0) {
    const seriesDocsPromises = Array.from(seriesIdsToFetch).map(seriesId => getDoc(doc(db, 'series', seriesId)));
    const seriesDocsSnaps = await Promise.all(seriesDocsPromises);
    seriesDocsSnaps.forEach(seriesSnap => {
      if (seriesSnap.exists()) {
        const seriesData = seriesSnap.data() as Series;
        seriesNameMap.set(seriesSnap.id, seriesData.name);
      }
    });
  }

  return ratings.map(rating => {
    const gameInfo = gameDetailsMap.get(rating.gameId);
    const seriesName = gameInfo?.seriesId ? seriesNameMap.get(gameInfo.seriesId) : undefined;
    return {
      ...rating,
      gameName: gameInfo?.name,
      seriesName: seriesName,
    };
  });
}


export async function saveGameRatingsToDB(
  gameId: string,
  ratingsData: Record<string, Partial<Omit<PlayerRating, 'id' | 'gameId' | 'playerId'>>>,
  currentSavingUserId?: string | null,
  skipTimestampAndReset: boolean = false
): Promise<void> {
  const gameDocRef = doc(db, 'games', gameId);
  const gameSnap = await getDoc(gameDocRef);

  if (!gameSnap.exists()) {
    console.error('[db.ts saveGameRatingsToDB] Game not found for gameId:', gameId);
    throw new Error("Game not found.");
  }
  const currentGameData = gameSnap.data() as Game;

  if (!currentGameData || !currentGameData.organizationId) {
    console.error('[db.ts saveGameRatingsToDB] Critical error: Game data or game organizationId is missing. GameId:', gameId, 'Game Data:', currentGameData);
    throw new Error("Cannot save ratings: Game data or organization ID is missing.");
  }

  if (currentGameData.status === 'archived') {
    console.error('[db.ts saveGameRatingsToDB] Attempt to save ratings for archived game/series. GameId:', gameId);
    throw new Error("Cannot save ratings for an archived game or a game in an archived series.");
  }
  if (currentGameData.ratingsFinalized) {
    console.error('[db.ts saveGameRatingsToDB] Attempt to save ratings for a finalized game. GameId:', gameId);
    throw new Error("Ratings for this game have been finalized and cannot be changed.");
  }


  const batch = writeBatch(db);
  const ratingsCol = collection(db, 'playerRatings');

  for (const [playerId, playerSpecificRating] of Object.entries(ratingsData)) {
    const existingRatingQuery = query(ratingsCol, where('gameId', '==', gameId), where('playerId', '==', playerId), limit(1));
    const existingRatingSnap = await getDocs(existingRatingQuery);

    let existingRatingData: Partial<PlayerRating> = {};
    if (!existingRatingSnap.empty) {
        existingRatingData = existingRatingSnap.docs[0].data() as PlayerRating;
    }

    const ratingDocForFirestore: { [key: string]: any } = {
      gameId,
      playerId,
      organizationId: currentGameData.organizationId,
    };

    if (playerSpecificRating.batting !== undefined) ratingDocForFirestore.batting = playerSpecificRating.batting;
    if (playerSpecificRating.bowling !== undefined) ratingDocForFirestore.bowling = playerSpecificRating.bowling;
    if (playerSpecificRating.fielding !== undefined) ratingDocForFirestore.fielding = playerSpecificRating.fielding;
    if (playerSpecificRating.wicketKeeping !== undefined) ratingDocForFirestore.wicketKeeping = playerSpecificRating.wicketKeeping;

    if (currentSavingUserId) {
      const commentFieldMapKeys: Array<keyof Pick<PlayerRating, 'battingComments' | 'bowlingComments' | 'fieldingComments' | 'wicketKeepingComments'>> = ['battingComments', 'bowlingComments', 'fieldingComments', 'wicketKeepingComments'];
      const formCommentFieldKeys: Array<keyof typeof playerSpecificRating> = ['battingComment', 'bowlingComment', 'fieldingComment', 'wicketKeepingComment'];

      for (let i = 0; i < commentFieldMapKeys.length; i++) {
        const firestoreMapKey = commentFieldMapKeys[i];
        const formKey = formCommentFieldKeys[i];

        const newCommentText = playerSpecificRating[formKey] as string | undefined;
        let updatedCommentMap = { ...(existingRatingData[firestoreMapKey] || {}) } as { [uid: string]: string };

        if (newCommentText === "") {
            delete updatedCommentMap[currentSavingUserId];
        } else if (newCommentText && newCommentText.trim() !== "") {
            updatedCommentMap[currentSavingUserId] = newCommentText.trim();
        }
        ratingDocForFirestore[firestoreMapKey] = updatedCommentMap;
      }
    }

    Object.keys(ratingDocForFirestore).forEach(key => {
      if (ratingDocForFirestore[key] === undefined && !key.endsWith('Comments')) {
        delete ratingDocForFirestore[key];
      }
    });

    if (!existingRatingSnap.empty) {
      const existingRatingDocId = existingRatingSnap.docs[0].id;
      const ratingRef = doc(db, 'playerRatings', existingRatingDocId);
      batch.set(ratingRef, ratingDocForFirestore, { merge: true });
    } else {
      const newRatingRef = doc(ratingsCol);
      batch.set(newRatingRef, ratingDocForFirestore);
    }
  }

  const gameUpdates: Record<string, any> = {};
  if (!skipTimestampAndReset) {
    gameUpdates.ratingsLastModifiedAt = serverTimestamp();
    gameUpdates.ratingsLastModifiedBy = currentSavingUserId || null;

    const updatedSelectorCertifications = { ...(currentGameData.selectorCertifications || {}) };
    let certificationsChangedDueToReset = false;

    (currentGameData.selectorUserIds || []).forEach(selectorUid => {
      if (selectorUid !== currentSavingUserId) {
        const currentCert = updatedSelectorCertifications[selectorUid];
        if (currentCert && currentCert.status === 'certified') {
          updatedSelectorCertifications[selectorUid] = {
            ...currentCert,
            status: 'pending',
          };
          certificationsChangedDueToReset = true;
        }
      }
    });
    if (certificationsChangedDueToReset) {
      gameUpdates.selectorCertifications = updatedSelectorCertifications;
    }
  }

  if (Object.keys(gameUpdates).length > 0) {
    batch.update(gameDocRef, gameUpdates);
  }

  try {
    await batch.commit();
  } catch (error) {
    console.error('[db.ts saveGameRatingsToDB] Error committing batch:', error);
    throw error;
  }
}


// --- Combined Data Fetching (like getPlayersWithDetails) ---
export async function getPlayersWithDetailsFromDB(organizationId?: string): Promise<PlayerWithRatings[]> {
  let players: Player[] = [];
  const playerToTeamRosterMap = new Map<string, string>();
  const teamNameMap = new Map<string, string>();

  if (organizationId) {
    // 1. Fetch native players
    const nativePlayersQuery = query(collection(db, 'players'), where('organizationId', '==', organizationId));
    const nativePlayersSnapshot = await getDocs(nativePlayersQuery);
    const nativePlayers: Player[] = nativePlayersSnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as Player));
    const nativePlayerIds = new Set(nativePlayers.map(p => p.id));
    console.log(`[DB getPlayersWithDetailsFromDB] Found ${nativePlayers.length} native players for org ${organizationId}.`);

    // 2. Fetch teams within the organization
    const orgTeamsQuery = query(collection(db, 'teams'), where('organizationId', '==', organizationId));
    const orgTeamsSnapshot = await getDocs(orgTeamsQuery);
    const orgTeams = orgTeamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));

    // 3. Collect all player IDs from these teams' rosters
    const allRosteredPlayerIdsInOrg = new Set<string>();
    orgTeams.forEach(team => {
      teamNameMap.set(team.id, team.name); // Populate teamNameMap for primaryTeamName lookup
      (team.playerIds || []).forEach(pid => {
        allRosteredPlayerIdsInOrg.add(pid);
        if (!playerToTeamRosterMap.has(pid)) { // For currentTeamName, just pick one if they're on multiple
            playerToTeamRosterMap.set(pid, team.name);
        }
      });
    });
    console.log(`[DB getPlayersWithDetailsFromDB] Found ${allRosteredPlayerIdsInOrg.size} unique player IDs across all team rosters in org ${organizationId}.`);

    // 4. Identify guest player IDs
    const guestPlayerIdsToFetch = Array.from(allRosteredPlayerIdsInOrg).filter(pid => !nativePlayerIds.has(pid));
    console.log(`[DB getPlayersWithDetailsFromDB] Identified ${guestPlayerIdsToFetch.length} guest player IDs to fetch for org ${organizationId}.`);
    
    let guestPlayers: Player[] = [];
    if (guestPlayerIdsToFetch.length > 0) {
      console.log(`[DB getPlayersWithDetailsFromDB] Fetching details for ${guestPlayerIdsToFetch.length} guest players...`);
      guestPlayers = await getPlayersFromIds(guestPlayerIdsToFetch); // Reusing existing chunked fetch function
      console.log(`[DB getPlayersWithDetailsFromDB] Fetched ${guestPlayers.length} guest player details.`);
    }
    
    // 5. Combine native and guest players
    players = [...nativePlayers, ...guestPlayers];
    // Deduplicate (though ideally guestPlayerIdsToFetch already handles this by design)
    const uniquePlayerMap = new Map<string, Player>();
    players.forEach(p => uniquePlayerMap.set(p.id, p));
    players = Array.from(uniquePlayerMap.values());
    console.log(`[DB getPlayersWithDetailsFromDB] Total unique players (native + guest) for org ${organizationId}: ${players.length}`);

  } else { // No specific organizationId, fetch all players globally
    console.log('[DB getPlayersWithDetailsFromDB] No organizationId provided. Fetching all players globally.');
    players = await getAllPlayersFromDB(); // This already sorts by name
    const allTeams = await getAllTeamsFromDB(); // Fetch all teams to build team maps for global context
     allTeams.forEach(team => {
        teamNameMap.set(team.id, team.name);
        (team.playerIds || []).forEach(playerId => {
            if (!playerToTeamRosterMap.has(playerId)) {
                playerToTeamRosterMap.set(playerId, team.name);
            }
        });
    });
    console.log(`[DB getPlayersWithDetailsFromDB] Fetched ${players.length} global players.`);
  }
  
  players.sort((a, b) => a.name.localeCompare(b.name));


  const allGamesList = await getAllGamesFromDB('all', organizationId);
  const gameMap = new Map(allGamesList.map(game => [game.id, game]));

  const allSeriesList = await getAllSeriesFromDB('all', organizationId);
  const seriesMap = new Map(allSeriesList.map(series => [series.id, series]));

  const ratingsCol = collection(db, 'playerRatings');
  const ratingsQueryConstraints: QueryConstraint[] = [];
  if (organizationId) {
    ratingsQueryConstraints.push(where('organizationId', '==', organizationId));
  }
  const allRatingsDocs = await getDocs(query(ratingsCol, ...ratingsQueryConstraints));

  const allRatings: PlayerRating[] = [];
  allRatingsDocs.docs.forEach(d => {
    const ratingData = d.data();
    if (gameMap.has(ratingData.gameId)) { // Ensure rating is for a game within the org context
        allRatings.push({ id: d.id, ...ratingData } as PlayerRating);
    }
  });

  const enrichedAllRatings = allRatings.map(rating => {
    const game = gameMap.get(rating.gameId);
    let gameName: string | undefined;
    let seriesName: string | undefined;

    if (game) {
      const gameDateStr = safeToISOString(game.date as Timestamp | string);
      const gameDate = gameDateStr ? format(parseISO(gameDateStr), 'PP') : 'Unknown Date';
      gameName = `${game.team1} vs ${game.team2} on ${gameDate}`;
      if (game.seriesId) {
        const series = seriesMap.get(game.seriesId);
        seriesName = series?.name;
      }
    }
    return { ...rating, gameName, seriesName };
  });

  const ratingsByPlayerId = new Map<string, PlayerRating[]>();
  enrichedAllRatings.forEach(r => {
    const current = ratingsByPlayerId.get(r.playerId) || [];
    current.push(r);
    ratingsByPlayerId.set(r.playerId, current);
  });

  return players.map(player => {
    const playerRatings = ratingsByPlayerId.get(player.id) || [];

    const calculateAverage = (skillKey: keyof Pick<PlayerRating, 'batting' | 'bowling' | 'fielding' | 'wicketKeeping'>) => {
      const numericScores = playerRatings
        .map(r => ratingValueToNumber(r[skillKey]))
        .filter(score => score !== null) as number[];
      if (numericScores.length === 0) return 'N/A';
      const sum = numericScores.reduce((acc, curr) => acc + curr, 0);
      return parseFloat((sum / numericScores.length).toFixed(1));
    };

    const avgBatting = calculateAverage('batting');
    const avgBowling = calculateAverage('bowling');
    const avgFielding = calculateAverage('fielding');
    const avgWicketKeeping = calculateAverage('wicketKeeping');

    let calculatedAverageScore = 0;
    const primarySkillNumericScores = playerRatings.map(r => {
        let skillValue: RatingValue | undefined;
        switch (player.primarySkill) {
            case 'Batting': skillValue = r.batting; break;
            case 'Bowling': skillValue = r.bowling; break;
            case 'Wicket Keeping': skillValue = r.wicketKeeping; break;
            default: skillValue = 'Not Rated';
        }
        return ratingValueToNumber(skillValue);
    }).filter(score => score !== null) as number[];

    if (primarySkillNumericScores.length > 0) {
        const sum = primarySkillNumericScores.reduce((acc, curr) => acc + curr, 0);
        calculatedAverageScore = parseFloat((sum / primarySkillNumericScores.length).toFixed(1));
    }

    let age: number | undefined = undefined;
    if (player.dateOfBirth) {
        try {
            const dob = parseISO(player.dateOfBirth);
            if (isValid(dob)) {
                age = differenceInYears(new Date(), dob);
            }
        } catch (e) { /* ignore */ }
    }

    const gamesPlayed = new Set(playerRatings.map(r => r.gameId)).size;
    const primaryTeamName = player.primaryTeamId ? teamNameMap.get(player.primaryTeamId) : undefined;
    const currentTeamName = playerToTeamRosterMap.get(player.id);


    return {
      ...player,
      gamesPlayed,
      ratings: playerRatings,
      averageBattingScore: avgBatting,
      averageBowlingScore: avgBowling,
      averageFieldingScore: avgFielding,
      averageWicketKeepingScore: avgWicketKeeping,
      calculatedAverageScore: calculatedAverageScore,
      age: age,
      primaryTeamName: primaryTeamName,
      currentTeamName: currentTeamName,
    };
  });
}

export async function getPlayerWithDetailsByIdFromDB(playerId: string): Promise<PlayerWithRatings | undefined> {
  const player = await getPlayerByIdFromDB(playerId);
  if (!player) return undefined;

  const playerRatings = await getRatingsForPlayerFromDB(playerId); 

  let primaryTeamName: string | undefined = undefined;
  if (player.primaryTeamId) {
    const team = await getTeamByIdFromDB(player.primaryTeamId);
    primaryTeamName = team?.name;
  }

  let currentTeamName: string | undefined = undefined;
  const teamsQuery = query(collection(db, 'teams'), where('playerIds', 'array-contains', playerId), limit(1));
  const teamSnapshot = await getDocs(teamsQuery);
  if (!teamSnapshot.empty) {
    currentTeamName = teamSnapshot.docs[0].data().name as string;
  }


  const calculateAverage = (skillKey: keyof Pick<PlayerRating, 'batting' | 'bowling' | 'fielding' | 'wicketKeeping'>) => {
      const numericScores = playerRatings
        .map(r => ratingValueToNumber(r[skillKey]))
        .filter(score => score !== null) as number[];
      if (numericScores.length === 0) return 'N/A';
      const sum = numericScores.reduce((acc, curr) => acc + curr, 0);
      return parseFloat((sum / numericScores.length).toFixed(1));
  };

  const avgBatting = calculateAverage('batting');
  const avgBowling = calculateAverage('bowling');
  const avgFielding = calculateAverage('fielding');
  const avgWicketKeeping = calculateAverage('wicketKeeping');

  let calculatedAverageScore = 0;
    const primarySkillNumericScores = playerRatings.map(r => {
        let skillValue: RatingValue | undefined;
        switch (player.primarySkill) {
            case 'Batting': skillValue = r.batting; break;
            case 'Bowling': skillValue = r.bowling; break;
            case 'Wicket Keeping': skillValue = r.wicketKeeping; break;
            default: skillValue = 'Not Rated';
        }
        return ratingValueToNumber(skillValue);
    }).filter(score => score !== null) as number[];

    if (primarySkillNumericScores.length > 0) {
        const sum = primarySkillNumericScores.reduce((acc, curr) => acc + curr, 0);
        calculatedAverageScore = parseFloat((sum / primarySkillNumericScores.length).toFixed(1));
    }

  let age: number | undefined = undefined;
  if (player.dateOfBirth) {
      try {
          const dob = parseISO(player.dateOfBirth);
          if (isValid(dob)) {
              age = differenceInYears(new Date(), dob);
          }
      } catch (e) { /* ignore */ }
  }

  const gamesPlayed = new Set(playerRatings.map(r => r.gameId)).size;

  return {
    ...player,
    gamesPlayed,
    ratings: playerRatings, 
    averageBattingScore: avgBatting,
    averageBowlingScore: avgBowling,
    averageFieldingScore: avgFielding,
    averageWicketKeepingScore: avgWicketKeeping,
    calculatedAverageScore: calculatedAverageScore,
    age: age,
    primaryTeamName: primaryTeamName,
    currentTeamName: currentTeamName,
  };
}

// --- Eligibility & Availability ---

export const getNumericAgeLimitFromCategory = (ageCategory?: AgeCategory): number | null => {
  if (!ageCategory) return null;
  const match = ageCategory.match(/Under (\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

function calculateAgeOnReferenceDate(
  playerDateOfBirth: string,
  referenceYear: number
): number | null {
  try {
    const playerDOB = parseISO(playerDateOfBirth);
    if (!isValid(playerDOB)) {
      console.warn(`[calculateAgeOnReferenceDate] Invalid player DOB: ${playerDateOfBirth}`);
      return null;
    }
    const referenceDate = new Date(referenceYear, 7, 31); 
    return differenceInYears(referenceDate, playerDOB);
  } catch(e) {
    console.error("[calculateAgeOnReferenceDate] Error calculating age on reference date:", e);
    return null;
  }
}


export function isPlayerAgeEligibleForTeamCategory(
  player: Pick<Player, 'dateOfBirth' | 'gender'>,
  teamAgeCategory: AgeCategory,
  referenceYear: number
): boolean {
  if (!player.dateOfBirth || !player.gender || !teamAgeCategory) {
    return false;
  }
  const ageOnRefDate = calculateAgeOnReferenceDate(player.dateOfBirth, referenceYear);
  if (ageOnRefDate === null) return false;

  const numericAgeLimit = getNumericAgeLimitFromCategory(teamAgeCategory);
  if (numericAgeLimit === null) return false;

  let effectiveNumericAgeLimit = numericAgeLimit;
  const relaxationFactor = 1; // Relax by 1 year

  if (player.gender === 'Female') {
    // Female players get a +2 year allowance on top of the category limit, then the relaxation.
    effectiveNumericAgeLimit = numericAgeLimit + 2 + relaxationFactor;
  } else {
    effectiveNumericAgeLimit = numericAgeLimit + relaxationFactor;
  }
  return ageOnRefDate < effectiveNumericAgeLimit;
}


export function isPlayerAgeEligibleForSeriesFromDB(player: Player, series: Series): boolean {
  if (!player.dateOfBirth || !player.gender) {
    console.warn(`Player ${player.name} missing DOB or Gender for series eligibility check.`);
    return false;
  }

  const playerDOB = parseISO(player.dateOfBirth);
  if (!isValid(playerDOB)) {
    console.warn(`Player ${player.name} has invalid DOB: ${player.dateOfBirth}`);
    return false;
  }

  let cutoffDateString: string | null | undefined = null;
  if (player.gender === 'Male') {
    cutoffDateString = series.maleCutoffDate;
  } else if (player.gender === 'Female') {
    cutoffDateString = series.femaleCutoffDate;
  }

  if (!cutoffDateString) {
    console.warn(`Series ${series.name} (${series.id}) has no explicit ${player.gender.toLowerCase()}CutoffDate. Falling back to category check for player ${player.name}.`);
    // Use the relaxed team category check if series cutoffs aren't defined
    return isPlayerAgeEligibleForTeamCategory(player, series.ageCategory, series.year);
  }

  try {
    const seriesCutoffDate = parseISO(cutoffDateString);
    if (!isValid(seriesCutoffDate)) {
        console.warn(`Series ${series.name} (${series.id}) has invalid ${player.gender.toLowerCase()}CutoffDate: ${cutoffDateString}. Cannot check eligibility for player ${player.name}.`);
        return false;
    }
    return playerDOB.getTime() >= seriesCutoffDate.getTime();
  } catch (e) {
    console.error(`Error parsing date for eligibility check. Player DOB: ${player.dateOfBirth}, Series Cutoff: ${cutoffDateString}`, e);
    return false;
  }
}

export async function getPlayersAvailableForGameFromDB(gameId: string): Promise<Player[]> {
  const game = await getGameByIdFromDB(gameId);
  if (!game || !game.seriesId || !game.organizationId) {
    console.warn(`[getPlayersAvailableForGameFromDB] Game not found, or missing seriesId/organizationId for gameId: ${gameId}`);
    return [];
  }
  if (game.status === 'archived') {
    console.log(`[getPlayersAvailableForGameFromDB] Game ${gameId} is archived. Returning no players.`);
    return [];
  }

  const series = await getSeriesByIdFromDB(game.seriesId);
  if (!series || series.status === 'archived') {
    console.log(`[getPlayersAvailableForGameFromDB] Series ${game.seriesId} for game ${gameId} not found or is archived. Returning no players.`);
    return [];
  }

  if (series.organizationId !== game.organizationId) {
    console.warn(`[getPlayersAvailableForGameFromDB] Mismatch: Game orgId (${game.organizationId}) vs Series orgId (${series.organizationId}). Returning no players.`);
    return [];
  }

  const allPlayersInSeriesOrg = await getAllPlayersFromDB(series.organizationId);
  if (allPlayersInSeriesOrg.length === 0) {
    console.log(`[getPlayersAvailableForGameFromDB] No players found in organization ${series.organizationId}.`);
    return [];
  }

  const seriesEligiblePlayers = allPlayersInSeriesOrg.filter(player =>
    player.dateOfBirth && player.gender && isPlayerAgeEligibleForSeriesFromDB(player, series)
  );

  const playersAlreadyInGame = new Set([
    ...(game.team1Players || []),
    ...(game.team2Players || []),
  ]);

  const finalAvailablePlayers = seriesEligiblePlayers.filter(player => !playersAlreadyInGame.has(player.id));

  return finalAvailablePlayers.sort((a, b) => a.name.localeCompare(b.name));
}


// --- Venue Functions ---
export async function getAllVenuesFromDB(organizationId?: string, status?: VenueStatus | 'all'): Promise<Venue[]> {
  const venuesCol = collection(db, 'venues');
  const queryConstraints: QueryConstraint[] = [orderBy('name')];
  if (organizationId) {
    queryConstraints.unshift(where('organizationId', '==', organizationId));
  }
  if (status && status !== 'all') {
    queryConstraints.unshift(where('status', '==', status));
  }
  const venueSnapshot = await getDocs(query(venuesCol, ...queryConstraints));
  return venueSnapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      name: data.name.trim(),
      status: data.status || 'active', // Default to active if status is missing
    } as Venue;
  });
}

export async function addVenueToDB(
  venueData: Omit<Venue, 'id' | 'createdAt'> & { organizationId: string }
): Promise<Venue> {
  if (!venueData.organizationId) {
    throw new Error("Organization ID is required to create a venue.");
  }

  const dataToSave: { [key: string]: any } = {
    name: venueData.name.trim(),
    address: venueData.address.trim(),
    organizationId: venueData.organizationId,
    status: venueData.status || 'active',
    createdAt: serverTimestamp(),
  };

  if (venueData.latitude !== undefined) dataToSave.latitude = venueData.latitude;
  if (venueData.longitude !== undefined) dataToSave.longitude = venueData.longitude;


  const venueRef = await addDoc(collection(db, 'venues'), dataToSave);
  const newDocSnap = await getDoc(venueRef);
  const newDocData = newDocSnap.data();

  const result: Venue = {
    id: venueRef.id,
    name: dataToSave.name,
    address: dataToSave.address,
    organizationId: dataToSave.organizationId,
    status: dataToSave.status,
  };
  if (dataToSave.latitude !== undefined) result.latitude = dataToSave.latitude;
  if (dataToSave.longitude !== undefined) result.longitude = dataToSave.longitude;

  return result;
}

export async function updateVenueInDB(id: string, venueData: Partial<Omit<Venue, 'id'>>): Promise<void> {
  const venueDocRef = doc(db, 'venues', id);
  await updateDoc(venueDocRef, venueData);
}

export async function getVenueByIdFromDB(id: string): Promise<Venue | undefined> {
  if (!id) return undefined;
  const venueDocRef = doc(db, 'venues', id);
  const venueSnap = await getDoc(venueDocRef);
  if (venueSnap.exists()) {
    const data = venueSnap.data();
    return {
      id: venueSnap.id,
      ...data,
      name: data.name.trim(),
      status: data.status || 'active', // Default to active if status is missing
    } as Venue;
  }
  return undefined;
}


// --- Fitness Test Functions ---
export async function addFitnessTestHeaderToDB(
  headerData: Omit<FitnessTestHeader, 'id' | 'createdAt' | 'isCertified'>
): Promise<FitnessTestHeader> {
  const series = await getSeriesByIdFromDB(headerData.seriesId);
  if (!series) {
    throw new Error("Series not found for the fitness test.");
  }
  if (!series.fitnessTestType || !series.fitnessTestPassingScore) {
    throw new Error(`The selected series "${series.name}" does not have fitness test criteria (type and passing score) defined. Please update the series criteria before recording fitness tests.`);
  }
  if (series.fitnessTestType !== headerData.testType) {
      throw new Error(`The fitness test type "${headerData.testType}" does not match the type "${series.fitnessTestType}" defined for the series "${series.name}".`);
  }
  if (series.status === 'archived') {
      throw new Error(`Cannot add fitness test for an archived series "${series.name}".`);
  }


  const dataToSave: Omit<FitnessTestHeader, 'id' | 'createdAt'> & { createdAt: Timestamp } = {
    ...headerData,
    testDate: Timestamp.fromDate(new Date(headerData.testDate)), 
    isCertified: false,
    createdAt: Timestamp.now(),
  };
  const headerRef = await addDoc(collection(db, 'fitnessTests'), dataToSave);
  return {
    id: headerRef.id,
    ...headerData,
    testDate: new Date(headerData.testDate).toISOString(), 
    isCertified: false,
    createdAt: (dataToSave.createdAt as Timestamp).toDate().toISOString(),
  };
}

export async function addFitnessTestResultsToDB(
  resultsData: Array<Omit<FitnessTestResult, 'id' | 'recordedAt'>>
): Promise<FitnessTestResult[]> {
  if (resultsData.length === 0) return [];

  const batch = writeBatch(db);
  const newResults: FitnessTestResult[] = [];

  for (const result of resultsData) {
    const resultRef = doc(collection(db, 'fitnessTestResults'));
    const dataToSave: Omit<FitnessTestResult, 'id'> & { recordedAt: Timestamp } = {
      ...result,
      recordedAt: Timestamp.now(),
    };
    batch.set(resultRef, dataToSave);
    newResults.push({
      id: resultRef.id,
      ...result,
      recordedAt: (dataToSave.recordedAt as Timestamp).toDate().toISOString(),
    });
  }
  await batch.commit();
  return newResults;
}

export async function getFitnessTestHeaderByIdFromDB(id: string): Promise<FitnessTestHeader | undefined> {
  if (!id) return undefined;
  const headerDocRef = doc(db, 'fitnessTests', id);
  const headerSnap = await getDoc(headerDocRef);
  if (headerSnap.exists()) {
    const data = headerSnap.data();
    return {
      id: headerSnap.id,
      ...data,
      testDate: safeToISOString(data.testDate),
      createdAt: safeToISOString(data.createdAt),
      certifiedAt: safeToISOString(data.certifiedAt),
    } as FitnessTestHeader;
  }
  return undefined;
}

export async function getFitnessTestResultsForHeaderFromDB(headerId: string): Promise<FitnessTestResult[]> {
  const resultsQuery = query(collection(db, 'fitnessTestResults'), where('fitnessTestHeaderId', '==', headerId));
  const resultsSnapshot = await getDocs(resultsQuery);
  return resultsSnapshot.docs.map(docSnapshot => {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      ...data,
      recordedAt: safeToISOString(data.recordedAt as Timestamp | string),
    } as FitnessTestResult;
  });
}

export async function getFitnessTestsForSeriesFromDB(seriesId: string): Promise<FitnessTestHeader[]> {
    const testsQuery = query(
        collection(db, 'fitnessTests'),
        where('seriesId', '==', seriesId),
        orderBy('testDate', 'desc')
    );
    const testsSnapshot = await getDocs(testsQuery);
    return testsSnapshot.docs.map(docSnapshot => {
        const data = docSnapshot.data();
        return {
            id: docSnapshot.id,
            ...data,
            testDate: safeToISOString(data.testDate),
            createdAt: safeToISOString(data.createdAt),
            certifiedAt: safeToISOString(data.certifiedAt),
        } as FitnessTestHeader;
    });
}


export async function certifyFitnessTestHeaderInDB(headerId: string, certifierUid: string): Promise<void> {
  const headerDocRef = doc(db, 'fitnessTests', headerId);
  await updateDoc(headerDocRef, {
    isCertified: true,
    certifiedBy: certifierUid,
    certifiedAt: Timestamp.now(),
  });
}

export async function updateFitnessTestHeaderInDB(
  headerId: string,
  headerUpdates: Partial<Omit<FitnessTestHeader, 'id' | 'seriesId' | 'organizationId' | 'testType' | 'createdAt' | 'isCertified' | 'certifiedBy' | 'certifiedAt'>> & { lastModifiedAt?: Timestamp, lastModifiedBy?: string }
): Promise<void> {
  const headerDocRef = doc(db, 'fitnessTests', headerId);
  await updateDoc(headerDocRef, headerUpdates);
}

export async function deleteFitnessTestResultsForHeaderFromDB(headerId: string): Promise<void> {
  const resultsQuery = query(collection(db, 'fitnessTestResults'), where('fitnessTestHeaderId', '==', headerId));
  const resultsSnapshot = await getDocs(resultsQuery);

  if (resultsSnapshot.empty) {
    return;
  }

  const batch = writeBatch(db);
  resultsSnapshot.forEach(docSnapshot => {
    batch.delete(docSnapshot.ref);
  });
  await batch.commit();
}


export async function getLatestHighestPassedCertifiedFitnessTestForPlayerInSeries(
  playerId: string,
  seriesId: string
): Promise<{ score: number; testDate: string; testType: FitnessTestType } | null> {
  const series = await getSeriesByIdFromDB(seriesId);
  if (!series || !series.fitnessTestType) {
    return null; 
  }

  const headersQuery = query(
    collection(db, 'fitnessTests'),
    where('seriesId', '==', seriesId),
    where('isCertified', '==', true),
    where('testType', '==', series.fitnessTestType) 
  );
  const headersSnapshot = await getDocs(headersQuery);
  if (headersSnapshot.empty) {
    return null; 
  }
  const certifiedHeaderIds = headersSnapshot.docs.map(doc => doc.id);
  const certifiedHeaderTestDatesMap = new Map(headersSnapshot.docs.map(doc => [doc.id, safeToISOString(doc.data().testDate as Timestamp | string)]));


  const resultsQuery = query(
    collection(db, 'playerRatings'),
    where('playerId', '==', playerId),
    where('seriesId', '==', seriesId), 
    where('fitnessTestHeaderId', 'in', certifiedHeaderIds),
    where('result', '==', 'Pass')
  );
  const resultsSnapshot = await getDocs(resultsQuery);
  if (resultsSnapshot.empty) {
    return null; 
  }

  let highestScore = -1;
  let latestTest: { score: number; testDate: string; testType: FitnessTestType } | null = null;

  resultsSnapshot.forEach(doc => {
    const result = doc.data() as FitnessTestResult;
    const score = parseFloat(result.score);
    const testDateFromMap = certifiedHeaderTestDatesMap.get(result.fitnessTestHeaderId);

    if (!isNaN(score) && testDateFromMap) { 
      if (score > highestScore) {
        highestScore = score;
        latestTest = {
          score: score,
          testDate: testDateFromMap,
          testType: series.fitnessTestType!,
        };
      }
    }
  });

  return latestTest;
}

// --- Role Permission Config Functions ---
export async function getRolePermissionsFromDB(
  roleName: UserRole
): Promise<Record<PermissionKey, boolean> | null> {
  try {
    if (!roleName) return null;

    const configRef = doc(db, 'role_permissions_config', roleName);
    const docSnap = await getDoc(configRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      // It's good practice to validate the shape of 'data.permissions' here
      // to ensure it matches Record<PermissionKey, boolean> before casting.
      // For simplicity, we cast directly, assuming data integrity.
      return data.permissions as Record<PermissionKey, boolean>;
    }
    return null; // No specific configuration found for this role
  } catch (error) {
    console.error(`Error fetching permissions from DB for role ${roleName}:`, error);
    // Re-throw so the client component's catch block can handle it
    throw error;
  }
}
