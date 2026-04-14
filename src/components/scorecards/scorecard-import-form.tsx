'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, ArrowRight, ArrowLeft, ImageIcon, Info, Table, X } from 'lucide-react';
import { parseBattingImageAction, parseBowlingImageAction } from '@/lib/actions/parse-scorecard-action';
import { saveScorecardAction } from '@/lib/actions/scorecard-actions';
import { parseCricClubsUrl } from '@/lib/utils/cricclubs-utils';
import { deriveFieldingStats } from '@/lib/utils/scorecard-fielding-utils';
import type { ScorecardInnings, ScorecardBatter, ScorecardBowler } from '@/types';
import { cn } from '@/lib/utils';

type Step = 'details' | 'uploads' | 'review';

interface InningsData {
  battingTeam?: string;
  totalRuns?: number;
  wickets?: number;
  overs?: string;
  extras?: { byes: number; legByes: number; wides: number; noballs: number; total: number };
  batting?: ScorecardBatter[];
  bowling?: ScorecardBowler[];
  fallOfWickets?: string[];
  didNotBat?: string[];
}

interface ImageSlot {
  key: string;
  label: string;
  innings: 1 | 2;
  type: 'batting' | 'bowling';
  preview: string | null;
  base64: string | null;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  parsed: boolean;
  loading: boolean;
}

