'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RatingFormEnhanced } from '@/components/rating-form-enhanced';
import { getGameByIdFromDB, getPlayerByIdFromDB, getRatingsForGameFromDB } from '@/lib/db';
import type { Game, PlayerRating, PlayerInGameDetails, UserProfile, PermissionKey } from '@/types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, parseISO, startOfDay } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, Users, UserCog, ArrowLeft, Edit, CheckCircle, Clock, ShieldAlert, Users2, Loader2, CalendarX, QrCode } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getUserProfile } from '@/lib/user-actions';
import { Badge } from '@/components/ui/badge';
import { finalizeGameRatingsAction, certifyRatingsAction, adminForceFinalizeGameRatingsAction } from '@/lib/actions/game-actions';
import { useToast } from '@/hooks/use-toast';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';

function RateGameEnhancedContent() {
  const params = useParams<{ id: string }>();
  const searchParamsHook = useSearchParams();
  const router = useRouter();
  const gameId = params.id;
  const { userProfile: currentUserProfile, isAuthLoading, effectivePermissions } = useAuth();
  const { toast } = useToast();

  const [game, setGame] = useState<Game | undefined>(undefined);
  const [initialRatings, setInitialRatings] = useState<PlayerRating[]>([]);
  const [playersInGame, setPlayersInGame] = useState<PlayerInGameDetails[]>([]);
  const [formattedGameDate, setFormattedGameDate] = useState<string | null>(null);
  const [isFutureGame, setIsFutureGame] = useState(false);
  const [gameSelectorsFullProfiles, setGameSelectorsFullProfiles] = useState<UserProfile[]>([]);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [canAdminForceFinalizeThisGame, setCanAdminForceFinalizeThisGame] = useState(false);
  const [isAttemptingAutoFinalize, setIsAttemptingAutoFinalize] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);

  const navigationSource = searchParamsHook.get('from');

  const triggerPageRefresh = () => setRefreshTrigger(prev => prev + 1);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingPageData(true);
      let fetchedGame: Game | undefined;
      if (gameId) {
        fetchedGame = await getGameByIdFromDB(gameId);
        setGame(fetchedGame);
        if (fetchedGame) {
          try {
            const gameDateObj = parseISO(fetchedGame.date);
            setFormattedGameDate(format(gameDateObj, 'PPP'));
            setIsFutureGame(startOfDay(gameDateObj) > startOfDay(new Date()));
          } catch (e) {
            console.error("Error formatting game date:", e);
            setFormattedGameDate("Invalid date");
            setIsFutureGame(false);
          }

          setInitialRatings(await getRatingsForGameFromDB(gameId));

          const loadedPlayers: PlayerInGameDetails[] = [];
          const team1PlayerIds = fetchedGame.team1Players || [];
          const team2PlayerIds = fetchedGame.team2Players || [];

          for (const playerId of team1PlayerIds) {
            const player = await getPlayerByIdFromDB(playerId);
            if (player) loadedPlayers.push({ ...player, teamName: fetchedGame.team1 });
          }
          for (const playerId of team2PlayerIds) {
            const player = await getPlayerByIdFromDB(playerId);
            if (player) loadedPlayers.push({ ...player, teamName: fetchedGame.team2 });
          }

          loadedPlayers.sort((a, b) => {
            if (a.teamName < b.teamName) return -1;
            if (a.teamName > b.teamName) return 1;
            return a.name.localeCompare(b.name);
          });
          setPlayersInGame(loadedPlayers);

          if (fetchedGame.selectorUserIds && fetchedGame.selectorUserIds.length > 0) {
            const selectorProfiles = (await Promise.all(
              fetchedGame.selectorUserIds.map(uid => getUserProfile(uid))
            )).filter(Boolean) as UserProfile[];
            setGameSelectorsFullProfiles(selectorProfiles);
          } else {
            setGameSelectorsFullProfiles([]);
          }

          setCanAdminForceFinalizeThisGame(!!effectivePermissions[PERMISSIONS.GAMES_ADMIN_FORCE_FINALIZE_ANY]);
        } else {
          setFormattedGameDate(null);
          setIsFutureGame(false);
          setInitialRatings([]);
          setPlayersInGame([]);
          setGameSelectorsFullProfiles([]);
          setCanAdminForceFinalizeThisGame(false);
        }
      }
      setIsLoadingPageData(false);

      if (fetchedGame && !fetchedGame.ratingsFinalized && currentUserProfile?.uid && !(startOfDay(parseISO(fetchedGame.date)) > startOfDay(new Date()))) {
        if (isAttemptingAutoFinalize) return;
        const assignedSelectors = fetchedGame.selectorUserIds || [];
        const certifications = fetchedGame.selectorCertifications || {};
        const lastModified = fetchedGame.ratingsLastModifiedAt ? new Date(fetchedGame.ratingsLastModifiedAt) : null;
        let allCertifiedAndCurrent = assignedSelectors.length > 0;

        if (assignedSelectors.length === 0) {
          allCertifiedAndCurrent = false;
        } else {
          for (const selectorId of assignedSelectors) {
            const certData = certifications[selectorId];
            const isCertified = certData?.status === 'certified';
            const certifiedAt = certData?.certifiedAt ? new Date(certData.certifiedAt) : null;
            const isCurrent = certifiedAt && (!lastModified || certifiedAt >= lastModified);
            if (!isCertified || !isCurrent) { allCertifiedAndCurrent = false; break; }
          }
        }

        if (allCertifiedAndCurrent) {
          setIsAttemptingAutoFinalize(true);
          toast({ title: "Auto-Finalizing Ratings", description: "All selectors have certified. Finalizing ratings..." });
          finalizeGameRatingsAction(fetchedGame.id, currentUserProfile.uid)
            .then(result => {
              if (result.success) {
                toast({ title: "Ratings Auto-Finalized", description: result.message });
                triggerPageRefresh();
              } else {
                toast({ title: "Auto-Finalization Failed", description: result.error, variant: "destructive" });
              }
            })
            .catch(err => {
              console.error("Error during auto-finalization call:", err);
              toast({ title: "Auto-Finalization Error", description: "An unexpected error occurred.", variant: "destructive" });
            })
            .finally(() => setIsAttemptingAutoFinalize(false));
        }
      }
    };

    if (!isAuthLoading) fetchData();
  }, [gameId, isAuthLoading, refreshTrigger, currentUserProfile, toast, effectivePermissions]);

  if (isAuthLoading || isLoadingPageData) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading page data...</p>
      </div>
    );
  }

  if (!game) return <p className="text-center text-muted-foreground py-10">Game not found.</p>;

  const canRateThisGame = effectivePermissions[PERMISSIONS.GAMES_RATE_ANY] || (effectivePermissions[PERMISSIONS.GAMES_RATE_ASSIGNED] && game.selectorUserIds?.includes(currentUserProfile?.uid || ''));

  const getCertificationProgress = () => {
    if (!game) return { text: "Game data not loaded.", certifiedCount: 0, totalSelectors: 0, readyToFinalize: false };
    if (game.ratingsFinalized) return { text: "Ratings for this game are finalized.", certifiedCount: game.selectorUserIds?.length || 0, totalSelectors: game.selectorUserIds?.length || 0, readyToFinalize: false };
    if (!game.selectorUserIds || game.selectorUserIds.length === 0) return { text: "No selectors assigned to this game.", certifiedCount: 0, totalSelectors: 0, readyToFinalize: false };

    const totalSelectors = game.selectorUserIds.length;
    let certifiedCount = 0;
    for (const selectorId of game.selectorUserIds) {
      const certData = game.selectorCertifications?.[selectorId];
      if (certData?.status === 'certified') {
        const isCurrent = !game.ratingsLastModifiedAt || !certData.certifiedAt || new Date(certData.certifiedAt) >= new Date(game.ratingsLastModifiedAt);
        if (isCurrent) certifiedCount++;
      }
    }
    const readyToFinalize = certifiedCount === totalSelectors;
    let text = "";
    if (readyToFinalize && certifiedCount > 0) text = `All ${totalSelectors} selectors have certified the current ratings. Ready to finalize.`;
    else if (totalSelectors > 0 && certifiedCount === 0) text = "No selectors have certified the current ratings yet.";
    else if (totalSelectors > 0) text = `Certification Progress: ${certifiedCount} of ${totalSelectors} selectors have certified the current ratings.`;
    else text = "Certification status unknown.";
    return { text, certifiedCount, totalSelectors, readyToFinalize };
  };

  const certificationProgress = getCertificationProgress();
  const showBackToListButton = navigationSource === 'game-list';

  const renderHeaderContent = () => (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start mb-2">
        <div className="flex-1">
          <CardTitle className="text-xl sm:text-2xl font-headline text-primary flex items-center gap-2">
            <Edit className="h-5 w-5" /> Rate Player Performance
          </CardTitle>
          <CardDescription>
            Game: {game.team1} vs {game.team2} on {formattedGameDate || 'Loading date...'} at {game.venue}.
          </CardDescription>
        </div>
        <div className="mt-2 sm:mt-0 flex flex-col sm:flex-row gap-2">
          {showBackToListButton && (
            <Button asChild variant="outline" size="sm">
              <Link href="/games"><ArrowLeft className="mr-2 h-4 w-4" />Back to List</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/games/${gameId}/details`}><ArrowLeft className="mr-2 h-4 w-4" />Game Details</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowQrDialog(true)}>
            <QrCode className="mr-2 h-4 w-4" />Mobile QR
          </Button>
        </div>

        {/* QR Code Dialog */}
        <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" /> Your Mobile Rating Link
              </DialogTitle>
              <DialogDescription>
                This QR code is tied to your account. Only your phone number can unlock it.
              </DialogDescription>
            </DialogHeader>

            {!currentUserProfile?.phoneNumber ? (
              <div className="py-4 space-y-3 text-center">
                <div className="text-4xl">📵</div>
                <p className="font-semibold text-sm">No phone number on your profile</p>
                <p className="text-xs text-muted-foreground">
                  You need to add your phone number to your profile before you can use the mobile rating page. This ensures only you can access your rating link.
                </p>
                <Button asChild variant="default" size="sm" className="w-full" onClick={() => setShowQrDialog(false)}>
                  <Link href="/profile">Go to Profile → Add Phone Number</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="p-4 bg-white rounded-xl border shadow-sm">
                  <QRCodeSVG
                    value={`${typeof window !== 'undefined' ? window.location.origin : 'https://cricket-iq-vercel.vercel.app'}/rate/${gameId}?uid=${currentUserProfile.uid}`}
                    size={220}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="w-full space-y-1">
                  <p className="text-xs text-muted-foreground text-center break-all">
                    Linked to: <span className="font-medium text-foreground">{currentUserProfile.phoneNumber}</span>
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
                    const url = `${window.location.origin}/rate/${gameId}?uid=${currentUserProfile.uid}`;
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
      </div>

      {gameSelectorsFullProfiles.length > 0 && (
        <div className="pt-3 mt-3 border-t">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
            <UserCog className="h-4 w-4" /> Assigned Selectors & Certification Status:
          </h4>
          <ul className="text-xs text-foreground space-y-1">
            {gameSelectorsFullProfiles.map(s => {
              const certification = game.selectorCertifications?.[s.uid];
              let displayStatus = certification?.status || 'pending';
              let isCertificationCurrent = false;
              if (certification?.status === 'certified') {
                isCertificationCurrent = !game.ratingsLastModifiedAt || !certification.certifiedAt || new Date(certification.certifiedAt) >= new Date(game.ratingsLastModifiedAt);
                if (!isCertificationCurrent) displayStatus = 'pending';
              }
              const certifiedDate = certification?.certifiedAt ? format(parseISO(certification.certifiedAt), 'Pp') : null;
              return (
                <li key={s.uid} className="flex items-center gap-2">
                  {s.displayName || s.email}
                  <Badge variant={displayStatus === 'certified' ? 'default' : 'secondary'} className={displayStatus === 'certified' ? 'bg-green-600 hover:bg-green-700' : ''}>
                    {displayStatus === 'certified' ? <CheckCircle className="h-3 w-3 mr-1"/> : <Clock className="h-3 w-3 mr-1"/>}
                    {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
                    {displayStatus === 'pending' && certification?.status === 'certified' && !isCertificationCurrent && <span className="ml-1 text-xs">(Needs Re-certify)</span>}
                  </Badge>
                  {displayStatus === 'certified' && certifiedDate && <span className="text-muted-foreground text-xs">({certifiedDate})</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="pt-3 mt-3 border-t">
        <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
          <Users2 className="h-4 w-4" /> Overall Certification:
        </h4>
        <p className={`text-sm ${certificationProgress.readyToFinalize && !game.ratingsFinalized && certificationProgress.totalSelectors > 0 ? 'text-green-600 font-semibold' : 'text-foreground'}`}>
          {certificationProgress.text}
        </p>
      </div>

      {game.ratingsLastModifiedAt && (
        <div className="pt-2 mt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Ratings last saved: {format(parseISO(game.ratingsLastModifiedAt), 'Pp')}
            {game.ratingsLastModifiedBy && ` by ${gameSelectorsFullProfiles.find(s => s.uid === game.ratingsLastModifiedBy)?.displayName || game.ratingsLastModifiedBy.substring(0,6)}.`}
          </p>
        </div>
      )}
      {game.ratingsFinalized && (
        <Alert variant="default" className="mt-4 border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          <AlertTitle className="font-semibold">Ratings Finalized</AlertTitle>
          <AlertDescription>The ratings for this game have been finalized and are now read-only.</AlertDescription>
        </Alert>
      )}
      {isFutureGame && !game.ratingsFinalized && (
        <Alert variant="default" className="mt-4 border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300">
          <CalendarX className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold">Future Game</AlertTitle>
          <AlertDescription>This game is scheduled for a future date. Ratings cannot be submitted or modified until the game has been played. The form below is read-only.</AlertDescription>
        </Alert>
      )}
    </>
  );

  if (playersInGame.length === 0 && game.team1Players?.length === 0 && game.team2Players?.length === 0) {
    return (
      <div className="space-y-8">
        <Card><CardHeader>{renderHeaderContent()}</CardHeader></Card>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>No Players to Rate</AlertTitle>
          <AlertDescription>There are no players assigned to this game, or player data could not be loaded. Please ensure players are correctly assigned.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!canRateThisGame && !game.ratingsFinalized && !isFutureGame) {
    return (
      <div className="space-y-8">
        <Card><CardHeader>{renderHeaderContent()}</CardHeader></Card>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to rate players for this game.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card><CardHeader>{renderHeaderContent()}</CardHeader></Card>
      {playersInGame.length > 0 ? (
        <RatingFormEnhanced
          game={game}
          players={playersInGame}
          initialRatings={initialRatings}
          team1NameFromGame={game.team1}
          team2NameFromGame={game.team2}
          currentUserProfile={currentUserProfile}
          gameSelectorsFullProfiles={gameSelectorsFullProfiles}
          onRatingsUpdated={triggerPageRefresh}
          canAdminForceFinalize={canAdminForceFinalizeThisGame}
          isFutureGame={isFutureGame}
          effectivePermissions={effectivePermissions}
        />
      ) : (
        <Alert>
          <Users className="h-4 w-4" />
          <AlertTitle>No Players Loaded</AlertTitle>
          <AlertDescription>No players were found for this game based on the game's roster.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default function RateGameEnhancedPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading page data...</p>
      </div>
    }>
      <RateGameEnhancedContent />
    </Suspense>
  );
}
