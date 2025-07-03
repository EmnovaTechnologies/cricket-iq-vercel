
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import type { Organization, Team } from '@/types';
import { getOrganizationByIdAction } from '@/lib/actions/organization-actions';
import { getAllTeamsFromDB } from '@/lib/db';
import { PlayerRegistrationForm } from '@/components/player/player-registration-form';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Building, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PlayerRegistrationPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const router = useRouter();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setError("No organization ID provided in the URL.");
      setIsLoading(false);
      return;
    }

    const fetchOrgData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const orgData = await getOrganizationByIdAction(orgId);
        if (!orgData || orgData.status !== 'active') {
          throw new Error("This organization is not active or does not exist.");
        }
        setOrganization(orgData);

        const orgTeams = await getAllTeamsFromDB(orgId);
        setTeams(orgTeams);

      } catch (err: any) {
        setError(err.message || "Could not load organization details.");
        setOrganization(null);
        setTeams([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrgData();
  }, [orgId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading organization details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-center">
        <Alert variant="destructive" className="max-w-lg">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Error Loading Registration</AlertTitle>
          <AlertDescription>
            {error}
            <Button asChild variant="outline" className="mt-4">
                <Link href="/">Return to Homepage</Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (!organization) {
    return null; // Should be covered by error state
  }


  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center items-center gap-3 mb-2">
            {organization.branding?.logoUrl ? (
                <Image
                    src={organization.branding.logoUrl}
                    alt={`${organization.name} Logo`}
                    width={48}
                    height={48}
                    className="h-12 w-12 object-contain rounded-md"
                    data-ai-hint="organization logo medium"
                />
            ) : (
                <Building className="h-10 w-10 text-muted-foreground" />
            )}
           </div>
          <CardTitle className="text-2xl font-headline text-primary">Player Registration</CardTitle>
          <CardDescription>Register as a player for <strong className="text-accent">{organization.name}</strong>.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlayerRegistrationForm organization={organization} teams={teams} />
        </CardContent>
      </Card>
    </div>
  );
}
