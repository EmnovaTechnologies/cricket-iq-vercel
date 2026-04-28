'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
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
  ChevronLeft, ChevronRight, ShieldAlert, Trophy, Check, Search
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
  const { currentUser, userProfile } = useAuth();
  const { toast } = useToast();

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
    if (form.batting === 0 || form.bowling === 0 || form.fielding === 0 ||
      form.fitness === 0 || form.attitude === 0 || form.overall === 0) {
      toast({ title: 'Please rate all 6 dimensions before saving', variant: 'destructive' });
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
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
    <div className="max-w-lg mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        {step === 'assess' ? (
          <Button variant="ghost" size="sm" onClick={() => { setStep('bib'); setBibInput(''); setCurrentBib(null); }}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series/${seriesId}/camp/${campId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Link>
          </Button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-headline font-bold text-primary truncate">{camp.name}</h1>
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

      {/* BIB ENTRY STEP — searchable list + manual bib entry */}
      {step === 'bib' && (
        <div className="space-y-3">
          {/* Search / manual bib input */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by name or type bib #..."
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

                          {/* Player info — skill only, no name in assessment mode */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.playerName}</p>
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
