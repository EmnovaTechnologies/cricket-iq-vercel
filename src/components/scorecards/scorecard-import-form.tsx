'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, CheckCircle, ArrowRight, ArrowLeft, ImageIcon, Info,
  Table, X, Sparkles, ExternalLink, HelpCircle, FileSpreadsheet,
  AlertTriangle, PlusCircle, Search,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseAllScorecardImagesAction, type ImageInput } from '@/lib/actions/parse-scorecard-action';
import { saveScorecardAction, checkDuplicateScorecardAction } from '@/lib/actions/scorecard-actions';
import { parseCricClubsUrl } from '@/lib/utils/cricclubs-utils';
import { parseCricClubsCsv, xlsxToCsv, type ParsedCricClubsScorecard } from '@/lib/utils/cricclubs-xls-parser';
import { getAllSeriesFromDB, getAllTeamsFromDB } from '@/lib/db';
import type { ScorecardInnings, Series, Team } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Step = 'choose' | 'upload' | 'details' | 'review';
type ImportMode = 'screenshot' | 'excel';

interface ImageSlot {
  key: string;
  label: string;
  preview: string | null;
  base64: string | null;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
}

// ─── Fuzzy match helper ───────────────────────────────────────────────────────

function fuzzyMatch(needle: string, haystack: string): number {
  const n = needle.toLowerCase().trim();
  const h = haystack.toLowerCase().trim();
  if (n === h) return 1;
  if (h.includes(n) || n.includes(h)) return 0.8;
  // Check word overlap
  const nWords = n.split(/\s+/);
  const hWords = h.split(/\s+/);
  const shared = nWords.filter(w => hWords.includes(w)).length;
  return shared / Math.max(nWords.length, hWords.length);
}

