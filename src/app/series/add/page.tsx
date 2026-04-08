'use client';

import { useEffect, useState } from 'react';
import { SeriesForm } from '@/components/series-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldAlert, ArrowLeft, Info } from 'lucide-react';
import type { UserProfile } from '@/types';
import { getPotentialSeriesAdminsForOrg } from '@/lib/actions/user-actions';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AddSeriesPage() {
  const { activeOrganizationId, isAuthLoading } = useAuth();
  const [potentialSeriesAdmins, setPotentialSeriesAdmins] = useState<UserProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!activeOrganizationId) { setDataLoading(false); return; }

    async function fetchAdmins() {
      try {
        const admins = await getPotentialSeriesAdminsForOrg(activeOrganizationId!);
        setPotentialSeriesAdmins(admins);
      } catch (error) {
        console.error("Error fetching potential series admins:", error);
        setPotentialSeriesAdmins([]);
      } finally {
        setDataLoading(false);
      }
    }
    fetchAdmins();
  }, [activeOrganizationId, isAuthLoading]);

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.SERIES_ADD}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to add new series. This requires the '{PERMISSIONS.SERIES_ADD}' permission.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/series">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Series List
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Add New Series</CardTitle>
            <CardDescription>Enter the details for the new series and optionally assign administrators.</CardDescription>
          </CardHeader>
          <CardContent>
            {!activeOrganizationId && !isAuthLoading ? (
              <Alert variant="default" className="border-primary/50">
                <Info className="h-5 w-5 text-primary" />
                <AlertTitle>No Organization Selected</AlertTitle>
                <AlertDescription>Please select an active organization from the navbar before adding a series.</AlertDescription>
              </Alert>
            ) : dataLoading || isAuthLoading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2 text-muted-foreground">Loading admin data...</p>
              </div>
            ) : (
              <SeriesForm potentialSeriesAdmins={potentialSeriesAdmins} />
            )}
          </CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
