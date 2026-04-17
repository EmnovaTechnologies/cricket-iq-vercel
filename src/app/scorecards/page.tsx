'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardsForOrgAction, deleteScorecardAction } from '@/lib/actions/scorecard-actions';
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
  CalendarFold, ArrowRight, Trash2, Filter, AlertCircle, Link2, FileText
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

export default function ScorecardsPage() {
  const { activeOrganizationId, loading: authLoading, effectivePermissions, isPermissionsLoading, userProfile, currentUser } = useAuth();
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
  const [isMobile, setIsMobile] = useState(false);

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

  const fetchScorecards = useCallback(async () => {
    if (!activeOrganizationId) { setScorecards([]); setAllSeries([]); setIsLoading(false); return; }
    setIsLoading(true);
    const [result, series] = await Promise.all([
      getScorecardsForOrgAction(activeOrganizationId),
      getAllSeriesFromDB('all', activeOrganizationId),
    ]);
    const loadedScorecards = result.success ? result.scorecards || [] : [];
    if (result.success) setScorecards(loadedScorecards);
    setAllSeries(series || []);
    // Check which scorecards have match reports (for disabling delete)
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
  }, [activeOrganizationId]);

  useEffect(() => { fetchScorecards(); }, [fetchScorecards]);

  // Fetch games when a specific series is selected
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

  // Years from all series in org (not just scorecards)
  const uniqueYears = useMemo(() => {
    const years = new Set<string>();
    allSeries.forEach(s => { if (s.year) years.add(s.year.toString()); });
    // Also include years from scorecards that may not have a series
    scorecards.forEach(sc => {
      if (sc.date) { try { years.add(parseISO(sc.date).getFullYear().toString()); } catch {} }
    });
    return Array.from(years).sort((a, b) => +b - +a);
  }, [allSeries, scorecards]);

  // Series filtered by selected year
  const filteredSeriesOptions = useMemo(() => {
    if (selectedYear === 'all') return allSeries;
    // Show series whose defined year matches, OR series that have scorecards
    // with dates in the selected year (cross-year series)
    const scorecardsInYear = scorecards.filter(sc => {
      try { return sc.date && parseISO(sc.date).getFullYear().toString() === selectedYear; } catch { return false; }
    });
    const seriesIdsWithScorecards = new Set(scorecardsInYear.map(sc => sc.seriesId).filter(Boolean));
    return allSeries.filter(s =>
      s.year.toString() === selectedYear || seriesIdsWithScorecards.has(s.id)
    );
  }, [allSeries, selectedYear]);

  useEffect(() => {
    // Reset series only if it doesn't belong to the newly selected year
    if (selectedYear === 'all') return;
    const currentSeries = allSeries.find(s => s.id === selectedSeries);
    if (currentSeries && currentSeries.year.toString() !== selectedYear) {
      setSelectedSeries('all');
    }
  }, [selectedYear, activeOrganizationId]);

  const filteredScorecards = useMemo(() => {
    return scorecards.filter(sc => {
      // When a specific series is selected, skip year filter —
      // a series may have games crossing year boundaries
      const yearMatch = (selectedSeries !== 'all' && selectedSeries !== 'none')
        ? true
        : selectedYear === 'all' || (sc.date && (() => {
            try { return parseISO(sc.date).getFullYear().toString() === selectedYear; } catch { return false; }
          })());
      const seriesMatch = selectedSeries === 'all'
        || (selectedSeries === 'none' && !sc.seriesId)
        || sc.seriesId === selectedSeries;
      return yearMatch && seriesMatch;
    });
  }, [scorecards, selectedYear, selectedSeries]);

  // Games with no imported scorecard in the selected series
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

  const showMissingTab = selectedSeries && selectedSeries !== 'all' && selectedSeries !== 'none';

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

        {!activeOrganizationId && (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Year</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {uniqueYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
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
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">{filteredScorecards.length} of {scorecards.length} scorecards</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredScorecards.map(sc => (
                        <Card key={sc.id} className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
                          <CardHeader className="p-3 space-y-1">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-xl font-headline text-primary truncate">{sc.team1} vs {sc.team2}</CardTitle>
                                {sc.seriesName && <p className="text-xs text-muted-foreground truncate">Series: {sc.seriesName}</p>}
                              </div>
                              <Badge variant="outline" className="text-xs shrink-0">{sc.innings.length} inn</Badge>
                            </div>
                            <CardDescription className="flex items-center gap-1 text-sm pt-1">
                              <CalendarFold className="h-4 w-4" />
                              {sc.date ? (() => { try { return format(parseISO(sc.date), 'PP'); } catch { return sc.date; } })() : 'No date'}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="flex-grow p-3 pt-1 space-y-1">
                            {sc.result && <p className="text-xs text-green-600 font-medium">{sc.result}</p>}
                            <div className="flex flex-wrap gap-1">
                              {sc.innings.map((inn, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {inn.battingTeam}: {inn.totalRuns}/{inn.wickets}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                          <CardFooter className="grid grid-cols-2 gap-1.5 p-2 pt-1">
                            {isMobile && isSelector && currentUser ? (
                              <Button asChild variant="default" size="sm" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-sm">
                                <Link href={`/match-report/${sc.id}?uid=${currentUser.uid}`}>
                                  <span className="flex items-center justify-center gap-1"><FileText className="h-3.5 w-3.5" /> Match Report</span>
                                </Link>
                              </Button>
                            ) : (
                              <Button asChild variant="outline" size="sm" className="w-full border-primary text-primary hover:bg-primary/10 text-sm">
                                <Link href={`/scorecards/${sc.id}`}>
                                  <span className="flex items-center justify-center gap-1">View Details <ArrowRight className="h-3.5 w-3.5" /></span>
                                </Link>
                              </Button>
                            )}
                            {canImport && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  {scorecardsWithReports.has(sc.id) ? (
                                    <span title="Cannot delete — match reports exist" className="w-full cursor-not-allowed">
                                      <Button
                                        variant="destructive" size="sm" className="w-full text-sm pointer-events-none opacity-50"
                                        disabled
                                      >
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                                      </Button>
                                    </span>
                                  ) : (
                                    <Button
                                      variant="destructive" size="sm" className="w-full text-sm"
                                      disabled={deletingId === sc.id}
                                    >
                                      {deletingId === sc.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                                      {deletingId === sc.id ? 'Deleting...' : 'Delete'}
                                    </Button>
                                  )}
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Scorecard</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Delete scorecard for <strong>{sc.team1} vs {sc.team2}</strong>? Players only on this scorecard will also be removed. This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(sc)} className="bg-destructive hover:bg-destructive/90">Confirm Delete</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  </>
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
