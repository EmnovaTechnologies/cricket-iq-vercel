
// src/app/fitness-tests/[id]/details/page.tsx
'use client';

import React, { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, useFieldArray, ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ArrowLeft, ShieldAlert, Info, ListChecks, User, CalendarDays, MapPin, ShieldCheck, Activity, CheckCircle, Edit3, Save, XCircle, UserPlus, Trash2, ChevronsUpDown, Check, UserX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatePickerField } from '@/components/date-picker-field';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import type { FitnessTestHeader, FitnessTestResult, UserProfile, Series, Player } from '@/types';
import { getFitnessTestHeaderByIdFromDB, getFitnessTestResultsForHeaderFromDB, getSeriesByIdFromDB, getPlayerByIdFromDB, getPlayersForTeamFromDB, getTeamsForSeriesFromDB } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import { format, isValid, parseISO } from 'date-fns';
import { certifyFitnessTestAction, updateFitnessTestAndResultsAction } from '@/lib/actions/fitness-actions';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const fitnessTestPlayerResultSchema = z.object({
  id: z.string().optional(), // Existing result ID if any
  playerId: z.string(),
  playerName: z.string(),
  avatarUrl: z.string().optional(),
  score: z.string().refine(val => {
    if (val.trim().toUpperCase() === 'ABS') return true;
    if (val.trim() === "") return true; // Allow empty string (will be treated as "Not Rated" on save)
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0 && num <= 100;
  }, { message: "Score must be a number (e.g., 15.5), 'ABS', or empty." }),
  notes: z.string().max(200, "Notes too long (max 200 chars)").optional(),
});

const fitnessTestDetailsFormSchema = z.object({
  testDate: z.date({ required_error: 'Test date is required.' }),
  location: z.string().min(1, 'Location is required.').max(100, "Location too long"),
  administratorName: z.string().min(1, 'Administrator name is required.').max(100, "Admin name too long"),
  playerResults: z.array(fitnessTestPlayerResultSchema).min(0),
});

type FitnessTestDetailsFormValues = z.infer<typeof fitnessTestDetailsFormSchema>;

// InfoItem component, similar to series details page, to avoid React.cloneElement issues
const InfoItem: React.FC<{icon: React.ReactNode, label: string, value: string | number | undefined | null}> = ({icon, label, value}) => (
  <div className="flex items-center gap-3 p-3 bg-background rounded-md border">
    <div className="p-2 bg-primary/10 rounded-md text-primary flex-shrink-0">
      {icon} {/* Icon is rendered directly. Ensure className is applied at call site. */}
    </div>
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value ?? 'N/A'}</p>
    </div>
  </div>
);

