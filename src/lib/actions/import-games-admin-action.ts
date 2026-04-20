'use server';

import { adminDb } from '../firebase-admin';
import * as admin from 'firebase-admin';
import { isValid, parse, format } from 'date-fns';
import { isPlayerAgeEligibleForSeriesFromDB } from '../db';

interface CsvGameRow {
  GameDate: string;
  Time?: string;
  SeriesName: string;
  VenueName: string;
  Team1Name: string;
  Team2Name: string;
  GameSelectorEmails?: string;
  [key: string]: string | undefined;
}

interface GameImportError {
  rowNumber: number;
  csvRow: Record<string, any>;
  error: string;
}

interface GameImportResult {
  success: boolean;
  message: string;
  successfulImports: number;
  failedImports: number;
  errors: GameImportError[];
}

export async function importGamesAdminAction(gamesData: CsvGameRow[], organizationId?: string): Promise<GameImportResult> {
  const errors: GameImportError[] = [];
  let successfulImports = 0;
  const gamesToAdd: any[] = [];

  if (!organizationId) {
    return {
      success: false,
      message: 'Cannot import games: Organization context is missing. Please ensure an organization is active.',
      successfulImports: 0,
      failedImports: gamesData.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: 'Critical: Organization ID missing for import.' }],
    };
  }

  // Normalize helper — trim, collapse spaces, lowercase
  const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

  try {
    // Fetch active series scoped to this organization only
    const seriesSnap = await adminDb.collection('series')
      .where('status', '==', 'active')
      .where('organizationId', '==', organizationId)
      .get();
    const seriesMapByName = new Map(
      seriesSnap.docs.map(d => [normalize(d.data().name), { id: d.id, ...d.data() }])
    );

    // Pre-fetch all teams for this org for case-insensitive matching
    const teamsSnap = await adminDb.collection('teams')
      .where('organizationId', '==', organizationId)
      .get();
    const allOrgTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const findTeam = (name: string) =>
      allOrgTeams.find(t => typeof t.name === 'string' && normalize(t.name) === normalize(name));

    for (let i = 0; i < gamesData.length; i++) {
      const row = gamesData[i];
      const rowNumber = i + 2;

      try {
        const GameDate        = row.GameDate?.trim();
        const GameTime        = row.Time?.trim();
        const RawSeriesName   = row.SeriesName?.trim();
        const rawVenueName    = row.VenueName?.trim();
        const RawTeam1Name    = row.Team1Name?.trim();
        const RawTeam2Name    = row.Team2Name?.trim();
        const RawSelectorEmails = row.GameSelectorEmails?.trim();

        // Validate Series
        if (!RawSeriesName) { errors.push({ rowNumber, csvRow: row, error: 'SeriesName is missing.' }); continue; }
        const series = seriesMapByName.get(normalize(RawSeriesName)) as any;
        if (!series?.organizationId) { errors.push({ rowNumber, csvRow: row, error: `Series "${RawSeriesName}" not found or not active in your organization.` }); continue; }

        const participatingTeams: string[] = series.participatingTeams || [];
        const venueIds: string[] = series.venueIds || [];

        // Validate Team1 — case-insensitive match against pre-fetched org teams
        if (!RawTeam1Name) { errors.push({ rowNumber, csvRow: row, error: 'Team1Name is missing.' }); continue; }
        const team1 = findTeam(RawTeam1Name);
        if (!team1) { errors.push({ rowNumber, csvRow: row, error: `Team1 "${RawTeam1Name}" not found.` }); continue; }
        if (!participatingTeams.includes(team1.id)) { errors.push({ rowNumber, csvRow: row, error: `Team1 "${RawTeam1Name}" is not in series "${series.name}".` }); continue; }

        // Validate Team2 — case-insensitive match against pre-fetched org teams
        if (!RawTeam2Name) { errors.push({ rowNumber, csvRow: row, error: 'Team2Name is missing.' }); continue; }
        const team2 = findTeam(RawTeam2Name);
        if (!team2) { errors.push({ rowNumber, csvRow: row, error: `Team2 "${RawTeam2Name}" not found.` }); continue; }
        if (!participatingTeams.includes(team2.id)) { errors.push({ rowNumber, csvRow: row, error: `Team2 "${RawTeam2Name}" is not in series "${series.name}".` }); continue; }
        if (team1.id === team2.id) { errors.push({ rowNumber, csvRow: row, error: 'Team1Name and Team2Name cannot be the same.' }); continue; }

        // Validate Venue
        if (!rawVenueName) { errors.push({ rowNumber, csvRow: row, error: 'VenueName is missing.' }); continue; }
        const venueSnap = await adminDb.collection('venues')
          .where('name', '==', rawVenueName)
          .where('organizationId', '==', series.organizationId)
          .limit(1).get();
        if (venueSnap.empty) { errors.push({ rowNumber, csvRow: row, error: `Venue "${rawVenueName}" not found.` }); continue; }
        const venue = { id: venueSnap.docs[0].id, ...venueSnap.docs[0].data() } as any;
        if (venue.status !== 'active') { errors.push({ rowNumber, csvRow: row, error: `Venue "${rawVenueName}" is not active.` }); continue; }
        if (!venueIds.includes(venue.id)) { errors.push({ rowNumber, csvRow: row, error: `Venue "${rawVenueName}" is not associated with series "${series.name}".` }); continue; }

        // Validate Date and merge optional Time
        if (!GameDate) { errors.push({ rowNumber, csvRow: row, error: 'GameDate is missing.' }); continue; }
        const parsedDate = parse(GameDate, 'MM/dd/yyyy', new Date());
        if (!isValid(parsedDate)) { errors.push({ rowNumber, csvRow: row, error: `Invalid GameDate "${GameDate}". Use MM/DD/YYYY.` }); continue; }
        let normalizedDate = parsedDate.toISOString();
        if (GameTime && GameTime !== '') {
          const timeMatch = GameTime.match(/^(\d+):(\d{2})\s*(AM|PM)$/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            const period = timeMatch[3].toUpperCase();
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            const d = new Date(parsedDate);
            d.setHours(hours, minutes, 0, 0);
            normalizedDate = d.toISOString();
          } else {
            errors.push({ rowNumber, csvRow: row, error: `Invalid Time format: "${GameTime}". Use H:MM AM/PM e.g. 8:00 AM.` });
            continue;
          }
        }

        // Check duplicate
        const existingSnap = await adminDb.collection('games')
          .where('seriesId', '==', series.id)
          .where('date', '==', normalizedDate)
          .where('team1', '==', team1.name)
          .where('team2', '==', team2.name)
          .where('organizationId', '==', series.organizationId)
          .limit(1).get();
        if (!existingSnap.empty) { errors.push({ rowNumber, csvRow: row, error: `Game already exists: ${team1.name} vs ${team2.name} on ${GameDate}.` }); continue; }

        // Resolve selector emails → UIDs
        const selectorUserIds: string[] = [];
        if (RawSelectorEmails) {
          const emails = RawSelectorEmails.split(',').map(e => e.trim()).filter(Boolean);
          for (const email of emails) {
            const userSnap = await adminDb.collection('users').where('email', '==', email).limit(1).get();
            if (!userSnap.empty) {
              selectorUserIds.push(userSnap.docs[0].id);
            } else {
              console.warn(`Row ${rowNumber}: Selector email "${email}" not found. Skipping.`);
            }
          }
        }

        // Populate Player Rosters
        const seriesObj = {
          maleCutoffDate: series.maleCutoffDate,
          femaleCutoffDate: series.femaleCutoffDate,
          ageCategory: series.ageCategory,
        };

        const resolveEligiblePlayers = async (teamObj: any, excludeIds: string[] = []): Promise<string[]> => {
          const playerIds: string[] = teamObj.playerIds || [];
          const eligible: string[] = [];
          for (let j = 0; j < playerIds.length; j += 30) {
            const chunk = playerIds.slice(j, j + 30);
            if (!chunk.length) continue;
            const snap = await adminDb.collection('players').where('__name__', 'in', chunk).get();
            snap.docs.forEach(d => {
              const p = { id: d.id, ...d.data() } as any;
              if (!excludeIds.includes(p.id) && isPlayerAgeEligibleForSeriesFromDB(p, seriesObj as any)) {
                eligible.push(p.id);
              }
            });
          }
          return eligible;
        };

        const team1Players = await resolveEligiblePlayers(team1);
        const team2Players = await resolveEligiblePlayers(team2, team1Players);

        gamesToAdd.push({
          seriesId: series.id,
          organizationId: series.organizationId,
          date: normalizedDate,
          venue: venue.name,
          team1: team1.name,
          team2: team2.name,
          team1Players,
          team2Players,
          selectorUserIds,
        });

      } catch (rowError: any) {
        errors.push({ rowNumber, csvRow: row, error: `Unexpected error: ${rowError.message || 'Unknown'}` });
      }
    }

    if (gamesToAdd.length > 0) {
      const batch = adminDb.batch();
      gamesToAdd.forEach(gameData => {
        const ref = adminDb.collection('games').doc();
        batch.set(ref, { ...gameData, status: 'active', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      await batch.commit();
      successfulImports = gamesToAdd.length;
    }

    const failedCount = gamesData.length - successfulImports;
    let msg = '';
    if (successfulImports > 0 && errors.length === 0) msg = `All ${successfulImports} games imported successfully.`;
    else if (successfulImports > 0) msg = `${successfulImports} games imported. ${errors.length} failed. See details below.`;
    else if (errors.length > 0) msg = `Import failed. ${errors.length} games had errors. See details below.`;
    else msg = 'No games were imported.';

    return { success: errors.length === 0 && successfulImports > 0, message: msg, successfulImports, failedImports: failedCount, errors };

  } catch (actionError: any) {
    console.error('FATAL ERROR in importGamesAdminAction:', actionError);
    return {
      success: false,
      message: `Fatal error: ${actionError.message || 'Unknown'}. No games imported.`,
      successfulImports: 0,
      failedImports: gamesData.length,
      errors: [{ rowNumber: 0, csvRow: {}, error: actionError.message }],
    };
  }
}
