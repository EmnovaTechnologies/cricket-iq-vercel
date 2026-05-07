'use server';

/**
 * FILE: src/lib/actions/selector-mobile-action.ts
 *
 * Fetches all pending action items for a selector's mobile landing page:
 * - Assigned games not yet rated/finalized
 * - Assigned scorecards without a match report submitted by this selector
 * - Assigned camps with unassessed players
 *
 * Respects selectionModel: rating → games only, performance → scorecards only,
 * hybrid → both games and scorecards.
 */

import { adminDb } from '../firebase-admin';

export interface SelectorPendingGame {
  gameId: string;
  team1: string;
  team2: string;
  date: string;
  seriesName: string;
  isRated: boolean; // true if this selector has submitted ratings
}

export interface SelectorPendingScorecard {
  scorecardId: string;
  team1: string;
  team2: string;
  date: string;
  seriesName: string;
  hasReport: boolean; // true if this selector has submitted a report
}

export interface SelectorPendingCamp {
  campId: string;
  campName: string;
  status: string;
  totalPlayers: number;
  assessedByMe: number;
  pendingCount: number;
}

export interface SelectorMobilePendingResult {
  success: boolean;
  error?: string;
  games: SelectorPendingGame[];
  scorecards: SelectorPendingScorecard[];
  camps: SelectorPendingCamp[];
  pendingTotal: number;
  selectionModel: string;
}

export async function getSelectorMobilePendingAction(
  selectorUid: string,
  organizationId: string,
  selectionModel: string = 'hybrid'
): Promise<SelectorMobilePendingResult> {
  try {
    const showGames = selectionModel === 'rating' || selectionModel === 'hybrid';
    const showScorecards = selectionModel === 'performance' || selectionModel === 'hybrid';

    const [games, scorecards, camps] = await Promise.all([
      showGames ? fetchPendingGames(selectorUid, organizationId) : Promise.resolve([]),
      showScorecards ? fetchPendingScorecards(selectorUid, organizationId) : Promise.resolve([]),
      fetchPendingCamps(selectorUid, organizationId),
    ]);

    const pendingTotal =
      games.filter(g => !g.isRated).length +
      scorecards.filter(s => !s.hasReport).length +
      camps.filter(c => c.pendingCount > 0).length;

    return { success: true, games, scorecards, camps, pendingTotal, selectionModel };
  } catch (e: any) {
    console.error('[getSelectorMobilePendingAction] Error:', e);
    return { success: false, error: e.message, games: [], scorecards: [], camps: [], pendingTotal: 0, selectionModel };
  }
}

// ─── Fetch assigned games ─────────────────────────────────────────────────────

async function fetchPendingGames(selectorUid: string, organizationId: string): Promise<SelectorPendingGame[]> {
  const snap = await adminDb.collection('games')
    .where('organizationId', '==', organizationId)
    .where('selectorUserIds', 'array-contains', selectorUid)
    .orderBy('date', 'desc')
    .limit(20)
    .get();

  if (snap.empty) return [];

  // Get series names in one batch
  const seriesIds = [...new Set(snap.docs.map(d => d.data().seriesId).filter(Boolean))];
  const seriesNames = new Map<string, string>();
  await Promise.all(seriesIds.map(async sid => {
    try {
      const s = await adminDb.collection('series').doc(sid).get();
      if (s.exists) seriesNames.set(sid, s.data()!.name || '');
    } catch {}
  }));

  // Check which games this selector has rated
  const gameIds = snap.docs.map(d => d.id);
  const ratedSet = new Set<string>();
  // Check playerRatings for this selector
  const chunks: string[][] = [];
  for (let i = 0; i < gameIds.length; i += 30) chunks.push(gameIds.slice(i, i + 30));
  for (const chunk of chunks) {
    const rSnap = await adminDb.collection('playerRatings')
      .where('gameId', 'in', chunk)
      .where('ratedBy', '==', selectorUid)
      .get();
    rSnap.docs.forEach(d => ratedSet.add(d.data().gameId));
  }

  return snap.docs.map(d => {
    const data = d.data();
    return {
      gameId: d.id,
      team1: data.team1Name || data.team1 || 'Team 1',
      team2: data.team2Name || data.team2 || 'Team 2',
      date: data.date || '',
      seriesName: seriesNames.get(data.seriesId) || '',
      isRated: ratedSet.has(d.id),
    };
  });
}

