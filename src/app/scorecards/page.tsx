'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { getScorecardsForOrgAction } from '@/lib/actions/scorecard-actions';
import type { MatchScorecard } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import {
  Table, PlusCircle, Loader2, ShieldAlert, Info,
  CalendarFold, Users, ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

export default function ScorecardsPage() {
  const { activeOrganizationId, loading: authLoading, effectivePermissions, isPermissionsLoading } = useAuth();
  const [scorecards, setScorecards] = useState<MatchScorecard[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canImport = effectivePermissions[PERMISSIONS.SCORECARDS_IMPORT];

  const fetchScorecards = useCallback(async () => {
    if (!activeOrganizationId) { setScorecards([]); setIsLoading(false); return; }
    setIsLoading(true);
    const result = await getScorecardsForOrgAction(activeOrganizationId);
    if (result.success) setScorecards(result.scorecards || []);
    setIsLoading(false);
  }, [activeOrganizationId]);

  useEffect(() => { fetchScorecards(); }, [fetchScorecards]);

  if (authLoading || isPermissionsLoading) {
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
          <Alert className="border-primary/50">
            <Info className="h-5 w-5 text-primary" />
            <AlertTitle>No Organization Selected</AlertTitle>
            <AlertDescription>Please select an organization to view scorecards.</AlertDescription>
          </Alert>
        )}

        {activeOrganizationId && (
          isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : scorecards.length === 0 ? (
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scorecards.map(sc => (
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
                    {sc.result && (
                      <p className="text-xs text-green-600 font-medium">{sc.result}</p>
                    )}
                    {sc.cricClubsLeague && (
                      <p className="text-xs text-muted-foreground">
                        CricClubs: {sc.cricClubsLeague}
                      </p>
                    )}
                    <div className="flex gap-1 mt-3">
                      {sc.innings.map((inn, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {inn.battingTeam}: {inn.totalRuns}/{inn.wickets}
                        </Badge>
                      ))}
                    </div>
                    <Button asChild variant="outline" size="sm" className="w-full mt-2 border-primary text-primary hover:bg-primary/10">
                      <Link href={`/scorecards/${sc.id}`} className="flex items-center justify-center gap-1.5">
                        View Scorecard <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
