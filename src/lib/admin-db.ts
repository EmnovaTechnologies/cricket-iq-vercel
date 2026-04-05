/**
 * Server-side Firestore functions using Firebase Admin SDK.
 * Used by server actions that run without user auth context (e.g. AI team suggestion).
 */

import * as admin from 'firebase-admin';
import { adminDb } from './firebase-admin';
import type {
  Player, Game, PlayerRating, Team, Series,
  FitnessTestHeader, FitnessTestResult, PlayerWithRatings, RatingValue
} from '../../types';
import { differenceInYears, parseISO, isValid, format } from 'date-fns';

// ── Helpers ──────────────────────────────────────────────────────────────────

export const ratingValueToNumber = (value?: RatingValue): number | null => {
  if (value === undefined || value === 'Not Rated' || value === 'Not Applicable' || value === 'NR') return null;
  const num = parseFloat(value as string);
  return isNaN(num) ? null : num;
};

const safeToISOString = (dateValue: any): string | null => {
  if (!dateValue) return null;
  if (typeof dateValue?.toDate === 'function') return dateValue.toDate().toISOString();
  if (dateValue instanceof Date) return dateValue.toISOString();
  if (typeof dateValue === 'string') {
    try { return new Date(dateValue).toISOString(); } catch { return null; }
  }
  return null;
};

// ── Series ────────────────────────────────────────────────────────────────────

export async function adminGetSeriesById(id: string): Promise<Series | undefined> {
  if (!id) return undefined;
  const snap = await adminDb.collection('series').doc(id).get();
  if (!snap.exists) return undefined;
  const data = snap.data()!;
  return {
    id: snap.id, ...data,
    name: data.name?.trim(),
    participatingTeams: data.participatingTeams || [],
    venueIds: data.venueIds || [],
    seriesAdminUids: data.seriesAdminUids || [],
    status: data.status || 'active',
    maleCutoffDate: data.maleCutoffDate || null,
    femaleCutoffDate: data.femaleCutoffDate || null,
    createdAt: safeToISOString(data.createdAt),
    savedAiTeam: data.savedAiTeam || undefined,
    savedAiTeamAt: safeToISOString(data.savedAiTeamAt),
  } as Series;
}

export async function adminGetAllSeries(organizationId?: string): Promise<Series[]> {
  let q = adminDb.collection('series') as FirebaseFirestore.Query;
  if (organizationId) q = q.where('organizationId', '==', organizationId);
  const snap = await q.get();
  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id, ...data,
      name: data.name?.trim(),
      participatingTeams: data.participatingTeams || [],
      venueIds: data.venueIds || [],
      seriesAdminUids: data.seriesAdminUids || [],
      status: data.status || 'active',
      maleCutoffDate: data.maleCutoffDate || null,
      femaleCutoffDate: data.femaleCutoffDate || null,
      createdAt: safeToISOString(data.createdAt),
    } as Series;
  });
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function adminGetTeamsForSeries(seriesId: string): Promise<Team[]> {
  const series = await adminGetSeriesById(seriesId);
  if (!series?.participatingTeams?.length || series.status === 'archived') return [];
  const teams: Team[] = [];
  const chunks = [];
  for (let i = 0; i < series.participatingTeams.length; i += 30)
    chunks.push(series.participatingTeams.slice(i, i + 30));
  for (const chunk of chunks) {
    const snap = await adminDb.collection('teams')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    snap.docs.forEach(doc => {
      const data = doc.data();
      teams.push({ id: doc.id, ...data, name: data.name?.trim(), teamManagerUids: data.teamManagerUids || [] } as Team);
    });
  }
  return teams;
}

// ── Games ─────────────────────────────────────────────────────────────────────

export async function adminGetGamesForSeries(seriesId: string): Promise<Game[]> {
  const series = await adminGetSeriesById(seriesId);
  if (!series || series.status === 'archived') return [];
  const snap = await adminDb.collection('games')
    .where('seriesId', '==', seriesId)
    .get();
  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id, ...data,
      date: safeToISOString(data.date),
      selectorUserIds: data.selectorUserIds || [],
      status: data.status || 'active',
      selectorCertifications: data.selectorCertifications || {},
      ratingsFinalized: data.ratingsFinalized || false,
    } as Game;
  }).filter(g => g.status !== 'archived');
}

