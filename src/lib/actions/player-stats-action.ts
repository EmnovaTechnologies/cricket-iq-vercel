'use server';

/**
 * FILE: src/lib/actions/player-stats-action.ts
 *
 * Fetches all data for the My Stats player dashboard:
 * - Scorecard stats for this player (via scorecardPlayers linkedPlayerId)
 * - Series-wide aggregated stats for anonymous benchmarking
 * - Accepted match report deltas for this player
 * - Camp performance (assessments + fitness)
 */

import { adminDb } from '../firebase-admin';
import type { MatchScorecard, AggregatedPlayerStats } from '@/types';
import { aggregatePlayerStats } from '../utils/scorecard-aggregation-engine';
import { DEFAULT_SCORING_CONFIG } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerGameStat {
  scorecardId: string;
  date: string;
  team1: string;
  team2: string;
  runs: number;
  balls: number;
  strikeRate: number;
  fours: number;
  sixes: number;
  wickets: number;
  overs: number;
  economy: number;
  catches: number;
  runOuts: number;
  stumpings: number;
  battingScore: number;
  bowlingScore: number;
  fieldingScore: number;
  totalScore: number;
}

export interface PlayerFeedbackItem {
  deltaId: string;
  dimension: 'batting' | 'bowling' | 'fielding' | 'keeping' | 'attitude';
  delta: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  gameDate: string; // date only, no selector name
}

export interface CampPerformance {
  campName: string;
  campId: string;
  avgBatting: number;
  avgBowling: number;
  avgFielding: number;
  avgFitness: number;
  avgAttitude: number;
  avgOverall: number;
  coachCount: number;
  fitnessScore?: number;
  fitnessPassed?: boolean;
  fitnessTestType?: string;
}

export interface SeriesBenchmark {
  metric: string;
  label: string;
  playerValue: number;
  seriesMedian: number;
  seriesMax: number;
  percentile: number; // 0-100
  higherIsBetter: boolean;
}

export interface PlayerStatsResult {
  success: boolean;
  error?: string;
  // Player info
  playerName: string;
  primarySkill?: string;
  dominantHandBatting?: string;
  bowlingStyle?: string;
  // Game-by-game stats
  gameStats: PlayerGameStat[];
  // Aggregated totals
  aggregated: {
    gamesPlayed: number;
    totalRuns: number;
    totalBalls: number;
    avgStrikeRate: number;
    totalFours: number;
    totalSixes: number;
    totalWickets: number;
    totalOvers: number;
    avgEconomy: number;
    totalCatches: number;
    totalRunOuts: number;
    totalStumpings: number;
    totalBattingScore: number;
    totalBowlingScore: number;
    totalFieldingScore: number;
    totalScore: number;
    avgScorePerGame: number;
  } | null;
  // Trend: last 5 game scores
  scoreTrend: number[];
  // Anonymous series benchmarks
  benchmarks: SeriesBenchmark[];
  // Selector feedback (distilled, no selector names)
  feedback: PlayerFeedbackItem[];
  // Camp performance (if any)
  campPerformance: CampPerformance[];
  // Available series for selector
  availableSeries: { id: string; name: string }[];
}

// ─── Main action ──────────────────────────────────────────────────────────────

