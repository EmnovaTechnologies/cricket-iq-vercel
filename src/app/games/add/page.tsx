'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GameForm } from '@/components/game-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Series, UserProfile } from '@/types';
import { getPotentialSelectorsForOrg } from '@/lib/actions/user-actions';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Info, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAllSeriesFromDB } from '@/lib/db';
import { Button } from '@/components/ui/button';

function AddGameForm() {
  const { activeOrganizationId, userProfile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const preselectedSeriesId = searchParams.get('seriesId');
  const from = searchParams.get('from'); // 'games' | null

  // Determine back navigation
  const backHref = preselectedSeriesId
    ? `/series/${preselectedSeriesId}/details`
    : from === 'games'
    ? '/games'
    : '/series';
  const backLabel = preselectedSeriesId
    ? 'Series Details'
    : from === 'games'
    ? 'Games List'
    : 'Series List';

  const [seriesForForm, setSeriesForForm] = useState<Series[]>([]);
  const [potentialSelectors, setPotentialSelectors] = useState<UserProfile[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (authLoading || !userProfile) {
        setIsLoadingData(true);
        return;
      }
      setIsLoadingData(true);
      try {
        const [seriesFromDB, selectorsFromDB] = await Promise.all([
          activeOrganizationId ? getAllSeriesFromDB('active', activeOrganizationId) : Promise.resolve([]),
          activeOrganizationId ? getPotentialSelectorsForOrg(activeOrganizationId) : Promise.resolve([])
        ]);
        setSeriesForForm(seriesFromDB);
        setPotentialSelectors(selectorsFromDB);
      } catch (error) {
        console.error("Error fetching data for Add Game page:", error);
        setSeriesForForm([]);
        setPotentialSelectors([]);
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchData();
  }, [activeOrganizationId, authLoading, userProfile]);

  if (isLoadingData || authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading game creation form...</p>
      </div>
    );
  }

  if (!activeOrganizationId && !authLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <Alert variant="default" className="mt-8 border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>Organization Required</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar to add a new game.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to {backLabel}
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-headline text-primary">Add New Game</CardTitle>
          <CardDescription>Enter the details for the new game and optionally assign selectors.</CardDescription>
        </CardHeader>
        <CardContent>
          <GameForm
            allSeriesForForm={seriesForForm}
            preselectedSeriesId={preselectedSeriesId || undefined}
            potentialSelectors={potentialSelectors}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddGamePage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading game creation form...</p>
      </div>
    }>
      <AddGameForm />
    </Suspense>
  );
}
