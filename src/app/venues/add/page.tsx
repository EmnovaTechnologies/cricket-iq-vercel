'use client';

import { useSearchParams } from 'next/navigation';
import { VenueForm } from '@/components/venue-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AddVenuePage() {
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
            <AlertDescription>
              You do not have permission to add new venues. This action requires the '{PERMISSIONS.PAGE_VIEW_VENUE_ADD}' permission.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/venues">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Venues List
            </Link>
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