export async function getPlayerStatsAction(
  playerId: string,
  organizationId: string,
  seriesId: string
): Promise<PlayerStatsResult> {
  try {
    // ── 1. Get player profile ──
    const playerDoc = await adminDb.collection('players').doc(playerId).get();
    if (!playerDoc.exists) {
      return { success: false, error: 'Player profile not found.', playerName: '', gameStats: [], aggregated: null, scoreTrend: [], benchmarks: [], feedback: [], campPerformance: [], availableSeries: [] };
    }
    const playerData = playerDoc.data()!;

    // ── 2. Find this player's name(s) in scorecardPlayers ──
    const spSnap = await adminDb.collection('scorecardPlayers')
      .where('organizationId', '==', organizationId)
      .where('linkedPlayerId', '==', playerId)
      .get();

    const linkedNames: string[] = spSnap.docs.map(d => d.data().name as string);

    // ── 3. Get all scorecards for this series ──
    const scSnap = await adminDb.collection('matchScorecards')
      .where('organizationId', '==', organizationId)
      .where('seriesId', '==', seriesId)
      .orderBy('date', 'asc')
      .get();

    const allScorecards: MatchScorecard[] = scSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        importedAt: data.importedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        selectorAssignments: (data.selectorAssignments || []).map((a: any) => ({
          ...a,
          assignedAt: a.assignedAt?.toDate?.()?.toISOString() || a.assignedAt || undefined,
        })),
      } as MatchScorecard;
    });

    // ── 4. Extract this player's game-by-game stats ──
    const gameStats: PlayerGameStat[] = [];

    for (const sc of allScorecards) {
      let runs = 0, balls = 0, fours = 0, sixes = 0;
      let wickets = 0, overs = 0, runsConceded = 0;
      let catches = 0, runOuts = 0, stumpings = 0;
      let appearedInGame = false;

      for (const inn of (sc.innings || [])) {
        // Batting
        for (const b of (inn.batting || [])) {
          if (linkedNames.some(n => n.toLowerCase() === b.name.toLowerCase())) {
            appearedInGame = true;
            runs += b.runs || 0;
            balls += b.balls || 0;
            fours += b.fours || 0;
            sixes += b.sixes || 0;
          }
        }
        // Bowling
        for (const b of (inn.bowling || [])) {
          if (linkedNames.some(n => n.toLowerCase() === b.name.toLowerCase())) {
            appearedInGame = true;
            wickets += b.wickets || 0;
            overs += b.overs || 0;
            runsConceded += b.runs || 0;
          }
        }
        // Fielding — parse dismissal text
        for (const b of (inn.batting || [])) {
          const d = (b.dismissal || '').toLowerCase();
          for (const name of linkedNames) {
            const nl = name.toLowerCase();
            // Catch: "c Name b Bowler" or "c †Name b Bowler"
            if (d.startsWith('c ') && d.includes(nl) && d.includes(' b ')) catches++;
            // Run out
            if (d.includes('run out') && d.includes(nl)) runOuts++;
            // Stumping
            if (d.startsWith('st ') && d.includes(nl)) stumpings++;
          }
        }
        // Did not bat — still appeared
        for (const name of (inn.didNotBat || [])) {
          if (linkedNames.some(n => n.toLowerCase() === (name || '').toLowerCase())) {
            appearedInGame = true;
          }
        }
      }

      if (!appearedInGame) continue;

      const strikeRate = balls > 0 ? Math.round((runs / balls) * 1000) / 10 : 0;
      const economy = overs > 0 ? Math.round((runsConceded / overs) * 10) / 10 : 0;

      // Simple scoring for trend (use existing engine if available)
      const battingScore = runs + (fours * 2) + (sixes * 4) +
        (strikeRate > 200 ? 10 : strikeRate > 150 ? 7.5 : strikeRate > 100 ? 5 : strikeRate < 50 && balls > 5 ? -5 : 0);
      const bowlingScore = (wickets * 20) +
        (economy < 4 ? 10 : economy < 6 ? 5 : economy > 8 ? -5 : 0);
      const fieldingScore = (catches * 10) + (runOuts * 10) + (stumpings * 10);
      const totalScore = Math.round((battingScore + bowlingScore + fieldingScore) * 10) / 10;

      gameStats.push({
        scorecardId: sc.id,
        date: sc.date || '',
        team1: sc.team1,
        team2: sc.team2,
        runs, balls, strikeRate, fours, sixes,
        wickets, overs, economy,
        catches, runOuts, stumpings,
        battingScore: Math.round(battingScore * 10) / 10,
        bowlingScore: Math.round(bowlingScore * 10) / 10,
        fieldingScore: Math.round(fieldingScore * 10) / 10,
        totalScore,
      });
    }

    // ── 5. Aggregate totals ──
    const agg = gameStats.length === 0 ? null : {
      gamesPlayed: gameStats.length,
      totalRuns: gameStats.reduce((s, g) => s + g.runs, 0),
      totalBalls: gameStats.reduce((s, g) => s + g.balls, 0),
      avgStrikeRate: (() => {
        const tb = gameStats.reduce((s, g) => s + g.balls, 0);
        const tr = gameStats.reduce((s, g) => s + g.runs, 0);
        return tb > 0 ? Math.round((tr / tb) * 1000) / 10 : 0;
      })(),
      totalFours: gameStats.reduce((s, g) => s + g.fours, 0),
      totalSixes: gameStats.reduce((s, g) => s + g.sixes, 0),
      totalWickets: gameStats.reduce((s, g) => s + g.wickets, 0),
      totalOvers: Math.round(gameStats.reduce((s, g) => s + g.overs, 0) * 10) / 10,
      avgEconomy: (() => {
        const to = gameStats.reduce((s, g) => s + g.overs, 0);
        const totalRuns = gameStats.reduce((s, g) => s + (g.economy * g.overs), 0);
        return to > 0 ? Math.round((totalRuns / to) * 10) / 10 : 0;
      })(),
      totalCatches: gameStats.reduce((s, g) => s + g.catches, 0),
      totalRunOuts: gameStats.reduce((s, g) => s + g.runOuts, 0),
      totalStumpings: gameStats.reduce((s, g) => s + g.stumpings, 0),
      totalBattingScore: Math.round(gameStats.reduce((s, g) => s + g.battingScore, 0) * 10) / 10,
      totalBowlingScore: Math.round(gameStats.reduce((s, g) => s + g.bowlingScore, 0) * 10) / 10,
      totalFieldingScore: Math.round(gameStats.reduce((s, g) => s + g.fieldingScore, 0) * 10) / 10,
      totalScore: Math.round(gameStats.reduce((s, g) => s + g.totalScore, 0) * 10) / 10,
      avgScorePerGame: gameStats.length > 0
        ? Math.round((gameStats.reduce((s, g) => s + g.totalScore, 0) / gameStats.length) * 10) / 10
        : 0,
    };

    // ── 6. Score trend — last 5 games ──
    const scoreTrend = gameStats.slice(-5).map(g => g.totalScore);

    // ── 7. Series benchmarks (anonymous) ──
    const benchmarks = await buildBenchmarks(allScorecards, agg, playerId);

    // ── 8. Selector feedback (accepted deltas for this player only) ──
    const feedback = await getPlayerFeedback(playerId, organizationId, allScorecards);

    // ── 9. Camp performance ──
    const campPerformance = await getCampPerformance(playerId, organizationId);

    // ── 10. Available series ──
    const availableSeries = await getAvailableSeriesForPlayer(playerId, organizationId);

    return {
      success: true,
      playerName: playerData.name || '',
      primarySkill: playerData.primarySkill,
      dominantHandBatting: playerData.dominantHandBatting,
      bowlingStyle: playerData.bowlingStyle,
      gameStats,
      aggregated: agg,
      scoreTrend,
      benchmarks,
      feedback,
      campPerformance,
      availableSeries,
    };
  } catch (e: any) {
    console.error('[getPlayerStatsAction] Error:', e);
    return {
      success: false,
      error: e.message,
      playerName: '',
      gameStats: [],
      aggregated: null,
      scoreTrend: [],
      benchmarks: [],
      feedback: [],
      campPerformance: [],
      availableSeries: [],
    };
  }
}

