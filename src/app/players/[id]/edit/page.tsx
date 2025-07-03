
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PlayerForm } from '@/components/player-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getPlayerDetailsAction } from '@/lib/actions/player-actions';
import type { PlayerWithRatings, Team } from '@/types';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { getAllTeamsFromDB } from '@/lib/db';

export default function EditPlayerPage() {
  const params = useParams<{ id: string }>();
  const playerId = params.id;
  const { userProfile, activeOrganizationId, isAuthLoading } = useAuth();

  const [player, setPlayer] = useState<PlayerWithRatings | null>(null);
  const [teamsForForm, setTeamsForForm] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!playerId || isAuthLoading) return;

      setLoading(true);
      setError(null);
      try {
        const playerDetails = await getPlayerDetailsAction(playerId);
        if (!playerDetails) {
          setError("Player not found.");
        } else {
          // Authorization check: User must be able to edit THIS specific player.
          const isSuperAdmin = userProfile?.roles.includes('admin');
          const isOrgAdmin = userProfile?.roles.includes('Organization Admin') && playerDetails.organizationId === activeOrganizationId;
          const isOwnProfile = userProfile?.playerId === playerDetails.id;
          
          if (!isSuperAdmin && !isOrgAdmin && !isOwnProfile) {
             setError("You are not authorized to edit this player's profile.");
             setPlayer(null);
          } else {
            setPlayer(playerDetails);
            if (playerDetails.organizationId) {
              const orgTeams = await getAllTeamsFromDB(playerDetails.organizationId);
              setTeamsForForm(orgTeams);
            }
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch data for edit page:", err);
        setError(err.message || "Could not load data for this player.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [playerId, isAuthLoading, userProfile, activeOrganizationId]);
  
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="ml-2 text-muted-foreground">Loading player data...</p>
        </div>
      );
    }
    if (error || !player) {
      return (
        <Alert variant="destructive" className="mt-8">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>{error ? 'Error' : 'Player Not Found'}</AlertTitle>
          <AlertDescription>
            {error || 'The player you are trying to edit does not exist or you lack permission.'}
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <PlayerForm
        initialData={player}
        allTeams={teamsForForm}
      />
    );
  };

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_PLAYER_EDIT}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to view player edit pages.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={playerId ? `/players/${playerId}` : '/players'}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Profile
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">
              Edit Player: {loading ? '...' : (player?.name || 'Not Found')}
            </CardTitle>
            <CardDescription>
              Modify the details for this player.
            </CardDescription>
          </CardHeader>
          <CardContent>{renderContent()}</CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
