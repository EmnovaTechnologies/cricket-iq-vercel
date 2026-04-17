'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardByIdAction, deleteScorecardAction } from '@/lib/actions/scorecard-actions';
import { ScorecardSelectorAssignmentPanel } from '@/components/scorecards/scorecard-selector-assignment';
import type { MatchScorecard, ScorecardInnings, ScorecardSelectorAssignment, UserProfile } from '@/types';
import { ScorecardPerformanceTab } from '@/components/scorecards/scorecard-performance-tab';
import { MatchReportTab } from '@/components/match-report-tab';
import { PlayerLinkTab } from '@/components/scorecards/player-link-tab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ArrowLeft, Loader2, ShieldAlert, Table, CalendarFold, MapPin, ExternalLink, Trash2, FileText, QrCode, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

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


// Build player name lists by team from scorecard innings
function buildPlayersByTeam(scorecard: MatchScorecard): Record<string, string[]> {
  const byTeam: Record<string, Set<string>> = {};
  for (const inn of scorecard.innings) {
    const team = inn.battingTeam;
    if (!byTeam[team]) byTeam[team] = new Set();
    inn.batting.forEach(b => byTeam[team].add(b.name));
    inn.didNotBat?.forEach(n => byTeam[team].add(n));
    // Bowling team is the other team
    const bowlingTeam = team === scorecard.team1 ? scorecard.team2 : scorecard.team1;
    if (!byTeam[bowlingTeam]) byTeam[bowlingTeam] = new Set();
    inn.bowling.forEach(b => byTeam[bowlingTeam].add(b.name));
  }
  return Object.fromEntries(
    Object.entries(byTeam).map(([t, s]) => [t, Array.from(s).sort()])
  );
}

