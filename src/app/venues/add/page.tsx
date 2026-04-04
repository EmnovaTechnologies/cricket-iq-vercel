'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { VenueForm } from '@/components/venue-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function AddVenueForm() {
  const searchParams = useSearchParams();
  const seriesIdToLink = searchParams.get('seriesIdToLink');

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_VENUE_ADD}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to add new venues. This action requires the '{PERMISSIONS.PAGE_VIEW_VENUE_ADD}' permission.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/venues"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Venues List</Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Add New Venue</CardTitle>
            <CardDescription>
              Enter the details for the new venue.
              {seriesIdToLink && " This venue will be automatically linked to the series you came from."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VenueForm preselectedSeriesIdToLink={seriesIdToLink || undefined} />
          </CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}

export default function AddVenuePage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading...</p>
      </div>
    }>
      <AddVenueForm />
    </Suspense>
  );
}
