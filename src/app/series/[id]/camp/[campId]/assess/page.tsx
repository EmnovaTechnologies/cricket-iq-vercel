'use client';

import { useState, Suspense, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getCampByIdAction, getCampPlayersAction,
  getMyCampAssessmentsAction, submitCampAssessmentAction,
  updateCampAssessmentAction, lockCampAssessmentAction, unlockCampAssessmentAction
} from '@/lib/actions/camp-actions';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { SelectionCamp, CampPlayer, CampAssessment } from '@/types';
import { EFFECTIVE_SKILLS, BOWLING_STYLES, BATTING_ORDERS } from '@/lib/constants';
import {
  Loader2, ArrowLeft, Star, Lock, Unlock,
  ChevronLeft, ChevronRight, ShieldAlert, Trophy, Check, Search,
  ClipboardList, Users
} from 'lucide-react';

const RATING_LABELS = ['', 'Poor', 'Below Average', 'Average', 'Good', 'Excellent'];

function StarRating({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={disabled}
          onClick={() => onChange(n)}
          className={`transition-colors ${disabled ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}>
          <Star className={`h-7 w-7 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
        </button>
      ))}
      {value > 0 && <span className="text-xs text-muted-foreground ml-1">{RATING_LABELS[value]}</span>}
    </div>
  );
}

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

