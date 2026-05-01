'use client';

/**
 * FILE: src/components/camp/camp-tab-content.tsx
 * 
 * Full inline camp management component rendered inside the series detail
 * Camps tab. Contains 4 sub-tabs: Players, Assessment, Fitness, Results & AI.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import {
  getCampPlayersAction, invitePlayerToCampAction, removeCampPlayerAction,
  updateCampPlayerAction, getCampAssessmentsAction, getCampFitnessResultsAction,
  recordCampFitnessResultAction, saveFinalSelectionAction,
} from '@/lib/actions/camp-actions';
import { runCampAISelectionAction } from '@/lib/actions/camp-ai-action';
import { getPlayersWithDetailsFromDB, getTeamByIdFromDB, getSeriesByIdFromDB } from '@/lib/db';
import type {
  SelectionCamp, CampPlayer, CampAssessment, CampFitnessResult,
  CampPlayerResult, CampSelectionStatus, PlayerWithRatings
} from '@/types';
import type { CampSuggestedTeam } from '@/ai/flows/suggest-camp-team';
import {
  Users, Star, Activity, Brain, Loader2, UserPlus, X,
  Hash, Search, CheckCircle, XCircle, Save, Lock,
  ChevronUp, ChevronDown, ArrowRight, Target
} from 'lucide-react';
import { FITNESS_TEST_TYPES } from '@/lib/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(items: CampAssessment[], key: keyof CampAssessment): number {
  const vals = items.map(a => a[key] as number).filter(v => typeof v === 'number' && v > 0);
  return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0;
}

function ScoreBar({ value }: { value: number }) {
  const pct = (value / 5) * 100;
  const color = value >= 4 ? 'bg-green-500' : value >= 3 ? 'bg-amber-400' : value > 0 ? 'bg-red-400' : 'bg-muted';
  return (
    <div className="flex items-center gap-1">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs w-6 text-right">{value > 0 ? value : '—'}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CampTabContentProps {
  camp: SelectionCamp;
  seriesId: string;
  navParam?: string;  // e.g. '?from=series&seriesId=xxx' or '?from=camps'
  initialPlayers?: CampPlayer[];
  initialAssessments?: CampAssessment[];
  initialFitness?: CampFitnessResult[];
}

export function CampTabContent({
  camp,
  seriesId,
  navParam = '',
  initialPlayers = [],
  initialAssessments = [],
  initialFitness = [],
}: CampTabContentProps) {
  const { currentUser, userProfile, activeOrganizationId, effectivePermissions } = useAuth();
  const canManage = !!(effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY]);
  const canSeeNames = !!(userProfile?.roles?.includes('admin') ||
    userProfile?.roles?.includes('Organization Admin') ||
    userProfile?.roles?.includes('Series Admin') ||
    userProfile?.roles?.includes('Team Manager'));
  const { toast } = useToast();
  const router = useRouter();

  // ── Players state ──────────────────────────────────────────────────────────
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>(initialPlayers);
  const [orgPlayers, setOrgPlayers] = useState<PlayerWithRatings[]>([]);
  const [seriesPlayerIds, setSeriesPlayerIds] = useState<Set<string>>(new Set());
  const [isSeriesScopingLoaded, setIsSeriesScopingLoaded] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [bibInput, setBibInput] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingBibId, setEditingBibId] = useState<string | null>(null);
  const [editBibValue, setEditBibValue] = useState('');

  // ── Assessment state ───────────────────────────────────────────────────────
  const [assessments, setAssessments] = useState<CampAssessment[]>(initialAssessments);
  const [assessSort, setAssessSort] = useState<'bibNumber' | 'avgOverall'>('avgOverall');
  const [assessDir, setAssessDir] = useState<'asc' | 'desc'>('desc');

  // ── Fitness state ──────────────────────────────────────────────────────────
  const [fitnessResults, setFitnessResults] = useState<Map<string, CampFitnessResult>>(
    new Map(initialFitness.map(f => [f.playerId, f]))
  );
  const [fitnessScores, setFitnessScores] = useState<Map<string, string>>(
    new Map(initialFitness.map(f => [f.playerId, f.score.toString()]))
  );
  const [savingFitnessId, setSavingFitnessId] = useState<string | null>(null);

  // ── Results & AI state ─────────────────────────────────────────────────────
  const [selection, setSelection] = useState<Map<string, CampSelectionStatus>>(() => {
    const m = new Map<string, CampSelectionStatus>();
    initialPlayers.forEach(p => { if (p.selectionStatus) m.set(p.id, p.selectionStatus); });
    return m;
  });
  const [aiCriteria, setAiCriteria] = useState({
    totalPlayers: camp.selectionTarget || 15,
    batters: 5, bowlers: 4, allRounders: 3, wicketKeepers: 1, reserves: 2,
    requireFitnessPass: true,
    weightAssessment: 50, weightFitness: 25, weightSeriesPerformance: 25,
  });
  const [aiTeam, setAiTeam] = useState<CampSuggestedTeam | null>(null);
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [hasSavedSelection, setHasSavedSelection] = useState(false);
  const [aiRuns, setAiRuns] = useState<{ label: string; team: CampSuggestedTeam }[]>([]);

  const setAiC = (key: string, val: any) => setAiCriteria(prev => ({ ...prev, [key]: val }));

  // ── Load org players + series scoping ──────────────────────────────────────
  useEffect(() => {
    if (!activeOrganizationId) return;
    getPlayersWithDetailsFromDB(activeOrganizationId).then(setOrgPlayers);
    getSeriesByIdFromDB(seriesId).then(async seriesDoc => {
      if (seriesDoc?.participatingTeams?.length) {
        const teams = await Promise.all(
          seriesDoc.participatingTeams.map((tid: string) => getTeamByIdFromDB(tid))
        );
        const ids = new Set<string>();
        teams.forEach(t => (t?.playerIds || []).forEach((pid: string) => ids.add(pid)));
        setSeriesPlayerIds(ids);
      }
      setIsSeriesScopingLoaded(true);
    }).catch(() => setIsSeriesScopingLoaded(true));
  }, [activeOrganizationId, seriesId]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const invitedPlayerIds = new Set(campPlayers.map(cp => cp.playerId));
  const usedBibs = new Set(campPlayers.map(cp => cp.bibNumber));
  const nextBib = useMemo(() => { let n = 1; while (usedBibs.has(n)) n++; return n; }, [usedBibs]);

  const availablePlayers = useMemo(() =>
    orgPlayers.filter(p =>
      !invitedPlayerIds.has(p.id) &&
      (!isSeriesScopingLoaded || seriesPlayerIds.has(p.id)) &&
      (!playerSearch || p.name.toLowerCase().includes(playerSearch.toLowerCase()))
    ),
    [orgPlayers, invitedPlayerIds, seriesPlayerIds, isSeriesScopingLoaded, playerSearch]
  );

  // Aggregate assessment results per player
  const aggregatedResults = useMemo((): CampPlayerResult[] => {
    const assessByBib = new Map<number, CampAssessment[]>();
    assessments.forEach(a => {
      const arr = assessByBib.get(a.bibNumber) || [];
      arr.push(a);
      assessByBib.set(a.bibNumber, arr);
    });
    return campPlayers.map(cp => {
      const bibs = assessByBib.get(cp.bibNumber) || [];
      const skillVotes = bibs.filter(a => a.coachSuggestedSkill).map(a => a.coachSuggestedSkill!);
      const resolvedSkill = skillVotes.length > 0
        ? skillVotes.sort((a, b) => skillVotes.filter(s => s === b).length - skillVotes.filter(s => s === a).length)[0]
        : cp.playerPrimarySkill;
      return {
        campPlayer: cp, assessments: bibs,
        fitnessResult: fitnessResults.get(cp.playerId),
        avgBatting: avg(bibs, 'batting'), avgBowling: avg(bibs, 'bowling'),
        avgFielding: avg(bibs, 'fielding'), avgFitness: avg(bibs, 'fitness'),
        avgAttitude: avg(bibs, 'attitude'), avgOverall: avg(bibs, 'overall'),
        coachCount: bibs.length, fitnessPassed: fitnessResults.get(cp.playerId)?.passed,
        resolvedSkill,
      };
    });
  }, [campPlayers, assessments, fitnessResults]);

  const sortedResults = useMemo(() => {
    return [...aggregatedResults].sort((a, b) => {
      const av = assessSort === 'bibNumber' ? a.campPlayer.bibNumber : a.avgOverall;
      const bv = assessSort === 'bibNumber' ? b.campPlayer.bibNumber : b.avgOverall;
      return assessDir === 'asc' ? av - bv : bv - av;
    });
  }, [aggregatedResults, assessSort, assessDir]);

  const selCounts = useMemo(() => ({
    selected: Array.from(selection.values()).filter(s => s === 'selected').length,
    reserve: Array.from(selection.values()).filter(s => s === 'reserve').length,
  }), [selection]);

  const weightTotal = aiCriteria.weightAssessment + aiCriteria.weightFitness + aiCriteria.weightSeriesPerformance;

  // ── Players actions ────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!selectedPlayerId || !bibInput || !currentUser || !activeOrganizationId) return;
    const bib = parseInt(bibInput);
    if (isNaN(bib) || bib < 1) { toast({ title: 'Invalid bib number', variant: 'destructive' }); return; }
    const player = orgPlayers.find(p => p.id === selectedPlayerId);
    if (!player) return;
    setIsInviting(true);
    const res = await invitePlayerToCampAction({
      campId: camp.id, organizationId: activeOrganizationId,
      playerId: player.id, bibNumber: bib,
      playerName: player.name, playerPrimarySkill: player.primarySkill || '',
      playerBowlingStyle: (player as any).bowlingStyle,
      playerBattingOrder: (player as any).battingOrder,
      playerDominantHandBatting: (player as any).dominantHandBatting,
      playerDominantHandBowling: (player as any).dominantHandBowling,
      status: 'invited', invitedBy: currentUser.uid,
    });
    if (res.success) {
      const refreshed = await getCampPlayersAction(camp.id);
      if (refreshed.success) setCampPlayers(refreshed.players || []);
      setSelectedPlayerId(''); setBibInput(''); setPlayerSearch('');
      toast({ title: `${player.name} invited as Bib #${bib}` });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsInviting(false);
  };

  const handleRemovePlayer = async (campPlayerId: string, name: string) => {
    setRemovingId(campPlayerId);
    const res = await removeCampPlayerAction(campPlayerId);
    if (res.success) {
      setCampPlayers(prev => prev.filter(p => p.id !== campPlayerId));
      toast({ title: `${name} removed` });
    } else toast({ title: 'Error', description: res.error, variant: 'destructive' });
    setRemovingId(null);
  };

  const handleBibEdit = async (campPlayerId: string) => {
    const bib = parseInt(editBibValue);
    if (isNaN(bib) || bib < 1) { toast({ title: 'Invalid bib', variant: 'destructive' }); return; }
    const res = await updateCampPlayerAction(campPlayerId, { bibNumber: bib });
    if (res.success) {
      setCampPlayers(prev => prev.map(p => p.id === campPlayerId ? { ...p, bibNumber: bib } : p));
      setEditingBibId(null);
      toast({ title: `Bib updated to #${bib}` });
    } else toast({ title: 'Error', description: res.error, variant: 'destructive' });
  };

  // ── Fitness actions ────────────────────────────────────────────────────────
  const handleSaveFitness = async (cp: CampPlayer) => {
    const scoreStr = fitnessScores.get(cp.playerId) || '';
    const score = parseFloat(scoreStr);
    if (isNaN(score)) { toast({ title: 'Invalid score', variant: 'destructive' }); return; }
    if (!camp.fitnessTestType || !currentUser || !activeOrganizationId || !userProfile) return;
    const passing = camp.fitnessTestPassingScore || 0;
    setSavingFitnessId(cp.playerId);
    const res = await recordCampFitnessResultAction({
      campId: camp.id, organizationId: activeOrganizationId,
      playerId: cp.playerId, bibNumber: cp.bibNumber,
      testType: camp.fitnessTestType, score, passed: score >= passing,
      recordedByUid: currentUser.uid,
      recordedByName: userProfile.displayName || userProfile.email || 'Admin',
    });
    if (res.success) {
      const refreshed = await getCampFitnessResultsAction(camp.id);
      if (refreshed.success) {
        const map = new Map<string, CampFitnessResult>();
        refreshed.results?.forEach(f => map.set(f.playerId, f));
        setFitnessResults(map);
      }
      toast({ title: `Fitness saved — ${score >= passing ? 'PASS ✓' : 'FAIL ✗'}` });
    } else toast({ title: 'Error', description: res.error, variant: 'destructive' });
    setSavingFitnessId(null);
  };

  // ── AI & Results actions ───────────────────────────────────────────────────
  const handleRunAI = async () => {
    if (weightTotal !== 100) {
      toast({ title: 'Weights must sum to 100', description: `Current: ${weightTotal}%`, variant: 'destructive' });
      return;
    }
    setIsRunningAI(true);
    const res = await runCampAISelectionAction({ campId: camp.id, criteria: aiCriteria });
    if (res.success && res.team) {
      setAiTeam(res.team);
      setAiRuns(prev => [...prev, {
        label: `Run ${prev.length + 1} — Assess ${aiCriteria.weightAssessment}% / Fit ${aiCriteria.weightFitness}% / Series ${aiCriteria.weightSeriesPerformance}%`,
        team: res.team!,
      }]);
      toast({ title: 'AI selection complete ✓' });
    } else toast({ title: 'AI Error', description: res.error, variant: 'destructive' });
    setIsRunningAI(false);
  };

  const applyAIToSelection = () => {
    if (!aiTeam) return;
    const newSel = new Map<string, CampSelectionStatus>();
    aiTeam.forEach(t => {
      const cp = campPlayers.find(p => p.bibNumber === t.bibNumber);
      if (cp) newSel.set(cp.id, t.selectionType as CampSelectionStatus);
    });
    setSelection(newSel);
    setHasSavedSelection(false);
    toast({ title: 'AI selection applied — review and save' });
  };

  const setPlayerSelection = (id: string, status: CampSelectionStatus | '') => {
    setSelection(prev => {
      const next = new Map(prev);
      if (status === '') next.delete(id); else next.set(id, status);
      return next;
    });
    setHasSavedSelection(false);
  };

  const handleSaveSelection = async () => {
    setIsSavingSelection(true);
    const payload = Array.from(selection.entries()).map(([id, status]) => ({
      campPlayerId: id, selectionStatus: status,
    }));
    const res = await saveFinalSelectionAction(camp.id, payload);
    if (res.success) { toast({ title: 'Selection saved ✓' }); setHasSavedSelection(true); }
    else toast({ title: 'Error', description: res.error, variant: 'destructive' });
    setIsSavingSelection(false);
  };

  const sortedPlayers = useMemo(() => [...campPlayers].sort((a, b) => a.bibNumber - b.bibNumber), [campPlayers]);

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <Tabs defaultValue="players" className="mt-2">
      <TabsList className={`grid w-full ${canManage ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <TabsTrigger value="players"><Users className="h-3.5 w-3.5 mr-1.5" />Players</TabsTrigger>
        <TabsTrigger value="assessment"><Star className="h-3.5 w-3.5 mr-1.5" />Assessment</TabsTrigger>
        <TabsTrigger value="fitness"><Activity className="h-3.5 w-3.5 mr-1.5" />Fitness</TabsTrigger>
        {canManage && <TabsTrigger value="results"><Brain className="h-3.5 w-3.5 mr-1.5" />Results & AI</TabsTrigger>}
      </TabsList>

      {/* ── PLAYERS TAB ── */}
      <TabsContent value="players" className="space-y-4 mt-4">
        {canManage && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search players..."
                value={playerSearch} onChange={e => setPlayerSearch(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={!isSeriesScopingLoaded ? 'Loading...' : availablePlayers.length === 0 ? 'No eligible players' : 'Select player...'} />
                </SelectTrigger>
                <SelectContent>
                  {availablePlayers.slice(0, 50).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {p.primarySkill}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 w-28">
                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input type="number" placeholder={nextBib.toString()} value={bibInput}
                  onChange={e => setBibInput(e.target.value)} min={1} />
              </div>
              <Button onClick={handleInvite} disabled={isInviting || !selectedPlayerId || !bibInput}>
                {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>
            {bibInput && usedBibs.has(parseInt(bibInput)) && (
              <p className="text-xs text-destructive">Bib #{bibInput} already assigned</p>
            )}
          </CardContent>
        </Card>
        )}

        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="col-span-1">Bib</div>
            <div className="col-span-3">{canSeeNames ? 'Name' : ''}</div>
            <div className="col-span-2">Skill</div>
            <div className="col-span-2">Bat Order</div>
            <div className="col-span-2">Bowl Style</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No players invited yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {sortedPlayers.map(cp => (
                <div key={cp.id} className="grid grid-cols-12 gap-4 items-center px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="col-span-1">
                    {canManage && editingBibId === cp.id ? (
                      <div className="flex items-center gap-0.5">
                        <Input type="number" className="w-12 h-7 text-xs px-1" value={editBibValue}
                          onChange={e => setEditBibValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleBibEdit(cp.id)} />
                        <Button size="sm" className="h-7 px-1.5 text-xs" onClick={() => handleBibEdit(cp.id)}>✓</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => setEditingBibId(null)}>✕</Button>
                      </div>
                    ) : (
                      <span onClick={() => canManage && (setEditingBibId(cp.id), setEditBibValue(cp.bibNumber.toString()))}
                        className={`text-base font-bold text-primary ${canManage ? 'hover:underline cursor-pointer' : ''}`}>
                        #{cp.bibNumber}
                      </span>
                    )}
                  </div>
                  <div className="col-span-3">
                    {canSeeNames && <p className="text-sm font-medium truncate">{cp.playerName}</p>}
                    {canSeeNames && <Badge variant="outline" className="text-xs capitalize mt-0.5">{cp.status}</Badge>}
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm">{cp.playerPrimarySkill || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-muted-foreground">{cp.playerBattingOrder || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-muted-foreground">{cp.playerBowlingStyle || '—'}</span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    {canManage && (
                      <button onClick={() => handleRemovePlayer(cp.id, cp.playerName)}
                        disabled={removingId === cp.id}
                        className="text-muted-foreground hover:text-destructive transition-colors">
                        {removingId === cp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


      </TabsContent>

      {/* ── ASSESSMENT TAB ── */}
      <TabsContent value="assessment" className="space-y-4 mt-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">{assessments.length} assessments from {new Set(assessments.map(a => a.assessedByUid)).size} coaches</p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/series/${seriesId}/camp/${camp.id}/assess${navParam}`}>
              <Star className="mr-2 h-3.5 w-3.5" /> Mobile Assessment View
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            {(['avgOverall', 'bibNumber'] as const).map(key => (
              <Button key={key} variant={assessSort === key ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
                onClick={() => { if (assessSort === key) setAssessDir(d => d === 'asc' ? 'desc' : 'asc'); else { setAssessSort(key); setAssessDir('desc'); } }}>
                {key === 'avgOverall' ? 'Overall' : 'Bib #'}
                {assessSort === key && (assessDir === 'asc' ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />)}
              </Button>
            ))}
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            {sortedResults.length === 0 ? (
              <div className="text-center py-8">
                <Star className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No assessments yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {sortedResults.map(r => (
                  <div key={r.campPlayer.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-base font-bold text-primary">#{r.campPlayer.bibNumber}</span>
                      {canSeeNames && <span className="text-sm font-medium">{r.campPlayer.playerName}</span>}
                      <Badge variant="outline" className="text-xs">{r.resolvedSkill}</Badge>
                      {r.campPlayer.playerPrimarySkill !== r.resolvedSkill && (
                        <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                          Coach: {r.resolvedSkill}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{r.coachCount} coach{r.coachCount !== 1 ? 'es' : ''}</span>
                    </div>
                    {r.coachCount > 0 ? (
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-x-4 gap-y-1">
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
                      <p className="text-xs text-muted-foreground italic">No assessments yet</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── FITNESS TAB ── */}
      <TabsContent value="fitness" className="space-y-4 mt-4">
        {!camp.fitnessTestType ? (
          <div className="text-center py-8 space-y-2">
            <Activity className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No fitness test configured for this camp.</p>
            <p className="text-xs text-muted-foreground">Edit the camp to add a fitness test type.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {camp.fitnessTestType} · pass ≥ {camp.fitnessTestPassingScore} ·
                {fitnessResults.size}/{sortedPlayers.length} recorded ·
                {Array.from(fitnessResults.values()).filter(f => f.passed).length} passed
              </p>
            </div>
            <Card>
              <CardContent className="p-0">
                {sortedPlayers.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">No players invited yet</p>
                ) : (
                  <div className="divide-y">
                    {sortedPlayers.map(cp => {
                      const result = fitnessResults.get(cp.playerId);
                      const scoreVal = fitnessScores.get(cp.playerId) || '';
                      const passing = camp.fitnessTestPassingScore || 0;
                      const previewPass = scoreVal !== '' && !isNaN(parseFloat(scoreVal))
                        ? parseFloat(scoreVal) >= passing : null;
                      return (
                        <div key={cp.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="text-base font-bold text-primary w-10 shrink-0">#{cp.bibNumber}</span>
                          <div className="flex-1 min-w-0">
                            {canSeeNames && <p className="text-sm font-medium truncate">{cp.playerName}</p>}
                            <p className="text-xs text-muted-foreground">{cp.playerPrimarySkill}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Input type="number" step="0.1" placeholder={`≥ ${passing}`}
                              value={scoreVal}
                              onChange={e => setFitnessScores(prev => new Map(prev).set(cp.playerId, e.target.value))}
                              className="w-24 h-8 text-sm" />
                            {previewPass !== null && (
                              previewPass
                                ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                                : <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                            )}
                            {result && (
                              <Badge className={`text-xs shrink-0 ${result.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {result.passed ? 'Pass' : 'Fail'} ({result.score})
                              </Badge>
                            )}
                            <Button size="sm" className="h-8 px-3 shrink-0"
                              disabled={!scoreVal || savingFitnessId === cp.playerId}
                              onClick={() => handleSaveFitness(cp)}>
                              {savingFitnessId === cp.playerId
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : result ? 'Update' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>

      {/* ── RESULTS & AI TAB — admin only ── */}
      {canManage && (
      <TabsContent value="results" className="space-y-4 mt-4">
        {/* Selection summary */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className="bg-green-100 text-green-700 border-green-200 text-sm px-3 py-1">
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> {selCounts.selected} Selected
          </Badge>
          <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-sm px-3 py-1">
            <Users className="h-3.5 w-3.5 mr-1.5" /> {selCounts.reserve} Reserve
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1">
            <Target className="h-3.5 w-3.5 mr-1.5" /> Target: {camp.selectionTarget}
          </Badge>
          <Button className="ml-auto" size="sm" onClick={handleSaveSelection}
            disabled={isSavingSelection || hasSavedSelection}>
            {isSavingSelection ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> :
              hasSavedSelection ? <CheckCircle className="mr-2 h-3.5 w-3.5" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            {hasSavedSelection ? 'Saved' : 'Save Selection'}
          </Button>
        </div>

        {/* AI Criteria */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4" /> AI Selection Criteria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {([['totalPlayers','Squad size'],['batters','Batters'],['bowlers','Bowlers'],
                ['allRounders','All-rounders'],['wicketKeepers','Keepers'],['reserves','Reserves']] as [string,string][])
                .map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <Input type="number" min={0} className="h-7 text-xs"
                    value={(aiCriteria as any)[key]}
                    onChange={e => setAiC(key, parseInt(e.target.value) || 0)} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="reqFit" checked={aiCriteria.requireFitnessPass}
                onChange={e => setAiC('requireFitnessPass', e.target.checked)} className="h-4 w-4" />
              <label htmlFor="reqFit" className="text-sm">Require fitness pass</label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([['weightAssessment','Camp assessment'],['weightFitness','Fitness test'],['weightSeriesPerformance','Series perf.']] as [string,string][])
                .map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} max={100} className="h-7 text-xs"
                      value={(aiCriteria as any)[key]}
                      onChange={e => setAiC(key, parseInt(e.target.value) || 0)} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${weightTotal === 100 ? 'text-green-600' : 'text-destructive'}`}>
                Total: {weightTotal}% {weightTotal !== 100 ? '(must be 100)' : '✓'}
              </span>
              <Button size="sm" onClick={handleRunAI} disabled={isRunningAI || weightTotal !== 100}>
                {isRunningAI ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Brain className="mr-2 h-3.5 w-3.5" />}
                Run AI
              </Button>
              {aiTeam && (
                <Button size="sm" variant="outline" onClick={applyAIToSelection}>
                  Apply AI picks →
                </Button>
              )}
            </div>
            {aiRuns.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Previous runs:</p>
                {aiRuns.map((r, i) => (
                  <button key={i} onClick={() => setAiTeam(r.team)}
                    className="text-xs text-primary hover:underline block">{r.label}</button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI result */}
        {aiTeam && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">AI Suggested Selection</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {aiTeam.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2">
                    <span className="text-sm font-bold text-primary w-8">#{p.bibNumber}</span>
                    <span className="text-sm flex-1">{p.playerName}</span>
                    <Badge variant="outline" className="text-xs">{p.suggestedRole}</Badge>
                    <Badge className={`text-xs ${p.selectionType === 'selected' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                      {p.selectionType === 'selected' ? '✓ Selected' : '↑ Reserve'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{p.suitabilityScore}/100</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Final selection per player */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Final Selection</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sortedResults.map(r => (
                <div key={r.campPlayer.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-sm font-bold text-primary w-8">#{r.campPlayer.bibNumber}</span>
                  <span className="text-sm flex-1 truncate">{r.campPlayer.playerName}</span>
                  {r.avgOverall > 0 && <span className="text-xs text-muted-foreground">Avg: {r.avgOverall}</span>}
                  {r.fitnessPassed !== undefined && (
                    <Badge className={`text-xs ${r.fitnessPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {r.fitnessPassed ? 'Pass' : 'Fail'}
                    </Badge>
                  )}
                  <Select value={selection.get(r.campPlayer.id) || 'unset'}
                    onValueChange={v => setPlayerSelection(r.campPlayer.id, (v === 'unset' ? '' : v) as CampSelectionStatus | '')}>
                    <SelectTrigger className="h-7 text-xs w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Unset</SelectItem>
                      <SelectItem value="selected">✓ Selected</SelectItem>
                      <SelectItem value="reserve">↑ Reserve</SelectItem>
                      <SelectItem value="not_selected">✗ Not Selected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      )}
    </Tabs>
  );
}
