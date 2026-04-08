'use server';

import { adminDb } from '../firebase-admin';
import { format, parseISO, isValid } from 'date-fns';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExportSeries {
  id: string;
  name: string;
  year: number;
  ageCategory: string;
  organizationId: string;
  organizationName: string;
  participatingTeams: string[];
}

export interface ExportOrg {
  id: string;
  name: string;
}

export interface ExportScope {
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  isSeriesAdmin: boolean;
  orgs: ExportOrg[];
  series: ExportSeries[];
}

export interface PlayerExportRow {
  PlayerName: string;
  FirstName: string;
  LastName: string;
  CricClubsID: string;
  DateOfBirth: string;
  Gender: string;
  PrimarySkill: string;
  DominantHandBatting: string;
  BattingOrder: string;
  DominantHandBowling: string;
  BowlingStyle: string;
  ClubName: string;
  PrimaryTeamName: string;
  GamesPlayed: number;
  SeriesName: string;
  OrganizationId: string;
}

export interface RatingSummaryRow {
  PlayerName: string;
  SeriesName: string;
  GameDate: string;
  Team1: string;
  Team2: string;
  Venue: string;
  AvgBatting: string;
  AvgBowling: string;
  AvgFielding: string;
  AvgWicketKeeping: string;
  SelectorsRated: number;
  RatingsFinalized: string;
}

export interface RatingDetailRow {
  PlayerName: string;
  SeriesName: string;
  GameDate: string;
  Team1: string;
  Team2: string;
  Venue: string;
  SelectorEmail: string;
  Batting: string;
  Bowling: string;
  Fielding: string;
  WicketKeeping: string;
  BattingComment: string;
  BowlingComment: string;
  FieldingComment: string;
  WicketKeepingComment: string;
}

export interface ExportPlayersResult {
  rows: PlayerExportRow[];
  fileName: string;
}

