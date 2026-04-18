
'use client';

import {
  getAllVenuesFromDB,
  getVenuesForSeriesFromDB,
  getSeriesByIdFromDB,
  getTeamsForSeriesFromDB,
  getTeamsByAgeCategoryFromDB,
  getGamesForSeriesFromDB,
  getPlayerByIdFromDB,
  getFitnessTestsForSeriesFromDB,
  getUserProfileFromDB, // New import
} from '@/lib/db';

import { addTeamToSeriesAction, addVenueToSeriesAction, updateSeriesAdminsAction, archiveSeriesAction, unarchiveSeriesAction, updateSeriesFitnessCriteriaAction, updateSeriesBasicInfoAction } from '@/lib/actions/series-actions';
import { checkSeriesDeletableAction, deleteSeriesAdminAction } from '@/lib/actions/series-admin-actions';
import type { Series, Team, Venue, Game, UserProfile, FitnessTestType, FitnessTestHeader } from '@/types'; // Added FitnessTestHeader
import { Layers, Tag, CalendarFold, ArrowLeft, Users, PlusCircle, MapPin, Gamepad2, Map as MapIconLucide, UserCog, Edit3, Save, Archive, ArchiveRestore, Info, Search, CalendarDays, Activity, Dumbbell, ShieldCheck, ListChecks, FileText, Target, Trash2, Loader2, BarChart3 } from 'lucide-react';import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GameCard from '@/components/game-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { getPotentialSeriesAdminsForOrg } from '@/lib/actions/user-actions';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SeriesScoringModel } from '@/components/scorecards/series-scoring-model';
import { format, parseISO } from 'date-fns';
import { FITNESS_TEST_TYPES, AGE_CATEGORIES } from '@/lib/constants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'; // Added Table components
import { PERMISSIONS } from '@/lib/permissions-master-list';

const NO_FITNESS_TEST_VALUE = "__NO_FITNESS_TEST__";


