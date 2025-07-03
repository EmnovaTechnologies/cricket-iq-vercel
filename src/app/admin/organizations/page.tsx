'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import OrganizationCard from '@/components/organization-card';
import { getAllOrganizationsFromDB } from '@/lib/db';
import type { Organization } from '@/types';
import { PlusCircle, Building, ShieldAlert, Loader2, AlertCircle } from 'lucide-react';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';

export default function OrganizationsListPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // This function runs only after AuthProviderClientComponent has confirmed permissions.
    async function fetchOrganizations() {
      setLoading(true);
      setError(null);
      try {
        const orgs = await getAllOrganizationsFromDB();
        setOrganizations(orgs);
      } catch (err: any) {
        console.error("Failed to fetch organizations:", err);
        setError("Could not load organizations. You may not have the required permissions.");
      } finally {
        setLoading(false);
      }
    }
    
    fetchOrganizations();
    
  }, []); // Run once on mount

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4 text-muted-foreground">Loading organizations...</p>
        </div>
      );
    }
    if (error) {
       return (
        <Alert variant="destructive" className="mt-8">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error Loading Organizations</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }
    if (organizations.length === 0) {
      return (
        <p className="text-muted-foreground text-center py-6">
          No organizations found. Add one to get started.
        </p>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {organizations.map((org) => (
          <OrganizationCard key={org.id} organization={org} />
        ))}
      </div>
    );
  };
  

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATIONS_LIST}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to view organizations. This action is restricted to super administrators (requires '{PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATIONS_LIST}' permission).
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Building className="h-8 w-8" /> Organizations
          </h1>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link href="/admin/organizations/add" className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5" /> Add New Organization
            </Link>
          </Button>
        </div>
        {renderContent()}
      </div>
    </AuthProviderClientComponent>
  );
}
