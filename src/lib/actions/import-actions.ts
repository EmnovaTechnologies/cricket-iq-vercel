
'use server';

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
} from 'firebase/firestore';
import { adminDb as db } from '../firebase-admin';
import type {
  Game,
  Series,
  Player,
  Venue,
  CsvGameImportRow,
  GameImportResult,
  GameImportError,
  CsvSeriesImportRow,
  SeriesImportError,
  CsvPlayerImportRow,
  PlayerImportError,
  AgeCategory,
  PrimarySkill,
  DominantHand,
  BattingOrder,
  BowlingStyle,
  Gender,
} from '../../types';

// DB function imports
import {
  getAllSeriesFromDB,
  getTeamByNameFromDB, // Now used directly in loop
  // getVenueByIdFromDB, // Not directly used here, but kept for other actions if needed
  getPlayersFromIds,
  getSeriesByNameFromDB,
  isPlayerAgeEligibleForSeriesFromDB,
  isPlayerAgeEligibleForTeamCategory,
  checkCricClubsIdExists,
  getTeamByIdFromDB,
  // getAllVenuesFromDB, // No longer pre-fetching all venues globally for this action
  // getAllTeamsFromDB, // No longer pre-fetching all teams globally for this action
  addPlayerToDB,
  addPlayerToTeamInDB,
} from '../db';
import { getUserByEmailFromDB } from '../user-actions';


import { isValid, parse, format } from 'date-fns';
import { AGE_CATEGORIES, PRIMARY_SKILLS, BATTING_ORDERS, BOWLING_STYLES, DOMINANT_HANDS, GENDERS } from '../constants';


