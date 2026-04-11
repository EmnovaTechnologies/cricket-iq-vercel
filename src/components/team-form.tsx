
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Team, AgeCategory, UserProfile } from '@/types';
import { AGE_CATEGORIES } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { createTeamAdminAction } from '@/lib/actions/create-team-admin-action';
import { addTeamToSeriesAction } from '@/lib/actions/series-actions';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useState, useMemo, useEffect } from 'react'; 
import { Search, Loader2 } from 'lucide-react'; 
import { useAuth } from '@/contexts/auth-context';

const teamFormSchema = z.object({
  name: z.string().min(3, { message: 'Team name must be at least 3 characters.' }),
  clubName: z.string({ required_error: 'Please select a club.'}).min(1, 'Club is required.'),
  ageCategory: z.enum(AGE_CATEGORIES, { required_error: 'Age category is required.' }),
  teamManagerUids: z.array(z.string()).optional(),
});

type TeamFormValues = z.infer<typeof teamFormSchema>;

interface TeamFormProps {
  initialData?: Team;
  onSubmitSuccess?: (team: Team, seriesIdLinked?: string) => void;
  potentialTeamManagers: UserProfile[];
  preselectedSeriesIdToLink?: string;
  preselectedSeriesAgeCategoryToEnforce?: AgeCategory;
}

