'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardByIdAction } from '@/lib/actions/scorecard-actions';
import type { MatchScorecard, ScorecardInnings } from '@/types';
import { ScorecardPerformanceTab } from '@/components/scorecards/scorecard-performance-tab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, ShieldAlert, Table, CalendarFold, MapPin, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

function InningsView({ innings }: { innings: ScorecardInnings }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary text-lg">{innings.battingTeam} innings</h3>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-base font-semibold">
            {innings.totalRuns}/{innings.wickets}
          </Badge>
          <Badge variant="secondary">{innings.overs} overs</Badge>
        </div>
      </div>

      {/* Batting */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">Batting</h4>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="text-left p-2.5 font-medium" colSpan={2}>Batter</th>
                <th className="p-2.5 font-medium text-right">R</th>
                <th className="p-2.5 font-medium text-right">B</th>
                <th className="p-2.5 font-medium text-right">4s</th>
                <th className="p-2.5 font-medium text-right">6s</th>
                <th className="p-2.5 font-medium text-right">SR</th>
              </tr>
            </thead>
            <tbody>
              {innings.batting.map((b, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  <td className="p-2.5" colSpan={2}>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.dismissal}</p>
                  </td>
                  <td className="p-2.5 text-right font-semibold">{b.runs}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.balls}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.fours}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.sixes}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.strikeRate}</td>
                </tr>
              ))}
              <tr className="bg-muted/50 border-t font-medium">
                <td className="p-2.5" colSpan={2}>
                  Extras ({innings.extras.byes > 0 ? `b ${innings.extras.byes} ` : ''}
                  {innings.extras.legByes > 0 ? `lb ${innings.extras.legByes} ` : ''}
                  {innings.extras.wides > 0 ? `w ${innings.extras.wides} ` : ''}
                  {innings.extras.noballs > 0 ? `nb ${innings.extras.noballs}` : ''})
                </td>
                <td className="p-2.5 text-right font-semibold">{innings.extras.total}</td>
                <td colSpan={4} />
              </tr>
              <tr className="bg-primary/10 border-t font-semibold">
                <td className="p-2.5" colSpan={2}>
                  Total ({innings.wickets} wickets, {innings.overs} overs)
                </td>
                <td className="p-2.5 text-right font-bold text-primary">{innings.totalRuns}</td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
        {innings.didNotBat.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2 px-1">
            <span className="font-medium">Did not bat:</span> {innings.didNotBat.join(', ')}
          </p>
        )}
      </div>

      {/* Bowling */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">Bowling</h4>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="text-left p-2.5 font-medium">Bowler</th>
                <th className="p-2.5 font-medium text-right">O</th>
                <th className="p-2.5 font-medium text-right">M</th>
                <th className="p-2.5 font-medium text-right">Dot</th>
                <th className="p-2.5 font-medium text-right">R</th>
                <th className="p-2.5 font-medium text-right">W</th>
                <th className="p-2.5 font-medium text-right">Econ</th>
                <th className="p-2.5 font-medium text-right">Wd</th>
                <th className="p-2.5 font-medium text-right">Nb</th>
              </tr>
            </thead>
            <tbody>
              {innings.bowling.map((b, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  <td className="p-2.5 font-medium">{b.name}</td>
                  <td className="p-2.5 text-right">{b.overs}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.maidens}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.dots}</td>
                  <td className="p-2.5 text-right">{b.runs}</td>
                  <td className="p-2.5 text-right font-semibold text-primary">{b.wickets}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.economy}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.wides}</td>
                  <td className="p-2.5 text-right text-muted-foreground">{b.noballs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fall of Wickets */}
      {innings.fallOfWickets.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">Fall of Wickets</h4>
          <div className="flex flex-wrap gap-2">
            {innings.fallOfWickets.map((fow, i) => (
              <Badge key={i} variant="outline" className="text-xs font-mono">{fow}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export default function ScorecardDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { effectivePermissions } = useAuth();

  const [scorecard, setScorecard] = useState<MatchScorecard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    getScorecardByIdAction(params.id).then(res => {
      if (res.success && res.scorecard) setScorecard(res.scorecard);
      else setError(res.error || 'Scorecard not found.');
      setIsLoading(false);
    });
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !scorecard) {
    return (
      <div className="max-w-2xl mx-auto mt-8 space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/scorecards"><ArrowLeft className="mr-2 h-4 w-4" />Back to Scorecards</Link>
        </Button>
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || 'Scorecard not found.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const formatDate = (d: string) => {
    try { return format(parseISO(d), 'PPP'); } catch { return d; }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/scorecards"><ArrowLeft className="mr-2 h-4 w-4" />Back to Scorecards</Link>
        </Button>
        {scorecard.cricClubsUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={scorecard.cricClubsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> View on CricClubs
            </a>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start flex-wrap gap-2">
            <div>
              <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                <Table className="h-6 w-6" />
                {scorecard.team1} vs {scorecard.team2}
              </CardTitle>
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarFold className="h-4 w-4" /> {formatDate(scorecard.date)}
                </span>
                {scorecard.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {scorecard.venue}
                  </span>
                )}
                {scorecard.cricClubsLeague && (
                  <Badge variant="secondary">{scorecard.cricClubsLeague}</Badge>
                )}
              </div>
            </div>
            {scorecard.result && (
              <Badge className="bg-green-100 text-green-800 border-green-200 text-sm px-3 py-1">
                {scorecard.result}
              </Badge>
            )}
          </div>

          {/* Innings summary */}
          <div className="flex flex-wrap gap-3 mt-3">
            {scorecard.innings.map((inn, i) => (
              <div key={i} className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <span className="font-medium">{inn.battingTeam}: </span>
                <span className="font-bold text-primary">{inn.totalRuns}/{inn.wickets}</span>
                <span className="text-muted-foreground"> ({inn.overs} ov)</span>
              </div>
            ))}
          </div>
        </CardHeader>
      </Card>

      {scorecard.innings.length === 1 ? (
        <Tabs defaultValue="innings1">
          <TabsList className="w-full">
            <TabsTrigger value="innings1" className="flex-1">{scorecard.innings[0].battingTeam} innings</TabsTrigger>
            <TabsTrigger value="performance" className="flex-1">Performance</TabsTrigger>
          </TabsList>
          <TabsContent value="innings1" className="mt-4">
            <InningsView innings={scorecard.innings[0]} />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <ScorecardPerformanceTab innings={scorecard.innings} team1={scorecard.team1} team2={scorecard.team2} />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs defaultValue="innings1">
          <TabsList className="w-full">
            {scorecard.innings.map((inn, i) => (
              <TabsTrigger key={i} value={`innings${i + 1}`} className="flex-1">
                {inn.battingTeam} ({inn.totalRuns}/{inn.wickets})
              </TabsTrigger>
            ))}
            <TabsTrigger value="performance" className="flex-1">Performance</TabsTrigger>
          </TabsList>
          {scorecard.innings.map((inn, i) => (
            <TabsContent key={i} value={`innings${i + 1}`} className="mt-4">
              <InningsView innings={inn} />
            </TabsContent>
          ))}
          <TabsContent value="performance" className="mt-4">
            <ScorecardPerformanceTab innings={scorecard.innings} team1={scorecard.team1} team2={scorecard.team2} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
