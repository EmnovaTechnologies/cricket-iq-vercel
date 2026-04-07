
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import SeriesCard from '@/components/series-card';
import { getAllSeriesFromDB, getGamesByIdsFromDB, getTeamByIdFromDB } from '@/lib/db';
import type { Series } from '@/types';
import { PlusCircle, Layers, Filter, Upload, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { archiveSeriesAction, unarchiveSeriesAction } from '@/lib/actions/series-actions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';

export default function SeriesPage() {
  const { userProfile, activeOrganizationId, loading: authLoading, effectivePermissions, isPermissionsLoading } = useAuth();
  const [allSeries, setAllSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const currentYearString = useMemo(() => new Date().getFullYear().toString(), []);
  const [selectedYear, setSelectedYear] = useState<string>(currentYearString);
  const [selectedStatus, setSelectedStatus] = useState<Series['status'] | 'all'>('active');


  const fetchSeries = async () => {
    if (authLoading || !userProfile) {
        setIsLoading(true);
        return;
    }
    
    // Enforce organization selection for all users for consistency
    if (!activeOrganizationId) {
        setAllSeries([]);
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    try {
      const orgSeries = await getAllSeriesFromDB('all', activeOrganizationId);
      
      let visibleSeriesIds = new Set<string>();
      
      // For Admins and Org Admins, they see all series within the selected organization
      if(userProfile.roles.includes('admin') || userProfile.roles.includes('Organization Admin')) {
        orgSeries.forEach(s => visibleSeriesIds.add(s.id));
      } else { // For other roles, filter based on their specific assignments
        if(userProfile.roles.includes('Series Admin') && userProfile.assignedSeriesIds && userProfile.assignedSeriesIds.length > 0) {
          userProfile.assignedSeriesIds.forEach(id => {
            if (orgSeries.some(s => s.id === id)) {
               visibleSeriesIds.add(id);
            }
          });
        }
        
        if(userProfile.roles.includes('Team Manager') && userProfile.assignedTeamIds && userProfile.assignedTeamIds.length > 0) {
           const managedTeamDetails = (await Promise.all(userProfile.assignedTeamIds.map(teamId => getTeamByIdFromDB(teamId))))
            .filter(team => team && team.organizationId === activeOrganizationId);
          const managedTeamIdsInActiveOrg = managedTeamDetails.map(team => team!.id);

          if(managedTeamIdsInActiveOrg.length > 0) {
            orgSeries.forEach(series => {
              if(series.participatingTeams.some(ptId => managedTeamIdsInActiveOrg.includes(ptId))) {
                visibleSeriesIds.add(series.id);
              }
            });
          }
        }
        
        if (userProfile.roles.includes('selector') && userProfile.assignedGameIds) {
            const assignedGames = await getGamesByIdsFromDB(userProfile.assignedGameIds);
            const relevantGamesInActiveOrg = assignedGames.filter(game => 
              game.organizationId === activeOrganizationId
            );
            relevantGamesInActiveOrg.forEach(game => {
              if (game.seriesId) visibleSeriesIds.add(game.seriesId);
            });
        }
      }
      
      const finalVisibleSeries = orgSeries.filter(s => visibleSeriesIds.has(s.id));
      setAllSeries(finalVisibleSeries);

    } catch (error) {
      console.error("[SeriesPage] CRITICAL ERROR fetching series in try/catch:", error);
      toast({ title: "Error", description: "Could not fetch series list.", variant: "destructive" });
      setAllSeries([]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchSeries();
  }, [activeOrganizationId, authLoading, userProfile, toast]);

  const uniqueYears = useMemo(() => {
    const yearsSet = new Set(allSeries.map(s => s.year.toString()));
    if (!yearsSet.has(currentYearString)) {
      yearsSet.add(currentYearString);
    }
    return Array.from(yearsSet).sort((a, b) => parseInt(b) - parseInt(a));
  }, [allSeries, currentYearString]);

  const filteredSeries = useMemo(() => {
    return allSeries.filter(seriesItem => {
      const yearMatch = selectedYear === 'all' || seriesItem.year.toString() === selectedYear;
      const statusMatch = selectedStatus === 'all' || seriesItem.status === selectedStatus;
      return yearMatch && statusMatch;
    });
  }, [allSeries, selectedYear, selectedStatus]);

  const handleArchiveToggle = async (seriesId: string, currentStatus: Series['status']) => {
    const action = currentStatus === 'active' ? archiveSeriesAction : unarchiveSeriesAction;
    const newStatus: Series['status'] = currentStatus === 'active' ? 'archived' : 'active';
    setIsLoading(true); 
    const result = await action(seriesId);
    if (result.success) {
      toast({ title: `Series ${newStatus}`, description: result.message });
      // Re-fetch to ensure data consistency
      await fetchSeries(); 
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
    setIsLoading(false);
  };
  
  const canAddSeries = effectivePermissions[PERMISSIONS.PAGE_VIEW_SERIES_ADD];
  const canImportCsv = effectivePermissions[PERMISSIONS.PAGE_VIEW_SERIES_IMPORT_CSV];
  const canArchiveAnySeries = effectivePermissions[PERMISSIONS.SERIES_ARCHIVE_ANY];
  const canUnarchiveAnySeries = effectivePermissions[PERMISSIONS.SERIES_UNARCHIVE_ANY];

  const isPageLoading = authLoading || isPermissionsLoading || isLoading;

  if (isPageLoading) {
    return (
        <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Loading series...</p>
        </div>
    );
  }


  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
          <Layers className="h-8 w-8" /> Series
        </h1>
        <div className="flex flex-col sm:flex-row gap-2">
          {isPermissionsLoading && (
            <>
              <Button disabled variant="secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Import (CSV)</Button>
              <Button disabled className="bg-primary hover:bg-primary/90"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Add New Series</Button>
            </>
          )}
          {!isPermissionsLoading && canImportCsv && (
            <Button asChild variant="secondary" disabled={!activeOrganizationId}>
              <Link href="/series/import" className="flex items-center gap-2">
                <Upload className="h-5 w-5" /> Import Series
              </Link>
            </Button>
          )}
          {!isPermissionsLoading && canAddSeries && (
            <Button asChild className="bg-primary hover:bg-primary/90" disabled={!activeOrganizationId}>
              <Link href="/series/add" className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5" /> Add New Series
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!activeOrganizationId && !authLoading && (
        <Alert variant="default" className="border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>No Organization Selected</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar to view or manage series.
          </AlertDescription>
        </Alert>
      )}
      
      {activeOrganizationId && (
        <>
          <div className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-card shadow">
            <div className="flex-1 min-w-[150px]">
              <label htmlFor="year-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Year</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger id="year-filter"><SelectValue placeholder="Select Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {uniqueYears.map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label htmlFor="status-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Status</label>
              <Select value={selectedStatus} onValueChange={(value) => setSelectedStatus(value as Series['status'] | 'all')}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="all">All Statuses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? ( 
            <p className="text-muted-foreground text-center py-6">Loading series...</p>
          ) : filteredSeries.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              No series found matching your criteria. 
              {activeOrganizationId ? "This may be due to your role's permissions for this organization." : "This may be due to your role's permissions."}
              Try adjusting the filters or contact an administrator.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSeries.map((seriesItem) => (
                <SeriesCard
                  key={seriesItem.id}
                  series={seriesItem}
                  onArchiveToggle={handleArchiveToggle}
                  canArchive={canArchiveAnySeries}
                  canUnarchive={canUnarchiveAnySeries}
                  isPermissionsLoading={isPermissionsLoading}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