export default function ScorecardDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { effectivePermissions, activeOrganizationId, currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [scorecard, setScorecard] = useState<MatchScorecard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [isAssignedSelector, setIsAssignedSelector] = useState(false);
  const [selectorAssignments, setSelectorAssignments] = useState<ScorecardSelectorAssignment[]>([]);
  const [availableSelectors, setAvailableSelectors] = useState<UserProfile[]>([]);

  // Derived permissions — defined before useEffects so they can be used as dependencies
  const canEditLinks = effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY] ||
    userProfile?.roles?.includes('admin');

  const handleDelete = async () => {
    if (!scorecard || !activeOrganizationId) return;
    setIsDeleting(true);
    const res = await deleteScorecardAction(scorecard.id, activeOrganizationId);
    if (res.success) {
      toast({ title: 'Scorecard deleted' });
      router.push('/scorecards');
    } else {
      toast({ title: 'Delete failed', description: res.error, variant: 'destructive' });
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  useEffect(() => {
    if (!params.id) return;
    getScorecardByIdAction(params.id).then(async res => {
      if (res.success && res.scorecard) {
        setScorecard(res.scorecard);
        // Set selector assignments from scorecard
        const assignments = res.scorecard.selectorAssignments || [];
        setSelectorAssignments(assignments);
        // Check if current user is assigned (via game OR directly)
        if (currentUser?.uid) {
          const directlyAssigned = assignments.some((a: ScorecardSelectorAssignment) => a.uid === currentUser.uid);
          if (directlyAssigned) {
            setIsAssignedSelector(true);
          } else if (res.scorecard.linkedGameId) {
            const { getGameByIdFromDB } = await import('@/lib/db');
            const game = await getGameByIdFromDB(res.scorecard.linkedGameId);
            if (game?.selectorUserIds?.includes(currentUser.uid)) {
              setIsAssignedSelector(true);
            }
          }
        }
      } else {
        setError(res.error || 'Scorecard not found.');
      }
      setIsLoading(false);
    });
  }, [params.id, currentUser?.uid]);

  // Fetch available selectors for assignment panel (admin/org admin/series admin only)
  useEffect(() => {
    if (!activeOrganizationId || !canEditLinks) return;
    import('@/lib/actions/get-eligible-org-admins-action').then(({ getEligibleOrgAdminsAction }) => {
      getEligibleOrgAdminsAction(activeOrganizationId).then(users => {
        // Filter to selectors and series admins
        const selectors = users.filter(u =>
          u.roles?.includes('selector') ||
          u.roles?.includes('Series Admin') ||
          u.roles?.includes('Organization Admin') ||
          u.roles?.includes('admin')
        );
        setAvailableSelectors(selectors);
      });
    });
  }, [activeOrganizationId, canEditLinks]);

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
        <div className="flex gap-2">
          {scorecard.cricClubsUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={scorecard.cricClubsUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> View on CricClubs
              </a>
            </Button>
          )}
          {/* ── Mobile QR for Match Report ── */}
          <Button variant="outline" size="sm" onClick={() => setShowQrDialog(true)}>
            <QrCode className="mr-2 h-4 w-4" /> Match Report QR
          </Button>
          <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" /> Mobile Match Report Link
                </DialogTitle>
                <DialogDescription>
                  This QR code is tied to your account. Only your phone number can unlock it.
                </DialogDescription>
              </DialogHeader>
              {!userProfile?.phoneNumber ? (
                <div className="py-4 space-y-3 text-center">
                  <div className="text-4xl">📵</div>
                  <p className="font-semibold text-sm">No phone number on your profile</p>
                  <p className="text-xs text-muted-foreground">
                    Add your phone number to your profile before using the mobile match report link.
                    This ensures only you can access your link.
                  </p>
                  <Button asChild variant="default" size="sm" className="w-full" onClick={() => setShowQrDialog(false)}>
                    <a href="/profile">Go to Profile → Add Phone Number</a>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="p-4 bg-white rounded-xl border shadow-sm">
                    <QRCodeSVG
                      value={`${typeof window !== 'undefined' ? window.location.origin : 'https://cricket-iq-hub.vercel.app'}/match-report/${scorecard.id}?uid=${currentUser?.uid || ''}`}
                      size={220}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <div className="w-full space-y-1">
                    <p className="text-xs text-muted-foreground text-center break-all">
                      Linked to: <span className="font-medium text-foreground">{userProfile.phoneNumber}</span>
                    </p>
                    <p className="text-xs text-muted-foreground text-center">
                      Only this phone number can access this link
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const url = `${window.location.origin}/match-report/${scorecard.id}?uid=${currentUser?.uid || ''}`;
                      navigator.clipboard.writeText(url);
                      toast({ title: 'Link copied!', description: 'Share this link only with the assigned selector.' });
                    }}
                  >
                    Copy Link
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Scorecard</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the scorecard for <strong>{scorecard.team1} vs {scorecard.team2}</strong>?
                  Players who only appear on this scorecard will also be removed. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  {isDeleting ? 'Deleting...' : 'Delete Scorecard'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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

          {/* Selector assignment — admin/series admin only */}
          {canEditLinks && (
            <div className="mt-3">
              <ScorecardSelectorAssignmentPanel
                scorecardId={scorecard.id}
                team1={scorecard.team1}
                team2={scorecard.team2}
                assignments={selectorAssignments}
                availableSelectors={availableSelectors}
                onAssignmentsChanged={setSelectorAssignments}
              />
            </div>
          )}
        </CardHeader>
      </Card>

      {scorecard.innings.length === 1 ? (
        <Tabs defaultValue="innings1">
          <TabsList className="w-full">
            <TabsTrigger value="innings1" className="flex-1">{scorecard.innings[0].battingTeam} innings</TabsTrigger>
            <TabsTrigger value="performance" className="flex-1">Performance</TabsTrigger>
            <TabsTrigger value="report" className="flex-1 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Match Report
            </TabsTrigger>
            <TabsTrigger value="links" className="flex-1 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Player Links
            </TabsTrigger>
          </TabsList>
          <TabsContent value="innings1" className="mt-4">
            <InningsView innings={scorecard.innings[0]} />
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <ScorecardPerformanceTab innings={scorecard.innings} team1={scorecard.team1} team2={scorecard.team2} seriesId={scorecard.seriesId} gameId={scorecard.linkedGameId} scorecardId={scorecard.id} />
          </TabsContent>
          <TabsContent value="report" className="mt-4">
            <MatchReportTab
              gameId={scorecard.linkedGameId || scorecard.id}
              scorecardId={scorecard.id}
              organizationId={scorecard.organizationId}
              seriesId={scorecard.seriesId}
              team1={scorecard.team1}
              team2={scorecard.team2}
              playersByTeam={buildPlayersByTeam(scorecard)}
              isAssignedSelector={isAssignedSelector}
              scorecardMode={true}
            />
          </TabsContent>
          <TabsContent value="links" className="mt-4">
            <PlayerLinkTab
              scorecardId={scorecard.id}
              organizationId={scorecard.organizationId}
              canEdit={canEditLinks}
            />
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
            <TabsTrigger value="report" className="flex-1 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Match Report
            </TabsTrigger>
            <TabsTrigger value="links" className="flex-1 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Player Links
            </TabsTrigger>
          </TabsList>
          {scorecard.innings.map((inn, i) => (
            <TabsContent key={i} value={`innings${i + 1}`} className="mt-4">
              <InningsView innings={inn} />
            </TabsContent>
          ))}
          <TabsContent value="performance" className="mt-4">
            <ScorecardPerformanceTab innings={scorecard.innings} team1={scorecard.team1} team2={scorecard.team2} seriesId={scorecard.seriesId} gameId={scorecard.linkedGameId} scorecardId={scorecard.id} />
          </TabsContent>
          <TabsContent value="report" className="mt-4">
            <MatchReportTab
              gameId={scorecard.linkedGameId || scorecard.id}
              scorecardId={scorecard.id}
              organizationId={scorecard.organizationId}
              seriesId={scorecard.seriesId}
              team1={scorecard.team1}
              team2={scorecard.team2}
              playersByTeam={buildPlayersByTeam(scorecard)}
              isAssignedSelector={isAssignedSelector}
              scorecardMode={true}
            />
          </TabsContent>
          <TabsContent value="links" className="mt-4">
            <PlayerLinkTab
              scorecardId={scorecard.id}
              organizationId={scorecard.organizationId}
              canEdit={canEditLinks}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
