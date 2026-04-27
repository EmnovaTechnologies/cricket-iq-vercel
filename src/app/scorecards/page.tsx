'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardsForOrgAction, getScorecardsForSelectorAction, deleteScorecardAction } from '@/lib/actions/scorecard-actions';
import { getMatchReportsForScorecardAction } from '@/lib/actions/match-report-actions';
import { getGamesForSeriesAction } from '@/lib/actions/series-actions';
import { getAllSeriesFromDB } from '@/lib/db';
import type { MatchScorecard, Game, Series } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Table, PlusCircle, Loader2, ShieldAlert, Info,
  CalendarFold, ArrowRight, Filter, AlertCircle, Link2, LayoutGrid, List,
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ScorecardCard } from '@/components/scorecard-card';
import { ScorecardListRow } from '@/components/scorecard-list-row';

export default function ScorecardsPage() {
  const { activeOrganizationId, activeOrganizationDetails, loading: authLoading, isOrgLoading, effectivePermissions, isPermissionsLoading, userProfile, currentUser } = useAuth();
  const { toast } = useToast();
  const [scorecards, setScorecards] = useState<MatchScorecard[]>([]);
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [seriesGames, setSeriesGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scorecardsWithReports, setScorecardsWithReports] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedSeries, setSelectedSeries] = useState<string>('all');
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  useEffect(() => { setMounted(true); }, []);

  const handleDelete = async (sc: MatchScorecard) => {
    if (!activeOrganizationId) return;
    setDeletingId(sc.id);
    const res = await deleteScorecardAction(sc.id, activeOrganizationId);
    if (res.success) {
      toast({ title: 'Scorecard deleted' });
      setScorecards(prev => prev.filter(s => s.id !== sc.id));
    } else {
      toast({ title: 'Delete failed', description: res.error, variant: 'destructive' });
    }
    setDeletingId(null);
  };

  const canImport = effectivePermissions[PERMISSIONS.SCORECARDS_IMPORT];
  const isSelector = userProfile?.roles?.includes('selector') || userProfile?.roles?.includes('Series Admin') || userProfile?.roles?.includes('Organization Admin');
  const isSelectorOnly =
    !!userProfile?.roles?.includes('selector') &&
    !userProfile?.roles?.includes('admin') &&
    !userProfile?.roles?.includes('Organization Admin') &&
    !userProfile?.roles?.includes('Series Admin');

  const fetchScorecards = useCallback(async () => {
    if (!activeOrganizationId || !currentUser) { setScorecards([]); setAllSeries([]); setIsLoading(false); return; }
    setIsLoading(true);

    const isSelectorOnlyLocal =
      !!userProfile?.roles?.includes('selector') &&
      !userProfile?.roles?.includes('admin') &&
      !userProfile?.roles?.includes('Organization Admin') &&
      !userProfile?.roles?.includes('Series Admin');

    const [result, series] = await Promise.all([
      isSelectorOnlyLocal
        ? getScorecardsForSelectorAction(currentUser.uid, activeOrganizationId)
        : getScorecardsForOrgAction(activeOrganizationId),
      getAllSeriesFromDB('all', activeOrganizationId),
    ]);

    const loadedScorecards = result.success ? result.scorecards || [] : [];
    if (result.success) setScorecards(loadedScorecards);
    setAllSeries(series || []);
    if (loadedScorecards.length > 0) {
      const reportChecks = await Promise.all(
        loadedScorecards.map(async sc => {
          const r = await getMatchReportsForScorecardAction(sc.id);
          return { id: sc.id, hasReports: (r.reports?.length ?? 0) > 0 };
        })
      );
      setScorecardsWithReports(new Set(reportChecks.filter(c => c.hasReports).map(c => c.id)));
    }
    setIsLoading(false);
  }, [activeOrganizationId, currentUser, userProfile]);

  useEffect(() => { fetchScorecards(); }, [fetchScorecards]);

  useEffect(() => {
    if (!selectedSeries || selectedSeries === 'all' || selectedSeries === 'none') {
      setSeriesGames([]);
      return;
    }
    setIsLoadingGames(true);
    getGamesForSeriesAction(selectedSeries).then(games => {
      setSeriesGames(games || []);
      setIsLoadingGames(false);
    });
  }, [selectedSeries]);

  const uniqueYears = useMemo(() => {
    const years = new Set<string>();
    allSeries.forEach(s => { if (s.year) years.add(s.year.toString()); });
    scorecards.forEach(sc => {
      if (sc.date) { try { years.add(parseISO(sc.date).getFullYear().toString()); } catch {} }
    });
    return Array.from(years).sort((a, b) => +b - +a);
  }, [allSeries, scorecards]);

  const filteredSeriesOptions = useMemo(() => {
    if (selectedYear === 'all') return allSeries;
    const scorecardsInYear = scorecards.filter(sc => {
      try { return sc.date && parseISO(sc.date).getFullYear().toString() === selectedYear; } catch { return false; }
    });
    const seriesIdsWithScorecards = new Set(scorecardsInYear.map(sc => sc.seriesId).filter(Boolean));
    return allSeries.filter(s => s.year.toString() === selectedYear || seriesIdsWithScorecards.has(s.id));
  }, [allSeries, selectedYear]);

  useEffect(() => {
    if (selectedYear === 'all') return;
    const currentSeries = allSeries.find(s => s.id === selectedSeries);
    if (currentSeries && currentSeries.year.toString() !== selectedYear) setSelectedSeries('all');
  }, [selectedYear, activeOrganizationId]);

  useEffect(() => {
    setSelectedTeam('all');
    setSelectedDate('');
  }, [selectedSeries, selectedYear]);

  const availableTeams = useMemo(() => {
    const teams = new Set<string>();
    scorecards.forEach(sc => {
      const yearOk = selectedYear === 'all' || (sc.date && (() => { try { return parseISO(sc.date).getFullYear().toString() === selectedYear; } catch { return false; } })());
      const seriesOk = selectedSeries === 'all' || (selectedSeries === 'none' && !sc.seriesId) || sc.seriesId === selectedSeries;
      if (yearOk && seriesOk) {
        if (sc.team1) teams.add(sc.team1);
        if (sc.team2) teams.add(sc.team2);
      }
    });
    return Array.from(teams).sort((a, b) => a.localeCompare(b));
  }, [scorecards, selectedYear, selectedSeries]);

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    scorecards.forEach(sc => {
      const yearOk = selectedYear === 'all' || (sc.date && (() => { try { return parseISO(sc.date).getFullYear().toString() === selectedYear; } catch { return false; } })());
      const seriesOk = selectedSeries === 'all' || (selectedSeries === 'none' && !sc.seriesId) || sc.seriesId === selectedSeries;
      const teamOk = selectedTeam === 'all' || sc.team1 === selectedTeam || sc.team2 === selectedTeam;
      if (yearOk && seriesOk && teamOk && sc.date) dates.add(sc.date.slice(0, 10));
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [scorecards, selectedYear, selectedSeries, selectedTeam]);

  const filteredScorecards = useMemo(() => {
    return scorecards.filter(sc => {
      const yearMatch = (selectedSeries !== 'all' && selectedSeries !== 'none')
        ? true
        : selectedYear === 'all' || (sc.date && (() => {
            try { return parseISO(sc.date).getFullYear().toString() === selectedYear; } catch { return false; }
          })());
      const seriesMatch = selectedSeries === 'all' || (selectedSeries === 'none' && !sc.seriesId) || sc.seriesId === selectedSeries;
      const teamMatch = selectedTeam === 'all' || sc.team1 === selectedTeam || sc.team2 === selectedTeam;
      const dateMatch = !selectedDate || sc.date?.slice(0, 10) === selectedDate;
      return yearMatch && seriesMatch && teamMatch && dateMatch;
    });
  }, [scorecards, selectedYear, selectedSeries, selectedTeam, selectedDate]);

  const missingGames = useMemo(() => {
    if (!seriesGames.length) return [];
    const linkedGameIds = new Set(scorecards.map(sc => sc.linkedGameId).filter(Boolean));
    const scorecardTeamDates = new Set(
      scorecards
        .filter(sc => sc.seriesId === selectedSeries)
        .map(sc => `${sc.date?.slice(0, 10)}-${sc.team1}-${sc.team2}`)
    );
    return seriesGames.filter(game => {
      if (linkedGameIds.has(game.id)) return false;
      const key = `${game.date?.slice(0, 10)}-${game.team1}-${game.team2}`;
      const keyR = `${game.date?.slice(0, 10)}-${game.team2}-${game.team1}`;
      return !scorecardTeamDates.has(key) && !scorecardTeamDates.has(keyR);
    });
  }, [seriesGames, scorecards, selectedSeries]);

  const showMissingTab = !isSelectorOnly && selectedSeries && selectedSeries !== 'all' && selectedSeries !== 'none';

  if (!mounted) return <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  if (authLoading || isPermissionsLoading || (isLoading && !!activeOrganizationId)) return <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_SCORECARDS}
      FallbackComponent={
        <div className="max-w-2xl mx-auto mt-8">
          <Alert variant="destructive">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to view scorecards.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Table className="h-8 w-8" /> Scorecards
          </h1>
          {canImport && activeOrganizationId && (
            <Button asChild className="bg-primary hover:bg-primary/90">
              <Link href="/scorecards/import" className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5" /> Import Scorecard
              </Link>
            </Button>
          )}
        </div>

        {!activeOrganizationId && !authLoading && !isOrgLoading && (
          <Alert variant="default" className="border-primary/50">
            <Info className="h-5 w-5 text-primary" />
            <AlertTitle>No Organization Selected</AlertTitle>
            <AlertDescription>Please select an organization to view scorecards.</AlertDescription>
          </Alert>
        )}

        {activeOrganizationId && (
          <>
            {/* Filters */}
            <Card className="p-4 sm:p-6 shadow">
              <CardHeader className="p-0 pb-4 mb-4 border-b">
                <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                  <Filter className="h-5 w-5" /> Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Year</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {uniqueYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Series</label>
                    <Select value={selectedSeries} onValueChange={setSelectedSeries}>
                      <SelectTrigger><SelectValue placeholder={filteredSeriesOptions.length === 0 ? 'No series for this year' : 'Select Series'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Series</SelectItem>
                        <SelectItem value="none">No Series</SelectItem>
                        {filteredSeriesOptions.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name} ({s.year})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Team</label>
                    <Select value={selectedTeam} onValueChange={setSelectedTeam} disabled={availableTeams.length === 0}>
                      <SelectTrigger><SelectValue placeholder={availableTeams.length === 0 ? 'No teams' : 'Select Team'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Teams</SelectItem>
                        {availableTeams.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Date</label>
                    <Select value={selectedDate || 'all'} onValueChange={v => setSelectedDate(v === 'all' ? '' : v)} disabled={availableDates.length === 0}>
                      <SelectTrigger><SelectValue placeholder={availableDates.length === 0 ? 'No dates' : 'Select Date'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Dates</SelectItem>
                        {availableDates.map(d => {
                          const label = (() => { try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; } })();
                          return <SelectItem key={d} value={d}>{label}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col items-end justify-end gap-1">
                    <span className="text-xs text-muted-foreground">{filteredScorecards.length} {filteredScorecards.length === 1 ? 'scorecard' : 'scorecards'}</span>
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
            </Card>

            {/* Tabs: Imported + Missing */}
            <Tabs defaultValue="imported">
              <TabsList>
                <TabsTrigger value="imported">
                  Imported
                  <Badge variant="secondary" className="ml-1.5 text-xs">{filteredScorecards.length}</Badge>
                </TabsTrigger>
                {showMissingTab && (
                  <TabsTrigger value="missing">
                    Missing
                    {!isLoadingGames && missingGames.length > 0 && (
                      <Badge className="ml-1.5 text-xs bg-amber-500 text-white">{missingGames.length}</Badge>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>

              {/* ── Imported ── */}
              <TabsContent value="imported" className="mt-4">
                {filteredScorecards.length === 0 ? (
                  scorecards.length === 0 ? (
                    <div className="text-center py-16 space-y-4">
                      <Table className="h-16 w-16 mx-auto text-muted-foreground/40" />
                      <p className="text-muted-foreground">No scorecards imported yet.</p>
                      {canImport && <Button asChild><Link href="/scorecards/import">Import your first scorecard</Link></Button>}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-6">No scorecards found matching your filters.</p>
                  )
                ) : viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredScorecards.map(sc => (
                      <ScorecardCard
                        key={sc.id}
                        sc={sc}
                        isMobile={isMobile}
                        isSelector={!!isSelector}
                        currentUser={currentUser}
                        canImport={!!canImport}
                        hasReports={scorecardsWithReports.has(sc.id)}
                        deletingId={deletingId}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden bg-card">
                    {filteredScorecards.map((sc, idx) => (
                      <ScorecardListRow
                        key={sc.id}
                        sc={sc}
                        isMobile={isMobile}
                        isSelector={!!isSelector}
                        currentUser={currentUser}
                        canImport={!!canImport}
                        hasReports={scorecardsWithReports.has(sc.id)}
                        deletingId={deletingId}
                        onDelete={handleDelete}
                        isLast={idx === filteredScorecards.length - 1}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ── Missing ── */}
              {showMissingTab && (
                <TabsContent value="missing" className="mt-4">
                  {isLoadingGames ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                  ) : missingGames.length === 0 ? (
                    <div className="text-center py-12 space-y-2">
                      <Table className="h-12 w-12 mx-auto text-muted-foreground/30" />
                      <p className="text-muted-foreground">All games in this series have scorecards imported. 🎉</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-3">
                        {missingGames.length} game{missingGames.length !== 1 ? 's' : ''} without a scorecard
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {missingGames.map(game => {
                          const hasUrl = !!(game as any).externalScoreUrl;
                          const seriesName = allSeries.find(s => s.id === game.seriesId)?.name || '';
                          const importUrl = `/scorecards/import?gameId=${game.id}&url=${encodeURIComponent((game as any).externalScoreUrl || '')}&team1=${encodeURIComponent(game.team1)}&team2=${encodeURIComponent(game.team2)}&date=${encodeURIComponent(game.date)}&venue=${encodeURIComponent(game.venue || '')}&seriesId=${encodeURIComponent(game.seriesId || '')}&seriesName=${encodeURIComponent(seriesName)}`;
                          return (
                            <Card key={game.id} className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300 border-amber-200">
                              <CardHeader className="p-3 space-y-1">
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <CardTitle className="text-xl font-headline text-primary truncate">{game.team1} vs {game.team2}</CardTitle>
                                  </div>
                                  {!hasUrl && (
                                    <Badge variant="outline" className="text-xs shrink-0 border-amber-400 text-amber-600">
                                      <Link2 className="h-3 w-3 mr-1" /> No URL
                                    </Badge>
                                  )}
                                </div>
                                <CardDescription className="flex items-center gap-1 text-sm pt-1">
                                  <CalendarFold className="h-4 w-4" />
                                  {game.date ? (() => { try { return format(parseISO(game.date), 'PP'); } catch { return game.date; } })() : 'No date'}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="flex-grow p-3 pt-1">
                                <p className="text-xs text-amber-600 flex items-center gap-1">
                                  <AlertCircle className="h-3.5 w-3.5" /> Scorecard not yet imported
                                </p>
                                {!hasUrl && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Add a CricClubs URL on the game details page to enable import.
                                  </p>
                                )}
                              </CardContent>
                              <CardFooter className="grid grid-cols-2 gap-1.5 p-2 pt-1">
                                <Button asChild variant="outline" size="sm" className="w-full border-primary text-primary hover:bg-primary/10 text-sm">
                                  <Link href={`/games/${game.id}/details`}>
                                    <span className="flex items-center justify-center gap-1">Game Details <ArrowRight className="h-3.5 w-3.5" /></span>
                                  </Link>
                                </Button>
                                {canImport && (
                                  hasUrl ? (
                                    <Button asChild size="sm" className="w-full bg-primary hover:bg-primary/90 text-sm">
                                      <Link href={importUrl}>
                                        <span className="flex items-center justify-center gap-1"><PlusCircle className="h-3.5 w-3.5" /> Import</span>
                                      </Link>
                                    </Button>
                                  ) : (
                                    <Button size="sm" disabled className="w-full text-sm">
                                      <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Import
                                    </Button>
                                  )
                                )}
                              </CardFooter>
                            </Card>
                          );
                        })}
                      </div>
                    </>
                  )}
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
