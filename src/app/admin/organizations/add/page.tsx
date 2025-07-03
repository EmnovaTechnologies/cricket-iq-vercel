'use client';

import { useState, useEffect } from 'react';
import { OrganizationForm } from '@/components/organization-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAllUsersFromDB } from '@/lib/db';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import type { UserProfile } from '@/types';

export default function AddOrganizationPage() {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const users = await getAllUsersFromDB();
        setAllUsers(users);
      } catch (err) {
        console.error("Failed to fetch users for admin selection:", err);
        setError("Could not load necessary user data for the form.");
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_ADD}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to add new organizations (requires '{PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_ADD}' permission).
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Add New Organization</CardTitle>
            <CardDescription>
              Define a new organization, assign administrators, and set initial branding preferences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2 text-muted-foreground">Loading form data...</p>
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <ShieldAlert className="h-5 w-5" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              <OrganizationForm allUsersForAdminSelection={allUsers} />
            )}
          </CardContent>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
