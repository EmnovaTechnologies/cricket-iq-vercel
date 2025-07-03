
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type ControllerRenderProps, type FieldValues } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Info, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isValid, parse } from 'date-fns';
import type { Game, Series, Team, UserProfile, Venue } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { addGameAction } from '@/lib/actions/game-actions';
import { getTeamsForSeriesAction, getVenuesForSeriesAction } from '@/lib/actions/series-actions';
import React, { useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';


const gameFormSchema = z.object({
  seriesId: z.string({ required_error: 'Please select a series.' }).min(1, "Series selection is required."),
  date: z.date({
    required_error: 'A game date is required.',
    invalid_type_error: "Invalid date. Please use YYYY-MM-DD, MM/DD/YYYY, or select from calendar.",
  }),
  venue: z.string().min(1, { message: 'Venue selection is required.' }),
  team1: z.string().min(1, { message: 'Team 1 selection is required.' }),
  team2: z.string().min(1, { message: 'Team 2 selection is required.' }),
  selectorUserIds: z.array(z.string()).optional(),
}).refine(data => data.team1 !== data.team2, {
  message: "Team 1 and Team 2 cannot be the same.",
  path: ["team2"],
});

export type GameFormValues = z.infer<typeof gameFormSchema>;

interface GameFormProps {
  initialData?: Game;
  onSubmitSuccess?: (game: Game) => void;
  allSeriesForForm?: Series[];
  preselectedSeriesId?: string;
  potentialSelectors?: UserProfile[];
}

const DateInputWithCalendar: React.FC<{
    field: ControllerRenderProps<GameFormValues, 'date'>;
    label: string;
    description?: string;
    disabled?: boolean;
  }> = ({ field, label, description, disabled }) => {
    const [inputValue, setInputValue] = React.useState(
      field.value && isValid(field.value) ? format(field.value, 'yyyy-MM-dd') : ''
    );
    const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const currentYear = new Date().getFullYear();

    useEffect(() => {
      if (field.value && isValid(field.value)) {
        setInputValue(format(field.value, 'yyyy-MM-dd'));
      } else {
        setInputValue('');
      }
    }, [field.value]);


    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
      if (inputValue === "") {
        field.onChange(null);
        return;
      }
      const formatsToTry = ['MM/dd/yyyy', 'MM-dd-yyyy', 'yyyy-MM-dd'];
      let parsedDateFromInput: Date | null = null;

      for (const fmt of formatsToTry) {
        try {
          const date = parse(inputValue, fmt, new Date());
          if (isValid(date)) {
            parsedDateFromInput = date;
            break;
          }
        } catch (e) { /* ignore */ }
      }

      if (parsedDateFromInput && isValid(parsedDateFromInput)) {
         const year = parsedDateFromInput.getFullYear();
         if (year >= currentYear - 5 && year <= currentYear + 5) {
            field.onChange(parsedDateFromInput);
         } else {
            field.onChange(null);
         }
      } else {
        field.onChange(null);
      }
    };

    const handleCalendarSelect = (date: Date | undefined) => {
      field.onChange(date || null);
      setIsCalendarOpen(false);
    };

    return (
      <FormItem className="flex flex-col">
        <FormLabel>{label} <span className="text-destructive">*</span></FormLabel>
        <div className="relative">
          <FormControl>
            <Input
              ref={inputRef}
              placeholder="MM/DD/YYYY"
              value={inputValue}
              onChange={handleInputChange}
              onFocus={() => setIsCalendarOpen(true)}
              onBlur={handleInputBlur}
              className={cn('pr-10', disabled && 'cursor-not-allowed opacity-50')}
              disabled={disabled}
            />
          </FormControl>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.preventDefault(); setIsCalendarOpen((prev) => !prev);}}
                disabled={disabled}
                type="button"
                aria-label="Open calendar"
              >
                <CalendarIcon className="h-4 w-4 opacity-80" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                classNames={{ caption_label: 'hidden' }}
                selected={field.value instanceof Date && isValid(field.value) ? field.value : undefined}
                onSelect={handleCalendarSelect}
                disabled={(date) => date < new Date('1900-01-01') || !!disabled}
                initialFocus
                captionLayout="dropdown-buttons"
                fromYear={currentYear - 2}
                toYear={currentYear + 3}
              />
            </PopoverContent>
          </Popover>
        </div>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    );
  };

