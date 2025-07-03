
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getSeriesByIdFromDB,
  getTeamsForSeriesFromDB,
  getPlayersForTeamFromDB,
  getLatestHighestPassedCertifiedFitnessTestForPlayerInSeries,
} from '@/lib/db';
import type { Series, Player, FitnessTestType } from '@/types';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Info, ShieldAlert, Loader2, Trophy, CalendarDays, Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface PlayerFitnessReportEntry {
  playerId: string;
  playerName: string;
  playerAvatarUrl?: string;
  bestScore?: number;
  bestTestDate?: string; // ISO string
  status: 'Pass' | 'No Pass Record' | 'No Test Record';
}

export default function SeriesFitnessReportPage() {
  const params = useParams<{ id: string }>();
  const seriesId = params.id;
  const { toast } = useToast();

  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [reportEntries, setReportEntries] = useState<PlayerFitnessReportEntry[]>([]);
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
          throw new Error("The series you are trying to view a report for does not exist.");
        }
        if (seriesData.status === 'archived') {
          throw new Error(`Cannot view fitness report for an archived series ("${seriesData.name}").`);
        }
        if (!seriesData.fitnessTestType || !seriesData.fitnessTestPassingScore) {
          throw new Error(`The selected series "${seriesData.name}" does not have a fitness test type and/or passing score defined. This report relies on these criteria.`);
        }
        
        const teamsInSeries = await getTeamsForSeriesFromDB(seriesId);
        let allPlayersInSeries: Player[] = [];
        if (teamsInSeries.length > 0) {
          const playerFetchPromises = teamsInSeries.map(team => getPlayersForTeamFromDB(team.id));
          const playersByTeam = await Promise.all(playerFetchPromises);
          const uniquePlayersMap = new Map<string, Player>();
          playersByTeam.flat().forEach(player => {
            if (!uniquePlayersMap.has(player.id)) {
              uniquePlayersMap.set(player.id, player);
            }
          });
          allPlayersInSeries = Array.from(uniquePlayersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        }

        if (allPlayersInSeries.length === 0) {
          setReportEntries([]);
        } else {
          const entries: PlayerFitnessReportEntry[] = await Promise.all(
            allPlayersInSeries.map(async (player) => {
              const bestTestResult = await getLatestHighestPassedCertifiedFitnessTestForPlayerInSeries(player.id, seriesId);
              if (bestTestResult) {
                return {
                  playerId: player.id,
                  playerName: player.name,
                  playerAvatarUrl: player.avatarUrl,
                  bestScore: bestTestResult.score,
                  bestTestDate: bestTestResult.testDate,
                  status: 'Pass',
                };
              } else {
                return {
                  playerId: player.id,
                  playerName: player.name,
                  playerAvatarUrl: player.avatarUrl,
                  status: 'No Pass Record',
                };
              }
            })
          );
          setReportEntries(entries);
        }

      } catch (err: any) {
        setError(err.message || "Failed to load fitness report.");
        console.error("Error fetching fitness report data:", err);
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
        <p className="ml-4 text-lg text-muted-foreground">Loading fitness report...</p>
      </div>
    );
  }

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.SERIES_VIEW_FITNESS_REPORT}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to view this fitness report.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/series/${seriesId}/details`}><ArrowLeft className="mr-2 h-4 w-4" /> Back to Series Details</Link>
          </Button>
        </div>

        {error && (
            <Alert variant="destructive" className="mt-8">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle>Error Loading Report</AlertTitle>
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
              <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                <Activity className="h-6 w-6" /> Series Fitness Report: {series.name}
              </CardTitle>
              <CardDescription>
                Showing each player's best certified "Pass" score for the series' required fitness test type: <strong>{series.fitnessTestType}</strong>.
                The passing score for this series is <strong>{series.fitnessTestPassingScore}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportEntries.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableCaption>Latest highest "Pass" scores from certified tests of type "{series.fitnessTestType}".</TableCaption>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[70px]">Avatar</TableHead>
                        <TableHead>Player Name</TableHead>
                        <TableHead className="text-center">Best Score</TableHead>
                        <TableHead>Date of Best Test</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportEntries.map(entry => (
                        <TableRow key={entry.playerId}>
                          <TableCell>
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={entry.playerAvatarUrl || `https://placehold.co/40x40.png`} alt={entry.playerName} data-ai-hint="player avatar small"/>
                              <AvatarFallback>{entry.playerName.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell className="font-medium">{entry.playerName}</TableCell>
                          <TableCell className="text-center font-semibold">
                            {entry.status === 'Pass' && entry.bestScore !== undefined ? (
                              <span className="flex items-center justify-center gap-1 text-primary">
                                <Trophy className="h-4 w-4 text-amber-500" /> {entry.bestScore.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.status === 'Pass' && entry.bestTestDate ? (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" /> {format(parseISO(entry.bestTestDate), 'PPP')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {entry.status === 'Pass' ? (
                              <span className="text-green-600 font-medium">Pass Recorded</span>
                            ) : (
                              <span className="text-amber-600">{entry.status}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Players or Data Found</AlertTitle>
                  <AlertDescription>
                    There are either no players assigned to teams in this series, or no players have fitness test data for this report.
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