// ─── Build anonymous series benchmarks ───────────────────────────────────────

async function buildBenchmarks(
  scorecards: MatchScorecard[],
  playerAgg: PlayerStatsResult['aggregated'],
  playerId: string
): Promise<SeriesBenchmark[]> {
  if (!playerAgg || scorecards.length === 0) return [];

  // Run aggregation for all players in this series
  const allStats = aggregatePlayerStats(scorecards, DEFAULT_SCORING_CONFIG);
  if (allStats.length < 2) return []; // need at least 2 players for a meaningful benchmark

  const calcPercentile = (value: number, values: number[], higherIsBetter: boolean): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const rank = sorted.filter(v => higherIsBetter ? v < value : v > value).length;
    return Math.round((rank / sorted.length) * 100);
  };

  const avgRunsPerGame = allStats.map(p => p.gamesPlayed > 0 ? p.totalRuns / p.gamesPlayed : 0);
  const srValues = allStats.map(p => p.avgStrikeRate);
  const econValues = allStats.filter(p => p.totalOvers > 0).map(p => p.avgEconomy);
  const scoreValues = allStats.map(p => p.avgScorePerGame);

  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
  };

  const benchmarks: SeriesBenchmark[] = [];

  const playerAvgRuns = playerAgg.gamesPlayed > 0 ? playerAgg.totalRuns / playerAgg.gamesPlayed : 0;
  benchmarks.push({
    metric: 'avg_runs',
    label: 'Batting — avg runs/game',
    playerValue: Math.round(playerAvgRuns * 10) / 10,
    seriesMedian: median(avgRunsPerGame),
    seriesMax: Math.max(...avgRunsPerGame),
    percentile: calcPercentile(playerAvgRuns, avgRunsPerGame, true),
    higherIsBetter: true,
  });

  if (playerAgg.avgStrikeRate > 0) {
    benchmarks.push({
      metric: 'strike_rate',
      label: 'Strike rate',
      playerValue: playerAgg.avgStrikeRate,
      seriesMedian: median(srValues),
      seriesMax: Math.max(...srValues),
      percentile: calcPercentile(playerAgg.avgStrikeRate, srValues, true),
      higherIsBetter: true,
    });
  }

  if (playerAgg.avgEconomy > 0 && econValues.length > 0) {
    benchmarks.push({
      metric: 'economy',
      label: 'Bowling economy',
      playerValue: playerAgg.avgEconomy,
      seriesMedian: median(econValues),
      seriesMax: Math.max(...econValues), // worst economy
      percentile: calcPercentile(playerAgg.avgEconomy, econValues, false),
      higherIsBetter: false,
    });
  }

  benchmarks.push({
    metric: 'xi_score',
    label: 'Overall XI Selector score',
    playerValue: playerAgg.avgScorePerGame,
    seriesMedian: median(scoreValues),
    seriesMax: Math.max(...scoreValues),
    percentile: calcPercentile(playerAgg.avgScorePerGame, scoreValues, true),
    higherIsBetter: true,
  });

  return benchmarks;
}

