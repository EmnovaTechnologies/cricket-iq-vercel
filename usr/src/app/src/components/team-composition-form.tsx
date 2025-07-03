
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { TeamCompositionCriteria as AIFlowCriteria } from '@/ai/flows/suggest-team-composition';
import { Loader2, Users, Filter as FilterIcon, Activity, Info, Target, Edit, CheckCircle, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import type { Series } from '@/types';
import { getGamesForSeriesAction, getTeamsForSeriesAction } from '@/lib/actions/series-actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { parseISO, isPast, isToday } from 'date-fns';
import Link from 'next/link';
import type { SeriesWithStatus, SeriesRatingStatus } from './team-composition-client-wrapper';

const teamCompositionFormSchema = z.object({
  seriesId: z.string().min(1, "Series selection is required."),
  numBatsmen: z.coerce.number().min(0).max(15, "Max 15 batsmen"),
  numTopOrderBatsmen: z.coerce.number().min(0).max(15, "Max 15 top order batsmen"),
  numMiddleOrderBatsmen: z.coerce.number().min(0).max(15, "Max 15 middle order batsmen"),
  numWicketKeepers: z.coerce.number().min(0).max(5, "Max 5 wicket keepers"),
  numFastBowlers: z.coerce.number().min(0).max(10, "Max 10 fast bowlers"),
  numMediumBowlers: z.coerce.number().min(0).max(10, "Max 10 medium bowlers"),
  numSpinners: z.coerce.number().min(0).max(5, "Max 5 spinners"),
  totalPlayers: z.coerce.number().min(1).max(20, "Total players between 1 and 20"),
  minPrimarySkillScore: z.coerce.number().min(0).max(5).optional(),
  minFieldingScore: z.coerce.number().min(0).max(5).optional(),
  minGamesPlayed: z.coerce.number().min(0).optional(),
  fitnessFilterOption: z.enum(['none', 'passedCertified', 'minScoreCertified']).optional().default('none'),
  minFitnessTestScore: z.coerce.number().min(0).max(100, "Score must be between 0 and 100.").optional(),
}).refine(data => {
  const specialistSum = data.numBatsmen + data.numWicketKeepers + data.numFastBowlers + data.numMediumBowlers + data.numSpinners;
  return data.totalPlayers >= specialistSum;
}, {
  message: "Total players must be greater than or equal to the sum of all specialist roles.",
  path: ["totalPlayers"],
}).refine(data => {
  return data.numTopOrderBatsmen + data.numMiddleOrderBatsmen <= data.numBatsmen;
}, {
  message: "Sum of Top Order and Middle Order batsmen cannot exceed the total number of batsmen.",
  path: ["numTopOrderBatsmen"],
}).superRefine((data, ctx) => {
  if (data.fitnessFilterOption === 'minScoreCertified' && (data.minFitnessTestScore === undefined || data.minFitnessTestScore === null)) {
    ctx.addIssue({
      path: ['minFitnessTestScore'],
      message: 'Minimum fitness score is required when "Minimum Certified Score" is selected.',
      code: z.ZodIssueCode.custom,
    });
  }
});

export type TeamCompositionFormValues = Omit<AIFlowCriteria, 'playerData'> & {
  seriesId: string;
  minPrimarySkillScore?: number;
  minFieldingScore?: number;
  minGamesPlayed?: number;
  fitnessFilterOption?: 'none' | 'passedCertified' | 'minScoreCertified';
  minFitnessTestScore?: number;
};

interface TeamCompositionFormProps {
  allSeriesPassed: SeriesWithStatus[];
  availableYears: string[];
  selectedYear: string;
  onYearChange: (year: string) => void;
  ratingStatusFilter: 'all' | SeriesRatingStatus;
  onRatingStatusChange: (status: 'all' | SeriesRatingStatus) => void;
  selectedSeriesId: string | null;
  onSeriesChange: (seriesId: string | null) => void;
  onSubmit: (data: TeamCompositionFormValues) => Promise<void>;
  isLoading: boolean;
  selectedSeriesDetails?: SeriesWithStatus | null;
  showCriteria: boolean;
  onRegenerateClick: () => void;
}

const ANY_GAMES_SELECT_VALUE = "__ANY_GAMES_PLAYED__";

export function TeamCompositionForm({ allSeriesPassed, availableYears, selectedYear, onYearChange, ratingStatusFilter, onRatingStatusChange, selectedSeriesId, onSeriesChange, onSubmit, isLoading, selectedSeriesDetails, showCriteria, onRegenerateClick }: TeamCompositionFormProps) {
  const [maxGamesPlayedInSeries, setMaxGamesPlayedInSeries] = useState<number>(0);
  
  const hasGameData = selectedSeriesDetails?.ratingStatus !== 'no_ratings';

  const form = useForm<TeamCompositionFormValues>({
    resolver: zodResolver(teamCompositionFormSchema),
    defaultValues: {
      seriesId: selectedSeriesId || '',
      numBatsmen: 5,
      numTopOrderBatsmen: 2,
      numMiddleOrderBatsmen: 2,
      numWicketKeepers: 1,
      numFastBowlers: 2,
      numMediumBowlers: 2,
      numSpinners: 1,
      totalPlayers: 11,
      minPrimarySkillScore: undefined,
      minFieldingScore: undefined,
      minGamesPlayed: undefined,
      fitnessFilterOption: 'none',
      minFitnessTestScore: undefined,
    },
  });

  const fitnessFilterOptionValue = form.watch('fitnessFilterOption');
  
  useEffect(() => {
    if (selectedSeriesId !== form.getValues('seriesId')) {
      form.setValue('seriesId', selectedSeriesId || '', { shouldValidate: true });
    }
  }, [selectedSeriesId, form]);

  useEffect(() => {
    const seriesDetails = allSeriesPassed.find(s => s.id === form.getValues('seriesId'));
    if (seriesDetails) {
      if (!seriesDetails.fitnessTestType || !seriesDetails.fitnessTestPassingScore) {
          form.setValue('fitnessFilterOption', 'none');
          form.setValue('minFitnessTestScore', undefined);
      }
    } else {
        form.setValue('fitnessFilterOption', 'none');
        form.setValue('minFitnessTestScore', undefined);
    }
  }, [selectedSeriesId, allSeriesPassed, form]);

  useEffect(() => {
    if (fitnessFilterOptionValue !== 'minScoreCertified') {
      form.setValue('minFitnessTestScore', undefined);
    }
  }, [fitnessFilterOptionValue, form]);

  useEffect(() => {
    const calculateMaxGames = async () => {
      const currentSeriesId = form.getValues('seriesId');
      if (currentSeriesId) {
        try {
          const gamesInSeries = await getGamesForSeriesAction(currentSeriesId);
          if (gamesInSeries.length > 0) {
            const teamsInSeries = await getTeamsForSeriesAction(currentSeriesId);
            let maxGames = 0;
            teamsInSeries.forEach(team => {
              let teamGamesCount = 0;
              gamesInSeries.forEach(game => {
                if (game.team1 === team.name || game.team2 === team.name) {
                  teamGamesCount++;
                }
              });
              if (teamGamesCount > maxGames) maxGames = teamGamesCount;
            });
            setMaxGamesPlayedInSeries(maxGames);
          } else {
            setMaxGamesPlayedInSeries(0);
          }
          if (form.getValues('minGamesPlayed') !== undefined && (form.getValues('minGamesPlayed') || 0) > maxGamesPlayedInSeries) {
            form.setValue('minGamesPlayed', undefined);
          }

        } catch (error) {
          console.error("Error fetching series details for max games calculation:", error);
          setMaxGamesPlayedInSeries(0);
          form.setValue('minGamesPlayed', undefined);
        }
      } else {
        setMaxGamesPlayedInSeries(0);
        form.setValue('minGamesPlayed', undefined);
      }
    };
    calculateMaxGames();
  }, [selectedSeriesId, form]);

  const showFitnessFilterSection = showCriteria && selectedSeriesDetails && selectedSeriesDetails.fitnessTestType && selectedSeriesDetails.fitnessTestPassingScore;
  const viewSavedTeamLink = `/series/${selectedSeriesDetails?.id}/saved-team?from=ai-composition`;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <fieldset className="space-y-6 p-4 border rounded-md">
          <legend className="text-lg font-semibold px-1 text-primary -ml-1">1. Select Series</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <FormItem>
              <FormLabel>Filter by Year</FormLabel>
              <Select value={selectedYear} onValueChange={onYearChange}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select a year" /></SelectTrigger></FormControl>
                <SelectContent>
                  {availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}
                </SelectContent>
              </Select>
            </FormItem>
            
            <FormItem>
              <FormLabel>Filter by Rating Status</FormLabel>
              <Select value={ratingStatusFilter} onValueChange={(value) => onRatingStatusChange(value as 'all' | SeriesRatingStatus)}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select a status" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="all">Show All</SelectItem>
                  <SelectItem value="certified">Certified Ratings</SelectItem>
                  <SelectItem value="pending">Pending Ratings</SelectItem>
                  <SelectItem value="no_ratings">No Rating Data</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>

            <FormField
              control={form.control}
              name="seriesId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Series</FormLabel>
                  <Select onValueChange={(value) => { field.onChange(value); if (onSeriesChange) { onSeriesChange(value || null); } }} value={field.value || ''} disabled={!selectedYear || allSeriesPassed.length === 0}>
                    <FormControl><SelectTrigger><SelectValue placeholder={!selectedYear ? "Select filters first" : "Choose a series"} /></SelectTrigger></FormControl>
                    <SelectContent>
                      {allSeriesPassed.map((series) => (
                        <SelectItem key={series.id} value={series.id}>
                          <div className="flex items-center gap-2">
                            {series.ratingStatus === 'certified' && <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" title="All played games have finalized ratings" />}
                            {series.ratingStatus === 'pending' && <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" title="This series has games with ratings still pending finalization." />}
                            <span className="truncate">{series.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
           {selectedSeriesDetails && !hasGameData && !isLoading && (
              <Alert variant="default" className="mt-4">
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Game Data Available</AlertTitle>
                  <AlertDescription>
                      The selected series does not have any past or present games with rating data. The AI cannot generate suggestions without performance data.
                  </AlertDescription>
              </Alert>
          )}
          {selectedSeriesDetails && selectedSeriesDetails.savedAiTeam && selectedSeriesDetails.savedAiTeam.length > 0 && (
            <Alert variant="default" className="border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle>Saved Team Found</AlertTitle>
              <AlertDescription className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mt-2">
                <span>A suggested team has already been saved for this series. You can view it, or modify the criteria below to regenerate.</span>
                <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <Button asChild size="sm" variant="secondary" className="flex-1">
                    <Link href={viewSavedTeamLink}>
                      <Target className="mr-2 h-4 w-4" /> View Saved Team
                    </Link>
                  </Button>
                  {!showCriteria && (
                    <Button type="button" size="sm" variant="outline" onClick={onRegenerateClick} className="flex-1">
                      <Edit className="h-4 w-4 mr-2"/> Regenerate
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </fieldset>

        {showCriteria && selectedSeriesId && hasGameData && (
        <>
          <fieldset className="space-y-6 p-4 border rounded-md">
            <legend className="text-lg font-semibold px-1 text-primary -ml-1 flex items-center gap-2">
              <Users className="h-5 w-5" />
              2. Define Team Composition Criteria
            </legend>
            <FormField
              control={form.control}
              name="totalPlayers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Players in Team</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="numBatsmen"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Specialist Batsmen</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numTopOrderBatsmen"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Top Order Batsmen</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>Count included in Total Batsmen</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numMiddleOrderBatsmen"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Middle Order Batsmen</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>Count included in Total Batsmen</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numWicketKeepers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Wicket Keepers</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numFastBowlers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fast Bowlers</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numMediumBowlers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Medium Pace Bowlers</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="numSpinners"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spinners</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </fieldset>
          
          <fieldset className="space-y-6 p-4 border rounded-md">
            <legend className="text-lg font-semibold px-1 text-primary -ml-1 flex items-center gap-2">
              <FilterIcon className="h-5 w-5" />
              3. Player Performance Filters (Optional)
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="minPrimarySkillScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min. Avg Primary Skill Score</FormLabel>
                    <FormControl><Input type="number" step="0.5" {...field} placeholder="e.g. 2.5" onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} value={field.value ?? ''} /></FormControl>
                    <FormDescription>(0-5 scale, from games in selected series)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minFieldingScore"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min. Avg Fielding Score</FormLabel>
                    <FormControl><Input type="number" step="0.5" {...field} placeholder="e.g. 3.0" onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))} value={field.value ?? ''} /></FormControl>
                    <FormDescription>(0-5 scale, from games in selected series)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minGamesPlayed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min. Games Played in Series</FormLabel>
                    <Select
                      onValueChange={(selectedValueFromDropdown) => {
                        field.onChange(selectedValueFromDropdown === ANY_GAMES_SELECT_VALUE ? undefined : parseInt(selectedValueFromDropdown));
                      }}
                      value={field.value === undefined ? ANY_GAMES_SELECT_VALUE : String(field.value)}
                      disabled={!selectedSeriesId || maxGamesPlayedInSeries === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={!selectedSeriesId ? "Select series first" : (maxGamesPlayedInSeries === 0 ? "No games in series" : "Select min games")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={ANY_GAMES_SELECT_VALUE}>Any</SelectItem>
                        <SelectItem value="0">0</SelectItem>
                        {maxGamesPlayedInSeries > 0 &&
                          [...Array(maxGamesPlayedInSeries).keys()].map(i => (
                            <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                    <FormDescription>Filters players by games played in selected series.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </fieldset>

          {showFitnessFilterSection && (
            <fieldset className="space-y-6 p-4 border rounded-md">
              <legend className="text-lg font-semibold px-1 text-primary -ml-1 flex items-center gap-2">
                <Activity className="h-5 w-5" />
                4. Player Fitness Filter (Optional)
              </legend>
              <FormDescription>
                  Applies to certified fitness tests of type: <strong>{selectedSeriesDetails?.fitnessTestType}</strong> (Series Passing Score: {selectedSeriesDetails?.fitnessTestPassingScore})
              </FormDescription>
              <FormField
                control={form.control}
                name="fitnessFilterOption"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Fitness Criteria</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col space-y-2"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="none" /></FormControl>
                          <FormLabel className="font-normal">None (Do not filter by fitness)</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="passedCertified" /></FormControl>
                          <FormLabel className="font-normal">Must have PASSED certified series fitness test</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl><RadioGroupItem value="minScoreCertified" /></FormControl>
                          <FormLabel className="font-normal">Must have MINIMUM certified score of:</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {fitnessFilterOptionValue === 'minScoreCertified' && (
                <FormField
                  control={form.control}
                  name="minFitnessTestScore"
                  render={({ field }) => (
                    <FormItem className="pl-8">
                      <FormLabel>Minimum Certified Score</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g. 14.5"
                          {...field}
                          onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the minimum certified score required (0-100). Player could have passed or failed series criteria.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </fieldset>
          )}


          <Button type="submit" disabled={isLoading || !selectedSeriesId || !hasGameData} className="w-full sm:w-auto bg-primary hover:bg-primary/90">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Get Team Suggestion
          </Button>
        </>
        )}
      </form>
    </Form>
  );
}
