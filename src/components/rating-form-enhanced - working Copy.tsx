
'use client';

import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { PlayerInGameDetails, PlayerRating, GameRatingFormValues as GameRatingFormValuesType, RatingValue, Game, UserProfile, SelectorCertificationData, PrimarySkill, PermissionKey } from '@/types';
import { RATING_VALUES }
from '@/lib/constants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { saveGameRatingsToDB } from '@/lib/db';
import { certifyRatingsAction, finalizeGameRatingsAction, adminForceFinalizeGameRatingsAction } from '@/lib/actions/game-actions';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, MessageSquare, Users, Loader2, Save, CheckCircle, UserCheck, Info, AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '@/components/ui/table';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';


const createRatingFormSchema = (players: PlayerInGameDetails[]) => z.object({
  playerRatings: z.array(
    z.object({
      playerId: z.string(),
      batting: z.enum(RATING_VALUES).optional(),
      battingComment: z.string().max(200, "Comment too long").optional().nullable(),
      bowling: z.enum(RATING_VALUES).optional(),
      bowlingComment: z.string().max(200, "Comment too long").optional().nullable(),
      fielding: z.enum(RATING_VALUES).optional(),
      fieldingComment: z.string().max(200, "Comment too long").optional().nullable(),
      wicketKeeping: z.enum(RATING_VALUES).optional(),
      wicketKeepingComment: z.string().max(200, "Comment too long").optional().nullable(),
    })
  ),
});


type RatingFormValues = z.infer<ReturnType<typeof createRatingFormSchema>>;

interface RatingFormEnhancedProps {
  game: Game; 
  players: PlayerInGameDetails[];
  initialRatings?: PlayerRating[];
  team1NameFromGame: string;
  team2NameFromGame: string;
  currentUserProfile: UserProfile | null; 
  gameSelectorsFullProfiles: UserProfile[]; 
  onRatingsUpdated: () => void; 
  canAdminForceFinalize: boolean;
  isFutureGame: boolean;
  effectivePermissions: Record<PermissionKey, boolean>;
}

