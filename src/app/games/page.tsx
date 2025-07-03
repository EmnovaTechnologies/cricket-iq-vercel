
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import GameCard from '@/components/game-card';
import { getAllSeriesFromDB, getAllTeamsFromDB } from '@/lib/db';
import { getGamesForUserViewAction } from '@/lib/actions/game-actions';
import type { Game, Series, Team } from '@/types';
import { PlusCircle, Filter, Upload, Info, Loader2, CheckSquare, Square, UserCheck } from 'lucide-react'; // Added UserCheck
import { useState, useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { parseISO, startOfDay, isValid } from 'date-fns'; // Added date-fns imports

interface SeriesFilterItem {
  id: string;
  name: string;
  year: number;
  ageCategory: string;
}

type FinalizedStatusFilter = 'all' | 'finalized' | 'notFinalized';
type SelectorSpecificFilterOption = 'all' | 'myPending';

export default function GamesPage() {
  const {
    userProfile,
    activeOrganizationId,
    loading: authLoading,
    effectivePermissions,
    isPermissionsLoading
  } = useAuth();

  const [allGames, setAllGames] = useState<Game[]>([]);
  const [allSeriesForOrg, setAllSeriesForOrg] = useState<Series[]>([]);
  const [allTeamsForOrg, setAllTeamsForOrg] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);

  const currentYearString = useMemo(() => new Date().getFullYear().toString(), []);
  const [selectedYear, setSelectedYear] = useState<string>(currentYearString);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('all');
  const [selectedTeamName, setSelectedTeamName] = useState<string>('all');
  const [selectedFinalizedStatus, setSelectedFinalizedStatus] = useState<FinalizedStatusFilter>('all');
  const [selectorSpecificFilter, setSelectorSpecificFilter] = useState<SelectorSpecificFilterOption>('all');

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

      return yearMatch && seriesMatch && teamMatch && finalizedMatch && myPendingMatch;
    });
  }, [allGames, selectedYear, selectedSeriesId, selectedTeamName, selectedFinalizedStatus, selectorSpecificFilter, userProfile?.uid]);

  const canImportGames = effectivePermissions[PERMISSIONS.PAGE_VIEW_GAME_IMPORT];
  const canAddGames = effectivePermissions[PERMISSIONS.PAGE_VIEW_GAME_ADD];
  const isSelector = userProfile?.roles?.includes('selector');

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
        <h1 className="text-3xl font-headline font-bold text-primary">Games</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          {isPermissionsLoading ? (
            <>
              <Button disabled variant="secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Import Games (CSV)</Button>
              <Button disabled className="bg-primary hover:bg-primary/90"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Add New Game</Button>
            </>
          ) : (
            <>
              {canImportGames && (
                <Button asChild variant="secondary" disabled={!activeOrganizationId}>
                  <Link href="/games/import" className="flex items-center gap-2">
                    <Upload className="h-5 w-5" /> Import Games (CSV)
                  </Link>
                </Button>
              )}
              {canAddGames && (
                <Button asChild className="bg-primary hover:bg-primary/90" disabled={!activeOrganizationId}>
                  <Link href="/games/add" className="flex items-center gap-2">
                    <PlusCircle className="h-5 w-5" /> Add New Game
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!activeOrganizationId && !authLoading && (
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
            <CardHeader className="p-0 pb-4 mb-4 border-b">
              <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                <Filter className="h-5 w-5" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"> {/* Adjusted grid */}
                <div>
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
                <div>
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
                <div>
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
                <div>
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
                  <div>
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
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <p className="text-muted-foreground text-center py-6">Loading games...</p>
          ) : filteredGames.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              No games found matching your criteria for this organization. Try adjusting the filters or add some games.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGames.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
