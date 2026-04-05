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
import { Loader2, Phone, ChevronLeft, ChevronRight, CheckCircle, ShieldAlert, Send, ChevronDown, MessageSquare, Search, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
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
  const [notes, setNotes] = useState<Record<string, Record<SkillKey, string>>>({});
  const [expandedSkills, setExpandedSkills] = useState<Record<string, Set<SkillKey>>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, Set<SkillKey>>>({});
  const [savedPlayers, setSavedPlayers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Swipe handling
  const [swipeTouchStart, setSwipeTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setSwipeTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeTouchStart === null) return;
    const diff = swipeTouchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentPlayerIndex < players.length - 1) {
        setCurrentPlayerIndex(prev => prev + 1);
      } else if (diff < 0 && currentPlayerIndex > 0) {
        setCurrentPlayerIndex(prev => prev - 1);
      }
    }
    setSwipeTouchStart(null);
  };

  const toggleSkillExpanded = (playerId: string, skill: SkillKey) => {
    setExpandedSkills(prev => {
      // On first toggle for this player, initialize with all non-NA skills expanded
      let current: Set<SkillKey>;
      if (!prev[playerId]) {
        const playerRatingsNow = ratings[playerId] || {};
        current = new Set(
          ALL_SKILLS.filter(s => (playerRatingsNow as any)[s] !== 'Not Applicable')
        );
      } else {
        current = new Set(prev[playerId]);
      }
      if (current.has(skill)) current.delete(skill);
      else current.add(skill);
      return { ...prev, [playerId]: current };
    });
  };

  const toggleNoteExpanded = (playerId: string, skill: SkillKey) => {
    setExpandedNotes(prev => {
      const current = new Set(prev[playerId] || []);
      if (current.has(skill)) current.delete(skill);
      else current.add(skill);
      return { ...prev, [playerId]: current };
    });
  };

  const handleNoteChange = (playerId: string, skill: SkillKey, value: string) => {
    setNotes(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [skill]: value },
    }));
  };

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
          const initialNotes: Record<string, Record<SkillKey, string>> = {};
          loaded.forEach(player => {
            const er = existing.find(r => r.playerId === player.id);
            const defaults = getDefaultRatings(player);
            initialRatings[player.id] = {
              batting: (er?.batting as RatingValue) || defaults.batting,
              bowling: (er?.bowling as RatingValue) || defaults.bowling,
              fielding: (er?.fielding as RatingValue) || defaults.fielding,
              wicketKeeping: (er?.wicketKeeping as RatingValue) || defaults.wicketKeeping,
            };
            if (er) {
              const uid = currentUser.uid;
              initialNotes[player.id] = {
                batting: (er.battingComments as any)?.[uid] || '',
                bowling: (er.bowlingComments as any)?.[uid] || '',
                fielding: (er.fieldingComments as any)?.[uid] || '',
                wicketKeeping: (er.wicketKeepingComments as any)?.[uid] || '',
              };
            }
          });
          setRatings(initialRatings);
          setNotes(initialNotes);
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
      const playerNotes = notes[player.id] || {};
      await saveGameRatingsToDB(gameId, {
        [player.id]: {
          batting: playerRating.batting,
          bowling: playerRating.bowling,
          fielding: playerRating.fielding,
          wicketKeeping: playerRating.wicketKeeping,
          battingComment: playerNotes.batting || '',
          bowlingComment: playerNotes.bowling || '',
          fieldingComment: playerNotes.fielding || '',
          wicketKeepingComment: playerNotes.wicketKeeping || '',
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

      {/* Header — two lines fitting all key details */}
      <div className="bg-primary text-primary-foreground px-4 py-2.5 sticky top-0 z-10">
        <p className="text-xs font-medium leading-snug truncate">
          {game.team1} vs {game.team2}
          {game.seriesName ? <span className="opacity-70"> · {game.seriesName}</span> : ''}
        </p>
        <p className="text-xs opacity-75 leading-snug truncate">
          {game.date ? (() => { try { return new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } })() : ''}
          {game.venue ? <span> · {game.venue}</span> : ''}
        </p>
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

      {/* Player card with swipe + nav arrows */}
      <div className="flex-1 px-4 pb-4 space-y-4">

        {/* Search bar */}
        {showSearch ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search player name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-10"
            />
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            {searchQuery && (
              <div className="absolute top-full left-0 right-0 bg-card border rounded-xl shadow-lg z-20 mt-1 max-h-48 overflow-y-auto">
                {players
                  .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setCurrentPlayerIndex(players.indexOf(p));
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left border-b last:border-0"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={p.avatarUrl || 'https://placehold.co/32x32.png'} alt={p.name} />
                        <AvatarFallback className="text-xs">{p.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.teamName} · {p.primarySkill}</p>
                      </div>
                      {savedPlayers.has(p.id) && <CheckCircle className="h-4 w-4 text-green-500 ml-auto shrink-0" />}
                    </button>
                  ))}
                {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No players found</p>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Player card with swipe gestures and nav arrows */}
        <div
          className="bg-card border rounded-xl overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Nav arrows + player info row */}
          <div className="flex items-center gap-2 p-3">
            <button
              onClick={() => setCurrentPlayerIndex(prev => Math.max(0, prev - 1))}
              disabled={currentPlayerIndex === 0}
              className="h-10 w-10 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar className="h-14 w-14 shrink-0">
                <AvatarImage src={player.avatarUrl || 'https://placehold.co/56x56.png'} alt={player.name} />
                <AvatarFallback className="text-base">{player.name.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="text-lg font-bold truncate">{player.name}</h2>
                <Badge variant="outline" className="flex items-center gap-1 w-fit mt-0.5 text-xs">
                  <SkillIcon skill={player.primarySkill} />
                  {player.primarySkill}
                </Badge>
                <p className="text-xs text-muted-foreground mt-0.5">{player.teamName}</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1 shrink-0">
              <button
                onClick={() => setCurrentPlayerIndex(prev => Math.min(players.length - 1, prev + 1))}
                disabled={currentPlayerIndex === players.length - 1}
                className="h-10 w-10 rounded-full border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              {isSaved && <CheckCircle className="h-5 w-5 text-green-500" />}
            </div>
          </div>

          {/* Swipe hint + search button */}
          <div className="flex items-center justify-between px-3 pb-2">
            <p className="text-xs text-muted-foreground">← swipe to navigate →</p>
            <button
              onClick={() => setShowSearch(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Search className="h-3.5 w-3.5" /> Find player
            </button>
          </div>
        </div>

        {isFinalized && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-medium">
            ✓ Ratings for this game are finalized (read-only)
          </div>
        )}

        {/* Rating sections — all 4 skills */}
        {ALL_SKILLS.map(skill => {
          const currentRating = playerRatings[skill];
          const isNA = currentRating === 'Not Applicable';
          // NA skills start collapsed, all others start expanded
          // expandedSkills overrides the default when user has toggled
          const hasBeenToggled = player.id in expandedSkills && expandedSkills[player.id] !== undefined;
          const isSkillExpanded = expandedSkills[player.id]?.has(skill) ?? !isNA;
          const isNoteExpanded = expandedNotes[player.id]?.has(skill) ?? false;
          const noteValue = notes[player.id]?.[skill] || '';
          const isPrimary = isPrimarySkill(player, skill);

          return (
            <div key={skill} className={cn(
              "bg-card border rounded-xl overflow-hidden transition-all",
              isNA && !isSkillExpanded ? "opacity-60" : ""
            )}>
              {/* Skill header — always visible, tap to expand/collapse */}
              <button
                type="button"
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
                onClick={() => toggleSkillExpanded(player.id, skill)}
                disabled={isFinalized}
              >
                <span className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex-1">
                  {skillLabels[skill]}
                  {isPrimary && <span className="ml-2 text-primary text-xs normal-case">★ Primary</span>}
                </span>
                <span className={cn(
                  "text-sm font-bold",
                  isNA ? "text-muted-foreground text-xs font-normal" :
                  currentRating === 'Not Rated' ? "text-muted-foreground text-xs font-normal" :
                  "text-primary"
                )}>
                  {currentRating}
                </span>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform ml-1",
                  isSkillExpanded && "rotate-180"
                )} />
              </button>

              {/* Rating content — shown when not NA or when expanded */}
              {isSkillExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t pt-3">
                  {/* Numeric ratings 0.5–5.0 */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {NUMERIC_RATINGS.map(val => (
                      <button
                        key={val}
                        type="button"
                        disabled={isFinalized}
                        onClick={() => handleRatingChange(player.id, skill, val)}
                        className={cn(
                          "h-11 rounded-lg text-sm font-bold border-2 transition-all",
                          currentRating === val
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
                        onClick={() => {
                          handleRatingChange(player.id, skill, val);
                          if (val === 'Not Applicable') {
                            // collapse when set to NA
                            setExpandedSkills(prev => {
                              const current = new Set(prev[player.id] || []);
                              current.delete(skill);
                              return { ...prev, [player.id]: current };
                            });
                          }
                        }}
                        className={cn(
                          "h-9 rounded-lg text-xs font-medium border-2 transition-all",
                          currentRating === val
                            ? "bg-muted text-foreground border-muted-foreground"
                            : "bg-background border-border hover:border-muted-foreground text-muted-foreground"
                        )}
                      >
                        {val}
                      </button>
                    ))}
                  </div>

                  {/* Notes — always available when skill is not NA */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleNoteExpanded(player.id, skill)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      disabled={isFinalized}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {isNoteExpanded ? 'Hide note' : noteValue ? `Note: "${noteValue.slice(0, 30)}${noteValue.length > 30 ? '...' : ''}"` : 'Add note'}
                      <ChevronDown className={cn("h-3 w-3 transition-transform", isNoteExpanded && "rotate-180")} />
                    </button>

                    {isNoteExpanded && (
                      <Textarea
                        placeholder={`Notes on ${skillLabels[skill].toLowerCase()}...`}
                        value={noteValue}
                        onChange={e => handleNoteChange(player.id, skill, e.target.value)}
                        rows={2}
                        className="mt-2 text-sm resize-none"
                        disabled={isFinalized}
                        maxLength={200}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

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
