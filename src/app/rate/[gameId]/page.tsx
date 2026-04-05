'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getGameByIdFromDB, getPlayerByIdFromDB, getRatingsForGameFromDB, saveGameRatingsToDB } from '@/lib/db';
import type { Game, Player, PlayerRating, RatingValue } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Phone, ChevronLeft, ChevronRight, CheckCircle, ShieldAlert, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ConfirmationResult } from 'firebase/auth';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';

// Exact rating values matching web app
const NUMERIC_RATINGS: RatingValue[] = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0'];
const SPECIAL_RATINGS: RatingValue[] = ['Not Rated', 'Not Applicable'];

// All 4 skills always shown for every player
const ALL_SKILLS: SkillKey[] = ['batting', 'bowling', 'fielding', 'wicketKeeping'];

type SkillKey = 'batting' | 'bowling' | 'fielding' | 'wicketKeeping';

interface PlayerWithTeam extends Player {
  teamName: string;
}

interface PlayerRatings {
  batting: RatingValue;
  bowling: RatingValue;
  fielding: RatingValue;
  wicketKeeping: RatingValue;
}

function getDefaultRatings(player: Player): PlayerRatings {
  if (player.primarySkill === 'Batting') {
    return { batting: 'Not Rated', bowling: 'Not Applicable', fielding: 'Not Rated', wicketKeeping: 'Not Applicable' };
  } else if (player.primarySkill === 'Bowling') {
    return { batting: 'Not Rated', bowling: 'Not Rated', fielding: 'Not Rated', wicketKeeping: 'Not Applicable' };
  } else {
    return { batting: 'Not Rated', bowling: 'Not Applicable', fielding: 'Not Applicable', wicketKeeping: 'Not Rated' };
  }
}

function isPrimarySkill(player: Player, skill: SkillKey): boolean {
  if (player.primarySkill === 'Batting' && skill === 'batting') return true;
  if (player.primarySkill === 'Bowling' && skill === 'bowling') return true;
  if (player.primarySkill === 'Wicket Keeping' && skill === 'wicketKeeping') return true;
  return false;
}

function SkillIcon({ skill }: { skill: string }) {
  if (skill === 'Batting') return <CricketBatIcon className="h-4 w-4" />;
  if (skill === 'Bowling') return <CricketBallIcon className="h-4 w-4" />;
  if (skill === 'Wicket Keeping') return <WicketKeeperGloves className="h-4 w-4" />;
  return null;
}

function MobileRatePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId;
  const { signInWithPhoneNumberFlow, confirmPhoneNumberCode, isAuthLoading, currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  // Auth state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);

  // Game state
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<PlayerWithTeam[]>([]);
  const [existingRatings, setExistingRatings] = useState<PlayerRating[]>([]);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [resolvedSelectorUid, setResolvedSelectorUid] = useState<string | null>(null);

  // Rating state
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, PlayerRatings>>({});
  const [savedPlayers, setSavedPlayers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Load game data once user is authenticated
  useEffect(() => {
    if (!currentUser || !gameId || isLoadingGame) return;
    const load = async () => {
      setIsLoadingGame(true);
      try {
        const g = await getGameByIdFromDB(gameId);
        if (!g) { setIsLoadingGame(false); return; }
        setGame(g);

        // Check authorization — match by UID first, then by phone number
        // This handles the case where selector was assigned by email UID
        // but is logging in via phone OTP (different UID)
        let authorizedUid: string | null = null;

        // Step 1: Direct UID match
        if (g.selectorUserIds?.includes(currentUser.uid)) {
          authorizedUid = currentUser.uid;
        }

        // Step 2: Phone number match — look up user by phone number in Firestore
        if (!authorizedUid && currentUser.phoneNumber) {
          const usersQuery = query(
            collection(db, 'users'),
            where('phoneNumber', '==', currentUser.phoneNumber),
            limit(5)
          );
          const usersSnap = await getDocs(usersQuery);
          for (const userDoc of usersSnap.docs) {
            if (g.selectorUserIds?.includes(userDoc.id)) {
              authorizedUid = userDoc.id;
              break;
            }
          }
        }

        // Step 3: If still not found, store phone number on current user profile
        // so future matches work, and check if any selector has no phone set
        if (!authorizedUid) {
          // Save phone number to current user's Firestore profile for future use
          if (currentUser.phoneNumber) {
            try {
              const userDocRef = collection(db, 'users');
              const existingQuery = query(userDocRef, where('uid', '==', currentUser.uid), limit(1));
              const existingSnap = await getDocs(existingQuery);
              if (!existingSnap.empty) {
                const { doc: firestoreDoc, updateDoc } = await import('firebase/firestore');
                await updateDoc(firestoreDoc(db, 'users', currentUser.uid), {
                  phoneNumber: currentUser.phoneNumber
                });
              }
            } catch (e) {
              console.warn('Could not save phone number to profile:', e);
            }
          }
        }

        const authorized = !!authorizedUid;
        setIsAuthorized(authorized);
        setResolvedSelectorUid(authorizedUid || currentUser.uid);
        setAuthChecked(true);

        if (authorized) {
          // Load players
          const loaded: PlayerWithTeam[] = [];
          for (const pid of (g.team1Players || [])) {
            const p = await getPlayerByIdFromDB(pid);
            if (p) loaded.push({ ...p, teamName: g.team1 });
          }
          for (const pid of (g.team2Players || [])) {
            const p = await getPlayerByIdFromDB(pid);
            if (p) loaded.push({ ...p, teamName: g.team2 });
          }
          loaded.sort((a, b) => a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name));
          setPlayers(loaded);

          // Load existing ratings
          const existing = await getRatingsForGameFromDB(gameId);
          setExistingRatings(existing);

          // Pre-populate ratings from existing data
          const initialRatings: Record<string, PlayerRatings> = {};
          loaded.forEach(player => {
            const er = existing.find(r => r.playerId === player.id);
            const defaults = getDefaultRatings(player);
            initialRatings[player.id] = {
              batting: (er?.batting as RatingValue) || defaults.batting,
              bowling: (er?.bowling as RatingValue) || defaults.bowling,
              fielding: (er?.fielding as RatingValue) || defaults.fielding,
              wicketKeeping: (er?.wicketKeeping as RatingValue) || defaults.wicketKeeping,
            };
          });
          setRatings(initialRatings);
        }
      } catch (e) {
        console.error('Error loading game:', e);
      } finally {
        setIsLoadingGame(false);
      }
    };
    load();
  }, [currentUser, gameId]);

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setAuthInProgress(true);
    try {
      // Always prepend +1 for US numbers, strip any non-digits first
      const digits = phone.replace(/\D/g, '');
      const formatted = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
      const result = await signInWithPhoneNumberFlow(formatted, 'recaptcha-container-rate');
      setConfirmationResult(result);
      setIsCodeSent(true);
      toast({ title: 'Code sent!', description: `Verification code sent to +1 ${phone}` });
    } catch (err: any) {
      toast({ title: 'Failed to send code', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setAuthInProgress(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmationResult || !otp.trim()) return;
    setAuthInProgress(true);
    try {
      await confirmPhoneNumberCode(confirmationResult, otp);
    } catch (err: any) {
      toast({ title: 'Invalid code', description: 'Please check the code and try again.', variant: 'destructive' });
    } finally {
      setAuthInProgress(false);
    }
  };

  const handleRatingChange = (playerId: string, skill: SkillKey, value: RatingValue) => {
    setRatings(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [skill]: value },
    }));
  };

  const handleSaveAndNext = async () => {
    const player = players[currentPlayerIndex];
    if (!player || !currentUser) return;
    const uidToUse = resolvedSelectorUid || currentUser.uid;
    setIsSaving(true);
    try {
      const playerRating = ratings[player.id];
      await saveGameRatingsToDB(gameId, {
        [player.id]: {
          batting: playerRating.batting,
          bowling: playerRating.bowling,
          fielding: playerRating.fielding,
          wicketKeeping: playerRating.wicketKeeping,
        }
      }, uidToUse, false);
      setSavedPlayers(prev => new Set([...prev, player.id]));
      toast({ title: `${player.name} rated ✓`, description: 'Rating saved successfully.' });
      if (currentPlayerIndex < players.length - 1) {
        setCurrentPlayerIndex(prev => prev + 1);
      }
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading states ──────────────────────────────────────────────────────────

  if (isAuthLoading) {
    return <LoadingScreen message="Loading..." />;
  }

  // ── Auth screen ─────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-2">🏏</div>
            <h1 className="text-2xl font-bold text-primary">Cricket IQ</h1>
            <p className="text-muted-foreground mt-1">Player Rating</p>
          </div>

          <div className="bg-card border rounded-xl p-6 space-y-4 shadow-sm">
            {!isCodeSent ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="phone">Your US Phone Number</Label>
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center justify-center h-12 px-3 rounded-md border bg-muted text-sm font-medium text-muted-foreground shrink-0">
                      🇺🇸 +1
                    </div>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="714 829 0716"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="h-12 text-base"
                      disabled={authInProgress}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Enter your 10-digit US phone number</p>
                </div>
                <div id="recaptcha-container-rate" />
                <Button onClick={handleSendOtp} disabled={authInProgress || !phone.trim()} className="w-full h-12 text-base">
                  {authInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {authInProgress ? 'Sending...' : 'Send Verification Code'}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="otp">Verification Code</Label>
                  <Input
                    id="otp"
                    type="number"
                    placeholder="Enter 6-digit code"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    className="h-12 text-base text-center tracking-widest text-lg"
                    maxLength={6}
                    disabled={authInProgress}
                  />
                  <p className="text-xs text-muted-foreground">Code sent to +1 {phone}</p>
                </div>
                <Button onClick={handleVerifyOtp} disabled={authInProgress || otp.length < 6} className="w-full h-12 text-base">
                  {authInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  {authInProgress ? 'Verifying...' : 'Verify & Continue'}
                </Button>
                <button onClick={() => { setIsCodeSent(false); setOtp(''); }} className="w-full text-sm text-muted-foreground hover:text-foreground text-center">
                  ← Use a different number
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Loading game ────────────────────────────────────────────────────────────

  if (isLoadingGame || !authChecked) {
    return <LoadingScreen message="Loading game..." />;
  }

  if (!game) {
    return <ErrorScreen message="Game not found. Please check the link and try again." />;
  }

  // ── Not authorized ──────────────────────────────────────────────────────────

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Not Authorized</h2>
        <p className="text-muted-foreground max-w-xs">
          You are not assigned as a selector for this game. Please contact your series administrator.
        </p>
        <p className="text-xs text-muted-foreground mt-4">Logged in as: {currentUser.phoneNumber || currentUser.email}</p>
      </div>
    );
  }

  // ── All rated ───────────────────────────────────────────────────────────────

  if (players.length === 0) {
    return <ErrorScreen message="No players found for this game." />;
  }

  const allSaved = players.every(p => savedPlayers.has(p.id));
  if (allSaved) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-green-600 mb-2">All Done! 🎉</h2>
        <p className="text-muted-foreground max-w-xs">
          You've rated all {players.length} players for {game.team1} vs {game.team2}.
        </p>
        <p className="text-sm text-muted-foreground mt-2">You can now close this page.</p>
      </div>
    );
  }

  // ── Rating UI ───────────────────────────────────────────────────────────────

  const player = players[currentPlayerIndex];
  const playerRatings = ratings[player?.id] || getDefaultRatings(player);
  const isSaved = savedPlayers.has(player?.id);
  const isFinalized = game.ratingsFinalized;

  const skillLabels: Record<SkillKey, string> = {
    batting: 'Batting',
    bowling: 'Bowling',
    fielding: 'Fielding',
    wicketKeeping: 'Wicket Keeping',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-3 sticky top-0 z-10">
        <p className="text-xs opacity-80">{game.team1} vs {game.team2}</p>
        <p className="text-xs opacity-70">{game.venue}</p>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>Player {currentPlayerIndex + 1} of {players.length}</span>
          <span>{savedPlayers.size} rated</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${((currentPlayerIndex) / players.length) * 100}%` }}
          />
        </div>

        {/* Player dots */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {players.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setCurrentPlayerIndex(i)}
              className={cn(
                "w-6 h-6 rounded-full text-xs font-medium transition-colors",
                i === currentPlayerIndex ? "bg-primary text-primary-foreground" :
                savedPlayers.has(p.id) ? "bg-green-500 text-white" :
                "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Player card */}
      <div className="flex-1 px-4 pb-4 space-y-4">
        <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={player.avatarUrl || 'https://placehold.co/64x64.png'} alt={player.name} />
            <AvatarFallback className="text-lg">{player.name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{player.name}</h2>
            <Badge variant="outline" className="flex items-center gap-1 w-fit mt-1">
              <SkillIcon skill={player.primarySkill} />
              {player.primarySkill}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">{player.teamName}</p>
          </div>
          {isSaved && <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />}
        </div>

        {isFinalized && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-medium">
            ✓ Ratings for this game are finalized (read-only)
          </div>
        )}

        {/* Rating sections — all 4 skills */}
        {ALL_SKILLS.map(skill => (
          <div key={skill} className="bg-card border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <span className="text-muted-foreground uppercase tracking-wide">{skillLabels[skill]}</span>
              {isPrimarySkill(player, skill) && (
                <Badge variant="default" className="text-xs py-0 px-1.5">★ Primary</Badge>
              )}
              <span className="ml-auto text-sm font-bold text-primary">
                {playerRatings[skill] !== 'Not Rated' && playerRatings[skill] !== 'Not Applicable'
                  ? playerRatings[skill]
                  : <span className="text-muted-foreground font-normal text-xs">{playerRatings[skill]}</span>
                }
              </span>
            </h3>
            {/* Numeric ratings — 0.5 to 5.0 in a 5-column grid */}
            <div className="grid grid-cols-5 gap-1.5">
              {NUMERIC_RATINGS.map(val => (
                <button
                  key={val}
                  type="button"
                  disabled={isFinalized}
                  onClick={() => handleRatingChange(player.id, skill, val)}
                  className={cn(
                    "h-11 rounded-lg text-sm font-bold border-2 transition-all",
                    playerRatings[skill] === val
                      ? "bg-primary text-primary-foreground border-primary scale-105 shadow-sm"
                      : "bg-background border-border hover:border-primary hover:text-primary"
                  )}
                >
                  {val}
                </button>
              ))}
            </div>
            {/* Not Rated / Not Applicable */}
            <div className="grid grid-cols-2 gap-2">
              {SPECIAL_RATINGS.map(val => (
                <button
                  key={val}
                  type="button"
                  disabled={isFinalized}
                  onClick={() => handleRatingChange(player.id, skill, val)}
                  className={cn(
                    "h-9 rounded-lg text-xs font-medium border-2 transition-all",
                    playerRatings[skill] === val
                      ? "bg-muted text-foreground border-muted-foreground"
                      : "bg-background border-border hover:border-muted-foreground text-muted-foreground"
                  )}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Save & navigation */}
        {!isFinalized && (
          <Button
            onClick={handleSaveAndNext}
            disabled={isSaving}
            className="w-full h-14 text-base font-semibold"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : isSaved ? (
              <CheckCircle className="mr-2 h-5 w-5" />
            ) : null}
            {isSaving ? 'Saving...' : isSaved ? 'Update & Next' : 'Save & Next →'}
          </Button>
        )}

        {/* Prev / Next navigation */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setCurrentPlayerIndex(prev => Math.max(0, prev - 1))}
            disabled={currentPlayerIndex === 0}
            className="flex-1 h-12"
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentPlayerIndex(prev => Math.min(players.length - 1, prev + 1))}
            disabled={currentPlayerIndex === players.length - 1}
            className="flex-1 h-12"
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Logged in as {currentUser.phoneNumber || currentUser.email}
        </p>
      </div>
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <p className="text-2xl mb-3">🏏</p>
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export default function MobileRatePageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
      <MobileRatePage />
    </Suspense>
  );
}
