
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Series } from '@/types';
import { TeamCompositionForm, type TeamCompositionFormValues } from '@/components/team-composition-form';
import { suggestTeam } from '@/lib/actions/ai-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Terminal, Info, BarChart3, Target, Shield, Loader2, Edit, CheckCircle, AlertTriangle } from 'lucide-react';
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';
import { useToast } from '@/hooks/use-toast';
import { BattingRankingTab } from '@/components/rankings/batting-ranking-tab';
import { BowlingRankingTab } from '@/components/rankings/bowling-ranking-tab';
import { WicketKeepingRankingTab } from '@/components/rankings/wicketkeeping-ranking-tab';
import { FieldingRankingTab } from '@/components/rankings/fielding-ranking-tab';
import { AllRounderRankingTab } from '@/components/rankings/all-rounder-ranking-tab';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { getAllSeriesFromDB, getAllGamesFromDB } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isPast, isToday, parseISO } from 'date-fns';

export type SeriesRatingStatus = 'certified' | 'pending' | 'no_ratings';

export interface SeriesWithStatus extends Series {
  ratingStatus: SeriesRatingStatus;
}

export function TeamCompositionClientWrapper() {
  const { userProfile, activeOrganizationId, loading: authLoading } = useAuth();
  const [seriesForDropdown, setSeriesForDropdown] = useState<SeriesWithStatus[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [isFetchingSeries, setIsFetchingSeries] = useState(true);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [errorAI, setErrorAI] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<string>('');
  const [ratingStatusFilter, setRatingStatusFilter] = useState<'all' | SeriesRatingStatus>('all');
  const [selectedSeriesIdForTabs, setSelectedSeriesIdForTabs] = useState<string | null>(null);
  const [selectedSeriesNameForTabs, setSelectedSeriesNameForTabs] = useState<string | null>(null);
  const [selectedSeriesDetails, setSelectedSeriesDetails] = useState<SeriesWithStatus | null>(null);
  const [showCriteria, setShowCriteria] = useState(false);
  const [isAnimatingTabs, setIsAnimatingTabs] = useState(false);
  const [prevSeriesId, setPrevSeriesId] = useState<string | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const isInitialMount = useRef(true);

  const { toast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    if (selectedSeriesIdForTabs && !prevSeriesId && selectedSeriesDetails?.ratingStatus !== 'no_ratings') {
      setIsAnimatingTabs(true);
      setShowPopover(true);
      const animationTimer = setTimeout(() => setIsAnimatingTabs(false), 1500);
      const popoverTimer = setTimeout(() => setShowPopover(false), 7000);
      
      return () => {
        clearTimeout(animationTimer);
        clearTimeout(popoverTimer);
      };
    }
    setPrevSeriesId(selectedSeriesIdForTabs);
  }, [selectedSeriesIdForTabs, prevSeriesId, selectedSeriesDetails]);


  useEffect(() => {
    const fetchSeriesAndGameData = async () => {
      if (authLoading || !userProfile) {
        setIsFetchingSeries(true);
        return;
      }
      setIsFetchingSeries(true);
      try {
        if (activeOrganizationId) {
          const [seriesFromDB, allOrgGames] = await Promise.all([
            getAllSeriesFromDB('active', activeOrganizationId),
            getAllGamesFromDB('all', activeOrganizationId)
          ]);

          const enrichedSeries: SeriesWithStatus[] = seriesFromDB.map(series => {
            const gamesForThisSeries = allOrgGames.filter(g => g.seriesId === series.id);
            const playedGames = gamesForThisSeries.filter(g => {
                try { return isPast(parseISO(g.date)) || isToday(parseISO(g.date)); } catch { return false; }
            });

            let ratingStatus: SeriesRatingStatus = 'no_ratings';
            if (playedGames.length > 0) {
              const allPlayedAreFinalized = playedGames.every(g => g.ratingsFinalized === true);
              ratingStatus = allPlayedAreFinalized ? 'certified' : 'pending';
            }
            return { ...series, ratingStatus };
          });

          setSeriesForDropdown(enrichedSeries);
          
          if (selectedSeriesIdForTabs && !enrichedSeries.some(s => s.id === selectedSeriesIdForTabs)) {
            setSelectedSeriesIdForTabs(null);
            setSelectedSeriesNameForTabs(null);
            setSelectedSeriesDetails(null);
            setShowCriteria(false);
          }

          const years = [...new Set(enrichedSeries.map(s => s.year.toString()))].sort((a, b) => parseInt(b) - parseInt(a));
          setAvailableYears(years);
          if (years.length > 0 && !selectedYear) {
            setSelectedYear(years[0]);
          }

        } else {
          setSeriesForDropdown([]);
          setAvailableYears([]);
          setSelectedYear('');
        }
      } catch (e) {
        console.error("Failed to fetch series for user view", e);
        setSeriesForDropdown([]);
        setAvailableYears([]);
        toast({ title: 'Error', description: 'Could not fetch available series.', variant: 'destructive' });
      } finally {
        setIsFetchingSeries(false);
      }
    };
    fetchSeriesAndGameData();
  }, [userProfile, activeOrganizationId, authLoading, toast]);
  
  const handleSeriesChange = useCallback((newSeriesId: string | null) => {
    setSelectedSeriesIdForTabs(newSeriesId);
    if (newSeriesId) {
      const seriesDetails = seriesForDropdown.find(s => s.id === newSeriesId);
      setSelectedSeriesDetails(seriesDetails || null);
      setSelectedSeriesNameForTabs(seriesDetails?.name || null);
      
      const hasSavedTeam = seriesDetails?.savedAiTeam && seriesDetails.savedAiTeam.length > 0;
      const hasGameData = seriesDetails?.ratingStatus !== 'no_ratings';

      setShowCriteria(!hasSavedTeam && hasGameData);

    } else {
      setSelectedSeriesNameForTabs(null);
      setSelectedSeriesDetails(null);
      setShowCriteria(false);
    }
    setErrorAI(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('aiTeamSuggestionResult');
      sessionStorage.removeItem('aiTeamSuggestionMessage');
      sessionStorage.removeItem('aiTeamSuggestionSeriesId');
      sessionStorage.removeItem('aiTeamSuggestionSeriesName');
    }
  }, [seriesForDropdown]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    handleSeriesChange(null);
  }, [selectedYear, ratingStatusFilter, handleSeriesChange]);


  const handleFormSubmit = async (data: TeamCompositionFormValues) => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('aiTeamSuggestionResult');
      sessionStorage.removeItem('aiTeamSuggestionMessage');
      sessionStorage.removeItem('aiTeamSuggestionSeriesId');
      sessionStorage.removeItem('aiTeamSuggestionSeriesName');
    }
    setIsLoadingAI(true);
    setErrorAI(null);

    const { seriesId, minPrimarySkillScore, minFieldingScore, minGamesPlayed, fitnessFilterOption, minFitnessTestScore, ...aiCriteria } = data;

    if (!seriesId) {
        setErrorAI("No series selected. Please select a series to proceed.");
        setIsLoadingAI(false);
        toast({ title: 'Error', description: "Please select a series.", variant: 'destructive' });
        return;
    }
    
    if (seriesId !== selectedSeriesIdForTabs) {
        handleSeriesChange(seriesId);
    }

    const result = await suggestTeam({
      seriesId,
      minPrimarySkillScore,
      minFieldingScore,
      minGamesPlayed,
      fitnessFilterOption,
      minFitnessTestScore,
      criteria: aiCriteria,
    });

    if (result.success && result.team) {
      if (typeof window !== 'undefined') {
          sessionStorage.setItem('aiTeamSuggestionResult', JSON.stringify(result.team));
          sessionStorage.setItem('aiTeamSuggestionSeriesId', seriesId);
          const seriesDetails = seriesForDropdown.find(s => s.id === seriesId);
          if (seriesDetails) {
            sessionStorage.setItem('aiTeamSuggestionSeriesName', seriesDetails.name);
          }
          if (result.message) {
            sessionStorage.setItem('aiTeamSuggestionMessage', result.message);
          }
          router.push('/team-composition/results');
      }
      toast({
        title: 'Team Suggestion Ready!',
        description: result.message || 'The AI has generated a team composition. Navigating to results...',
      });

    } else if (!result.success && result.error) {
      setErrorAI(result.error);
      toast({
        title: 'Error Generating Team',
        description: result.error,
        variant: 'destructive',
      });
    } else {
      const unknownErrorMsg = "An unexpected error occurred or no team data was returned from AI.";
      setErrorAI(unknownErrorMsg);
      toast({
        title: 'Error',
        description: unknownErrorMsg,
        variant: 'destructive',
      });
    }
    setIsLoadingAI(false);
  };
  
  const filteredSeries = useMemo(() => {
    return seriesForDropdown.filter(series => {
        const yearMatch = selectedYear === '' || series.year.toString() === selectedYear;
        const statusMatch = ratingStatusFilter === 'all' || series.ratingStatus === ratingStatusFilter;
        return yearMatch && statusMatch;
    });
  }, [seriesForDropdown, selectedYear, ratingStatusFilter]);


  const rankingTabsDisabled = !selectedSeriesIdForTabs || authLoading || isLoadingAI || isFetchingSeries;
  const showRankingTabs = selectedSeriesIdForTabs && selectedSeriesDetails?.ratingStatus !== 'no_ratings';
  
  if (!mounted || authLoading || (isFetchingSeries && !userProfile)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading Team AI tool...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!activeOrganizationId && !authLoading ? (
         <Alert variant="default" className="border-primary/50 mt-8">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>No Organization Selected</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar to use the Team AI tool and view rankings.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="team-composition" className="w-full">
          <Popover open={showPopover}>
              <PopoverTrigger asChild>
                  <TabsList className={cn(
                    "grid w-full h-auto mb-6 transition-all duration-300",
                    !showRankingTabs && "grid-cols-1",
                    showRankingTabs && "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
                    isAnimatingTabs && "animate-glow-once"
                  )}>
                    <TabsTrigger value="team-composition" className="flex items-center gap-2">
                        <Target className="h-4 w-4"/>Team AI
                    </TabsTrigger>
                    
                    {showRankingTabs && (
                      <>
                        <TabsTrigger value="batting-ranking" disabled={rankingTabsDisabled} className="data-[state=active]:text-primary animate-in fade-in slide-in-from-top-3" style={{ animationDuration: '400ms', animationDelay: '0ms', animationFillMode: 'backwards' }}><CricketBatIcon className="h-4 w-4 mr-2"/>Batting</TabsTrigger>
                        <TabsTrigger value="bowling-ranking" disabled={rankingTabsDisabled} className="data-[state=active]:text-primary animate-in fade-in slide-in-from-top-3" style={{ animationDuration: '400ms', animationDelay: '80ms', animationFillMode: 'backwards' }}><CricketBallIcon className="h-4 w-4 mr-2"/>Bowling</TabsTrigger>
                        <TabsTrigger value="wicketkeeping-ranking" disabled={rankingTabsDisabled} className="data-[state=active]:text-primary animate-in fade-in slide-in-from-top-3" style={{ animationDuration: '400ms', animationDelay: '160ms', animationFillMode: 'backwards' }}><WicketKeeperGloves className="h-4 w-4 mr-2"/>Wicket Keeping</TabsTrigger>
                        <TabsTrigger value="fielding-ranking" disabled={rankingTabsDisabled} className="data-[state=active]:text-primary animate-in fade-in slide-in-from-top-3" style={{ animationDuration: '400ms', animationDelay: '240ms', animationFillMode: 'backwards' }}><Shield className="h-4 w-4 mr-2"/>Fielding</TabsTrigger>
                        <TabsTrigger value="allrounder-ranking" disabled={rankingTabsDisabled} className="data-[state=active]:text-primary animate-in fade-in slide-in-from-top-3" style={{ animationDuration: '400ms', animationDelay: '320ms', animationFillMode: 'backwards' }}><BarChart3 className="h-4 w-4 mr-2"/>All-Rounder</TabsTrigger>
                      </>
                    )}
                  </TabsList>
              </PopoverTrigger>
              <PopoverContent side="top" align="center" className="w-auto px-3 py-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <span>Player rankings are now available in the new tabs.</span>
                </div>
              </PopoverContent>
          </Popover>
          
          <TabsContent value="team-composition">
             <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                  <Target className="h-6 w-6"/>
                  AI Team Composition
                </CardTitle>
                <CardDescription>
                  Select a series, define criteria, and let AI suggest a team. View player rankings in the tabs above after selecting a series.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isFetchingSeries ? (
                  <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="ml-2 text-muted-foreground">Fetching available series...</p>
                  </div>
                ) : seriesForDropdown.length > 0 ? (
                  <TeamCompositionForm
                    allSeriesPassed={filteredSeries}
                    availableYears={availableYears}
                    onSubmit={handleFormSubmit}
                    isLoading={isLoadingAI}
                    selectedYear={selectedYear}
                    onYearChange={setSelectedYear}
                    onSeriesChange={handleSeriesChange}
                    selectedSeriesId={selectedSeriesIdForTabs}
                    selectedSeriesDetails={selectedSeriesDetails}
                    showCriteria={showCriteria}
                    onRegenerateClick={() => setShowCriteria(true)}
                    ratingStatusFilter={ratingStatusFilter}
                    onRatingStatusChange={setRatingStatusFilter}
                  />
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>No Active Series Found</AlertTitle>
                    <AlertDescription>
                      There are no active series available for you in the current organization. Please add or unarchive a series, or check your assignments.
                    </AlertDescription>
                  </Alert>
                )}
                 {isLoadingAI && (
                  <div className="mt-6 flex justify-center items-center py-10">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="ml-2 text-muted-foreground">Generating team suggestion...</p>
                  </div>
                )}
                 {errorAI && !isLoadingAI && (
                  <Alert variant="destructive" className="mt-6">
                    <Terminal className="h-4 w-4" />
                    <AlertTitle>Error Generating AI Suggestion</AlertTitle>
                    <AlertDescription>{errorAI}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {showRankingTabs && (
            <>
              <TabsContent value="batting-ranking">
                  <BattingRankingTab selectedSeriesId={selectedSeriesIdForTabs} selectedSeriesName={selectedSeriesNameForTabs} />
              </TabsContent>
              <TabsContent value="bowling-ranking">
                  <BowlingRankingTab selectedSeriesId={selectedSeriesIdForTabs} selectedSeriesName={selectedSeriesNameForTabs} />
              </TabsContent>
              <TabsContent value="wicketkeeping-ranking">
                  <WicketKeepingRankingTab selectedSeriesId={selectedSeriesIdForTabs} selectedSeriesName={selectedSeriesNameForTabs} />
              </TabsContent>
              <TabsContent value="fielding-ranking">
                  <FieldingRankingTab selectedSeriesId={selectedSeriesIdForTabs} selectedSeriesName={selectedSeriesNameForTabs} />
              </TabsContent>
              <TabsContent value="allrounder-ranking">
                  <AllRounderRankingTab selectedSeriesId={selectedSeriesIdForTabs} selectedSeriesName={selectedSeriesNameForTabs} />
              </TabsContent>
            </>
          )}

        </Tabs>
      )}
    </div>
  );
}
