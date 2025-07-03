
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import VenueCard from '@/components/venue-card';
import { getAllVenuesFromDB } from '@/lib/db';
import type { Venue, VenueStatus } from '@/types';
import { PlusCircle, MapPinned, Search as SearchIcon, Filter, ShieldAlert, Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react'; // Added useCallback
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { VENUE_STATUSES } from '@/lib/constants';

export default function VenuesPage() {
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [searchName, setSearchName] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<VenueStatus | 'all'>('active');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { effectivePermissions, isPermissionsLoading, loading: authLoading, activeOrganizationId } = useAuth();

  const fetchVenues = useCallback(async () => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }
    if (!activeOrganizationId) {
      setAllVenues([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // Pass selectedStatus to getAllVenuesFromDB
      const venuesFromDB = await getAllVenuesFromDB(activeOrganizationId, selectedStatus);
      setAllVenues(venuesFromDB);
    } catch (error) {
      console.error("Failed to fetch venues:", error);
      toast({ title: "Error", description: "Could not fetch venues list.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [toast, authLoading, activeOrganizationId, selectedStatus]); // Added selectedStatus as dependency

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]); 

  const filteredVenues = useMemo(() => {
    // Client-side filtering might still be useful for name/address if DB doesn't support complex text search easily
    // But status filtering is now primarily handled by the DB query if `getAllVenuesFromDB` is efficient
    return allVenues.filter(venue => {
      const nameMatch = !searchName || venue.name.toLowerCase().includes(searchName.toLowerCase());
      const addressMatch = !searchAddress || venue.address.toLowerCase().includes(searchAddress.toLowerCase());
      // Status match is implicitly handled if `getAllVenuesFromDB` filters by status.
      // If `selectedStatus` is 'all', `getAllVenuesFromDB` returns all, then client-side ensures they are displayed.
      // If `selectedStatus` is 'active' or 'archived', `getAllVenuesFromDB` already filtered.
      return nameMatch && addressMatch;
    });
  }, [allVenues, searchName, searchAddress]);

  const canViewPage = effectivePermissions[PERMISSIONS.PAGE_VIEW_VENUES_LIST];
  const canAddVenues = effectivePermissions[PERMISSIONS.PAGE_VIEW_VENUE_ADD];

  if (authLoading || isPermissionsLoading || (isLoading && canViewPage)) {
    return (
        <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Loading venues...</p>
        </div>
    );
  }

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_VENUES_LIST}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to view the list of venues. This action requires the '{PERMISSIONS.PAGE_VIEW_VENUES_LIST}' permission.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <MapPinned className="h-8 w-8" /> Venues
          </h1>
          {(canAddVenues && !isPermissionsLoading) && (
            <Button asChild className="bg-primary hover:bg-primary/90" disabled={!activeOrganizationId}>
              <Link href="/venues/add" className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5" /> Add New Venue
              </Link>
            </Button>
          )}
          {(isPermissionsLoading) && ( 
            <Button disabled className="bg-primary hover:bg-primary/90">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Add New Venue
            </Button>
          )}
        </div>
         {!activeOrganizationId && !authLoading && (
          <Alert variant="default" className="border-primary/50">
             <MapPinned className="h-5 w-5 text-primary" />
            <AlertTitle>No Organization Selected</AlertTitle>
            <AlertDescription>
              Please select an active organization from the dropdown in the navbar to view or manage venues.
            </AlertDescription>
          </Alert>
        )}

        {activeOrganizationId && (
          <>
            <Card className="p-4 sm:p-6 shadow">
              <CardHeader className="p-0 pb-4 mb-4 border-b">
                <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                  <Filter className="h-5 w-5" /> Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="venue-name-search" className="block text-sm font-medium text-muted-foreground mb-1">Search by Name</label>
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="venue-name-search"
                        type="search"
                        placeholder="Venue name..."
                        value={searchName}
                        onChange={(e) => setSearchName(e.target.value)}
                        className="pl-10 w-full h-10 rounded-md shadow-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="venue-address-search" className="block text-sm font-medium text-muted-foreground mb-1">Search by Address</label>
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        id="venue-address-search"
                        type="search"
                        placeholder="Address..."
                        value={searchAddress}
                        onChange={(e) => setSearchAddress(e.target.value)}
                        className="pl-10 w-full h-10 rounded-md shadow-sm"
                      />
                    </div>
                  </div>
                   <div>
                    <label htmlFor="venue-status-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Status</label>
                    <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as VenueStatus | 'all')}>
                      <SelectTrigger id="venue-status-filter" className="w-full h-10 rounded-md shadow-sm">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {VENUE_STATUSES.map(status => (
                          <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isLoading && canViewPage ? (
              <p className="text-muted-foreground text-center py-6">Loading venues...</p>
            ) : filteredVenues.length === 0 && canViewPage ? (
              <p className="text-muted-foreground text-center py-6">
                {searchName || searchAddress || selectedStatus !== 'all' ? 'No venues found matching your criteria for this organization.' : 'No venues found for this organization. Add some to get started.'}
              </p>
            ) : canViewPage ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVenues.map((venueItem) => (
                  <VenueCard key={venueItem.id} venue={venueItem} onStatusChange={fetchVenues} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}