export function GameForm({ initialData, onSubmitSuccess, allSeriesForForm, preselectedSeriesId, potentialSelectors = [] }: GameFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [activeSeriesList, setActiveSeriesList] = useState<Series[]>(allSeriesForForm?.filter(s => s.status === 'active') || []);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [seriesVenues, setSeriesVenues] = useState<Venue[]>([]);
  const [currentSeriesObject, setCurrentSeriesObject] = useState<Series | undefined>(undefined);
  const [isClient, setIsClient] = useState(false);


  const defaultSeriesIdToUse = preselectedSeriesId || initialData?.seriesId || (activeSeriesList && activeSeriesList.length === 1 ? activeSeriesList[0].id : '');

  const form = useForm<GameFormValues>({
    resolver: zodResolver(gameFormSchema),
    defaultValues: initialData ? {
      ...initialData,
      date: initialData.date ? (isValid(new Date(initialData.date)) ? new Date(initialData.date) : undefined) : undefined,
      seriesId: defaultSeriesIdToUse,
      selectorUserIds: initialData.selectorUserIds || [],
    } : {
      seriesId: defaultSeriesIdToUse,
      date: new Date(),
      venue: '',
      team1: '',
      team2: '',
      selectorUserIds: [],
    },
  });

  useEffect(() => {
    setIsClient(true);
    if (!initialData && !form.getValues('date')) {
      form.setValue('date', new Date(), { shouldValidate: true });
    }
  }, [initialData, form]);


  const selectedSeriesIdForm = form.watch('seriesId');

  useEffect(() => {
    if (allSeriesForForm) {
      const activeOnly = allSeriesForForm.filter(s => s.status === 'active');
      setActiveSeriesList(activeOnly);
      if (defaultSeriesIdToUse && activeOnly.length === 1 && activeOnly[0].id === defaultSeriesIdToUse) {
        setCurrentSeriesObject(activeOnly[0]);
      } else if (defaultSeriesIdToUse) {
        const foundSeries = activeOnly.find(s => s.id === defaultSeriesIdToUse);
        setCurrentSeriesObject(foundSeries);
      }
    }
  }, [allSeriesForForm, defaultSeriesIdToUse]);

  useEffect(() => {
    const fetchSeriesDependents = async () => {
      const seriesIdToLoad = preselectedSeriesId || selectedSeriesIdForm;
      if (seriesIdToLoad) {

        const seriesDetails = activeSeriesList.find(s => s.id === seriesIdToLoad);
        setCurrentSeriesObject(seriesDetails);

        if(seriesDetails && seriesDetails.status === 'active'){
            const teams = await getTeamsForSeriesAction(seriesIdToLoad);
            setAvailableTeams(teams);
            const venues = await getVenuesForSeriesAction(seriesIdToLoad);
            setSeriesVenues(venues);

            if (form.getValues('team1') && !teams.find(t => t.name === form.getValues('team1'))) form.setValue('team1', '');
            if (form.getValues('team2') && !teams.find(t => t.name === form.getValues('team2'))) form.setValue('team2', '');
            if (form.getValues('venue') && !venues.find(v => v.name === form.getValues('venue'))) form.setValue('venue', '');
        } else {
            setAvailableTeams([]);
            setSeriesVenues([]);
            if (seriesDetails?.status === 'archived') {
                toast({ title: "Series Archived", description: `Cannot add game to archived series "${seriesDetails.name}".`, variant: "destructive" });
            }
        }
      } else {
        setAvailableTeams([]);
        setSeriesVenues([]);
        setCurrentSeriesObject(undefined);
      }
    };
    fetchSeriesDependents();
  }, [selectedSeriesIdForm, preselectedSeriesId, activeSeriesList, form, toast]);


  async function onSubmit(data: GameFormValues) {
    try {
      const gamePayload = {
        ...data,
        date: data.date.toISOString(),
        selectorUserIds: data.selectorUserIds || [],
      };
      const newOrUpdatedGame = await addGameAction(gamePayload);


      if (initialData) {
        toast({ title: 'Game Updated', description: `Details for game on ${format(data.date, 'PPP')} updated.` });
      } else {
        toast({ title: 'Game Added', description: `New game for series on ${format(data.date, 'PPP')} has been added.` });
      }

      if (onSubmitSuccess) {
        onSubmitSuccess(newOrUpdatedGame);
      } else {
        if (preselectedSeriesId) {
            router.push(`/series/${preselectedSeriesId}/details`);
        } else {
            router.push('/games');
        }
      }
      router.refresh();
    } catch (error) {
      let errorMessage = 'Could not save game details.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      console.error('Error submitting game form:', error);
    }
  }

  const selectedTeam1 = form.watch('team1');
  const seriesForForm = preselectedSeriesId ? currentSeriesObject : activeSeriesList.find(s => s.id === selectedSeriesIdForm);
  const preselectedSeriesName = preselectedSeriesId ? seriesForForm?.name : undefined;
  const isCurrentSeriesArchived = seriesForForm?.status === 'archived';

  if (!isClient && !initialData) {
    return null;
  }


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {preselectedSeriesId && preselectedSeriesName ? (
          <FormItem>
            <FormLabel>Series</FormLabel>
            <Input readOnly value={`${preselectedSeriesName} (${seriesForForm?.ageCategory} - ${seriesForForm?.year})`} className="bg-muted cursor-default" />
             <input type="hidden" {...form.register('seriesId')} value={preselectedSeriesId} />
          </FormItem>
        ) : (
          <FormField
            control={form.control}
            name="seriesId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Series</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an active series" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activeSeriesList.map((series) => (
                      <SelectItem key={series.id} value={series.id}>
                        {series.name} ({series.ageCategory} - {series.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                 {activeSeriesList.length === 0 && <FormDescription>No active series available. Please <Link href="/series/add" className="underline text-primary">add a new series</Link> or unarchive an existing one.</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {isCurrentSeriesArchived && seriesForForm && (
             <Alert variant="destructive">
                <Info className="h-4 w-4" />
                <AlertTitle>Series Archived</AlertTitle>
                <AlertDescription>
                The selected series "{seriesForForm.name}" is archived. You cannot add new games to an archived series.
                </AlertDescription>
            </Alert>
        )}

        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <DateInputWithCalendar
                field={field}
                label="Game Date"
                description="Accepted typed formats: MM/DD/YYYY, YYYY-MM-DD."
                disabled={isCurrentSeriesArchived}
            />
          )}
        />

        <FormField
          control={form.control}
          name="venue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Venue</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!selectedSeriesIdForm || seriesVenues.length === 0 || isCurrentSeriesArchived}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={!selectedSeriesIdForm ? "Select series first" : (seriesVenues.length === 0 ? "No venues for selected series" : "Select a venue")} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {seriesVenues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.name}>
                      {venue.name} ({venue.address})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSeriesIdForm && !isCurrentSeriesArchived && seriesVenues.length === 0 && (
                 <FormDescription>
                    No venues are associated with the selected series. Please <Link href={`/series/${selectedSeriesIdForm}/details`} className="underline text-primary">add venues to this series</Link>.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="team1"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team 1</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={!selectedSeriesIdForm || availableTeams.length < 2 || isCurrentSeriesArchived}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={!selectedSeriesIdForm ? "Select series first" : (availableTeams.length < 1 ? "No teams in series" : (availableTeams.length < 2 ? "Needs at least 2 teams": "Select Team 1"))} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableTeams.map((team) => (
                    <SelectItem key={team.id} value={team.name}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSeriesIdForm && !isCurrentSeriesArchived && availableTeams.length < 2 && (
                 <FormDescription>
                    At least two teams must be associated with the selected series to create a game. Please <Link href={`/series/${selectedSeriesIdForm}/details`} className="underline text-primary">add teams to this series</Link>.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="team2"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team 2</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={!selectedSeriesIdForm || availableTeams.length < 2 || !selectedTeam1 || isCurrentSeriesArchived}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={!selectedSeriesIdForm ? "Select series first" : (availableTeams.length < 2 ? "Not enough teams" : (!selectedTeam1 ? "Select Team 1 first" : "Select Team 2"))} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableTeams
                    .filter(team => team.name !== selectedTeam1)
                    .map((team) => (
                      <SelectItem key={team.id} value={team.name}>
                        {team.name}
                      </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {seriesForForm && !isCurrentSeriesArchived && (availableTeams.length < 2 || seriesVenues.length === 0) && (
          <Alert variant="destructive">
            <Info className="h-4 w-4" />
            <AlertTitle>Missing Information</AlertTitle>
            <AlertDescription>
              To add a game for "{seriesForForm.name}", please ensure the series has at least two participating teams and at least one venue assigned.
              You can manage these on the <Link href={`/series/${seriesForForm.id}/details`} className="underline font-semibold">series details page</Link>.
            </AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="selectorUserIds"
          render={() => (
            <FormItem>
              <div className="mb-2">
                <FormLabel className="text-base font-medium flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-primary" /> Assign Selectors (Optional)
                </FormLabel>
                <FormDescription>
                  Select users who will be responsible for rating players in this game. Users with 'selector', 'admin', or 'Series Admin' roles can be assigned.
                </FormDescription>
              </div>
              {potentialSelectors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users found with eligible roles to assign as selectors.</p>
              ) : (
                <ScrollArea className="h-40 rounded-md border p-2">
                  <div className="space-y-1.5">
                  {potentialSelectors.map((selectorUser) => (
                    <FormField
                      key={selectorUser.uid}
                      control={form.control}
                      name="selectorUserIds"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={selectorUser.uid}
                            className="flex flex-row items-center space-x-3 space-y-0 py-1 hover:bg-muted/50 rounded px-2"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(selectorUser.uid)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), selectorUser.uid])
                                    : field.onChange(
                                        (field.value || []).filter(
                                          (value) => value !== selectorUser.uid
                                        )
                                      )
                                }}
                                disabled={isCurrentSeriesArchived}
                              />
                            </FormControl>
                            <FormLabel className="font-normal text-sm cursor-pointer flex-grow">
                              {selectorUser.displayName || selectorUser.email} ({selectorUser.roles.join(', ')})
                            </FormLabel>
                          </FormItem>
                        )
                      }}
                    />
                  ))}
                  </div>
                </ScrollArea>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
            type="submit"
            className="w-full sm:w-auto bg-primary hover:bg-primary/90"
            disabled={!selectedSeriesIdForm || seriesVenues.length === 0 || availableTeams.length < 2 || isCurrentSeriesArchived}
        >
          {initialData ? 'Save Changes' : 'Add Game'}
        </Button>
      </form>
    </Form>
  );
}