export default function FitnessTestDetailsPage() {
  const params = useParams<{ id: string }>();
  const testHeaderId = params.id;
  const router = useRouter();
  const { userProfile, isAuthLoading } = useAuth();
  const { toast } = useToast();

  const [testHeader, setTestHeader] = useState<FitnessTestHeader | null | undefined>(undefined);
  const [seriesDetails, setSeriesDetails] = useState<Series | null>(null);
  const [allPlayersInSeries, setAllPlayersInSeries] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCertifying, setIsCertifying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPlayerIdToAdd, setSelectedPlayerIdToAdd] = useState<string>('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);

  const form = useForm<FitnessTestDetailsFormValues>({
    resolver: zodResolver(fitnessTestDetailsFormSchema),
    defaultValues: {
      testDate: new Date(),
      location: '',
      administratorName: '',
      playerResults: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "playerResults",
  });

  const fetchDataAndSetupForm = async () => {
    setIsLoading(true);
    try {
      const header = await getFitnessTestHeaderByIdFromDB(testHeaderId);
      setTestHeader(header);

      if (header) {
        const [fetchedResults, seriesData, teamsInSeriesData] = await Promise.all([
          getFitnessTestResultsForHeaderFromDB(testHeaderId),
          header.seriesId ? getSeriesByIdFromDB(header.seriesId) : Promise.resolve(null),
          header.seriesId ? getTeamsForSeriesFromDB(header.seriesId) : Promise.resolve([]),
        ]);
        setSeriesDetails(seriesData || null);

        let playersForSeries: Player[] = [];
        if (teamsInSeriesData.length > 0) {
            const playerFetchPromises = teamsInSeriesData.map(team => getPlayersForTeamFromDB(team.id));
            const playersByTeam = await Promise.all(playerFetchPromises);
            const uniquePlayersMap = new Map<string, Player>();
            playersByTeam.flat().forEach(player => {
                if (!uniquePlayersMap.has(player.id)) {
                    uniquePlayersMap.set(player.id, player);
                }
            });
            playersForSeries = Array.from(uniquePlayersMap.values()).sort((a,b) => a.name.localeCompare(b.name));
        }
        setAllPlayersInSeries(playersForSeries);

        const enrichedResults: Array<z.infer<typeof fitnessTestPlayerResultSchema>> = await Promise.all(
          fetchedResults.map(async (result) => {
            const player = playersForSeries.find(p => p.id === result.playerId);
            return {
              id: result.id,
              playerId: result.playerId,
              playerName: player?.name || 'Unknown Player',
              avatarUrl: player?.avatarUrl,
              score: result.score === 'Not Rated' ? '' : result.score, 
              notes: result.notes || '',
            };
          })
        );
        
        form.reset({
            testDate: header.testDate ? parseISO(header.testDate) : new Date(),
            location: header.location,
            administratorName: header.administratorName,
            playerResults: enrichedResults.sort((a,b) => (a.playerName || '').localeCompare(b.playerName || '')),
        });

      } else {
        form.reset({ testDate: new Date(), location: '', administratorName: '', playerResults: []});
      }
    } catch (error) {
      console.error("Error fetching fitness test details:", error);
      setTestHeader(null);
      toast({ title: "Error", description: "Failed to load test details.", variant: "destructive"});
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthLoading) {
      return; // Wait for auth check to complete
    }
    if (testHeaderId) {
      fetchDataAndSetupForm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testHeaderId, isAuthLoading]);


  const handleCertifyTest = async () => {
    if (!testHeader || !userProfile || !testHeader.id || testHeader.isCertified) return;
    setIsCertifying(true);
    const result = await certifyFitnessTestAction(testHeader.id, userProfile.uid);
    if (result.success) {
      toast({ title: "Test Certified", description: result.message });
      await fetchDataAndSetupForm(); 
      setIsEditing(false); 
    } else {
      toast({ title: "Certification Failed", description: result.error, variant: "destructive" });
    }
    setIsCertifying(false);
  };

  const onSubmit = async (data: FitnessTestDetailsFormValues) => {
    if (!isEditing) { 
      console.warn("onSubmit called when not in editing mode. Aborting.");
      return;
    }
    if (!testHeader || !testHeader.id || testHeader.isCertified) {
        toast({ title: "Cannot Save", description: "Test not found or already certified.", variant: "destructive"});
        return;
    }
    if (data.playerResults.length === 0) {
        toast({ title: "No Players in Test", description: "Please add at least one player to the test before saving.", variant: "destructive" });
        return;
    }
    setIsSaving(true);
    const headerUpdates = {
        testDate: data.testDate.toISOString(),
        location: data.location,
        administratorName: data.administratorName,
    };
    const resultsToSave = data.playerResults.map(pr => ({
        playerId: pr.playerId,
        score: pr.score.trim() === '' ? 'Not Rated' : pr.score.trim().toUpperCase() === 'ABS' ? 'ABS' : pr.score.trim(),
        notes: pr.notes,
    }));

    const actionResult = await updateFitnessTestAndResultsAction({
        headerId: testHeader.id,
        headerUpdates,
        resultsData: resultsToSave,
        currentUserUid: userProfile?.uid || 'unknown_user',
    });

    if (actionResult.success) {
        toast({ title: "Changes Saved", description: "Fitness test details updated successfully."});
        await fetchDataAndSetupForm(); 
        setIsEditing(false);
    } else {
        toast({ title: "Save Failed", description: actionResult.error || "Could not save changes.", variant: "destructive"});
    }
    setIsSaving(false);
  };

  const currentlyTestedPlayerIds = useMemo(() => new Set(fields.map(field => field.playerId)), [fields]);
  const availablePlayersForCombobox = useMemo(() => {
    return allPlayersInSeries
      .filter(p => !currentlyTestedPlayerIds.has(p.id))
      .sort((a,b) => a.name.localeCompare(b.name));
  }, [allPlayersInSeries, currentlyTestedPlayerIds]);

  const handleAddPlayerToTest = () => {
    if (!selectedPlayerIdToAdd) {
      toast({ title: "No Player Selected", description: "Please select a player from the dropdown to add.", variant: "destructive" });
      return;
    }
    const playerToAdd = allPlayersInSeries.find(p => p.id === selectedPlayerIdToAdd);
    if (playerToAdd && !currentlyTestedPlayerIds.has(playerToAdd.id)) {
      append({
        playerId: playerToAdd.id,
        playerName: playerToAdd.name,
        avatarUrl: playerToAdd.avatarUrl,
        score: '', // Initialize score as empty string for edit mode
        notes: '',
      });
      setSelectedPlayerIdToAdd('');
    } else if (currentlyTestedPlayerIds.has(selectedPlayerIdToAdd)){
      toast({ title: "Player Already Added", variant: "default" });
    }
  };
  const handleRemovePlayerFromTest = (index: number) => remove(index);

  const canManage = userProfile && testHeader &&
                     (userProfile.roles.includes('admin') ||
                      (userProfile.roles.includes('Series Admin') && seriesDetails && userProfile.assignedSeriesIds?.includes(seriesDetails.id)));
  const canCertify = canManage && !testHeader?.isCertified;
  const canEdit = canManage && !testHeader?.isCertified;
  const isFormDisabled = isSaving || isCertifying || (testHeader?.isCertified ?? true);


  const getResultStatus = (scoreString: string): { text: 'Pass' | 'Fail' | 'N/A'; variant: 'default' | 'destructive' | 'secondary' } => {
    if (!seriesDetails?.fitnessTestPassingScore || scoreString.trim().toUpperCase() === 'ABS' || scoreString.trim() === "") {
      return { text: 'N/A', variant: 'secondary' };
    }
    const score = parseFloat(scoreString);
    const passingScore = parseFloat(seriesDetails.fitnessTestPassingScore);
    if (isNaN(score) || isNaN(passingScore)) {
      return { text: 'N/A', variant: 'secondary' };
    }
    return score >= passingScore ? { text: 'Pass', variant: 'default' } : { text: 'Fail', variant: 'destructive' };
  };


  if (isLoading || isAuthLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading fitness test details...</p>
      </div>
    );
  }

  if (testHeader === null) {
    return (
      <div className="max-w-2xl mx-auto">
        <Alert variant="destructive" className="mt-8">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Fitness Test Not Found</AlertTitle>
          <AlertDescription>
            The fitness test you are looking for does not exist or could not be loaded.
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (testHeader === undefined) { return <p className="text-center text-muted-foreground">Loading...</p>; }

  return (
    <Form {...form}>
    <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
             <Button variant="outline" size="sm" onClick={() => router.push(`/series/${testHeader.seriesId}/details`)} disabled={isSaving || isCertifying}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Series Details
            </Button>
            <div className="flex gap-2">
                {isEditing && canEdit && (
                    <>
                    <Button type="button" variant="ghost" onClick={() => { setIsEditing(false); fetchDataAndSetupForm(); }} disabled={isSaving || isCertifying}>
                        <XCircle className="mr-2 h-4 w-4"/>Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving || isCertifying || fields.length === 0} className="bg-primary hover:bg-primary/90">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                    </>
                )}
                {!isEditing && canEdit && (
                     <Button type="button" variant="outline" onClick={() => setIsEditing(true)} disabled={isSaving || isCertifying}>
                        <Edit3 className="mr-2 h-4 w-4"/>Edit Test
                    </Button>
                )}
                {canCertify && (
                    <Button type="button" onClick={handleCertifyTest} disabled={isSaving || isCertifying || isEditing} className="bg-green-600 hover:bg-green-700">
                        {isCertifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                        Certify This Test
                    </Button>
                )}
            </div>
        </div>
        <Card className="shadow-lg">
            <CardHeader className="bg-muted/50">
                <CardTitle className="text-2xl font-headline text-primary flex items-center gap-2">
                    <ListChecks className="h-6 w-6"/> Fitness Test: {testHeader.testType}
                </CardTitle>
                <CardDescription>
                    Test conducted on {form.getValues('testDate') && isValid(form.getValues('testDate')) ? format(form.getValues('testDate'), 'PPP') : 'N/A'}.
                    {testHeader.isCertified && (
                      <span className="block mt-1 text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle className="h-4 w-4"/> Certified on {testHeader.certifiedAt ? format(parseISO(testHeader.certifiedAt), 'Pp') : 'N/A'} by {testHeader.certifiedByDisplayName || 'Admin'}
                      </span>
                    )}
                     {!testHeader.isCertified && <span className="block mt-1 text-amber-600 font-medium">Status: Pending Certification</span>}
                </CardDescription>
                 {seriesDetails && (
                    <p className="text-sm text-muted-foreground pt-1">
                        Series: <Link href={`/series/${seriesDetails.id}/details`} className="text-primary hover:underline">{seriesDetails.name}</Link> ({seriesDetails.ageCategory} - {seriesDetails.year})
                    </p>
                )}
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                        control={form.control}
                        name="testDate"
                        render={({ field }) => (
                            <DatePickerField
                              field={field}
                              label="Test Date"
                              required
                              fromYear={new Date().getFullYear() - 5}
                              toYear={new Date().getFullYear()}
                              disabled={!isEditing || isFormDisabled}
                            />
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel>Location</FormLabel>
                            <FormControl><Input {...field} disabled={!isEditing || isFormDisabled} className="mt-auto" /></FormControl>
                            <FormDescription>Where the fitness test was conducted.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="administratorName"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                            <FormLabel>Administrator</FormLabel>
                            <FormControl><Input {...field} disabled={!isEditing || isFormDisabled} className="mt-auto" /></FormControl>
                            <FormDescription>Name of the test administrator.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                 <div className="space-y-1">
                    <InfoItem icon={<Activity className="h-5 w-5" />} label="Series Test Type" value={seriesDetails?.fitnessTestType || 'N/A'} />
                    <InfoItem icon={<ShieldCheck className="h-5 w-5" />} label="Series Passing Score" value={seriesDetails?.fitnessTestPassingScore || 'N/A'} />
                 </div>
                
                <div>
                    <h3 className="text-xl font-semibold mb-3 text-foreground">Player Results</h3>
                    {isEditing && !isFormDisabled && (
                        <div className="flex flex-col sm:flex-row gap-2 items-end mb-4 p-3 border rounded-md bg-muted/20">
                            <div className="flex-grow">
                                <Label htmlFor="player-combobox-trigger" className="mb-1 block text-sm">Add Player to Test</Label>
                                <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
                                <PopoverTrigger asChild>
                                    <Button id="player-combobox-trigger" variant="outline" role="combobox" aria-expanded={isComboboxOpen} className="w-full justify-between"
                                    disabled={isFormDisabled || availablePlayersForCombobox.length === 0}>
                                    {selectedPlayerIdToAdd ? availablePlayersForCombobox.find((p) => p.id === selectedPlayerIdToAdd)?.name : (availablePlayersForCombobox.length === 0 ? "No more players" : "Select player...")}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <Command><CommandInput placeholder="Search player..." /><CommandList><CommandEmpty>No player found.</CommandEmpty><CommandGroup>
                                    {availablePlayersForCombobox.map((p) => (
                                        <CommandItem key={p.id} value={p.name} onSelect={() => { setSelectedPlayerIdToAdd(p.id); setIsComboboxOpen(false); }}>
                                        <Check className={cn("mr-2 h-4 w-4", selectedPlayerIdToAdd === p.id ? "opacity-100" : "opacity-0")}/>{p.name} ({p.primarySkill})</CommandItem>
                                    ))}
                                    </CommandGroup></CommandList></Command>
                                </PopoverContent>
                                </Popover>
                            </div>
                            <Button type="button" onClick={handleAddPlayerToTest} disabled={isFormDisabled || !selectedPlayerIdToAdd || availablePlayersForCombobox.length === 0} variant="outline" className="w-full sm:w-auto">
                                <UserPlus className="mr-2 h-4 w-4" /> Add to Test
                            </Button>
                        </div>
                    )}

                    {fields.length > 0 ? (
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="w-[70px]">Avatar</TableHead>
                                        <TableHead>Player Name</TableHead>
                                        <TableHead className="w-[150px]">Score</TableHead>
                                        <TableHead className="w-[100px] text-center">Result</TableHead>
                                        <TableHead className="min-w-[200px]">Notes</TableHead>
                                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((item, index) => {
                                        const scoreValue = form.watch(`playerResults.${index}.score`);
                                        const displayScoreInViewMode = scoreValue === '' ? 'Not Rated' : scoreValue;
                                        const status = getResultStatus(scoreValue);
                                        return (
                                            <TableRow key={item.id}>
                                                <TableCell>
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={item.avatarUrl || `https://placehold.co/40x40.png`} alt={item.playerName} data-ai-hint="player avatar small"/>
                                                        <AvatarFallback>{item.playerName?.substring(0, 2).toUpperCase() || 'P'}</AvatarFallback>
                                                    </Avatar>
                                                </TableCell>
                                                <TableCell className="font-medium">{item.playerName}</TableCell>
                                                <TableCell>
                                                    {isEditing && !isFormDisabled ? (
                                                        <FormField control={form.control} name={`playerResults.${index}.score`}
                                                            render={({ field }) => (
                                                                <FormItem><FormLabel className="sr-only">Score for {item.playerName}</FormLabel>
                                                                <FormControl><Input placeholder="e.g., 14.5 or ABS" {...field} disabled={isFormDisabled}/></FormControl>
                                                                <FormMessage className="text-xs"/>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    ) : ( <span className="font-semibold">{displayScoreInViewMode}</span> )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={status.variant} className={cn(status.variant === 'default' ? "bg-green-100 text-green-700 border-green-300" : status.variant === 'destructive' ? "bg-red-100 text-red-700 border-red-300" : "")}>
                                                        {status.text}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing && !isFormDisabled ? (
                                                        <FormField control={form.control} name={`playerResults.${index}.notes`}
                                                        render={({ field }) => (
                                                            <FormItem><FormLabel className="sr-only">Notes for {item.playerName}</FormLabel>
                                                            <FormControl><Textarea placeholder="Observations..." {...field} rows={1} className="min-h-[38px] resize-none" disabled={isFormDisabled}/></FormControl>
                                                            <FormMessage className="text-xs"/></FormItem>
                                                        )}
                                                        />
                                                    ) : ( <span className="text-sm text-muted-foreground italic">{form.getValues(`playerResults.${index}.notes`) || '-'}</span> )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="outline" size="xs" asChild className="mr-1">
                                                       <Link href={`/players/${item.playerId}`} target="_blank">View Player</Link>
                                                    </Button>
                                                    {isEditing && !isFormDisabled && (
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemovePlayerFromTest(index)} disabled={isFormDisabled} aria-label={`Remove ${item.playerName}`}>
                                                            <UserX className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center py-4">No players added to this test session yet.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    </form>
    </Form>
  );
}
