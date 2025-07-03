'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SuggestedTeamTable } from '@/components/suggested-team-table';
import { ArrowLeft, Info, Loader2, BarChart3, Target, Shield, Save, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';
import { BattingRankingTab } from '@/components/rankings/batting-ranking-tab';
import { BowlingRankingTab } from '@/components/rankings/bowling-ranking-tab';
import { WicketKeepingRankingTab } from '@/components/rankings/wicketkeeping-ranking-tab';
import { FieldingRankingTab } from '@/components/rankings/fielding-ranking-tab';
import { AllRounderRankingTab } from '@/components/rankings/all-rounder-ranking-tab';
import type { SuggestedTeam } from '@/ai/flows/suggest-team-composition';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { saveAITeamToSeriesAction } from '@/lib/actions/series-actions';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function TeamCompositionResultsPage() {
  const [suggestedTeam, setSuggestedTeam] = useState<SuggestedTeam | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedSeriesName, setSelectedSeriesName] = useState<string | null>(null);
  
  const { effectivePermissions, isAuthLoading } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [hasBeenSaved, setHasBeenSaved] = useState(false);

  useEffect(() => {
    try {
      const storedTeamJSON = sessionStorage.getItem('aiTeamSuggestionResult');
      const storedMessage = sessionStorage.getItem('aiTeamSuggestionMessage');
      const storedSeriesId = sessionStorage.getItem('aiTeamSuggestionSeriesId');
      const storedSeriesName = sessionStorage.getItem('aiTeamSuggestionSeriesName');

      if (storedTeamJSON && storedTeamJSON !== "undefined" && storedTeamJSON !== "null") {
        const parsedTeam = JSON.parse(storedTeamJSON);
        setSuggestedTeam(parsedTeam as SuggestedTeam);
      } else {
        setError("No team suggestion data found. Please generate a suggestion first.");
      }
      
      if (storedMessage) setMessage(storedMessage);
      if (storedSeriesId) setSelectedSeriesId(storedSeriesId);
      if (storedSeriesName) setSelectedSeriesName(storedSeriesName);
      
      sessionStorage.removeItem('aiTeamSuggestionResult');
      sessionStorage.removeItem('aiTeamSuggestionMessage');
      sessionStorage.removeItem('aiTeamSuggestionSeriesId');
      sessionStorage.removeItem('aiTeamSuggestionSeriesName');

    } catch (e: any) {
      setError(`Failed to load team suggestion results: ${e.message}`);
      setSuggestedTeam(null);
      setMessage(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSaveTeam = async () => {
    if (!selectedSeriesId || !suggestedTeam) {
      toast({ title: "Error", description: "Cannot save team. Series or team data is missing.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const result = await saveAITeamToSeriesAction(selectedSeriesId, suggestedTeam);
    if (result.success) {
      toast({ title: "Team Saved", description: "The AI suggested team has been saved to the series." });
      setHasBeenSaved(true);
    } else {
      toast({ title: "Error Saving Team", description: result.error, variant: "destructive" });
    }
    setIsSaving(false);
  };
  
  const canSaveTeam = effectivePermissions[PERMISSIONS.SERIES_SAVE_AI_TEAM] && selectedSeriesId && suggestedTeam && suggestedTeam.length > 0;

  const renderResultsContent = () => {
    if (error && !suggestedTeam) {
      return (
        <Alert variant="destructive" className="mt-4">
          <Info className="h-4 w-4" />
          <AlertTitle>Error Loading Suggestion</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }
    
    if (suggestedTeam && suggestedTeam.length === 0 && !error) {
       return (
         <Alert variant="default" className="mt-4">
          <Info className="h-4 w-4" />
          <AlertTitle>No Players Suggested</AlertTitle>
          <AlertDescription>
            {message || "The AI could not suggest any players based on the provided criteria and available player data, or all players were filtered out."}
          </AlertDescription>
        </Alert>
      );
    }

    if (suggestedTeam && suggestedTeam.length > 0) {
      return <SuggestedTeamTable suggestedTeam={suggestedTeam} />;
    }
    
    return null;
  };
  
  if (isLoading || isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading suggestion results...</p>
      </div>
    );
  }
  
  const rankingTabsDisabled = !selectedSeriesId;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => router.push('/team-composition')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Criteria
        </Button>
        {canSaveTeam && (
          <Button onClick={handleSaveTeam} disabled={isSaving || hasBeenSaved}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : hasBeenSaved ? (
              <CheckCircle className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : hasBeenSaved ? 'Team Saved' : 'Save Suggested Team'}
          </Button>
        )}
      </div>

      {message && !error && (
        <Alert variant="default">
          <Info className="h-4 w-4" />
          <AlertTitle>AI Message</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      
      <Tabs defaultValue="ai-suggestion" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-6">
          <TabsTrigger value="ai-suggestion"><Target className="h-4 w-4 mr-2"/>AI Suggestion</TabsTrigger>
          <TabsTrigger value="batting-ranking" disabled={rankingTabsDisabled}><CricketBatIcon className="h-4 w-4 mr-2"/>Batting</TabsTrigger>
          <TabsTrigger value="bowling-ranking" disabled={rankingTabsDisabled}><CricketBallIcon className="h-4 w-4 mr-2"/>Bowling</TabsTrigger>
          <TabsTrigger value="wicketkeeping-ranking" disabled={rankingTabsDisabled}><WicketKeeperGloves className="h-4 w-4 mr-2"/>Keeping</TabsTrigger>
          <TabsTrigger value="fielding-ranking" disabled={rankingTabsDisabled}><Shield className="h-4 w-4 mr-2"/>Fielding</TabsTrigger>
          <TabsTrigger value="allrounder-ranking" disabled={rankingTabsDisabled}><BarChart3 className="h-4 w-4 mr-2"/>All-Rounder</TabsTrigger>
        </TabsList>

        <TabsContent value="ai-suggestion">
           <Card>
              <CardHeader>
                <CardTitle>AI Suggested Team for: {selectedSeriesName || 'Selected Series'}</CardTitle>
                <CardDescription>
                  This team composition was generated by AI based on the criteria you provided. You can save this suggestion to the series for future reference.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {renderResultsContent()}
              </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="batting-ranking">
            <BattingRankingTab selectedSeriesId={selectedSeriesId} selectedSeriesName={selectedSeriesName} />
        </TabsContent>
        <TabsContent value="bowling-ranking">
            <BowlingRankingTab selectedSeriesId={selectedSeriesId} selectedSeriesName={selectedSeriesName} />
        </TabsContent>
        <TabsContent value="wicketkeeping-ranking">
            <WicketKeepingRankingTab selectedSeriesId={selectedSeriesId} selectedSeriesName={selectedSeriesName} />
        </TabsContent>
        <TabsContent value="fielding-ranking">
            <FieldingRankingTab selectedSeriesId={selectedSeriesId} selectedSeriesName={selectedSeriesName} />
        </TabsContent>
        <TabsContent value="allrounder-ranking">
            <AllRounderRankingTab selectedSeriesId={selectedSeriesId} selectedSeriesName={selectedSeriesName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