export default function CampAssessPage() {
  const params = useParams<{ id: string; campId: string }>();
  const { id: seriesId, campId } = params;
  const searchParams = useSearchParams();
  const fromSeries = searchParams.get('from') === 'series';
  const fromSeriesId = searchParams.get('seriesId') || seriesId;
  const fromSelector = searchParams.get('from') === 'selector';
  const backHref = fromSelector
    ? '/selector'
    : fromSeries
    ? `/camps/${campId}?from=series&seriesId=${fromSeriesId}`
    : `/camps/${campId}?from=camps`;
  const backLabel = fromSelector ? 'Back to Tasks' : fromSeries ? 'Back to Camp (via Series)' : 'Back to Camp';
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  // Selectors are bib-blind — only admins/org-admins/series-admins can see names
  const canSeeNames = !!(
    userProfile?.roles?.includes('admin') ||
    userProfile?.roles?.includes('Organization Admin') ||
    userProfile?.roles?.includes('Series Admin') ||
    userProfile?.roles?.includes('Team Manager')
  );

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>([]);
  const [myAssessments, setMyAssessments] = useState<Map<number, CampAssessment>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Bib entry state
  const [bibInput, setBibInput] = useState('');
  const [currentBib, setCurrentBib] = useState<number | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<CampPlayer | null>(null);
  const [form, setForm] = useState<AssessmentForm>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [step, setStep] = useState<'bib' | 'assess'>('bib');
  const [mode, setMode] = useState<'bib' | 'scratchpad'>('bib');
  const [scratchpad, setScratchpad] = useState('');
  const [scratchpadParsed, setScratchpadParsed] = useState<Map<number, string>>(new Map());
  const [isApplyingScratchpad, setIsApplyingScratchpad] = useState(false);
  const [scratchpadRatings, setScratchpadRatings] = useState<Map<number, Partial<AssessmentForm>>>(new Map());
  const [showBibSuggestions, setShowBibSuggestions] = useState(false);
  const [bibSuggestionFilter, setBibSuggestionFilter] = useState('');

  useEffect(() => {
    if (campId) {
      const saved = localStorage.getItem(`scratchpad_${campId}`);
      if (saved) {
        setScratchpad(saved);
        setScratchpadParsed(parseScratchpad(saved));
      }
    }
  }, [campId]);

  useEffect(() => {
    if (!campId || !currentUser) return;
    Promise.all([
      getCampByIdAction(campId),
      getCampPlayersAction(campId),
      getMyCampAssessmentsAction(campId, currentUser.uid),
    ]).then(([campRes, playersRes, assessRes]) => {
      if (campRes.success) setCamp(campRes.camp!);
      if (playersRes.success) setCampPlayers(playersRes.players || []);
      if (assessRes.success) {
        const map = new Map<number, CampAssessment>();
        assessRes.assessments?.forEach(a => map.set(a.bibNumber, a));
        setMyAssessments(map);
      }
      setIsLoading(false);
    });
  }, [campId, currentUser]);

  // Parse scratchpad text into per-bib notes
  const parseScratchpad = (text: string) => {
    const map = new Map<number, string>();
    // Split on #N patterns
    const parts = text.split(/(#\d+)/g);
    let currentBib: number | null = null;
    let currentText = '';
    parts.forEach(part => {
      const bibMatch = part.match(/^#(\d+)$/);
      if (bibMatch) {
        if (currentBib !== null && currentText.trim()) {
          const existing = map.get(currentBib) || '';
          map.set(currentBib, existing ? `${existing} / ${currentText.trim()}` : currentText.trim());
        }
        currentBib = parseInt(bibMatch[1]);
        currentText = '';
      } else if (currentBib !== null) {
        currentText += part;
      }
    });
    // Flush last bib
    if (currentBib !== null && currentText.trim()) {
      const existing = map.get(currentBib) || '';
      map.set(currentBib, existing ? `${existing} / ${currentText.trim()}` : currentText.trim());
    }
    return map;
  };

  const handleScratchpadChange = (text: string) => {
    setScratchpad(text);
    localStorage.setItem(`scratchpad_${campId}`, text);
    setScratchpadParsed(parseScratchpad(text));
    // Detect if user just typed # — show bib suggestions
    const lastChar = text[text.length - 1];
    const lastTwo = text.slice(-2);
    if (lastChar === '#') {
      setShowBibSuggestions(true);
      setBibSuggestionFilter('');
    } else if (showBibSuggestions) {
      // Keep open while typing digits after #
      const afterHash = text.split('#').pop() || '';
      const digits = afterHash.match(/^\d*$/);
      if (digits) {
        setBibSuggestionFilter(afterHash);
      } else {
        setShowBibSuggestions(false);
        setBibSuggestionFilter('');
      }
    }
  };

  const setScratchpadRating = (bib: number, key: keyof AssessmentForm, val: number) => {
    setScratchpadRatings(prev => {
      const next = new Map(prev);
      const existing = next.get(bib) || {};
      next.set(bib, { ...existing, [key]: val });
      return next;
    });
  };

  const insertBibSuggestion = (bib: number) => {
    // Replace the last # and any partial digits with the full #N
    const lastHashIdx = scratchpad.lastIndexOf('#');
    const newText = scratchpad.slice(0, lastHashIdx) + `#${bib} `;
    setScratchpad(newText);
    localStorage.setItem(`scratchpad_${campId}`, newText);
    setScratchpadParsed(parseScratchpad(newText));
    setShowBibSuggestions(false);
    setBibSuggestionFilter('');
  };

  const handleApplyScratchpad = async () => {
    if (!campId || !currentUser || !camp || !userProfile) return;
    if (scratchpadParsed.size === 0) {
      toast({ title: 'No bib mentions found', description: 'Use #N to mention a bib number e.g. #7 great batting', variant: 'destructive' });
      return;
    }
    setIsApplyingScratchpad(true);
    let applied = 0;
    for (const [bib, notes] of Array.from(scratchpadParsed.entries())) {
      const player = campPlayers.find(p => p.bibNumber === bib);
      if (!player) continue;
      const existing = myAssessments.get(bib);
      if (existing?.isLocked) continue; // Skip locked assessments silently
      if (existing) {
        // Append to existing notes
        const updatedNotes = existing.notes ? `${existing.notes}
${notes}` : notes;
        const bibRatings = scratchpadRatings.get(bib) || {};
        const ratingUpdates = Object.fromEntries(
          Object.entries(bibRatings).filter(([, v]) => typeof v === 'number' && (v as number) > 0)
        );
        await updateCampAssessmentAction(existing.id, currentUser.uid, { notes: updatedNotes, ...ratingUpdates });
      } else {
        // Create draft assessment with notes + any ratings entered in scratchpad
        const bibRatings = scratchpadRatings.get(bib) || {};
        await submitCampAssessmentAction({
          campId,
          organizationId: camp.organizationId,
          bibNumber: bib,
          assessedByUid: currentUser.uid,
          assessedByName: userProfile.displayName || userProfile.email || 'Coach',
          batting: bibRatings.batting || 0,
          bowling: bibRatings.bowling || 0,
          fielding: bibRatings.fielding || 0,
          fitness: bibRatings.fitness || 0,
          attitude: bibRatings.attitude || 0,
          overall: bibRatings.overall || 0,
          notes,
          isLocked: false,
        });
      }
      applied++;
    }
    // Refresh assessments
    const refreshed = await getMyCampAssessmentsAction(campId, currentUser.uid);
    if (refreshed.success) {
      const map = new Map<number, CampAssessment>();
      refreshed.assessments?.forEach(a => map.set(a.bibNumber, a));
      setMyAssessments(map);
    }
    setScratchpad('');
    setScratchpadParsed(new Map());
    setScratchpadRatings(new Map());
    localStorage.removeItem(`scratchpad_${campId}`);
    toast({ title: `Notes applied to ${applied} player${applied > 1 ? 's' : ''} ✓`, description: 'Switch to By Bib mode to add ratings.' });
    setIsApplyingScratchpad(false);
    setMode('bib');
  };

  const handleBibSubmit = () => {
    const bib = parseInt(bibInput);
    if (isNaN(bib) || bib < 1) {
      toast({ title: 'Invalid bib number', variant: 'destructive' });
      return;
    }
    // Find player by bib — but don't reveal name yet on this screen
    const player = campPlayers.find(p => p.bibNumber === bib);
    if (!player) {
      toast({ title: `Bib #${bib} not found in this camp`, variant: 'destructive' });
      return;
    }

    setCurrentBib(bib);
    setCurrentPlayer(player);

    // Load existing assessment if any
    const existing = myAssessments.get(bib);
    if (existing) {
      setForm({
        batting: existing.batting,
        bowling: existing.bowling,
        fielding: existing.fielding,
        fitness: existing.fitness,
        attitude: existing.attitude,
        overall: existing.overall,
        coachSuggestedSkill: existing.coachSuggestedSkill || '',
        coachSuggestedBowlingStyle: existing.coachSuggestedBowlingStyle || '',
        coachSuggestedBattingOrder: existing.coachSuggestedBattingOrder || '',
        notes: existing.notes || '',
      });
    } else {
      setForm(emptyForm());
    }
    setStep('assess');
  };

  const handleSave = async (lock = false) => {
    if (!currentBib || !currentUser || !userProfile || !camp) return;
    // Only enforce all ratings when locking — drafts can be partial
    if (lock && (form.batting === 0 || form.bowling === 0 || form.fielding === 0 ||
      form.fitness === 0 || form.attitude === 0 || form.overall === 0)) {
      toast({ title: 'Please rate all 6 dimensions before locking', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    const existing = myAssessments.get(currentBib);

    let res;
    if (existing) {
      res = await updateCampAssessmentAction(existing.id, currentUser.uid, {
        ...form,
        coachSuggestedSkill: form.coachSuggestedSkill || undefined,
        coachSuggestedBowlingStyle: form.coachSuggestedBowlingStyle || undefined,
        coachSuggestedBattingOrder: form.coachSuggestedBattingOrder || undefined,
      });
    } else {
      res = await submitCampAssessmentAction({
        campId,
        organizationId: camp.organizationId,
        bibNumber: currentBib,
        assessedByUid: currentUser.uid,
        assessedByName: userProfile.displayName || userProfile.email || 'Coach',
        ...form,
        coachSuggestedSkill: form.coachSuggestedSkill || undefined,
        coachSuggestedBowlingStyle: form.coachSuggestedBowlingStyle || undefined,
        coachSuggestedBattingOrder: form.coachSuggestedBattingOrder || undefined,
        notes: form.notes || undefined,
        isLocked: false,
      });
    }

    if (res.success) {
      // Refresh my assessments
      const refreshed = await getMyCampAssessmentsAction(campId, currentUser.uid);
      if (refreshed.success) {
        const map = new Map<number, CampAssessment>();
        refreshed.assessments?.forEach(a => map.set(a.bibNumber, a));
        setMyAssessments(map);

        if (lock) {
          const assessment = map.get(currentBib);
          if (assessment) {
            setIsLocking(true);
            await lockCampAssessmentAction(assessment.id, currentUser.uid);
            const final = await getMyCampAssessmentsAction(campId, currentUser.uid);
            if (final.success) {
              const finalMap = new Map<number, CampAssessment>();
              final.assessments?.forEach(a => finalMap.set(a.bibNumber, a));
              setMyAssessments(finalMap);
            }
            setIsLocking(false);
          }
        }
      }
      toast({ title: lock ? 'Assessment saved & locked ✓' : 'Assessment saved ✓' });
      setStep('bib');
      setBibInput('');
      setCurrentBib(null);
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsSaving(false);
  };

  const handleUnlock = async () => {
    if (!currentBib || !currentUser) return;
    const existing = myAssessments.get(currentBib);
    if (!existing) return;
    setIsLocking(true);
    const res = await unlockCampAssessmentAction(existing.id, currentUser.uid);
    if (res.success) {
      const refreshed = await getMyCampAssessmentsAction(campId, currentUser.uid);
      if (refreshed.success) {
        const map = new Map<number, CampAssessment>();
        refreshed.assessments?.forEach(a => map.set(a.bibNumber, a));
        setMyAssessments(map);
      }
      toast({ title: 'Assessment unlocked' });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsLocking(false);
  };

  const setF = (key: keyof AssessmentForm, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  if (isLoading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  if (!camp) return (
    <Alert variant="destructive" className="max-w-xl mx-auto mt-8">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle>Camp not found</AlertTitle>
      <AlertDescription>This camp does not exist or you don't have access.</AlertDescription>
    </Alert>
  );

  const existingAssessment = currentBib ? myAssessments.get(currentBib) : undefined;
  const isLocked = existingAssessment?.isLocked === true;
  const assessedCount = myAssessments.size;
  const totalPlayers = campPlayers.length;

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        {step === 'assess' ? (
          <Button variant="ghost" size="sm" onClick={() => { setStep('bib'); setBibInput(''); setCurrentBib(null); }}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{camp.name}</h1>
          <p className="text-xs text-muted-foreground">
            {assessedCount}/{totalPlayers} assessed
          </p>
        </div>
        <Trophy className="h-5 w-5 text-primary shrink-0" />
      </div>

      {/* My assessed bibs summary */}
      {step === 'bib' && assessedCount > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Your assessed bibs:</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(myAssessments.entries()).sort((a, b) => a[0] - b[0]).map(([bib, a]) => (
                <button key={bib} onClick={() => { setBibInput(bib.toString()); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-background hover:bg-muted transition-colors">
                  #{bib}
                  {a.isLocked
                    ? <Lock className="h-2.5 w-2.5 text-green-600" />
                    : <span className="h-2 w-2 rounded-full bg-amber-400" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mode toggle */}
      {step === 'bib' && (
        <div className="flex rounded-lg border overflow-hidden">
          <button onClick={() => setMode('bib')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${mode === 'bib' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
            <Users className="h-4 w-4" /> By Bib
          </button>
          <button onClick={() => setMode('scratchpad')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-l ${mode === 'scratchpad' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
            <ClipboardList className="h-4 w-4" /> Scratchpad
          </button>
        </div>
      )}

      {/* SCRATCHPAD MODE */}
      {step === 'bib' && mode === 'scratchpad' && (
        <div className="space-y-3">
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Use <span className="font-mono font-bold text-primary">#N</span> to tag a bib number. e.g. <span className="italic">#7 great footwork, #12 needs to call louder</span></p>
              <div className="relative">
                <Textarea
                  placeholder="#2 excellent running between wickets&#10;#7 nervous but settled well after first over&#10;#12 good footwork, needs to work on calling"
                  value={scratchpad}
                  onChange={e => handleScratchpadChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setShowBibSuggestions(false); }
                  }}
                  rows={8}
                  className="font-mono text-sm resize-none"
                  autoFocus
                />
                {showBibSuggestions && campPlayers.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    <div className="px-3 py-1.5 text-xs text-muted-foreground border-b bg-muted/50">
                      Select a bib number
                    </div>
                    {campPlayers
                      .filter(p => bibSuggestionFilter === '' || p.bibNumber.toString().startsWith(bibSuggestionFilter))
                      .sort((a, b) => a.bibNumber - b.bibNumber)
                      .map(p => {
                        const hasAssessment = myAssessments.has(p.bibNumber);
                        return (
                          <button
                            key={p.bibNumber}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); insertBibSuggestion(p.bibNumber); }}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-left">
                            <span className="font-bold text-primary w-8">#{p.bibNumber}</span>
                            <span className="text-xs text-muted-foreground">{p.playerPrimarySkill}</span>
                            {hasAssessment && (
                              <span className="ml-auto text-xs text-amber-600 flex items-center gap-1">
                                <Star className="h-3 w-3" /> assessed
                              </span>
                            )}
                          </button>
                        );
                      })}
                    {campPlayers.filter(p => bibSuggestionFilter === '' || p.bibNumber.toString().startsWith(bibSuggestionFilter)).length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No bib #{bibSuggestionFilter} found</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {scratchpadParsed.size > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-medium text-primary">Detected {scratchpadParsed.size} bib{scratchpadParsed.size > 1 ? 's' : ''}:</p>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {Array.from(scratchpadParsed.entries()).sort((a, b) => a[0] - b[0]).map(([bib, note]) => {
                    const player = campPlayers.find(p => p.bibNumber === bib);
                    const existingAssessment = myAssessments.get(bib);
                    const hasExisting = !!existingAssessment;
                    const isAssessmentLocked = existingAssessment?.isLocked === true;
                    const bibRatings = scratchpadRatings.get(bib) || {};
                    const ratingKeys: {key: keyof AssessmentForm; label: string}[] = [
                      { key: 'batting', label: 'Batting' },
                      { key: 'bowling', label: 'Bowling' },
                      { key: 'fielding', label: 'Fielding' },
                      { key: 'fitness', label: 'Fitness' },
                      { key: 'attitude', label: 'Attitude' },
                      { key: 'overall', label: 'Overall' },
                    ];
                    return (
                      <div key={bib} className={`border rounded-lg p-3 space-y-2 ${isAssessmentLocked ? 'opacity-60 bg-muted/30' : 'bg-background'}`}>
                        {/* Bib header */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-primary text-sm">#{bib}</span>
                          {player
                            ? <span className="text-xs text-muted-foreground">({player.playerPrimarySkill})</span>
                            : <span className="text-xs text-destructive">(not in camp — will skip)</span>}
                          {isAssessmentLocked
                            ? <span className="text-xs text-destructive font-medium">🔒 Locked — unlock first</span>
                            : hasExisting
                              ? <span className="text-xs text-amber-600">· will append</span>
                              : <span className="text-xs text-green-600">· new assessment</span>}
                        </div>
                        {/* Note */}
                        {!isAssessmentLocked && (
                          <p className="text-xs text-muted-foreground italic">"{note}"</p>
                        )}
                        {/* Inline star ratings — collapsed by default, tap to expand */}
                        {!isAssessmentLocked && (() => {
                          const hasAnyRating = ratingKeys.some(({ key }) => (bibRatings[key] as number) > 0);
                          const ratedCount = ratingKeys.filter(({ key }) => (bibRatings[key] as number) > 0).length;
                          return (
                            <details open={hasAnyRating} className="group">
                              <summary className="text-xs text-primary cursor-pointer list-none flex items-center gap-1 select-none">
                                <span className="group-open:hidden">
                                  {hasAnyRating ? `★ ${ratedCount}/6 rated — tap to edit` : '+ Add ratings (optional)'}
                                </span>
                                <span className="hidden group-open:inline">− Hide ratings</span>
                              </summary>
                              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                                {ratingKeys.map(({ key, label }) => (
                                  <div key={key} className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground w-14 shrink-0">{label}</span>
                                    <div className="flex gap-0.5">
                                      {[1,2,3,4,5].map(n => (
                                        <button key={n} type="button"
                                          onClick={() => setScratchpadRating(bib, key, n)}
                                          className="transition-transform active:scale-95">
                                          <Star className={`h-6 w-6 ${n <= ((bibRatings[key] as number) || 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                                        </button>
                                      ))}
                                    </div>
                                    {(bibRatings[key] as number) > 0 && (
                                      <span className="text-xs text-muted-foreground">{bibRatings[key]}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </details>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
                <Button className="w-full" onClick={handleApplyScratchpad} disabled={isApplyingScratchpad}>
                  {isApplyingScratchpad ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Apply to Assessments
                </Button>
              </CardContent>
            </Card>
          )}

          {scratchpad.length > 0 && scratchpadParsed.size === 0 && (
            <p className="text-xs text-muted-foreground text-center">No bib mentions yet. Type <span className="font-mono font-bold">#</span> followed by a number.</p>
          )}
        </div>
      )}

      {/* BIB ENTRY STEP — searchable list + manual bib entry */}
      {step === 'bib' && mode === 'bib' && (
        <div className="space-y-3">
          {/* Search / manual bib input */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={canSeeNames ? "Search by name or type bib #..." : "Type bib # to find player..."}
                  value={bibInput}
                  onChange={e => setBibInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      // If input is a number treat as bib
                      const asNum = parseInt(bibInput);
                      if (!isNaN(asNum)) handleBibSubmit();
                    }
                  }}
                  autoFocus
                />
              </div>
            </CardContent>
          </Card>

          {/* Player list */}
          <Card>
            <CardContent className="p-0">
              {campPlayers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No players in this camp yet.</p>
              ) : (
                <div className="divide-y max-h-[60vh] overflow-y-auto">
                  {campPlayers
                    .filter(p => {
                      if (!bibInput) return true;
                      const asNum = parseInt(bibInput);
                      if (!isNaN(asNum)) return p.bibNumber === asNum;
                      // Selectors are bib-blind — name search disabled
                      if (!canSeeNames) return false;
                      return p.playerName.toLowerCase().includes(bibInput.toLowerCase());
                    })
                    .sort((a, b) => a.bibNumber - b.bibNumber)
                    .map(p => {
                      const existing = myAssessments.get(p.bibNumber);
                      const isAssessed = !!existing;
                      const isLocked = existing?.isLocked === true;
                      return (
                        <button
                          key={p.id}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                          onClick={() => {
                            setBibInput(p.bibNumber.toString());
                            setCurrentBib(p.bibNumber);
                            setCurrentPlayer(p);
                            if (existing) {
                              setForm({
                                batting: existing.batting,
                                bowling: existing.bowling,
                                fielding: existing.fielding,
                                fitness: existing.fitness,
                                attitude: existing.attitude,
                                overall: existing.overall,
                                coachSuggestedSkill: existing.coachSuggestedSkill || '',
                                coachSuggestedBowlingStyle: existing.coachSuggestedBowlingStyle || '',
                                coachSuggestedBattingOrder: existing.coachSuggestedBattingOrder || '',
                                notes: existing.notes || '',
                              });
                            } else {
                              setForm(emptyForm());
                            }
                            setStep('assess');
                          }}
                        >
                          {/* Bib number */}
                          <span className="text-lg font-bold text-primary w-10 shrink-0">#{p.bibNumber}</span>

                          {/* Player info — skill only for selectors, name shown for admins */}
                          <div className="flex-1 min-w-0">
                            {canSeeNames && <p className="text-sm font-medium truncate">{p.playerName}</p>}
                            <p className="text-xs text-muted-foreground">{p.playerPrimarySkill}
                              {p.playerBowlingStyle ? ` · ${p.playerBowlingStyle}` : ''}
                              {p.playerBattingOrder ? ` · ${p.playerBattingOrder}` : ''}
                            </p>
                          </div>

                          {/* Assessment status */}
                          <div className="shrink-0">
                            {isLocked ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                                <Lock className="h-3 w-3" /> Locked
                              </span>
                            ) : isAssessed ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                Draft
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not assessed</span>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ASSESSMENT STEP */}
      {step === 'assess' && currentBib && currentPlayer && (
        <div className="space-y-4">
          {/* Bib header — truly blind (no name shown) */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-primary">Bib #{currentBib}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Player skill: <span className="font-medium text-foreground">{currentPlayer.playerPrimarySkill}</span>
                  {currentPlayer.playerBattingOrder && ` · ${currentPlayer.playerBattingOrder}`}
                  {currentPlayer.playerBowlingStyle && ` · ${currentPlayer.playerBowlingStyle}`}
                </p>
              </div>
              {existingAssessment && (
                <div className="text-right">
                  {isLocked
                    ? <Badge className="bg-green-100 text-green-700 border-green-200"><Lock className="h-3 w-3 mr-1" />Locked</Badge>
                    : <Badge variant="outline" className="border-amber-300 text-amber-600">Draft</Badge>}
                </div>
              )}
            </CardContent>
          </Card>

          {isLocked && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertTitle>Assessment Locked</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>This assessment is locked.</span>
                <Button variant="outline" size="sm" onClick={handleUnlock} disabled={isLocking}>
                  {isLocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5 mr-1" />}
                  Unlock
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Coach Skill Override */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Your Skill Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Suggested Primary Skill</label>
                <Select disabled={isLocked} value={form.coachSuggestedSkill || 'keep'}
                  onValueChange={v => setF('coachSuggestedSkill', v === 'keep' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Keep as ${currentPlayer.playerPrimarySkill}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep player's own: {currentPlayer.playerPrimarySkill}</SelectItem>
                    {EFFECTIVE_SKILLS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Batting Order</label>
                  <Select disabled={isLocked} value={form.coachSuggestedBattingOrder || 'none_batting'}
                    onValueChange={v => setF('coachSuggestedBattingOrder', v === 'none_batting' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none_batting">Not set</SelectItem>
                      {BATTING_ORDERS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Bowling Style</label>
                  <Select disabled={isLocked} value={form.coachSuggestedBowlingStyle || 'none_bowling'}
                    onValueChange={v => setF('coachSuggestedBowlingStyle', v === 'none_bowling' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none_bowling">Not set</SelectItem>
                      {BOWLING_STYLES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ratings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Ratings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {([
                ['batting', 'Batting'],
                ['bowling', 'Bowling'],
                ['fielding', 'Fielding'],
                ['fitness', 'Fitness'],
                ['attitude', 'Attitude / Coachability'],
                ['overall', 'Overall Impression'],
              ] as [keyof AssessmentForm, string][]).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <label className="text-sm font-medium">{label}</label>
                  <StarRating value={form[key] as number}
                    onChange={v => setF(key, v)} disabled={isLocked} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardContent className="p-4 space-y-1">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                disabled={isLocked}
                placeholder="Any specific observations about this player..."
                value={form.notes}
                onChange={e => setF('notes', e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          {!isLocked && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Draft
              </Button>
              <Button onClick={() => handleSave(true)} disabled={isSaving || isLocking}>
                {isSaving || isLocking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Save & Lock
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
