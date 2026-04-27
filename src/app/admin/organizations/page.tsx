'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import OrganizationCard from '@/components/organization-card';
import OrganizationListRow from '@/components/organization-list-row';
import { getAllOrganizationsFromDB } from '@/lib/db';
import type { Organization } from '@/types';
import { PlusCircle, Building, ShieldAlert, Loader2, AlertCircle, Filter, Search as SearchIcon, LayoutGrid, List } from 'lucide-react';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';

function OrganizationsListPageInner() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchParams = useSearchParams();
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>(
    (searchParams.get('status') as 'all' | 'active' | 'inactive') || 'all'
  );
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  useEffect(() => {
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
  }, []);

  const filteredOrgs = useMemo(() => {
    return organizations.filter(org => {
      const nameMatch = !searchQuery || org.name.toLowerCase().includes(searchQuery.toLowerCase());
      const statusMatch = selectedStatus === 'all' || org.status === selectedStatus;
      return nameMatch && statusMatch;
    });
  }, [organizations, searchQuery, selectedStatus]);

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
    if (filteredOrgs.length === 0) {
      return (
        <p className="text-muted-foreground text-center py-6">
          No organizations match your filters.
        </p>
      );
    }
    return viewMode === 'cards' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOrgs.map(org => (
          <OrganizationCard key={org.id} organization={org} />
        ))}
      </div>
    ) : (
      <div className="border rounded-lg overflow-hidden bg-card">
        {filteredOrgs.map((org, idx) => (
          <OrganizationListRow key={org.id} organization={org} isLast={idx === filteredOrgs.length - 1} />
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

        {/* Filters */}
        <Card className="p-4 sm:p-6 shadow">
          <CardHeader className="p-0 pb-4 mb-4 border-b">
            <CardTitle className="text-xl flex items-center gap-2 text-foreground">
              <Filter className="h-5 w-5" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px] relative">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Search by Name</label>
                <SearchIcon className="absolute left-3 top-[calc(50%_+_6px)] -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search organizations..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10 h-10"
                  disabled={loading}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Status</label>
                <Select value={selectedStatus} onValueChange={v => setSelectedStatus(v as typeof selectedStatus)} disabled={loading}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col items-end justify-end gap-1">
                <span className="text-xs text-muted-foreground">{filteredOrgs.length} {filteredOrgs.length === 1 ? 'organization' : 'organizations'}</span>
                <div className="flex rounded-md border border-input overflow-hidden">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                    title="Card view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-l border-input ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {renderContent()}
      </div>
    </AuthProviderClientComponent>
  );
}

export default function OrganizationsListPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <OrganizationsListPageInner />
    </Suspense>
  );
}
