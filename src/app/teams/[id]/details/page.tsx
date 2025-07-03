
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { getTeamByIdFromDB, getPlayersForTeamFromDB, getAllPlayersFromDB, isPlayerAgeEligibleForTeamCategory, getAllTeamsFromDB, getOrganizationByIdFromDB } from '@/lib/db';
import { linkPlayerToTeamAction, updateTeamManagersAction, searchGlobalPlayersAction } from '@/lib/actions/team-actions';
import type { Team, Player, UserProfile, AgeCategory, GlobalPlayerSearchResult } from '@/types';
import { ArrowLeft, Users, Tag, UserPlus, UserSquare2, Shield, Binary, UserCog, Save, Edit3, Search, Globe, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { differenceInYears, parseISO, isValid } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';
import { getAllPotentialTeamManagers, getUserProfile } from '@/lib/actions/user-actions';
import { CricketBatIcon, CricketBallIcon } from '@/components/custom-icons';


const Label = ({ htmlFor, children, className }: { htmlFor?: string, children: React.ReactNode, className?: string }) => (
  <label htmlFor={htmlFor} className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}>
    {children}
  </label>
);


export default function TeamDetailsPage() {
  const params = useParams<{ id: string }>();
  const teamId = params.id;
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile: currentAuthProfile, activeOrganizationId } = useAuth();

  const [team, setTeam] = useState<Team | undefined>(undefined);
  const [organizationName, setOrganizationName] = useState<string>('');
  const [roster, setRoster] = useState<Player[]>([]);
  const [availablePlayersInOrg, setAvailablePlayersInOrg] = useState<Player[]>([]);
  const [isLoadingPlayerAdd, setIsLoadingPlayerAdd] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [teamManagerProfiles, setTeamManagerProfiles] = useState<UserProfile[]>([]);
  const [potentialTeamManagersToAssign, setPotentialTeamManagersToAssign] = useState<UserProfile[]>([]);
  const [selectedManagerUidsForUpdate, setSelectedManagerUidsForUpdate] = useState<string[]>([]);
  const [isEditingManagers, setIsEditingManagers] = useState(false);
  const [isSavingManagers, setIsSavingManagers] = useState(false);
  const [managerSearchQuery, setManagerSearchQuery] = useState('');

  const [selectedPlayerIdForOrgAdd, setSelectedPlayerIdForOrgAdd] = useState<string>('');
  const [isPlayerAddOrgPopoverOpen, setIsPlayerAddOrgPopoverOpen] = useState(false);

  const [isGlobalSearchModalOpen, setIsGlobalSearchModalOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalPlayerSearchResult[]>([]);
  const [isLoadingGlobalSearch, setIsLoadingGlobalSearch] = useState(false);


  const filteredPotentialTeamManagers = useMemo(() => {
    if (!managerSearchQuery) {
      return potentialTeamManagersToAssign;
    }
    return potentialTeamManagersToAssign.filter(user =>
      (user.displayName?.toLowerCase() || '').includes(managerSearchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(managerSearchQuery.toLowerCase())
    );
  }, [potentialTeamManagersToAssign, managerSearchQuery]);

  const fetchData = async () => {
    if (teamId) {
      setIsLoadingData(true);
      const currentTeam = await getTeamByIdFromDB(teamId);
      setTeam(currentTeam);
  
      if (currentTeam) {
        if (currentTeam.organizationId) {
            const orgData = await getOrganizationByIdFromDB(currentTeam.organizationId);
            setOrganizationName(orgData?.name || currentTeam.organizationId);
        } else {
            setOrganizationName('N/A');
        }

        setRoster(await getPlayersForTeamFromDB(teamId));
        
        const playersFromCurrentOrg = currentTeam.organizationId 
            ? await getAllPlayersFromDB(currentTeam.organizationId) 
            : [];
        
        const teamPlayerIds = new Set(currentTeam.playerIds || []);
        const yearForEligibility = new Date().getFullYear();
  
        const eligiblePlayersForOrgDropdown = playersFromCurrentOrg.filter(p => {
          if (teamPlayerIds.has(p.id)) {
            return false;
          }
          if (p.primaryTeamId && p.primaryTeamId.trim() !== "" && p.primaryTeamId !== currentTeam.id) {
            return false;
          }
          if (!p.dateOfBirth || !p.gender) {
            return false;
          }
          const isEligible = isPlayerAgeEligibleForTeamCategory(
            { dateOfBirth: p.dateOfBirth, gender: p.gender },
            currentTeam.ageCategory,
            yearForEligibility
          );
          return isEligible;
        }).sort((a, b) => a.name.localeCompare(b.name));
        
        setAvailablePlayersInOrg(eligiblePlayersForOrgDropdown);
  
  
        if (currentTeam.teamManagerUids && currentTeam.teamManagerUids.length > 0) {
          const managerProfilesPromises = currentTeam.teamManagerUids.map(uid => getUserProfile(uid));
          const resolvedProfiles = (await Promise.all(managerProfilesPromises)).filter(Boolean) as UserProfile[];
          setTeamManagerProfiles(resolvedProfiles);
          setSelectedManagerUidsForUpdate(currentTeam.teamManagerUids);
        } else {
          setTeamManagerProfiles([]);
          setSelectedManagerUidsForUpdate([]);
        }
        
        if (currentAuthProfile?.roles?.includes('admin') || currentAuthProfile?.roles?.includes('Series Admin')) {
            const potentialManagers = await getAllPotentialTeamManagers();
            setPotentialTeamManagersToAssign(potentialManagers);
        }
  
      } else {
        setRoster([]);
        setAvailablePlayersInOrg([]);
        setTeamManagerProfiles([]);
        setPotentialTeamManagersToAssign([]);
        setSelectedManagerUidsForUpdate([]);
        setOrganizationName('');
      }
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [teamId, currentAuthProfile?.roles, activeOrganizationId]); 

  useEffect(() => { 
    if (team) {
      setSelectedManagerUidsForUpdate(team.teamManagerUids || []);
    }
  }, [team, isEditingManagers]);

  const handleAddPlayerToTeamFromOrg = async (playerId: string) => {
    if (!playerId || !team) {
      toast({ title: "Selection Error", description: "Player ID or Team is missing.", variant: "destructive" });
      return;
    }
    setIsLoadingPlayerAdd(true); 
    
    const result = await linkPlayerToTeamAction(playerId, team.id);

    if (result.success) {
      toast({ title: "Player Added", description: result.message });
      await fetchData(); 
      setIsPlayerAddOrgPopoverOpen(false); 
      setSelectedPlayerIdForOrgAdd('');
      if (isGlobalSearchModalOpen) {
         setGlobalSearchResults(prevResults => 
            prevResults.map(p => p.id === playerId ? { ...p, addedToTeam: true } : p)
         );
         const currentRoster = await getPlayersForTeamFromDB(teamId); 
         setRoster(currentRoster);
      }
      router.refresh(); 
    } else {
      toast({ title: "Error Adding Player", description: result.message, variant: "destructive" });
    }
    setIsLoadingPlayerAdd(false);
  };
  
  const getSkillIcon = (skill: Player['primarySkill']) => {
    switch (skill) {
      case 'Batting': return <CricketBatIcon className="h-4 w-4 text-primary" />;
      case 'Bowling': return <CricketBallIcon className="h-4 w-4 text-primary" />;
      case 'Wicket Keeping': return <Shield className="h-4 w-4 text-primary" />;
      default: return <UserSquare2 className="h-4 w-4 text-primary" />;
    }
  };

  const handleSaveTeamManagers = async () => {
    if (!team) return;
    setIsSavingManagers(true);
    const result = await updateTeamManagersAction(team.id, selectedManagerUidsForUpdate);
    if (result.success) {
      toast({ title: "Team Managers Updated", description: result.message });
      setIsEditingManagers(false); 
      await fetchData(); 
    } else {
      toast({ title: "Error Updating Managers", description: result.message, variant: "destructive" });
    }
    setIsSavingManagers(false);
  };

  const handleInitiateGlobalSearch = async () => {
    if (!team || !globalSearchTerm.trim() || !team.organizationId) {
      toast({ title: "Missing Information", description: "A search term and valid team context are required.", variant: "default" });
      setGlobalSearchResults([]);
      return;
    }
    setIsLoadingGlobalSearch(true);
    setGlobalSearchResults([]);
    try {
      const result = await searchGlobalPlayersAction(globalSearchTerm.trim(), team.ageCategory, team.organizationId);
      if (result.success) {
        setGlobalSearchResults(result.players);
        toast({ title: "Global Search Complete", description: result.message || `${result.players.length} player(s) found.` });
      } else {
        toast({ title: "Global Search Failed", description: result.error || "Could not perform global search.", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Global Search Error", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsLoadingGlobalSearch(false);
    }
  };

  if (isLoadingData) {
     return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />Loading team details...</div>;
  }

  if (!team) {
    return (
      <div className="text-center">
        <p className="text-xl text-muted-foreground mb-4">Team not found.</p>
        <Button asChild variant="outline"><Link href="/teams"><ArrowLeft className="mr-2 h-4 w-4" />Back to Teams List</Link></Button>
      </div>
    );
  }
  
  const canManageTeamOverall = currentAuthProfile?.roles?.includes('admin') || 
                             (currentAuthProfile?.roles?.includes('Series Admin') && team.organizationId === activeOrganizationId);
  const isCurrentUserAManager = team.teamManagerUids?.includes(currentAuthProfile?.uid || '') || false;
  const canAddPlayersToTeam = canManageTeamOverall || isCurrentUserAManager;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl font-headline text-primary flex items-center gap-2">
                <Users className="h-7 w-7" />
                {team.name}
              </CardTitle>
              <CardDescription>Team Details and Roster for Organization: {organizationName || 'N/A'}</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm"><Link href="/teams"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md border">
              <Shield className="h-5 w-5 text-accent mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Club</p>
                <p className="text-lg font-semibold text-foreground">{team.clubName}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md border">
              <Tag className="h-5 w-5 text-accent mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Age Category</p>
                <p className="text-lg font-semibold text-foreground">{team.ageCategory}</p>
              </div>
            </div>
             <div className="p-3 bg-muted/50 rounded-md border">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-start gap-3">
                        <UserCog className="h-5 w-5 text-accent mt-1" />
                        <div>
                            <p className="text-sm text-muted-foreground">Team Managers</p>
                             {teamManagerProfiles.length > 0 ? (
                                <ul className="space-y-0.5 mt-0.5">
                                    {teamManagerProfiles.map(manager => (
                                    <li key={manager.uid} className="text-md font-semibold text-foreground">
                                        {manager.displayName || manager.email}
                                    </li>
                                    ))}
                                </ul>
                                ) : (
                                <p className="text-lg font-semibold text-foreground">None Assigned</p>
                            )}
                        </div>
                    </div>
                    {canManageTeamOverall && !isEditingManagers && (
                        <Button variant="outline" size="sm" onClick={() => setIsEditingManagers(true)} className="h-7 px-2 self-start">
                            <Edit3 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                    )}
                </div>
            </div>
          </div>
          
          {isEditingManagers && canManageTeamOverall && (
            <Card className="mt-4 border-dashed">
                <CardHeader className="pb-2">
                    <CardTitle className="text-md font-semibold">Manage Team Managers</CardTitle>
                    <CardDescription className="text-xs">Assign or change managers for this team. Users with 'Team Manager', 'admin', or 'Series Admin' roles can be selected.</CardDescription>
                </CardHeader>
                <CardContent className="pt-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search managers..."
                          value={managerSearchQuery}
                          onChange={(e) => setManagerSearchQuery(e.target.value)}
                          className="pl-8 h-9"
                        />
                    </div>
                    {potentialTeamManagersToAssign.length === 0 ? (
                         <p className="text-sm text-muted-foreground">No users with 'Team Manager', 'admin', or 'Series Admin' role found to assign.</p>
                    ) : filteredPotentialTeamManagers.length === 0 && managerSearchQuery ? (
                         <p className="text-sm text-muted-foreground">No managers found matching your search.</p>
                    ) : (
                        <ScrollArea className="h-48 rounded-md border p-3">
                            <div className="space-y-2">
                                {filteredPotentialTeamManagers.map((user) => (
                                <div key={user.uid} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`manager-${user.uid}`}
                                        checked={selectedManagerUidsForUpdate.includes(user.uid)}
                                        onCheckedChange={(checked) => {
                                            setSelectedManagerUidsForUpdate(prev =>
                                            checked
                                                ? [...prev, user.uid]
                                                : prev.filter(uid => uid !== user.uid)
                                            );
                                        }}
                                        disabled={isSavingManagers}
                                    />
                                    <label
                                        htmlFor={`manager-${user.uid}`}
                                        className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                    {user.displayName || user.email} ({user.roles.join(', ')})
                                    </label>
                                </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
                 <CardFooter className="flex justify-end gap-2 pt-4">
                    <Button variant="ghost" onClick={() => { setIsEditingManagers(false); setManagerSearchQuery(''); setSelectedManagerUidsForUpdate(team?.teamManagerUids || []); }}>Cancel</Button>
                    <Button 
                        onClick={handleSaveTeamManagers} 
                        disabled={isSavingManagers || potentialTeamManagersToAssign.length === 0}
                    >
                       {isSavingManagers ? <Save className="animate-spin mr-2" /> : <Save className="mr-2" />} Save Managers
                    </Button>
                </CardFooter>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
            <UserSquare2 className="h-6 w-6" />
            Team Roster
          </CardTitle>
          <CardDescription>Players currently in {team.name}. Eligibility for series will be determined by the series' specific cutoff dates.</CardDescription>
        </CardHeader>
        <CardContent>
          {roster.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Avatar</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Primary Skill</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map(player => (
                    <TableRow key={player.id}>
                      <TableCell>
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={player.avatarUrl || `https://placehold.co/40x40.png`} alt={player.name} data-ai-hint="player avatar small"/>
                          <AvatarFallback>{player.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{player.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Binary className="h-4 w-4 text-muted-foreground" />
                          {player.gender}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 whitespace-nowrap">
                           {getSkillIcon(player.primarySkill)}
                           {player.primarySkill}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/players/${player.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground">No players have been added to this team's roster yet.</p>
          )}
        </CardContent>
        {canAddPlayersToTeam && (
        <CardFooter className="border-t pt-6">
          <div className="w-full space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Add Player to Roster</h3>
            <div className="flex flex-col sm:flex-row gap-2 items-start">
                <Popover open={isPlayerAddOrgPopoverOpen} onOpenChange={setIsPlayerAddOrgPopoverOpen}>
                    <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto" disabled={isLoadingPlayerAdd}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Eligible Player
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search eligible players..." />
                        <CommandList>
                          <CommandEmpty>{availablePlayersInOrg.length === 0 ? "No eligible players in org." : "No players match search."}</CommandEmpty>
                          <CommandGroup>
                            {availablePlayersInOrg.map(player => {
                                let age: string | number = "N/A";
                                if (player.dateOfBirth) { try { const dobDate = parseISO(player.dateOfBirth); if (isValid(dobDate)) age = differenceInYears(new Date(), dobDate); } catch (e) { /* ignore */ } }
                                const gender = player.gender || "N/A";
                                return (
                                    <CommandItem
                                    key={player.id}
                                    value={player.name}
                                    onSelect={() => {
                                        handleAddPlayerToTeamFromOrg(player.id);
                                        setIsPlayerAddOrgPopoverOpen(false);
                                    }}
                                    disabled={isLoadingPlayerAdd}
                                    className="cursor-pointer"
                                    >
                                    <Avatar className="h-7 w-7 mr-2">
                                        <AvatarImage src={player.avatarUrl || `https://placehold.co/28x28.png`} alt={player.name} data-ai-hint="player avatar x-small"/>
                                        <AvatarFallback>{player.name.substring(0,1)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <span className="text-sm font-medium">{player.name}</span>
                                        <p className="text-xs text-muted-foreground">Age: {age}, {gender} (Free Agent)</p>
                                    </div>
                                    <Check className={cn("ml-auto h-4 w-4", selectedPlayerIdForOrgAdd === player.id ? "opacity-100" : "opacity-0")} />
                                    </CommandItem>
                                );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                </Popover>

                 <Dialog open={isGlobalSearchModalOpen} onOpenChange={setIsGlobalSearchModalOpen}>
                    <DialogTrigger asChild>
                        <Button 
                            variant="secondary" 
                            className="w-full sm:w-auto" 
                            disabled={isLoadingPlayerAdd || isLoadingGlobalSearch}
                            onClick={() => {setGlobalSearchResults([]); setGlobalSearchTerm('');}}
                        >
                            <Globe className="mr-2 h-4 w-4" /> Search Global Players
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[550px] max-h-[80vh] flex flex-col">
                        <DialogHeader>
                        <DialogTitle>Search All Players</DialogTitle>
                        <DialogDescription>
                            Find players from other organizations. Age eligibility for "{team.name}" ({team.ageCategory}) will be checked.
                        </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                id="global-player-search-term"
                                placeholder="Enter player name or CricClubs ID..."
                                value={globalSearchTerm}
                                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                                className="pl-8"
                                disabled={isLoadingGlobalSearch}
                                />
                            </div>
                            <Button onClick={handleInitiateGlobalSearch} disabled={isLoadingGlobalSearch || !globalSearchTerm.trim()}>
                                {isLoadingGlobalSearch ? <Loader2 className="animate-spin mr-2" /> : <Search className="mr-2" />}
                                Search
                            </Button>
                        </div>
                        <div className="mt-4 border rounded-md flex-grow overflow-hidden">
                            {isLoadingGlobalSearch ? (
                                <div className="flex justify-center items-center h-full p-4">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    <p className="ml-2 text-muted-foreground">Searching...</p>
                                </div>
                            ) : globalSearchResults.length > 0 ? (
                                <ScrollArea className="h-[300px] p-2">
                                  <div className="space-y-1">
                                    {globalSearchResults.map(playerResult => {
                                      const isAlreadyOnRoster = roster.some(r => r.id === playerResult.id);
                                      return (
                                        <div key={playerResult.id} className={cn("flex items-center justify-between p-2 rounded-md hover:bg-muted/50", !playerResult.isEligible && "opacity-60")}>
                                          <div className="flex items-center gap-2">
                                            <Avatar className="h-8 w-8">
                                              <AvatarImage src={playerResult.avatarUrl || `https://placehold.co/32x32.png`} alt={playerResult.name} data-ai-hint="player avatar small"/>
                                              <AvatarFallback>{playerResult.name.substring(0,1)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                              <p className="text-sm font-medium">{playerResult.name} <span className="text-xs text-muted-foreground">({playerResult.primarySkill})</span></p>
                                              <p className="text-xs text-muted-foreground">
                                                Org: {playerResult.organizationName || 'N/A'} - Age: {playerResult.age === undefined ? 'N/A' : playerResult.age} - 
                                                <span className={cn(playerResult.isEligible ? "text-green-600" : "text-destructive")}> {playerResult.isEligible ? "Eligible" : "Ineligible"}</span>
                                              </p>
                                            </div>
                                          </div>
                                          <Button 
                                            size="xs" 
                                            variant="outline"
                                            onClick={() => handleAddPlayerToTeamFromOrg(playerResult.id)} 
                                            disabled={isLoadingPlayerAdd || !playerResult.isEligible || isAlreadyOnRoster}
                                          >
                                            {isLoadingPlayerAdd && roster.some(r => r.id === playerResult.id) ? <Loader2 className="animate-spin mr-1 h-3 w-3" /> : null}
                                            {isAlreadyOnRoster ? "On Roster" : "Add"}
                                          </Button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                            ) : (
                                <p className="text-muted-foreground text-center text-sm p-4">
                                  {globalSearchTerm ? "No players found matching your global search or eligibility criteria. Search by name or CricClubs ID." : "Enter a search term to find players globally."}
                                </p>
                            )}
                        </div>
                        <DialogFooter className="mt-auto pt-4">
                            <Button variant="outline" onClick={() => setIsGlobalSearchModalOpen(false)}>Close</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {availablePlayersInOrg.length === 0 && !selectedPlayerIdForOrgAdd && (
              <p className="text-sm text-muted-foreground mt-2">
                No "free agent" players currently eligible from this organization for this team's age category ({team.ageCategory}), or all eligible free agents are already on the roster. You can <Link href={`/players/add?primaryTeamId=${team.id}&primaryTeamName=${encodeURIComponent(team.name)}&primaryTeamAgeCategory=${encodeURIComponent(team.ageCategory)}&clubName=${encodeURIComponent(team.clubName)}&organizationId=${team.organizationId}`} className="underline text-primary">add a new player directly to this organization and team</Link>, or use "Search Global Players" for players from other organizations or those already on other teams.
              </p>
            )}
          </div>
        </CardFooter>
        )}
      </Card>
    </div>
  );
}