function bestMatch<T extends { name: string }>(query: string, items: T[]): T | null {
  if (!query || !items.length) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const item of items) {
    const score = fuzzyMatch(query, item.name);
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore >= 0.6 ? best : null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ScorecardImportForm() {
  const { currentUser, activeOrganizationId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('choose');
  const [importMode, setImportMode] = useState<ImportMode>('screenshot');
  const [isSaving, setIsSaving] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCheckingDup, setIsCheckingDup] = useState(false);
  const [dupWarning, setDupWarning] = useState<{ message: string; existingId?: string } | null>(null);

  // Pre-fill from URL params
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
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const prefilledSeriesId = searchParams.get('seriesId') || '';
  const [selectedYear, setSelectedYear] = useState('');

  // ── Excel import state ────────────────────────────────────────────────────
  const [xlsFile, setXlsFile] = useState<File | null>(null);
  const [isParsingXls, setIsParsingXls] = useState(false);
  const [xlsParsed, setXlsParsed] = useState<ParsedCricClubsScorecard | null>(null);

  // Option C: matched/unmatched state
  const [matchedSeries, setMatchedSeries] = useState<Series | null>(null);
  const [unmatchedSeries, setUnmatchedSeries] = useState<string>(''); // raw name from file
  const [createNewSeries, setCreateNewSeries] = useState(false);

  const [matchedTeam1, setMatchedTeam1] = useState<Team | null>(null);
  const [matchedTeam2, setMatchedTeam2] = useState<Team | null>(null);
  const [unmatchedTeam1, setUnmatchedTeam1] = useState<string>('');
  const [unmatchedTeam2, setUnmatchedTeam2] = useState<string>('');
  const [createNewTeam1, setCreateNewTeam1] = useState(false);
  const [createNewTeam2, setCreateNewTeam2] = useState(false);

  const [parsedInnings, setParsedInnings] = useState<ScorecardInnings[]>([]);
  const xlsFileRef = useRef<HTMLInputElement | null>(null);

  // ── Load series and teams ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeOrganizationId) return;
    Promise.all([
      getAllSeriesFromDB('active', activeOrganizationId),
      getAllTeamsFromDB(activeOrganizationId),
    ]).then(([series, teams]) => {
      setAvailableSeries(series);
      setAvailableTeams(teams);
      const years = [...new Set(series.map(s => s.year.toString()))].sort((a, b) => +b - +a);
      setAvailableYears(years);
      if (prefilledSeriesId) {
        const matchedSeries = series.find(s => s.id === prefilledSeriesId);
        if (matchedSeries) setSelectedYear(matchedSeries.year.toString());
        else if (years.length > 0) setSelectedYear(years[0]);
      } else if (years.length > 0) {
        setSelectedYear(years[0]);
      }
    });
  }, [activeOrganizationId, prefilledSeriesId]);

  // ── Screenshot slots ──────────────────────────────────────────────────────
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
      setParsedInnings([]);
    };
    reader.readAsDataURL(file);
  };

  // ── XLS file handler ──────────────────────────────────────────────────────
  const handleXlsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlsFile(file);
    setXlsParsed(null);
    setParsedInnings([]);
    setIsParsingXls(true);

    try {
      let csvText: string;
      if (file.name.endsWith('.csv')) {
        csvText = await file.text();
      } else {
        // XLSX/XLS — convert via SheetJS
        csvText = await xlsxToCsv(file);
      }

      const parsed = parseCricClubsCsv(csvText);
      setXlsParsed(parsed);
      setParsedInnings(parsed.innings);

      // Auto-fill form fields from parsed data
      if (!team1 && parsed.team1) setTeam1(parsed.team1);
      if (!team2 && parsed.team2) setTeam2(parsed.team2);
      if (!date && parsed.date) setDate(parsed.date);
      if (!result && parsed.result) setResult(parsed.result);

      // Option C: fuzzy match series and teams
      if (parsed.seriesNameRaw) {
        const matched = bestMatch(parsed.seriesNameRaw, availableSeries);
        if (matched) {
          setMatchedSeries(matched);
          setSeriesId(matched.id);
          setSeriesName(matched.name);
          setUnmatchedSeries('');
          setCreateNewSeries(false);
        } else {
          setMatchedSeries(null);
          setUnmatchedSeries(parsed.seriesNameRaw);
          setSeriesId('');
          setSeriesName('');
          setCreateNewSeries(false);
        }
      }

      if (parsed.team1) {
        const m = bestMatch(parsed.team1, availableTeams);
        setMatchedTeam1(m);
        setUnmatchedTeam1(m ? '' : parsed.team1);
        setCreateNewTeam1(false);
      }
      if (parsed.team2) {
        const m = bestMatch(parsed.team2, availableTeams);
        setMatchedTeam2(m);
        setUnmatchedTeam2(m ? '' : parsed.team2);
        setCreateNewTeam2(false);
      }

      if (parsed.parseWarnings.length > 0) {
        toast({ title: 'Parsed with warnings', description: parsed.parseWarnings.slice(0, 3).join('; '), variant: 'default' });
      } else {
        toast({ title: 'File parsed', description: `${parsed.innings.length} innings found for ${parsed.team1} vs ${parsed.team2}` });
      }
    } catch (err: any) {
      toast({ title: 'Parse failed', description: err.message || 'Could not read the file.', variant: 'destructive' });
      setXlsFile(null);
    } finally {
      setIsParsingXls(false);
    }
  };

  // ── Screenshot extraction ─────────────────────────────────────────────────
  const uploadedSlots = slots.filter(s => s.base64);
  const hasExtracted = parsedInnings.length > 0;

  const handleExtractAll = async () => {
    if (!uploadedSlots.length) return;
    setIsExtracting(true);
    try {
      const images: ImageInput[] = uploadedSlots.map(s => ({
        base64: s.base64!, mediaType: s.mediaType, label: s.label,
      }));
      const res = await parseAllScorecardImagesAction(images, team1, team2);
      if (res.success && res.innings?.length) {
        setParsedInnings(res.innings);
        toast({ title: 'Scorecard extracted', description: `${res.innings.length} innings from ${images.length} image(s).` });
      } else {
        toast({ title: 'Extraction failed', description: res.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsExtracting(false);
    }
  };

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!currentUser || !activeOrganizationId || !parsedInnings.length) return;
    setIsSaving(true);
    try {
      // Create missing series/teams first (Option C)
      let finalSeriesId = seriesId;
      let finalSeriesName = seriesName;

      if (importMode === 'excel') {
        if (createNewSeries && unmatchedSeries) {
          // Create a minimal series shell
          try {
            const { addSeriesAction } = await import('@/lib/actions/series-actions');
            const newSeries = await addSeriesAction({
              name: unmatchedSeries,
              ageCategory: 'Open', // default — user can edit later
              year: date ? new Date(date).getFullYear() : new Date().getFullYear(),
              organizationId: activeOrganizationId,
            });
            finalSeriesId = newSeries.id;
            finalSeriesName = newSeries.name;
            toast({ title: 'Series created', description: `Created "${newSeries.name}"` });
          } catch (e: any) {
            toast({ title: 'Could not create series', description: e.message, variant: 'destructive' });
          }
        }

        // Create missing teams (shell — name only)
        if (createNewTeam1 && unmatchedTeam1) {
          try {
            const { addTeamAction } = await import('@/lib/actions/team-actions');
            await addTeamAction({ name: unmatchedTeam1, clubName: '', ageCategory: 'Open', organizationId: activeOrganizationId });
            toast({ title: 'Team created', description: `Created "${unmatchedTeam1}"` });
          } catch (e: any) {
            toast({ title: 'Could not create team 1', description: e.message, variant: 'destructive' });
          }
        }

        if (createNewTeam2 && unmatchedTeam2) {
          try {
            const { addTeamAction } = await import('@/lib/actions/team-actions');
            await addTeamAction({ name: unmatchedTeam2, clubName: '', ageCategory: 'Open', organizationId: activeOrganizationId });
            toast({ title: 'Team created', description: `Created "${unmatchedTeam2}"` });
          } catch (e: any) {
            toast({ title: 'Could not create team 2', description: e.message, variant: 'destructive' });
          }
        }
      }

      // Duplicate detection
      const dupCheck = await checkDuplicateScorecardAction({
        organizationId: activeOrganizationId,
        team1: team1.trim(),
        team2: team2.trim(),
        date,
        seriesId: finalSeriesId || undefined,
        linkedGameId: linkedGameId || undefined,
      });

      if (dupCheck.isDuplicate) {
        if (dupCheck.existingScorecardId) {
          toast({ title: 'Scorecard Already Exists', description: dupCheck.message + ' Redirecting.' });
          router.push(`/scorecards/${dupCheck.existingScorecardId}`);
        } else {
          toast({ title: 'Duplicate Scorecard', description: dupCheck.message, variant: 'destructive' });
        }
        setIsSaving(false);
        return;
      }

      const parsed = parseCricClubsUrl(url);
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
        seriesId: finalSeriesId || undefined,
        seriesName: finalSeriesName || undefined,
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

  // ─── Step labels ──────────────────────────────────────────────────────────
  // Duplicate check before advancing from details step
  const handleNextFromDetails = async () => {
    if (!activeOrganizationId) return;
    setIsCheckingDup(true);
    setDupWarning(null);
    try {
      const dupCheck = await checkDuplicateScorecardAction({
        organizationId: activeOrganizationId,
        team1: team1.trim(),
        team2: team2.trim(),
        date,
        seriesId: seriesId || undefined,
        linkedGameId: linkedGameId || undefined,
      });
      if (dupCheck.isDuplicate) {
        setDupWarning({
          message: dupCheck.message || 'A scorecard already exists for this match.',
          existingId: dupCheck.existingScorecardId,
        });
        setIsCheckingDup(false);
        return;
      }
    } catch {}
    setIsCheckingDup(false);
    setStep(importMode === 'excel' ? 'review' : 'upload');
  };

  const stepKeys: Step[] = importMode === 'excel'
    ? ['choose', 'upload', 'details', 'review']
    : ['choose', 'details', 'upload', 'review'];
  const stepLabels: Record<Step, string> = {
    choose: 'Import Method',
    upload: importMode === 'excel' ? 'Upload File' : 'Upload Screenshots',
    details: 'Match Details',
    review: 'Review & Save',
  };
  const currentIdx = stepKeys.indexOf(step);

  // ─── Validation ───────────────────────────────────────────────────────────
  const xlsReadyToReview = importMode === 'excel' && parsedInnings.length > 0 &&
    (!unmatchedSeries || matchedSeries || createNewSeries) &&
    (!unmatchedTeam1 || matchedTeam1 || createNewTeam1) &&
    (!unmatchedTeam2 || matchedTeam2 || createNewTeam2);

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
          <CardDescription>
            Upload screenshots for AI extraction, or import directly from a CricClubs Excel/CSV file.
          </CardDescription>
        </CardHeader>
        <CardContent>

          {/* ── Step: Choose method ────────────────────────────────────────── */}
          {step === 'choose' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">How would you like to import this scorecard?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => { setImportMode('excel'); setStep('upload'); }}
                  className="flex flex-col items-center gap-3 p-6 border-2 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left group"
                >
                  <FileSpreadsheet className="h-10 w-10 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Excel / CSV</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Upload the CricClubs Excel export. Teams, date and result are extracted automatically.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs border-green-400 text-green-700">Recommended</Badge>
                </button>
                <button
                  onClick={() => { setImportMode('screenshot'); setStep('details'); }}
                  className="flex flex-col items-center gap-3 p-6 border-2 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors text-left group"
                >
                  <ImageIcon className="h-10 w-10 text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Screenshots (AI)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Take screenshots from CricClubs. Claude reads all images together for accurate extraction.
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">AI-powered</Badge>
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Details ──────────────────────────────────────────────── */}
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

              {/* Series picker */}
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
                        : <p className="text-xs text-muted-foreground">No series linked to this game.</p>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Year</Label>
                        <Select value={selectedYear} onValueChange={v => {
                          setSelectedYear(v);
                          // Don't clear series when year changes — series may span year boundaries
                        }}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Year" /></SelectTrigger>
                          <SelectContent>{availableYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Series</Label>
                        <Select value={seriesId || 'none'} onValueChange={v => {
                          const val = v === 'none' ? '' : v;
                          setSeriesId(val);
                          setSeriesName(availableSeries.find(s => s.id === val)?.name || '');
                        }}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select series" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {availableSeries.filter(s => !selectedYear || s.year.toString() === selectedYear || s.id === seriesId).map(s => (
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

              {dupWarning && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-700">Scorecard already exists</AlertTitle>
                  <AlertDescription className="text-amber-600 text-sm">
                    {dupWarning.message}{' '}
                    {dupWarning.existingId && (
                      <button
                        onClick={() => router.push(`/scorecards/${dupWarning.existingId}`)}
                        className="underline font-medium"
                      >
                        View existing scorecard →
                      </button>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(importMode === 'excel' ? 'upload' : 'choose')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleNextFromDetails}
                  disabled={!team1.trim() || !team2.trim() || !date || (!linkedGameId && !seriesId && importMode === 'screenshot') || isCheckingDup}
                  className="flex-1"
                >
                  {isCheckingDup
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...</>
                    : <>{importMode === 'excel' ? 'Review & Save' : 'Next: Upload Screenshots'} <ArrowRight className="ml-2 h-4 w-4" /></>
                  }
                </Button>
              </div>
              {!linkedGameId && !seriesId && importMode === 'screenshot' && (
                <p className="text-xs text-center text-muted-foreground">Select a series to continue.</p>
              )}
            </div>
          )}

          {/* ── Step: Uploads ──────────────────────────────────────────────── */}
          {step === 'upload' && importMode === 'screenshot' && (
            <div className="space-y-6">
              {/* Screenshot upload content */}
              <div className="space-y-5">
                  <Alert className="border-blue-200 bg-blue-50">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-700">How to capture screenshots</AlertTitle>
                    <AlertDescription className="text-blue-600 text-sm">
                      On CricClubs, click <strong>Full Scorecard</strong> tab. Upload one screenshot per innings.
                      Claude reads all images together for the best accuracy.
                    </AlertDescription>
                  </Alert>

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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {slots.map((slot, idx) => (
                      <div key={slot.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">{slot.label}</Label>
                          {idx >= 2 && (
                            <button onClick={() => removeSlot(slot.key)} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5">
                              <X className="h-3 w-3" /> Remove
                            </button>
                          )}
                        </div>
                        <div onClick={() => fileRefs.current[slot.key]?.click()}
                          className={cn("border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors min-h-[100px] flex flex-col items-center justify-center gap-1.5",
                            slot.preview ? "border-primary/40 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/40")}>
                          {slot.preview
                            ? <img src={slot.preview} alt="Preview" className="max-h-20 rounded object-contain" />
                            : <><ImageIcon className="h-7 w-7 text-muted-foreground" /><p className="text-xs text-muted-foreground">Click to upload</p></>}
                        </div>
                        <input ref={el => { fileRefs.current[slot.key] = el; }} type="file" accept="image/png,image/jpeg,image/webp"
                          onChange={e => handleUpload(slot.key, e)} className="hidden" />
                        {slot.base64 && (
                          <Button size="sm" variant="ghost" className="w-full text-xs text-muted-foreground"
                            onClick={() => { updateSlot(slot.key, { preview: null, base64: null }); setParsedInnings([]); }}>
                            <X className="mr-1 h-3 w-3" /> Clear
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button variant="outline" size="sm" onClick={addExtraSlot} className="w-full text-muted-foreground border-dashed">
                    <ImageIcon className="mr-2 h-3.5 w-3.5" /> Add another screenshot
                  </Button>

                  {uploadedSlots.length > 0 && (
                    <div className="space-y-2">
                      <Button onClick={handleExtractAll} disabled={isExtracting} className="w-full" size="lg">
                        {isExtracting
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analysing {uploadedSlots.length} image(s) with Claude...</>
                          : <><Sparkles className="mr-2 h-4 w-4" /> Extract Scorecard from {uploadedSlots.length} Image(s)</>}
                      </Button>
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
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('details')}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button onClick={() => setStep('review')} disabled={!hasExtracted} className="flex-1">
                  Review & Save <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Upload (Excel mode) ───────────────────────────────────── */}
          {step === 'upload' && importMode === 'excel' && (
            <div className="space-y-5">
              <Alert className="border-blue-200 bg-blue-50">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle className="text-blue-700">How to get the CricClubs Excel file</AlertTitle>
                    <AlertDescription className="text-blue-600 text-sm">
                      On the CricClubs scorecard page, click the <strong>Excel</strong> download button.
                      Upload the <code>.xlsx</code>, <code>.xls</code>, or <code>.csv</code> file here.
                      Team names, date and result will be extracted automatically.
                    </AlertDescription>
                  </Alert>

                  {/* File upload zone */}
                  <div
                    onClick={() => xlsFileRef.current?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                      xlsFile ? "border-primary/40 bg-primary/5" : "border-muted-foreground/25 hover:border-primary/40"
                    )}
                  >
                    {isParsingXls ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Parsing file...</p>
                      </div>
                    ) : xlsFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileSpreadsheet className="h-8 w-8 text-primary" />
                        <p className="text-sm font-medium">{xlsFile.name}</p>
                        <p className="text-xs text-muted-foreground">Click to change file</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Click to upload Excel or CSV</p>
                        <p className="text-xs text-muted-foreground">.xlsx, .xls, .csv supported</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={xlsFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    onChange={handleXlsUpload}
                    className="hidden"
                  />

                  {/* Option C — Match confirmation cards */}
                  {xlsParsed && (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">Parsed from file — confirm matches:</p>

                      {/* Series */}
                      <MatchConfirmCard
                        label="Series"
                        parsedValue={xlsParsed.seriesNameRaw}
                        matched={matchedSeries}
                        unmatched={unmatchedSeries}
                        createNew={createNewSeries}
                        onSelectExisting={(id) => {
                          const s = availableSeries.find(s => s.id === id);
                          if (s) { setMatchedSeries(s); setSeriesId(s.id); setSeriesName(s.name); setUnmatchedSeries(''); setCreateNewSeries(false); }
                        }}
                        onCreateNew={() => { setCreateNewSeries(true); setMatchedSeries(null); setSeriesId(''); setSeriesName(''); }}
                        onCancelCreate={() => setCreateNewSeries(false)}
                        existingOptions={availableSeries.map(s => ({ id: s.id, name: `${s.name} (${s.year})` }))}
                        createLabel={`Create new series "${unmatchedSeries}"`}
                      />

                      {/* Team 1 */}
                      <MatchConfirmCard
                        label={`Team 1: ${xlsParsed.team1}`}
                        parsedValue={xlsParsed.team1}
                        matched={matchedTeam1}
                        unmatched={unmatchedTeam1}
                        createNew={createNewTeam1}
                        onSelectExisting={(id) => {
                          const t = availableTeams.find(t => t.id === id);
                          if (t) { setMatchedTeam1(t); setTeam1(t.name); setUnmatchedTeam1(''); setCreateNewTeam1(false); }
                        }}
                        onCreateNew={() => { setCreateNewTeam1(true); setMatchedTeam1(null); setTeam1(unmatchedTeam1); }}
                        onCancelCreate={() => setCreateNewTeam1(false)}
                        existingOptions={availableTeams.map(t => ({ id: t.id, name: t.name }))}
                        createLabel={`Create new team "${unmatchedTeam1}"`}
                      />

                      {/* Team 2 */}
                      <MatchConfirmCard
                        label={`Team 2: ${xlsParsed.team2}`}
                        parsedValue={xlsParsed.team2}
                        matched={matchedTeam2}
                        unmatched={unmatchedTeam2}
                        createNew={createNewTeam2}
                        onSelectExisting={(id) => {
                          const t = availableTeams.find(t => t.id === id);
                          if (t) { setMatchedTeam2(t); setTeam2(t.name); setUnmatchedTeam2(''); setCreateNewTeam2(false); }
                        }}
                        onCreateNew={() => { setCreateNewTeam2(true); setMatchedTeam2(null); setTeam2(unmatchedTeam2); }}
                        onCancelCreate={() => setCreateNewTeam2(false)}
                        existingOptions={availableTeams.map(t => ({ id: t.id, name: t.name }))}
                        createLabel={`Create new team "${unmatchedTeam2}"`}
                      />

                      {/* Parsed summary */}
                      <div className="bg-muted/40 border rounded-lg p-3 text-xs space-y-1 text-muted-foreground">
                        <p><span className="font-medium text-foreground">Date:</span> {xlsParsed.date || 'Not detected'}</p>
                        <p><span className="font-medium text-foreground">Result:</span> {xlsParsed.result || 'Not detected'}</p>
                        <p><span className="font-medium text-foreground">Innings:</span> {xlsParsed.innings.length} parsed</p>
                        {xlsParsed.innings.map((inn, i) => (
                          <p key={i} className="pl-3">
                            Inn {i + 1}: {inn.battingTeam} — {inn.totalRuns}/{inn.wickets} ({inn.overs} ov),{' '}
                            {inn.batting.length} batters, {inn.bowling.length} bowlers
                            {inn.didNotBat.length > 0 ? `, DNB: ${inn.didNotBat.join(', ')}` : ''}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {xlsParsed && parsedInnings.length > 0 && (
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-700">File parsed successfully</AlertTitle>
                      <AlertDescription className="text-green-600 text-sm">
                        {parsedInnings.length} innings ready. Confirm the matches above, then continue to review details.
                      </AlertDescription>
                    </Alert>
                  )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep('choose')}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button
                  onClick={() => setStep('details')}
                  disabled={!xlsReadyToReview}
                  className="flex-1"
                >
                  Confirm Details <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step: Review ───────────────────────────────────────────────── */}
          {step === 'review' && (
            <div className="space-y-5">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700">Ready to save</AlertTitle>
                <AlertDescription className="text-green-600 text-sm">
                  Review the data below before saving.
                  {importMode === 'excel' && ' Imported from Excel/CSV — verify player names and stats.'}
                </AlertDescription>
              </Alert>

              <div className="text-sm border rounded-lg divide-y">
                <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Match</span><span className="font-medium">{team1} vs {team2}</span></div>
                <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Date</span><span>{date}</span></div>
                {venue && <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Venue</span><span>{venue}</span></div>}
                {result && <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Result</span><span>{result}</span></div>}
                {seriesName && <div className="flex justify-between p-2.5"><span className="text-muted-foreground">Series</span><span>{seriesName}</span></div>}
                {importMode === 'excel' && (
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Source</span>
                    <Badge variant="outline" className="text-xs">Excel / CSV</Badge>
                  </div>
                )}
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

                  {/* Sample rows for verification */}
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Top batters:</p>
                    {inn.batting.slice(0, 4).map((b, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {b.name}: {b.runs} ({b.balls}b) — {b.dismissal}
                      </p>
                    ))}
                  </div>
                </div>
              ))}

              {/* Pending creates callout */}
              {importMode === 'excel' && (createNewSeries || createNewTeam1 || createNewTeam2) && (
                <Alert className="border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-700">Will create on save:</AlertTitle>
                  <AlertDescription className="text-amber-600 text-sm space-y-1">
                    {createNewSeries && <p>• New series: <strong>{unmatchedSeries}</strong></p>}
                    {createNewTeam1 && <p>• New team: <strong>{unmatchedTeam1}</strong></p>}
                    {createNewTeam2 && <p>• New team: <strong>{unmatchedTeam2}</strong></p>}
                    <p className="text-xs">These will be created as shell records — add details later.</p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('details')}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
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

// ─── Option C Match Confirm Card ──────────────────────────────────────────────

interface MatchConfirmCardProps {
  label: string;
  parsedValue: string;
  matched: { id: string; name: string } | null;
  unmatched: string;
  createNew: boolean;
  onSelectExisting: (id: string) => void;
  onCreateNew: () => void;
  onCancelCreate: () => void;
  existingOptions: { id: string; name: string }[];
  createLabel: string;
}

function MatchConfirmCard({
  label, parsedValue, matched, unmatched, createNew,
  onSelectExisting, onCreateNew, onCancelCreate, existingOptions, createLabel,
}: MatchConfirmCardProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');

  if (!parsedValue) return null;

  const filtered = existingOptions.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

  if (matched && !createNew) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium text-green-800 truncate">✓ {matched.name}</p>
        </div>
        <button onClick={() => setShowPicker(!showPicker)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
          Change
        </button>
        {showPicker && (
          <ExistingPicker
            options={existingOptions}
            onSelect={(id) => { onSelectExisting(id); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    );
  }

  if (createNew) {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
        <PlusCircle className="h-4 w-4 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium text-blue-800 truncate">Will create: {unmatched}</p>
        </div>
        <button onClick={onCancelCreate} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
          Cancel
        </button>
      </div>
    );
  }

  // Unmatched — show options
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm font-medium text-amber-800">"{parsedValue}" not found</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCreateNew} className="flex-1 text-xs border-blue-400 text-blue-700 hover:bg-blue-50">
          <PlusCircle className="h-3 w-3 mr-1" /> {createLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowPicker(!showPicker)} className="flex-1 text-xs">
          <Search className="h-3 w-3 mr-1" /> Select existing
        </Button>
      </div>
      {showPicker && (
        <ExistingPicker
          options={existingOptions}
          onSelect={(id) => { onSelectExisting(id); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function ExistingPicker({ options, onSelect, onClose }: {
  options: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = options.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="absolute z-20 bg-card border rounded-xl shadow-lg mt-1 w-72 max-h-48 overflow-y-auto">
      <div className="p-2 border-b sticky top-0 bg-card">
        <Input autoFocus placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
      </div>
      {filtered.length === 0
        ? <p className="text-xs text-muted-foreground text-center py-4">Nothing found</p>
        : filtered.map(o => (
          <button key={o.id} onClick={() => onSelect(o.id)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-0">
            {o.name}
          </button>
        ))}
      <button onClick={onClose} className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground border-t">
        Cancel
      </button>
    </div>
  );
}