export function RatingFormEnhanced({ game, players, initialRatings = [], team1NameFromGame, team2NameFromGame, currentUserProfile, gameSelectorsFullProfiles, onRatingsUpdated, canAdminForceFinalize, isFutureGame, effectivePermissions }: RatingFormEnhancedProps) {
  const { toast } = useToast();
  const gameId = game.id;

  const [actionInProgress, setActionInProgress] = useState<'save' | 'certify' | 'finalize' | null>(null);
  const [showAdminFinalizeDialog, setShowAdminFinalizeDialog] = useState(false);
  
  const [showCertifyConfirmDialog, setShowCertifyConfirmDialog] = useState(false);
  const [certifyConfirmDialogMessage, setCertifyConfirmDialogMessage] = useState('');
  const [dataToCertify, setDataToCertify] = useState<RatingFormValues | null>(null);


  const [expandedState, setExpandedState] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    players.forEach(p => initialState[p.id] = false);
    return initialState;
  });

  const togglePlayerExpansion = (playerId: string) => {
    setExpandedState(prev => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const sanitizeInitialRatingValue = (value?: RatingValue | string): RatingValue | undefined => {
    if (value === 'NR' || value === undefined || value === null || value === '') return undefined;
    if (RATING_VALUES.includes(value as RatingValue)) return value as RatingValue;
    return undefined;
  };

  const defaultValuesForForm = useMemo(() => {
    const values = players.map(player => {
        const existingRating = initialRatings.find(r => r.playerId === player.id);
        let defaultBatting = sanitizeInitialRatingValue(existingRating?.batting);
        let defaultBowling = sanitizeInitialRatingValue(existingRating?.bowling);
        let defaultFielding = sanitizeInitialRatingValue(existingRating?.fielding);
        let defaultWicketKeeping = sanitizeInitialRatingValue(existingRating?.wicketKeeping);

        if (player.primarySkill === 'Batting') {
            if (defaultBatting === undefined) defaultBatting = "Not Rated";
            if (defaultFielding === undefined) defaultFielding = "Not Rated"; 
            if (defaultBowling === undefined) defaultBowling = "Not Applicable";
            if (defaultWicketKeeping === undefined) defaultWicketKeeping = "Not Applicable";
        } else if (player.primarySkill === 'Bowling') {
            if (defaultBatting === undefined) defaultBatting = "Not Rated";
            if (defaultBowling === undefined) defaultBowling = "Not Rated";
            if (defaultFielding === undefined) defaultFielding = "Not Rated"; 
            if (defaultWicketKeeping === undefined) defaultWicketKeeping = "Not Applicable";
        } else if (player.primarySkill === 'Wicket Keeping') {
            if (defaultBatting === undefined) defaultBatting = "Not Rated";
            if (defaultWicketKeeping === undefined) defaultWicketKeeping = "Not Rated";
            if (defaultFielding === undefined) defaultFielding = "Not Applicable"; 
            if (defaultBowling === undefined) defaultBowling = "Not Applicable"; 
        }

        const battingComment = existingRating?.battingComments?.[currentUserProfile?.uid || ''] || '';
        const bowlingComment = existingRating?.bowlingComments?.[currentUserProfile?.uid || ''] || '';
        const fieldingComment = existingRating?.fieldingComments?.[currentUserProfile?.uid || ''] || '';
        const wicketKeepingComment = existingRating?.wicketKeepingComments?.[currentUserProfile?.uid || ''] || '';

        return {
          playerId: player.id,
          batting: defaultBatting, battingComment,
          bowling: defaultBowling, bowlingComment,
          fielding: defaultFielding, fieldingComment,
          wicketKeeping: defaultWicketKeeping, wicketKeepingComment,
        };
    });
    return { playerRatings: values };
  }, [gameId, players, initialRatings, currentUserProfile?.uid]);


  const ratingFormSchema = createRatingFormSchema(players);
  const form = useForm<RatingFormValues>({
    resolver: zodResolver(ratingFormSchema),
    defaultValues: defaultValuesForForm,
    mode: 'onSubmit', reValidateMode: 'onChange',
  });
  
  useEffect(() => {
    form.reset(defaultValuesForForm);
  }, [gameId, players, initialRatings, form, defaultValuesForForm]); 

  const { fields } = useFieldArray({ control: form.control, name: 'playerRatings' });

  const proceedWithSaving = async (data: RatingFormValues, successMessage: string): Promise<boolean> => {
    if (!currentUserProfile || !currentUserProfile.uid) {
      toast({ title: 'Error', description: 'User profile not available. Cannot save ratings.', variant: 'destructive' });
      return false;
    }
    if (isFutureGame) {
      toast({ title: 'Future Game', description: 'Cannot save ratings for a game scheduled in the future.', variant: 'destructive' });
      return false;
    }

    const pristineStateFromInitialProps = defaultValuesForForm;
    let userMadeChanges = false;
    const skills: (keyof Pick<PlayerRating, 'batting' | 'bowling' | 'fielding' | 'wicketKeeping'>)[] = ['batting', 'bowling', 'fielding', 'wicketKeeping'];
    const normalizeRatingVal = (val?: RatingValue | ''): RatingValue => (val === undefined || val === null || val === '') ? 'Not Rated' : val as RatingValue;
    
    for (let i = 0; i < data.playerRatings.length; i++) {
      const currentPlayerData = data.playerRatings[i]; 
      const pristinePlayerDataForComparison = pristineStateFromInitialProps.playerRatings.find(p => p.playerId === currentPlayerData.playerId);

      if (!pristinePlayerDataForComparison) { 
        userMadeChanges = true; 
        break;
      }

      for (const skill of skills) {
        const currentValueInForm = currentPlayerData[skill];
        const pristineValueFromSnapshot = pristinePlayerDataForComparison[skill];
        const normalizedCurrentVal = normalizeRatingVal(currentValueInForm);
        const normalizedPristineVal = normalizeRatingVal(pristineValueFromSnapshot);
        
        if (normalizedCurrentVal !== normalizedPristineVal) {
          userMadeChanges = true;
          break; 
        }
         const commentKey = `${skill}Comment` as keyof typeof currentPlayerData;
         const currentComment = (currentPlayerData[commentKey] as string | null | undefined) || '';
         const pristineComment = (pristinePlayerDataForComparison[commentKey] as string | null | undefined) || '';
         if(currentComment !== pristineComment) {
            userMadeChanges = true;
            break;
         }
      }
      if (userMadeChanges) break;
    }
    
    try {
      const ratingsToSave: GameRatingFormValuesType = {};
      data.playerRatings.forEach(pr => {
        const ratingEntry: Partial<Omit<PlayerRating, 'id' | 'gameId' | 'playerId'>> = {};
        const normalizeRating = (value?: RatingValue | '') => (value === undefined || value === null || value === '') ? 'Not Rated' : value as RatingValue;
        
        ratingEntry.batting = normalizeRating(pr.batting);
        ratingEntry.bowling = normalizeRating(pr.bowling);
        ratingEntry.fielding = normalizeRating(pr.fielding);
        ratingEntry.wicketKeeping = normalizeRating(pr.wicketKeeping);

        if (pr.battingComment !== undefined) ratingEntry.battingComment = pr.battingComment;
        if (pr.bowlingComment !== undefined) ratingEntry.bowlingComment = pr.bowlingComment;
        if (pr.fieldingComment !== undefined) ratingEntry.fieldingComment = pr.fieldingComment;
        if (pr.wicketKeepingComment !== undefined) ratingEntry.wicketKeepingComment = pr.wicketKeepingComment;
        
        Object.keys(ratingEntry).forEach(key => {
            if (ratingEntry[key as keyof typeof ratingEntry] === undefined) delete ratingEntry[key as keyof typeof ratingEntry];
        });
        ratingsToSave[pr.playerId] = ratingEntry as GameRatingFormValuesType[string];
      });
      
      await saveGameRatingsToDB(gameId, ratingsToSave, currentUserProfile.uid, !userMadeChanges); 
      toast({ title: successMessage, description: 'Player ratings for this game have been processed.' });
      onRatingsUpdated(); 
      return true;
    } catch (error) {
      console.error('[RatingFormEnhanced] Error submitting ratings:', error);
      let errorMessage = 'Could not save ratings.';
      if (error instanceof Error) errorMessage = error.message;
      toast({ title: 'Error Saving Ratings', description: errorMessage, variant: 'destructive' });
      return false;
    }
  };
  
  const onInvalid = (errors: any) => {
    console.error("[RatingFormEnhanced] Form validation errors:", JSON.stringify(errors, null, 2));
    const errorMessages = Object.values(errors.playerRatings || {}).flatMap((playerErrors: any) => 
        Object.values(playerErrors || {}).map((fieldError: any) => fieldError.message)
    ).filter(Boolean);

    const description = errorMessages.length > 0 
      ? `Please correct errors: ${errorMessages.slice(0,2).join('; ')}${errorMessages.length > 2 ? '...' : ''}` 
      : "Please correct the highlighted errors before proceeding.";

    toast({ title: "VALIDATION FAILED", description, variant: "destructive", duration: 7000 });
    if (actionInProgress !== null) setActionInProgress(null); 
  };
  
  const handleCertifyClick = async () => {
    if (!currentUserProfile || !currentUserProfile.uid || !currentUserProfile.displayName) {
      toast({ title: 'Error', description: 'User profile not available for certification.', variant: 'destructive' });
      setActionInProgress(null);
      return;
    }
    if (isFutureGame) {
      toast({ title: 'Future Game', description: 'Cannot certify ratings for a game scheduled in the future.', variant: 'destructive' });
      return;
    }
    
    const isValid = await form.trigger(); 
    if (!isValid) {
      onInvalid(form.formState.errors); 
      return; 
    }

    const formData = form.getValues();
    let warnings: string[] = [];
    let generalNotRatedCount = 0;

    formData.playerRatings.forEach(pr => {
        const playerDetails = players.find(p => p.id === pr.playerId);
        if (!playerDetails) return;

        const checkSkill = (skillRating: RatingValue | undefined, skillName: string, player: PlayerInGameDetails, isPrimarySkill: boolean, isExplicitlyRequiredSecondary: boolean = false) => {
            if (skillRating === 'Not Rated' || skillRating === 'Not Applicable' || skillRating === undefined) {
                if (isPrimarySkill) {
                    warnings.push(`${player.name}'s primary skill (${skillName}) is '${skillRating || 'Not Set'}'`);
                } else if (isExplicitlyRequiredSecondary) {
                    warnings.push(`${player.name}'s ${skillName} rating (required secondary) is '${skillRating || 'Not Set'}'`);
                } else if (skillRating === 'Not Rated') {
                    generalNotRatedCount++;
                }
            }
        };

        if (playerDetails.primarySkill === 'Batting') {
            checkSkill(pr.batting, "Batting", playerDetails, true);
            checkSkill(pr.fielding, "Fielding", playerDetails, false, true);
        } else if (playerDetails.primarySkill === 'Bowling') {
            checkSkill(pr.bowling, "Bowling", playerDetails, true);
            checkSkill(pr.batting, "Batting", playerDetails, false, true);
            checkSkill(pr.fielding, "Fielding", playerDetails, false, true);
        } else if (playerDetails.primarySkill === 'Wicket Keeping') {
            checkSkill(pr.wicketKeeping, "Wicket Keeping", playerDetails, true);
            checkSkill(pr.batting, "Batting", playerDetails, false, true);
            if (pr.fielding === 'Not Rated') generalNotRatedCount++; 
        }
        
        if (playerDetails.primarySkill !== 'Batting' && pr.batting === 'Not Rated' && !(playerDetails.primarySkill === 'Bowling' || playerDetails.primarySkill === 'Wicket Keeping')) generalNotRatedCount++;
        if (playerDetails.primarySkill !== 'Bowling' && pr.bowling === 'Not Rated') generalNotRatedCount++;
        if (playerDetails.primarySkill !== 'Wicket Keeping' && pr.wicketKeeping === 'Not Rated') generalNotRatedCount++;
        if (pr.fielding === 'Not Rated' && !(playerDetails.primarySkill === 'Batting' || playerDetails.primarySkill === 'Bowling')) {
             if (playerDetails.primarySkill === 'Wicket Keeping' && pr.fielding !== 'Not Applicable') {
                 // This scenario is covered by the generalNotRatedCount for WKs above
             } else if (playerDetails.primarySkill !== 'Wicket Keeping') {
                 // This would be for a player with a primary skill not mentioned, but fielding is generally expected to be numeric or 'Not Rated'
             }
        }
    });
        
    let dialogMessage = "";
    if (warnings.length > 0) {
        dialogMessage += "Please review the following specific ratings:\n- " + warnings.join("\n- ") + "\n\n";
    }
    if (generalNotRatedCount > 0) {
        dialogMessage += `Additionally, there are ${generalNotRatedCount} other skill(s) marked as 'Not Rated'.\n\n`;
    }

    if (dialogMessage === "") {
        dialogMessage = "Please confirm that all ratings are accurate and complete before certifying.";
    } else {
        dialogMessage += "Are you sure you want to proceed with certification?";
    }
    
    setCertifyConfirmDialogMessage(dialogMessage);
    setDataToCertify(formData);
    setShowCertifyConfirmDialog(true);
  };

  const handleConfirmCertification = async () => {
    setShowCertifyConfirmDialog(false);
    if (!dataToCertify || !currentUserProfile?.uid || !currentUserProfile.displayName) {
        toast({ title: 'Error', description: 'Data or user profile missing for certification.', variant: 'destructive' });
        setDataToCertify(null);
        return;
    }
    if (isFutureGame) { // Re-check, though button should be disabled
      toast({ title: 'Future Game', description: 'Cannot certify ratings for a game scheduled in the future.', variant: 'destructive' });
      setDataToCertify(null);
      return;
    }

    setActionInProgress('certify');
    try {
      const saveSuccess = await proceedWithSaving(dataToCertify, "Ratings saved successfully before certification.");
      
      if (saveSuccess) {
        const ratingsSnapshot: Record<string, RatingValue> = {};
        dataToCertify.playerRatings.forEach(pr => {
          const normalize = (val?: RatingValue | '') => (val === undefined || val === null || val === '') ? 'Not Rated' : val as RatingValue;
          ratingsSnapshot[`${pr.playerId}_batting`] = normalize(pr.batting);
          ratingsSnapshot[`${pr.playerId}_bowling`] = normalize(pr.bowling);
          ratingsSnapshot[`${pr.playerId}_fielding`] = normalize(pr.fielding);
          ratingsSnapshot[`${pr.playerId}_wicketKeeping`] = normalize(pr.wicketKeeping);
        });

        const certResult = await certifyRatingsAction(gameId, currentUserProfile.uid, currentUserProfile.displayName, ratingsSnapshot);
        if (certResult.success) {
          toast({ title: 'Certification Successful', description: certResult.message });
          onRatingsUpdated(); 
        } else {
          toast({ title: 'Certification Failed', description: certResult.error, variant: 'destructive' });
        }
      } else {
        toast({ title: 'Certification Aborted', description: 'Could not certify ratings because saving failed.', variant: 'destructive' });
      }
    } finally {
      setActionInProgress(null);
      setDataToCertify(null);
    }
  };


  const handleSaveClick = async () => {
    if (!currentUserProfile || !currentUserProfile.uid) {
      toast({ title: 'Error', description: 'User profile not available. Cannot save ratings.', variant: 'destructive' });
      return;
    }
    if (isFutureGame) {
      toast({ title: 'Future Game', description: 'Cannot save ratings for a game scheduled in the future.', variant: 'destructive' });
      return;
    }
    setActionInProgress('save');
    try {
      await form.handleSubmit(
        async (data) => {
          await proceedWithSaving(data, "Ratings saved");
        },
        onInvalid 
      )(); 
    } finally {
      setActionInProgress(null);
    }
  };

  const handleFinalizeNowClick = async () => {
    if (!currentUserProfile?.uid) {
        toast({title: "Error", description: "Current user not identified.", variant: "destructive"});
        return;
    }
    if (isFutureGame) {
      toast({ title: 'Future Game', description: 'Cannot finalize ratings for a game scheduled in the future.', variant: 'destructive' });
      return;
    }
    setActionInProgress('finalize');
    try {
      const isValid = await form.trigger();
      if (!isValid) {
        onInvalid(form.formState.errors);
        setActionInProgress(null);
        return;
      }
      const formData = form.getValues();
      const saveSuccess = await proceedWithSaving(formData, "Ratings saved before finalization attempt.");

      if (saveSuccess) {
          const result = await finalizeGameRatingsAction(gameId, currentUserProfile.uid);
          if (result.success) {
              toast({ title: "Ratings Finalized", description: result.message });
              onRatingsUpdated();
          } else {
              toast({ title: "Finalization Failed", description: result.error, variant: "destructive" });
          }
      } else {
          toast({ title: "Finalization Aborted", description: "Could not finalize ratings because pre-finalization save failed.", variant: "destructive" });
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAdminForceFinalizeClick = async () => {
    if (!currentUserProfile?.uid) {
        toast({title: "Error", description: "Current user not identified.", variant: "destructive"});
        return;
    }
    if (isFutureGame) {
      toast({ title: 'Future Game', description: 'Cannot force finalize ratings for a game scheduled in the future.', variant: 'destructive' });
      setShowAdminFinalizeDialog(false);
      return;
    }
    setActionInProgress('finalize'); 
    try {
      const result = await adminForceFinalizeGameRatingsAction(gameId, currentUserProfile.uid);
      if (result.success) {
          toast({ title: "Ratings Force Finalized", description: result.message });
          onRatingsUpdated();
      } else {
          toast({ title: "Admin Force Finalization Failed", description: result.error, variant: "destructive" });
      }
    } finally {
      setActionInProgress(null);
      setShowAdminFinalizeDialog(false);
    }
  };


  const getPlayerForField = (formPlayerId: string) => players.find(p => p.id === formPlayerId);
  const getRatingOptions = (): RatingValue[] => [...RATING_VALUES] as RatingValue[];

  const isGameGloballyFinalized = game.ratingsFinalized === true;
  const isCurrentUserASelector = currentUserProfile && game.selectorUserIds?.includes(currentUserProfile.uid);
  const currentUserCert = currentUserProfile?.uid ? game.selectorCertifications?.[currentUserProfile.uid] : undefined;
  const isCurrentUserCertifiedAndCurrent = currentUserCert?.status === 'certified' && 
                                         (!game.ratingsLastModifiedAt || !currentUserCert.certifiedAt || new Date(currentUserCert.certifiedAt) >= new Date(game.ratingsLastModifiedAt));
  const isFormFieldsDisabledForCurrentUser = isFutureGame || isGameGloballyFinalized || (isCurrentUserASelector && isCurrentUserCertifiedAndCurrent);
  
  const canCertify = isCurrentUserASelector && !isCurrentUserCertifiedAndCurrent && !isFutureGame && effectivePermissions[PERMISSIONS.GAMES_CERTIFY_OWN_RATINGS_ASSIGNED];

  const allSelectors = game.selectorUserIds || [];
  const allSelectorsCertified = allSelectors.length > 0 && allSelectors.every(
    uid => {
        const certData = game.selectorCertifications?.[uid];
        return certData?.status === 'certified' && 
               (!game.ratingsLastModifiedAt || !certData.certifiedAt || new Date(certData.certifiedAt) >= new Date(game.ratingsLastModifiedAt));
    }
  );
  
  const canFinalize = allSelectorsCertified && !isGameGloballyFinalized && !isFutureGame && !!effectivePermissions[PERMISSIONS.GAMES_FINALIZE_ANY];


  const team1PlayersFields = fields.filter(field => {
    const player = getPlayerForField(form.getValues(`playerRatings.${fields.indexOf(field)}.playerId`));
    return player?.teamName === team1NameFromGame;
  });

  const team2PlayersFields = fields.filter(field => {
    const player = getPlayerForField(form.getValues(`playerRatings.${fields.indexOf(field)}.playerId`));
    return player?.teamName === team2NameFromGame;
  });

  const getSkillIcon = (skill: PrimarySkill) => {
    switch (skill) {
      case 'Batting': return <CricketBatIcon className="h-4 w-4" />;
      case 'Bowling': return <CricketBallIcon className="h-4 w-4" />;
      case 'Wicket Keeping': return <WicketKeeperGloves className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  return (
    <>
      <Form {...form}>
        <form className="space-y-6">
          {renderPlayerTable(team1NameFromGame, team1PlayersFields)}
          {renderPlayerTable(team2NameFromGame, team2PlayersFields)}

          {isGameGloballyFinalized && (
             <Alert variant="default" className="border-green-500 bg-green-50">
                <CheckCircle className="h-5 w-5 text-green-600"/>
                <AlertTitle className="text-green-700">Ratings Finalized</AlertTitle>
                <AlertDescription className="text-green-600">
                    Ratings for this game have been finalized and are now read-only.
                </AlertDescription>
            </Alert>
          )}

          {(team1PlayersFields.length > 0 || team2PlayersFields.length > 0) && !isGameGloballyFinalized && !isFutureGame && (
            <div className="flex flex-col sm:flex-row gap-2 mt-6 items-start">
              <Button type="button" variant="outline" className="w-full sm:w-auto border-primary text-primary hover:bg-primary/10" disabled={!!actionInProgress || isGameGloballyFinalized || isFormFieldsDisabledForCurrentUser || isFutureGame} onClick={handleSaveClick}>
                {actionInProgress === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {actionInProgress === 'save' ? 'Saving...' : 'Save All Ratings'}
              </Button>
              
              {isCurrentUserASelector && (
                <Button type="button" variant="default" className="w-full sm:w-auto bg-green-600 hover:bg-green-700" disabled={!!actionInProgress || !canCertify || isGameGloballyFinalized || isFutureGame} onClick={handleCertifyClick}>
                  {actionInProgress === 'certify' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
                  {actionInProgress === 'certify' ? 'Processing...' : (isCurrentUserCertifiedAndCurrent ? 'Ratings Certified' : 'Certify My Ratings')}
                </Button>
              )}
              
              <Button type="button" className="w-full sm:w-auto bg-primary hover:bg-primary/90" disabled={!!actionInProgress || !canFinalize || isGameGloballyFinalized || isFutureGame} onClick={handleFinalizeNowClick}>
                {actionInProgress === 'finalize' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                {actionInProgress === 'finalize' ? 'Processing...' : 'Finalize All Ratings'}
              </Button>
              
              {canAdminForceFinalize && !isGameGloballyFinalized && !isFutureGame && (
                <AlertDialog open={showAdminFinalizeDialog} onOpenChange={setShowAdminFinalizeDialog}>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" className="w-full sm:w-auto" disabled={!!actionInProgress || isFutureGame}>
                      {actionInProgress === 'finalize' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                      Admin: Force Finalize
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Admin: Force Finalize Ratings?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to force finalize the ratings for this game? This action should only be used if a selector is unavailable or unable to certify. The game will be locked based on currently saved ratings.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setShowAdminFinalizeDialog(false)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleAdminForceFinalizeClick} className="bg-destructive hover:bg-destructive/90">
                        Confirm Force Finalize
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

            </div>
          )}
          {team1PlayersFields.length === 0 && team2PlayersFields.length === 0 && (
               <Alert variant="default" className="mt-4">
                 <Info className="h-4 w-4"/>
                 <AlertTitle>No Players To Rate</AlertTitle>
                 <AlertDescription>No players are currently listed in the rosters for this game, or they could not be loaded.</AlertDescription>
               </Alert>
          )}
        </form>
      </Form>

      <AlertDialog open={showCertifyConfirmDialog} onOpenChange={(open) => {
          setShowCertifyConfirmDialog(open);
          if (!open) {
            setDataToCertify(null);
            if (actionInProgress === 'certify') setActionInProgress(null); 
          }
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Ratings Certification</AlertDialogTitle>
            <AlertDialogDescription style={{ whiteSpace: 'pre-line' }}>
              {certifyConfirmDialogMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowCertifyConfirmDialog(false); setDataToCertify(null); if (actionInProgress === 'certify') setActionInProgress(null); }}>Cancel & Review Ratings</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCertification} className="bg-green-600 hover:bg-green-700">
              Confirm & Certify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  function renderPlayerTable(teamName: string, playerFieldsForTeam: Array<typeof fields[number]>) {
    if (playerFieldsForTeam.length === 0) return null;
    const skillKeys: (keyof Pick<PlayerRating, 'batting'|'bowling'|'fielding'|'wicketKeeping'>)[] = ['batting', 'bowling', 'fielding', 'wicketKeeping'];

    return (
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3 text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />{teamName}
        </h2>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
                <TableHead className="min-w-[150px]">Player</TableHead>
                <TableHead className="min-w-[120px]">Primary Skill</TableHead>
                <TableHead className="min-w-[230px]">Batting</TableHead>
                <TableHead className="min-w-[230px]">Bowling</TableHead>
                <TableHead className="min-w-[230px]">Fielding</TableHead>
                <TableHead className="min-w-[230px]">Wicket Keeping</TableHead>
                <TableHead className="w-[80px] text-center">Notes</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {playerFieldsForTeam.map((fieldItem) => {
                const originalIndex = fields.findIndex(f => f.id === fieldItem.id);
                const player = getPlayerForField(form.getValues(`playerRatings.${originalIndex}.playerId`));
                if (!player) return null;
                const isCommentsExpanded = expandedState[player.id];
                
                const currentSelectorCertData = currentUserProfile?.uid ? game.selectorCertifications?.[currentUserProfile.uid] : undefined;
                const selectorLastCertifiedValues = currentSelectorCertData?.status === 'pending' ? currentSelectorCertData.lastCertifiedValues : undefined;

                return (
                  <React.Fragment key={fieldItem.id}>
                    <TableRow className={cn(isCommentsExpanded ? "border-b-0" : "", isFormFieldsDisabledForCurrentUser && "opacity-70")}>
                      <TableCell><div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8"><AvatarImage src={player.avatarUrl || 'https://placehold.co/32x32.png'} alt={player.name} data-ai-hint="player avatar small"/><AvatarFallback>{player.name.substring(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                          <span className="font-medium">{player.name}</span>
                      </div></TableCell>
                      <TableCell>
                        <Badge variant="outline" className="flex items-center gap-1.5 whitespace-nowrap">
                            {getSkillIcon(player.primarySkill)}
                            <span>{player.primarySkill}</span>
                        </Badge>
                      </TableCell>
                      
                      {skillKeys.map(skillKey => {
                        const formFieldName = `playerRatings.${originalIndex}.${skillKey}` as const;
                        const currentRatingValue = form.watch(formFieldName);
                        const snapshotKey = `${player.id}_${skillKey}`;
                        const lastCertifiedValueForThisRating = selectorLastCertifiedValues?.[snapshotKey];
                        
                        const normalizeRatingForDiff = (val?: RatingValue | '') => (val === undefined || val === null || val === '') ? 'Not Rated' : val as RatingValue;
                        const hasChanged = currentUserProfile && 
                                           currentSelectorCertData?.status === 'pending' && 
                                           lastCertifiedValueForThisRating !== undefined && 
                                           normalizeRatingForDiff(currentRatingValue) !== normalizeRatingForDiff(lastCertifiedValueForThisRating);

                        let skillLabel = skillKey.charAt(0).toUpperCase() + skillKey.slice(1);
                        
                        let isRequiredSkill = false;
                        if (player.primarySkill === 'Batting' && (skillKey === 'batting' || skillKey === 'fielding')) isRequiredSkill = true;
                        else if (player.primarySkill === 'Bowling' && (skillKey === 'bowling' || skillKey === 'batting' || skillKey === 'fielding')) isRequiredSkill = true;
                        else if (player.primarySkill === 'Wicket Keeping' && (skillKey === 'wicketKeeping' || skillKey === 'batting')) isRequiredSkill = true;


                        return (
                          <TableCell key={skillKey}>
                            <FormField
                              control={form.control}
                              name={formFieldName}
                              render={({ field: formField }) => (
                                <FormItem>
                                  <FormLabel className="sr-only">{skillLabel}</FormLabel>
                                  <Select onValueChange={formField.onChange} value={formField.value || ''} defaultValue={formField.value} disabled={isFormFieldsDisabledForCurrentUser}>
                                    <FormControl><SelectTrigger className={cn(hasChanged && "border-amber-500 ring-1 ring-amber-500")}>
                                      <SelectValue placeholder={`Rate ${skillLabel}${isRequiredSkill ? '*' : ''}`} />
                                    </SelectTrigger></FormControl>
                                    <SelectContent>{getRatingOptions().map(val => <SelectItem key={`${skillKey}-${val}`} value={val}>{val}</SelectItem>)}</SelectContent>
                                  </Select>
                                  {hasChanged && (
                                    <p className="text-xs text-amber-600 mt-1">
                                      (Previously: {lastCertifiedValueForThisRating})
                                    </p>
                                  )}
                                  <FormMessage className="text-xs mt-1" />
                                </FormItem>
                              )}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        <Button type="button" variant="ghost" size="sm" onClick={() => togglePlayerExpansion(player.id)} aria-label={isCommentsExpanded ? "Hide comments" : "Show comments"} disabled={!!actionInProgress || isFutureGame}>
                          <MessageSquare className="h-4 w-4" /><ChevronDown className={cn("h-4 w-4 ml-1 transition-transform", isCommentsExpanded && "rotate-180")} />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {isCommentsExpanded && (<TableRow className={cn(isFormFieldsDisabledForCurrentUser && "opacity-70")}><TableCell colSpan={7} className="p-0"><div className="bg-muted/30 p-4 space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">Comments for {player.name}</h4>
                        {skillKeys.map(skillKey => {
                           const currentRatingValue = form.watch(`playerRatings.${originalIndex}.${skillKey}` as const);
                           const formCommentFieldName = `playerRatings.${originalIndex}.${skillKey}Comment` as const;
                           const firestoreCommentFieldKey = `${skillKey}Comments` as keyof PlayerRating; 

                           if (currentRatingValue === 'Not Applicable') {
                             return null; 
                           }
                           return (
                            <div key={`${skillKey}CommentSection`} className="space-y-2">
                              <FormField
                                control={form.control}
                                name={formCommentFieldName}
                                render={({ field: formField }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">{skillKey.charAt(0).toUpperCase() + skillKey.slice(1)} Comment (Your Note)</FormLabel>
                                    <FormControl><Textarea placeholder={`Your notes on ${skillKey}...`} {...formField} value={formField.value ?? ''} rows={1} className="text-sm" disabled={isFormFieldsDisabledForCurrentUser} /></FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                              <div className="pl-2 border-l-2 border-muted-foreground/20 space-y-1">
                                {(game.selectorUserIds || [])
                                  .filter(uid => uid !== currentUserProfile?.uid)
                                  .map(otherSelectorUid => {
                                    const otherSelectorProfile = gameSelectorsFullProfiles.find(s => s.uid === otherSelectorUid);
                                    const playerInitialRating = initialRatings.find(r => r.playerId === player.id);
                                    const commentMap = playerInitialRating?.[firestoreCommentFieldKey] as Record<string, string> | undefined;
                                    const otherComment = commentMap?.[otherSelectorUid];

                                    if (otherComment) {
                                      return (
                                        <div key={otherSelectorUid} className="text-xs">
                                          <span className="font-semibold text-muted-foreground">
                                            {otherSelectorProfile?.displayName || `Selector (${otherSelectorUid.substring(0,4)})`}
                                          :</span>
                                          <p className="pl-2 text-muted-foreground whitespace-pre-wrap italic">{otherComment}</p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  })}
                               </div>
                            </div>
                           );
                        })}
                    </div></TableCell></TableRow>)}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    );
  }
}
    