export interface ExportRatingsResult {
  summaryRows: RatingSummaryRow[];
  detailRows: RatingDetailRow[];
  fileNameBase: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const safeDate = (val: any): string => {
  if (!val) return '';
  try {
    if (val?.toDate) return format(val.toDate(), 'MM/dd/yyyy');
    const d = typeof val === 'string' ? parseISO(val) : new Date(val);
    return isValid(d) ? format(d, 'MM/dd/yyyy') : '';
  } catch { return ''; }
};

const ratingToNum = (v: string | undefined): number | null => {
  if (!v || v === 'NR' || v === 'NA' || v === 'Not Rated' || v === 'Not Applicable') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

const avgRatings = (values: (number | null)[]): string => {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return 'N/A';
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
};

const sanitizeFileName = (s: string) => s.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');

// ── Get Export Scope ───────────────────────────────────────────────────────

export async function getExportScopeAction(uid: string): Promise<ExportScope> {
  const userSnap = await adminDb.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new Error('User not found.');
  const user = userSnap.data()!;
  const roles: string[] = user.roles || [];

  const isSuperAdmin = roles.includes('admin');
  const isOrgAdmin = roles.includes('Organization Admin');
  const isSeriesAdmin = roles.includes('Series Admin');

  // Fetch org names for lookup
  const orgNameMap: Record<string, string> = {};
  const orgs: ExportOrg[] = [];

  if (isSuperAdmin) {
    const orgsSnap = await adminDb.collection('organizations').orderBy('name').get();
    orgsSnap.docs.forEach(d => {
      const name = (d.data().name || '').trim();
      orgNameMap[d.id] = name;
      orgs.push({ id: d.id, name });
    });
  } else {
    const assignedOrgIds: string[] = user.assignedOrganizationIds || [];
    for (const orgId of assignedOrgIds) {
      const orgSnap = await adminDb.collection('organizations').doc(orgId).get();
      if (orgSnap.exists) {
        const name = (orgSnap.data()!.name || '').trim();
        orgNameMap[orgId] = name;
        orgs.push({ id: orgId, name });
      }
    }
  }

  // Fetch series scoped by role
  let series: ExportSeries[] = [];

  if (isSuperAdmin || isOrgAdmin) {
    // All active series — scoped by org if org admin
    let seriesQuery: FirebaseFirestore.Query = adminDb.collection('series').where('status', '==', 'active');
    if (isOrgAdmin && !isSuperAdmin && orgs.length > 0) {
      seriesQuery = seriesQuery.where('organizationId', 'in', orgs.map(o => o.id));
    }
    const snap = await seriesQuery.get();
    series = snap.docs.map(d => ({
      id: d.id,
      name: (d.data().name || '').trim(),
      year: d.data().year || 0,
      ageCategory: d.data().ageCategory || '',
      organizationId: d.data().organizationId || '',
      organizationName: orgNameMap[d.data().organizationId] || '',
      participatingTeams: d.data().participatingTeams || [],
    }));
  } else if (isSeriesAdmin) {
    const assignedSeriesIds: string[] = user.assignedSeriesIds || [];
    for (const sid of assignedSeriesIds) {
      const snap = await adminDb.collection('series').doc(sid).get();
      if (snap.exists && snap.data()!.status === 'active') {
        series.push({
          id: snap.id,
          name: (snap.data()!.name || '').trim(),
          year: snap.data()!.year || 0,
          ageCategory: snap.data()!.ageCategory || '',
          organizationId: snap.data()!.organizationId || '',
          organizationName: orgNameMap[snap.data()!.organizationId] || '',
          participatingTeams: snap.data()!.participatingTeams || [],
        });
      }
    }
  }

  series.sort((a, b) => a.name.localeCompare(b.name));

  return { isSuperAdmin, isOrgAdmin, isSeriesAdmin, orgs, series };
}

// ── Export Players ─────────────────────────────────────────────────────────

export async function exportPlayersAction(params: {
  seriesId?: string;
  organizationId?: string;
  seriesName?: string;
  orgName?: string;
}): Promise<ExportPlayersResult> {
  const { seriesId, organizationId, seriesName, orgName } = params;

  let playerIds: string[] = [];
  let seriesLabel = '';
  let teamNameById: Record<string, string> = {};

  if (seriesId) {
    // Get series and its participating teams
    const seriesSnap = await adminDb.collection('series').doc(seriesId).get();
    if (!seriesSnap.exists) throw new Error('Series not found.');
    const seriesData = seriesSnap.data()!;
    const teamIds: string[] = seriesData.participatingTeams || [];
    seriesLabel = `${(seriesData.name || '').trim()}_${seriesData.year || ''}`;

    // Fetch all players from those teams
    const playerIdSet = new Set<string>();
    for (const tid of teamIds) {
      const teamSnap = await adminDb.collection('teams').doc(tid).get();
      if (teamSnap.exists) {
        teamNameById[tid] = (teamSnap.data()!.name || '').trim();
        const pids: string[] = teamSnap.data()!.playerIds || [];
        pids.forEach(p => playerIdSet.add(p));
      }
    }
    playerIds = Array.from(playerIdSet);
  } else if (organizationId) {
    // All players in org
    const snap = await adminDb.collection('players').where('organizationId', '==', organizationId).get();
    playerIds = snap.docs.map(d => d.id);
    seriesLabel = orgName ? sanitizeFileName(orgName) : organizationId;

    // Fetch team names for primaryTeamId lookup
    const teamsSnap = await adminDb.collection('teams').where('organizationId', '==', organizationId).get();
    teamsSnap.docs.forEach(d => { teamNameById[d.id] = (d.data().name || '').trim(); });
  }

  // Fetch player docs in chunks of 30
  const rows: PlayerExportRow[] = [];
  for (let i = 0; i < playerIds.length; i += 30) {
    const chunk = playerIds.slice(i, i + 30);
    const snap = await adminDb.collection('players').where('__name__', 'in', chunk).get();
    snap.docs.forEach(d => {
      const p = d.data();
      rows.push({
        PlayerName: (p.name || '').trim(),
        FirstName: (p.firstName || '').trim(),
        LastName: (p.lastName || '').trim(),
        CricClubsID: p.cricClubsId || '',
        DateOfBirth: p.dateOfBirth || '',
        Gender: p.gender || '',
        PrimarySkill: p.primarySkill || '',
        DominantHandBatting: p.dominantHandBatting || '',
        BattingOrder: p.battingOrder || '',
        DominantHandBowling: p.dominantHandBowling || '',
        BowlingStyle: p.bowlingStyle || '',
        ClubName: p.clubName || '',
        PrimaryTeamName: p.primaryTeamId ? (teamNameById[p.primaryTeamId] || p.primaryTeamId) : '',
        GamesPlayed: p.gamesPlayed || 0,
        SeriesName: seriesName || '',
        OrganizationId: p.organizationId || '',
      });
    });
  }

  rows.sort((a, b) => a.PlayerName.localeCompare(b.PlayerName));

  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const fileName = `players_${seriesLabel}_${dateStr}`;

  return { rows, fileName };
}

// ── Export Ratings ─────────────────────────────────────────────────────────

export async function exportRatingsAction(params: {
  seriesId?: string;
  organizationId?: string;
  ratingsFilter: 'all' | 'finalized' | 'not_finalized';
  seriesName?: string;
  orgName?: string;
}): Promise<ExportRatingsResult> {
  const { seriesId, organizationId, ratingsFilter, seriesName, orgName } = params;

  // ── Fetch games ──────────────────────────────────────────────────────────
  let gamesQuery: FirebaseFirestore.Query = adminDb.collection('games');
  if (seriesId) {
    gamesQuery = gamesQuery.where('seriesId', '==', seriesId);
  } else if (organizationId) {
    gamesQuery = gamesQuery.where('organizationId', '==', organizationId);
  }
  if (ratingsFilter === 'finalized') gamesQuery = gamesQuery.where('ratingsFinalized', '==', true);
  if (ratingsFilter === 'not_finalized') gamesQuery = gamesQuery.where('ratingsFinalized', '==', false);

  const gamesSnap = await gamesQuery.get();
  if (gamesSnap.empty) return { summaryRows: [], detailRows: [], fileNameBase: 'ratings_export' };

  // ── Build game metadata map ──────────────────────────────────────────────
  const gameMap: Record<string, {
    seriesId: string; date: string; team1: string; team2: string;
    venue: string; finalized: boolean; selectorUserIds: string[];
  }> = {};
  const seriesIds = new Set<string>();

  gamesSnap.docs.forEach(d => {
    const g = d.data();
    gameMap[d.id] = {
      seriesId: g.seriesId || '',
      date: safeDate(g.date),
      team1: g.team1 || '',
      team2: g.team2 || '',
      venue: g.venue || '',
      finalized: !!g.ratingsFinalized,
      selectorUserIds: g.selectorUserIds || [],
    };
    if (g.seriesId) seriesIds.add(g.seriesId);
  });

  // ── Fetch series names ───────────────────────────────────────────────────
  const seriesNameMap: Record<string, string> = {};
  for (const sid of Array.from(seriesIds)) {
    const snap = await adminDb.collection('series').doc(sid).get();
    if (snap.exists) seriesNameMap[sid] = (snap.data()!.name || '').trim();
  }

  // ── Collect all selector UIDs → emails ───────────────────────────────────
  const allSelectorUids = new Set<string>();
  gamesSnap.docs.forEach(d => {
    (d.data().selectorUserIds || []).forEach((uid: string) => allSelectorUids.add(uid));
  });

  const selectorEmailMap: Record<string, string> = {};
  const selectorUidArr = Array.from(allSelectorUids);
  for (let i = 0; i < selectorUidArr.length; i += 30) {
    const chunk = selectorUidArr.slice(i, i + 30);
    const snap = await adminDb.collection('users').where('__name__', 'in', chunk).get();
    snap.docs.forEach(d => { selectorEmailMap[d.id] = d.data().email || d.id; });
  }

  // ── Fetch all player ratings for these games ─────────────────────────────
  const gameIds = gamesSnap.docs.map(d => d.id);
  const allRatingDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < gameIds.length; i += 30) {
    const chunk = gameIds.slice(i, i + 30);
    const snap = await adminDb.collection('playerRatings').where('gameId', 'in', chunk).get();
    snap.docs.forEach(d => allRatingDocs.push(d));
  }

  // ── Collect player IDs → names ───────────────────────────────────────────
  const allPlayerIds = new Set<string>();
  allRatingDocs.forEach(d => { if (d.data().playerId) allPlayerIds.add(d.data().playerId); });

  const playerNameMap: Record<string, string> = {};
  const playerIdArr = Array.from(allPlayerIds);
  for (let i = 0; i < playerIdArr.length; i += 30) {
    const chunk = playerIdArr.slice(i, i + 30);
    const snap = await adminDb.collection('players').where('__name__', 'in', chunk).get();
    snap.docs.forEach(d => { playerNameMap[d.id] = (d.data().name || '').trim(); });
  }

  // ── Build summary + detail rows ───────────────────────────────────────────
  const summaryRows: RatingSummaryRow[] = [];
  const detailRows: RatingDetailRow[] = [];

  for (const ratingDoc of allRatingDocs) {
    const r = ratingDoc.data();
    const game = gameMap[r.gameId];
    if (!game) continue;

    const playerName = playerNameMap[r.playerId] || r.playerId;
    const seriesLabel = seriesNameMap[game.seriesId] || '';

    const skillKeys = ['batting', 'bowling', 'fielding', 'wicketKeeping'] as const;
    const commentKeys = ['battingComments', 'bowlingComments', 'fieldingComments', 'wicketKeepingComments'] as const;

    // Collect per-selector ratings from comments maps (selectors who rated)
    // Ratings themselves are stored as single values per skill (last saved)
    // Comments are stored as { selectorUid: comment }
    // We need to reconstruct per-selector from selectorUserIds on the game

    const selectorIds = game.selectorUserIds;
    let selectorsRatedCount = 0;

    // For summary: use the stored aggregate rating values directly
    const battingNums: number[] = [];
    const bowlingNums: number[] = [];
    const fieldingNums: number[] = [];
    const wkNums: number[] = [];

    // The rating doc stores the last selector's values — for proper per-selector
    // we look at battingComments keys as proxy for who has rated
    const ratedSelectorUids = new Set<string>();
    commentKeys.forEach(ck => {
      const comments = r[ck] as Record<string, string> | undefined;
      if (comments) Object.keys(comments).forEach(uid => ratedSelectorUids.add(uid));
    });
    // Also count from selector user ids if they have any numeric rating
    selectorIds.forEach((uid: string) => {
      // We can't reconstruct individual selector ratings post-save (they're merged)
      // So we use comment presence as signal
    });

    // Use the stored aggregate numeric values for summary
    const bNum = ratingToNum(r.batting);
    const bowNum = ratingToNum(r.bowling);
    const fNum = ratingToNum(r.fielding);
    const wkNum = ratingToNum(r.wicketKeeping);
    if (bNum !== null) battingNums.push(bNum);
    if (bowNum !== null) bowlingNums.push(bowNum);
    if (fNum !== null) fieldingNums.push(fNum);
    if (wkNum !== null) wkNums.push(wkNum);

    selectorsRatedCount = ratedSelectorUids.size || (bNum !== null ? 1 : 0);

    summaryRows.push({
      PlayerName: playerName,
      SeriesName: seriesLabel,
      GameDate: game.date,
      Team1: game.team1,
      Team2: game.team2,
      Venue: game.venue,
      AvgBatting: bNum !== null ? bNum.toFixed(2) : 'N/A',
      AvgBowling: bowNum !== null ? bowNum.toFixed(2) : 'N/A',
      AvgFielding: fNum !== null ? fNum.toFixed(2) : 'N/A',
      AvgWicketKeeping: wkNum !== null ? wkNum.toFixed(2) : 'N/A',
      SelectorsRated: selectorsRatedCount,
      RatingsFinalized: game.finalized ? 'Yes' : 'No',
    });

    // Detail rows — one per selector who has commented or is assigned
    // Since individual selector ratings aren't stored separately after merge,
    // we produce detail rows per selector using comment data
    const processedSelectors = new Set<string>();

    // First process selectors who have comments (most complete data)
    for (const selectorUid of Array.from(ratedSelectorUids)) {
      processedSelectors.add(selectorUid);
      const email = selectorEmailMap[selectorUid] || selectorUid;

      detailRows.push({
        PlayerName: playerName,
        SeriesName: seriesLabel,
        GameDate: game.date,
        Team1: game.team1,
        Team2: game.team2,
        Venue: game.venue,
        SelectorEmail: email,
        Batting: r.batting || 'N/A',
        Bowling: r.bowling || 'N/A',
        Fielding: r.fielding || 'N/A',
        WicketKeeping: r.wicketKeeping || 'N/A',
        BattingComment: (r.battingComments as Record<string, string>)?.[selectorUid] || '',
        BowlingComment: (r.bowlingComments as Record<string, string>)?.[selectorUid] || '',
        FieldingComment: (r.fieldingComments as Record<string, string>)?.[selectorUid] || '',
        WicketKeepingComment: (r.wicketKeepingComments as Record<string, string>)?.[selectorUid] || '',
      });
    }

    // Add assigned selectors with no comments as empty detail rows
    for (const selectorUid of selectorIds) {
      if (!processedSelectors.has(selectorUid)) {
        detailRows.push({
          PlayerName: playerName,
          SeriesName: seriesLabel,
          GameDate: game.date,
          Team1: game.team1,
          Team2: game.team2,
          Venue: game.venue,
          SelectorEmail: selectorEmailMap[selectorUid] || selectorUid,
          Batting: 'Not Rated',
          Bowling: 'Not Rated',
          Fielding: 'Not Rated',
          WicketKeeping: 'Not Rated',
          BattingComment: '',
          BowlingComment: '',
          FieldingComment: '',
          WicketKeepingComment: '',
        });
      }
    }
  }

  // Sort by series, game date, player name
  const sortKey = (r: { SeriesName: string; GameDate: string; PlayerName: string }) =>
    `${r.SeriesName}|${r.GameDate}|${r.PlayerName}`;
  summaryRows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  detailRows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const dateStr = format(new Date(), 'yyyy-MM-dd');
  const scopeLabel = seriesName
    ? sanitizeFileName(seriesName)
    : orgName
    ? sanitizeFileName(orgName)
    : 'export';
  const fileNameBase = `ratings_${scopeLabel}_${dateStr}`;

  return { summaryRows, detailRows, fileNameBase };
}