export async function importGamesAction(gamesData: CsvGameImportRow[]): Promise<GameImportResult> {
  const errors: GameImportError[] = [];
  let successfulImports = 0;
  const gamesToBatchAdd: Omit<Game, 'id' | 'seriesName' | 'status' | 'selectorCertifications' | 'ratingsFinalized' | 'createdAt'>[] = [];

  try {
    // Fetch all active series once, as series names need to be looked up
    const allActiveSeries = await getAllSeriesFromDB('active');
    const seriesMapByName = new Map(allActiveSeries.map(s => [s.name.trim().toLowerCase(), s]));

    for (let i = 0; i < gamesData.length; i++) {
      const row = gamesData[i];
      const rowNumber = i + 2; // For user-friendly row numbers (assuming header is row 1)

      try {
        // Trim all string inputs from CSV
        const GameDate = row.GameDate?.trim();
        const rawVenueName = row.VenueName?.trim();
        const RawSeriesName = row.SeriesName?.trim();
        const RawTeam1Name = row.Team1Name?.trim();
        const RawTeam2Name = row.Team2Name?.trim();


        // Validate Series
        if (!RawSeriesName || RawSeriesName === "") { errors.push({ rowNumber, csvRow: row, error: "SeriesName is missing." }); continue; }
        const series = seriesMapByName.get(RawSeriesName.toLowerCase());
        if (!series || !series.organizationId) { errors.push({ rowNumber, csvRow: row, error: `Series "${RawSeriesName}" not found, not active, or not associated with an organization.` }); continue; }

        // Validate Team1 (scoped by series' organization)
        if (!RawTeam1Name || RawTeam1Name === "") { errors.push({ rowNumber, csvRow: row, error: "Team1Name is missing." }); continue; }
        const team1 = await getTeamByNameFromDB(RawTeam1Name, series.organizationId);
        if (!team1) { errors.push({ rowNumber, csvRow: row, error: `Team1 "${RawTeam1Name}" not found in organization "${series.organizationId}".` }); continue; }
        if (!series.participatingTeams.includes(team1.id)) { errors.push({ rowNumber, csvRow: row, error: `Team1 "${RawTeam1Name}" is not associated with series "${series.name}".` }); continue; }

        // Validate Team2 (scoped by series' organization)
        if (!RawTeam2Name || RawTeam2Name === "") { errors.push({ rowNumber, csvRow: row, error: "Team2Name is missing." }); continue; }
        const team2 = await getTeamByNameFromDB(RawTeam2Name, series.organizationId);
        if (!team2) { errors.push({ rowNumber, csvRow: row, error: `Team2 "${RawTeam2Name}" not found in organization "${series.organizationId}".` }); continue; }
        if (!series.participatingTeams.includes(team2.id)) { errors.push({ rowNumber, csvRow: row, error: `Team2 "${RawTeam2Name}" is not associated with series "${series.name}".` }); continue; }

        if (team1.id === team2.id) { errors.push({ rowNumber, csvRow: row, error: "Team1Name and Team2Name cannot be the same." }); continue; }

        // Validate Venue (scoped by series' organization)
        if (!rawVenueName || rawVenueName === "") { errors.push({ rowNumber, csvRow: row, error: "VenueName is missing." }); continue; }
        const venueQuery = query(
            collection(db, 'venues'),
            where('name', '==', rawVenueName),
            where('organizationId', '==', series.organizationId),
            limit(1)
        );
        const venueSnapshot = await getDocs(venueQuery);
        const venueDoc = venueSnapshot.docs[0];
        const venueDataFromDb = venueDoc?.data();
        const venue = venueDoc ? ({ id: venueDoc.id, ...venueDataFromDb, status: venueDataFromDb?.status || 'active' } as Venue) : undefined;


        if (!venue) {
            errors.push({ rowNumber, csvRow: row, error: `Venue "${rawVenueName}" not found in organization "${series.organizationId}".` });
            continue;
        }
        if (venue.status !== 'active') {
            errors.push({ rowNumber, csvRow: row, error: `Venue "${rawVenueName}" is not active and cannot be used for games.` });
            continue;
        }
        if (!series.venueIds.includes(venue.id)) {
            errors.push({ rowNumber, csvRow: row, error: `Venue "${rawVenueName}" (Org: ${series.organizationId}) is not associated with series "${series.name}".` });
            continue;
        }


        // Validate Date
        if (!GameDate || GameDate === "") { errors.push({ rowNumber, csvRow: row, error: "GameDate is missing." }); continue; }
        const parsedDate = parse(GameDate, 'MM/dd/yyyy', new Date());
        if (!isValid(parsedDate)) { errors.push({ rowNumber, csvRow: row, error: `Invalid GameDate format: "${GameDate}". Use MM/DD/YYYY.` }); continue; }
        const normalizedDateString = parsedDate.toISOString();

        // Check for existing game
        const existingGameQuery = query(
          collection(db, 'games'),
          where('seriesId', '==', series.id),
          where('date', '==', normalizedDateString),
          where('team1', '==', team1.name), // team1.name is already trimmed from DB lookup
          where('team2', '==', team2.name), // team2.name is already trimmed
          where('organizationId', '==', series.organizationId),
          limit(1)
        );
        const existingGameSnap = await getDocs(existingGameQuery);
        if (!existingGameSnap.empty) {
           errors.push({ rowNumber, csvRow: row, error: `Game already exists: ${team1.name} vs ${team2.name} on ${GameDate} in series ${series.name}.`});
           continue;
        }

        // Populate Player Rosters
        let team1EligiblePlayerIds: string[] = [];
        if (team1.playerIds && team1.playerIds.length > 0) {
            const prospectiveTeam1Players = await getPlayersFromIds(team1.playerIds);
            for (const player of prospectiveTeam1Players) {
                if (player && isPlayerAgeEligibleForSeriesFromDB(player, series)) {
                    team1EligiblePlayerIds.push(player.id);
                }
            }
        }
        let team2EligiblePlayerIds: string[] = [];
        if (team2.playerIds && team2.playerIds.length > 0) {
            const prospectiveTeam2Players = await getPlayersFromIds(team2.playerIds);
            for (const player of prospectiveTeam2Players) {
                if (player && isPlayerAgeEligibleForSeriesFromDB(player, series) && !team1EligiblePlayerIds.includes(player.id) ) {
                    team2EligiblePlayerIds.push(player.id);
                }
            }
        }

        gamesToBatchAdd.push({
          seriesId: series.id,
          organizationId: series.organizationId,
          date: normalizedDateString,
          venue: venue.name, // venue.name is already trimmed from DB lookup
          team1: team1.name,
          team2: team2.name,
          team1Players: team1EligiblePlayerIds,
          team2Players: team2EligiblePlayerIds,
          selectorUserIds: [],
        });
      } catch (rowError: any) {
        console.error(`Error processing game import row ${rowNumber}:`, rowError);
        errors.push({ rowNumber, csvRow: row, error: `Unexpected error for this row: ${rowError.message || 'Unknown error'}`,});
      }
    }

    if (gamesToBatchAdd.length > 0) {
      const batch = writeBatch(db);
      gamesToBatchAdd.forEach(gameData => {
        const gameRef = doc(collection(db, 'games'));
        batch.set(gameRef, { ...gameData, createdAt: serverTimestamp(), status: 'active' });
      });
      await batch.commit();
      successfulImports = gamesToBatchAdd.length;
    }

    const failedImportsCount = gamesData.length - successfulImports;
    let finalMessage = '';
    if (successfulImports > 0 && errors.length === 0) finalMessage = `All ${successfulImports} games imported successfully.`;
    else if (successfulImports > 0 && errors.length > 0) finalMessage = `${successfulImports} games imported successfully. ${errors.length} games failed. See details below.`;
    else if (successfulImports === 0 && errors.length > 0) finalMessage = `Import failed. ${errors.length} games had errors. See details below.`;
    else if (gamesData.length > 0) finalMessage = `No games were imported. Please check CSV data and logs. Total rows processed: ${gamesData.length}.`;
    else finalMessage = "No games were imported. The CSV might have been empty or contained no valid data rows.";

    return {
      success: errors.length === 0 && successfulImports > 0,
      message: finalMessage,
      successfulImports,
      failedImports: failedImportsCount,
      errors,
    };

  } catch (actionError: any) {
    console.error('FATAL ERROR in importGamesAction:', actionError);
    return {
      success: false,
      message: `A fatal error occurred: ${actionError.message || 'Unknown server error'}. No games were imported.`,
      successfulImports: 0,
      failedImports: gamesData.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: `Fatal error: ${actionError.message || 'Unknown server error'}` }],
    };
  }
}

