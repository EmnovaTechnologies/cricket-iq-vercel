'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getAllSeriesFromDB, getPlayerByIdFromDB } from '@/lib/db';
import { getScorecardsBySeriesAction, getScorecardPlayersAction } from '@/lib/actions/scorecard-actions';
import { saveScorecardXIAction, clearScorecardXIAction } from '@/lib/actions/series-actions';
import { getMatchReportsForSeriesAction } from '@/lib/actions/match-report-actions';
import { getAcceptedDeltasForSeriesAction, type MatchReportDelta } from '@/lib/actions/match-report-ai-action';
import { getScoringConfigAction } from '@/lib/actions/scoring-config-actions';
import { suggestXIFromScorecardAction, type SelectionResult } from '@/lib/actions/scorecard-selection-action';
import { aggregatePlayerStats, classifyPlayers } from '@/lib/utils/scorecard-aggregation-engine';
import type {
  Series, MatchScorecard, AggregatedPlayerStats,
  ScorecardSelectionConstraints, ScorecardScoringConfig
} from '@/types';
import { DEFAULT_SELECTION_CONSTRAINTS, DEFAULT_SCORING_CONFIG } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Sparkles, Users, Trophy, Info, Table,
  TrendingUp, Star, Shield, Target, Save, RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Player Stats Row ────────────────────────────────────────────────────────

// Compute weighted form delta for a player across last N games
function computeFormDelta(
  playerName: string,
  deltas: (MatchReportDelta & { gameId: string })[],
  gameIds: string[], // ordered most recent first
  windowSize: number,
  weight: number // 0-100
): { net: number; gameResults: ('up' | 'down' | 'none')[] } {
  const window = gameIds.slice(0, windowSize);
  const weights = [0.5, 0.3, 0.2, 0.15, 0.1].slice(0, windowSize);
  const total = weights.slice(0, window.length).reduce((a, b) => a + b, 0);
  const normalised = weights.map(w => w / total);

  const gameResults: ('up' | 'down' | 'none')[] = window.map(gid => {
    const gameDeltaSum = deltas
      .filter(d => d.gameId === gid && d.playerName === playerName && d.dimension !== 'attitude')
      .reduce((sum, d) => sum + d.delta, 0);
    return gameDeltaSum > 0 ? 'up' : gameDeltaSum < 0 ? 'down' : 'none';
  });

  // Attitude: cumulative across all series games not just window
  const attitudeDelta = deltas
    .filter(d => d.playerName === playerName && d.dimension === 'attitude')
    .reduce((sum, d) => sum + d.delta, 0);

  // Skill deltas: weighted by recency within window
  const skillNet = window.reduce((sum, gid, idx) => {
    const gameDelta = deltas
      .filter(d => d.gameId === gid && d.playerName === playerName && d.dimension !== 'attitude')
      .reduce((s, d) => s + d.delta, 0);
    return sum + gameDelta * normalised[idx];
  }, 0);

  const net = parseFloat(((skillNet + attitudeDelta * 0.3) * (weight / 100)).toFixed(2));
  return { net, gameResults };
}

