
'use client';

import { getGameByIdFromDB, getPlayerByIdFromDB, getPlayersAvailableForGameFromDB, getSeriesByIdFromDB, getTeamByIdFromDB, getTeamsForSeriesFromDB, getPlayersFromIds, isPlayerAgeEligibleForSeriesFromDB, getRatingsForGameFromDB, ratingValueToNumber, getUserProfileFromDB } from '@/lib/db'; // Firestore functions
import type { Game, Player, PlayerRating, Series, UserProfile, RatingValue, PermissionKey } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { CalendarDays, MapPin, Users, ArrowLeft, Layers, UserSquare2, UserPlus, CheckSquare, Square, Edit3, UserCog, Save, Check, ChevronsUpDown, Loader2, ExternalLink, Link2, Share2, CheckCheck, Table } from 'lucide-react';
import { format, parseISO, startOfDay } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { addPlayerToGameRosterAction, updatePlayerGameInclusionAction, updateGameSelectorsAction } from '@/lib/actions/game-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { getPotentialSelectorsForOrg } from '@/lib/actions/user-actions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'; // Added Popover
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { CricketBatIcon, LayersIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';


// Temporary interface for player with game-specific ratings
interface PlayerWithGameRatings extends Player {
  gameRatings?: Omit<PlayerRating, 'id' | 'gameId' | 'playerId'>;
}

const playerHasConcreteRatingsForGame = (playerGameRatings?: Omit<PlayerRating, 'id' | 'gameId' | 'playerId'>): boolean => {
  if (!playerGameRatings) return false;
  const concreteRatingValues: Partial<RatingValue>[] = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0'];
  return concreteRatingValues.includes(playerGameRatings.batting) ||
         concreteRatingValues.includes(playerGameRatings.bowling) ||
         concreteRatingValues.includes(playerGameRatings.fielding) ||
         concreteRatingValues.includes(playerGameRatings.wicketKeeping);
};


export default function GameDetailsPage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const router = useRouter();
  const { toast } = useToast();
  const { userProfile: currentAuthProfile, effectivePermissions, isPermissionsLoading } = useAuth();

  const [game, setGame] = useState<Game | undefined>(undefined);
  const [series, setSeries] = useState<Series | undefined>(undefined);
  const [formattedGameDate, setFormattedGameDate] = useState<string | null>(null);
  const [isFutureGame, setIsFutureGame] = useState(false);

  const [potentialTeam1Players, setPotentialTeam1Players] = useState<PlayerWithGameRatings[]>([]);
  const [potentialTeam2Players, setPotentialTeam2Players] = useState<PlayerWithGameRatings[]>([]);

  const [availablePlayersForGame, setAvailablePlayersForGame] = useState<Player[]>([]);
  const [selectedPlayerToAddTeam1, setSelectedPlayerToAddTeam1] = useState<string>('');
  const [selectedPlayerToAddTeam2, setSelectedPlayerToAddTeam2] = useState<string>('');
  const [isUpdatingRoster, setIsUpdatingRoster] = useState(false);

  const [isComboboxOpenTeam1, setIsComboboxOpenTeam1] = useState(false); // State for Team 1 combobox
  const [isComboboxOpenTeam2, setIsComboboxOpenTeam2] = useState(false); // State for Team 2 combobox

  const [gameSelectors, setGameSelectors] = useState<UserProfile[]>([]);
  const [isEditingSelectors, setIsEditingSelectors] = useState(false);
  const [potentialGameSelectorsToAssign, setPotentialGameSelectorsToAssign] = useState<UserProfile[]>([]);
  const [selectedSelectorUidsForUpdate, setSelectedSelectorUidsForUpdate] = useState<string[]>([]);
  const [isLoadingGameSelectors, setIsLoadingGameSelectors] = useState(false);
  const [isLoadingPageData, setIsLoadingPageData] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [gameUrl, setGameUrl] = useState('');
  const [isSavingGameUrl, setIsSavingGameUrl] = useState(false);

  const handleShareLink = () => {
    const url = `${window.location.origin}/rate/${gameId}`;
    if (navigator.share) {
      navigator.share({ title: `Rate players: ${game?.team1} vs ${game?.team2}`, url });
    } else {
      navigator.clipboard.writeText(url);
      setLinkCopied(true);
      toast({ title: 'Link copied!', description: 'Share this link with your selectors.' });
      setTimeout(() => setLinkCopied(false), 3000);
    }
  };

  const handleSaveGameUrl = async () => {
    if (!gameId) return;
    setIsSavingGameUrl(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      await updateDoc(doc(db, 'games', gameId), { externalScoreUrl: gameUrl.trim() });
      toast({ title: 'Scorecard URL saved!', description: 'The external scorecard link has been saved.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Could not save URL.', variant: 'destructive' });
    } finally {
      setIsSavingGameUrl(false);
    }
  };


  const allPlayersOnPage = useMemo(() => {
    const all = new Map<string, PlayerWithGameRatings>();
    potentialTeam1Players.forEach(p => all.set(p.id, p));
    potentialTeam2Players.forEach(p => all.set(p.id, p));
    availablePlayersForGame.forEach(p => {
      if (!all.has(p.id)) {
        all.set(p.id, p as PlayerWithGameRatings);
      }
    });
    return Array.from(all.values());
  }, [potentialTeam1Players, potentialTeam2Players, availablePlayersForGame]);

  const team1DropdownPlayers = useMemo(() => {
    if (!game || !series) return [];
    return availablePlayersForGame.filter(ap =>
      !potentialTeam1Players.some(pt1 => pt1.id === ap.id) &&
      !potentialTeam2Players.some(pt2 => pt2.id === ap.id) // Also ensure not on team 2 if trying to add to team 1
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [availablePlayersForGame, potentialTeam1Players, potentialTeam2Players, game, series]);

  const team2DropdownPlayers = useMemo(() => {
    if (!game || !series) return [];
    return availablePlayersForGame.filter(ap =>
      !potentialTeam2Players.some(pt2 => pt2.id === ap.id) &&
      !potentialTeam1Players.some(pt1 => pt1.id === ap.id) // Also ensure not on team 1 if trying to add to team 2
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [availablePlayersForGame, potentialTeam1Players, potentialTeam2Players, game, series]);


  const refreshGameAndPlayerData = async () => {
    if (!gameId) return;

    setIsLoadingPageData(true);
    
    try {
      const fetchedGame = await getGameByIdFromDB(gameId);
      setGame(fetchedGame);
      if (fetchedGame) setGameUrl((fetchedGame as any).externalScoreUrl || '');

      if (fetchedGame) {
          try {
              const gameDateObj = parseISO(fetchedGame.date);
              setFormattedGameDate(format(gameDateObj, 'PPP'));
              setIsFutureGame(startOfDay(gameDateObj) > startOfDay(new Date()));
          } catch (e) {
              setFormattedGameDate("Invalid date"); setIsFutureGame(false);
          }
          
          const currentSeries = fetchedGame.seriesId ? await getSeriesByIdFromDB(fetchedGame.seriesId) : undefined;
          setSeries(currentSeries);

          const gameSpecificRatingsRaw = await getRatingsForGameFromDB(gameId);
          const gameSpecificRatingsMap = new Map<string, Omit<PlayerRating, 'id' | 'gameId' | 'playerId'>>();
          gameSpecificRatingsRaw.forEach(r => { const { id, gameId: gId, playerId: pId, ...rest } = r; gameSpecificRatingsMap.set(pId, rest); });
          
          const processTeamRoster = async ( teamName: string | undefined, gameTeamPlayersIdsFromGameDoc: string[] | undefined ): Promise<PlayerWithGameRatings[]> => {
              if (!currentSeries || !teamName) return [];
              const teamsInSeries = await getTeamsForSeriesFromDB(currentSeries.id);
              const teamDoc = teamsInSeries.find(t => t.name === teamName);
              const clubPlayerIdsFromDB: string[] = teamDoc?.playerIds || [];
              const gameSpecificPlayerIds: string[] = gameTeamPlayersIdsFromGameDoc || [];
              const allConsideredPlayerIds = Array.from(new Set([...clubPlayerIdsFromDB, ...gameSpecificPlayerIds]));
              if (allConsideredPlayerIds.length === 0) return [];
              const allConsideredPlayerDetails = await getPlayersFromIds(allConsideredPlayerIds);
              const finalRosterPlayers: PlayerWithGameRatings[] = []; const includedPlayerIds = new Set<string>();
              for (const player of allConsideredPlayerDetails) {
                  if (!player) continue;
                  const playerWithRatings: PlayerWithGameRatings = { ...player, gameRatings: gameSpecificRatingsMap.get(player.id) };
                  if (gameSpecificPlayerIds.includes(player.id)) { if (!includedPlayerIds.has(player.id)) { finalRosterPlayers.push(playerWithRatings); includedPlayerIds.add(player.id); } }
                  else if (clubPlayerIdsFromDB.includes(player.id)) {
                      if (!player.dateOfBirth || !player.gender) continue;
                      const isEligible = isPlayerAgeEligibleForSeriesFromDB(player, currentSeries);
                      if (isEligible && !includedPlayerIds.has(player.id)) { finalRosterPlayers.push(playerWithRatings); includedPlayerIds.add(player.id); }
                  }
              }
              return finalRosterPlayers.sort((a, b) => a.name.localeCompare(b.name));
          };
          setPotentialTeam1Players(await processTeamRoster(fetchedGame.team1, fetchedGame.team1Players));
          setPotentialTeam2Players(await processTeamRoster(fetchedGame.team2, fetchedGame.team2Players));
          
          const availableForDropdown = await getPlayersAvailableForGameFromDB(gameId);
          setAvailablePlayersForGame(availableForDropdown);

          const selectorProfiles: UserProfile[] = [];
          if (fetchedGame.selectorUserIds && fetchedGame.selectorUserIds.length > 0) {
              for (const uid of fetchedGame.selectorUserIds) {
                  const profile = await getUserProfileFromDB(uid); // Using client-side DB function
                  if (profile) {
                      selectorProfiles.push(profile);
                  } else {
                      console.warn(`[GameDetailsPage] Could not find a user profile for selector UID: ${uid}. The user may have been deleted.`);
                  }
              }
          }
          setGameSelectors(selectorProfiles);
          setSelectedSelectorUidsForUpdate(fetchedGame.selectorUserIds || []);

          const canManage = !!effectivePermissions[PERMISSIONS.GAMES_MANAGE_SELECTORS_ANY];
          if (canManage && currentSeries?.organizationId) {
            const selectors = await getPotentialSelectorsForOrg(currentSeries.organizationId);
            setPotentialGameSelectorsToAssign(selectors);
          }
      } else {
        setFormattedGameDate(null); setIsFutureGame(false); setSeries(undefined); setPotentialTeam1Players([]); setPotentialTeam2Players([]); setAvailablePlayersForGame([]); setGameSelectors([]); setSelectedSelectorUidsForUpdate([]);
      }
      setSelectedPlayerToAddTeam1(''); setSelectedPlayerToAddTeam2('');
    } catch (error: any) {
      console.error("[GameDetailsPage] A critical error occurred in refreshGameAndPlayerData:", error);
    } finally {
      setIsLoadingPageData(false);
    }
  };

  useEffect(() => {
    if (!isPermissionsLoading) {
      refreshGameAndPlayerData();
    }
  }, [gameId, currentAuthProfile, isPermissionsLoading]);


  const handlePlayerRosterUpdate = async (playerId: string, teamIdentifier: 'team1' | 'team2', isIncluded: boolean) => {
    if (!gameId || !game) return;
    if (!isIncluded) {
      const teamPlayers = teamIdentifier === 'team1' ? potentialTeam1Players : potentialTeam2Players;
      const playerToUpdate = teamPlayers.find(p => p.id === playerId);
      if (playerToUpdate && playerHasConcreteRatingsForGame(playerToUpdate.gameRatings)) {
        toast({ title: "Cannot Exclude Player", description: `${playerToUpdate.name} has ratings for this game and cannot be removed. Clear ratings first.`, variant: "destructive", duration: 7000 });
        return;
      }
    }
    setIsUpdatingRoster(true); const oldGame = { ...game };
    if (isIncluded) {
      const otherTeamPlayersKey = teamIdentifier === 'team1' ? 'team2Players' : 'team1Players';
      const otherTeamName = teamIdentifier === 'team1' ? game.team2 : game.team1;
      if (game[otherTeamPlayersKey]?.includes(playerId)) {
        const playerName = allPlayersOnPage.find(p => p.id === playerId)?.name || 'Player';
        toast({ title: "Player Already in Other Team", description: `${playerName} is already in ${otherTeamName}'s roster.`, variant: "destructive" });
        setIsUpdatingRoster(false); return;
      }
    }
    const teamPlayersKey = teamIdentifier === 'team1' ? 'team1Players' : 'team2Players';
    let updatedPlayerIds = [...(game[teamPlayersKey] || [])];
    if (isIncluded) { if (!updatedPlayerIds.includes(playerId)) updatedPlayerIds.push(playerId); }
    else { updatedPlayerIds = updatedPlayerIds.filter(id => id !== playerId); }
    setGame(prevGame => prevGame ? { ...prevGame, [teamPlayersKey]: updatedPlayerIds } : undefined);
    const result = await updatePlayerGameInclusionAction(gameId, playerId, teamIdentifier, isIncluded);
    if (result.success) { toast({ title: "Roster Updated", description: result.message }); }
    else { toast({ title: "Error", description: result.message, variant: "destructive" }); setGame(oldGame); }
    await refreshGameAndPlayerData(); setIsUpdatingRoster(false);
  };

  const handleAddPlayerToGameViaDropdown = async (playerId: string, teamIdentifier: 'team1' | 'team2') => {
    if (!gameId || !playerId) { toast({ title: "Error", description: "Game or Player not selected.", variant: "destructive" }); return; }
    setIsUpdatingRoster(true);
    const result = await addPlayerToGameRosterAction(gameId, playerId, teamIdentifier);
    if (result.success) { toast({ title: "Player Added to Game", description: result.message }); await refreshGameAndPlayerData(); }
    else { toast({ title: "Error", description: result.message, variant: "destructive" }); }
    setIsUpdatingRoster(false);
    if (teamIdentifier === 'team1') {setSelectedPlayerToAddTeam1(''); setIsComboboxOpenTeam1(false);} else {setSelectedPlayerToAddTeam2(''); setIsComboboxOpenTeam2(false);}
  };

  const handleSaveGameSelectors = async () => {
    if (!gameId) return; setIsLoadingGameSelectors(true);
    const finalUids = [...new Set([
      ...selectedSelectorUidsForUpdate,
      ...lockedSuperAdmins.map(u => u.uid),
    ])];
    const result = await updateGameSelectorsAction(gameId, finalUids);
    if (result.success) { toast({ title: "Game Selectors Updated", description: result.message }); setIsEditingSelectors(false); await refreshGameAndPlayerData(); }
    else { toast({ title: "Error", description: result.message, variant: "destructive" }); }
    setIsLoadingGameSelectors(false);
  };

  const lockedSuperAdmins = useMemo(() =>
    potentialGameSelectorsToAssign.filter(u => u.roles.includes('admin')),
    [potentialGameSelectorsToAssign]
  );
  const selectableSelectors = useMemo(() =>
    potentialGameSelectorsToAssign.filter(u => !u.roles.includes('admin')),
    [potentialGameSelectorsToAssign]
  );
  if (isLoadingPageData || isPermissionsLoading) { return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />Loading game data...</div>; }

  if (!game) { return <p className="text-center text-muted-foreground">Game not found.</p>; }

  const canManageRoster = !!effectivePermissions[PERMISSIONS.GAMES_MANAGE_ROSTER_ANY];
  const canManageSelectors = !!effectivePermissions[PERMISSIONS.GAMES_MANAGE_SELECTORS_ANY];

  const canRatePlayers = !isFutureGame && (
    !!effectivePermissions[PERMISSIONS.GAMES_RATE_ANY] || 
    (!!effectivePermissions[PERMISSIONS.GAMES_RATE_ASSIGNED] && !!game?.selectorUserIds?.includes(currentAuthProfile?.uid || ''))
  );

  const getSkillIcon = (skill: Player['primarySkill']) => {
    switch (skill) { case 'Batting': return <CricketBatIcon className="h-4 w-4 text-primary" />; case 'Bowling': return <CricketBallIcon className="h-4 w-4 text-primary" />; case 'Wicket Keeping': return <WicketKeeperGloves className="h-4 w-4 text-primary" />; default: return <UserSquare2 className="h-4 w-4 text-primary" />; }
  };

  const renderPlayerTableContent = (playersToList: PlayerWithGameRatings[], teamIdentifier: 'team1' | 'team2') => (
    <div className="overflow-x-auto">
      <Table><TableHeader><TableRow>
            <TableHead className="w-[70px]">Include</TableHead><TableHead>Name</TableHead><TableHead>Primary Skill</TableHead>
            <TableHead className="text-center">Batting Score</TableHead><TableHead className="text-center">Bowling Score</TableHead>
            <TableHead className="text-center">Fielding Score</TableHead><TableHead className="text-center">Wicket keeping Score</TableHead>
      </TableRow></TableHeader><TableBody>
          {playersToList.map((player) => {
            const isPlayerIncluded = teamIdentifier === 'team1' ? game.team1Players?.includes(player.id) ?? false : game.team2Players?.includes(player.id) ?? false;
            const displayRating = (ratingValue?: RatingValue) => { const num = ratingValueToNumber(ratingValue); return num !== null ? num.toFixed(1) : '-'; };
            const hasRatings = playerHasConcreteRatingsForGame(player.gameRatings);
            const checkboxDisabled = isUpdatingRoster || !canManageRoster || (isPlayerIncluded && hasRatings);
            return (<TableRow key={player.id}><TableCell>
                <Checkbox id={`include-${teamIdentifier}-${player.id}`} checked={isPlayerIncluded} onCheckedChange={(checked) => handlePlayerRosterUpdate(player.id, teamIdentifier, !!checked)}
                  disabled={checkboxDisabled} aria-label={`Include ${player.name} in game`} title={isPlayerIncluded && hasRatings ? "Player has ratings and cannot be removed." : (!canManageRoster ? "You don't have permission to manage rosters." : "")} />
              </TableCell><TableCell className="font-medium"><div className="flex items-center gap-2">
                  <Avatar className="h-9 w-9"><AvatarImage src={player.avatarUrl || `https://placehold.co/40x40.png`} alt={player.name} data-ai-hint="player avatar small"/><AvatarFallback>{player.name.substring(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  {player.name}</div>
              </TableCell><TableCell className="flex items-center gap-1 whitespace-nowrap pt-5">{getSkillIcon(player.primarySkill)}{player.primarySkill}</TableCell>
              <TableCell className="text-center">{displayRating(player.gameRatings?.batting)}</TableCell><TableCell className="text-center">{displayRating(player.gameRatings?.bowling)}</TableCell>
              <TableCell className="text-center">{displayRating(player.gameRatings?.fielding)}</TableCell><TableCell className="text-center">{player.primarySkill === 'Wicket Keeping' ? displayRating(player.gameRatings?.wicketKeeping) : '-'}</TableCell>
            </TableRow>);
          })}
      </TableBody></Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-lg"><CardHeader>
          <div className="flex justify-between items-start mb-2">
            <CardTitle className="text-3xl font-headline text-primary">{game.team1} vs {game.team2}</CardTitle>
            <Button asChild variant="outline" size="sm"><Link href="/games"><ArrowLeft className="mr-2 h-4 w-4" />Back to Games</Link></Button>
          </div>
          <CardDescription>Details for the game played on {formattedGameDate || "loading date..."}.</CardDescription>
        </CardHeader><CardContent className="space-y-3">
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-muted-foreground" /><span>{formattedGameDate ? format(parseISO(game.date), 'EEEE, MMMM do, yyyy') : "N/A"}</span></div>
          <div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-muted-foreground" /><span>Venue: {game.venue}</span></div>
          {game.seriesId && series && (<div className="flex items-center gap-2"><LayersIcon className="h-5 w-5 text-muted-foreground" /><span>Series: <Link href={`/series/${game.seriesId}/details`} className="underline text-primary hover:text-primary/80">{series.name}</Link></span></div>)}

          {/* Game URL / Scorecard Link */}
          <div className="pt-2 space-y-1.5">
            <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <Link2 className="h-4 w-4" /> Scorecard URL
            </h4>
            {gameUrl && !canManageSelectors ? (
              <a href={gameUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-primary underline hover:text-primary/80 break-all">
                <ExternalLink className="h-4 w-4 shrink-0" />
                {gameUrl}
              </a>
            ) : canManageSelectors ? (
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="https://cricclubs.com/..."
                  value={gameUrl}
                  onChange={e => setGameUrl(e.target.value)}
                  className="text-sm h-9 flex-1"
                />
                {gameUrl && (
                  <a href={gameUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" type="button" title="Open scorecard">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                )}
                <Button size="sm" onClick={handleSaveGameUrl} disabled={isSavingGameUrl} className="shrink-0">
                  {isSavingGameUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Link href={`/scorecards/import?gameId=${gameId}&url=${encodeURIComponent(gameUrl)}&team1=${encodeURIComponent(game.team1)}&team2=${encodeURIComponent(game.team2)}&date=${encodeURIComponent(game.date)}&venue=${encodeURIComponent(game.venue)}&seriesId=${encodeURIComponent(game.seriesId || '')}&seriesName=${encodeURIComponent(series?.name || '')}`}>
                  <Button size="sm" variant="outline" className="shrink-0 border-primary text-primary hover:bg-primary/10" title="Import scorecard for this game">
                    <Table className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No scorecard URL added.</p>
            )}
          </div>

          <div className="pt-2"><h4 className="text-sm font-semibold text-muted-foreground mb-1">Selectors:</h4>
            {gameSelectors.length > 0 ? (<ul className="list-disc list-inside text-sm text-foreground space-y-0.5">{gameSelectors.map(s => <li key={s.uid}>{s.displayName || s.email}</li>)}</ul>)
            : (<p className="text-sm text-muted-foreground">No selectors assigned.</p>)}
          </div>
        </CardContent>
        {canManageSelectors && !isEditingSelectors && (<CardFooter className="border-t pt-4 flex gap-2 justify-between items-center">
          <Button variant="outline" size="sm" onClick={handleShareLink} className="gap-2">
            {linkCopied ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
            {linkCopied ? 'Link Copied!' : 'Share Rating Link'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsEditingSelectors(true)}><UserCog className="h-4 w-4 mr-2" /> Manage Selectors</Button>
        </CardFooter>)}
      </Card>

      {isEditingSelectors && canManageSelectors && (<Card><CardHeader>
            <CardTitle className="text-xl font-headline text-primary">Manage Game Selectors</CardTitle>
            <CardDescription>Select users with 'selector' or 'Series Admin' role in this organization. Super admins are always included.</CardDescription>
          </CardHeader><CardContent className="space-y-3">
            {/* Locked super admins */}
            {lockedSuperAdmins.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Super Admins (always assigned)</p>
                {lockedSuperAdmins.map(user => (
                  <div key={user.uid} className="flex items-center gap-2 px-2 py-1 rounded opacity-70">
                    <Checkbox checked disabled />
                    <span className="text-sm flex-grow">{user.displayName || user.email}</span>
                    <Badge variant="default" className="text-xs">Super Admin</Badge>
                  </div>
                ))}
              </div>
            )}
            {selectableSelectors.length === 0 ? (<p className="text-muted-foreground text-sm">No users with 'selector' or 'Series Admin' role found for this organization.</p>)
            : (<ScrollArea className="h-60 rounded-md border p-4"><div className="space-y-2">
                {selectableSelectors.map(user => (<div key={user.uid} className="flex items-center space-x-2">
                    <Checkbox id={`selector-${user.uid}`} checked={selectedSelectorUidsForUpdate.includes(user.uid)}
                      onCheckedChange={(checked) => { setSelectedSelectorUidsForUpdate(prev => checked ? [...prev, user.uid] : prev.filter(uid => uid !== user.uid)); }} />
                    <label htmlFor={`selector-${user.uid}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {user.displayName || user.email}
                      <span className="text-muted-foreground ml-1 text-xs">({user.roles.filter(r => r !== 'admin').join(', ')})</span>
                    </label>
                </div>))}</div></ScrollArea>)}
          </CardContent><CardFooter className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setIsEditingSelectors(false); setSelectedSelectorUidsForUpdate(game.selectorUserIds || []); }}>Cancel</Button>
            <Button onClick={handleSaveGameSelectors} disabled={isLoadingGameSelectors}>{isLoadingGameSelectors ? <Save className="animate-spin mr-2" /> : <Save className="mr-2" />} Save Selectors</Button>
          </CardFooter></Card>
      )}

      <Card><CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-headline text-primary flex items-center gap-2"><Users className="h-5 w-5" /> {game.team1} Roster</CardTitle>
            {isFutureGame ? (<TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="inline-block cursor-not-allowed"><Button variant="default" size="sm" className="bg-primary hover:bg-primary/90 pointer-events-none" disabled><Edit3 className="h-4 w-4 mr-1" /> Rate Players</Button></span></TooltipTrigger><TooltipContent><p>Cannot rate future games</p></TooltipContent></Tooltip></TooltipProvider>)
            : canRatePlayers ? (<Button asChild variant="default" size="sm" className="bg-primary hover:bg-primary/90"><Link href={`/games/${gameId}/rate-enhanced`} className="flex items-center gap-1"><Edit3 className="h-4 w-4" /> Rate Players</Link></Button>)
            : (<Button variant="default" size="sm" className="bg-primary hover:bg-primary/90" disabled title="Rating not available."><Edit3 className="h-4 w-4 mr-1" /> Rate Players</Button>)}
          </div>
          <CardDescription>{canManageRoster ? `Select players for ${game.team1}.` : `Players for ${game.team1}.`}</CardDescription>
        </CardHeader><CardContent>
          {potentialTeam1Players.length > 0 ? renderPlayerTableContent(potentialTeam1Players, 'team1') : <p className="text-muted-foreground">No players for {game.team1}.</p>}
        </CardContent>
        {canManageRoster && (<CardFooter className="border-t pt-4 flex-col items-start space-y-2">
            <h4 className="text-md font-semibold text-foreground">Add Other Eligible Player to {game.team1}</h4>
            {team1DropdownPlayers.length > 0 ? (<div className="flex gap-2 w-full items-end">
                <div className="flex-grow">
                  <Label htmlFor={`combobox-player-team1-${game.id}`} className="mb-1 block text-sm">Select Player</Label>
                  <Popover open={isComboboxOpenTeam1} onOpenChange={setIsComboboxOpenTeam1}><PopoverTrigger asChild>
                      <Button id={`combobox-player-team1-${game.id}`} variant="outline" role="combobox" aria-expanded={isComboboxOpenTeam1} className="w-full justify-between h-9">
                        {selectedPlayerToAddTeam1 ? team1DropdownPlayers.find(p => p.id === selectedPlayerToAddTeam1)?.name : "Choose player..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command>
                        <CommandInput placeholder="Search player..." /><CommandList><CommandEmpty>No player found.</CommandEmpty><CommandGroup>
                          {team1DropdownPlayers.map(p => (<CommandItem key={p.id} value={p.name} onSelect={() => { setSelectedPlayerToAddTeam1(p.id); setIsComboboxOpenTeam1(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", selectedPlayerToAddTeam1 === p.id ? "opacity-100" : "opacity-0")}/>{p.name}</CommandItem>))}
                        </CommandGroup></CommandList></Command></PopoverContent></Popover>
                </div>
                <Button onClick={() => handleAddPlayerToGameViaDropdown(selectedPlayerToAddTeam1, 'team1')} disabled={!selectedPlayerToAddTeam1 || isUpdatingRoster} size="sm" className="bg-primary hover:bg-primary/90 h-9">
                  {isUpdatingRoster && selectedPlayerToAddTeam1 ? <UserPlus className="animate-spin mr-2" /> : <UserPlus className="mr-2" />} Add</Button>
            </div>)
            : (<p className="text-sm text-muted-foreground">No other eligible players for {game.team1}.</p>)}
        </CardFooter>)}
      </Card>

      <Card><CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-headline text-primary flex items-center gap-2"><Users className="h-5 w-5" /> {game.team2} Roster</CardTitle>
            {isFutureGame ? (<TooltipProvider><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="inline-block cursor-not-allowed"><Button variant="default" size="sm" className="bg-primary hover:bg-primary/90 pointer-events-none" disabled><Edit3 className="h-4 w-4 mr-1" /> Rate Players</Button></span></TooltipTrigger><TooltipContent><p>Cannot rate future games</p></TooltipContent></Tooltip></TooltipProvider>)
            : canRatePlayers ? (<Button asChild variant="default" size="sm" className="bg-primary hover:bg-primary/90"><Link href={`/games/${gameId}/rate-enhanced`} className="flex items-center gap-1"><Edit3 className="h-4 w-4" /> Rate Players</Link></Button>)
            : (<Button variant="default" size="sm" className="bg-primary hover:bg-primary/90" disabled title="Rating not available."><Edit3 className="h-4 w-4 mr-1" /> Rate Players</Button>)}
          </div>
          <CardDescription>{canManageRoster ? `Select players for ${game.team2}.` : `Players for ${game.team2}.`}</CardDescription>
        </CardHeader><CardContent>
          {potentialTeam2Players.length > 0 ? renderPlayerTableContent(potentialTeam2Players, 'team2') : <p className="text-muted-foreground">No players for {game.team2}.</p>}
        </CardContent>
        {canManageRoster && (<CardFooter className="border-t pt-4 flex-col items-start space-y-2">
            <h4 className="text-md font-semibold text-foreground">Add Other Eligible Player to {game.team2}</h4>
            {team2DropdownPlayers.length > 0 ? (<div className="flex gap-2 w-full items-end">
                <div className="flex-grow">
                  <Label htmlFor={`combobox-player-team2-${game.id}`} className="mb-1 block text-sm">Select Player</Label>
                  <Popover open={isComboboxOpenTeam2} onOpenChange={setIsComboboxOpenTeam2}><PopoverTrigger asChild>
                      <Button id={`combobox-player-team2-${game.id}`} variant="outline" role="combobox" aria-expanded={isComboboxOpenTeam2} className="w-full justify-between h-9">
                        {selectedPlayerToAddTeam2 ? team2DropdownPlayers.find(p => p.id === selectedPlayerToAddTeam2)?.name : "Choose player..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0"><Command>
                        <CommandInput placeholder="Search player..." /><CommandList><CommandEmpty>No player found.</CommandEmpty><CommandGroup>
                          {team2DropdownPlayers.map(p => (<CommandItem key={p.id} value={p.name} onSelect={() => { setSelectedPlayerToAddTeam2(p.id); setIsComboboxOpenTeam2(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", selectedPlayerToAddTeam2 === p.id ? "opacity-100" : "opacity-0")}/>{p.name}</CommandItem>))}
                        </CommandGroup></CommandList></Command></PopoverContent></Popover>
                </div>
                <Button onClick={() => handleAddPlayerToGameViaDropdown(selectedPlayerToAddTeam2, 'team2')} disabled={!selectedPlayerToAddTeam2 || isUpdatingRoster} size="sm" className="bg-primary hover:bg-primary/90 h-9">
                  {isUpdatingRoster && selectedPlayerToAddTeam2 ? <UserPlus className="animate-spin mr-2" /> : <UserPlus className="mr-2" />} Add</Button>
            </div>)
            : (<p className="text-sm text-muted-foreground">No other eligible players for {game.team2}.</p>)}
        </CardFooter>)}
      </Card>
    </div>
  );
}