export function ScorecardImportForm() {
  const { currentUser, activeOrganizationId } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('details');
  const [isSaving, setIsSaving] = useState(false);

  const [url, setUrl] = useState('');
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [result, setResult] = useState('');

  const [innings1, setInnings1] = useState<InningsData>({});
  const [innings2, setInnings2] = useState<InningsData>({});

  const [slots, setSlots] = useState<ImageSlot[]>([
    { key: 'inn1batting', label: 'Innings 1 — Batting', innings: 1, type: 'batting', preview: null, base64: null, mediaType: 'image/png', parsed: false, loading: false },
    { key: 'inn1bowling', label: 'Innings 1 — Bowling', innings: 1, type: 'bowling', preview: null, base64: null, mediaType: 'image/png', parsed: false, loading: false },
    { key: 'inn2batting', label: 'Innings 2 — Batting', innings: 2, type: 'batting', preview: null, base64: null, mediaType: 'image/png', parsed: false, loading: false },
    { key: 'inn2bowling', label: 'Innings 2 — Bowling', innings: 2, type: 'bowling', preview: null, base64: null, mediaType: 'image/png', parsed: false, loading: false },
  ]);

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
      updateSlot(key, { preview: dataUrl, base64: dataUrl.split(',')[1], mediaType, parsed: false });
    };
    reader.readAsDataURL(file);
  };

  const handleParse = async (slot: ImageSlot) => {
    if (!slot.base64) return;
    updateSlot(slot.key, { loading: true });
    try {
      const setter = slot.innings === 1 ? setInnings1 : setInnings2;
      if (slot.type === 'batting') {
        const res = await parseBattingImageAction(slot.base64, slot.mediaType, slot.innings);
        if (res.success && res.data) {
          setter(prev => ({ ...prev, ...res.data }));
          updateSlot(slot.key, { parsed: true, loading: false });
          toast({ title: `Innings ${slot.innings} batting extracted`, description: `${res.data.batting?.length || 0} batters found.` });
        } else {
          toast({ title: 'Parse Failed', description: res.error, variant: 'destructive' });
          updateSlot(slot.key, { loading: false });
        }
      } else {
        const res = await parseBowlingImageAction(slot.base64, slot.mediaType, slot.innings);
        if (res.success && res.data) {
          setter(prev => ({ ...prev, ...res.data }));
          updateSlot(slot.key, { parsed: true, loading: false });
          toast({ title: `Innings ${slot.innings} bowling extracted`, description: `${res.data.bowling?.length || 0} bowlers found.` });
        } else {
          toast({ title: 'Parse Failed', description: res.error, variant: 'destructive' });
          updateSlot(slot.key, { loading: false });
        }
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      updateSlot(slot.key, { loading: false });
    }
  };

  /**
   * Team 1 full roster = Inn1 batting + Inn1 didNotBat + Inn2 bowling
   * Team 2 full roster = Inn2 batting + Inn2 didNotBat + Inn1 bowling
   */
  const buildRosters = () => {
    const team1Names = new Set<string>();
    const team2Names = new Set<string>();
    innings1.batting?.forEach(b => team1Names.add(b.name));
    innings1.didNotBat?.forEach(n => team1Names.add(n));
    innings2.bowling?.forEach(b => team1Names.add(b.name));
    innings2.batting?.forEach(b => team2Names.add(b.name));
    innings2.didNotBat?.forEach(n => team2Names.add(n));
    innings1.bowling?.forEach(b => team2Names.add(b.name));
    return {
      team1: Array.from(team1Names).filter(Boolean),
      team2: Array.from(team2Names).filter(Boolean),
    };
  };

  const buildInnings = (data: InningsData, num: 1 | 2, fieldingTeamNames: string[]): ScorecardInnings => {
    const batting = data.batting || [];
    const bowling = data.bowling || [];
    const extras = data.extras || { byes: 0, legByes: 0, wides: 0, noballs: 0, total: 0 };
    // Build mock bowler list from fielding team names for name resolution in deriveFieldingStats
    const fieldingTeamBowlers = fieldingTeamNames.map(name => ({
      name, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, wides: 0, noballs: 0, dots: 0,
    }));
    return {
      inningsNumber: num,
      battingTeam: data.battingTeam || (num === 1 ? team1 : team2),
      totalRuns: data.totalRuns || 0,
      wickets: data.wickets || 0,
      overs: data.overs || '0',
      extras,
      batting,
      bowling,
      fielding: deriveFieldingStats(batting, extras.byes, fieldingTeamBowlers, data.didNotBat || []),
      fallOfWickets: data.fallOfWickets || [],
      didNotBat: data.didNotBat || [],
    };
  };

  const hasAnyData = slots.some(s => s.parsed);
  const hasInnings1 = !!(innings1.batting?.length || innings1.bowling?.length);
  const hasInnings2 = !!(innings2.batting?.length || innings2.bowling?.length);

  const handleSave = async () => {
    if (!currentUser || !activeOrganizationId) return;
    setIsSaving(true);
    try {
      const parsed = parseCricClubsUrl(url);
      const rosters = buildRosters();
      const innings: ScorecardInnings[] = [];
      // Inn1 fielding = team2 fielding → pass team2 names for name resolution
      if (hasInnings1) innings.push(buildInnings(innings1, 1, rosters.team2));
      // Inn2 fielding = team1 fielding → pass team1 names for name resolution
      if (hasInnings2) innings.push(buildInnings(innings2, 2, rosters.team1));

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
        innings,
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
          <CardDescription>Upload separate screenshots for batting and bowling — up to 4 images total.</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'details' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>CricClubs Scorecard URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input placeholder="https://cricclubs.com/SCCAY/viewScorecard.do?matchId=99&clubId=5273" value={url} onChange={e => setUrl(e.target.value)} />
                {parseCricClubsUrl(url).valid && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> League: {parseCricClubsUrl(url).league} · Match: {parseCricClubsUrl(url).matchId}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Team 1 <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. SCCAY" value={team1} onChange={e => setTeam1(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Team 2 <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. WYCA" value={team2} onChange={e => setTeam2(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Match Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
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
              <Button onClick={() => setStep('uploads')} disabled={!team1.trim() || !team2.trim() || !date} className="w-full">
                Next: Upload Screenshots <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 'uploads' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <Alert className="border-blue-200 bg-blue-50">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-700">How to capture screenshots</AlertTitle>
                  <AlertDescription className="text-blue-600 text-sm">
                    On CricClubs, open the scorecard and click <strong>Full Scorecard</strong> tab.
                    Select an innings, then take <strong>two separate screenshots</strong> — one for the batting table
                    (including extras, total, did not bat) and one for the bowling table (including fall of wickets).
                    Repeat for the second innings. Upload what you have — all 4 are optional.
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sample: Batting screenshot</p>
                    <div className="border rounded-lg overflow-hidden bg-muted/20">
                      <img
                        src="/images/sample-batting.png"
                        alt="Sample batting scorecard"
                        className="w-full object-contain max-h-48"
                        onError={e => {
                          (e.target as HTMLImageElement).parentElement!.innerHTML =
                            '<div class="p-4 text-xs text-muted-foreground text-center">Add public/images/sample-batting.png</div>';
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Capture the full batting table including extras, total and did not bat rows.</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sample: Bowling screenshot</p>
                    <div className="border rounded-lg overflow-hidden bg-muted/20">
                      <img
                        src="/images/sample-bowling.png"
                        alt="Sample bowling scorecard"
                        className="w-full object-contain max-h-48"
                        onError={e => {
                          (e.target as HTMLImageElement).parentElement!.innerHTML =
                            '<div class="p-4 text-xs text-muted-foreground text-center">Add public/images/sample-bowling.png</div>';
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Capture the bowling table and fall of wickets section below it.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {slots.map(slot => (
                  <div key={slot.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">{slot.label}</Label>
                      {slot.parsed && <Badge className="bg-green-100 text-green-800 border-green-200 text-xs"><CheckCircle className="h-3 w-3 mr-1" />Done</Badge>}
                    </div>
                    <div
                      onClick={() => !slot.loading && fileRefs.current[slot.key]?.click()}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors min-h-[110px] flex flex-col items-center justify-center gap-1.5",
                        slot.parsed ? "border-green-300 bg-green-50" :
                        slot.preview ? "border-primary/40 bg-primary/5" :
                        "border-muted-foreground/25 hover:border-primary/40"
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
                    {slot.base64 && !slot.parsed && (
                      <Button size="sm" className="w-full" disabled={slot.loading} onClick={() => handleParse(slot)}>
                        {slot.loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Table className="mr-1.5 h-3.5 w-3.5" />}
                        {slot.loading ? 'Extracting...' : 'Extract Data'}
                      </Button>
                    )}
                    {slot.parsed && (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => {
                        updateSlot(slot.key, { parsed: false, preview: null, base64: null });
                        if (slot.type === 'batting') {
                          if (slot.innings === 1) setInnings1(prev => ({ ...prev, batting: [], didNotBat: [], totalRuns: undefined, wickets: undefined, overs: undefined, extras: undefined, battingTeam: undefined }));
                          else setInnings2(prev => ({ ...prev, batting: [], didNotBat: [], totalRuns: undefined, wickets: undefined, overs: undefined, extras: undefined, battingTeam: undefined }));
                        } else {
                          if (slot.innings === 1) setInnings1(prev => ({ ...prev, bowling: [], fallOfWickets: [] }));
                          else setInnings2(prev => ({ ...prev, bowling: [], fallOfWickets: [] }));
                        }
                      }}>
                        <X className="mr-1.5 h-3.5 w-3.5" /> Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('details')}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
                <Button onClick={() => setStep('review')} disabled={!hasAnyData} className="flex-1">
                  Review & Save <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

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

              {[{ data: innings1, num: 1 }, { data: innings2, num: 2 }].map(({ data, num }) =>
                (data.batting?.length || data.bowling?.length) ? (
                  <div key={num} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Innings {num} — {data.battingTeam || (num === 1 ? team1 : team2)}</h4>
                      {data.totalRuns !== undefined && <Badge variant="outline">{data.totalRuns}/{data.wickets} ({data.overs} ov)</Badge>}
                    </div>
                    {data.batting?.length ? <p className="text-xs text-green-600">✓ {data.batting.length} batters</p> : <p className="text-xs text-amber-600">⚠ No batting data</p>}
                    {data.bowling?.length ? <p className="text-xs text-green-600">✓ {data.bowling.length} bowlers</p> : <p className="text-xs text-amber-600">⚠ No bowling data</p>}
                    {data.fallOfWickets?.length ? <p className="text-xs text-green-600">✓ {data.fallOfWickets.length} fall of wickets</p> : null}
                    {data.didNotBat?.length ? <p className="text-xs text-green-600">✓ Did not bat: {data.didNotBat.join(', ')}</p> : null}
                  </div>
                ) : null
              )}

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
