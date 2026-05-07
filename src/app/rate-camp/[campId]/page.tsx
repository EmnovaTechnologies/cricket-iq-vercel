'use client';

/**
 * FILE: src/app/rate-camp/[campId]/page.tsx
 *
 * Mobile-first camp assessment page — mirrors the rate players UI.
 * Selector swipes through bibs one at a time, rates with stars, adds notes.
 * Bib grid shows locked (green) / draft (amber) / unassessed (grey).
 * Includes scratchpad tab and fitness recording.
 * Bib-blind — no player names shown.
 */

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  getCampByIdAction, getCampPlayersAction,
  getMyCampAssessmentsAction, submitCampAssessmentAction,
  updateCampAssessmentAction, lockCampAssessmentAction,
  recordCampFitnessResultAction, getCampFitnessResultsAction,
} from '@/lib/actions/camp-actions';
import type { SelectionCamp, CampPlayer, CampAssessment, CampFitnessResult } from '@/types';
import { EFFECTIVE_SKILLS, BOWLING_STYLES, BATTING_ORDERS } from '@/lib/constants';
import { CampScratchpad } from '@/components/camp/camp-scratchpad';
import {
  Loader2, ChevronLeft, ChevronRight, Star, Lock,
  ClipboardList, Activity, Check, Search, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type AssessmentForm = {
  batting: number; bowling: number; fielding: number;
  fitness: number; attitude: number; overall: number;
  coachSuggestedSkill: string; coachSuggestedBowlingStyle: string;
  coachSuggestedBattingOrder: string; notes: string;
};

const emptyForm = (): AssessmentForm => ({
  batting: 0, bowling: 0, fielding: 0, fitness: 0, attitude: 0, overall: 0,
  coachSuggestedSkill: '', coachSuggestedBowlingStyle: '',
  coachSuggestedBattingOrder: '', notes: '',
});

const RATING_LABELS = ['', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent'];
const RATING_DIMS: [keyof AssessmentForm, string][] = [
  ['batting', 'Batting'], ['bowling', 'Bowling'], ['fielding', 'Fielding'],
  ['fitness', 'Fitness'], ['attitude', 'Attitude'], ['overall', 'Overall'],
];

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={disabled}
          onClick={() => onChange(value === n ? 0 : n)}
          className={disabled ? 'cursor-default' : 'cursor-pointer active:scale-110 transition-transform'}>
          <Star className={`h-8 w-8 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />
        </button>
      ))}
      {value > 0 && (
        <span className="text-xs text-muted-foreground ml-1">{RATING_LABELS[value]}</span>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RateCampInner() {
  const params = useParams<{ campId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();
  const campId = params.campId;
  const fromSelector = searchParams.get('from') === 'selector';

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>([]);
  const [myAssessments, setMyAssessments] = useState<Map<number, CampAssessment>>(new Map());
  const [fitnessResults, setFitnessResults] = useState<Map<string, CampFitnessResult>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Navigation
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tab, setTab] = useState<'assess' | 'scratchpad' | 'fitness'>('assess');

  // Assessment form
  const [form, setForm] = useState<AssessmentForm>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [showBibGrid, setShowBibGrid] = useState(true);
  const [showSkillOverride, setShowSkillOverride] = useState(false);

  // Fitness
  const [fitnessScore, setFitnessScore] = useState('');
  const [fitnessPassed, setFitnessPassed] = useState<boolean | null>(null);
  const [isSavingFitness, setIsSavingFitness] = useState(false);

  // Swipe
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null || tab !== 'assess') return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < sortedPlayers.length - 1) navigateTo(currentIndex + 1);
      else if (diff < 0 && currentIndex > 0) navigateTo(currentIndex - 1);
    }
    setTouchStart(null);
  };

  const sortedPlayers = useMemo(
    () => [...campPlayers].sort((a, b) => a.bibNumber - b.bibNumber),
    [campPlayers]
  );

  const currentPlayer = sortedPlayers[currentIndex] || null;

  // Load data
  useEffect(() => {
    if (!campId || !currentUser) return;
    Promise.all([
      getCampByIdAction(campId),
      getCampPlayersAction(campId),
      getMyCampAssessmentsAction(campId, currentUser.uid),
      getCampFitnessResultsAction(campId),
    ]).then(([campRes, playersRes, assessRes, fitnessRes]) => {
      if (campRes.success) setCamp(campRes.camp!);
      if (playersRes.success) setCampPlayers(playersRes.players || []);
      if (assessRes.success) {
        const map = new Map<number, CampAssessment>();
        assessRes.assessments?.forEach(a => map.set(a.bibNumber, a));
        setMyAssessments(map);
      }
      if (fitnessRes.success) {
        const map = new Map<string, CampFitnessResult>();
        fitnessRes.results?.forEach(r => map.set(r.playerId, r));
        setFitnessResults(map);
      }
      setIsLoading(false);
    });
  }, [campId, currentUser]);

  // Load form when navigating to a new bib
  useEffect(() => {
    if (!currentPlayer) return;
    setShowSkillOverride(false);
    const existing = myAssessments.get(currentPlayer.bibNumber);
    if (existing) {
      setForm({
        batting: existing.batting || 0, bowling: existing.bowling || 0,
        fielding: existing.fielding || 0, fitness: existing.fitness || 0,
        attitude: existing.attitude || 0, overall: existing.overall || 0,
        coachSuggestedSkill: existing.coachSuggestedSkill || '',
        coachSuggestedBowlingStyle: existing.coachSuggestedBowlingStyle || '',
        coachSuggestedBattingOrder: existing.coachSuggestedBattingOrder || '',
        notes: existing.notes || '',
      });
    } else {
      setForm(emptyForm());
    }
    // Load fitness for this player
    const fr = fitnessResults.get(currentPlayer.playerId);
    setFitnessScore(fr?.score?.toString() || '');
    setFitnessPassed(fr?.passed ?? null);
  }, [currentIndex, currentPlayer?.bibNumber]);

  const navigateTo = (index: number) => {
    if (index < 0 || index >= sortedPlayers.length) return;
    setCurrentIndex(index);
  };

  const setF = (key: keyof AssessmentForm, val: any) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const existing = currentPlayer ? myAssessments.get(currentPlayer.bibNumber) : null;
  const isLocked = existing?.isLocked || false;
  const lockedCount = sortedPlayers.filter(p => myAssessments.get(p.bibNumber)?.isLocked).length;
  const assessedCount = myAssessments.size;

  // Save assessment
  const handleSave = async (lock: boolean) => {
    if (!currentPlayer || !currentUser || !camp || !userProfile) return;
    setIsSaving(true);
    try {
      const payload = {
        campId, organizationId: camp.organizationId,
        bibNumber: currentPlayer.bibNumber,
        assessedByUid: currentUser.uid,
        assessedByName: userProfile.displayName || userProfile.email || 'Coach',
        batting: form.batting, bowling: form.bowling, fielding: form.fielding,
        fitness: form.fitness, attitude: form.attitude, overall: form.overall,
        coachSuggestedSkill: form.coachSuggestedSkill || undefined,
        coachSuggestedBowlingStyle: form.coachSuggestedBowlingStyle || undefined,
        coachSuggestedBattingOrder: form.coachSuggestedBattingOrder || undefined,
        notes: form.notes, isLocked: lock,
      };

      let newAssessment: CampAssessment;
      if (existing) {
        await updateCampAssessmentAction(existing.id, currentUser.uid, payload);
        if (lock) await lockCampAssessmentAction(existing.id, currentUser.uid);
        newAssessment = { ...existing, ...payload, isLocked: lock };
      } else {
        const res = await submitCampAssessmentAction(payload);
        if (!res.success) throw new Error(res.error);
        newAssessment = { id: res.assessmentId!, ...payload, isLocked: lock } as CampAssessment;
      }

      setMyAssessments(prev => {
        const next = new Map(prev);
        next.set(currentPlayer.bibNumber, newAssessment);
        return next;
      });

      toast({ title: lock ? `Bib #${currentPlayer.bibNumber} locked ✓` : `Bib #${currentPlayer.bibNumber} saved` });

      // Auto-advance to next unassessed bib
      if (lock) {
        const nextUnassessed = sortedPlayers.findIndex(
          (p, i) => i > currentIndex && !myAssessments.get(p.bibNumber)?.isLocked
        );
        if (nextUnassessed !== -1) navigateTo(nextUnassessed);
      }
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Save fitness
  const handleSaveFitness = async () => {
    if (!currentPlayer || !currentUser || !camp) return;
    const score = parseFloat(fitnessScore);
    if (isNaN(score)) { toast({ title: 'Enter a valid score', variant: 'destructive' }); return; }
    setIsSavingFitness(true);
    try {
      const passing = camp.fitnessTestPassingScore || 0;
      const passed = fitnessPassed !== null ? fitnessPassed : score >= passing;
      await recordCampFitnessResultAction({
        campId, playerId: currentPlayer.playerId,
        organizationId: camp.organizationId,
        score, passed,
        testType: camp.fitnessTestType || 'Fitness Test',
        recordedByUid: currentUser.uid,
      });
      const updated: CampFitnessResult = {
        id: '', campId, playerId: currentPlayer.playerId,
        organizationId: camp.organizationId,
        score, passed,
        testType: camp.fitnessTestType || 'Fitness Test',
        recordedByUid: currentUser.uid, recordedAt: new Date().toISOString(),
      };
      setFitnessResults(prev => { const n = new Map(prev); n.set(currentPlayer.playerId, updated); return n; });
      toast({ title: `Fitness recorded for Bib #${currentPlayer.bibNumber} — ${passed ? 'PASS ✓' : 'FAIL ✗'}` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsSavingFitness(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!camp || sortedPlayers.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground mb-4">No players in this camp yet.</p>
          <Button onClick={() => router.push(fromSelector ? '/selector' : `/camps/${campId}`)}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  const bibStatus = (p: CampPlayer) => {
    const a = myAssessments.get(p.bibNumber);
    if (!a) return 'none';
    if (a.isLocked) return 'locked';
    return 'draft';
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col max-w-lg mx-auto"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-2.5 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(fromSelector ? '/selector' : `/camps/${campId}`)}
            className="opacity-80 hover:opacity-100 -ml-1"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{camp.name}</p>
            <p className="text-xs opacity-75">{lockedCount} locked · {assessedCount} assessed · {sortedPlayers.length} total</p>
          </div>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex border-b">
        {([
          ['assess', 'Assess', <Star key="s" className="h-3.5 w-3.5" />],
          ['scratchpad', 'Scratchpad', <ClipboardList key="c" className="h-3.5 w-3.5" />],
          ...(camp.fitnessTestType ? [['fitness', 'Fitness', <Activity key="a" className="h-3.5 w-3.5" />]] : []),
        ] as [typeof tab, string, React.ReactNode][]).map(([t, label, icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
              tab === t
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── ASSESS TAB ── */}
      {tab === 'assess' && currentPlayer && (
        <div className="flex-1 px-4 pb-6 space-y-3 pt-3">
          {/* Progress bar only — bib grid hidden by default */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Bib {currentIndex + 1} of {sortedPlayers.length}</span>
              <button
                className="text-primary underline text-xs"
                onClick={() => setShowBibGrid(v => !v)}
              >
                {showBibGrid ? 'Hide grid' : 'Show grid'}
              </button>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mb-1">
              <div className="bg-primary rounded-full h-1.5 transition-all"
                style={{ width: `${(lockedCount / sortedPlayers.length) * 100}%` }} />
            </div>
            {showBibGrid && (
              <div className="flex gap-1 flex-wrap mt-2">
                {sortedPlayers.map((p, i) => {
                  const status = bibStatus(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigateTo(i)}
                      className={cn(
                        'w-7 h-7 rounded-full text-xs font-medium transition-colors',
                        i === currentIndex
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1'
                          : status === 'locked' ? 'bg-green-500 text-white'
                          : status === 'draft' ? 'bg-amber-400 text-white'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {p.bibNumber}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bib card with arrows */}
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => navigateTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="h-10 w-10 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0 text-center">
                <p className="text-3xl font-bold text-primary">Bib #{currentPlayer.bibNumber}</p>
                <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{currentPlayer.playerPrimarySkill}</Badge>
                  {currentPlayer.playerBattingOrder && (
                    <Badge variant="secondary" className="text-xs">{currentPlayer.playerBattingOrder}</Badge>
                  )}
                  {currentPlayer.playerBowlingStyle && (
                    <Badge variant="secondary" className="text-xs">{currentPlayer.playerBowlingStyle}</Badge>
                  )}
                </div>
                {isLocked && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 mt-1">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button
                  onClick={() => navigateTo(currentIndex + 1)}
                  disabled={currentIndex === sortedPlayers.length - 1}
                  className="h-10 w-10 rounded-full border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                {existing && !isLocked && (
                  <span className="text-[10px] text-amber-600 font-medium">Draft</span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center pb-2">← swipe to navigate →</p>
          </div>

          {isLocked && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-medium">
              <Lock className="h-4 w-4 inline mr-1" /> Assessment locked
            </div>
          )}

          {/* All ratings in one compact card */}
          {!isLocked && (
            <div className="bg-card border rounded-xl p-3 space-y-2">
              {RATING_DIMS.map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground w-12 shrink-0">{label}</label>
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} type="button"
                        onClick={() => setF(key, (form[key] as number) === n ? 0 : n)}>
                        <Star className={`h-6 w-6 ${n <= (form[key] as number) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/20'}`} />
                      </button>
                    ))}
                  </div>
                  {(form[key] as number) > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">{RATING_LABELS[form[key] as number]}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Skill override — collapsed by default */}
          {!isLocked && (
            <div className="bg-card border rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-sm"
                onClick={() => setShowSkillOverride(v => !v)}
              >
                <span className="text-muted-foreground text-xs font-medium">Override skill / position</span>
                <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', showSkillOverride && 'rotate-90')} />
              </button>
              {showSkillOverride && (
                <div className="px-4 pb-4 space-y-2 border-t pt-3">
                  <Select
                    value={form.coachSuggestedSkill || 'keep'}
                    onValueChange={v => setF('coachSuggestedSkill', v === 'keep' ? '' : v)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder={`Keep as ${currentPlayer.playerPrimarySkill}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep: {currentPlayer.playerPrimarySkill}</SelectItem>
                      {EFFECTIVE_SKILLS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={form.coachSuggestedBattingOrder || 'none'}
                      onValueChange={v => setF('coachSuggestedBattingOrder', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger className="text-sm"><SelectValue placeholder="Batting order" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {BATTING_ORDERS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select
                      value={form.coachSuggestedBowlingStyle || 'none'}
                      onValueChange={v => setF('coachSuggestedBowlingStyle', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger className="text-sm"><SelectValue placeholder="Bowling style" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {BOWLING_STYLES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {!isLocked && (
            <Textarea
              placeholder="Observations..."
              value={form.notes}
              onChange={e => setF('notes', e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          )}

          {/* Action buttons */}
          {!isLocked && (
            <div className="grid grid-cols-2 gap-3 pb-4">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Draft
              </Button>
              <Button onClick={() => handleSave(true)} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Save & Lock
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── SCRATCHPAD TAB ── */}
      {tab === 'scratchpad' && camp && (
        <div className="flex-1 px-4 pb-6 pt-4">
          <CampScratchpad
            camp={camp}
            campPlayers={sortedPlayers}
            initialAssessments={myAssessments}
            onAssessmentsUpdated={setMyAssessments}
          />
        </div>
      )}

      {/* ── FITNESS TAB ── */}
      {tab === 'fitness' && currentPlayer && (
        <div className="flex-1 px-4 pb-6 pt-4 space-y-4">
          {/* Bib navigation */}
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 p-3">
              <button
                onClick={() => navigateTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="h-10 w-10 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-primary">Bib #{currentPlayer.bibNumber}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{camp.fitnessTestType || 'Fitness Test'}</p>
                {camp.fitnessTestPassingScore && (
                  <p className="text-xs text-muted-foreground">Passing score: {camp.fitnessTestPassingScore}</p>
                )}
              </div>
              <button
                onClick={() => navigateTo(currentIndex + 1)}
                disabled={currentIndex === sortedPlayers.length - 1}
                className="h-10 w-10 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Fitness form */}
          <div className="bg-card border rounded-xl p-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Score / Level</label>
              <Input
                type="number"
                step="0.1"
                placeholder={`e.g. ${camp.fitnessTestPassingScore || '16.1'}`}
                value={fitnessScore}
                onChange={e => {
                  const val = e.target.value;
                  setFitnessScore(val);
                  if (camp.fitnessTestPassingScore && val) {
                    const score = parseFloat(val);
                    if (!isNaN(score)) setFitnessPassed(score >= camp.fitnessTestPassingScore);
                  }
                }}
                className="text-lg font-bold text-center"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Result</label>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map(passed => (
                  <button
                    key={passed.toString()}
                    type="button"
                    onClick={() => setFitnessPassed(passed)}
                    className={cn(
                      'h-12 rounded-xl border-2 text-sm font-semibold transition-all',
                      fitnessPassed === passed
                        ? passed ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500'
                        : 'bg-background border-border text-muted-foreground'
                    )}
                  >
                    {passed ? '✓ Passed' : '✗ Failed'}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={handleSaveFitness}
              disabled={isSavingFitness || !fitnessScore}
            >
              {isSavingFitness
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                : <><Check className="mr-2 h-4 w-4" /> Save Fitness Result</>
              }
            </Button>
          </div>

          {/* Bib grid for fitness status */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Green = recorded</p>
            <div className="flex gap-1 flex-wrap">
              {sortedPlayers.map((p, i) => {
                const hasFitness = fitnessResults.has(p.playerId);
                return (
                  <button
                    key={p.id}
                    onClick={() => navigateTo(i)}
                    className={cn(
                      'w-7 h-7 rounded-full text-xs font-medium transition-colors',
                      i === currentIndex
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1'
                        : hasFitness ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {p.bibNumber}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RateCampPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <RateCampInner />
    </Suspense>
  );
}