export async function importSeriesAction(seriesDataRows: CsvSeriesImportRow[], organizationId: string): Promise<SeriesImportResult> {
  const errors: SeriesImportError[] = [];
  let successfulImports = 0;
  const seriesToBatchAdd: Array<Omit<Series, 'id' | 'createdAt' | 'participatingTeams' | 'venueIds' | 'status'> & { organizationId: string }> = [];

  if (!organizationId) {
    throw new Error("Organization ID is required for importing series.");
  }

  try {
    for (let i = 0; i < seriesDataRows.length; i++) {
      const row = seriesDataRows[i];
      const rowNumber = i + 2; // For user-friendly row numbers

      try {
        // Trim string inputs from CSV
        const SeriesName = row.SeriesName?.trim();
        const RawAgeCategory = row.AgeCategory?.trim();
        const RawYear = row.Year?.trim();
        const MaleCutoffDate = row.MaleCutoffDate?.trim();
        const FemaleCutoffDate = row.FemaleCutoffDate?.trim();
        const SeriesAdminEmails = row.SeriesAdminEmails?.trim();


        if (!SeriesName || SeriesName === "") { errors.push({ rowNumber, csvRow: row, error: "SeriesName is missing." }); continue; }
        const existingSeries = await getSeriesByNameFromDB(SeriesName, organizationId);
        if (existingSeries) { errors.push({ rowNumber, csvRow: row, error: `Series "${SeriesName}" already exists in this organization.` }); continue; }

        if (!RawAgeCategory || RawAgeCategory === "") { errors.push({ rowNumber, csvRow: row, error: "AgeCategory is missing." }); continue; }
        if (!AGE_CATEGORIES.includes(RawAgeCategory as AgeCategory)) { errors.push({ rowNumber, csvRow: row, error: `Invalid AgeCategory: "${RawAgeCategory}". Must be one of: ${AGE_CATEGORIES.join(', ')}.` }); continue; }
        const ageCategory = RawAgeCategory as AgeCategory;

        if (!RawYear || RawYear === "") { errors.push({ rowNumber, csvRow: row, error: "Year is missing." }); continue; }
        const year = parseInt(RawYear, 10);
        if (isNaN(year) || year < 2000 || year > 2100) { errors.push({ rowNumber, csvRow: row, error: `Invalid Year: "${RawYear}". Must be a number between 2000 and 2100.` }); continue; }

        if (!MaleCutoffDate || MaleCutoffDate === "") { errors.push({ rowNumber, csvRow: row, error: "MaleCutoffDate is missing." }); continue; }
        const parsedMaleCutoff = parse(MaleCutoffDate, 'MM/dd/yyyy', new Date());
        if (!isValid(parsedMaleCutoff)) { errors.push({ rowNumber, csvRow: row, error: `Invalid MaleCutoffDate format: "${MaleCutoffDate}". Use MM/DD/YYYY.` }); continue; }

        if (!FemaleCutoffDate || FemaleCutoffDate === "") { errors.push({ rowNumber, csvRow: row, error: "FemaleCutoffDate is missing." }); continue; }
        const parsedFemaleCutoff = parse(FemaleCutoffDate, 'MM/dd/yyyy', new Date());
        if (!isValid(parsedFemaleCutoff)) { errors.push({ rowNumber, csvRow: row, error: `Invalid FemaleCutoffDate format: "${FemaleCutoffDate}". Use MM/DD/YYYY.` }); continue; }

        const seriesAdminUids: string[] = [];
        if (SeriesAdminEmails && SeriesAdminEmails !== "") {
          const emails = SeriesAdminEmails.split(',').map(e => e.trim()).filter(e => e);
          for (const email of emails) {
            const user = await getUserByEmailFromDB(email); 
            if (user) {
              seriesAdminUids.push(user.uid);
            } else {
              console.warn(`Row ${rowNumber}: Admin email "${email}" not found for series "${SeriesName}". This admin will not be assigned.`);
            }
          }
        }

        seriesToBatchAdd.push({
          name: SeriesName,
          ageCategory,
          year,
          organizationId: organizationId,
          maleCutoffDate: format(parsedMaleCutoff, 'yyyy-MM-dd'),
          femaleCutoffDate: format(parsedFemaleCutoff, 'yyyy-MM-dd'),
          seriesAdminUids,
        });
      } catch (rowError: any) {
        console.error(`Error processing series import row ${rowNumber}:`, rowError);
        errors.push({ rowNumber, csvRow: row, error: `Unexpected error for this row: ${rowError.message || 'Unknown error'}`,});
      }
    }

    if (seriesToBatchAdd.length > 0) {
      const batch = writeBatch(db);
      for (const seriesData of seriesToBatchAdd) {
        const seriesRef = doc(collection(db, 'series'));
        const firestoreData = {
          name: seriesData.name, // Already trimmed
          ageCategory: seriesData.ageCategory,
          year: seriesData.year,
          organizationId: seriesData.organizationId,
          maleCutoffDate: seriesData.maleCutoffDate,
          femaleCutoffDate: seriesData.femaleCutoffDate,
          seriesAdminUids: seriesData.seriesAdminUids || [],
          participatingTeams: [],
          venueIds: [],
          status: 'active', 
          createdAt: serverTimestamp(),
        };
        batch.set(seriesRef, firestoreData);

        if (seriesData.seriesAdminUids && seriesData.seriesAdminUids.length > 0) {
          seriesData.seriesAdminUids.forEach(adminUid => {
            const userRef = doc(db, 'users', adminUid);
            batch.update(userRef, { 
              assignedSeriesIds: arrayUnion(seriesRef.id),
              assignedOrganizationIds: arrayUnion(seriesData.organizationId) 
            });
          });
        }
      }
      await batch.commit();
      successfulImports = seriesToBatchAdd.length;
    }

    const failedImportsCount = seriesDataRows.length - successfulImports;
    let finalMessage = '';
    if (successfulImports > 0 && errors.length === 0) finalMessage = `All ${successfulImports} series imported successfully.`;
    else if (successfulImports > 0 && errors.length > 0) finalMessage = `${successfulImports} series imported successfully. ${errors.length} series failed. See details below.`;
    else if (successfulImports === 0 && errors.length > 0) finalMessage = `Import failed. ${errors.length} series had errors. See details below.`;
    else if (seriesDataRows.length > 0) finalMessage = `No series were imported. Please check CSV data and logs. Total rows processed: ${seriesDataRows.length}.`;
    else finalMessage = "No series were imported. The file might have been empty or contained no valid data rows.";

    return {
      success: errors.length === 0 && successfulImports > 0,
      message: finalMessage,
      successfulImports,
      failedImports: failedImportsCount,
      errors,
    };

  } catch (actionError: any) {
    console.error('FATAL ERROR in importSeriesAction:', actionError);
    return {
      success: false,
      message: `A fatal error occurred: ${actionError.message || 'Unknown server error'}. No series were imported.`,
      successfulImports: 0,
      failedImports: seriesDataRows.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: `Fatal error: ${actionError.message || 'Unknown server error'}` }],
    };
  }
}

