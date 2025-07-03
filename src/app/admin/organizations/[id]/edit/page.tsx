'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { OrganizationForm } from '@/components/organization-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getOrganizationByIdFromDB, getAllUsersFromDB } from '@/lib/db';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import type { Organization, UserProfile } from '@/types';

export default function EditOrganizationPage() {
  const params = useParams<{ id: string }>();
  const orgId = params.id;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!orgId) {
        setError("Organization ID is missing.");
        setLoading(false);
        return;
      }

      try {
        const [orgData, usersData] = await Promise.all([
          getOrganizationByIdFromDB(orgId),
          getAllUsersFromDB(),
        ]);

        if (!orgData) {
          setError("Organization not found.");
        } else {
          setOrganization(orgData);
        }
        setAllUsers(usersData);
      } catch (err: any) {
        console.error("Failed to fetch data for edit page:", err);
        setError(err.message || "Could not load data for the organization.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [orgId]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="ml-2 text-muted-foreground">Loading organization data...</p>
        </div>
      );
    }
    if (error || !organization) {
      return (
        <Alert variant="destructive" className="mt-8">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>{error ? 'Error' : 'Organization Not Found'}</AlertTitle>
          <AlertDescription>
            {error || 'The organization you are trying to edit does not exist.'}
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <OrganizationForm
        initialData={organization}
        allUsersForAdminSelection={allUsers}
      />
    );
  };

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_EDIT}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to edit organizations (requires '{PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_EDIT}' permission).
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href={orgId ? `/admin/organizations/${orgId}/details` : '/admin/organizations'}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Details
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">
              Edit Organization: {loading ? '...' : (organization?.name || 'Not Found')}
            </CardTitle>
            <CardDescription>
              Modify the details, administrators, and branding for this organization.
            </CardDescription>
          </CardHeader>
          <CardContent>{renderContent()}</CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