function PlayerStatsRow({ player, rank }: { player: ReturnType<typeof classifyPlayers>[0]; rank: number }) {
  return (
    <tr className={rank % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
      <td className="p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-5 text-right">{rank + 1}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-sm">{player.name}</p>
              {player.coachMentions > 0 && (
                <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded px-1 py-0.5 font-medium"
                  title={`Mentioned by opposing coaches ${player.coachMentions} time${player.coachMentions > 1 ? 's' : ''}`}>
                  👥 ×{player.coachMentions}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{player.team}</p>
          </div>
        </div>
      </td>
      <td className="p-2.5 text-center text-xs text-muted-foreground">{player.gamesPlayed}</td>
      <td className="p-2.5 text-right font-bold text-primary">{player.totalScore}</td>
      <td className="p-2.5 text-right text-sm">{player.avgScorePerGame}</td>
      <td className="p-2.5 text-right text-blue-600 text-sm">{player.totalRuns || '-'}</td>
      <td className="p-2.5 text-right text-green-600 text-sm">{player.totalWickets || '-'}</td>
      <td className="p-2.5 text-right text-purple-600 text-sm">
        {(player.totalCatches + player.totalRunOuts + player.totalStumpings + player.totalKeeperCatches) || '-'}
      </td>
      <td className="p-2.5 text-right text-yellow-600 text-sm font-medium">
        {player.totalCoachTopRatingScore > 0 ? `+${player.totalCoachTopRatingScore}` : '-'}
      </td>
      <td className="p-2.5 text-center">
        <div className="flex gap-1 justify-center flex-wrap">
          {player.isKeeper && <Badge variant="outline" className="text-xs px-1 py-0 border-amber-400 text-amber-700">WK</Badge>}
          {player.isAllRounder && <Badge variant="outline" className="text-xs px-1 py-0 border-purple-400 text-purple-700">AR</Badge>}
          {!player.isAllRounder && player.isBatter && <Badge variant="outline" className="text-xs px-1 py-0 border-blue-400 text-blue-700">BAT</Badge>}
          {!player.isAllRounder && player.isBowler && <Badge variant="outline" className="text-xs px-1 py-0 border-green-400 text-green-700">BOWL</Badge>}
        </div>
      </td>
    </tr>
  );
}

// ─── Player Stats Row V2 — with form delta column ────────────────────────────

interface FormResult {
  net: number;
  gameResults: ('up' | 'down' | 'none')[];
}

function PlayerStatsRowV2({
  player, rank, form, showForm, formWindow,
}: {
  player: ReturnType<typeof classifyPlayers>[0];
  rank: number;
  form: FormResult | null;
  showForm: boolean;
  formWindow: number;
}) {
  const adjScore = form ? parseFloat((player.totalScore + form.net).toFixed(1)) : player.totalScore;
  const dotColor = (r: 'up' | 'down' | 'none') =>
    r === 'up' ? 'bg-green-500' : r === 'down' ? 'bg-red-500' : 'bg-muted-foreground/30';

  return (
    <tr className={rank % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
      <td className="p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-5 text-right">{rank + 1}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-sm">{player.name}</p>
              {player.coachMentions > 0 && (
                <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded px-1 py-0.5 font-medium"
                  title={`Mentioned ${player.coachMentions} time(s)`}>
                  ×{player.coachMentions}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{player.team}</p>
          </div>
        </div>
      </td>
      <td className="p-2.5 text-center text-xs text-muted-foreground">{player.gamesPlayed}</td>
      <td className="p-2.5 text-right font-bold text-primary">{player.totalScore}</td>
      <td className="p-2.5 text-right text-sm">{player.avgScorePerGame}</td>
      <td className="p-2.5 text-right text-blue-600 text-sm">{player.totalRuns || '-'}</td>
      <td className="p-2.5 text-right text-green-600 text-sm">{player.totalWickets || '-'}</td>
      <td className="p-2.5 text-right text-purple-600 text-sm">
        {(player.totalCatches + player.totalRunOuts + player.totalStumpings + player.totalKeeperCatches) || '-'}
      </td>
      <td className="p-2.5 text-right text-yellow-600 text-sm font-medium">
        {player.totalCoachTopRatingScore > 0 ? `+${player.totalCoachTopRatingScore}` : '-'}
      </td>
      {showForm && form !== null && (
        <>
          <td className="p-2.5 text-right text-sm">
            <div className={`font-medium ${form.net > 0 ? 'text-green-600' : form.net < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {form.net > 0 ? '+' : ''}{form.net !== 0 ? form.net.toFixed(1) : '—'}
            </div>
            <div className="flex gap-0.5 justify-end mt-0.5">
              {form.gameResults.map((r, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${dotColor(r)}`} title={r} />
              ))}
            </div>
          </td>
          <td className="p-2.5 text-right font-bold text-sm text-primary">
            {adjScore}
          </td>
        </>
      )}
      {showForm && form === null && (
        <>
          <td className="p-2.5 text-right text-muted-foreground text-xs">—</td>
          <td className="p-2.5 text-right font-bold text-sm text-primary">{player.totalScore}</td>
        </>
      )}
      <td className="p-2.5 text-center">
        <div className="flex gap-1 justify-center flex-wrap">
          {player.isKeeper && <Badge variant="outline" className="text-xs px-1 py-0 border-amber-400 text-amber-700">WK</Badge>}
          {player.isAllRounder && <Badge variant="outline" className="text-xs px-1 py-0 border-purple-400 text-purple-700">AR</Badge>}
          {!player.isAllRounder && player.isBatter && <Badge variant="outline" className="text-xs px-1 py-0 border-blue-400 text-blue-700">BAT</Badge>}
          {!player.isAllRounder && player.isBowler && <Badge variant="outline" className="text-xs px-1 py-0 border-green-400 text-green-700">BOWL</Badge>}
        </div>
      </td>
    </tr>
  );
}

// ─── Suggested XI Display ────────────────────────────────────────────────────

function SuggestedXIDisplay({ result }: { result: SelectionResult }) {
  const roleOrder = ['Opener', 'Middle Order', 'All-Rounder', 'Wicket Keeper', 'Lower Order', 'Bowler'];
  const sorted = [...result.xi].sort((a, b) =>
    roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  );

  const roleColors: Record<string, string> = {
    'Opener': 'bg-blue-100 text-blue-800 border-blue-200',
    'Middle Order': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'All-Rounder': 'bg-purple-100 text-purple-800 border-purple-200',
    'Wicket Keeper': 'bg-amber-100 text-amber-800 border-amber-200',
    'Lower Order': 'bg-slate-100 text-slate-800 border-slate-200',
    'Bowler': 'bg-green-100 text-green-800 border-green-200',
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Alert className="border-primary/30 bg-primary/5">
        <Sparkles className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">AI Selection Summary</AlertTitle>
        <AlertDescription className="text-sm mt-1">{result.summary}</AlertDescription>
      </Alert>

      {/* Team Balance + C/VC */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Badge variant="secondary" className="text-xs">{result.teamBalance}</Badge>
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">
          <Star className="h-3 w-3 mr-1" /> Captain: {result.captain}
        </Badge>
        <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs">
          VC: {result.viceCaptain}
        </Badge>
      </div>

      <Separator />

      {/* XI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((player, i) => (
          <div key={player.name} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  {player.name === result.captain && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />}
                  {player.name === result.viceCaptain && <Star className="h-3.5 w-3.5 text-gray-400" />}
                  <p className="font-semibold text-sm">{player.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{player.team}</p>
              </div>
              <Badge className={cn("text-xs shrink-0", roleColors[player.role] || 'bg-gray-100 text-gray-800')}>
                {player.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{player.reason}</p>
            <div className="pt-1 border-t space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary">{player.stats.totalScore} pts</span>
                <span className="text-xs text-muted-foreground">{player.stats.gamesPlayed} game{player.stats.gamesPlayed !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {player.stats.totalRuns > 0 && (
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5">
                    🏏 {player.stats.totalRuns}r
                  </span>
                )}
                {player.stats.totalWickets > 0 && (
                  <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5">
                    🎳 {player.stats.totalWickets}w
                  </span>
                )}
                {player.stats.totalCatches > 0 && (
                  <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5">
                    🧤 {player.stats.totalCatches}ct
                  </span>
                )}
                {(player.stats as any).coachMentions > 0 && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded px-1.5 py-0.5 font-medium"
                    title="Mentioned by opposing coaches">
                    👥 ×{(player.stats as any).coachMentions}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ScorecardSelectionPage() {
  const { activeOrganizationId, loading: authLoading, currentUser, effectivePermissions } = useAuth();
  const { toast } = useToast();

  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);

  const [scorecards, setScorecards] = useState<MatchScorecard[]>([]);
  const [config, setConfig] = useState<ScorecardScoringConfig | null>(null);
  const [aggregated, setAggregated] = useState<ReturnType<typeof classifyPlayers>>([]);
  const [formWindow, setFormWindow] = useState(3);
  const [minGamesPlayed, setMinGamesPlayed] = useState(0);
  const [bestNGames, setBestNGames] = useState(0); // last N games
  const [formWeight, setFormWeight] = useState(30); // % weight for form
  const [includeForm, setIncludeForm] = useState(false);
  const [acceptedDeltas, setAcceptedDeltas] = useState<(MatchReportDelta & { id: string; gameId: string })[]>([]);

  const [constraints, setConstraints] = useState<ScorecardSelectionConstraints>(DEFAULT_SELECTION_CONSTRAINTS);
  const [selectionResult, setSelectionResult] = useState<SelectionResult | null>(null);
  const [savedXI, setSavedXI] = useState<SelectionResult | null>(null);
  const [isSavingXI, setIsSavingXI] = useState(false);

  const [isLoadingSeries, setIsLoadingSeries] = useState(true);
  const [isLoadingScorecards, setIsLoadingScorecards] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load series
  useEffect(() => {
    if (authLoading || !activeOrganizationId) return;
    setIsLoadingSeries(true);
    getAllSeriesFromDB('active', activeOrganizationId).then(series => {
      setAllSeries(series);
      const years = [...new Set(series.map(s => s.year.toString()))].sort((a, b) => +b - +a);
      setAvailableYears(years);
      if (years.length > 0) setSelectedYear(years[0]);
      setIsLoadingSeries(false);
    }).catch(() => setIsLoadingSeries(false));
  }, [activeOrganizationId, authLoading]);

  // Load scoring config
  useEffect(() => {
    if (!activeOrganizationId) return;
    getScoringConfigAction(activeOrganizationId).then(setConfig);
  }, [activeOrganizationId]);

  const filteredSeries = allSeries.filter(s =>
    !selectedYear || s.year.toString() === selectedYear
  );

  // Load scorecards when series selected
  const handleSeriesSelect = useCallback(async (seriesId: string) => {
    setSelectedSeriesId(seriesId);
    setSelectionResult(null);
    setSavedXI(null);
    setAggregated([]);
    const series = allSeries.find(s => s.id === seriesId) || null;
    setSelectedSeries(series);

    // Load saved XI if exists
    if ((series as any)?.savedScorecardXI) {
      setSavedXI((series as any).savedScorecardXI);
    }

    if (!seriesId || !activeOrganizationId) return;
    setIsLoadingScorecards(true);
    const res = await getScorecardsBySeriesAction(seriesId, activeOrganizationId);
    if (res.success && res.scorecards) {
      setScorecards(res.scorecards);
      const effectiveConfig = await getScoringConfigAction(activeOrganizationId, seriesId);
      // Fetch match reports for coach top rating scores
      const reportsRes = await getMatchReportsForSeriesAction(seriesId, activeOrganizationId);
      const matchReports = reportsRes.success ? (reportsRes.reports || []) : [];
      // Build name resolution map from player links (scorecardName → canonical profile name)
      const nameResolutionMap = new Map<string, string>();
      try {
        if (activeOrganizationId) {
          const scPlayers = await getScorecardPlayersAction(activeOrganizationId);
          // Only process linked players
          const linked = scPlayers.filter(sp => sp.linkedPlayerId && sp.name);
          // Batch fetch player profiles for canonical names
          const profileNames = await Promise.all(
            linked.map(sp => getPlayerByIdFromDB(sp.linkedPlayerId!).catch(() => null))
          );
          linked.forEach((sp, i) => {
            const profile = profileNames[i];
            const canonical = profile?.name || sp.name;
            nameResolutionMap.set(sp.name.toLowerCase().trim(), canonical);
          });
        }
      } catch (e) { console.warn('Could not load player links:', e); }

      const stats = aggregatePlayerStats(res.scorecards, effectiveConfig, matchReports, minGamesPlayed, bestNGames, nameResolutionMap);
      // Load accepted match report deltas for this series
      const gameIds = res.scorecards.map((s: any) => s.gameId).filter(Boolean);
      if (gameIds.length && activeOrganizationId) {
        const deltasRes = await getAcceptedDeltasForSeriesAction(activeOrganizationId, gameIds);
        if (deltasRes.success) setAcceptedDeltas(deltasRes.deltas || []);
      }
      setAggregated(classifyPlayers(stats, constraints.minBowlerOversPerGame, res.scorecards));
    } else {
      setScorecards([]);
      setAggregated([]);
      toast({ title: 'Error loading scorecards', description: res.error, variant: 'destructive' });
    }
    setIsLoadingScorecards(false);
  }, [allSeries, activeOrganizationId, config, constraints.minBowlerOversPerGame, toast]);

  const handleSaveXI = async () => {
    if (!selectionResult || !selectedSeriesId || !currentUser?.uid) return;
    setIsSavingXI(true);
    const res = await saveScorecardXIAction(selectedSeriesId, selectionResult, currentUser.uid);
    if (res.success) {
      setSavedXI(selectionResult);
      toast({ title: 'XI Saved', description: 'This XI has been saved for this series.' });
    } else {
      toast({ title: 'Save failed', description: res.error, variant: 'destructive' });
    }
    setIsSavingXI(false);
  };

  const handleRegenerateXI = async () => {
    if (!selectedSeriesId) return;
    await clearScorecardXIAction(selectedSeriesId);
    setSavedXI(null);
    setSelectionResult(null);
  };

  const handleGenerateXI = async () => {
    if (!aggregated.length || !selectedSeries) return;
    setIsGenerating(true);
    setSelectionResult(null);
    const res = await suggestXIFromScorecardAction(aggregated, constraints, selectedSeries.name);
    if (res.success && res.result) {
      setSelectionResult(res.result);
    } else {
      toast({ title: 'Generation failed', description: res.error, variant: 'destructive' });
    }
    setIsGenerating(false);
  };

  if (authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Target className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary">XI Selector</h1>
          <p className="text-muted-foreground text-sm">AI-powered team selection based on scorecard performance points</p>
        </div>
      </div>

      {!activeOrganizationId ? (
        <Alert className="border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>No Organization Selected</AlertTitle>
          <AlertDescription>Select an organization from the navbar to use Scorecard Selection.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Series + Constraints ─────────────────────────── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Table className="h-4 w-4" /> Select Series
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isLoadingSeries ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Year</Label>
                      <Select value={selectedYear} onValueChange={v => { setSelectedYear(v); setSelectedSeriesId(''); setAggregated([]); setSelectionResult(null); }}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Series</Label>
                      <Select value={selectedSeriesId} onValueChange={handleSeriesSelect}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select series" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredSeries.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedSeriesId && (
                      <p className="text-xs text-muted-foreground">
                        {isLoadingScorecards ? 'Loading...' : `${scorecards.length} scorecard(s) linked · ${aggregated.length} players`}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Selection Constraints
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Team Size', key: 'teamSize', min: 11, max: 15 },
                  { label: 'Min Openers', key: 'minOpeners', min: 1, max: 4 },
                  { label: 'Min Middle Order', key: 'minMiddleOrder', min: 1, max: 6 },
                  { label: 'Min Wicket Keepers', key: 'minWicketKeepers', min: 1, max: 2 },
                  { label: 'Min Bowlers', key: 'minBowlers', min: 2, max: 7 },
                  { label: 'Min All-Rounders', key: 'minAllRounders', min: 0, max: 4 },
                  { label: 'Min Overs/Game (Bowler)', key: 'minBowlerOversPerGame', min: 1, max: 10 },
                ].map(({ label, key, min, max }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type="number" min={min} max={max}
                      className="h-7 w-16 text-sm text-right"
                      value={(constraints as any)[key]}
                      onChange={e => setConstraints(prev => ({ ...prev, [key]: parseInt(e.target.value) || min }))}
                    />
                  </div>
                ))}

                {/* Min games played + best N — separate controls */}
                <div className="border-t pt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs text-muted-foreground">Min Games Played</Label>
                      <p className="text-xs text-muted-foreground/60">0 = include all players</p>
                    </div>
                    <Input type="number" min={0} max={50}
                      className="h-7 w-16 text-sm text-right"
                      value={minGamesPlayed}
                      onChange={e => setMinGamesPlayed(parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs text-muted-foreground">Use Best N Games</Label>
                      <p className="text-xs text-muted-foreground/60">0 = use all games played</p>
                    </div>
                    <Input type="number" min={0} max={50}
                      className="h-7 w-16 text-sm text-right"
                      value={bestNGames}
                      onChange={e => setBestNGames(parseInt(e.target.value) || 0)} />
                  </div>
                  {bestNGames > 0 && minGamesPlayed > 0 && bestNGames > minGamesPlayed && (
                    <p className="text-xs text-destructive">Best N should be ≤ Min Games Played</p>
                  )}
                  {bestNGames > 0 && (
                    <p className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
                      Scores recalculated using each player top {bestNGames} game{bestNGames > 1 ? 's' : ''} only — levels the field for players with different game counts.
                    </p>
                  )}
                </div>

                <Button
                  onClick={handleGenerateXI}
                  disabled={!aggregated.length || isGenerating || isLoadingScorecards || !!savedXI}
                  className="w-full mt-2"
                  title={savedXI ? 'A saved XI exists. Use Regenerate to get a fresh suggestion.' : ''}
                >
                  {isGenerating
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating XI...</>
                    : savedXI
                    ? <><Trophy className="mr-2 h-4 w-4" /> XI Already Saved</>
                    : <><Sparkles className="mr-2 h-4 w-4" /> Suggest Best XI</>
                  }
                </Button>
                {savedXI && (
                  <p className="text-xs text-center text-muted-foreground mt-1">
                    A saved XI exists. Use <strong>Regenerate</strong> in the Suggested XI tab to get a fresh suggestion.
                  </p>
                )}

                {!aggregated.length && selectedSeriesId && !isLoadingScorecards && (
                  <p className="text-xs text-amber-600 text-center">
                    No scorecards linked to this series yet. Import scorecards and link them to this series first.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right: Stats + Results ──────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            {isLoadingScorecards && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {!isLoadingScorecards && aggregated.length > 0 && (
              <Tabs defaultValue={(selectionResult || savedXI) ? 'xi' : 'players'}>
                <TabsList>
                  <TabsTrigger value="players">
                    <Users className="mr-2 h-4 w-4" /> Player Rankings ({aggregated.length})
                  </TabsTrigger>
                  {(selectionResult || savedXI) && (
                    <TabsTrigger value="xi">
                      <Trophy className="mr-2 h-4 w-4" /> Suggested XI
                      {savedXI && !selectionResult && <Badge className="ml-1.5 text-xs bg-green-600">Saved</Badge>}
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="players" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">
                        Series aggregate — {scorecards.length} game(s) · {aggregated.length} eligible players
                        {minGamesPlayed > 0 && ` · min ${minGamesPlayed} games played`}
                        {bestNGames > 0 && ` · best ${bestNGames} games scored`}
                        {' · '}sorted by {includeForm ? 'adjusted score (base + form)' : 'total points'}

                        {/* Form controls */}
                        <div className="flex flex-wrap items-center gap-4 mt-3 p-3 bg-muted/30 rounded-lg border text-sm">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={includeForm} onChange={e => setIncludeForm(e.target.checked)} className="h-4 w-4" />
                            <span className="font-medium">Include Recent Match Form</span>
                          </label>
                          {includeForm && (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-xs">Form window:</span>
                                <input type="range" min={1} max={10} step={1} value={formWindow}
                                  onChange={e => setFormWindow(Number(e.target.value))}
                                  className="w-20" />
                                <span className="text-xs font-medium w-16">Last {formWindow} game{formWindow > 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-xs">Form weight:</span>
                                <input type="range" min={0} max={50} step={5} value={formWeight}
                                  onChange={e => setFormWeight(Number(e.target.value))}
                                  className="w-20" />
                                <span className="text-xs font-medium w-16">{formWeight}% form / {100 - formWeight}% base</span>
                              </div>
                            </>
                          )}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-primary text-primary-foreground">
                            <tr>
                              <th className="text-left p-2.5 font-medium">Player</th>
                              <th className="p-2.5 font-medium text-center">G</th>
                              <th className="p-2.5 font-medium text-right">Total</th>
                              <th className="p-2.5 font-medium text-right">Avg</th>
                              <th className="p-2.5 font-medium text-right text-blue-200">Runs</th>
                              <th className="p-2.5 font-medium text-right text-green-200">Wkts</th>
                              <th className="p-2.5 font-medium text-right text-purple-200">Field</th>
                              <th className="p-2.5 font-medium text-right text-yellow-200">Coach</th>
                              <th className="p-2.5 font-medium text-center">Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              // Get ordered game IDs most recent first
                              const orderedGameIds = [...new Set(
                                scorecards
                                  .sort((a: any, b: any) => (b.gameDate || '').localeCompare(a.gameDate || ''))
                                  .map((s: any) => s.gameId)
                                  .filter(Boolean)
                              )];
                              return aggregated
                                .map(p => {
                                  const form = includeForm && acceptedDeltas.length > 0
                                    ? computeFormDelta(p.name, acceptedDeltas, orderedGameIds, formWindow, formWeight)
                                    : null;
                                  return { p, form };
                                })
                                .sort((a, b) => {
                                  if (!includeForm || !acceptedDeltas.length) return 0;
                                  const aAdj = a.p.totalScore + (a.form?.net || 0);
                                  const bAdj = b.p.totalScore + (b.form?.net || 0);
                                  return bAdj - aAdj;
                                })
                                .map(({ p, form }, i) => (
                                  <PlayerStatsRowV2
                                    key={p.name} player={p} rank={i}
                                    form={form}
                                    showForm={includeForm && acceptedDeltas.length > 0}
                                    formWindow={formWindow}
                                  />
                                ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {(selectionResult || savedXI) && (
                  <TabsContent value="xi" className="mt-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Trophy className="h-4 w-4 text-yellow-500" />
                              {savedXI && !selectionResult ? 'Saved XI' : 'Suggested XI'} — {selectedSeries?.name}
                            </CardTitle>
                            <CardDescription>
                              {savedXI && !selectionResult
                                ? 'Previously saved selection. Regenerate to get a fresh suggestion.'
                                : `Generated by Claude based on ${scorecards.length} scorecard(s)`}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            {selectionResult && (
                              <Button size="sm" onClick={handleSaveXI} disabled={isSavingXI}
                                className="bg-green-600 hover:bg-green-700 text-white">
                                {isSavingXI
                                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  : <Save className="mr-1.5 h-3.5 w-3.5" />}
                                Save XI
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={handleRegenerateXI}>
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                              {savedXI && !selectionResult ? 'Regenerate' : 'Reset'}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <SuggestedXIDisplay result={selectionResult || savedXI!} />
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>
            )}

            {!isLoadingScorecards && !aggregated.length && !selectedSeriesId && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <Target className="h-16 w-16 text-muted-foreground/30" />
                <p className="text-muted-foreground">Select a series to view player rankings and generate an XI</p>
              </div>
            )}

            {isGenerating && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">Claude is analysing {aggregated.length} players...</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
