'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getAllSeriesFromDB } from '@/lib/db';
import { getScorecardsBySeriesAction } from '@/lib/actions/scorecard-actions';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Sparkles, Users, Trophy, Info, Table,
  TrendingUp, Star, Shield, Target
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Player Stats Row ────────────────────────────────────────────────────────

function PlayerStatsRow({ player, rank }: { player: ReturnType<typeof classifyPlayers>[0]; rank: number }) {
  return (
    <tr className={rank % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
      <td className="p-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-5 text-right">{rank + 1}</span>
          <div>
            <p className="font-medium text-sm">{player.name}</p>
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
            <div className="flex flex-wrap gap-1.5 pt-1 border-t">
              <span className="text-xs text-primary font-medium">{player.stats.totalScore} pts</span>
              <span className="text-xs text-muted-foreground">({player.stats.gamesPlayed} games)</span>
              {player.stats.totalRuns ? <span className="text-xs text-blue-600">{player.stats.totalRuns}r</span> : null}
              {player.stats.totalWickets ? <span className="text-xs text-green-600">{player.stats.totalWickets}w</span> : null}
              {player.stats.totalCatches ? <span className="text-xs text-purple-600">{player.stats.totalCatches}ct</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ScorecardSelectionPage() {
  const { activeOrganizationId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);

  const [scorecards, setScorecards] = useState<MatchScorecard[]>([]);
  const [config, setConfig] = useState<ScorecardScoringConfig | null>(null);
  const [aggregated, setAggregated] = useState<ReturnType<typeof classifyPlayers>>([]);

  const [constraints, setConstraints] = useState<ScorecardSelectionConstraints>(DEFAULT_SELECTION_CONSTRAINTS);
  const [selectionResult, setSelectionResult] = useState<SelectionResult | null>(null);

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
    setAggregated([]);
    const series = allSeries.find(s => s.id === seriesId) || null;
    setSelectedSeries(series);

    if (!seriesId || !activeOrganizationId) return;
    setIsLoadingScorecards(true);
    const res = await getScorecardsBySeriesAction(seriesId, activeOrganizationId);
    if (res.success && res.scorecards) {
      setScorecards(res.scorecards);
      const effectiveConfig = config || { ...DEFAULT_SCORING_CONFIG, organizationId: activeOrganizationId };
      const stats = aggregatePlayerStats(res.scorecards, effectiveConfig);
      setAggregated(classifyPlayers(stats, constraints.minBowlerOversPerGame));
    } else {
      setScorecards([]);
      setAggregated([]);
      toast({ title: 'Error loading scorecards', description: res.error, variant: 'destructive' });
    }
    setIsLoadingScorecards(false);
  }, [allSeries, activeOrganizationId, config, constraints.minBowlerOversPerGame, toast]);

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
          <h1 className="text-3xl font-headline font-bold text-primary">Scorecard Selection</h1>
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Must Have Keeper</Label>
                  <Switch
                    checked={constraints.mustHaveKeeper}
                    onCheckedChange={v => setConstraints(prev => ({ ...prev, mustHaveKeeper: v }))}
                  />
                </div>

                <Button
                  onClick={handleGenerateXI}
                  disabled={!aggregated.length || isGenerating || isLoadingScorecards}
                  className="w-full mt-2"
                >
                  {isGenerating
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating XI...</>
                    : <><Sparkles className="mr-2 h-4 w-4" /> Suggest Best XI</>
                  }
                </Button>

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
              <Tabs defaultValue={selectionResult ? 'xi' : 'players'}>
                <TabsList>
                  <TabsTrigger value="players">
                    <Users className="mr-2 h-4 w-4" /> Player Rankings ({aggregated.length})
                  </TabsTrigger>
                  {selectionResult && (
                    <TabsTrigger value="xi">
                      <Trophy className="mr-2 h-4 w-4" /> Suggested XI
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="players" className="mt-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">
                        Series aggregate — {scorecards.length} game(s) · sorted by total points
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
                              <th className="p-2.5 font-medium text-center">Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aggregated.map((p, i) => <PlayerStatsRow key={p.name} player={p} rank={i} />)}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {selectionResult && (
                  <TabsContent value="xi" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-yellow-500" /> Suggested XI — {selectedSeries?.name}
                        </CardTitle>
                        <CardDescription>
                          Generated by Claude based on {scorecards.length} scorecard(s) in this series
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <SuggestedXIDisplay result={selectionResult} />
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
