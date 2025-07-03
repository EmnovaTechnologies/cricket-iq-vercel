
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { getSeriesByIdFromDB } from '@/lib/db';
import type { Series } from '@/types';
import { SuggestedTeamTable } from '@/components/suggested-team-table';

import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ArrowLeft, ShieldAlert, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SavedTeamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seriesId = params.id;

  // State for the back button
  const [backPath, setBackPath] = useState(`/series/${seriesId}/details`);
  const [backButtonText, setBackButtonText] = useState('Back to Series Details');

  // This effect will run on the client side after hydration and update the button
  // based on the URL search parameter.
  useEffect(() => {
    console.log('[SavedTeamPage] useEffect for searchParams is running.');
    const from = searchParams.get('from');
    console.log(`[SavedTeamPage] 'from' parameter value:`, from);

    if (from === 'ai-composition') {
      const newPath = '/team-composition';
      const newText = 'Back to AI Composition';
      console.log(`[SavedTeamPage] Setting back button to:`, { path: newPath, text: newText });
      setBackPath(newPath);
      setBackButtonText(newText);
    } else {
      const defaultPath = `/series/${seriesId}/details`;
      const defaultText = 'Back to Series Details';
      console.log(`[SavedTeamPage] Setting back button to default:`, { path: defaultPath, text: defaultText });
      setBackPath(defaultPath);
      setBackButtonText(defaultText);
    }
  }, [searchParams, seriesId]);

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
          throw new Error("The series you are looking for does not exist.");
        }
        if (!seriesData.savedAiTeam || seriesData.savedAiTeam.length === 0) {
          throw new Error("This series does not have a saved AI team suggestion.");
        }
      } catch (err: any) {
        setError(err.message || "Failed to load saved team data.");
        console.error("Error fetching saved team data:", err);
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
        <p className="ml-4 text-lg text-muted-foreground">Loading saved team...</p>
      </div>
    );
  }

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.SERIES_VIEW_SAVED_AI_TEAM}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to view saved AI teams.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={backPath}><ArrowLeft className="mr-2 h-4 w-4" /> {backButtonText}</Link>
          </Button>
        </div>

        {error && (
            <Alert variant="destructive" className="mt-8">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle>Error Loading Data</AlertTitle>
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
        )}

        {series && series.savedAiTeam && (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                <Target className="h-6 w-6" /> Saved AI Team Suggestion
              </CardTitle>
              <CardDescription>
                This is the saved team composition for the series: <strong>{series.name}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SuggestedTeamTable suggestedTeam={series.savedAiTeam} />
            </CardContent>
          </Card>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
