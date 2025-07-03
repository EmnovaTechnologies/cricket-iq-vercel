
'use client'; // Make it a client component

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GameForm } from '@/components/game-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Series, UserProfile } from '@/types';
import { getAllPotentialGameSelectors } from '@/lib/actions/user-actions';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Info, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAllSeriesFromDB } from '@/lib/db';
import { Button } from '@/components/ui/button';

export default function AddGamePage() {
  const { activeOrganizationId, userProfile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const preselectedSeriesId = searchParams.get('seriesId');

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
          getAllPotentialGameSelectors()
        ]);
        
        setSeriesForForm(seriesFromDB);
        setPotentialSelectors(selectorsFromDB);

      } catch (error) {
        console.error("Error fetching data for Add Game page:", error);
        setSeriesForForm([]);
        setPotentialSelectors([]);
        // Optionally, show a toast or error message here
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
            <Link href={preselectedSeriesId ? `/series/${preselectedSeriesId}/details` : '/series'}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to {preselectedSeriesId ? 'Series Details' : 'Series List'}
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
