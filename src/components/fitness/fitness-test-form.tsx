
// src/components/fitness/fitness-test-form.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatePickerField } from '@/components/date-picker-field';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Info, Loader2, Users, Save, Activity, UserPlus, Trash2, UserX, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import type { Series, Player, FitnessTestType } from '@/types';
import { createFitnessTestAndResultsAction } from '@/lib/actions/fitness-actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';


const fitnessTestPlayerResultSchema = z.object({
  playerId: z.string(),
  playerName: z.string(),
  avatarUrl: z.string().optional(),
  score: z.string().refine(val => {
    if (val.trim().toUpperCase() === 'ABS') return true;
    if (val.trim() === "") return true; // Allow empty string for "Not Rated"
    const num = parseFloat(val);
    return !isNaN(num) && num >= 0 && num <= 100; // Assuming score range for fitness tests
  }, { message: "Score must be a number (e.g., 15.5), 'ABS', or empty for 'Not Rated'." }),
  notes: z.string().max(200, "Notes too long (max 200 chars)").optional(),
});

const fitnessTestFormSchema = z.object({
  testDate: z.date({ required_error: 'Test date is required.' }),
  location: z.string().min(1, 'Location is required.').max(100, "Location too long"),
  administratorName: z.string().min(1, 'Administrator name is required.').max(100, "Admin name too long"),
  playerResults: z.array(fitnessTestPlayerResultSchema).min(0),
});

type FitnessTestFormValues = z.infer<typeof fitnessTestFormSchema>;

interface FitnessTestFormProps {
  series: Series;
  playersInSeries: Player[];
}

