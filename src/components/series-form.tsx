
'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type ControllerRenderProps, type FieldValues } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Series, AgeCategory, UserProfile, FitnessTestType } from '@/types';
import { AGE_CATEGORIES, FITNESS_TEST_TYPES } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { createSeriesAdminAction } from '@/lib/actions/create-series-admin-action';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useState, useMemo, useEffect, type ChangeEvent } from 'react';
import { CalendarIcon, Search, Loader2, AlertTriangle, Info, Activity } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid, parse } from 'date-fns';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const NO_FITNESS_TEST_VALUE = "__NO_FITNESS_TEST__";

const seriesFormSchema = z.object({
  name: z.string().min(3, { message: 'Series name must be at least 3 characters.' }),
  ageCategory: z.enum(AGE_CATEGORIES, { required_error: 'Age category is required.' }),
  year: z.coerce.number().min(new Date().getFullYear() - 10, { message: 'Year seems too old.' }).max(new Date().getFullYear() + 10, { message: 'Year is too far in the future.' }),
  seriesAdminUids: z.array(z.string()).optional(),
  maleCutoffDate: z.date({
    required_error: "Male cutoff date is required.",
    invalid_type_error: "Invalid date format. Please use YYYY-MM-DD, MM/DD/YYYY, or select from calendar.",
  }),
  femaleCutoffDate: z.date({
    required_error: "Female cutoff date is required.",
    invalid_type_error: "Invalid date format. Please use YYYY-MM-DD, MM/DD/YYYY, or select from calendar.",
  }),
  fitnessTestType: z.enum(FITNESS_TEST_TYPES).optional(),
  fitnessTestPassingScore: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.fitnessTestType && (!data.fitnessTestPassingScore || data.fitnessTestPassingScore.trim() === "")) {
    ctx.addIssue({
      path: ["fitnessTestPassingScore"],
      message: "Passing score is required when a fitness test type is selected.",
      code: z.ZodIssueCode.custom,
    });
  }
  if (data.fitnessTestPassingScore && data.fitnessTestPassingScore.trim() !== "" && isNaN(parseFloat(data.fitnessTestPassingScore))) {
     ctx.addIssue({
      path: ["fitnessTestPassingScore"],
      message: "Passing score must be a valid number (e.g., 14.5 or 15).",
      code: z.ZodIssueCode.custom,
    });
  }
});

type SeriesFormValues = z.infer<typeof seriesFormSchema>;

interface SeriesFormProps {
  initialData?: Series;
  onSubmitSuccess?: (series: Series) => void;
  potentialSeriesAdmins: UserProfile[];
}

const DateInputWithCalendar: React.FC<{
    field: ControllerRenderProps<FieldValues, string>;
    label: string;
    description: string;
  }> = ({ field, label, description }) => {
    const [inputValue, setInputValue] = React.useState(
      field.value && isValid(field.value) ? format(field.value, 'yyyy-MM-dd') : ''
    );
    const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const currentYear = new Date().getFullYear();

    useEffect(() => {
      if (field.value && isValid(field.value)) {
        if (inputValue !== format(field.value, 'yyyy-MM-dd')) {
            setInputValue(format(field.value, 'yyyy-MM-dd'));
        }
      } else if (field.value === null && inputValue !== "") {
      } else if (field.value === null && inputValue === "") {
      } else if (!field.value && inputValue !== "") {
      }
    }, [field.value, inputValue]);

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
      if (inputValue === "") {
        if (field.value !== null) field.onChange(null);
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
         if (year >= 1950 && year <= (new Date().getFullYear() + 100)) {
            if (!field.value || field.value.getTime() !== parsedDateFromInput.getTime()) {
              field.onChange(parsedDateFromInput);
            }
         } else {
            if (field.value !== null) field.onChange(null);
         }
      } else {
        if (field.value !== null) field.onChange(null);
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
              className={cn('pr-10')}
            />
          </FormControl>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.preventDefault(); setIsCalendarOpen((prev) => !prev);}}
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
                captionLayout="dropdown-buttons"
                fromYear={1950}
                toYear={new Date().getFullYear() + 5}
                selected={field.value instanceof Date && isValid(field.value) ? field.value : undefined}
                onSelect={handleCalendarSelect}
                disabled={(date) => date > new Date('2100-01-01') || date < new Date('1950-01-01') }
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <FormDescription>{description}</FormDescription>
        <FormMessage />
      </FormItem>
    );
  };