// ─── Fetch assigned scorecards ────────────────────────────────────────────────

async function fetchPendingScorecards(selectorUid: string, organizationId: string): Promise<SelectorPendingScorecard[]> {
  // Get scorecards assigned to this selector via scorecardSelectorAssignments
  const assignSnap = await adminDb.collection('matchScorecards')
    .where('organizationId', '==', organizationId)
    .get();

  // Filter client-side for assigned selector
  const assigned = assignSnap.docs.filter(d => {
    const assignments = d.data().selectorAssignments || [];
    return assignments.some((a: any) => a.selectorUid === selectorUid);
  });

  if (assigned.length === 0) return [];

  // Get series names
  const seriesIds = [...new Set(assigned.map(d => d.data().seriesId).filter(Boolean))];
  const seriesNames = new Map<string, string>();
  await Promise.all(seriesIds.map(async sid => {
    try {
      const s = await adminDb.collection('series').doc(sid).get();
      if (s.exists) seriesNames.set(sid, s.data()!.name || '');
    } catch {}
  }));

  // Check which scorecards this selector has submitted a match report for
  const scorecardIds = assigned.map(d => d.id);
  const reportedSet = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < scorecardIds.length; i += 30) chunks.push(scorecardIds.slice(i, i + 30));
  for (const chunk of chunks) {
    const rSnap = await adminDb.collection('matchReports')
      .where('scorecardId', 'in', chunk)
      .where('submittedBy', '==', selectorUid)
      .get();
    rSnap.docs.forEach(d => reportedSet.add(d.data().scorecardId));
  }

  return assigned.map(d => {
    const data = d.data();
    return {
      scorecardId: d.id,
      team1: data.team1 || 'Team 1',
      team2: data.team2 || 'Team 2',
      date: data.date || '',
      seriesName: seriesNames.get(data.seriesId) || '',
      hasReport: reportedSet.has(d.id),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Fetch assigned camps ─────────────────────────────────────────────────────

async function fetchPendingCamps(selectorUid: string, organizationId: string): Promise<SelectorPendingCamp[]> {
  const snap = await adminDb.collection('selectionCamps')
    .where('organizationId', '==', organizationId)
    .where('status', 'in', ['active', 'upcoming'])
    .get();

  // Filter to assigned camps
  const assigned = snap.docs.filter(d => {
    const selectors = d.data().assignedSelectors || [];
    return selectors.some((s: any) => s.uid === selectorUid);
  });

  if (assigned.length === 0) return [];

  return Promise.all(assigned.map(async d => {
    const data = d.data();
    const campId = d.id;

    const [playersRes, assessRes] = await Promise.all([
      adminDb.collection('campPlayers').where('campId', '==', campId).where('status', '!=', 'withdrawn').get(),
      adminDb.collection('campAssessments').where('campId', '==', campId).where('assessedByUid', '==', selectorUid).get(),
    ]);

    const totalPlayers = playersRes.size;
    // Get unique bibs assessed by this selector
    const assessedBibs = new Set(assessRes.docs.map(a => a.data().bibNumber));
    const assessedByMe = assessedBibs.size;
    const pendingCount = Math.max(0, totalPlayers - assessedByMe);

    return {
      campId,
      campName: data.name || 'Camp',
      status: data.status || 'upcoming',
      totalPlayers,
      assessedByMe,
      pendingCount,
    };
  }));
}

// ─── Get all assigned scorecard IDs (for swipe navigator) ────────────────────

export async function getSelectorAssignedScorecardIdsAction(
  selectorUid: string,
  organizationId: string
): Promise<string[]> {
  const snap = await adminDb.collection('matchScorecards')
    .where('organizationId', '==', organizationId)
    .get();
  return snap.docs
    .filter(d => (d.data().selectorAssignments || []).some((a: any) => a.selectorUid === selectorUid))
    .map(d => d.id);
}

// ─── Get all assigned camp IDs (for swipe navigator) ─────────────────────────

export async function getSelectorAssignedCampIdsAction(
  selectorUid: string,
  organizationId: string
): Promise<string[]> {
  const snap = await adminDb.collection('selectionCamps')
    .where('organizationId', '==', organizationId)
    .get();
  return snap.docs
    .filter(d => (d.data().assignedSelectors || []).some((s: any) => s.uid === selectorUid))
    .map(d => d.id);
}
