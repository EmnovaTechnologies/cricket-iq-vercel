
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type ControllerRenderProps, type FieldValues } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, AlertTriangle, Loader2, UploadCloud, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInYears, parseISO, isValid, parse } from 'date-fns';
import type { Player, Gender, BowlingStyle as BowlingStyleType, Team, AgeCategory, UserProfile } from '../../types';
import { PRIMARY_SKILLS, BATTING_ORDERS, BOWLING_STYLES, DOMINANT_HANDS, GENDERS } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import React, { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/auth-context';
import { Progress } from '@/components/ui/progress';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, collection, writeBatch, serverTimestamp, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getTeamByIdFromDB, addPlayerToTeamInDB, isPlayerAgeEligibleForTeamCategory, checkCricClubsIdExists } from '@/lib/db';
import { calculateEffectivePermissions } from '@/lib/actions/permission-actions';
import { PERMISSIONS } from '@/lib/permissions-master-list';

const NO_TEAM_VALUE = "__NO_TEAM_SELECTED__";

const playerFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required.').trim(),
  lastName: z.string().min(1, 'Last name is required.').trim(),
  cricClubsId: z.string().min(1, { message: 'CricClubs ID is required.' }).trim(),
  dateOfBirth: z.date({
    required_error: 'Date of Birth is required.',
    invalid_type_error: "Invalid date. Please use YYYY-MM-DD, MM/DD/YYYY, or select from calendar.",
  }),
  gender: z.enum(GENDERS, { required_error: 'Gender is required.' }),
  primarySkill: z.enum(PRIMARY_SKILLS, { required_error: 'Primary skill is required.' }),
  dominantHandBatting: z.enum(DOMINANT_HANDS, { required_error: 'Dominant batting hand is required.' }),
  battingOrder: z.enum(BATTING_ORDERS, { required_error: 'Batting order is required.' }),
  dominantHandBowling: z.enum(DOMINANT_HANDS).optional(),
  bowlingStyle: z.enum(BOWLING_STYLES).optional(),
  avatarUrl: z.string().url({ message: "Please enter a valid URL for the avatar." }).optional().or(z.literal('')),
  primaryTeamId: z.string().optional(),
  clubName: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.primarySkill === 'Bowling') {
    if (!data.dominantHandBowling) {
      ctx.addIssue({
        path: ['dominantHandBowling'],
        message: 'Bowling hand is required for bowlers.',
        code: z.ZodIssueCode.custom,
      });
    }
    if (!data.bowlingStyle) {
      ctx.addIssue({
        path: ['bowlingStyle'],
        message: 'Bowling style is required for bowlers.',
        code: z.ZodIssueCode.custom,
      });
    }
  }
});

export type PlayerFormValues = z.infer<typeof playerFormSchema>;

interface PlayerFormProps {
  initialData?: Player;
  onSubmitSuccess?: (player: Player) => void;
  allTeams: Team[];
  preselectedPrimaryTeamId?: string;
  preselectedPrimaryTeamName?: string;
  preselectedPrimaryTeamAgeCategory?: AgeCategory;
  preselectedClubName?: string;
}