export default function SeriesDetailsPage() {
  const params = useParams<{ id: string }>();
  const seriesId = params.id;
  const { toast } = useToast();
  const router = useRouter();
  const { userProfile: currentAuthProfile, effectivePermissions, isPermissionsLoading, activeOrganizationId } = useAuth();

  const [series, setSeries] = useState<Series | undefined>(undefined);
  const [canDelete, setCanDelete] = useState<boolean | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [participatingTeams, setParticipatingTeams] = useState<Team[]>([]);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [selectedTeamToAdd, setSelectedTeamToAdd] = useState<string>('');

  const [seriesVenues, setSeriesVenues] = useState<Venue[]>([]);
  const [allAvailableVenues, setAllAvailableVenues] = useState<Venue[]>([]);
  const [selectedVenueToAdd, setSelectedVenueToAdd] = useState<string>('');

  const [seriesGames, setSeriesGames] = useState<Game[]>([]);

  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [isLoadingVenue, setIsLoadingVenue] = useState(false);
  const [isLoadingSeries, setIsLoadingSeries] = useState(true);

  const [seriesAdmins, setSeriesAdmins] = useState<UserProfile[]>([]);
  const [isEditingAdmins, setIsEditingAdmins] = useState(false);
  const [potentialSeriesAdminsToAssign, setPotentialSeriesAdminsToAssign] = useState<UserProfile[]>([]);
  const [selectedAdminUidsForUpdate, setSelectedAdminUidsForUpdate] = useState<string[]>([]);
  const [isLoadingSeriesAdmins, setIsLoadingSeriesAdmins] = useState(false);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');

  const [isEditingFitnessCriteria, setIsEditingFitnessCriteria] = useState(false);
  const [currentFitnessTestTypeForEdit, setCurrentFitnessTestTypeForEdit] = useState<FitnessTestType | typeof NO_FITNESS_TEST_VALUE | undefined>(undefined);
  const [currentFitnessPassingScoreForEdit, setCurrentFitnessPassingScoreForEdit] = useState<string>('');
  const [isLoadingFitnessUpdate, setIsLoadingFitnessUpdate] = useState(false);

  const [fitnessTests, setFitnessTests] = useState<FitnessTestHeader[]>([]);

  // Basic info editing state
  const [isEditingBasicInfo, setIsEditingBasicInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAgeCategory, setEditAgeCategory] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editMaleCutoff, setEditMaleCutoff] = useState('');
  const [editFemaleCutoff, setEditFemaleCutoff] = useState('');
  const [isSavingBasicInfo, setIsSavingBasicInfo] = useState(false); // New state for fitness tests

  const refreshSeriesData = async () => {
    if (seriesId) {
      setIsLoadingSeries(true);
      try {
        const currentSeries = await getSeriesByIdFromDB(seriesId);
        setSeries(currentSeries);

        if (currentSeries) {
          const [fetchedTeams, fetchedVenues, fetchedFitnessTests] = await Promise.all([
            getTeamsForSeriesFromDB(currentSeries.id),
            getVenuesForSeriesFromDB(currentSeries.id),
            getFitnessTestsForSeriesFromDB(currentSeries.id)
          ]);
          
          setParticipatingTeams(fetchedTeams);
          setSeriesVenues(fetchedVenues);
          setFitnessTests(fetchedFitnessTests);

          setCurrentFitnessTestTypeForEdit(currentSeries.fitnessTestType || NO_FITNESS_TEST_VALUE);
          setCurrentFitnessPassingScoreForEdit(currentSeries.fitnessTestPassingScore || '');
          
          if (currentSeries.status === 'active') {
              const allTeamsInAgeCategory = await getTeamsByAgeCategoryFromDB(currentSeries.ageCategory, currentSeries.organizationId);
              const participatingTeamIds = new Set(currentSeries.participatingTeams || []);
              setAvailableTeams(allTeamsInAgeCategory.filter(team => !participatingTeamIds.has(team.id)));

              if (currentSeries.organizationId) {
                const venuesOfSameOrg = await getAllVenuesFromDB(currentSeries.organizationId);
                const seriesVenueIds = new Set(currentSeries.venueIds || []);
                setAllAvailableVenues(venuesOfSameOrg.filter(venue => !seriesVenueIds.has(venue.id) && venue.status === "active"));
              } else {
                setAllAvailableVenues([]);
              }
              
              setSeriesGames(await getGamesForSeriesFromDB(currentSeries.id)); 
          } else {
              setAvailableTeams([]);
              setAllAvailableVenues([]);
              setSeriesGames([]); 
          }


          if (currentSeries.seriesAdminUids && currentSeries.seriesAdminUids.length > 0) {
            const adminProfilesPromises = currentSeries.seriesAdminUids.map(uid => getUserProfileFromDB(uid));
            const resolvedProfiles = (await Promise.all(adminProfilesPromises)).filter(Boolean) as UserProfile[];
            setSeriesAdmins(resolvedProfiles);
            setSelectedAdminUidsForUpdate(currentSeries.seriesAdminUids);
          } else {
            setSeriesAdmins([]);
            setSelectedAdminUidsForUpdate([]);
          }

          // Always fetch potential admins — function handles its own org/role filtering
          const potentialAdmins = await getPotentialSeriesAdminsForOrg(currentSeries.organizationId);
          setPotentialSeriesAdminsToAssign(potentialAdmins);
        }
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        console.error('[SeriesDetails] FATAL ERROR in refreshSeriesData:', err);
      } finally {
        setIsLoadingSeries(false);
      }
    }
  };

  useEffect(() => {
    if (!isPermissionsLoading) {
        refreshSeriesData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, isPermissionsLoading]);

  useEffect(() => { 
    if (series) {
      setCurrentFitnessTestTypeForEdit(series.fitnessTestType || NO_FITNESS_TEST_VALUE);
      setCurrentFitnessPassingScoreForEdit(series.fitnessTestPassingScore || '');
    }
  }, [series, isEditingFitnessCriteria]);


  const lockedSuperAdmins = useMemo(() =>
    potentialSeriesAdminsToAssign.filter(u => u.roles.includes('admin')),
    [potentialSeriesAdminsToAssign]
  );

  const selectableAdmins = useMemo(() =>
    potentialSeriesAdminsToAssign.filter(u => !u.roles.includes('admin')),
    [potentialSeriesAdminsToAssign]
  );

  const filteredPotentialSeriesAdmins = useMemo(() => {
    if (!adminSearchQuery) return selectableAdmins;
    return selectableAdmins.filter(user =>
      (user.displayName?.toLowerCase() || '').includes(adminSearchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(adminSearchQuery.toLowerCase())
    );
  }, [selectableAdmins, adminSearchQuery]);


  const handleAddTeamToSeries = async () => {
    if (!selectedTeamToAdd || !series || series.status === 'archived') {
      toast({ title: "Action Denied", description: "Please select a team to add, or series is archived.", variant: "destructive" });
      return;
    }
    setIsLoadingTeam(true);
    const result = await addTeamToSeriesAction(selectedTeamToAdd, series.id);
    if (result.success) {
      toast({ title: "Team Added", description: result.message });
      await refreshSeriesData();
      setSelectedTeamToAdd('');
      router.refresh();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
    setIsLoadingTeam(false);
  };

  const handleAddVenueToSeries = async () => {
    if (!selectedVenueToAdd || !series || series.status === 'archived') {
      toast({ title: "Action Denied", description: "Please select a venue to add, or series is archived.", variant: "destructive" });
      return;
    }
    setIsLoadingVenue(true);
    const result = await addVenueToSeriesAction(selectedVenueToAdd, series.id);
    if (result.success) {
      toast({ title: "Venue Added", description: result.message });
      await refreshSeriesData();
      setSelectedVenueToAdd('');
      router.refresh();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
    setIsLoadingVenue(false);
  };

  const handleSaveSeriesAdmins = async () => {
    if (!seriesId || !series || series.status === 'archived') {
        toast({ title: "Action Denied", description: "Cannot update admins for an archived series.", variant: "destructive" });
        return;
    }
    setIsLoadingSeriesAdmins(true);
    const finalUids = [...new Set([
      ...selectedAdminUidsForUpdate,
      ...lockedSuperAdmins.map(u => u.uid),
    ])];
    const result = await updateSeriesAdminsAction(seriesId, finalUids);
    if (result.success) {
      toast({ title: "Series Admins Updated", description: result.message });
      setIsEditingAdmins(false);
      setAdminSearchQuery('');
      await refreshSeriesData();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
    setIsLoadingSeriesAdmins(false);
  };

  const handleArchiveToggle = async () => {
    if (!series) return;
    const action = series.status === 'active' ? archiveSeriesAction : unarchiveSeriesAction;
    const newStatus = series.status === 'active' ? 'archived' : 'active';
    const result = await action(series.id);
    if (result.success) {
      toast({ title: `Series ${newStatus}`, description: result.message });
      await refreshSeriesData();
    } else {
      toast({ title: "Error", description: result.message, variant: "destructive" });
    }
  };

  const handleSaveFitnessCriteria = async () => {
    if (!series || series.status === 'archived') {
        toast({ title: "Action Denied", description: "Cannot update fitness criteria for an archived series.", variant: "destructive" });
        return;
    }
    const type = currentFitnessTestTypeForEdit === NO_FITNESS_TEST_VALUE ? undefined : currentFitnessTestTypeForEdit;
    const score = currentFitnessPassingScoreForEdit.trim();

    if (type && (score === "" || isNaN(parseFloat(score)))) {
        toast({ title: "Validation Error", description: "Passing score is required and must be a number if a test type is selected.", variant: "destructive" });
        return;
    }

    setIsLoadingFitnessUpdate(true);
    const result = await updateSeriesFitnessCriteriaAction(series.id, {
        fitnessTestType: type,
        fitnessTestPassingScore: type ? score : undefined,
    });
    if (result.success) {
        toast({ title: "Fitness Criteria Updated", description: result.message });
        await refreshSeriesData();
        setIsEditingFitnessCriteria(false);
    } else {
        toast({ title: "Error Updating Fitness Criteria", description: result.error, variant: "destructive" });
    }
    setIsLoadingFitnessUpdate(false);
  };
  
  const isSeriesArchived = series?.status === 'archived';
  const isFitnessCriteriaDefinedForSeries = !!(series?.fitnessTestType && series.fitnessTestPassingScore);

  // Permission-based visibility checks
  const isUserASeriesAdminForThisSeries = series && !!currentAuthProfile?.uid && !!series.seriesAdminUids?.includes(currentAuthProfile.uid);
  
  const canManageSeriesAdmins = !!effectivePermissions[PERMISSIONS.SERIES_MANAGE_ADMINS_ANY];
  
  const canEditFitnessCriteria = (
    !!effectivePermissions[PERMISSIONS.SERIES_MANAGE_FITNESS_CRITERIA_ANY] ||
    (!!effectivePermissions[PERMISSIONS.SERIES_MANAGE_FITNESS_CRITERIA_ASSIGNED] && isUserASeriesAdminForThisSeries)
  );
  
  const canArchive = !isSeriesArchived && (
    !!effectivePermissions[PERMISSIONS.SERIES_ARCHIVE_ANY] || 
    (!!effectivePermissions[PERMISSIONS.SERIES_ARCHIVE_ASSIGNED] && isUserASeriesAdminForThisSeries)
  );

  const canUnarchive = isSeriesArchived && (
    !!effectivePermissions[PERMISSIONS.SERIES_UNARCHIVE_ANY] ||
    (!!effectivePermissions[PERMISSIONS.SERIES_UNARCHIVE_ASSIGNED] && isUserASeriesAdminForThisSeries)
  );
  
  const showArchiveButton = canArchive || canUnarchive;

  const isOrgAdmin = currentAuthProfile?.roles?.includes('Organization Admin') ?? false;
  const isSeriesAdminForThis = isUserASeriesAdminForThisSeries ?? false;
  const canDeletePermission = effectivePermissions[PERMISSIONS.SERIES_DELETE_ANY] ||
    (isOrgAdmin && series?.organizationId === activeOrganizationId) ||
    isSeriesAdminForThis;

  useEffect(() => {
    if (!series || !canDeletePermission) { setCanDelete(false); return; }
    checkSeriesDeletableAction(series.id)
      .then(r => setCanDelete(r.canDelete))
      .catch(() => setCanDelete(false));
  }, [series?.id, canDeletePermission]);

  const handleSaveBasicInfo = async () => {
    if (!series) return;
    setIsSavingBasicInfo(true);
    try {
      const result = await updateSeriesBasicInfoAction(series.id, {
        name: editName || series.name,
        ageCategory: editAgeCategory || series.ageCategory,
        year: parseInt(editYear) || series.year,
        maleCutoffDate: editMaleCutoff || null,
        femaleCutoffDate: editFemaleCutoff || null,
      });
      if (result.success) {
        toast({ title: 'Series Updated', description: 'Series information has been saved.' });
        setIsEditingBasicInfo(false);
        await refreshSeriesData();
      } else {
        toast({ title: 'Update Failed', description: result.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSavingBasicInfo(false);
    }
  };

  const handleDeleteSeries = async () => {
    if (!series || !canDeletePermission) return;
    setIsDeleting(true);
    try {
      const result = await deleteSeriesAdminAction(series.id);
      if (result.success) {
        toast({ title: 'Series Deleted', description: `"${series.name}" has been permanently deleted.` });
        router.push('/series');
      } else {
        toast({ title: 'Deletion Failed', description: result.error, variant: 'destructive', duration: 9000 });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const canAddGame = (
    !!effectivePermissions[PERMISSIONS.GAMES_ADD_TO_ANY_SERIES] ||
    (!!effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] && isUserASeriesAdminForThisSeries)
  );

  const canAddTeam = (
    !!effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ANY] ||
    (!!effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] && isUserASeriesAdminForThisSeries)
  );

  const canAddVenue = (
    !!effectivePermissions[PERMISSIONS.SERIES_MANAGE_VENUES_ANY] ||
    (!!effectivePermissions[PERMISSIONS.SERIES_MANAGE_VENUES_ASSIGNED] && isUserASeriesAdminForThisSeries)
  );

  const canViewFitnessReport = !!effectivePermissions[PERMISSIONS.SERIES_VIEW_FITNESS_REPORT];
  const canViewSavedTeam = !!effectivePermissions[PERMISSIONS.SERIES_VIEW_SAVED_AI_TEAM];

  const canEditBasicInfo = !isSeriesArchived && (
    !!effectivePermissions[PERMISSIONS.SERIES_EDIT_ANY] ||
    (!!effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] && isUserASeriesAdminForThisSeries)
  );


  if (isLoadingSeries || isPermissionsLoading) {
    return <p className="text-center text-muted-foreground">Loading series details...</p>;
  }

  if (!series) {
    return (
      <div className="text-center">
        <p className="text-xl text-muted-foreground mb-4">Series not found.</p>
        <Button asChild variant="outline"><Link href="/series"><ArrowLeft className="mr-2 h-4 w-4" />Back to Series List</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Top bar: back + actions ─────────────────────────────────── */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/series">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Series List
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2 justify-end">
          {canViewSavedTeam && series.savedAiTeam && series.savedAiTeam.length > 0 && !isSeriesArchived && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/series/${seriesId}/saved-team`}>
                <Target className="mr-2 h-4 w-4" />
                View Saved AI Team
              </Link>
            </Button>
          )}
          {/* Show Delete when deletable, Archive when not deletable */}
          {canDeletePermission && canDelete === true ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isDeleting}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? 'Deleting...' : 'Delete Series'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Series</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to permanently delete "{series?.name}"? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSeries} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : showArchiveButton ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant={isSeriesArchived ? "outline" : "outline"} size="sm"
                  className={isSeriesArchived ? 'border-primary text-primary hover:bg-primary/10' : 'border-destructive text-destructive hover:bg-destructive/10'}
                  disabled={isPermissionsLoading}>
                  {isSeriesArchived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                  {isSeriesArchived ? "Unarchive Series" : "Archive Series"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure you want to {isSeriesArchived ? "unarchive" : "archive"} this series?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isSeriesArchived ? "Unarchiving will make this series active again." : "Archiving will also archive all its games and prevent new additions."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchiveToggle} className={cn(isSeriesArchived ? "" : "bg-destructive hover:bg-destructive/90")}>
                    Confirm {isSeriesArchived ? "Unarchive" : "Archive"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
      
      {/* ── Series title ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Layers className="h-7 w-7" />
            {series.name}
            <Badge variant={isSeriesArchived ? 'outline' : 'default'} className="capitalize text-base ml-2">
              {series.status}
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{series.ageCategory} · {series.year}</p>
        </div>
      </div>

      {isSeriesArchived && (
        <Alert variant="default" className="bg-amber-50 border-amber-200 text-amber-700">
          <Info className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold">Series Archived</AlertTitle>
          <AlertDescription>
            This series is archived. Most editing functions are disabled. Games will not be listed, and new teams/venues cannot be added.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full grid grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="venues">Venues</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="games">Games</TabsTrigger>
          <TabsTrigger value="fitness">Fitness Tests</TabsTrigger>
        </TabsList>

        {/* ══ OVERVIEW TAB ════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card className="shadow-lg">
            <CardContent className="pt-6 space-y-0 divide-y">

              {/* ── Section 1: Series Info ── */}
              <div className="pb-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Series Information</h3>
                  {canEditBasicInfo && !isEditingBasicInfo && (
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => {
                      setEditName(series.name);
                      setEditAgeCategory(series.ageCategory);
                      setEditYear(series.year.toString());
                      setEditMaleCutoff(series.maleCutoffDate || '');
                      setEditFemaleCutoff(series.femaleCutoffDate || '');
                      setIsEditingBasicInfo(true);
                    }}>
                      <Edit3 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  )}
                </div>

                {!isEditingBasicInfo && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <InfoItem icon={<Layers className="h-4 w-4" />} label="Series Name" value={series.name} />
                      <InfoItem icon={<Tag className="h-4 w-4" />} label="Age Category" value={series.ageCategory} />
                      <InfoItem icon={<CalendarFold className="h-4 w-4" />} label="Year" value={series.year.toString()} />
                    </div>
                    {(series.maleCutoffDate || series.femaleCutoffDate) && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {series.maleCutoffDate && <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="Male Cutoff DOB" value={format(parseISO(series.maleCutoffDate), 'PPP')} />}
                          {series.femaleCutoffDate && <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="Female Cutoff DOB" value={format(parseISO(series.femaleCutoffDate), 'PPP')} />}
                        </div>
                        <p className="text-xs text-muted-foreground">Players must be born on or after the respective cutoff date to be eligible for this series.</p>
                      </div>
                    )}
                  </div>
                )}

                {isEditingBasicInfo && (
                  <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs text-muted-foreground">Series Name</Label>
                        <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Series name" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Age Category</Label>
                        <Select value={editAgeCategory} onValueChange={setEditAgeCategory}>
                          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>{AGE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Year</Label>
                        <Input type="number" value={editYear} onChange={e => setEditYear(e.target.value)} placeholder="e.g. 2025" min={2000} max={2100} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Male Cutoff DOB</Label>
                        <Input type="date" value={editMaleCutoff} onChange={e => setEditMaleCutoff(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Female Cutoff DOB</Label>
                        <Input type="date" value={editFemaleCutoff} onChange={e => setEditFemaleCutoff(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveBasicInfo} disabled={isSavingBasicInfo}>
                        {isSavingBasicInfo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSavingBasicInfo ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsEditingBasicInfo(false)} disabled={isSavingBasicInfo}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section 2: Administrators ── */}
              <div className="py-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <UserCog className="h-4 w-4" /> Series Administrators
                  </h3>
                  {canManageSeriesAdmins && !isEditingAdmins && !isSeriesArchived && (
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setIsEditingAdmins(true)} disabled={isPermissionsLoading}>
                      <Edit3 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  )}
                </div>
                {!isEditingAdmins && (
                  seriesAdmins.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {seriesAdmins.map(admin => (
                        <Badge key={admin.uid} variant="secondary" className="text-sm py-1 px-3">
                          {admin.displayName || admin.email}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">None assigned.</p>
                  )
                )}
                {canManageSeriesAdmins && isEditingAdmins && !isSeriesArchived && (
                  <div className="space-y-3">
                    {/* Show currently assigned when potential list not yet loaded */}
                    {seriesAdmins.length > 0 && potentialSeriesAdminsToAssign.length === 0 && (
                      <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Currently assigned</p>
                        {seriesAdmins.map(admin => (
                          <div key={admin.uid} className="flex items-center gap-2 px-2 py-1">
                            <span className="text-sm">{admin.displayName || admin.email}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {lockedSuperAdmins.length > 0 && (
                      <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Super Admins (always assigned)</p>
                        {lockedSuperAdmins.map(user => (
                          <div key={user.uid} className="flex items-center gap-2 px-2 py-1 rounded opacity-70">
                            <Checkbox checked disabled />
                            <span className="text-sm flex-grow">{user.displayName || user.email}</span>
                            <Badge variant="default" className="text-xs">Super Admin</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="search" placeholder="Search Series Admins..." value={adminSearchQuery} onChange={e => setAdminSearchQuery(e.target.value)} className="pl-8 h-9" />
                    </div>
                    {selectableAdmins.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users with Series Admin role found.</p>
                    ) : (
                      <ScrollArea className="h-48 rounded-md border p-4">
                        <div className="space-y-2">
                          {filteredPotentialSeriesAdmins.map(user => (
                            <div key={user.uid} className="flex items-center space-x-2">
                              <Checkbox id={`admin-${user.uid}`} checked={selectedAdminUidsForUpdate.includes(user.uid)}
                                onCheckedChange={checked => setSelectedAdminUidsForUpdate(prev => checked ? [...prev, user.uid] : prev.filter(uid => uid !== user.uid))} />
                              <label htmlFor={`admin-${user.uid}`} className="text-sm font-normal leading-none">
                                {user.displayName || user.email}
                                <span className="text-muted-foreground ml-1 text-xs">(Series Admin)</span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setIsEditingAdmins(false); setSelectedAdminUidsForUpdate(series.seriesAdminUids || []); setAdminSearchQuery(''); }} disabled={isLoadingSeriesAdmins}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveSeriesAdmins} disabled={isLoadingSeriesAdmins}>
                        {isLoadingSeriesAdmins ? <Save className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Save Administrators
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section 3: Fitness Test Criteria ── */}
              <div className="py-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <Dumbbell className="h-4 w-4" /> Fitness Test Criteria
                  </h3>
                  {canEditFitnessCriteria && !isEditingFitnessCriteria && !isSeriesArchived && (
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setIsEditingFitnessCriteria(true)} disabled={isPermissionsLoading}>
                      <Edit3 className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  )}
                </div>
                {!isEditingFitnessCriteria && (
                  series.fitnessTestType ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <InfoItem icon={<Activity className="h-4 w-4" />} label="Test Type" value={series.fitnessTestType} />
                      <InfoItem icon={<Tag className="h-4 w-4" />} label="Passing Score" value={series.fitnessTestPassingScore || 'N/A'} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No fitness test criteria defined for this series.</p>
                  )
                )}
                {isEditingFitnessCriteria && canEditFitnessCriteria && !isSeriesArchived && (
                  <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                    <div>
                      <Label htmlFor="fitnessTestTypeEdit">Fitness Test Type</Label>
                      <Select value={currentFitnessTestTypeForEdit || NO_FITNESS_TEST_VALUE}
                        onValueChange={value => { setCurrentFitnessTestTypeForEdit(value as FitnessTestType | typeof NO_FITNESS_TEST_VALUE | undefined); if (value === NO_FITNESS_TEST_VALUE) setCurrentFitnessPassingScoreForEdit(''); }}
                        disabled={isLoadingFitnessUpdate}>
                        <SelectTrigger id="fitnessTestTypeEdit"><SelectValue placeholder="Select a test type (optional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_FITNESS_TEST_VALUE}>None</SelectItem>
                          {FITNESS_TEST_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="fitnessPassingScoreEdit">Passing Score</Label>
                      <Input id="fitnessPassingScoreEdit" type="text" placeholder="e.g. 14.5"
                        value={currentFitnessPassingScoreForEdit}
                        onChange={e => setCurrentFitnessPassingScoreForEdit(e.target.value)}
                        disabled={isLoadingFitnessUpdate || currentFitnessTestTypeForEdit === NO_FITNESS_TEST_VALUE || !currentFitnessTestTypeForEdit} />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setIsEditingFitnessCriteria(false)} disabled={isLoadingFitnessUpdate}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveFitnessCriteria} disabled={isLoadingFitnessUpdate}>
                        {isLoadingFitnessUpdate ? <Save className="animate-spin mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />} Save Criteria
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section 4: Scoring Model ── */}
              <div className="py-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4" /> Scoring Model
                </h3>
                {series && (
                  <SeriesScoringModel seriesId={series.id} organizationId={series.organizationId} seriesAdminUids={series.seriesAdminUids}
                    canEdit={!!currentAuthProfile?.roles?.includes('admin') || (isOrgAdmin && series.organizationId === activeOrganizationId) || (isUserASeriesAdminForThisSeries ?? false)} />
                )}
              </div>

            </CardContent>

            {/* ── Footer: Delete OR Archive (dynamic) ── */}
            {(canDeletePermission && canDelete === true) || showArchiveButton ? (
              <CardFooter className="border-t pt-4 flex justify-end gap-2">
                {canDeletePermission && canDelete === true ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isDeleting ? 'Deleting...' : 'Delete Series'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Series</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to permanently delete "{series?.name}"? This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteSeries} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                          {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : showArchiveButton ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm"
                        className={isSeriesArchived ? 'border-primary text-primary hover:bg-primary/10' : 'border-destructive text-destructive hover:bg-destructive/10'}
                        disabled={isPermissionsLoading}>
                        {isSeriesArchived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                        {isSeriesArchived ? "Unarchive Series" : "Archive Series"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to {isSeriesArchived ? "unarchive" : "archive"} this series?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {isSeriesArchived ? "Unarchiving will make this series active again." : "Archiving will also archive all its games and prevent new additions."}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleArchiveToggle} className={cn(isSeriesArchived ? "" : "bg-destructive hover:bg-destructive/90")}>
                          Confirm {isSeriesArchived ? "Unarchive" : "Archive"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </CardFooter>
            ) : null}
          </Card>
        </TabsContent>

        {/* ══ GAMES TAB ════════════════════════════════════════════════ */}
        <TabsContent value="games" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5" /> Games in this Series
                </CardTitle>
                {canAddGame && !isSeriesArchived && (
                  <Button asChild size="sm" className="bg-primary hover:bg-primary/90" disabled={isPermissionsLoading}>
                    <Link href={`/games/add?seriesId=${series.id}`}><PlusCircle className="mr-2 h-4 w-4" />Add Game to Series</Link>
                  </Button>
                )}
              </div>
              <CardDescription>
                {isSeriesArchived ? 'This series is archived — games are not shown.' : `Active matches scheduled or played as part of ${series.name}. Archived games are not shown here.`}
              </CardDescription>
            </CardHeader>
            {!isSeriesArchived && (
              <CardContent>
                {seriesGames.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {seriesGames.map(game => <GameCard key={game.id} game={game} />)}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No active games have been added to this series yet.</p>
                )}
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* ══ TEAMS TAB ════════════════════════════════════════════════ */}
        <TabsContent value="teams" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
                <Users className="h-5 w-5" /> Participating Teams
              </CardTitle>
              <CardDescription>Teams currently registered for {series.name}.</CardDescription>
            </CardHeader>
            <CardContent>
              {participatingTeams.length > 0 ? (
                <ul className="space-y-3">
                  {participatingTeams.map(team => (
                    <li key={team.id} className="p-3 bg-muted/50 rounded-md border flex justify-between items-center">
                      <span className="font-medium">{team.name} ({team.ageCategory})</span>
                      <Button variant="outline" size="sm" asChild><Link href={`/teams/${team.id}/details`}>View Roster</Link></Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No teams have been added to this series yet.</p>
              )}
            </CardContent>
            {canAddTeam && !isSeriesArchived && (
              <CardFooter className="border-t pt-6">
                <div className="w-full space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">Add Team to Series</h3>
                  {availableTeams.length > 0 ? (
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                      <div className="flex-grow">
                        <Label htmlFor="team-select" className="mb-1 block text-sm font-medium">Select Team ({series.ageCategory})</Label>
                        <Select value={selectedTeamToAdd} onValueChange={setSelectedTeamToAdd} disabled={isLoadingTeam || isPermissionsLoading}>
                          <SelectTrigger id="team-select"><SelectValue placeholder={`Select a team (${series.ageCategory})`} /></SelectTrigger>
                          <SelectContent>{availableTeams.map(team => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddTeamToSeries} disabled={isLoadingTeam || !selectedTeamToAdd || isPermissionsLoading} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
                        {isLoadingTeam ? <PlusCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Add Selected Team
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No more teams available in the {series.ageCategory} category to add to this series. You can <Link href={`/teams/add?seriesIdToLink=${series.id}&seriesAgeCategoryToEnforce=${encodeURIComponent(series.ageCategory)}`} className="underline text-primary">add a new team</Link>.</p>
                  )}
                </div>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ══ VENUES TAB ═══════════════════════════════════════════════ */}
        <TabsContent value="venues" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
                <MapPin className="h-5 w-5" /> Series Venues
              </CardTitle>
              <CardDescription>Venues specified for {series.name}. Venues can be viewed even if series is archived.</CardDescription>
            </CardHeader>
            <CardContent>
              {seriesVenues.length > 0 ? (
                <ul className="space-y-3">
                  {seriesVenues.map(venue => {
                    const hasCoordinates = venue.latitude !== undefined && venue.longitude !== undefined;
                    return (
                      <li key={venue.id} className="p-3 bg-muted/50 rounded-md border flex justify-between items-center">
                        <div>
                          <p className="font-medium">{venue.name}</p>
                          <p className="text-xs text-muted-foreground">{venue.address}</p>
                        </div>
                        {hasCoordinates ? (
                          <Button asChild variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/10">
                            <a href={`https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1">
                              <MapIconLucide className="h-3 w-3" /> Map
                            </a>
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" className="border-primary text-primary hover:bg-primary/10" disabled>
                            <MapIconLucide className="h-3 w-3" /> Map
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground">No venues have been assigned to this series yet.</p>
              )}
            </CardContent>
            {!isSeriesArchived && canAddVenue && (
              <CardFooter className="border-t pt-6">
                <div className="w-full space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">Add Venue to Series</h3>
                  {allAvailableVenues.length > 0 ? (
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                      <div className="flex-grow">
                        <Label htmlFor="venue-select" className="mb-1 block text-sm font-medium">Select Venue</Label>
                        <Select value={selectedVenueToAdd} onValueChange={setSelectedVenueToAdd} disabled={isLoadingVenue || isPermissionsLoading}>
                          <SelectTrigger id="venue-select"><SelectValue placeholder="Select a venue to add" /></SelectTrigger>
                          <SelectContent>{allAvailableVenues.map(venue => <SelectItem key={venue.id} value={venue.id}>{venue.name} ({venue.address})</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddVenueToSeries} disabled={isLoadingVenue || !selectedVenueToAdd || isPermissionsLoading} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
                        {isLoadingVenue ? <PlusCircle className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Add Selected Venue
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No more venues from this organization are available to add to this series. You can <Link href={`/venues/add?seriesIdToLink=${series.id}`} className="underline text-primary">add a new venue</Link> to the system (it will be associated with the active organization).</p>
                  )}
                </div>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ══ FITNESS TAB ══════════════════════════════════════════════ */}
        <TabsContent value="fitness" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
                  <ListChecks className="h-5 w-5" /> Fitness Tests
                </CardTitle>
                <div className="flex gap-2">
                  {canViewFitnessReport && !isSeriesArchived && isFitnessCriteriaDefinedForSeries && (
                    <Button asChild size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/10">
                      <Link href={`/series/${seriesId}/fitness-report`}><FileText className="mr-2 h-4 w-4" />View Series Fitness Report</Link>
                    </Button>
                  )}
                  {!!effectivePermissions[PERMISSIONS.FITNESS_TESTS_ADD] && !isSeriesArchived && (
                    isFitnessCriteriaDefinedForSeries ? (
                      <Button asChild size="sm" className="bg-primary hover:bg-primary/90" disabled={isPermissionsLoading}>
                        <Link href={`/series/${seriesId}/fitness-tests/add`}><PlusCircle className="mr-2 h-4 w-4" />Add New Fitness Test</Link>
                      </Button>
                    ) : (
                      <Button size="sm" className="bg-primary hover:bg-primary/90" disabled>
                        <PlusCircle className="mr-2 h-4 w-4" />Add New Fitness Test
                      </Button>
                    )
                  )}
                </div>
              </div>
              <CardDescription>
                Recorded fitness tests for {series.name}.
                {!isFitnessCriteriaDefinedForSeries && !!effectivePermissions[PERMISSIONS.FITNESS_TESTS_ADD] && !isSeriesArchived && (
                  <span className="block text-amber-600 text-xs mt-1">Define Fitness Test Type in the Overview tab before adding tests.</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {fitnessTests.length > 0 ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Administrator</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fitnessTests.map(test => (
                        <TableRow key={test.id}>
                          <TableCell>{format(parseISO(test.testDate), 'PPP')}</TableCell>
                          <TableCell>{test.testType}</TableCell>
                          <TableCell>{test.location}</TableCell>
                          <TableCell>{test.administratorName}</TableCell>
                          <TableCell>
                            <Badge variant={test.isCertified ? 'default' : 'secondary'} className={cn(test.isCertified ? 'bg-green-600 hover:bg-green-700' : '')}>
                              {test.isCertified ? <ShieldCheck className="h-3 w-3 mr-1"/> : <Activity className="h-3 w-3 mr-1"/>}
                              {test.isCertified ? 'Certified' : 'Pending'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="xs" asChild><Link href={`/fitness-tests/${test.id}/details`}>View/Record</Link></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground">No fitness tests have been recorded for this series yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

const InfoItem: React.FC<{icon: React.ReactNode, label: string, value: string | number | undefined | null}> = ({icon, label, value}) => (
  <div className="flex items-center gap-3 p-3 bg-background rounded-md border">
    <div className="p-2 bg-primary/10 rounded-md text-primary">
      {icon}
    </div>
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value ?? 'N/A'}</p>
    </div>
  </div>
);
