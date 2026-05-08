
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import GameCard from '@/components/game-card';
import GameListRow from '@/components/game-list-row';
import { getAllSeriesFromDB, getAllTeamsFromDB } from '@/lib/db';
import { getGamesForUserViewAction } from '@/lib/actions/game-actions';
import type { Game, Series, Team } from '@/types';
import { PlusCircle, Filter, Upload, Info, Loader2, Gamepad2, CheckSquare, Square, UserCheck , LayoutGrid, List, Lock, CreditCard } from 'lucide-react';
import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { parseISO, startOfDay, isValid } from 'date-fns';
import { getPlayerPaymentStatusAction } from '@/lib/actions/registration-payment-action';

interface SeriesFilterItem {
  id: string;
  name: string;
  year: number;
  ageCategory: string;
}

type FinalizedStatusFilter = 'all' | 'finalized' | 'notFinalized';
type SelectorSpecificFilterOption = 'all' | 'myPending';

function GamesPageInner() {
  const {
    userProfile,
    activeOrganizationId,
    activeOrganizationDetails,
    loading: authLoading,
    isOrgLoading,
    effectivePermissions,
    isPermissionsLoading
  } = useAuth();

  const [allGames, setAllGames] = useState<Game[]>([]);
  const [allSeriesForOrg, setAllSeriesForOrg] = useState<Series[]>([]);
  const [allTeamsForOrg, setAllTeamsForOrg] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  const searchParams = useSearchParams();
  const currentYearString = useMemo(() => new Date().getFullYear().toString(), []);
  const [isMobile, setIsMobile] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const mobile = window.innerWidth < 768;
    setIsMobile(mobile);
    setFiltersOpen(!mobile); // open by default on desktop, closed on mobile
  }, []);

  const [selectedYear, setSelectedYear] = useState<string>(
    searchParams.get('year') || currentYearString
  );
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('all');
  const [selectedTeamName, setSelectedTeamName] = useState<string>('all');
  const [selectedFinalizedStatus, setSelectedFinalizedStatus] = useState<FinalizedStatusFilter>(
    searchParams.get('ratingStatus') === 'unfinalized' ? 'notFinalized' : 'all'
  );
  const [selectorSpecificFilter, setSelectorSpecificFilter] = useState<SelectorSpecificFilterOption>('all');
  const [selectorsFilter, setSelectorsFilter] = useState<'all' | 'none' | 'assigned'>(searchParams.get('selectors') === 'none' ? 'none' : searchParams.get('selectors') === 'assigned' ? 'assigned' : 'all');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (authLoading) {
        setIsLoading(true);
        return;
      }

      setIsLoading(true);
      // Clear stale data + reset filters immediately so previous org's data never bleeds through
      setAllGames([]);
      setAllSeriesForOrg([]);
      setAllTeamsForOrg([]);
      setSelectedSeriesId('all');
      setSelectedTeamName('all');
      // Preserve URL-param filters on first load; reset only on org switch
      if (allGames.length > 0) {
        setSelectedFinalizedStatus('all');
        setSelectorsFilter('all');
      }
      try {
        const gamesFromDB = await getGamesForUserViewAction(userProfile, activeOrganizationId);
        setAllGames(gamesFromDB);

        if (activeOrganizationId) {
          const seriesFromDB = await getAllSeriesFromDB('all', activeOrganizationId);
          setAllSeriesForOrg(seriesFromDB);
          const teamsFromDB = await getAllTeamsFromDB(activeOrganizationId);
          setAllTeamsForOrg(teamsFromDB);
        } else {
          setAllSeriesForOrg([]);
          setAllTeamsForOrg([]);
        }

      } catch (error) {
        console.error("Failed to fetch games data:", error);
        toast({ title: "Error", description: "Could not fetch games list.", variant: "destructive" });
        setAllGames([]);
        setAllSeriesForOrg([]);
        setAllTeamsForOrg([]);
      }
      setIsLoading(false);
    };
    fetchData();
  }, [activeOrganizationId, authLoading, userProfile, toast]);

  const uniqueYears = useMemo(() => {
    const yearsSet = new Set<string>();
    allGames.forEach(game => {
      if (game.date) {
        try {
          const gameDate = new Date(game.date);
          if (!isNaN(gameDate.getFullYear())) {
            yearsSet.add(gameDate.getFullYear().toString());
          }
        } catch (e) { /* gameYear remains empty */ }
      }
    });
    if (!yearsSet.has(currentYearString)) {
      yearsSet.add(currentYearString);
    }
    return Array.from(yearsSet).sort((a, b) => parseInt(b) - parseInt(a));
  }, [allGames, currentYearString]);

  useEffect(() => {
    setSelectedSeriesId('all');
    setSelectedTeamName('all');
  }, [selectedYear, activeOrganizationId]);

  useEffect(() => {
    setSelectedTeamName('all');
  }, [selectedSeriesId, activeOrganizationId]);

  const availableSeriesForFilter = useMemo(() => {
    const seriesInVisibleGames = new Map<string, SeriesFilterItem>();
    allGames.forEach(game => {
      if (game.seriesId && game.seriesName) {
        const seriesYear = new Date(game.date).getFullYear();
        const fullSeriesDetails = allSeriesForOrg.find(s => s.id === game.seriesId);

        if (!seriesInVisibleGames.has(game.seriesId) && (selectedYear === 'all' || seriesYear.toString() === selectedYear)) {
          seriesInVisibleGames.set(game.seriesId, {
            id: game.seriesId,
            name: game.seriesName,
            year: seriesYear,
            ageCategory: fullSeriesDetails?.ageCategory || 'N/A'
          });
        }
      }
    });
    return Array.from(seriesInVisibleGames.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allGames, selectedYear, allSeriesForOrg]);

  const availableTeamsForFilter = useMemo(() => {
    let gamesToConsider = allGames;

    if (selectedYear !== 'all') {
      gamesToConsider = gamesToConsider.filter(game => {
        try {
          return new Date(game.date).getFullYear().toString() === selectedYear;
        } catch { return false; }
      });
    }

    if (selectedSeriesId !== 'all') {
      gamesToConsider = gamesToConsider.filter(game => game.seriesId === selectedSeriesId);
    }

    const teamNames = new Set<string>();
    gamesToConsider.forEach(game => {
      if (game.team1) teamNames.add(game.team1);
      if (game.team2) teamNames.add(game.team2);
    });
    return Array.from(teamNames).sort((a, b) => a.localeCompare(b));
  }, [allGames, selectedYear, selectedSeriesId, allTeamsForOrg]);

  const isGamePendingMyCertification = (game: Game, currentUserId?: string): boolean => {
    if (!currentUserId || !game.selectorUserIds?.includes(currentUserId)) {
      return false;
    }
    if (game.ratingsFinalized === true) {
      return false;
    }
    
    const gameDate = game.date ? parseISO(game.date) : null;
    if (gameDate && isValid(gameDate) && startOfDay(gameDate) > startOfDay(new Date())) {
      return false; 
    }

    const userCert = game.selectorCertifications?.[currentUserId];
    if (!userCert || userCert.status === 'pending') {
      return true;
    }
    if (userCert.status === 'certified') {
      if (!game.ratingsLastModifiedAt) return false; 
      if (!userCert.certifiedAt) return true; 
      try {
        const certDate = parseISO(userCert.certifiedAt);
        const modifiedDate = parseISO(game.ratingsLastModifiedAt);
        if (isValid(certDate) && isValid(modifiedDate)) {
          return certDate < modifiedDate; 
        }
      } catch (e) {
        console.error("Error parsing dates for certification check in filter", e);
        return true; 
      }
    }
    return false;
  };

  const filteredGames = useMemo(() => {
    return allGames.filter(game => {
      let gameYear = '';
      if (game.date) {
        try {
          const parsedDate = new Date(game.date);
          if (!isNaN(parsedDate.getFullYear())) {
            gameYear = parsedDate.getFullYear().toString();
          }
        } catch (e) { /* gameYear remains empty */ }
      }

      const yearMatch = selectedYear === 'all' || gameYear === selectedYear;
      const seriesMatch = selectedSeriesId === 'all' || game.seriesId === selectedSeriesId;
      const teamMatch = selectedTeamName === 'all' || game.team1 === selectedTeamName || game.team2 === selectedTeamName;
      
      const finalizedMatch = selectedFinalizedStatus === 'all' ||
                             (selectedFinalizedStatus === 'finalized' && game.ratingsFinalized === true) ||
                             (selectedFinalizedStatus === 'notFinalized' && (game.ratingsFinalized === false || game.ratingsFinalized === undefined));

      const myPendingMatch = selectorSpecificFilter === 'all' ||
                             (selectorSpecificFilter === 'myPending' && isGamePendingMyCertification(game, userProfile?.uid));
      const noSelectorsMatch = selectorsFilter === 'all' || (selectorsFilter === 'none' && !game.selectorUserIds?.length) || (selectorsFilter === 'assigned' && !!game.selectorUserIds?.length);

      return yearMatch && seriesMatch && teamMatch && finalizedMatch && myPendingMatch && noSelectorsMatch;
    });
  }, [allGames, selectedYear, selectedSeriesId, selectedTeamName, selectedFinalizedStatus, selectorSpecificFilter, selectorsFilter, userProfile?.uid]);

  const canImportGames = effectivePermissions[PERMISSIONS.PAGE_VIEW_GAME_IMPORT];
  const canAddGames = effectivePermissions[PERMISSIONS.PAGE_VIEW_GAME_ADD];
  const isSelector = userProfile?.roles?.includes('selector');
  const isPlayer = userProfile?.roles?.includes('player');

  // Payment gate — only for players
  const [isPaid, setIsPaid] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isPlayer || !userProfile?.playerId) { setIsPaid(true); return; }
    getPlayerPaymentStatusAction(userProfile.playerId)
      .then(s => setIsPaid(s.isPaid || s.isWaived))
      .catch(() => setIsPaid(true)); // fail open
  }, [isPlayer, userProfile?.playerId]);

  const showPaywall = isPlayer && isPaid === false;

  if (!mounted) {
    return (
        <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Loading games...</p>
        </div>
    );
  }

  if (authLoading || isPermissionsLoading || (isLoading && activeOrganizationId)) {
    return (
        <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Loading games...</p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2"><Gamepad2 className="h-8 w-8" /> Games</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          {isPermissionsLoading ? (
            <>
              <Button disabled variant="secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Import Games</Button>
              <Button disabled className="bg-primary hover:bg-primary/90"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Add New Game</Button>
            </>
          ) : (
            <>
              {canImportGames && (
                <Button asChild variant="secondary" disabled={!activeOrganizationId}>
                  <Link href="/games/import" className="flex items-center gap-2">
                    <Upload className="h-5 w-5" /> Import Games
                  </Link>
                </Button>
              )}
              {canAddGames && (
                <Button asChild className="bg-primary hover:bg-primary/90" disabled={!activeOrganizationId}>
                  <Link href="/games/add?from=games" className="flex items-center gap-2">
                    <PlusCircle className="h-5 w-5" /> Add New Game
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!activeOrganizationId && !authLoading && !isOrgLoading && (
        <Alert variant="default" className="border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>No Organization Selected</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar to view or manage games.
          </AlertDescription>
        </Alert>
      )}

      {activeOrganizationId && (
        <>
          <Card className="p-4 sm:p-6 shadow">
            <button
              className="w-full flex items-center justify-between"
              onClick={() => isMobile && setFiltersOpen(v => !v)}
            >
              <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                <Filter className="h-5 w-5" /> Filters
              </CardTitle>
              {isMobile && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {filtersOpen ? 'Hide' : 'Show'}
                  <span className="text-base">{filtersOpen ? '▲' : '▼'}</span>
                </span>
              )}
            </button>
            {filtersOpen && (
            <CardContent className="p-0 mt-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[140px]">
                  <label htmlFor="year-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Year</label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger id="year-filter"><SelectValue placeholder="Select Year" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {uniqueYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label htmlFor="series-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Series</label>
                  <Select value={selectedSeriesId} onValueChange={setSelectedSeriesId} disabled={availableSeriesForFilter.length === 0 && selectedYear !== 'all'}>
                    <SelectTrigger id="series-filter">
                      <SelectValue placeholder={selectedYear === 'all' && availableSeriesForFilter.length === 0 ? "No series in visible games" : (selectedYear !== 'all' && availableSeriesForFilter.length === 0 ? "No series for this year" : "Select Series")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Series</SelectItem>
                      {availableSeriesForFilter.map(series => (
                        <SelectItem key={series.id} value={series.id}>{series.name} ({series.ageCategory} - {series.year})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label htmlFor="team-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Team</label>
                  <Select value={selectedTeamName} onValueChange={setSelectedTeamName} disabled={availableTeamsForFilter.length === 0 && (selectedYear !== 'all' || selectedSeriesId !== 'all')}>
                    <SelectTrigger id="team-filter">
                      <SelectValue placeholder={
                        (selectedYear === 'all' && selectedSeriesId === 'all' && availableTeamsForFilter.length === 0) ? "No teams in visible games" :
                        (availableTeamsForFilter.length === 0 ? "No teams match criteria" : "Select Team")
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Teams</SelectItem>
                      {availableTeamsForFilter.map(teamName => (
                        <SelectItem key={teamName} value={teamName}>{teamName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label htmlFor="selectors-filter" className="block text-sm font-medium text-muted-foreground mb-1">Selectors</label>
                  <Select value={selectorsFilter} onValueChange={(v) => setSelectorsFilter(v as 'all' | 'none' | 'assigned')}>
                    <SelectTrigger id="selectors-filter"><SelectValue placeholder="All Games" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Games</SelectItem>
                      <SelectItem value="none">No Selectors</SelectItem>
                      <SelectItem value="assigned">Selectors Assigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label htmlFor="finalized-status-filter" className="block text-sm font-medium text-muted-foreground mb-1">Rating Status</label>
                  <Select value={selectedFinalizedStatus} onValueChange={(value) => setSelectedFinalizedStatus(value as FinalizedStatusFilter)}>
                    <SelectTrigger id="finalized-status-filter">
                      <SelectValue placeholder="Rating Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Games</SelectItem>
                      <SelectItem value="finalized">
                        <div className="flex items-center gap-1"><CheckSquare className="h-4 w-4 text-green-600"/>Finalized</div>
                      </SelectItem>
                      <SelectItem value="notFinalized">
                        <div className="flex items-center gap-1"><Square className="h-4 w-4 text-amber-600"/>Not Finalized</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isSelector && (
                  <div className="flex-1 min-w-[140px]">
                    <label htmlFor="my-pending-filter" className="block text-sm font-medium text-muted-foreground mb-1">My Certifications</label>
                    <Select value={selectorSpecificFilter} onValueChange={(value) => setSelectorSpecificFilter(value as SelectorSpecificFilterOption)}>
                      <SelectTrigger id="my-pending-filter">
                        <SelectValue placeholder="My Certifications" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center gap-1">All My Games</div>
                        </SelectItem>
                        <SelectItem value="myPending">
                          <div className="flex items-center gap-1"><UserCheck className="h-4 w-4 text-orange-500"/>My Pending</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-col items-end justify-end gap-1">
                  <span className="text-xs text-muted-foreground">{filteredGames.length} {filteredGames.length === 1 ? 'game' : 'games'}</span>
                  <div className="flex rounded-md border border-input overflow-hidden">
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                      title="Card view"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-l border-input ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                      title="List view"
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
            )}
          </Card>

          {isLoading ? (
            <p className="text-muted-foreground text-center py-6">Loading games...</p>
          ) : filteredGames.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              No games found matching your criteria for this organization. Try adjusting the filters or add some games.
            </p>
          ) : showPaywall ? (
            // ── Payment gate — show most recent game, blur the rest ──
            (() => {
              const sortedGames = [...filteredGames].sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
              );
              const [firstGame, ...lockedGames] = sortedGames;
              return (
                <div className="space-y-4">
                  {/* First game — fully visible */}
                  {viewMode === 'cards' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <GameCard key={firstGame.id} game={firstGame} isPlayerView={true} />
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden bg-card">
                      <GameListRow game={firstGame} isLast={lockedGames.length === 0} isPlayerView={true} />
                    </div>
                  )}

                  {/* Remaining games — blurred with lock overlay */}
                  {lockedGames.length > 0 && (
                    <div className="relative rounded-lg overflow-hidden">
                      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
                        {viewMode === 'cards' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {lockedGames.map(game => (
                              <GameCard key={game.id} game={game} />
                            ))}
                          </div>
                        ) : (
                          <div className="border rounded-lg overflow-hidden bg-card">
                            {lockedGames.map((game, idx) => (
                              <GameListRow key={game.id} game={game} isLast={idx === lockedGames.length - 1} />
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Lock overlay — solid background for prominence */}
                      <div className="absolute inset-0 flex flex-col items-center justify-start pt-6 px-4 gap-4 rounded-lg" style={{ background: 'hsl(var(--background) / 0.97)', backdropFilter: 'none' }}>
                        <div className="h-14 w-14 rounded-full bg-muted border border-border flex items-center justify-center">
                          <Lock className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-base text-foreground mb-1">
                            {lockedGames.length} {lockedGames.length === 1 ? 'game' : 'games'} locked
                          </p>
                          <p className="text-sm text-muted-foreground max-w-[240px] leading-relaxed">
                            Register for a series to unlock full game access.
                          </p>
                        </div>
                        <div className="w-full max-w-sm border-2 border-border rounded-lg p-4 bg-card shadow-sm">
                          <div className="flex items-start gap-3">
                            <CreditCard className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-foreground mb-0.5">Complete registration</p>
                              <p className="text-xs text-muted-foreground leading-relaxed">Register for a series to unlock all games.</p>
                            </div>
                          </div>
                          <Link
                            href={`/register-player/${activeOrganizationId}`}
                            className="mt-3 flex items-center justify-center w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                          >
                            Register now
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGames.map((game) => (
                <GameCard key={game.id} game={game} isPlayerView={isPlayer} />
              ))}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden bg-card">
              {filteredGames.map((game, idx) => (
                <GameListRow
                  key={game.id}
                  game={game}
                  isLast={idx === filteredGames.length - 1}
                  isPlayerView={isPlayer}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function GamesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-[calc(100vh-12rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>}>
      <GamesPageInner />
    </Suspense>
  );
}