const DateInputWithCalendarForPlayerDOB: React.FC<{
    field: ControllerRenderProps<PlayerFormValues, 'dateOfBirth'>;
    label: string;
    description?: string;
    disabled?: boolean;
  }> = ({ field, label, description, disabled }) => {
    const [inputValue, setInputValue] = React.useState(
      field.value && isValid(field.value) ? format(field.value, 'yyyy-MM-dd') : ''
    );
    const [isCalendarOpen, setIsCalendarOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

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
         if (year >= 1900 && year <= new Date().getFullYear()) {
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
                captionLayout="dropdown-buttons"
                fromYear={1950}
                toYear={new Date().getFullYear()}
                selected={field.value instanceof Date && isValid(field.value) ? field.value : undefined}
                onSelect={handleCalendarSelect}
                disabled={(date) => date > new Date() || date < new Date('1900-01-01') || !!disabled}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        {description && <FormDescription>{description}</FormDescription>}
        <FormMessage />
      </FormItem>
    );
  };


export function PlayerForm({
  initialData,
  onSubmitSuccess,
  allTeams,
  preselectedPrimaryTeamId,
  preselectedPrimaryTeamName,
  preselectedPrimaryTeamAgeCategory,
  preselectedClubName,
}: PlayerFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { activeOrganizationId, userProfile, activeOrganizationDetails } = useAuth();
  const isEditMode = !!initialData;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(playerFormSchema),
    defaultValues: initialData ? {
      firstName: initialData.firstName || initialData.name.split(' ')[0] || '',
      lastName: initialData.lastName || initialData.name.split(' ').slice(1).join(' ') || '',
      cricClubsId: initialData.cricClubsId.trim(),
      dateOfBirth: initialData.dateOfBirth ? parseISO(initialData.dateOfBirth) : undefined,
      gender: initialData.gender || undefined,
      primarySkill: initialData.primarySkill || undefined,
      battingOrder: initialData.battingOrder || undefined,
      dominantHandBatting: initialData.dominantHandBatting || undefined,
      dominantHandBowling: initialData.dominantHandBowling || undefined,
      bowlingStyle: initialData.bowlingStyle || undefined,
      avatarUrl: initialData.avatarUrl || '',
      primaryTeamId: initialData.primaryTeamId || NO_TEAM_VALUE,
      clubName: initialData.clubName || undefined,
    } : {
      firstName: '',
      lastName: '',
      cricClubsId: '',
      dateOfBirth: undefined,
      primarySkill: undefined,
      dominantHandBatting: undefined,
      battingOrder: undefined,
      dominantHandBowling: undefined,
      bowlingStyle: undefined,
      avatarUrl: '',
      primaryTeamId: preselectedPrimaryTeamId || NO_TEAM_VALUE,
      gender: undefined,
      clubName: preselectedClubName || undefined,
    },
  });

  const dateOfBirthValue = form.watch('dateOfBirth');
  const dominantHandBowlingValue = form.watch('dominantHandBowling');
  const primarySkillValue = form.watch('primarySkill');
  const watchedClubName = form.watch('clubName');

  const filteredTeamsForDropdown = useMemo(() => {
    if (!watchedClubName || watchedClubName === '') {
      return allTeams; // If no club is selected, show all teams
    }
    return allTeams.filter(team => 
      !team.clubName || team.clubName === '' || team.clubName === watchedClubName
    );
  }, [watchedClubName, allTeams]);

  useEffect(() => {
    const selectedTeamId = form.getValues('primaryTeamId');
    if (selectedTeamId && selectedTeamId !== NO_TEAM_VALUE) {
      const isSelectedTeamInFilteredList = filteredTeamsForDropdown.some(team => team.id === selectedTeamId);
      if (!isSelectedTeamInFilteredList) {
        form.setValue('primaryTeamId', NO_TEAM_VALUE, { shouldValidate: true });
      }
    }
  }, [filteredTeamsForDropdown, form]);

  const calculateAge = (dob: Date | undefined): number | undefined => {
    if (!dob) return undefined;
    return differenceInYears(new Date(), dob);
  };
  const age = calculateAge(dateOfBirthValue);

  const selectableBowlingStyles = useMemo(() => {
    if (dominantHandBowlingValue === 'Left Hand') {
      return ['Fast', 'Medium', 'Left Hand - Orthodox', 'Left Hand - Unorthodox'] as BowlingStyleType[];
    } else if (dominantHandBowlingValue === 'Right Hand') {
      return ['Fast', 'Medium', 'Off Spin', 'Leg Spin'] as BowlingStyleType[];
    }
    return BOWLING_STYLES.filter(style => style === 'Fast' || style === 'Medium' || style === 'Off Spin' || style === 'Leg Spin' || style === 'Left Hand - Orthodox' || style === 'Left Hand - Unorthodox');
  }, [dominantHandBowlingValue]);

  useEffect(() => {
    const currentBowlingStyle = form.getValues('bowlingStyle');
    if (dominantHandBowlingValue && currentBowlingStyle) {
      const isStyleValidForHand = selectableBowlingStyles.includes(currentBowlingStyle);
      if (!isStyleValidForHand) {
        form.setValue('bowlingStyle', undefined, { shouldValidate: true });
      }
    }
  }, [dominantHandBowlingValue, form, selectableBowlingStyles]);

  useEffect(() => {
    if (primarySkillValue === 'Batting' || primarySkillValue === 'Wicket Keeping') {
      if (form.getValues('dominantHandBowling') || form.getValues('bowlingStyle')) {
        form.setValue('dominantHandBowling', undefined, { shouldValidate: false });
        form.setValue('bowlingStyle', undefined, { shouldValidate: true });
      }
    }
  }, [primarySkillValue, form]);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarUploadError(null);
      setAvatarUploadProgress(0);
      form.setValue('avatarUrl', '');
    }
  };

  const handleFileUpload = async (file: File, orgId: string, playerId: string): Promise<string> => {
    setIsUploadingAvatar(true);
    setAvatarUploadError(null);
    setAvatarUploadProgress(0);

    const filePath = `organization_assets/${orgId}/player_avatars/${playerId}/${file.name.replace(/\s+/g, '_')}`;
    const fileStorageRef = storageRef(storage, filePath);

    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(fileStorageRef, file);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setAvatarUploadProgress(progress);
        },
        (error) => {
          setIsUploadingAvatar(false);
          setAvatarUploadError(error.message);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            setIsUploadingAvatar(false);
            setAvatarUploadProgress(100);
            resolve(downloadURL);
          } catch (getUrlError) {
            setIsUploadingAvatar(false);
            setAvatarUploadError('Failed to get download URL.');
            reject(getUrlError);
          }
        }
      );
    });
  };

  async function onSubmit(data: PlayerFormValues) {
    setIsSubmitting(true);
    setAvatarUploadError(null);

    // --- Permission Check ---
    if (!userProfile) {
      toast({ title: 'Authentication Error', description: 'You must be logged in with a valid profile.', variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }
    const permissions = await calculateEffectivePermissions(userProfile);
    if (isEditMode) {
      const canEdit = permissions[PERMISSIONS.PLAYERS_EDIT_ANY] ||
                      (permissions[PERMISSIONS.PLAYER_EDIT_SELF] && userProfile.playerId === initialData?.id) ||
                      permissions[PERMISSIONS.PLAYERS_EDIT_ASSIGNED];
      if (!canEdit) {
        toast({ title: "Permission Denied", description: "You do not have permission to edit this player.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    } else {
      if (!permissions[PERMISSIONS.PLAYERS_ADD]) {
        toast({ title: "Permission Denied", description: "You do not have permission to add new players.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
    }

    const orgIdForAction = initialData?.organizationId || activeOrganizationId;
    if (!orgIdForAction) {
      toast({ title: 'Error: No Organization Context', description: 'Could not determine the organization for this player.', variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }

    const cricClubsId = data.cricClubsId.trim();
    const idExists = await checkCricClubsIdExists(cricClubsId, initialData?.id);
    if (idExists) {
        toast({ title: 'Validation Error', description: 'CricClubs ID already exists.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }

    try {
      const playerId = isEditMode && initialData?.id ? initialData.id : doc(collection(db, 'players')).id;

      let finalAvatarUrl = data.avatarUrl;
      if (avatarFile) {
        toast({ title: "Uploading Avatar...", description: "Please wait." });
        finalAvatarUrl = await handleFileUpload(avatarFile, orgIdForAction, playerId);
      }

      const primaryTeamId = (data.primaryTeamId === NO_TEAM_VALUE || data.primaryTeamId === "") ? undefined : data.primaryTeamId;

      const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`;
      const nameTokens = fullName.toLowerCase().split(' ').filter(Boolean);
      const searchableNameTokens = [...nameTokens, fullName.toLowerCase()];
      
      const basePlayerData: { [key: string]: any } = {
        name: fullName,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        cricClubsId: cricClubsId,
        organizationId: orgIdForAction,
        searchableNameTokens: searchableNameTokens,
        dateOfBirth: format(data.dateOfBirth, 'yyyy-MM-dd'),
        gender: data.gender,
        primarySkill: data.primarySkill,
        battingOrder: data.battingOrder,
        dominantHandBatting: data.dominantHandBatting,
        dominantHandBowling: data.dominantHandBowling,
        bowlingStyle: data.bowlingStyle,
        avatarUrl: finalAvatarUrl,
        clubName: data.clubName,
        primaryTeamId: primaryTeamId,
      };

      if (isEditMode) {
        const dataForUpdate = { ...basePlayerData };
        Object.keys(dataForUpdate).forEach(key => {
          if (dataForUpdate[key] === undefined) {
            dataForUpdate[key] = deleteField();
          }
        });
        await updateDoc(doc(db, 'players', playerId), dataForUpdate);
      } else {
        const dataForCreate = { ...basePlayerData, gamesPlayed: 0 };
        Object.keys(dataForCreate).forEach(key => {
          if (dataForCreate[key] === undefined) {
            delete dataForCreate[key];
          }
        });
        await setDoc(doc(db, 'players', playerId), dataForCreate);
      }
      
      let teamMessage = '';
      if (primaryTeamId && (!initialData || initialData.primaryTeamId !== primaryTeamId)) {
        const team = await getTeamByIdFromDB(primaryTeamId);
        if (team && team.organizationId === orgIdForAction) {
          const isEligible = isPlayerAgeEligibleForTeamCategory({ gender: data.gender, dateOfBirth: format(data.dateOfBirth, 'yyyy-MM-dd') }, team.ageCategory, new Date().getFullYear());
          if (isEligible) {
            await addPlayerToTeamInDB(playerId, primaryTeamId);
            teamMessage = `Player was assigned to primary team: ${team.name}.`;
          } else {
            teamMessage = `Player was NOT assigned to team "${team.name}" due to age/gender ineligibility.`;
          }
        }
      }

      toast({
        title: isEditMode ? 'Player Updated' : 'Player Created',
        description: `${fullName} has been successfully saved. ${teamMessage}`,
      });

      if (onSubmitSuccess) {
        // We need to construct the full Player object to pass back
        const finalPlayerData = { ...initialData, ...basePlayerData, id: playerId, gamesPlayed: initialData?.gamesPlayed || 0 } as Player
        onSubmitSuccess(finalPlayerData);
      } else {
        router.push(isEditMode ? `/players/${playerId}` : '/players');
      }
      router.refresh();

    } catch (error) {
      toast({ title: 'Operation Failed', description: (error instanceof Error) ? error.message : 'An unexpected error occurred.', variant: 'destructive' });
      console.error('Error submitting player form:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const disableSubmitButton = isSubmitting || isUploadingAvatar;

  if (!activeOrganizationId && !initialData) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No Active Organization</AlertTitle>
        <AlertDescription>
          You must select an active organization from the navigation bar before adding a new player.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Virat" {...field} disabled={disableSubmitButton} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Kohli" {...field} disabled={disableSubmitButton} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="cricClubsId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CricClubs ID</FormLabel>
              <FormControl>
                <Input placeholder="Enter CricClubs ID" {...field} value={field.value ?? ""} disabled={disableSubmitButton} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormItem>
          <div className="flex justify-between items-center">
            <FormLabel>Player Avatar</FormLabel>
            {(form.getValues('avatarUrl') || avatarFile) && (
              <Button
                type="button" variant="ghost" size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive h-auto p-1 text-xs"
                onClick={() => { form.setValue('avatarUrl', ''); setAvatarFile(null); }}
                disabled={disableSubmitButton}>
                <Trash2 className="h-4 w-4 mr-1" />Remove Avatar
              </Button>
            )}
          </div>
          <FormControl><Input type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={handleFileSelect} disabled={disableSubmitButton} className="file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" /></FormControl>
          {avatarFile && <p className="text-xs text-muted-foreground mt-1">Selected: {avatarFile.name} ({ (avatarFile.size / 1024).toFixed(1) } KB)</p>}
          {isUploadingAvatar && <Progress value={avatarUploadProgress} className="w-full h-2 mt-1" />}
          {avatarUploadError && <p className="text-xs text-destructive mt-1">{avatarUploadError}</p>}
          {!isUploadingAvatar && form.getValues('avatarUrl') && !avatarFile && <p className="text-xs text-green-600 mt-1">Current Avatar URL: <a href={form.getValues('avatarUrl')} target="_blank" rel="noopener noreferrer" className="underline truncate block max-w-xs">{form.getValues('avatarUrl')}</a></p>}
          <FormDescription>Recommended: Square (e.g., 200x200px), PNG/JPG/SVG, max 1MB.</FormDescription>
        </FormItem>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField control={form.control} name="dateOfBirth"
            render={({ field }) => (
               <DateInputWithCalendarForPlayerDOB
                field={field} label="Date of Birth"
                description="Accepted typed formats: MM/DD/YYYY." disabled={disableSubmitButton}/>
            )}/>
          <FormItem><FormLabel>Age</FormLabel>
            <Input readOnly value={age !== undefined ? age : 'N/A'} className="bg-muted cursor-default" />
            <FormDescription>Calculated based on Date of Birth.</FormDescription>
          </FormItem>
        </div>
        <FormField control={form.control} name="gender"
          render={({ field }) => (
            <FormItem><FormLabel>Gender</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={disableSubmitButton}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                <SelectContent>{GENDERS.map((gender) => <SelectItem key={gender} value={gender}>{gender}</SelectItem>)}</SelectContent>
              </Select><FormMessage /></FormItem>
          )}/>
        <FormField control={form.control} name="clubName"
          render={({ field }) => (
            <FormItem><FormLabel>Club (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''} disabled={!!preselectedClubName || disableSubmitButton}>
                <FormControl><SelectTrigger>
                  <SelectValue placeholder={!activeOrganizationDetails?.clubs || activeOrganizationDetails.clubs.length === 0 ? "No clubs in this org" : "Select a club"} />
                </SelectTrigger></FormControl>
                <SelectContent>{activeOrganizationDetails?.clubs?.map(club => <SelectItem key={club} value={club}>{club}</SelectItem>)}</SelectContent>
              </Select>
              {preselectedClubName ? (<FormDescription>Club is pre-selected from the team page.</FormDescription>) : (<FormDescription>Player will be associated with this club.</FormDescription>)}
              <FormMessage /></FormItem>
          )}/>
        <FormField control={form.control} name="primaryTeamId"
          render={({ field }) => (
            <FormItem><FormLabel>Primary Team (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? NO_TEAM_VALUE} disabled={disableSubmitButton}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select primary team (optional)" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value={NO_TEAM_VALUE}>No Primary Team</SelectItem>
                  {filteredTeamsForDropdown.map((team) => (<SelectItem key={team.id} value={team.id}>{team.name} ({team.ageCategory})</SelectItem>))}
                </SelectContent>
              </Select>
              <FormDescription>If selected, player will be added to this team's roster if age-eligible. List is filtered by selected club.</FormDescription>
              <FormMessage /></FormItem>
          )}/>
        <FormField control={form.control} name="primarySkill"
          render={({ field }) => (
            <FormItem><FormLabel>Primary Skill</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={disableSubmitButton}>
                <FormControl><SelectTrigger><SelectValue placeholder="Select primary skill" /></SelectTrigger></FormControl>
                <SelectContent>{PRIMARY_SKILLS.map((skill) => (<SelectItem key={skill} value={skill}>{skill}</SelectItem>))}</SelectContent>
              </Select><FormMessage /></FormItem>
          )}/>
        <fieldset className="border p-4 rounded-md space-y-4"><legend className="text-sm font-medium px-1">Batting Details</legend>
           <FormField control={form.control} name="dominantHandBatting"
            render={({ field }) => (
              <FormItem><FormLabel>Dominant Hand (Batting)</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={disableSubmitButton}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Select dominant hand for batting" /></SelectTrigger></FormControl>
                  <SelectContent>{DOMINANT_HANDS.map((hand) => (<SelectItem key={hand} value={hand}>{hand}</SelectItem>))}</SelectContent>
                </Select><FormMessage /></FormItem>
            )}/>
          <FormField control={form.control} name="battingOrder"
              render={({ field }) => (
                <FormItem><FormLabel>Batting Order</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={disableSubmitButton}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select batting order" /></SelectTrigger></FormControl>
                    <SelectContent>{BATTING_ORDERS.map((order) => (<SelectItem key={order} value={order}>{order}</SelectItem>))}</SelectContent>
                  </Select><FormMessage /></FormItem>
              )}/>
        </fieldset>
        <fieldset className="border p-4 rounded-md space-y-4"><legend className="text-sm font-medium px-1">Bowling Details (Optional)</legend>
          <FormField control={form.control} name="dominantHandBowling"
              render={({ field }) => (
                <FormItem><FormLabel>Dominant Hand (Bowling)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={disableSubmitButton}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select dominant hand for bowling" /></SelectTrigger></FormControl>
                    <SelectContent>{DOMINANT_HANDS.map((hand) => (<SelectItem key={hand} value={hand}>{hand}</SelectItem>))}</SelectContent>
                  </Select><FormMessage /></FormItem>
              )}/>
          <FormField control={form.control} name="bowlingStyle"
              render={({ field }) => (
                <FormItem><FormLabel>Bowling Style</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={!dominantHandBowlingValue || disableSubmitButton}>
                    <FormControl><SelectTrigger>
                        <SelectValue placeholder={!dominantHandBowlingValue ? "Select dominant hand first" : "Select bowling style"} />
                    </SelectTrigger></FormControl>
                    <SelectContent>{selectableBowlingStyles.map((style) => (<SelectItem key={style} value={style}>{style}</SelectItem>))}</SelectContent>
                  </Select>
                  <FormMessage /></FormItem>
              )}/>
        </fieldset>
        <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90" disabled={disableSubmitButton}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? 'Save Changes' : 'Add Player'}
        </Button>
      </form>
    </Form>
  );
}
