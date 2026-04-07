
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import PlayerCard from '@/components/player-card';
import { getPlayersWithDetailsFromDB, getAllTeamsFromDB } from '@/lib/db'; // Added getAllTeamsFromDB
import type { PlayerWithRatings, Team } from '@/types'; // Added Team
import { PlusCircle, Search as SearchIcon, Upload, Info, Loader2, ShieldAlert, AlertCircle, Filter as FilterIcon } from 'lucide-react'; // Added FilterIcon
import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Added Select

const NO_PRIMARY_TEAM_VALUE = "__NO_PRIMARY_TEAM__"; // Constant for "No Primary Team" filter

export default function PlayersPage() {
  const { activeOrganizationId, loading: authLoading, effectivePermissions, isPermissionsLoading } = useAuth();
  const [allPlayers, setAllPlayers] = useState<PlayerWithRatings[]>([]);
  const [allTeamsForOrg, setAllTeamsForOrg] = useState<Team[]>([]); // State for teams in org
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPrimaryTeamFilter, setSelectedPrimaryTeamFilter] = useState<string>('all'); // 'all', 'none', or teamId
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPageData = async () => {
      if (authLoading || !activeOrganizationId) {
        setIsLoading(true);
        setAllPlayers([]);
        setAllTeamsForOrg([]);
        setFetchError(null);
        if (!authLoading && !activeOrganizationId) {
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setFetchError(null);
      try {
        const [playersFromDB, teamsFromDB] = await Promise.all([
          getPlayersWithDetailsFromDB(activeOrganizationId),
          getAllTeamsFromDB(activeOrganizationId)
        ]);
        setAllPlayers(playersFromDB);
        setAllTeamsForOrg(teamsFromDB);
      } catch (error) {
        console.error("Failed to fetch players or teams:", error);
        const errorMessage = error instanceof Error ? error.message : "Could not fetch page data.";
        setFetchError(errorMessage);
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
        setAllPlayers([]);
        setAllTeamsForOrg([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPageData();
  }, [activeOrganizationId, authLoading]);

  const filteredPlayers = useMemo(() => {
    return allPlayers.filter(player => {
      const nameMatch = !searchQuery || player.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      let teamMatch = true;
      if (selectedPrimaryTeamFilter === 'all') {
        teamMatch = true;
      } else if (selectedPrimaryTeamFilter === NO_PRIMARY_TEAM_VALUE) {
        teamMatch = !player.primaryTeamId || player.primaryTeamId === '';
      } else {
        teamMatch = player.primaryTeamId === selectedPrimaryTeamFilter;
      }
      
      return nameMatch && teamMatch;
    });
  }, [allPlayers, searchQuery, selectedPrimaryTeamFilter]);

  const canViewPage = effectivePermissions[PERMISSIONS.PAGE_VIEW_PLAYERS_LIST];
  const canAddPlayers = effectivePermissions[PERMISSIONS.PAGE_VIEW_PLAYER_ADD];
  const canImportPlayers = effectivePermissions[PERMISSIONS.PAGE_VIEW_PLAYER_IMPORT];

  const renderContent = () => {
    if (authLoading || isPermissionsLoading || isLoading) {
      return (
        <div className="flex justify-center items-center min-h-[calc(100vh-20rem)]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg text-muted-foreground">Loading players...</p>
        </div>
      );
    }

    if (!activeOrganizationId) {
      return (
        <Alert variant="default" className="border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>No Organization Selected</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar to view or manage players.
          </AlertDescription>
        </Alert>
      );
    }

    if (fetchError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Error Loading Players</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      );
    }
    
    if (allPlayers.length === 0 && !searchQuery && selectedPrimaryTeamFilter === 'all') {
      return (
        <p className="text-muted-foreground text-center py-6">
          No players found for this organization. Add some players to get started.
        </p>
      );
    }
    
    if (filteredPlayers.length === 0 && (searchQuery || selectedPrimaryTeamFilter !== 'all')) {
      return (
        <p className="text-muted-foreground text-center py-6">
          No players found matching your current filter criteria.
        </p>
      );
    }

    if (filteredPlayers.length > 0) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlayers.map((player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>
      );
    }
    
    return (
         <p className="text-muted-foreground text-center py-6">
            No players to display.
        </p>
    );
  };

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_PLAYERS_LIST}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to view the list of players. This action requires the '{PERMISSIONS.PAGE_VIEW_PLAYERS_LIST}' permission.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-headline font-bold text-primary">Players</h1>
          <div className="flex flex-col sm:flex-row gap-2">
            {canImportPlayers && (
              <Button asChild variant="secondary" disabled={!activeOrganizationId}>
                <Link href="/players/import" className="flex items-center gap-2">
                  <Upload className="h-5 w-5" /> Import Players
                </Link>
              </Button>
            )}
            {canAddPlayers && (
              <Button asChild className="bg-primary hover:bg-primary/90" disabled={!activeOrganizationId}>
                <Link href="/players/add" className="flex items-center gap-2">
                  <PlusCircle className="h-5 w-5" /> Add New Player
                </Link>
              </Button>
            )}
          </div>
        </div>

        {activeOrganizationId && (
          <Card className="p-4 sm:p-6 shadow">
            <CardHeader className="p-0 pb-4 mb-4 border-b">
              <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                <FilterIcon className="h-5 w-5" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label htmlFor="player-search" className="block text-sm font-medium text-muted-foreground mb-1">Search by Name</label>
                  <SearchIcon className="absolute left-3 top-[calc(50%_+_6px)] -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="player-search"
                    type="search"
                    placeholder="Search players by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full h-10 rounded-md shadow-sm"
                    aria-label="Search players by name"
                    disabled={!activeOrganizationId || isLoading}
                  />
                </div>
                <div>
                  <label htmlFor="team-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Primary Team</label>
                  <Select 
                    value={selectedPrimaryTeamFilter} 
                    onValueChange={setSelectedPrimaryTeamFilter}
                    disabled={!activeOrganizationId || isLoading || allTeamsForOrg.length === 0}
                  >
                    <SelectTrigger id="team-filter" className="w-full h-10 rounded-md shadow-sm">
                      <SelectValue placeholder={allTeamsForOrg.length === 0 ? "No teams in org" : "Select primary team"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Primary Teams</SelectItem>
                      <SelectItem value={NO_PRIMARY_TEAM_VALUE}>No Primary Team</SelectItem>
                      {allTeamsForOrg.map(team => (
                        <SelectItem key={team.id} value={team.id}>{team.name} ({team.ageCategory})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                   {allTeamsForOrg.length === 0 && activeOrganizationId && !isLoading && (
                      <p className="text-xs text-muted-foreground mt-1">No teams found in this organization to filter by.</p>
                   )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {renderContent()}

      </div>
    </AuthProviderClientComponent>
  );
}
