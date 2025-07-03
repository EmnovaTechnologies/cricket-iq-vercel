
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getPlayerDetailsAction } from '@/lib/actions/player-actions';
import type { PlayerWithRatings } from '@/types';
import { PlayerDetailsView } from '@/components/player-page/player-details-view';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function PlayerProfilePage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const playerIdFromUrl = params.id;

  const {
    userProfile,
    isAuthLoading,
    effectivePermissions,
    isPermissionsLoading,
  } = useAuth();

  const [currentPlayerDetails, setCurrentPlayerDetails] = useState<PlayerWithRatings | null>(null);
  const [isLoadingPlayerDetails, setIsLoadingPlayerDetails] = useState(true);

  useEffect(() => {
    if (isAuthLoading) {
      return; // Wait for auth to complete before fetching
    }
    if (playerIdFromUrl) {
      setIsLoadingPlayerDetails(true);
      const fetchDetails = async () => {
        try {
          const playerDetails = await getPlayerDetailsAction(playerIdFromUrl);
          setCurrentPlayerDetails(playerDetails);

          if (!playerDetails) {
            toast({ title: "Player Not Found", description: "Could not load details for this player.", variant: "destructive" });
          }
        } catch (error) {
          console.error("Failed to fetch player details:", error);
          toast({ title: "Error", description: "Failed to load player details.", variant: "destructive" });
          setCurrentPlayerDetails(null);
        } finally {
          setIsLoadingPlayerDetails(false);
        }
      };
      fetchDetails();
    } else {
      setCurrentPlayerDetails(null);
      setIsLoadingPlayerDetails(false);
    }
  }, [playerIdFromUrl, toast, isAuthLoading]);
  
  const isLoading = isAuthLoading || isPermissionsLoading || isLoadingPlayerDetails;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading player profile...</p>
      </div>
    );
  }

  // Permission checks are now handled within AuthProviderClientComponent
  
  return (
    <AuthProviderClientComponent
        requiredPermission={PERMISSIONS.PAGE_VIEW_PLAYER_DETAILS}
        FallbackComponent={
            <div className="max-w-2xl mx-auto">
                <Alert variant="destructive" className="mt-8">
                <ShieldAlert className="h-5 w-5" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>
                    You do not have permission to view player details.
                </AlertDescription>
                </Alert>
            </div>
        }
    >
        <div className="space-y-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/players">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Players
            </Link>
          </Button>
        {currentPlayerDetails ? (
            <ScrollArea className="h-[calc(100vh-var(--header-height,4rem)-var(--footer-height,4rem)-8rem)] pr-4">
              <PlayerDetailsView player={currentPlayerDetails} effectivePermissions={effectivePermissions} userProfile={userProfile} />
            </ScrollArea>
        ) : (
            <div className="p-6 text-center text-muted-foreground">Player not found or no player ID specified in the URL.</div>
        )}
        </div>
    </AuthProviderClientComponent>
  );
}