// ─── Get player feedback from accepted deltas ─────────────────────────────────

async function getPlayerFeedback(
  playerId: string,
  organizationId: string,
  seriesScorecards: MatchScorecard[]
): Promise<PlayerFeedbackItem[]> {
  if (seriesScorecards.length === 0) return [];

  const scorecardIds = seriesScorecards.map(sc => sc.id);
  const scorecardDateMap = new Map(seriesScorecards.map(sc => [sc.id, sc.date || '']));

  const feedback: PlayerFeedbackItem[] = [];

  // Firestore 'in' max 30
  const chunks: string[][] = [];
  for (let i = 0; i < scorecardIds.length; i += 30) {
    chunks.push(scorecardIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const snap = await adminDb.collection('matchReportDeltas')
      .where('organizationId', '==', organizationId)
      .where('scorecardId', 'in', chunk)
      .where('playerId', '==', playerId)
      .where('status', '==', 'accepted')
      .get();

    for (const doc of snap.docs) {
      const d = doc.data();
      feedback.push({
        deltaId: doc.id,
        dimension: d.dimension,
        delta: d.delta,
        reason: d.reason,
        confidence: d.confidence,
        gameDate: (scorecardDateMap.get(d.scorecardId) || '').slice(0, 10),
      });
    }
  }

  // Sort by date desc
  return feedback.sort((a, b) => b.gameDate.localeCompare(a.gameDate));
}

// ─── Get camp performance for this player ────────────────────────────────────

async function getCampPerformance(
  playerId: string,
  organizationId: string
): Promise<CampPerformance[]> {
  // Find campPlayer docs for this player
  const cpSnap = await adminDb.collection('campPlayers')
    .where('organizationId', '==', organizationId)
    .where('playerId', '==', playerId)
    .get();

  if (cpSnap.empty) return [];

  const results: CampPerformance[] = [];

  for (const cpDoc of cpSnap.docs) {
    const cp = cpDoc.data();
    const campId = cp.campId;
    const bibNumber = cp.bibNumber;

    // Get camp name
    const campDoc = await adminDb.collection('selectionCamps').doc(campId).get();
    const campName = campDoc.exists ? (campDoc.data()!.name || 'Camp') : 'Camp';

    // Get assessments by bib number (bib-blind — coaches don't know player names)
    const assessSnap = await adminDb.collection('campAssessments')
      .where('campId', '==', campId)
      .where('bibNumber', '==', bibNumber)
      .get();

    if (assessSnap.empty) continue;

    const assessments = assessSnap.docs.map(d => d.data());
    const count = assessments.length;

    const avg = (field: string) =>
      Math.round((assessments.reduce((s, a) => s + (a[field] || 0), 0) / count) * 10) / 10;

    // Get fitness result
    const fitnessSnap = await adminDb.collection('campFitnessResults')
      .where('campId', '==', campId)
      .where('playerId', '==', playerId)
      .limit(1)
      .get();

    const fitness = fitnessSnap.empty ? undefined : fitnessSnap.docs[0].data();

    results.push({
      campId,
      campName,
      avgBatting: avg('batting'),
      avgBowling: avg('bowling'),
      avgFielding: avg('fielding'),
      avgFitness: avg('fitness'),
      avgAttitude: avg('attitude'),
      avgOverall: avg('overall'),
      coachCount: count,
      fitnessScore: fitness?.score,
      fitnessPassed: fitness?.passed,
      fitnessTestType: fitness?.testType,
    });
  }

  return results;
}

// ─── Get series where this player has appeared ────────────────────────────────

export async function getAvailableSeriesForPlayer(
  playerId: string,
  organizationId: string
): Promise<{ id: string; name: string }[]> {
  // Get all linked scorecard player names
  const spSnap = await adminDb.collection('scorecardPlayers')
    .where('organizationId', '==', organizationId)
    .where('linkedPlayerId', '==', playerId)
    .get();

  if (spSnap.empty) return [];

  // Find which series this player appeared in by looking up their name in matchScorecards
  const playerNames = spSnap.docs.map(d => (d.data().name as string).toLowerCase().trim());
  
  // Get all scorecards for this org
  const scSnap = await adminDb.collection('matchScorecards')
    .where('organizationId', '==', organizationId)
    .get();

  // Find seriesIds where player appeared
  const playerSeriesIds = new Set<string>();
  for (const scDoc of scSnap.docs) {
    const data = scDoc.data();
    const seriesId = data.seriesId;
    if (!seriesId) continue;
    // Check innings for player name
    const innings = data.innings || [];
    let found = false;
    for (const inn of innings) {
      if (found) break;
      for (const b of (inn.batting || [])) {
        if (playerNames.includes((b.name || '').toLowerCase().trim())) { found = true; break; }
      }
      for (const b of (inn.bowling || [])) {
        if (playerNames.includes((b.name || '').toLowerCase().trim())) { found = true; break; }
      }
    }
    if (found) playerSeriesIds.add(seriesId);
  }

  // Get all series for org, filter to where player appeared
  const seriesSnap = await adminDb.collection('series')
    .where('organizationId', '==', organizationId)
    .get();

  return seriesSnap.docs
    .filter(d => playerSeriesIds.size === 0 || playerSeriesIds.has(d.id))
    .map(d => ({
      id: d.id,
      name: d.data().name || 'Unknown series',
      createdAt: d.data().createdAt?.toMillis?.() || 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id, name }) => ({ id, name }));
}

// ─── Peer comparison data ─────────────────────────────────────────────────────

export interface PeerPlayerStats {
  rank: number; // anonymous rank within peer group
  isCurrentPlayer: boolean;
  // Bowling
  wickets: number; overs: number; economy: number; bowlingSR: number;
  // Batting
  runs: number; balls: number; strikeRate: number; boundaries: number; avgRunsPerGame: number;
  // Fielding
  catches: number; runOuts: number; totalDismissals: number;
  // Overall
  ciqScore: number;
}

export interface PeerComparisonResult {
  success: boolean;
  error?: string;
  primarySkill: string;
  peers: PeerPlayerStats[];
  currentPlayerRank: number;
}

export async function getPeerComparisonAction(
  playerId: string,
  seriesId: string,
  organizationId: string
): Promise<PeerComparisonResult> {
  try {
    // Step 1: Get current player's primarySkill from players collection
    const playerDoc = await adminDb.collection('players').doc(playerId).get();
    if (!playerDoc.exists) return { success: false, error: 'Player not found', primarySkill: '', peers: [], currentPlayerRank: 0 };
    const primarySkill = (playerDoc.data()?.primarySkill || 'Batting') as string;

    // Step 2: Find all scorecardPlayers in this series that are linked + same primarySkill
    // Get all matchScorecards for this series
    const scSnap = await adminDb.collection('matchScorecards')
      .where('organizationId', '==', organizationId)
      .where('seriesId', '==', seriesId)
      .get();

    if (scSnap.empty) return { success: true, primarySkill, peers: [], currentPlayerRank: 0 };

    const scorecardIds = scSnap.docs.map(d => d.id);

    // Step 3: Get scorecardPlayers that are linked + in this series
    const allSPDocs: any[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < scorecardIds.length; i += 30) chunks.push(scorecardIds.slice(i, i + 30));

    for (const chunk of chunks) {
      const spSnap = await adminDb.collection('scorecardPlayers')
        .where('organizationId', '==', organizationId)
        .get();
      // Filter to linked players in this series' scorecards
      spSnap.docs
        .filter(d => d.data().linkedPlayerId && chunk.includes(d.data().scorecardId))
        .forEach(d => allSPDocs.push(d.data()));
    }

    // Get all linked playerIds in this series
    const linkedPlayerIds = [...new Set(allSPDocs.map(d => d.linkedPlayerId).filter(Boolean))];

    // Step 4: Get each player's primarySkill from players collection
    const playerSkills = new Map<string, string>();
    const playerChunks: string[][] = [];
    for (let i = 0; i < linkedPlayerIds.length; i += 30) playerChunks.push(linkedPlayerIds.slice(i, i + 30));
    for (const chunk of playerChunks) {
      const pSnap = await adminDb.collection('players').where('__name__', 'in', chunk).get();
      pSnap.docs.forEach(d => playerSkills.set(d.id, d.data().primarySkill || 'Batting'));
    }

    // Step 5: Filter to same primarySkill group
    const peerPlayerIds = linkedPlayerIds.filter(pid =>
      playerSkills.get(pid) === primarySkill
    );

    if (peerPlayerIds.length === 0) return { success: true, primarySkill, peers: [], currentPlayerRank: 0 };

    // Step 6: Aggregate stats for each peer player using same logic as getPlayerStatsAction
    const peerStats: Array<{ playerId: string; stats: PeerPlayerStats }> = [];

    for (const pid of peerPlayerIds) {
      // Get this player's linked names in scorecardPlayers
      const pidSPSnap = await adminDb.collection('scorecardPlayers')
        .where('organizationId', '==', organizationId)
        .where('linkedPlayerId', '==', pid)
        .get();
      if (pidSPSnap.empty) continue;

      const linkedNames = pidSPSnap.docs.map(d => d.data().name as string);
      let runs = 0, balls = 0, fours = 0, sixes = 0;
      let wickets = 0, oversBowled = 0, runsConceded = 0;
      let catches = 0, runOuts = 0;
      const gamesSet = new Set<string>();

      for (const scDoc of scSnap.docs) {
        const data = scDoc.data();
        const innings = data.innings || [];
        let playerInThisGame = false;

        for (const inn of innings) {
          // Batting
          for (const b of (inn.batting || [])) {
            const n = (b.name || '').toLowerCase();
            if (linkedNames.some(ln => namesMatch(ln, n))) {
              runs += b.runs || 0;
              balls += b.balls || 0;
              fours += b.fours || 0;
              sixes += b.sixes || 0;
              playerInThisGame = true;
            }
          }
          // Bowling
          for (const bw of (inn.bowling || [])) {
            const n = (bw.name || '').toLowerCase();
            if (linkedNames.some(ln => namesMatch(ln, n))) {
              wickets += bw.wickets || 0;
              const ov = parseFloat(bw.overs || '0');
              oversBowled += ov;
              runsConceded += bw.runs || 0;
              playerInThisGame = true;
            }
          }
          // Fielding
          for (const b of (inn.batting || [])) {
            const d = (b.dismissal || '').toLowerCase();
            const bIdx = d.indexOf(' b ');
            const fielderPortion = bIdx !== -1 ? d.slice(0, bIdx) : d;
            const runOutMatch = d.match(/run out\s*[\(\[]?([^)\]]+)[\)\]]?/);
            const runOutFielder = runOutMatch ? runOutMatch[1].trim() : '';
            for (const name of linkedNames) {
              const candidates = buildCandidates(name);
              const fielderMatch = candidates.some(c => fielderPortion.includes(c));
              const runOutFielderMatch = runOutFielder && candidates.some(c => runOutFielder.includes(c));
              if (fielderPortion.startsWith('c ') && fielderMatch) catches++;
              if (d.includes('run out') && runOutFielderMatch) runOuts++;
            }
          }
        }
        if (playerInThisGame) gamesSet.add(scDoc.id);
      }

      const gamesPlayed = gamesSet.size || 1;
      const economy = oversBowled > 0 ? Math.round((runsConceded / oversBowled) * 10) / 10 : 0;
      const bowlingSR = wickets > 0 ? Math.round((oversBowled * 6 / wickets) * 10) / 10 : 0;
      const strikeRate = balls > 0 ? Math.round((runs / balls) * 100 * 10) / 10 : 0;

      // Simple CIQ score
      const battingScore = runs * 1.5 + (strikeRate > 150 ? 10 : strikeRate > 100 ? 5 : 0);
      const bowlingScore = wickets * 20 + (economy > 0 && economy < 5 ? 15 : economy < 7 ? 8 : 0);
      const fieldingScore = (catches + runOuts) * 10;
      const ciqScore = Math.round(battingScore + bowlingScore + fieldingScore);

      peerStats.push({
        playerId: pid,
        stats: {
          rank: 0, isCurrentPlayer: pid === playerId,
          wickets, overs: Math.round(oversBowled * 10) / 10, economy, bowlingSR,
          runs, balls, strikeRate, boundaries: fours + sixes,
          avgRunsPerGame: Math.round((runs / gamesPlayed) * 10) / 10,
          catches, runOuts, totalDismissals: catches + runOuts,
          ciqScore,
        },
      });
    }

    // Step 7: Rank by primarySkill metric
    const rankMetric = primarySkill.toLowerCase().includes('bowl') ? 'wickets'
      : primarySkill.toLowerCase().includes('bat') ? 'runs'
      : 'ciqScore';

    peerStats.sort((a, b) => b.stats[rankMetric as keyof PeerPlayerStats] as number - (a.stats[rankMetric as keyof PeerPlayerStats] as number));

    // Assign ranks + take top 6 (top 5 + current player if outside top 5)
    peerStats.forEach((p, i) => { p.stats.rank = i + 1; });

    const top5 = peerStats.slice(0, 5);
    const currentInTop5 = top5.some(p => p.isCurrentPlayer);
    const currentEntry = peerStats.find(p => p.stats.isCurrentPlayer);

    const finalPeers = currentInTop5 || !currentEntry
      ? top5.map(p => p.stats)
      : [...top5.map(p => p.stats), currentEntry.stats];

    const currentPlayerRank = currentEntry?.stats.rank || 0;

    return { success: true, primarySkill, peers: finalPeers, currentPlayerRank };
  } catch (e: any) {
    console.error('[getPeerComparisonAction]', e);
    return { success: false, error: e.message, primarySkill: '', peers: [], currentPlayerRank: 0 };
  }
}

// ─── Name matching helpers ────────────────────────────────────────────────────

function buildCandidates(name: string): string[] {
  const parts = name.toLowerCase().trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts[parts.length - 1] || '';
  const lastInitial = lastName[0] || '';
  return [
    name.toLowerCase(),
    firstName && lastInitial ? `${firstName} ${lastInitial}` : '',
    lastName.length > 2 ? lastName : '',
  ].filter(Boolean);
}

function namesMatch(linkedName: string, scorecardName: string): boolean {
  return buildCandidates(linkedName).some(c => scorecardName.includes(c));
}