export function TeamForm({ 
  initialData, 
  onSubmitSuccess, 
  potentialTeamManagers,
  preselectedSeriesIdToLink,
  preselectedSeriesAgeCategoryToEnforce 
}: TeamFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { activeOrganizationId, activeOrganizationDetails } = useAuth();
  const [managerSearchQuery, setManagerSearchQuery] = useState(''); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: initialData ? {
      ...initialData,
      name: initialData.name.trim(),
      clubName: initialData.clubName,
      teamManagerUids: initialData.teamManagerUids || [],
      ageCategory: initialData.ageCategory || (preselectedSeriesAgeCategoryToEnforce || undefined),
    } : {
      name: '',
      clubName: '',
      ageCategory: preselectedSeriesAgeCategoryToEnforce || undefined,
      teamManagerUids: [],
    },
  });

  useEffect(() => {
    if (preselectedSeriesAgeCategoryToEnforce && form.getValues('ageCategory') !== preselectedSeriesAgeCategoryToEnforce) {
      form.setValue('ageCategory', preselectedSeriesAgeCategoryToEnforce);
    }
  }, [preselectedSeriesAgeCategoryToEnforce, form]);


  const lockedSuperAdmins = useMemo(() =>
    potentialTeamManagers.filter(u => u.roles.includes('admin')),
    [potentialTeamManagers]
  );

  const selectableManagers = useMemo(() =>
    potentialTeamManagers.filter(u => !u.roles.includes('admin')),
    [potentialTeamManagers]
  );

  const filteredTeamManagers = useMemo(() => {
    if (!managerSearchQuery) return selectableManagers;
    return selectableManagers.filter(user =>
      (user.displayName?.toLowerCase() || '').includes(managerSearchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(managerSearchQuery.toLowerCase())
    );
  }, [selectableManagers, managerSearchQuery]);

  async function onSubmit(data: TeamFormValues) {
    if (!activeOrganizationId) {
      toast({
        title: 'Error: No Active Organization',
        description: 'Please select an active organization before adding a team.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const trimmedData = {
        ...data,
        name: data.name.trim(),
      };

      const teamDataForAction = { 
        ...trimmedData, 
        teamManagerUids: [
          ...new Set([
            ...(data.teamManagerUids || []),
            ...lockedSuperAdmins.map(u => u.uid),
          ])
        ],
        organizationId: activeOrganizationId,
      };

      let newOrUpdatedTeam: Team;
      let mainToastMessage = '';

      if (initialData) {
        const result = await createTeamAdminAction(teamDataForAction);
        if (!result.success || !result.team) throw new Error(result.error || 'Failed to update team.');
        newOrUpdatedTeam = result.team;
        mainToastMessage = `Details for ${trimmedData.name} updated.`;
      } else {
        const result = await createTeamAdminAction(teamDataForAction);
        if (!result.success || !result.team) throw new Error(result.error || 'Failed to add team.');
        newOrUpdatedTeam = result.team;
        mainToastMessage = `${trimmedData.name} has been added.`;
      }

      let seriesLinkMessage = '';
      if (!initialData && preselectedSeriesIdToLink && newOrUpdatedTeam.ageCategory === preselectedSeriesAgeCategoryToEnforce) {
        const linkResult = await addTeamToSeriesAction(newOrUpdatedTeam.id, preselectedSeriesIdToLink);
        if (linkResult.success) {
          seriesLinkMessage = ` It has also been added to the series: ${linkResult.seriesName}.`;
        } else {
          seriesLinkMessage = ` Could not automatically add it to the series: ${linkResult.message}.`;
        }
      }
      
      toast({ title: 'Team Processed', description: mainToastMessage + seriesLinkMessage });


      if (onSubmitSuccess) {
        onSubmitSuccess(newOrUpdatedTeam, preselectedSeriesIdToLink);
      } else {
        router.refresh();
        if (!initialData && preselectedSeriesIdToLink && newOrUpdatedTeam.ageCategory === preselectedSeriesAgeCategoryToEnforce) {
          router.push(`/series/${preselectedSeriesIdToLink}/details`);
        } else {
          router.push('/teams');
        }
      } 
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Could not save team details.';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      console.error('Error submitting team form:', error);
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. U13 Lions" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormDescription>The team's name, like "U13 Lions". The club will be selected separately.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="clubName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Club</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value ?? ""}
                disabled={isSubmitting || !activeOrganizationId || !activeOrganizationDetails?.clubs || activeOrganizationDetails.clubs.length === 0}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={!activeOrganizationDetails?.clubs || activeOrganizationDetails.clubs.length === 0 ? "No clubs defined for this organization" : "Select a club for this team"} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {activeOrganizationDetails?.clubs?.map((club) => (
                    <SelectItem key={club} value={club}>{club}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                  The team will belong to this club within the organization. Clubs are managed on the organization details page.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="ageCategory"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Age Category</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value ?? ""}
                disabled={!!preselectedSeriesAgeCategoryToEnforce || isSubmitting} 
              >
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
              {preselectedSeriesAgeCategoryToEnforce && (
                <FormDescription>
                  Age category is set by the series you came from.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="teamManagerUids"
          render={() => (
            <FormItem>
              <div className="mb-2">
                <FormLabel className="text-base">Assign Team Managers (Optional)</FormLabel>
                <FormDescription>
                  Select users with 'Team Manager' or 'Series Admin' role in this organization. Super admins are always included.
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
                  placeholder="Search managers by name or email..."
                  value={managerSearchQuery}
                  onChange={(e) => setManagerSearchQuery(e.target.value)}
                  className="pl-8"
                  disabled={isSubmitting}
                />
              </div>
              {selectableManagers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users with 'Team Manager' or 'Series Admin' role found for this organization.</p>
              ) : filteredTeamManagers.length === 0 && managerSearchQuery ? (
                <p className="text-sm text-muted-foreground">No managers found matching your search.</p>
              ) : (
                <ScrollArea className="h-40 rounded-md border p-2">
                  <div className="space-y-1.5">
                    {filteredTeamManagers.map((managerUser) => (
                      <FormField
                        key={managerUser.uid}
                        control={form.control}
                        name="teamManagerUids"
                        render={({ field }) => (
                          <FormItem
                            key={managerUser.uid}
                            className="flex flex-row items-center space-x-3 space-y-0 py-1 hover:bg-muted/50 rounded px-2"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(managerUser.uid)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), managerUser.uid])
                                    : field.onChange(
                                        (field.value || []).filter(
                                          (value) => value !== managerUser.uid
                                        )
                                      );
                                }}
                                disabled={isSubmitting}
                              />
                            </FormControl>
                            <FormLabel className="font-normal text-sm cursor-pointer flex-grow">
                              {managerUser.displayName || managerUser.email}
                              <span className="text-muted-foreground ml-1 text-xs">({managerUser.roles.filter(r => r !== 'admin').join(', ')})</span>
                            </FormLabel>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
              <FormMessage />
            </FormItem>
          )}
        />


        <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? (isSubmitting ? 'Saving...' : 'Save Changes') : (isSubmitting ? 'Adding Team...' : 'Add Team')}
        </Button>
      </form>
    </Form>
  );
}
