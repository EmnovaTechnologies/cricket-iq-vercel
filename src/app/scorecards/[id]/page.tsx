'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardByIdAction, deleteScorecardAction } from '@/lib/actions/scorecard-actions';
import { getMatchReportsForScorecardAction } from '@/lib/actions/match-report-actions';
import { ScorecardSelectorAssignmentPanel } from '@/components/scorecards/scorecard-selector-assignment';
import type { MatchScorecard, ScorecardSelectorAssignment, UserProfile } from '@/types';
import { ScorecardPerformanceTab } from '@/components/scorecards/scorecard-performance-tab';
import { MatchReportTab } from '@/components/match-report-tab';
import { PlayerLinkTab } from '@/components/scorecards/player-link-tab';
import { InningsView, buildPlayersByTeam } from '@/components/scorecards/innings-view';
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


export default function ScorecardDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { effectivePermissions, activeOrganizationId, activeOrganizationDetails, currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [scorecard, setScorecard] = useState<MatchScorecard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasMatchReports, setHasMatchReports] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [isAssignedSelector, setIsAssignedSelector] = useState(false);
  const [selectorAssignments, setSelectorAssignments] = useState<ScorecardSelectorAssignment[]>([]);
  const [availableSelectors, setAvailableSelectors] = useState<UserProfile[]>([]);

  // Derived permissions — defined before useEffects so they can be used as dependencies
  const canEditLinks = effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY] ||
    userProfile?.roles?.includes('admin');

  const canDelete = effectivePermissions[PERMISSIONS.SCORECARDS_DELETE] ||
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
        // Check if match reports exist (to disable delete)
        getMatchReportsForScorecardAction(res.scorecard.id).then(rRes => {
          if (rRes.success) setHasMatchReports((rRes.reports?.length ?? 0) > 0);
        });
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

  // Fetch available selectors — same logic as game details page
  useEffect(() => {
    if (!activeOrganizationId || !canEditLinks) return;
    import('@/lib/actions/user-actions').then(({ getPotentialSelectorsForOrg }) => {
      getPotentialSelectorsForOrg(activeOrganizationId).then(users => {
        // Exclude super admins (same filter as game details page)
        setAvailableSelectors(users.filter(u => !u.roles?.includes('admin')));
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
            {canDelete && (
              hasMatchReports ? (
                <span className="relative group cursor-not-allowed">
                  <Button variant="outline" size="sm" className="border-destructive text-destructive opacity-50 pointer-events-none" disabled>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-50">
                    Match reports exist
                  </span>
                </span>
              ) : (
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </DialogTrigger>
              )
            )}
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
              selectorAssignments={selectorAssignments}
              selectorReportScope={activeOrganizationDetails?.selectorReportScope}
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
              selectorAssignments={selectorAssignments}
              selectorReportScope={activeOrganizationDetails?.selectorReportScope}
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
