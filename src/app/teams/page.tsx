'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import TeamCard from '@/components/team-card';
import { getAllTeamsFromDB } from '@/lib/db';
import type { Team, AgeCategory } from '@/types';
import { PlusCircle, Users, Search as SearchIcon, Filter, Info, Loader2, Upload } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AGE_CATEGORIES } from '@/lib/constants';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';

export default function TeamsPage() {
  const { activeOrganizationId, loading: authLoading, effectivePermissions, isPermissionsLoading } = useAuth();
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgeCategory, setSelectedAgeCategory] = useState<AgeCategory | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTeams = async () => {
      if (authLoading) { setIsLoading(true); return; }
      if (!activeOrganizationId) { setAllTeams([]); setIsLoading(false); return; }
      setIsLoading(true);
      try {
        const teamsFromDB = await getAllTeamsFromDB(activeOrganizationId);
        setAllTeams(teamsFromDB);
      } catch (error) {
        console.error("Failed to fetch teams:", error);
        toast({ title: "Error", description: "Could not fetch teams list.", variant: "destructive" });
        setAllTeams([]);
      }
      setIsLoading(false);
    };
    fetchTeams();
  }, [activeOrganizationId, authLoading, toast]);

  const filteredTeams = useMemo(() => {
    return allTeams.filter(team => {
      const nameMatch = !searchQuery || team.name.toLowerCase().includes(searchQuery.toLowerCase());
      const categoryMatch = selectedAgeCategory === 'all' || team.ageCategory === selectedAgeCategory;
      return nameMatch && categoryMatch;
    });
  }, [allTeams, searchQuery, selectedAgeCategory]);

  const canAddTeams = effectivePermissions[PERMISSIONS.PAGE_VIEW_TEAM_ADD];

  if (authLoading || isPermissionsLoading || (isLoading && activeOrganizationId)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading teams...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
          <Users className="h-8 w-8" /> Teams
        </h1>
        {isPermissionsLoading && (
          <Button disabled className="bg-primary hover:bg-primary/90">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Add New Team
          </Button>
        )}
        {!isPermissionsLoading && canAddTeams && (
          <div className="flex gap-2">
            <Button asChild variant="outline" disabled={!activeOrganizationId}>
              <Link href="/teams/import" className="flex items-center gap-2">
                <Upload className="h-5 w-5" /> Import Teams
              </Link>
            </Button>
            <Button asChild className="bg-primary hover:bg-primary/90" disabled={!activeOrganizationId}>
              <Link href="/teams/add" className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5" /> Add New Team
              </Link>
            </Button>
          </div>
        )}
      </div>

      {!activeOrganizationId && !authLoading && (
        <Alert variant="default" className="border-primary/50">
          <Info className="h-5 w-5 text-primary" />
          <AlertTitle>No Organization Selected</AlertTitle>
          <AlertDescription>
            Please select an active organization from the dropdown in the navbar to view or manage teams.
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label htmlFor="team-search" className="block text-sm font-medium text-muted-foreground mb-1">Search by Name</label>
                  <SearchIcon className="absolute left-3 top-[calc(50%_+_6px)] -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="team-search"
                    type="search"
                    placeholder="Search teams by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full h-10 rounded-md shadow-sm"
                    aria-label="Search teams"
                  />
                </div>
                <div>
                  <label htmlFor="age-category-filter" className="block text-sm font-medium text-muted-foreground mb-1">Filter by Age Category</label>
                  <Select value={selectedAgeCategory} onValueChange={(value) => setSelectedAgeCategory(value as AgeCategory | 'all')}>
                    <SelectTrigger id="age-category-filter" className="w-full h-10 rounded-md shadow-sm">
                      <SelectValue placeholder="Select Age Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {AGE_CATEGORIES.map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <p className="text-muted-foreground text-center py-6">Loading teams for the selected organization...</p>
          ) : filteredTeams.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              {searchQuery || selectedAgeCategory !== 'all'
                ? 'No teams found matching your criteria for this organization.'
                : 'No teams found for this organization. Add some teams to get started.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTeams.map((teamItem) => (
                <TeamCard key={teamItem.id} team={teamItem} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
