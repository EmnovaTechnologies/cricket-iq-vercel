'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft, ImageIcon, Info, Table, X, Sparkles, ExternalLink, HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseAllScorecardImagesAction, type ImageInput } from '@/lib/actions/parse-scorecard-action';
import { saveScorecardAction, checkDuplicateScorecardAction } from '@/lib/actions/scorecard-actions';
import { parseCricClubsUrl } from '@/lib/utils/cricclubs-utils';
import { getAllSeriesFromDB } from '@/lib/db';
import type { ScorecardInnings, Series } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Step = 'details' | 'uploads' | 'review';

interface ImageSlot {
  key: string;
  label: string;
  preview: string | null;
  base64: string | null;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export function ScorecardImportForm() {
  const { currentUser, activeOrganizationId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('details');
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  // Pre-fill from game details page URL params — ensure date is YYYY-MM-DD
  const rawDate = searchParams.get('date') || '';
  const [url, setUrl] = useState(searchParams.get('url') || '');
  const [team1, setTeam1] = useState(searchParams.get('team1') || '');
  const [team2, setTeam2] = useState(searchParams.get('team2') || '');
  const [date, setDate] = useState(rawDate ? rawDate.slice(0, 10) : '');
  const [venue, setVenue] = useState(searchParams.get('venue') || '');
  const [result, setResult] = useState('');
  const [linkedGameId] = useState(searchParams.get('gameId') || '');
  const [seriesId, setSeriesId] = useState(searchParams.get('seriesId') || '');
  const [seriesName, setSeriesName] = useState(searchParams.get('seriesName') || '');
  const [availableSeries, setAvailableSeries] = useState<Series[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const prefilledSeriesId = searchParams.get('seriesId') || '';
  const [selectedYear, setSelectedYear] = useState('');

  // Load series for org
  useEffect(() => {
    if (!activeOrganizationId) return;
    getAllSeriesFromDB('active', activeOrganizationId).then(series => {
      setAvailableSeries(series);
      const years = [...new Set(series.map(s => s.year.toString()))].sort((a, b) => +b - +a);
      setAvailableYears(years);

      if (prefilledSeriesId) {
        // Pre-select the year matching the pre-filled series
        const matchedSeries = series.find(s => s.id === prefilledSeriesId);
        if (matchedSeries) {
          setSelectedYear(matchedSeries.year.toString());
        } else if (years.length > 0) {
          setSelectedYear(years[0]);
        }
      } else if (years.length > 0) {
        setSelectedYear(years[0]);
      }
    });
  }, [activeOrganizationId, prefilledSeriesId]);

  const [parsedInnings, setParsedInnings] = useState<ScorecardInnings[]>([]);

  const [slots, setSlots] = useState<ImageSlot[]>([
    { key: 'inn1', label: 'Innings 1', preview: null, base64: null, mediaType: 'image/png' },
    { key: 'inn2', label: 'Innings 2', preview: null, base64: null, mediaType: 'image/png' },
  ]);

  const addExtraSlot = () => {
    const id = `extra${Date.now()}`;
    setSlots(prev => [...prev, { key: id, label: `Extra screenshot ${prev.length - 1}`, preview: null, base64: null, mediaType: 'image/png' }]);
  };

  const removeSlot = (key: string) => {
    setSlots(prev => prev.filter(s => s.key !== key));
    setParsedInnings([]);
  };

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateSlot = (key: string, updates: Partial<ImageSlot>) =>
    setSlots(prev => prev.map(s => s.key === key ? { ...s, ...updates } : s));

  const handleUpload = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mediaType = (file.type || 'image/png') as ImageSlot['mediaType'];
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      updateSlot(key, { preview: dataUrl, base64: dataUrl.split(',')[1], mediaType });
      setParsedInnings([]); // reset if images change
    };
    reader.readAsDataURL(file);
  };

  const uploadedSlots = slots.filter(s => s.base64);
  const hasExtracted = parsedInnings.length > 0;

  const handleExtractAll = async () => {
    if (!uploadedSlots.length) return;
    setIsExtracting(true);
    try {
      const images: ImageInput[] = uploadedSlots.map(s => ({
        base64: s.base64!,
        mediaType: s.mediaType,
        label: s.label,
      }));

      const res = await parseAllScorecardImagesAction(images, team1, team2);
      if (res.success && res.innings?.length) {
        setParsedInnings(res.innings);
        toast({
          title: 'Scorecard extracted',
          description: `${res.innings.length} innings from ${images.length} image(s). Full names resolved across all screenshots.`,
        });
      } else {
        toast({ title: 'Extraction failed', description: res.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser || !activeOrganizationId || !parsedInnings.length) return;
    setIsSaving(true);
    try {
      const parsed = parseCricClubsUrl(url);

      // Duplicate detection
      const dupCheck = await checkDuplicateScorecardAction({
        organizationId: activeOrganizationId,
        team1: team1.trim(),
        team2: team2.trim(),
        date,
        seriesId: seriesId || undefined,
        linkedGameId: linkedGameId || undefined,
      });
      if (dupCheck.isDuplicate) {
        if (dupCheck.existingScorecardId) {
          toast({
            title: 'Scorecard Already Exists',
            description: dupCheck.message + ' Redirecting to existing scorecard.',
          });
          router.push(`/scorecards/${dupCheck.existingScorecardId}`);
        } else {
          toast({
            title: 'Duplicate Scorecard',
            description: dupCheck.message,
            variant: 'destructive',
          });
        }
        setIsSaving(false);
        return;
      }

      const res = await saveScorecardAction({
        organizationId: activeOrganizationId,
        importedBy: currentUser.uid,
        cricClubsUrl: url || undefined,
        cricClubsMatchId: parsed.matchId,
        cricClubsClubId: parsed.clubId,
        cricClubsLeague: parsed.league,
        team1: team1.trim(),
        team2: team2.trim(),
        date,
        venue: venue.trim() || undefined,
        result: result.trim() || undefined,
        seriesId: seriesId || undefined,
        seriesName: seriesName || undefined,
        linkedGameId: linkedGameId || undefined,
        innings: parsedInnings,
      }, currentUser.uid);

      if (res.success) {
        toast({ title: 'Scorecard Saved', description: 'Scorecard imported successfully.' });
        router.push('/scorecards');
      } else {
        toast({ title: 'Save Failed', description: res.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const stepKeys: Step[] = ['details', 'uploads', 'review'];
  const stepLabels: Record<Step, string> = { details: 'Match Details', uploads: 'Upload Screenshots', review: 'Review & Save' };
  const currentIdx = stepKeys.indexOf(step);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Progress */}
      <div className="flex gap-1">
        {stepKeys.map((s, i) => (
          <div key={s} className={cn("h-1.5 rounded-full flex-1 transition-colors",
            i < currentIdx ? "bg-primary" : i === currentIdx ? "bg-primary/50" : "bg-muted")} />
        ))}
      </div>
      <p className="text-sm text-center text-muted-foreground">
        Step {currentIdx + 1} of {stepKeys.length}: <span className="font-medium text-foreground">{stepLabels[step]}</span>
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Table className="h-5 w-5" /> Import CricClubs Scorecard
          </CardTitle>
          <CardDescription>Upload screenshots — Claude reads all images together for accurate name resolution.</CardDescription>
        </CardHeader>
        <CardContent>

          {/* ── Step: Details ─────────────────────────────────────────── */}
          {step === 'details' && (
            <div className="space-y-5">
              {linkedGameId && (
                <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  <Table className="h-3.5 w-3.5 shrink-0" />
                  Pre-filled from game details. URL, teams and date are locked.
                </div>
              )}
              <div className="space-y-2">
                <Label>CricClubs URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                {linkedGameId && url ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 border rounded-md px-3 py-2 break-all">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-primary">{url}</span>
                  </div>
                ) : (
                  <>
                    <Input placeholder="https://cricclubs.com/SCCAY/viewScorecard.do?matchId=99&clubId=5273" value={url} onChange={e => setUrl(e.target.value)} />
                    {parseCricClubsUrl(url).valid && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> League: {parseCricClubsUrl(url).league} · Match: {parseCricClubsUrl(url).matchId}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Team 1 <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. SCCAY" value={team1} onChange={e => setTeam1(e.target.value)} readOnly={!!linkedGameId} className={linkedGameId ? 'bg-muted/40 text-muted-foreground' : ''} />
                </div>
                <div className="space-y-2">
                  <Label>Team 2 <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. WYCA" value={team2} onChange={e => setTeam2(e.target.value)} readOnly={!!linkedGameId} className={linkedGameId ? 'bg-muted/40 text-muted-foreground' : ''} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Match Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} readOnly={!!linkedGameId} className={linkedGameId ? 'bg-muted/40 text-muted-foreground' : ''} />
                </div>
                <div className="space-y-2">
                  <Label>Venue</Label>
                  <Input placeholder="e.g. Woodley Park" value={venue} onChange={e => setVenue(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Result</Label>
                <Input placeholder="e.g. WYCA won by 4 wickets" value={result} onChange={e => setResult(e.target.value)} />
              </div>

              {/* Series picker — locked if coming from game */}
              {availableSeries.length > 0 && (
                <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
                  <p className="text-sm font-medium">
                    Link to Series
                    {!linkedGameId && <span className="text-destructive text-xs ml-1">*</span>}
                  </p>
                  {linkedGameId ? (
                    <div className="flex items-center gap-2">
                      {seriesName
                        ? <p className="text-xs text-green-600">✓ Linked to series: <span className="font-medium">{seriesName}</span></p>
                        : <p className="text-xs text-muted-foreground">No series linked to this game.</p>
                      }
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Year</Label>
                        <Select value={selectedYear} onValueChange={v => {
                          setSelectedYear(v);
                          const currentSeries = availableSeries.find(s => s.id === seriesId);
                          if (currentSeries && currentSeries.year.toString() !== v) {
                            setSeriesId(''); setSeriesName('');
                          }
                        }}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Year" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Series</Label>
                        <Select value={seriesId || 'none'} onValueChange={v => {
                          const val = v === 'none' ? '' : v;
                          setSeriesId(val);
                          setSeriesName(availableSeries.find(s => s.id === val)?.name || '');
                        }}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select series" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {availableSeries.filter(s => !selectedYear || s.year.toString() === selectedYear).map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {!linkedGameId && seriesName && <p className="text-xs text-green-600">✓ Will be linked to: {seriesName}</p>}
                </div>
              )}
              <Button onClick={() => setStep('uploads')} disabled={!team1.trim() || !team2.trim() || !date || (!linkedGameId && !seriesId)} className="w-full">
                Next: Upload Screenshots <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {!linkedGameId && !seriesId && (
                <p className="text-xs text-center text-muted-foreground">Select a series to continue.</p>
              )}
            </div>
          )}

          {/* ── Step: Uploads ─────────────────────────────────────────── */}
          {step === 'uploads' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <Alert className="border-blue-200 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-700">How to capture screenshots</AlertTitle>
                  <AlertDescription className="text-blue-600 text-sm">
                    On CricClubs, click <strong>Full Scorecard</strong> tab. Upload one screenshot per innings —
                    each should show the full batting table, bowling table, extras and fall of wickets.
                    If you need multiple shots per innings, use <strong>Add another screenshot</strong>.
                    Claude reads all images together for the best accuracy.
                  </AlertDescription>
                </Alert>

                {/* Sample image popovers */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Not sure what to screenshot?</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1 text-primary hover:underline text-xs">
                        <HelpCircle className="h-3.5 w-3.5" /> Batting sample
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-72 p-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Sample batting screenshot</p>
                      <img src="/images/sample-batting.png" alt="Sample batting scorecard"
                        className="w-full rounded border object-contain"
                        onError={e => { (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-xs text-muted-foreground p-2">Add public/images/sample-batting.png</p>'; }} />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1 text-primary hover:underline text-xs">
                        <HelpCircle className="h-3.5 w-3.5" /> Bowling sample
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" className="w-72 p-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">Sample bowling screenshot</p>
                      <img src="/images/sample-bowling.png" alt="Sample bowling scorecard"
                        className="w-full rounded border object-contain"
                        onError={e => { (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-xs text-muted-foreground p-2">Add public/images/sample-bowling.png</p>'; }} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Upload slots */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {slots.map((slot, idx) => (
                    <div key={slot.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">{slot.label}</Label>
                        {/* Allow removing extra slots (not the first 2) */}
                        {idx >= 2 && (
                          <button onClick={() => removeSlot(slot.key)} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5">
                            <X className="h-3 w-3" /> Remove
                          </button>
                        )}
                      </div>
                      <div
                        onClick={() => fileRefs.current[slot.key]?.click()}
                        className={cn(
                          "border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors min-h-[100px] flex flex-col items-center justify-center gap-1.5",
                          slot.preview ? "border-primary/40 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/40"
                        )}
                      >
                        {slot.preview ? (
                          <img src={slot.preview} alt="Preview" className="max-h-20 rounded object-contain" />
                        ) : (
                          <>
                            <ImageIcon className="h-7 w-7 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Click to upload</p>
                          </>
                        )}
                      </div>
                      <input
                        ref={el => { fileRefs.current[slot.key] = el; }}
                        type="file" accept="image/png,image/jpeg,image/webp"
                        onChange={e => handleUpload(slot.key, e)} className="hidden"
                      />
                      {slot.base64 && (
                        <Button size="sm" variant="ghost" className="w-full text-xs text-muted-foreground"
                          onClick={() => { updateSlot(slot.key, { preview: null, base64: null }); setParsedInnings([]); }}>
                          <X className="mr-1 h-3 w-3" /> Clear
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add more screenshots */}
                <Button variant="outline" size="sm" onClick={addExtraSlot} className="w-full text-muted-foreground border-dashed">
                  <ImageIcon className="mr-2 h-3.5 w-3.5" /> Add another screenshot
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Upload 1–{slots.length} screenshots. Claude reads all images together to extract the full scorecard.
                </p>
              </div>

              {/* Extract All button — single call */}
              {uploadedSlots.length > 0 && (
                <div className="space-y-2">
                  <Button
                    onClick={handleExtractAll}
                    disabled={isExtracting}
                    className="w-full"
                    size="lg"
                  >
                    {isExtracting
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analysing {uploadedSlots.length} image(s) with Claude...</>
                      : <><Sparkles className="mr-2 h-4 w-4" /> Extract Scorecard from {uploadedSlots.length} Image(s)</>
                    }
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                    All images are sent to Claude together — full player names are resolved across all screenshots
                  </p>
                </div>
              )}

              {hasExtracted && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-700">Extraction complete</AlertTitle>
                  <AlertDescription className="text-green-600 text-sm">
                    {parsedInnings.length} innings extracted. Click Review to check before saving.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('details')}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button onClick={() => setStep('review')} disabled={!hasExtracted} className="flex-1">
                  Review & Save <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Review ──────────────────────────────────────────── */}
          {step === 'review' && (
            <div className="space-y-5">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700">Ready to save</AlertTitle>
                <AlertDescription className="text-green-600 text-sm">Review the extracted data below.</AlertDescription>
              </Alert>

              <div className="text-sm border rounded-lg divide-y">
                <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Match</span><span className="font-medium">{team1} vs {team2}</span></div>
                <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Date</span><span>{date}</span></div>
                {venue && <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Venue</span><span>{venue}</span></div>}
                {result && <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Result</span><span>{result}</span></div>}
              </div>

              {parsedInnings.map((inn, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Innings {inn.inningsNumber} — {inn.battingTeam}</h4>
                    <Badge variant="outline">{inn.totalRuns}/{inn.wickets} ({inn.overs} ov)</Badge>
                  </div>
                  {inn.batting?.length ? <p className="text-xs text-green-600">✓ {inn.batting.length} batters</p> : <p className="text-xs text-amber-600">⚠ No batting data</p>}
                  {inn.bowling?.length ? <p className="text-xs text-green-600">✓ {inn.bowling.length} bowlers</p> : <p className="text-xs text-amber-600">⚠ No bowling data</p>}
                  {inn.fallOfWickets?.length ? <p className="text-xs text-green-600">✓ {inn.fallOfWickets.length} fall of wickets</p> : null}
                  {inn.didNotBat?.length ? <p className="text-xs text-green-600">✓ Did not bat: {inn.didNotBat.join(', ')}</p> : null}

                  {/* Sample dismissals to verify name expansion */}
                  {inn.batting?.slice(0, 3).some(b => b.dismissal && b.dismissal !== 'not out') && (
                    <div className="mt-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground font-medium mb-1">Sample dismissals (verify names are expanded):</p>
                      {inn.batting.filter(b => b.dismissal && b.dismissal !== 'not out').slice(0, 3).map((b, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{b.name}: {b.dismissal}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('uploads')}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  {isSaving ? 'Saving...' : 'Save Scorecard'}
                </Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
