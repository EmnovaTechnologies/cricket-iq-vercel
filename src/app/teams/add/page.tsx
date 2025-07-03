
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { TeamForm } from '@/components/team-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldAlert, Info } from 'lucide-react';
import { getAllPotentialTeamManagers } from '@/lib/actions/user-actions';
import type { UserProfile, AgeCategory } from '@/types';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';

export default function AddTeamPage() {
  const { activeOrganizationId, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [potentialTeamManagers, setPotentialTeamManagers] = useState<UserProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const seriesIdToLink = searchParams.get('seriesIdToLink');
  const seriesAgeCategoryToEnforce = searchParams.get('seriesAgeCategoryToEnforce') as AgeCategory | null;

  useEffect(() => {
    const fetchData = async () => {
      setDataLoading(true);
      try {
        const potentialManagers = await getAllPotentialTeamManagers();
        setPotentialTeamManagers(potentialManagers);
      } catch (error) {
        console.error("Error fetching potential team managers:", error);
        setPotentialTeamManagers([]);
      } finally {
        setDataLoading(false);
      }
    };
    fetchData();
  }, []);

  if (authLoading || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_TEAM_ADD}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to add new teams.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        {!activeOrganizationId ? (
          <Alert variant="default" className="border-primary/50">
            <Info className="h-5 w-5 text-primary" />
            <AlertTitle>Organization Required</AlertTitle>
            <AlertDescription>
              Please select an active organization from the dropdown in the navbar to add a new team.
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-headline text-primary">Add New Team</CardTitle>
              <CardDescription>
                Enter the details for the new team.
                {seriesIdToLink && seriesAgeCategoryToEnforce && ` This team will be pre-configured for the ${seriesAgeCategoryToEnforce} category and linked to the originating series.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TeamForm 
                potentialTeamManagers={potentialTeamManagers} 
                preselectedSeriesIdToLink={seriesIdToLink || undefined}
                preselectedSeriesAgeCategoryToEnforce={seriesAgeCategoryToEnforce || undefined}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