export async function adminGetAllGames(organizationId?: string): Promise<Game[]> {
  let q = adminDb.collection('games') as FirebaseFirestore.Query;
  if (organizationId) q = q.where('organizationId', '==', organizationId);
  const snap = await q.get();
  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id, ...data,
      date: safeToISOString(data.date),
      selectorUserIds: data.selectorUserIds || [],
      status: data.status || 'active',
      selectorCertifications: data.selectorCertifications || {},
      ratingsFinalized: data.ratingsFinalized || false,
    } as Game;
  });
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function adminGetAllPlayers(organizationId?: string): Promise<Player[]> {
  let q = adminDb.collection('players') as FirebaseFirestore.Query;
  if (organizationId) q = q.where('organizationId', '==', organizationId);
  const snap = await q.get();
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as Player))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function adminGetPlayersFromIds(playerIds: string[]): Promise<Player[]> {
  if (!playerIds?.length) return [];
  const players: Player[] = [];
  for (let i = 0; i < playerIds.length; i += 30) {
    const chunk = playerIds.slice(i, i + 30);
    if (chunk.length) {
      const snap = await adminDb.collection('players')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.docs.forEach(doc => players.push({ id: doc.id, ...doc.data() } as Player));
    }
  }
  return players;
}

// ── Ratings ───────────────────────────────────────────────────────────────────

export async function adminGetAllRatings(organizationId?: string): Promise<PlayerRating[]> {
  let q = adminDb.collection('playerRatings') as FirebaseFirestore.Query;
  if (organizationId) q = q.where('organizationId', '==', organizationId);
  const snap = await q.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlayerRating));
}

export async function adminGetFitnessTestsForSeries(seriesId: string): Promise<FitnessTestHeader[]> {
  const snap = await adminDb.collection('fitnessTests')
    .where('seriesId', '==', seriesId)
    .where('isCertified', '==', true)
    .get();
  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id, ...data,
      testDate: safeToISOString(data.testDate),
      createdAt: safeToISOString(data.createdAt),
    } as FitnessTestHeader;
  });
}

export async function adminGetFitnessTestResults(
  playerIds: string[],
  headerIds: string[]
): Promise<FitnessTestResult[]> {
  if (!playerIds.length || !headerIds.length) return [];
  const results: FitnessTestResult[] = [];
  for (let i = 0; i < playerIds.length; i += 30) {
    const chunk = playerIds.slice(i, i + 30);
    if (chunk.length) {
      const snap = await adminDb.collection('fitnessTestResults')
        .where('playerId', 'in', chunk)
        .where('fitnessTestHeaderId', 'in', headerIds)
        .get();
      snap.docs.forEach(doc => results.push({ id: doc.id, ...doc.data() } as FitnessTestResult));
    }
  }
  return results;
}

// ── Eligibility ───────────────────────────────────────────────────────────────

