
'use client';

import { useState, useEffect } from 'react';
import type { RankedBatsman } from '@/types';
import { getBattingRankingsForSeriesAction } from '@/lib/actions/series-actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Info, ListOrdered, Gamepad2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CricketBatIcon } from '@/components/custom-icons';


interface BattingRankingTabProps {
  selectedSeriesId: string | null;
  selectedSeriesName?: string | null;
}

export function BattingRankingTab({ selectedSeriesId, selectedSeriesName }: BattingRankingTabProps) {
  const [rankings, setRankings] = useState<RankedBatsman[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSeriesId) {
      const fetchRankings = async () => {
        setIsLoading(true);
        setError(null);
        setRankings(null);
        setMessage(null);
        const result = await getBattingRankingsForSeriesAction(selectedSeriesId);
        if (result.success && result.rankings) {
          setRankings(result.rankings);
          if (result.message) setMessage(result.message);
          if (result.rankings.length === 0 && !result.message) {
            setMessage("No players found with batting ratings for this series to display in the ranking.");
          }
        } else {
          setError(result.error || "Failed to fetch batting rankings.");
        }
        setIsLoading(false);
      };
      fetchRankings();
    } else {
      setRankings(null);
      setError(null);
      setIsLoading(false);
      setMessage(null);
    }
  }, [selectedSeriesId]);

  if (!selectedSeriesId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CricketBatIcon />Batting Ranking</CardTitle>
          <CardDescription>Player batting performance within a selected series.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Please select a series in the "Team Composition" tab to view batting rankings.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CricketBatIcon />Batting Ranking for {selectedSeriesName || 'Selected Series'}</CardTitle>
           <CardDescription>Loading batting performance data...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Fetching rankings...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
           <CardTitle className="flex items-center gap-2"><CricketBatIcon />Batting Ranking for {selectedSeriesName || 'Selected Series'}</CardTitle>
           <CardDescription className="text-destructive">Error loading data</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }
  
  if (!rankings || rankings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CricketBatIcon />Batting Ranking for {selectedSeriesName || 'Selected Series'}</CardTitle>
          <CardDescription>No players met the criteria for batting ranking in this series.</CardDescription>
        </CardHeader>
        <CardContent>
           <p className="text-muted-foreground">{message || "No eligible batsmen found or no batting data available for this series."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CricketBatIcon />Batting Ranking for {selectedSeriesName || 'Selected Series'}</CardTitle>
        <CardDescription>
          Players ranked by their average batting score in the selected series. Only players with batting ratings in this series are shown.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption>{message || `Batting performance ranking for ${selectedSeriesName || 'the selected series'}.`}</TableCaption>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[70px]">Rank</TableHead>
                <TableHead className="w-[80px]">Avatar</TableHead>
                <TableHead>Name</TableHead>
                <TableHead><CricketBatIcon className="h-4 w-4 inline mr-1" />Bat Hand</TableHead>
                <TableHead><ListOrdered className="h-4 w-4 inline mr-1" />Bat Order</TableHead>
                <TableHead className="text-center"><Gamepad2 className="h-4 w-4 inline mr-1" />Games (Series)</TableHead>
                <TableHead className="text-right"><CricketBatIcon className="h-4 w-4 inline mr-1" />Avg. Bat Score (Series)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankings.map((player, index) => (
                <TableRow key={player.id} className="hover:bg-accent/5">
                  <TableCell>
                     <Badge variant={index < 3 ? "default" : "secondary"} className={index < 3 ? "bg-accent text-accent-foreground font-semibold" : ""}>
                        {index + 1}
                     </Badge>
                  </TableCell>
                  <TableCell>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={player.avatarUrl || `https://placehold.co/40x40.png`} alt={player.name} data-ai-hint="player avatar small"/>
                      <AvatarFallback>{player.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{player.name}</TableCell>
                  <TableCell>{player.dominantHandBatting}</TableCell>
                  <TableCell>{player.battingOrder}</TableCell>
                  <TableCell className="text-center">{player.gamesPlayedInSeries}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{player.averageBattingScoreInSeries.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
