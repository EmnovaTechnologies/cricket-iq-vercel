'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { checkOrgAccess, ORG_MISMATCH_ERROR } from '@/lib/utils/org-guard';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardByIdAction, deleteScorecardAction, linkScorecardToGameAction, unlinkScorecardFromGameAction, getUnlinkedGamesForSeriesAction } from '@/lib/actions/scorecard-actions';
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
import { ArrowLeft, Loader2, ShieldAlert, Table, CalendarFold, MapPin, ExternalLink, Trash2, FileText, QrCode, Link2, Link2Off, Search } from 'lucide-react';
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

  // Link to game state
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [unlinkedGames, setUnlinkedGames] = useState<{ id: string; team1: string; team2: string; date: string }[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [linkedGameName, setLinkedGameName] = useState<string | null>(null);
  const [gameSearchQuery, setGameSearchQuery] = useState('');

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

  const openLinkDialog = async () => {
    if (!scorecard?.seriesId || !activeOrganizationId) {
      toast({ title: 'Cannot link', description: 'This scorecard must be associated with a series before linking to a game.', variant: 'destructive' });
      return;
    }
    setIsLoadingGames(true);
    setGameSearchQuery('');
    setShowLinkDialog(true);
    const res = await getUnlinkedGamesForSeriesAction(activeOrganizationId, scorecard.seriesId);
    setUnlinkedGames(res.games);
    setIsLoadingGames(false);
  };

  const handleLinkToGame = async (gameId: string, gameName: string) => {
    if (!scorecard) return;
    setIsLinking(true);
    const res = await linkScorecardToGameAction(scorecard.id, gameId);
    if (res.success) {
      setScorecard(prev => prev ? { ...prev, linkedGameId: gameId } : prev);
      setLinkedGameName(gameName);
      setShowLinkDialog(false);
      toast({ title: 'Linked', description: `Scorecard linked to ${gameName}.` });
    } else {
      toast({ title: 'Link failed', description: res.error, variant: 'destructive' });
    }
    setIsLinking(false);
  };

  const handleUnlinkFromGame = async () => {
    if (!scorecard?.linkedGameId) return;
    setIsUnlinking(true);
    const res = await unlinkScorecardFromGameAction(scorecard.id, scorecard.linkedGameId);
    if (res.success) {
      setScorecard(prev => prev ? { ...prev, linkedGameId: undefined } : prev);
      setLinkedGameName(null);
      toast({ title: 'Unlinked', description: 'Scorecard unlinked from game.' });
    } else {
      toast({ title: 'Unlink failed', description: res.error, variant: 'destructive' });
    }
    setIsUnlinking(false);
  };

  useEffect(() => {
    if (!params.id || !activeOrganizationId) return;
    getScorecardByIdAction(params.id).then(async res => {
      if (res.success && res.scorecard) {
        // Org guard — prevent cross-org access
        if (!checkOrgAccess(res.scorecard.organizationId, activeOrganizationId)) {
          setError(ORG_MISMATCH_ERROR);
          return;
        }
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
  }, [params.id, currentUser?.uid, activeOrganizationId]);

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

          {/* ── Link / Unlink Game ── */}
          {canEditLinks && (
            scorecard.linkedGameId ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnlinkFromGame}
                disabled={isUnlinking}
                className="border-amber-400 text-amber-700 hover:bg-amber-50"
              >
                {isUnlinking
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Link2Off className="mr-2 h-4 w-4" />}
                Unlink Game
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={openLinkDialog}>
                <Link2 className="mr-2 h-4 w-4" /> Link to Game
              </Button>
            )
          )}

          {/* Link to Game Dialog */}
          <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-primary" /> Link to Game
                </DialogTitle>
                <DialogDescription>
                  Select a game from the same series to link this scorecard to. Only unlinked games are shown.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
                    placeholder="Search teams or date..."
                    value={gameSearchQuery}
                    onChange={e => setGameSearchQuery(e.target.value)}
                  />
                </div>
                {isLoadingGames ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : unlinkedGames.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No unlinked games found in this series.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                    {unlinkedGames
                      .filter(g => {
                        const q = gameSearchQuery.toLowerCase();
                        return !q || g.team1.toLowerCase().includes(q) || g.team2.toLowerCase().includes(q) || g.date.includes(q);
                      })
                      .map(g => (
                        <button
                          key={g.id}
                          onClick={() => handleLinkToGame(g.id, `${g.team1} vs ${g.team2}`)}
                          disabled={isLinking}
                          className="w-full text-left px-3 py-2.5 rounded-lg border hover:bg-primary/5 hover:border-primary transition-colors text-sm"
                        >
                          <span className="font-medium">{g.team1} vs {g.team2}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{g.date}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Cancel</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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

          {/* Linked game indicator */}
          {scorecard.linkedGameId ? (
            <div className="flex items-center gap-2 mt-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span>Linked to game</span>
              {linkedGameName && <span className="font-medium">{linkedGameName}</span>}
              <Link href={`/games/${scorecard.linkedGameId}/details`} className="ml-auto underline hover:text-green-900 shrink-0">
                View Game
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <Link2Off className="h-3.5 w-3.5 shrink-0" />
              <span>Not linked to a game.</span>
              {canEditLinks && (
                <button onClick={openLinkDialog} className="ml-auto underline hover:text-amber-900 shrink-0">
                  Link now
                </button>
              )}
            </div>
          )}

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
                ratingScope={activeOrganizationDetails?.ratingScope}
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
              availableSelectors={availableSelectors}
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
              availableSelectors={availableSelectors}
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