function getNumericAgeLimit(ageCategory?: string): number | null {
  if (!ageCategory) return null;
  const match = ageCategory.match(/Under (\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function isPlayerAgeEligibleForTeamCategory(
  player: Pick<Player, 'dateOfBirth' | 'gender'>,
  teamAgeCategory: string,
  referenceYear: number
): boolean {
  if (!player.dateOfBirth || !player.gender) return false;
  try {
    const dob = parseISO(player.dateOfBirth);
    if (!isValid(dob)) return false;
    const refDate = new Date(referenceYear, 7, 31);
    const age = differenceInYears(refDate, dob);
    const limit = getNumericAgeLimit(teamAgeCategory);
    if (limit === null) return false;
    const effectiveLimit = player.gender === 'Female' ? limit + 2 + 1 : limit + 1;
    return age < effectiveLimit;
  } catch { return false; }
}

export function isPlayerEligibleForSeries(player: Player, series: Series): boolean {
  if (!player.dateOfBirth || !player.gender) return false;
  const dob = parseISO(player.dateOfBirth);
  if (!isValid(dob)) return false;

  const cutoffDateString = player.gender === 'Male' ? series.maleCutoffDate : series.femaleCutoffDate;

  if (!cutoffDateString) {
    return isPlayerAgeEligibleForTeamCategory(player, series.ageCategory, series.year);
  }
  try {
    const cutoff = parseISO(cutoffDateString);
    if (!isValid(cutoff)) return false;
    return dob.getTime() >= cutoff.getTime();
  } catch { return false; }
}

// ── Combined: getPlayersWithDetails (admin version) ───────────────────────────

export async function adminGetPlayersWithDetails(organizationId?: string): Promise<PlayerWithRatings[]> {
  const playerToTeamRosterMap = new Map<string, string>();
  const teamNameMap = new Map<string, string>();
  let players: Player[] = [];

  if (organizationId) {
    const nativePlayers = await adminGetAllPlayers(organizationId);
    const nativePlayerIds = new Set(nativePlayers.map(p => p.id));

    const teamsSnap = await adminDb.collection('teams').where('organizationId', '==', organizationId).get();
    const orgTeams = teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));

    const allRosteredIds = new Set<string>();
    orgTeams.forEach(team => {
      teamNameMap.set(team.id, team.name);
      (team.playerIds || []).forEach(pid => {
        allRosteredIds.add(pid);
        if (!playerToTeamRosterMap.has(pid)) playerToTeamRosterMap.set(pid, team.name);
      });
    });

    const guestIds = Array.from(allRosteredIds).filter(pid => !nativePlayerIds.has(pid));
    const guestPlayers = guestIds.length ? await adminGetPlayersFromIds(guestIds) : [];

    const uniqueMap = new Map<string, Player>();
    [...nativePlayers, ...guestPlayers].forEach(p => uniqueMap.set(p.id, p));
    players = Array.from(uniqueMap.values());
  } else {
    players = await adminGetAllPlayers();
    const teamsSnap = await adminDb.collection('teams').get();
    teamsSnap.docs.forEach(doc => {
      const data = doc.data();
      teamNameMap.set(doc.id, data.name);
      (data.playerIds || []).forEach((pid: string) => {
        if (!playerToTeamRosterMap.has(pid)) playerToTeamRosterMap.set(pid, data.name);
      });
    });
  }

  players.sort((a, b) => a.name.localeCompare(b.name));

  const allGames = await adminGetAllGames(organizationId);
  const gameMap = new Map(allGames.map(g => [g.id, g]));

  const allSeries = await adminGetAllSeries(organizationId);
  const seriesMap = new Map(allSeries.map(s => [s.id, s]));

  let ratingsQuery = adminDb.collection('playerRatings') as FirebaseFirestore.Query;
  if (organizationId) ratingsQuery = ratingsQuery.where('organizationId', '==', organizationId);
  const ratingsSnap = await ratingsQuery.get();

  const allRatings: PlayerRating[] = ratingsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as PlayerRating))
    .filter(r => gameMap.has(r.gameId));

  const enriched = allRatings.map(r => {
    const game = gameMap.get(r.gameId);
    if (!game) return r;
    const gameDateStr = safeToISOString(game.date);
    const gameDate = gameDateStr ? format(parseISO(gameDateStr), 'PP') : 'Unknown Date';
    const gameName = `${game.team1} vs ${game.team2} on ${gameDate}`;
    const seriesName = game.seriesId ? seriesMap.get(game.seriesId)?.name : undefined;
    return { ...r, gameName, seriesName };
  });

  const ratingsByPlayer = new Map<string, PlayerRating[]>();
  enriched.forEach(r => {
    const curr = ratingsByPlayer.get(r.playerId) || [];
    curr.push(r);
    ratingsByPlayer.set(r.playerId, curr);
  });

  return players.map(player => {
    const ratings = ratingsByPlayer.get(player.id) || [];

    const calcAvg = (key: keyof Pick<PlayerRating, 'batting' | 'bowling' | 'fielding' | 'wicketKeeping'>) => {
      const scores = ratings.map(r => ratingValueToNumber(r[key])).filter(s => s !== null) as number[];
      if (!scores.length) return 'N/A';
      return parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
    };

    const primaryScores = ratings.map(r => {
      let val: RatingValue | undefined;
      if (player.primarySkill === 'Batting') val = r.batting;
      else if (player.primarySkill === 'Bowling') val = r.bowling;
      else if (player.primarySkill === 'Wicket Keeping') val = r.wicketKeeping;
      return ratingValueToNumber(val);
    }).filter(s => s !== null) as number[];

    const calculatedAverageScore = primaryScores.length
      ? parseFloat((primaryScores.reduce((a, b) => a + b, 0) / primaryScores.length).toFixed(1))
      : 0;

    let age: number | undefined;
    if (player.dateOfBirth) {
      try {
        const dob = parseISO(player.dateOfBirth);
        if (isValid(dob)) age = differenceInYears(new Date(), dob);
      } catch { /* ignore */ }
    }

    return {
      ...player,
      gamesPlayed: new Set(ratings.map(r => r.gameId)).size,
      ratings,
      averageBattingScore: calcAvg('batting'),
      averageBowlingScore: calcAvg('bowling'),
      averageFieldingScore: calcAvg('fielding'),
      averageWicketKeepingScore: calcAvg('wicketKeeping'),
      calculatedAverageScore,
      age,
      primaryTeamName: player.primaryTeamId ? teamNameMap.get(player.primaryTeamId) : undefined,
      currentTeamName: playerToTeamRosterMap.get(player.id),
    } as PlayerWithRatings;
  });
}