export function SeriesForm({ initialData, onSubmitSuccess, potentialSeriesAdmins }: SeriesFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { activeOrganizationId, loading: authLoading } = useAuth();
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SeriesFormValues>({
    resolver: zodResolver(seriesFormSchema),
    defaultValues: initialData ? {
        ...initialData,
        name: initialData.name.trim(),
        seriesAdminUids: initialData.seriesAdminUids || [],
        maleCutoffDate: initialData.maleCutoffDate && isValid(parseISO(initialData.maleCutoffDate)) ? parseISO(initialData.maleCutoffDate) : undefined,
        femaleCutoffDate: initialData.femaleCutoffDate && isValid(parseISO(initialData.femaleCutoffDate)) ? parseISO(initialData.femaleCutoffDate) : undefined,
        fitnessTestType: initialData.fitnessTestType || undefined,
        fitnessTestPassingScore: initialData.fitnessTestPassingScore || '',
      } : {
      name: '',
      ageCategory: undefined,
      year: new Date().getFullYear(),
      seriesAdminUids: [],
      maleCutoffDate: undefined,
      femaleCutoffDate: undefined,
      fitnessTestType: undefined,
      fitnessTestPassingScore: '',
    },
  });

  const watchedFitnessTestType = form.watch('fitnessTestType');

  useEffect(() => {
    if (watchedFitnessTestType === undefined) {
      form.setValue('fitnessTestPassingScore', '');
    }
  }, [watchedFitnessTestType, form]);

  const lockedSuperAdmins = useMemo(() => {
    return potentialSeriesAdmins.filter(user => user.roles.includes('admin'));
  }, [potentialSeriesAdmins]);

  const selectableAdmins = useMemo(() => {
    return potentialSeriesAdmins.filter(user => !user.roles.includes('admin'));
  }, [potentialSeriesAdmins]);

  const filteredPotentialSeriesAdmins = useMemo(() => {
    if (!adminSearchQuery) return selectableAdmins;
    return selectableAdmins.filter(user =>
      (user.displayName?.toLowerCase() || '').includes(adminSearchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(adminSearchQuery.toLowerCase())
    );
  }, [selectableAdmins, adminSearchQuery]);

  async function onSubmit(data: SeriesFormValues) {
    if (!activeOrganizationId) {
      toast({ title: 'Error', description: 'No active organization selected. Please select an organization first.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const trimmedData = {
        ...data,
        name: data.name.trim(),
      };
      const payload = {
        ...trimmedData,
        organizationId: activeOrganizationId,
        seriesAdminUids: [
          ...new Set([
            ...(data.seriesAdminUids || []),
            ...lockedSuperAdmins.map(u => u.uid),
          ])
        ],
        maleCutoffDate: data.maleCutoffDate && isValid(data.maleCutoffDate) ? format(data.maleCutoffDate, 'yyyy-MM-dd') : null,
        femaleCutoffDate: data.femaleCutoffDate && isValid(data.femaleCutoffDate) ? format(data.femaleCutoffDate, 'yyyy-MM-dd') : null,
        fitnessTestType: data.fitnessTestType || undefined,
        fitnessTestPassingScore: (data.fitnessTestType && data.fitnessTestPassingScore && data.fitnessTestPassingScore.trim() !== '') ? data.fitnessTestPassingScore.trim() : undefined,
      };

      if (initialData) {
        const result = await createSeriesAdminAction(payload);
        if (!result.success || !result.series) throw new Error(result.error || 'Failed to update series.');
        toast({ title: 'Series Updated', description: `Details for ${trimmedData.name} updated.` });
        if (onSubmitSuccess) {
          onSubmitSuccess(result.series);
        } else {
          router.refresh();
          router.push(`/series/${result.series.id}/details`);
        }
      } else {
        const result = await createSeriesAdminAction(payload);
        if (!result.success || !result.series) throw new Error(result.error || 'Failed to add series.');
        toast({ title: 'Series Added', description: `${trimmedData.name} has been added to the active organization.` });
        if (onSubmitSuccess) {
          onSubmitSuccess(result.series);
        } else {
          router.refresh();
          router.push('/series');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not save series details.';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      console.error('Error submitting series form:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading) {
    return <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading auth...</span></div>;
  }

  if (!activeOrganizationId && !authLoading) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Active Organization</AlertTitle>
        <AlertDescription>
          Please select an active organization from the navbar dropdown before adding a new series.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Series Name <span className="text-destructive">*</span></FormLabel>
              <FormControl>
                <Input placeholder="e.g. SoCal U13 Hub Games" {...field} disabled={isSubmitting || !activeOrganizationId} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="ageCategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Age Category <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={isSubmitting || !activeOrganizationId}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select age category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {AGE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year <span className="text-destructive">*</span></FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g. 2025" {...field} disabled={isSubmitting || !activeOrganizationId} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <FormField
            control={form.control}
            name="maleCutoffDate"
            render={({ field }) => (
              <DateInputWithCalendar
                field={field as ControllerRenderProps<FieldValues, string>}
                label="Male Cutoff Date"
                description="Player's Date of Birth must be on or after this date (for Males)."
              />
            )}
          />
          <FormField
            control={form.control}
            name="femaleCutoffDate"
            render={({ field }) => (
              <DateInputWithCalendar
                field={field as ControllerRenderProps<FieldValues, string>}
                label="Female Cutoff Date"
                description="Player's Date of Birth must be on or after this date (for Females)."
              />
            )}
          />
        </div>
        <FormDescription>
            Cutoff dates are mandatory. Player eligibility for this series will be based on these dates. Accepted typed formats: MM/DD/YYYY, YYYY-MM-DD.
        </FormDescription>

        <fieldset className="space-y-6 p-4 border rounded-md">
          <legend className="text-md font-medium px-1 text-foreground -ml-1 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Fitness Test Criteria (Optional)
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="fitnessTestType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fitness Test Type</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      const newTestType = value === NO_FITNESS_TEST_VALUE ? undefined : value as FitnessTestType;
                      field.onChange(newTestType);
                      if (newTestType === undefined) {
                        form.setValue('fitnessTestPassingScore', '');
                      }
                    }}
                    value={field.value || NO_FITNESS_TEST_VALUE}
                    disabled={isSubmitting || !activeOrganizationId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select fitness test type (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_FITNESS_TEST_VALUE}>None</SelectItem>
                      {FITNESS_TEST_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fitnessTestPassingScore"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passing Score</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="e.g. 14.5 or 15"
                      {...field}
                      value={field.value ?? ''}
                      disabled={isSubmitting || !activeOrganizationId || !watchedFitnessTestType}
                    />
                  </FormControl>
                  <FormDescription>Required if a fitness test type is selected.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <FormField
          control={form.control}
          name="seriesAdminUids"
          render={() => (
            <FormItem>
              <div className="mb-2">
                <FormLabel className="text-base">Assign Series Administrators (Optional)</FormLabel>
                <FormDescription>
                  Select users with 'Series Admin' role in this organization. Super admins are always included.
                </FormDescription>
              </div>

              {/* Locked super admins */}
              {lockedSuperAdmins.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 mb-2 space-y-1">
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

              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search Series Admins by name or email..."
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                  disabled={isSubmitting || !activeOrganizationId}
                />
              </div>
              {selectableAdmins.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users with 'Series Admin' role found for this organization.</p>
              ) : filteredPotentialSeriesAdmins.length === 0 && adminSearchQuery ? (
                <p className="text-sm text-muted-foreground">No Series Admins found matching your search.</p>
              ) : (
                <ScrollArea className="h-40 rounded-md border p-2">
                  <div className="space-y-1.5">
                  {filteredPotentialSeriesAdmins.map((adminUser) => (
                    <FormField
                      key={adminUser.uid}
                      control={form.control}
                      name="seriesAdminUids"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={adminUser.uid}
                            className="flex flex-row items-start space-x-3 space-y-0 py-1 hover:bg-muted/50 rounded px-2"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(adminUser.uid)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), adminUser.uid])
                                    : field.onChange(
                                        (field.value || []).filter(
                                          (value) => value !== adminUser.uid
                                        )
                                      )
                                }}
                                disabled={isSubmitting || !activeOrganizationId}
                              />
                            </FormControl>
                            <FormLabel className="font-normal text-sm cursor-pointer flex-grow">
                              {adminUser.displayName || adminUser.email}
                              <span className="text-muted-foreground ml-1 text-xs">(Series Admin)</span>
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

        <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90" disabled={isSubmitting || !activeOrganizationId}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? (isSubmitting ? 'Saving...' : 'Save Changes') : (isSubmitting ? 'Adding Series...' : 'Add Series')}
        </Button>
      </form>
    </Form>
  );
}