export function FitnessTestForm({ series, playersInSeries }: FitnessTestFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPlayerIdToAdd, setSelectedPlayerIdToAdd] = useState<string>('');
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);


  const form = useForm<FitnessTestFormValues>({
    resolver: zodResolver(fitnessTestFormSchema),
    defaultValues: {
      testDate: new Date(),
      location: '',
      administratorName: '',
      playerResults: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "playerResults",
  });

  const currentlyTestedPlayerIds = useMemo(() => {
    return new Set(fields.map(field => field.playerId));
  }, [fields]);

  const availablePlayersForCombobox = useMemo(() => {
    return playersInSeries
      .filter(p => !currentlyTestedPlayerIds.has(p.id))
      .sort((a,b) => a.name.localeCompare(b.name));
  }, [playersInSeries, currentlyTestedPlayerIds]);

  const handleAddPlayerToTest = () => {
    if (!selectedPlayerIdToAdd) {
      toast({ title: "No Player Selected", description: "Please select a player from the dropdown to add.", variant: "destructive" });
      return;
    }
    const playerToAdd = playersInSeries.find(p => p.id === selectedPlayerIdToAdd);
    if (playerToAdd && !currentlyTestedPlayerIds.has(playerToAdd.id)) {
      append({
        playerId: playerToAdd.id,
        playerName: playerToAdd.name,
        avatarUrl: playerToAdd.avatarUrl,
        score: '', // Initialize score as empty, to be treated as "Not Rated" if left empty
        notes: '',
      });
      setSelectedPlayerIdToAdd(''); // Clear selection after adding
    } else if (currentlyTestedPlayerIds.has(selectedPlayerIdToAdd)){
      toast({ title: "Player Already Added", description: `${playerToAdd?.name || 'Player'} is already in the list for this test.`, variant: "default" });
    }
  };

  const handleRemovePlayerFromTest = (index: number) => {
    remove(index);
  };


  async function onSubmit(data: FitnessTestFormValues) {
    setIsSubmitting(true);
    if (!series.fitnessTestType || !series.fitnessTestPassingScore) {
        toast({ title: "Series Criteria Missing", description: "Fitness test type or passing score is not defined for this series.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    if (!series.organizationId) {
        toast({ title: "Series Error", description: "Series is not associated with an organization.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }
    if (data.playerResults.length === 0) {
        toast({ title: "No Players in Test", description: "Please add at least one player to the test before saving.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    const headerData = {
      seriesId: series.id,
      organizationId: series.organizationId,
      testType: series.fitnessTestType,
      testDate: data.testDate.toISOString(),
      location: data.location,
      administratorName: data.administratorName,
    };

    const resultsData = data.playerResults.map(pr => ({
      playerId: pr.playerId,
      score: pr.score.trim() === '' ? 'Not Rated' : pr.score.trim().toUpperCase() === 'ABS' ? 'ABS' : pr.score.trim(),
      notes: pr.notes,
    }));

    try {
      const result = await createFitnessTestAndResultsAction({ headerData, resultsData });
      if (result.success) {
        toast({ title: "Fitness Test Recorded", description: `Test on ${format(data.testDate, 'PPP')} at ${data.location} saved successfully.` });
        router.push(`/series/${series.id}/details`);
        router.refresh();
      } else {
        toast({ title: "Error Recording Test", description: result.error || "An unknown error occurred.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error in FitnessTestForm onSubmit:", error);
      toast({ title: "Submission Error", description: "An unexpected error occurred during submission.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <Activity className="h-5 w-5 text-primary"/>
              Test Session Details
            </CardTitle>
             <CardDescription>
                All fitness tests for <strong className="text-accent">{series.name}</strong> must be of type: <strong className="text-accent">{series.fitnessTestType}</strong>. The passing score is: <strong className="text-accent">{series.fitnessTestPassingScore}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="testDate"
              render={({ field }) => (
                <DatePickerField
                  field={field}
                  label="Test Date"
                  description="Date the fitness test was conducted."
                  required
                  fromYear={new Date().getFullYear() - 5}
                  toYear={new Date().getFullYear()}
                />
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Location <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="e.g., Club Training Grounds" {...field} disabled={isSubmitting}/></FormControl>
                  <FormDescription>Where the fitness test was conducted.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="administratorName"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Test Administrator <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="e.g., Coach John Doe" {...field} disabled={isSubmitting}/></FormControl>
                  <FormDescription>Name of the person who conducted or oversaw the test.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                <Users className="h-5 w-5 text-primary"/>
                Select & Score Players
            </CardTitle>
            <CardDescription>Search and add players who participated in this test session, then enter their scores. Use "ABS" for absent players. Leave score blank for "Not Rated".</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 items-end">
              <div className="flex-grow">
                 <Label htmlFor="player-combobox-trigger" className="mb-1 block text-sm">Select Player to Add</Label>
                <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="player-combobox-trigger"
                      variant="outline"
                      role="combobox"
                      aria-expanded={isComboboxOpen}
                      className="w-full justify-between"
                      disabled={isSubmitting || availablePlayersForCombobox.length === 0}
                    >
                      {selectedPlayerIdToAdd
                        ? availablePlayersForCombobox.find((player) => player.id === selectedPlayerIdToAdd)?.name
                        : (availablePlayersForCombobox.length === 0 ? "No more players to add" : "Select player...")}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search player..." />
                      <CommandList>
                        <CommandEmpty>No player found.</CommandEmpty>
                        <CommandGroup>
                          {availablePlayersForCombobox.map((player) => (
                            <CommandItem
                              key={player.id}
                              value={player.name} 
                              onSelect={() => {
                                setSelectedPlayerIdToAdd(player.id);
                                setIsComboboxOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedPlayerIdToAdd === player.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {player.name} ({player.primarySkill})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type="button"
                onClick={handleAddPlayerToTest}
                disabled={isSubmitting || !selectedPlayerIdToAdd || availablePlayersForCombobox.length === 0}
                variant="outline"
                className="w-full sm:w-auto"
              >
                <UserPlus className="mr-2 h-4 w-4" /> Add Player to Test
              </Button>
            </div>

            {fields.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No players added to this test session yet.</p>
            ) : (
            <div className="overflow-x-auto rounded-md border">
                <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                    <TableHead className="w-[200px] sm:w-[250px]">Player</TableHead>
                    <TableHead className="w-[120px]">Score</TableHead>
                    <TableHead>Notes (Optional)</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {fields.map((item, index) => (
                    <TableRow key={item.id}>
                        <TableCell>
                        <div className="flex items-center gap-2">
                            <Avatar className="h-9 w-9">
                            <AvatarImage src={item.avatarUrl || `https://placehold.co/40x40.png`} alt={item.playerName} data-ai-hint="player avatar small"/>
                            <AvatarFallback>{item.playerName.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{item.playerName}</span>
                        </div>
                        </TableCell>
                        <TableCell>
                        <FormField
                            control={form.control}
                            name={`playerResults.${index}.score`}
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel className="sr-only">Score for {item.playerName}</FormLabel>
                                <FormControl><Input placeholder="e.g., 14.5 or ABS" {...field} disabled={isSubmitting}/></FormControl>
                                <FormMessage className="text-xs"/>
                            </FormItem>
                            )}
                        />
                        </TableCell>
                        <TableCell>
                        <FormField
                            control={form.control}
                            name={`playerResults.${index}.notes`}
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel className="sr-only">Notes for {item.playerName}</FormLabel>
                                <FormControl><Textarea placeholder="Any specific observations..." {...field} rows={1} className="min-h-[38px] resize-none" disabled={isSubmitting}/></FormControl>
                                <FormMessage className="text-xs"/>
                            </FormItem>
                            )}
                        />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePlayerFromTest(index)}
                            disabled={isSubmitting}
                            aria-label={`Remove ${item.playerName} from test`}
                          >
                            <UserX className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </div>
            )}
          </CardContent>
        </Card>

        <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90" disabled={isSubmitting || fields.length === 0}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {isSubmitting ? 'Saving Scores...' : 'Save Fitness Test Scores'}
        </Button>
      </form>
    </Form>
  );
}