export async function importPlayersAction(playersData: CsvPlayerImportRow[], organizationIdForImport?: string): Promise<PlayerImportResult> {
  const errors: PlayerImportError[] = [];
  let successfulImports = 0;

  if (!organizationIdForImport) {
    console.error("FATAL: Organization ID is missing for player import. This should be provided by the calling context (e.g., active organization).");
    return {
      success: false,
      message: "Cannot import players: Organization context is missing. Please ensure an organization is active.",
      successfulImports: 0,
      failedImports: playersData.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: "Critical: Organization ID missing for import." }],
    };
  }

  try {
    const playersToProcess: Array<Omit<Player, 'id' | 'gamesPlayed'> & { primaryTeamIdToLink?: string; organizationId: string; }> = [];

    for (let i = 0; i < playersData.length; i++) {
      const row = playersData[i];
      const rowNumber = i + 2;

      try {
        // Trim all string inputs from CSV
        const RawFirstName = row.FirstName?.trim();
        const RawLastName = row.LastName?.trim();
        let Name: string;

        if (RawFirstName && RawLastName) {
          Name = `${RawFirstName} ${RawLastName}`;
        } else {
          errors.push({ rowNumber, csvRow: row, error: "Player name is missing. Provide both 'FirstName' and 'LastName'." });
          continue;
        }

        const CricClubsID = row.CricClubsID?.trim();
        const RawDateOfBirth = row.DateOfBirth?.trim();
        const RawGender = row.Gender?.trim();
        const RawPrimarySkill = row.PrimarySkill?.trim();
        const RawDominantHandBatting = row.DominantHandBatting?.trim();
        const RawBattingOrder = row.BattingOrder?.trim();
        const RawDominantHandBowling = row.DominantHandBowling?.trim();
        const RawBowlingStyle = row.BowlingStyle?.trim();
        const PrimaryClubName = row.PrimaryClubName?.trim();
        const PrimaryTeamName = row.PrimaryTeamName?.trim();


        if (!CricClubsID || CricClubsID === "") { errors.push({ rowNumber, csvRow: row, error: "CricClubsID is missing." }); continue; }
        const cricClubsIdExists = await checkCricClubsIdExists(CricClubsID);
        if (cricClubsIdExists) { errors.push({ rowNumber, csvRow: row, error: `CricClubsID "${CricClubsID}" already exists.` }); continue; }

        if (!RawDateOfBirth || RawDateOfBirth === "") { errors.push({ rowNumber, csvRow: row, error: "DateOfBirth is missing." }); continue; }
        const parsedDOB = parse(RawDateOfBirth, 'MM/dd/yyyy', new Date());
        if (!isValid(parsedDOB)) { errors.push({ rowNumber, csvRow: row, error: `Invalid DateOfBirth format: "${RawDateOfBirth}". Use MM/DD/YYYY.` }); continue; }
        const dateOfBirth = format(parsedDOB, 'yyyy-MM-dd');

        if (!RawGender || !GENDERS.includes(RawGender as Gender)) { errors.push({ rowNumber, csvRow: row, error: `Invalid Gender: "${RawGender}". Must be one of: ${GENDERS.join(', ')}.` }); continue; }
        const gender = RawGender as Gender;

        if (!RawPrimarySkill || !PRIMARY_SKILLS.includes(RawPrimarySkill as PrimarySkill)) { errors.push({ rowNumber, csvRow: row, error: `Invalid PrimarySkill: "${RawPrimarySkill}". Must be one of: ${PRIMARY_SKILLS.join(', ')}.` }); continue; }
        const primarySkill = RawPrimarySkill as PrimarySkill;

        if (!RawDominantHandBatting || !DOMINANT_HANDS.includes(RawDominantHandBatting as DominantHand)) { errors.push({ rowNumber, csvRow: row, error: `Invalid DominantHandBatting: "${RawDominantHandBatting}". Must be one of: ${DOMINANT_HANDS.join(', ')}.` }); continue; }
        const dominantHandBatting = RawDominantHandBatting as DominantHand;

        if (!RawBattingOrder || !BATTING_ORDERS.includes(RawBattingOrder as BattingOrder)) { errors.push({ rowNumber, csvRow: row, error: `Invalid BattingOrder: "${RawBattingOrder}". Must be one of: ${BATTING_ORDERS.join(', ')}.` }); continue; }
        const battingOrder = RawBattingOrder as BattingOrder;

        let dominantHandBowling: DominantHand | undefined = undefined;
        if (RawDominantHandBowling && RawDominantHandBowling !== "") {
          if (!DOMINANT_HANDS.includes(RawDominantHandBowling as DominantHand)) { errors.push({ rowNumber, csvRow: row, error: `Invalid DominantHandBowling: "${RawDominantHandBowling}". Must be one of: ${DOMINANT_HANDS.join(', ')}.` }); continue; }
          dominantHandBowling = RawDominantHandBowling as DominantHand;
        }

        let bowlingStyle: BowlingStyle | undefined = undefined;
        if (RawBowlingStyle && RawBowlingStyle !== "") {
          if (!BOWLING_STYLES.includes(RawBowlingStyle as BowlingStyle)) { errors.push({ rowNumber, csvRow: row, error: `Invalid BowlingStyle: "${RawBowlingStyle}". Must be one of: ${BOWLING_STYLES.join(', ')}.` }); continue; }
          bowlingStyle = RawBowlingStyle as BowlingStyle;
        }

        if (primarySkill === 'Bowling') {
          if (!dominantHandBowling) { errors.push({ rowNumber, csvRow: row, error: "DominantHandBowling is required for bowlers." }); continue; }
          if (!bowlingStyle) { errors.push({ rowNumber, csvRow: row, error: "BowlingStyle is required for bowlers." }); continue; }
        }
        
        let primaryTeamIdToLink: string | undefined = undefined;
        if (PrimaryTeamName && PrimaryTeamName !== "") {
            const team = await getTeamByNameFromDB(PrimaryTeamName, organizationIdForImport); 
            if (!team) {
                errors.push({ rowNumber, csvRow: row, error: `PrimaryTeamName "${PrimaryTeamName}" not found in the active organization.` });
                continue;
            }
            if (team.organizationId !== organizationIdForImport) {
                 errors.push({ rowNumber, csvRow: row, error: `PrimaryTeamName "${PrimaryTeamName}" found, but it belongs to a different organization (${team.organizationId}) than the import target (${organizationIdForImport}).` });
                 continue;
            }
            primaryTeamIdToLink = team.id;
        }

        const nameTokens = Name.toLowerCase().split(' ').filter(Boolean);
        const searchableNameTokens = [...nameTokens, Name.toLowerCase()];

        playersToProcess.push({
          name: Name,
          firstName: RawFirstName,
          lastName: RawLastName,
          cricClubsId: CricClubsID,
          dateOfBirth,
          gender,
          primarySkill,
          dominantHandBatting,
          battingOrder,
          dominantHandBowling,
          bowlingStyle,
          searchableNameTokens: searchableNameTokens,
          clubName: PrimaryClubName && PrimaryClubName !== "" ? PrimaryClubName : undefined,
          primaryTeamId: primaryTeamIdToLink, 
          organizationId: organizationIdForImport, 
        });
      } catch (rowError: any) {
        console.error(`Error processing player import row ${rowNumber}:`, rowError);
        errors.push({ rowNumber, csvRow: row, error: `Unexpected error for this row: ${rowError.message || 'Unknown error'}`,});
      }
    }

    if (playersToProcess.length > 0) {
      const playerWriteBatch = writeBatch(db);
      let actualSuccessfulPlayerCreations = 0;

      for (const playerData of playersToProcess) {
        const { primaryTeamId: teamIdToLinkTo, organizationId, ...playerCoreData } = playerData;
        
        const firestoreReadyPlayerData: Omit<Player, 'id' | 'gamesPlayed'> & { gamesPlayed?: number, organizationId: string, primaryTeamId?: string, clubName?: string } = {
          name: playerCoreData.name, // Name is already trimmed
          firstName: playerCoreData.firstName,
          lastName: playerCoreData.lastName,
          searchableNameTokens: playerCoreData.searchableNameTokens,
          cricClubsId: playerCoreData.cricClubsId, // ID is already trimmed
          dateOfBirth: playerCoreData.dateOfBirth,
          gender: playerCoreData.gender,
          primarySkill: playerCoreData.primarySkill,
          battingOrder: playerCoreData.battingOrder,
          dominantHandBatting: playerCoreData.dominantHandBatting,
          organizationId: organizationId, 
          gamesPlayed: 0,
        };

        if (playerCoreData.dominantHandBowling) firestoreReadyPlayerData.dominantHandBowling = playerCoreData.dominantHandBowling;
        if (playerCoreData.bowlingStyle) firestoreReadyPlayerData.bowlingStyle = playerCoreData.bowlingStyle;
        if (playerCoreData.clubName) firestoreReadyPlayerData.clubName = playerCoreData.clubName;
        if (teamIdToLinkTo) firestoreReadyPlayerData.primaryTeamId = teamIdToLinkTo;


        const playerRef = doc(collection(db, 'players'));
        playerWriteBatch.set(playerRef, firestoreReadyPlayerData);
        actualSuccessfulPlayerCreations++; 

        if (teamIdToLinkTo) {
          const team = await getTeamByIdFromDB(teamIdToLinkTo);
          if (team && team.organizationId === organizationIdForImport) {
            const isEligible = isPlayerAgeEligibleForTeamCategory(
              { dateOfBirth: firestoreReadyPlayerData.dateOfBirth, gender: firestoreReadyPlayerData.gender },
              team.ageCategory,
              new Date().getFullYear()
            );
            if (isEligible) {
              const teamDocRef = doc(db, 'teams', teamIdToLinkTo);
              playerWriteBatch.update(teamDocRef, { playerIds: arrayUnion(playerRef.id) });
            } else {
              const warningMsg = `Player ${firestoreReadyPlayerData.name} was created but NOT added to team ${team.name} due to age/gender ineligibility.`;
              console.warn(warningMsg);
              errors.push({ rowNumber: 0, csvRow: { Name: firestoreReadyPlayerData.name }, error: warningMsg });
            }
          } else if (team) { 
            const warningMsg = `Player ${firestoreReadyPlayerData.name} was created but primary team ${team.name} was found in a different organization. Not linked.`;
            console.warn(warningMsg);
            errors.push({ rowNumber: 0, csvRow: { Name: firestoreReadyPlayerData.name }, error: warningMsg });
          }
        }
      }
      await playerWriteBatch.commit();
      successfulImports = actualSuccessfulPlayerCreations;
    }
    
    const failedImportsCount = playersData.length - successfulImports;
    let finalMessage = '';
    if (successfulImports > 0 && errors.length === 0) finalMessage = `All ${successfulImports} players imported successfully.`;
    else if (successfulImports > 0 && errors.length > 0) finalMessage = `${successfulImports} players imported successfully. ${errors.length} players/team assignments had issues. See details.`;
    else if (successfulImports === 0 && errors.length > 0) finalMessage = `Import failed. ${errors.length} players had errors. See details below.`;
    else if (playersData.length > 0) finalMessage = `No players were imported. Please check CSV data and logs. Total rows processed: ${playersData.length}.`;
    else finalMessage = "No players were imported. The CSV might have been empty or contained no valid data rows.";

    return {
      success: errors.filter(e => !e.error.includes("NOT added to team") && !e.error.includes("different organization")).length === 0 && successfulImports > 0,
      message: finalMessage,
      successfulImports,
      failedImports: failedImportsCount,
      errors,
    };

  } catch (actionError: any) {
    console.error('FATAL ERROR in importPlayersAction:', actionError);
    return {
      success: false,
      message: `A fatal error occurred: ${actionError.message || 'Unknown server error'}. No players were imported.`,
      successfulImports: 0,
      failedImports: playersData.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: `Fatal error: ${actionError.message || 'Unknown server error'}` }],
    };
  }
}
