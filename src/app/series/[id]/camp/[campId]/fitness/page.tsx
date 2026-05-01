'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  getCampByIdAction, getCampPlayersAction,
  getCampFitnessResultsAction, recordCampFitnessResultAction
} from '@/lib/actions/camp-actions';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { SelectionCamp, CampPlayer, CampFitnessResult } from '@/types';
import { Loader2, ArrowLeft, Activity, CheckCircle, XCircle, ShieldAlert } from 'lucide-react';

export default function CampFitnessPage() {
  const params = useParams<{ id: string; campId: string }>();
  const { id: seriesId, campId } = params;
  const { currentUser, userProfile, activeOrganizationId } = useAuth();
  const { toast } = useToast();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>([]);
  const [fitnessResults, setFitnessResults] = useState<Map<string, CampFitnessResult>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [scores, setScores] = useState<Map<string, string>>(new Map());
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!campId) return;
    Promise.all([
      getCampByIdAction(campId),
      getCampPlayersAction(campId),
      getCampFitnessResultsAction(campId),
    ]).then(([campRes, playersRes, fitnessRes]) => {
      if (campRes.success) setCamp(campRes.camp!);
      if (playersRes.success) setCampPlayers(playersRes.players || []);
      if (fitnessRes.success) {
        const map = new Map<string, CampFitnessResult>();
        fitnessRes.results?.forEach(f => map.set(f.playerId, f));
        setFitnessResults(map);
        // Pre-fill score inputs with existing values
        const scoreMap = new Map<string, string>();
        fitnessRes.results?.forEach(f => scoreMap.set(f.playerId, f.score.toString()));
        setScores(scoreMap);
      }
      setIsLoading(false);
    });
  }, [campId]);

  const handleSave = async (cp: CampPlayer) => {
    const scoreStr = scores.get(cp.playerId) || '';
    const score = parseFloat(scoreStr);
    if (isNaN(score)) {
      toast({ title: 'Invalid score', variant: 'destructive' });
      return;
    }
    if (!camp || !currentUser || !activeOrganizationId || !userProfile) return;

    const passing = camp.fitnessTestPassingScore || 0;
    const passed = score >= passing;

    setSavingId(cp.playerId);
    const res = await recordCampFitnessResultAction({
      campId,
      organizationId: activeOrganizationId,
      playerId: cp.playerId,
      bibNumber: cp.bibNumber,
      testType: camp.fitnessTestType!,
      score,
      passed,
      recordedByUid: currentUser.uid,
      recordedByName: userProfile.displayName || userProfile.email || 'Admin',
    });

    if (res.success) {
      const refreshed = await getCampFitnessResultsAction(campId);
      if (refreshed.success) {
        const map = new Map<string, CampFitnessResult>();
        refreshed.results?.forEach(f => map.set(f.playerId, f));
        setFitnessResults(map);
      }
      toast({ title: `Fitness recorded for Bib #${cp.bibNumber} — ${passed ? 'PASS ✓' : 'FAIL ✗'}` });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setSavingId(null);
  };

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  if (!camp || !camp.fitnessTestType) return (
    <Alert variant="destructive" className="max-w-xl mx-auto mt-8">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle>No fitness test configured</AlertTitle>
      <AlertDescription>This camp doesn't have a fitness test type set. Edit the camp to add one.</AlertDescription>
    </Alert>
  );

  const sortedPlayers = [...campPlayers].sort((a, b) => a.bibNumber - b.bibNumber);
  const recorded = fitnessResults.size;
  const passed = Array.from(fitnessResults.values()).filter(f => f.passed).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/series/${seriesId}/camp/${campId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Camp
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
          <Activity className="h-8 w-8" /> Fitness Tests
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{camp.fitnessTestType} · Passing score: {camp.fitnessTestPassingScore} · {recorded}/{sortedPlayers.length} recorded · {passed} passed</p>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card shadow">
        {/* Column headers */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <div className="col-span-1">Bib</div>
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Skill</div>
          <div className="col-span-2">Score (pass ≥ {camp.fitnessTestPassingScore})</div>
          <div className="col-span-2">Result</div>
          <div className="col-span-1"></div>
        </div>
        <div className="divide-y">
          {sortedPlayers.map(cp => {
            const result = fitnessResults.get(cp.playerId);
            const scoreVal = scores.get(cp.playerId) || '';
            const passing = camp.fitnessTestPassingScore || 0;
            const previewPass = scoreVal !== '' && !isNaN(parseFloat(scoreVal))
              ? parseFloat(scoreVal) >= passing
              : null;

            return (
              <div key={cp.id} className="grid grid-cols-12 gap-4 items-center px-6 py-4 hover:bg-muted/20 transition-colors">
                <div className="col-span-1">
                  <span className="text-lg font-bold text-primary">#{cp.bibNumber}</span>
                </div>
                <div className="col-span-4">
                  <p className="text-sm font-medium truncate">{cp.playerName}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-muted-foreground">{cp.playerPrimarySkill}</span>
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="Score..."
                    value={scoreVal}
                    onChange={e => setScores(prev => new Map(prev).set(cp.playerId, e.target.value))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  {previewPass !== null && (
                    previewPass
                      ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      : <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  {result && (
                    <Badge className={`text-xs ${result.passed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                      {result.passed ? 'Pass' : 'Fail'} ({result.score})
                    </Badge>
                  )}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button size="sm" className="h-8"
                    disabled={!scoreVal || savingId === cp.playerId}
                    onClick={() => handleSave(cp)}>
                    {savingId === cp.playerId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : result ? 'Update' : 'Save'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
