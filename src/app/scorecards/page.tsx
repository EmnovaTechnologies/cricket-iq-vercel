'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardsForOrgAction, deleteScorecardAction } from '@/lib/actions/scorecard-actions';
import type { MatchScorecard } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Table, PlusCircle, Loader2, ShieldAlert, Info,
  CalendarFold, ArrowRight, Trash2, Filter
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

export default function ScorecardsPage() {
  const { activeOrganizationId, loading: authLoading, effectivePermissions, isPermissionsLoading } = useAuth();
  const { toast } = useToast();
  const [scorecards, setScorecards] = useState<MatchScorecard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Filters
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedSeries, setSelectedSeries] = useState<string>('all');

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

  const fetchScorecards = useCallback(async () => {
    if (!activeOrganizationId) { setScorecards([]); setIsLoading(false); return; }
    setIsLoading(true);
    const result = await getScorecardsForOrgAction(activeOrganizationId);
    if (result.success) setScorecards(result.scorecards || []);
    setIsLoading(false);
  }, [activeOrganizationId]);

  useEffect(() => { fetchScorecards(); }, [fetchScorecards]);

  // Derived filter options
  const uniqueYears = useMemo(() => {
    const years = new Set<string>();
    scorecards.forEach(sc => {
      if (sc.date) {
        try { years.add(parseISO(sc.date).getFullYear().toString()); } catch {}
      }
    });
    return Array.from(years).sort((a, b) => +b - +a);
  }, [scorecards]);

  const availableSeries = useMemo(() => {
    const map = new Map<string, string>();
    scorecards.forEach(sc => {
      if (sc.seriesId && sc.seriesName) map.set(sc.seriesId, sc.seriesName);
    });
    return Array.from(map.entries());
  }, [scorecards]);

  // Reset series filter when year changes
  useEffect(() => { setSelectedSeries('all'); }, [selectedYear, activeOrganizationId]);

  const filteredScorecards = useMemo(() => {
    return scorecards.filter(sc => {
      const yearMatch = selectedYear === 'all' || (sc.date && (() => {
        try { return parseISO(sc.date).getFullYear().toString() === selectedYear; } catch { return false; }
      })());
      const seriesMatch = selectedSeries === 'all'
        || (selectedSeries === 'none' && !sc.seriesId)
        || sc.seriesId === selectedSeries;
      return yearMatch && seriesMatch;
    });
  }, [scorecards, selectedYear, selectedSeries]);

  if (!mounted) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (authLoading || isPermissionsLoading || (isLoading && !!activeOrganizationId)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

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
        {/* Header */}
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
            {/* Filters card — matching games page layout */}
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
                      <SelectTrigger>
                        <SelectValue placeholder={availableSeries.length === 0 ? 'No series linked' : 'Select Series'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Series</SelectItem>
                        <SelectItem value="none">No Series</SelectItem>
                        {availableSeries.map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {filteredScorecards.length === 0 ? (
              scorecards.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <Table className="h-16 w-16 mx-auto text-muted-foreground/40" />
                  <p className="text-muted-foreground">No scorecards imported yet.</p>
                  {canImport && (
                    <Button asChild>
                      <Link href="/scorecards/import">Import your first scorecard</Link>
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-6">
                  No scorecards found matching your filters. Try adjusting the year or series filter.
                </p>
              )
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{filteredScorecards.length} of {scorecards.length} scorecards</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredScorecards.map(sc => (
                    <Card key={sc.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-base font-semibold text-primary">
                            {sc.team1} vs {sc.team2}
                          </CardTitle>
                          <Badge variant="outline" className="text-xs">
                            {sc.innings.length} inn
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CalendarFold className="h-3.5 w-3.5" />
                          {sc.date ? (() => { try { return format(parseISO(sc.date), 'PPP'); } catch { return sc.date; } })() : 'No date'}
                        </div>
                        {sc.result && <p className="text-xs text-green-600 font-medium">{sc.result}</p>}
                        {sc.seriesName && <p className="text-xs text-primary/70 font-medium">{sc.seriesName}</p>}
                        {!sc.seriesName && sc.cricClubsLeague && (
                          <p className="text-xs text-muted-foreground">CricClubs: {sc.cricClubsLeague}</p>
                        )}
                        <div className="flex gap-1 mt-1">
                          {sc.innings.map((inn, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {inn.battingTeam}: {inn.totalRuns}/{inn.wickets}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button asChild variant="outline" size="sm" className="flex-1 border-primary text-primary hover:bg-primary/10">
                            <Link href={`/scorecards/${sc.id}`} className="flex items-center justify-center gap-1.5">
                              View <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive/10" disabled={deletingId === sc.id}>
                                {deletingId === sc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Delete Scorecard</DialogTitle>
                                <DialogDescription>
                                  Delete scorecard for <strong>{sc.team1} vs {sc.team2}</strong>?
                                  Players who only appear on this scorecard will also be removed. This cannot be undone.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button variant="destructive" onClick={() => handleDelete(sc)} disabled={deletingId === sc.id}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
