
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { PlayerForm } from '@/components/player-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAllTeamsFromDB } from '@/lib/db';
import type { Team, AgeCategory } from '@/types';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { ShieldAlert, Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSearchParams } from 'next/navigation'; // Import useSearchParams

export default function AddPlayerPage() {
  const { activeOrganizationId, loading: authLoading } = useAuth();
  const [teamsForForm, setTeamsForForm] = useState<Team[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const searchParamsHook = useSearchParams(); // Use the hook

  const preselectedPrimaryTeamId = searchParamsHook.get('primaryTeamId') as string | undefined;
  const preselectedPrimaryTeamName = searchParamsHook.get('primaryTeamName') as string | undefined;
  const preselectedPrimaryTeamAgeCategory = searchParamsHook.get('primaryTeamAgeCategory') as AgeCategory | undefined;
  const preselectedClubName = searchParamsHook.get('clubName') as string | undefined;

  useEffect(() => {
    const fetchData = async () => {
      if (authLoading) {
        setDataLoading(true);
        return;
      }

      setDataLoading(true);
      if (activeOrganizationId) {
        try {
          const orgTeams = await getAllTeamsFromDB(activeOrganizationId);
          setTeamsForForm(orgTeams);
        } catch (error) {
          console.error("Error fetching teams for organization:", error);
          setTeamsForForm([]);
          // Optionally, show a toast message for the error
        }
      } else {
        setTeamsForForm([]); // No active org, so no teams for the form
      }
      setDataLoading(false);
    };

    fetchData();
  }, [activeOrganizationId, authLoading]);

  if (authLoading || dataLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading player creation form...</p>
      </div>
    );
  }

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_PLAYER_ADD}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to add new players. This action requires the '{PERMISSIONS.PAGE_VIEW_PLAYER_ADD}' permission.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        {!activeOrganizationId && !authLoading && (
          <Alert variant="default" className="mb-6 border-primary/50">
            <Info className="h-5 w-5 text-primary" />
            <AlertTitle>Organization Required</AlertTitle>
            <AlertDescription>
              Please select an active organization from the dropdown in the navbar to add a new player. The primary team selection will be filtered based on this organization.
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Add New Player</CardTitle>
            <CardDescription>Enter the details of the new player to add them to the system. Player will be associated with the organization of the selected primary team (if any).</CardDescription>
            {preselectedPrimaryTeamName && preselectedPrimaryTeamAgeCategory && (
               <CardDescription className="pt-2 text-sm !mt-1">
                 Primary team pre-selected: <span className="font-semibold text-accent">{preselectedPrimaryTeamName} ({preselectedPrimaryTeamAgeCategory})</span>.
                 You can change this selection below. Player eligibility for this team will be checked based on its age category.
               </CardDescription>
            )}
             {activeOrganizationId && teamsForForm.length === 0 && !dataLoading && (
               <CardDescription className="pt-2 text-sm !mt-1 text-amber-700">
                 No teams found for the current active organization. You can still add a player without a primary team, or add teams to this organization first.
               </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <PlayerForm
              allTeams={teamsForForm}
              preselectedPrimaryTeamId={preselectedPrimaryTeamId}
              preselectedPrimaryTeamName={preselectedPrimaryTeamName}
              preselectedPrimaryTeamAgeCategory={preselectedPrimaryTeamAgeCategory}
              preselectedClubName={preselectedClubName}
            />
          </CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
