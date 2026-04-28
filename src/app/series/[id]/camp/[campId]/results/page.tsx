'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getCampByIdAction, getCampPlayersAction, getCampAssessmentsAction,
  getCampFitnessResultsAction, saveFinalSelectionAction
} from '@/lib/actions/camp-actions';
import { runCampAISelectionAction } from '@/lib/actions/camp-ai-action';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type {
  SelectionCamp, CampPlayer, CampAssessment,
  CampFitnessResult, CampPlayerResult, CampSelectionStatus
} from '@/types';
import type { CampSuggestedTeam } from '@/ai/flows/suggest-camp-team';
import {
  Loader2, ArrowLeft, Trophy, Star, Brain, Save,
  CheckCircle, Users, Target, ShieldAlert, Lock,
  ChevronUp, ChevronDown, Filter
} from 'lucide-react';

// ─── Aggregate helper ─────────────────────────────────────────────────────────
function aggregateResults(
  players: CampPlayer[],
  assessments: CampAssessment[],
  fitnessResults: CampFitnessResult[]
): CampPlayerResult[] {
  const assessByBib = new Map<number, CampAssessment[]>();
  assessments.forEach(a => {
    const arr = assessByBib.get(a.bibNumber) || [];
    arr.push(a);
    assessByBib.set(a.bibNumber, arr);
  });

  const fitByPlayer = new Map<string, CampFitnessResult>();
  fitnessResults.forEach(f => fitByPlayer.set(f.playerId, f));

  return players.map(cp => {
    const bibs = assessByBib.get(cp.bibNumber) || [];
    const avg = (key: keyof CampAssessment) => {
      const vals = bibs.map(a => a[key] as number).filter(v => typeof v === 'number' && v > 0);
      return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0;
    };

    const avgBatting = avg('batting');
    const avgBowling = avg('bowling');
    const avgFielding = avg('fielding');
    const avgFitness = avg('fitness');
    const avgAttitude = avg('attitude');
    const avgOverall = avg('overall');

    // Coach skill majority vote
    const skillVotes = bibs.filter(a => a.coachSuggestedSkill).map(a => a.coachSuggestedSkill!);
    const resolvedSkill = skillVotes.length > 0
      ? skillVotes.sort((a, b) => skillVotes.filter(s => s === b).length - skillVotes.filter(s => s === a).length)[0]
      : cp.playerPrimarySkill;

    const fitnessResult = fitByPlayer.get(cp.playerId);

    return {
      campPlayer: cp,
      assessments: bibs,
      fitnessResult,
      avgBatting, avgBowling, avgFielding, avgFitness, avgAttitude, avgOverall,
      coachCount: bibs.length,
      fitnessPassed: fitnessResult?.passed,
      resolvedSkill,
    };
  });
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ value }: { value: number }) {
  const pct = (value / 5) * 100;
  const color = value >= 4 ? 'bg-green-500' : value >= 3 ? 'bg-amber-400' : value > 0 ? 'bg-red-400' : 'bg-muted';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-6 text-right">{value > 0 ? value.toFixed(1) : '–'}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CampResultsPage() {
  const params = useParams<{ id: string; campId: string }>();
  const { id: seriesId, campId } = params;
  const { currentUser, userProfile, effectivePermissions, activeOrganizationId } = useAuth();
  const { toast } = useToast();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [players, setPlayers] = useState<CampPlayer[]>([]);
  const [assessments, setAssessments] = useState<CampAssessment[]>([]);
  const [fitnessResults, setFitnessResults] = useState<CampFitnessResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // AI state
  const [aiCriteria, setAiCriteria] = useState({
    totalPlayers: 15, batters: 5, bowlers: 4, allRounders: 3,
    wicketKeepers: 1, reserves: 2, requireFitnessPass: true,
    weightAssessment: 50, weightFitness: 25, weightSeriesPerformance: 25,
  });
  const [aiTeam, setAiTeam] = useState<CampSuggestedTeam | null>(null);
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [aiRuns, setAiRuns] = useState<{ label: string; team: CampSuggestedTeam }[]>([]);

  // Final selection state
  const [selection, setSelection] = useState<Map<string, CampSelectionStatus>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);

  // Sort/filter
  const [sortBy, setSortBy] = useState<'bibNumber' | 'avgOverall' | 'coachCount'>('avgOverall');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!campId) return;
    Promise.all([
      getCampByIdAction(campId),
      getCampPlayersAction(campId),
      getCampAssessmentsAction(campId),
      getCampFitnessResultsAction(campId),
    ]).then(([campRes, playersRes, assessRes, fitnessRes]) => {
      if (campRes.success) setCamp(campRes.camp!);
      if (playersRes.success) {
        const ps = playersRes.players || [];
        setPlayers(ps);
        // Init selection from existing data
        const selMap = new Map<string, CampSelectionStatus>();
        ps.forEach(p => { if (p.selectionStatus) selMap.set(p.id, p.selectionStatus); });
        setSelection(selMap);
      }
      if (assessRes.success) setAssessments(assessRes.assessments || []);
      if (fitnessRes.success) setFitnessResults(fitnessRes.results || []);
      setIsLoading(false);
    });
  }, [campId]);

  const results = useMemo(() =>
    aggregateResults(players, assessments, fitnessResults),
    [players, assessments, fitnessResults]
  );

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      let av = 0, bv = 0;
      if (sortBy === 'bibNumber') { av = a.campPlayer.bibNumber; bv = b.campPlayer.bibNumber; }
      else if (sortBy === 'avgOverall') { av = a.avgOverall; bv = b.avgOverall; }
      else if (sortBy === 'coachCount') { av = a.coachCount; bv = b.coachCount; }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [results, sortBy, sortDir]);

  const handleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const handleRunAI = async () => {
    if (!campId) return;
    const totalWeight = aiCriteria.weightAssessment + aiCriteria.weightFitness + aiCriteria.weightSeriesPerformance;
    if (totalWeight !== 100) {
      toast({ title: 'Weights must sum to 100', description: `Current total: ${totalWeight}`, variant: 'destructive' });
      return;
    }
    setIsRunningAI(true);
    const res = await runCampAISelectionAction({ campId, criteria: aiCriteria });
    if (res.success && res.team) {
      setAiTeam(res.team);
      setAiRuns(prev => [...prev, {
        label: `Run ${prev.length + 1} — Assessment ${aiCriteria.weightAssessment}% / Fitness ${aiCriteria.weightFitness}% / Series ${aiCriteria.weightSeriesPerformance}%`,
        team: res.team!,
      }]);
      toast({ title: 'AI selection complete ✓' });
    } else {
      toast({ title: 'AI Error', description: res.error, variant: 'destructive' });
    }
    setIsRunningAI(false);
  };

  const applyAIToSelection = () => {
    if (!aiTeam) return;
    const newSel = new Map<string, CampSelectionStatus>();
    aiTeam.forEach(t => {
      const cp = players.find(p => p.bibNumber === t.bibNumber);
      if (cp) newSel.set(cp.id, t.selectionType as CampSelectionStatus);
    });
    setSelection(newSel);
    toast({ title: 'AI selection applied — review and save' });
  };

  const setPlayerSelection = (campPlayerId: string, status: CampSelectionStatus | '') => {
    setSelection(prev => {
      const next = new Map(prev);
      if (status === '') next.delete(campPlayerId);
      else next.set(campPlayerId, status);
      return next;
    });
    setHasSaved(false);
  };

  const handleSaveFinalSelection = async () => {
    if (selection.size === 0) {
      toast({ title: 'No selections made yet', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    const payload = Array.from(selection.entries()).map(([id, status]) => ({
      campPlayerId: id, selectionStatus: status,
    }));
    const res = await saveFinalSelectionAction(campId, payload);
    if (res.success) {
      toast({ title: 'Final selection saved ✓' });
      setHasSaved(true);
    } else {
      toast({ title: 'Error saving', description: res.error, variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const selCounts = useMemo(() => ({
    selected: Array.from(selection.values()).filter(s => s === 'selected').length,
    reserve: Array.from(selection.values()).filter(s => s === 'reserve').length,
    notSelected: Array.from(selection.values()).filter(s => s === 'not_selected').length,
  }), [selection]);

  const setAiC = (key: string, val: any) => setAiCriteria(prev => ({ ...prev, [key]: val }));
  const weightTotal = aiCriteria.weightAssessment + aiCriteria.weightFitness + aiCriteria.weightSeriesPerformance;

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  if (!camp) return (
    <Alert variant="destructive" className="max-w-xl mx-auto mt-8">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle>Camp not found</AlertTitle>
    </Alert>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series/${seriesId}/camp/${campId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-headline font-bold text-primary flex items-center gap-2">
              <Trophy className="h-5 w-5" /> {camp.name} — Results
            </h1>
            <p className="text-xs text-muted-foreground">
              {players.length} players · {assessments.length} assessments · Target: {camp.selectionTarget}
            </p>
          </div>
        </div>
        <Button onClick={handleSaveFinalSelection} disabled={isSaving || hasSaved}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
            hasSaved ? <CheckCircle className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
          {hasSaved ? 'Saved' : 'Save Final Selection'}
        </Button>
      </div>

      {/* Selection summary */}
      <div className="flex gap-3 flex-wrap">
        <Badge className="bg-green-100 text-green-700 border-green-200 text-sm px-3 py-1">
          <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> {selCounts.selected} Selected
        </Badge>
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-sm px-3 py-1">
          <Users className="h-3.5 w-3.5 mr-1.5" /> {selCounts.reserve} Reserve
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {selCounts.notSelected} Not Selected
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1">
          {players.length - selCounts.selected - selCounts.reserve - selCounts.notSelected} Unset
        </Badge>
      </div>

      <Tabs defaultValue="results">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3">
          <TabsTrigger value="results"><Users className="h-4 w-4 mr-2" />Player Results</TabsTrigger>
          <TabsTrigger value="ai"><Brain className="h-4 w-4 mr-2" />AI Selection</TabsTrigger>
          <TabsTrigger value="final"><Trophy className="h-4 w-4 mr-2" />Final Selection</TabsTrigger>
        </TabsList>

        {/* ── RESULTS TAB ── */}
        <TabsContent value="results" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base">All Players — Aggregated Scores</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Sort:</span>
                  {(['avgOverall', 'bibNumber', 'coachCount'] as const).map(key => (
                    <Button key={key} variant={sortBy === key ? 'default' : 'outline'} size="sm"
                      className="h-7 text-xs" onClick={() => handleSort(key)}>
                      {key === 'avgOverall' ? 'Overall' : key === 'bibNumber' ? 'Bib #' : 'Coaches'}
                      {sortBy === key && (sortDir === 'asc' ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />)}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {sortedResults.map(r => (
                  <div key={r.campPlayer.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-primary">#{r.campPlayer.bibNumber}</span>
                          <span className="text-sm font-medium">{r.campPlayer.playerName}</span>
                          <Badge variant="outline" className="text-xs">{r.resolvedSkill}</Badge>
                          {r.campPlayer.playerPrimarySkill !== r.resolvedSkill && (
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                              Coach: {r.resolvedSkill}
                            </Badge>
                          )}
                          {r.fitnessResult && (
                            <Badge className={`text-xs ${r.fitnessPassed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                              Fitness: {r.fitnessPassed ? 'Pass' : 'Fail'} ({r.fitnessResult.score})
                            </Badge>
                          )}
                          {r.coachCount > 0 && (
                            <span className="text-xs text-muted-foreground">{r.coachCount} coach{r.coachCount > 1 ? 'es' : ''}</span>
                          )}
                        </div>
                        {r.coachCount > 0 ? (
                          <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-1">
                            {[['Batting', r.avgBatting], ['Bowling', r.avgBowling], ['Fielding', r.avgFielding],
                              ['Fitness', r.avgFitness], ['Attitude', r.avgAttitude], ['Overall', r.avgOverall]
                            ].map(([label, val]) => (
                              <div key={label as string}>
                                <p className="text-xs text-muted-foreground">{label}</p>
                                <ScoreBar value={val as number} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1 italic">No assessments yet</p>
                        )}
                      </div>
                      <div className="shrink-0 w-36">
                        <Select value={selection.get(r.campPlayer.id) || ''}
                          onValueChange={v => setPlayerSelection(r.campPlayer.id, v as CampSelectionStatus | '')}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Set status..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Unset</SelectItem>
                            <SelectItem value="selected">✓ Selected</SelectItem>
                            <SelectItem value="reserve">↑ Reserve</SelectItem>
                            <SelectItem value="not_selected">✗ Not Selected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AI TAB ── */}
        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Selection Criteria</CardTitle>
              <CardDescription>Set your selection requirements and scoring weights, then run the AI.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Squad composition */}
              <div>
                <p className="text-sm font-medium mb-2">Squad Composition</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    ['totalPlayers', 'Total (main squad)'],
                    ['batters', 'Batters'],
                    ['bowlers', 'Bowlers'],
                    ['allRounders', 'All-Rounders'],
                    ['wicketKeepers', 'Wicket Keepers'],
                    ['reserves', 'Reserves'],
                  ] as [string, string][]).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{label}</label>
                      <Input type="number" min={0} className="h-8 text-sm"
                        value={(aiCriteria as any)[key]}
                        onChange={e => setAiC(key, parseInt(e.target.value) || 0)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Fitness requirement */}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="requireFitness"
                  checked={aiCriteria.requireFitnessPass}
                  onChange={e => setAiC('requireFitnessPass', e.target.checked)}
                  className="h-4 w-4 rounded border-input" />
                <label htmlFor="requireFitness" className="text-sm font-medium">
                  Require fitness test pass (exclude all Fail/N/A players)
                </label>
              </div>

              {/* Weights */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Scoring Weights</p>
                  <span className={`text-xs font-medium ${weightTotal === 100 ? 'text-green-600' : 'text-red-500'}`}>
                    Total: {weightTotal}% {weightTotal !== 100 ? '(must equal 100)' : '✓'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ['weightAssessment', 'Camp Assessment'],
                    ['weightFitness', 'Fitness Test'],
                    ['weightSeriesPerformance', 'Series Performance'],
                  ] as [string, string][]).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{label}</label>
                      <div className="flex items-center gap-1">
                        <Input type="number" min={0} max={100} className="h-8 text-sm"
                          value={(aiCriteria as any)[key]}
                          onChange={e => setAiC(key, parseInt(e.target.value) || 0)} />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button className="w-full" onClick={handleRunAI}
                disabled={isRunningAI || weightTotal !== 100}>
                {isRunningAI
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running AI Selection...</>
                  : <><Brain className="mr-2 h-4 w-4" />Run AI Selection</>}
              </Button>
            </CardContent>
          </Card>

          {/* Previous runs */}
          {aiRuns.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Previous AI Runs ({aiRuns.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {aiRuns.map((run, i) => (
                  <Button key={i} variant="outline" className="w-full justify-start text-xs h-auto py-2"
                    onClick={() => { setAiTeam(run.team); }}>
                    {run.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* AI Results */}
          {aiTeam && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">AI Suggested Selection</CardTitle>
                  <Button size="sm" onClick={applyAIToSelection}>
                    <CheckCircle className="mr-2 h-3.5 w-3.5" /> Apply to Final Selection
                  </Button>
                </div>
                <CardDescription>Review the AI's picks, then apply or manually override in the Final Selection tab.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {aiTeam.map((p, i) => (
                    <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-primary">#{p.bibNumber}</span>
                          <span className="text-sm font-medium">{p.playerName}</span>
                          <Badge variant="outline" className="text-xs">{p.suggestedRole}</Badge>
                          <Badge className={`text-xs ${p.selectionType === 'selected' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {p.selectionType === 'selected' ? '✓ Selected' : '↑ Reserve'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Score: {p.suitabilityScore}/100</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 italic">{p.selectionReason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── FINAL SELECTION TAB ── */}
        <TabsContent value="final" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Final Selection</CardTitle>
              <CardDescription>
                Review and confirm the final team. Target: {camp.selectionTarget} selected + reserves.
                {hasSaved && <span className="ml-2 text-green-600 font-medium">✓ Saved</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(['selected', 'reserve', 'not_selected', ''] as const).map(status => {
                const label = status === 'selected' ? '✓ Selected' :
                  status === 'reserve' ? '↑ Reserve' :
                    status === 'not_selected' ? '✗ Not Selected' : 'Unset';
                const color = status === 'selected' ? 'bg-green-50 border-green-200' :
                  status === 'reserve' ? 'bg-blue-50 border-blue-200' :
                    status === 'not_selected' ? 'bg-muted/40' : '';
                const filtered = sortedResults.filter(r =>
                  (selection.get(r.campPlayer.id) || '') === status
                );
                if (filtered.length === 0) return null;
                return (
                  <div key={status || 'unset'} className={`${color} border-b last:border-b-0`}>
                    <div className="px-4 py-2 border-b">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {label} ({filtered.length})
                      </span>
                    </div>
                    {filtered.map(r => (
                      <div key={r.campPlayer.id} className="px-4 py-2.5 flex items-center justify-between gap-3 border-b last:border-b-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-primary">#{r.campPlayer.bibNumber}</span>
                          <span className="text-sm">{r.campPlayer.playerName}</span>
                          <Badge variant="outline" className="text-xs">{r.resolvedSkill}</Badge>
                          {r.avgOverall > 0 && <span className="text-xs text-muted-foreground">Avg: {r.avgOverall.toFixed(1)}</span>}
                        </div>
                        <Select value={selection.get(r.campPlayer.id) || ''}
                          onValueChange={v => setPlayerSelection(r.campPlayer.id, v as CampSelectionStatus | '')}>
                          <SelectTrigger className="h-7 text-xs w-32 shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Unset</SelectItem>
                            <SelectItem value="selected">✓ Selected</SelectItem>
                            <SelectItem value="reserve">↑ Reserve</SelectItem>
                            <SelectItem value="not_selected">✗ Not Selected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <div className="mt-4">
            <Button className="w-full" size="lg" onClick={handleSaveFinalSelection} disabled={isSaving || hasSaved}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                hasSaved ? <CheckCircle className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              {hasSaved ? 'Selection Saved ✓' : 'Save Final Selection'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
