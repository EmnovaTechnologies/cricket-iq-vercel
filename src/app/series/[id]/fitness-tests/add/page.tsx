
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getSeriesByIdFromDB, getPlayersForTeamFromDB, getTeamsForSeriesFromDB } from '@/lib/db';
import type { Series, Player, UserProfile } from '@/types';
import { FitnessTestForm } from '@/components/fitness/fitness-test-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, Info, ShieldAlert, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';

export default function AddFitnessTestPage() {
  const params = useParams<{ id: string }>();
  const seriesId = params.id;

  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [playersInSeries, setPlayersInSeries] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seriesId) {
      setError("Series ID not found in URL.");
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const seriesData = await getSeriesByIdFromDB(seriesId);
        setSeries(seriesData);

        if (!seriesData) {
          throw new Error("The series you are trying to add a fitness test for does not exist.");
        }
        if (seriesData.status === 'archived') {
          throw new Error(`Cannot add fitness tests to an archived series ("${seriesData.name}").`);
        }
        if (!seriesData.fitnessTestType || !seriesData.fitnessTestPassingScore) {
          throw new Error(`The selected series "${seriesData.name}" does not have a fitness test type and/or passing score defined. Please update the series details to include this criteria before adding fitness tests.`);
        }

        const teamsInSeries = await getTeamsForSeriesFromDB(seriesId);
        if (teamsInSeries.length > 0) {
          const playerFetchPromises = teamsInSeries.map(team => getPlayersForTeamFromDB(team.id));
          const playersByTeam = await Promise.all(playerFetchPromises);
          const uniquePlayersMap = new Map<string, Player>();
          playersByTeam.flat().forEach(player => {
            if (!uniquePlayersMap.has(player.id)) {
              uniquePlayersMap.set(player.id, player);
            }
          });
          setPlayersInSeries(Array.from(uniquePlayersMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          setPlayersInSeries([]);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load data for this page.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [seriesId]);

  if (isLoading) {
    return (
       <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading form data...</p>
      </div>
    );
  }

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.FITNESS_TESTS_ADD}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to record fitness tests for this series.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-3xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series/${seriesId}/details`}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Series Details</Link>
          </Button>
        </div>
        {error && (
            <Alert variant="destructive" className="mt-8">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error}
                <Link href={`/series/${seriesId}/details`} className="block mt-2">
                  <Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Series Details</Button>
                </Link>
              </AlertDescription>
            </Alert>
        )}
        {series && !error && (
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary">Record Fitness Test for {series.name}</CardTitle>
                <CardDescription>
                  Enter the details for this fitness test session and scores for participating players.
                  The fitness test type for this series is: <strong className="text-accent">{series.fitnessTestType}</strong>.
                  The passing score is: <strong className="text-accent">{series.fitnessTestPassingScore}</strong>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {playersInSeries.length > 0 ? (
                  <FitnessTestForm
                    series={series}
                    playersInSeries={playersInSeries}
                  />
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No Players in Series</AlertTitle>
                    <AlertDescription>
                      There are no players currently assigned to teams participating in this series.
                      Please <Link href={`/series/${seriesId}/details`} className="underline text-primary hover:text-primary/80">add teams and players to this series</Link> first.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
