'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getGameByIdFromDB, getPlayerByIdFromDB, getRatingsForGameFromDB } from '@/lib/db';
import { saveMobileRatingAction, certifyMobileRatingAction } from '@/lib/actions/mobile-rating-action';
import type { Game, Player, PlayerRating, RatingValue } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight, CheckCircle, ShieldAlert, Send, ChevronDown, MessageSquare, Search, X, ShieldCheck } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ConfirmationResult } from 'firebase/auth';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CricketBatIcon, CricketBallIcon, WicketKeeperGloves } from '@/components/custom-icons';

const NUMERIC_RATINGS: RatingValue[] = ['0.5', '1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0'];
const SPECIAL_RATINGS: RatingValue[] = ['Not Rated', 'Not Applicable'];
const ALL_SKILLS: SkillKey[] = ['batting', 'bowling', 'fielding', 'wicketKeeping'];

type SkillKey = 'batting' | 'bowling' | 'fielding' | 'wicketKeeping';

interface PlayerWithTeam extends Player { teamName: string; }
interface PlayerRatings {
  batting: RatingValue; bowling: RatingValue;
  fielding: RatingValue; wicketKeeping: RatingValue;
}

function getDefaultRatings(player: Player): PlayerRatings {
  if (player.primarySkill === 'Batting') return { batting: 'Not Rated', bowling: 'Not Applicable', fielding: 'Not Rated', wicketKeeping: 'Not Applicable' };
  if (player.primarySkill === 'Bowling') return { batting: 'Not Rated', bowling: 'Not Rated', fielding: 'Not Rated', wicketKeeping: 'Not Applicable' };
  return { batting: 'Not Rated', bowling: 'Not Applicable', fielding: 'Not Applicable', wicketKeeping: 'Not Rated' };
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
  const searchParams = useSearchParams();
  const gameId = params.gameId;
  const selectorUidFromUrl = searchParams.get('uid');

  const { signInWithPhoneNumberFlow, confirmPhoneNumberCode, isAuthLoading, currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  // ── Auth state (only used when currentUser is null) ──────────────────────
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);

  // ── Game / data state ────────────────────────────────────────────────────
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<PlayerWithTeam[]>([]);
  const [existingRatings, setExistingRatings] = useState<PlayerRating[]>([]);
  const [isLoadingGame, setIsLoadingGame] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [resolvedSelectorUid, setResolvedSelectorUid] = useState<string | null>(null);

  // ── Rating state ─────────────────────────────────────────────────────────
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, PlayerRatings>>({});
  const [notes, setNotes] = useState<Record<string, Record<SkillKey, string>>>({});
  const [expandedSkills, setExpandedSkills] = useState<Record<string, Set<SkillKey>>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, Set<SkillKey>>>({});
  const [savedPlayers, setSavedPlayers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isCertifying, setIsCertifying] = useState(false);
  const [isCertified, setIsCertified] = useState(false);
  const [showCertifyConfirm, setShowCertifyConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // ── Swipe handling ───────────────────────────────────────────────────────
  const [swipeTouchStart, setSwipeTouchStart] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setSwipeTouchStart(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeTouchStart === null) return;
    const diff = swipeTouchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentPlayerIndex < players.length - 1) setCurrentPlayerIndex(prev => prev + 1);
      else if (diff < 0 && currentPlayerIndex > 0) setCurrentPlayerIndex(prev => prev - 1);
    }
    setSwipeTouchStart(null);
  };

  const toggleSkillExpanded = (playerId: string, skill: SkillKey) => {
    setExpandedSkills(prev => {
      let current: Set<SkillKey>;
      if (!prev[playerId]) {
        const playerRatingsNow = ratings[playerId] || {};
        current = new Set(ALL_SKILLS.filter(s => (playerRatingsNow as any)[s] !== 'Not Applicable'));
      } else {
        current = new Set(prev[playerId]);
      }
      if (current.has(skill)) current.delete(skill); else current.add(skill);
      return { ...prev, [playerId]: current };
    });
  };

  const toggleNoteExpanded = (playerId: string, skill: SkillKey) => {
    setExpandedNotes(prev => {
      const current = new Set(prev[playerId] || []);
      if (current.has(skill)) current.delete(skill); else current.add(skill);
      return { ...prev, [playerId]: current };
    });
  };

  const handleNoteChange = (playerId: string, skill: SkillKey, value: string) => {
    setNotes(prev => ({ ...prev, [playerId]: { ...(prev[playerId] || {}), [skill]: value } }));
  };

  // ── Authorization helper ─────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 CHANGE: Two auth paths now supported:
  //
  //  A) Web login (Google/email): currentUser.uid is set, phoneNumber is null.
  //     → Trust currentUser.uid directly. If ?uid= is present, accept if
  //       currentUser.uid === selectorUidFromUrl. No phone matching needed.
  //
  //  B) QR + phone OTP: currentUser.phoneNumber is set.
  //     → Original phone-matching logic (unchanged).
  //
  // Both paths then fall through to the same selectorUserIds check.
  // ─────────────────────────────────────────────────────────────────────────
  const isWebLogin = currentUser && !currentUser.phoneNumber;

  // ── Load game + authorize ────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !gameId || isLoadingGame) return;

    const load = async () => {
      setIsLoadingGame(true);
      try {
        const g = await getGameByIdFromDB(gameId);
        if (!g) { setIsLoadingGame(false); return; }
        setGame(g);

        let authorizedUid: string | null = null;

        if (selectorUidFromUrl) {
          if (isWebLogin) {
            // ── Path A: web login — trust uid directly ──────────────────
            if (currentUser.uid === selectorUidFromUrl && g.selectorUserIds?.includes(selectorUidFromUrl)) {
              authorizedUid = selectorUidFromUrl;
            } else if (currentUser.uid !== selectorUidFromUrl) {
              // Logged-in user is not the selector this link was for
              setAuthChecked(true);
              setIsAuthorized(false);
              setIsLoadingGame(false);
              return;
            }
          } else {
            // ── Path B: phone OTP — match phone to expected selector ────
            const expectedUserDoc = await getDocs(
              query(collection(db, 'users'), where('uid', '==', selectorUidFromUrl), limit(1))
            );
            if (!expectedUserDoc.empty) {
              const expectedProfile = expectedUserDoc.docs[0].data();
              const expectedPhone = expectedProfile.phoneNumber;
              if (currentUser.phoneNumber && expectedPhone && currentUser.phoneNumber === expectedPhone) {
                if (g.selectorUserIds?.includes(selectorUidFromUrl)) {
                  authorizedUid = selectorUidFromUrl;
                } else {
                  setAuthChecked(true); setIsAuthorized(false); setIsLoadingGame(false); return;
                }
              } else {
                setAuthChecked(true); setIsAuthorized(false); setIsLoadingGame(false); return;
              }
            }
          }
        }

        // Fallback: no ?uid= in URL — check by uid directly, then by phone
        if (!authorizedUid) {
          if (g.selectorUserIds?.includes(currentUser.uid)) {
            authorizedUid = currentUser.uid;
          } else if (currentUser.phoneNumber) {
            const usersSnap = await getDocs(
              query(collection(db, 'users'), where('phoneNumber', '==', currentUser.phoneNumber), limit(5))
            );
            for (const userDoc of usersSnap.docs) {
              if (g.selectorUserIds?.includes(userDoc.id)) { authorizedUid = userDoc.id; break; }
            }
          }
        }

        // Save phone to profile for future cross-linking (phone OTP path only)
        if (!authorizedUid && currentUser.phoneNumber) {
          try {
            const { doc: firestoreDoc, updateDoc } = await import('firebase/firestore');
            await updateDoc(firestoreDoc(db, 'users', currentUser.uid), { phoneNumber: currentUser.phoneNumber });
          } catch (e) { console.warn('Could not save phone number to profile:', e); }
        }

        const authorized = !!authorizedUid;
        setIsAuthorized(authorized);
        setResolvedSelectorUid(authorizedUid || currentUser.uid);
        setAuthChecked(true);

        if (authorized) {
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

          const existing = await getRatingsForGameFromDB(gameId);
          setExistingRatings(existing);

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
              const uid = authorizedUid || currentUser.uid;
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

          // Pre-populate savedPlayers from existing ratings so returning users can certify
          const alreadySaved = new Set(
            loaded.filter(p => {
              const er = existing.find(r => r.playerId === p.id);
              return er && NUMERIC_RATINGS.some(v =>
                er.batting === v || er.bowling === v || er.fielding === v || er.wicketKeeping === v
              );
            }).map(p => p.id)
          );
          setSavedPlayers(alreadySaved);

          const uidToCheck = authorizedUid || currentUser.uid;
          const cert = g.selectorCertifications?.[uidToCheck];
          const lastModified = g.ratingsLastModifiedAt ? new Date(g.ratingsLastModifiedAt) : null;
          const certifiedAt = cert?.certifiedAt ? new Date(cert.certifiedAt) : null;
          const isCurrent = certifiedAt && (!lastModified || certifiedAt >= lastModified);
          setIsCertified(!!(cert?.status === 'certified' && isCurrent));
        }
      } catch (e) {
        console.error('Error loading game:', e);
      } finally {
        setIsLoadingGame(false);
      }
    };

    load();
  }, [currentUser, gameId]);

  // ── OTP handlers (only used when currentUser is null) ────────────────────
  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setAuthInProgress(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const formatted = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
      const result = await signInWithPhoneNumberFlow(formatted, 'recaptcha-container-rate');
      setConfirmationResult(result);
      setIsCodeSent(true);
      toast({ title: 'Code sent!', description: `Verification code sent to +1 ${phone}` });
    } catch (err: any) {
      toast({ title: 'Failed to send code', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally { setAuthInProgress(false); }
  };

  const handleVerifyOtp = async () => {
    if (!confirmationResult || !otp.trim()) return;
    setAuthInProgress(true);
    try {
      await confirmPhoneNumberCode(confirmationResult, otp);
    } catch (err: any) {
      toast({ title: 'Invalid code', description: 'Please check the code and try again.', variant: 'destructive' });
    } finally { setAuthInProgress(false); }
  };

  const handleRatingChange = (playerId: string, skill: SkillKey, value: RatingValue) => {
    setRatings(prev => ({ ...prev, [playerId]: { ...prev[playerId], [skill]: value } }));
  };

  const handleCertify = async () => {
    if (!currentUser) return;
    const uidToUse = resolvedSelectorUid || currentUser.uid;
    setIsCertifying(true);
    setShowCertifyConfirm(false);
    try {
      const displayName = userProfile?.displayName || currentUser.email || currentUser.phoneNumber || 'Selector';
      const result = await certifyMobileRatingAction(gameId, uidToUse, displayName);
      if (!result.success) {
        toast({ title: 'Certification failed', description: result.error, variant: 'destructive' });
      } else {
        setIsCertified(true);
        toast({
          title: result.autoFinalized ? '✅ Ratings certified & finalized!' : '✅ Ratings certified!',
          description: result.autoFinalized
            ? 'All selectors have certified. Ratings are now finalized.'
            : 'Your ratings have been certified successfully.',
        });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Please try again.', variant: 'destructive' });
    } finally { setIsCertifying(false); }
  };

  const handleSaveAndNext = async () => {
    const player = players[currentPlayerIndex];
    if (!player || !currentUser) return;
    const uidToUse = resolvedSelectorUid || currentUser.uid;
    setIsSaving(true);
    try {
      const playerRating = ratings[player.id];
      const playerNotes = notes[player.id] || {};
      const result = await saveMobileRatingAction({
        gameId,
        playerId: player.id,
        rating: {
          batting: playerRating.batting, bowling: playerRating.bowling,
          fielding: playerRating.fielding, wicketKeeping: playerRating.wicketKeeping,
          battingComment: playerNotes.batting || '', bowlingComment: playerNotes.bowling || '',
          fieldingComment: playerNotes.fielding || '', wicketKeepingComment: playerNotes.wicketKeeping || '',
        },
        savingUid: uidToUse,
      });
      if (!result.success) {
        toast({ title: 'Save failed', description: result.error || 'Please try again.', variant: 'destructive' });
        return;
      }
      setSavedPlayers(prev => new Set([...prev, player.id]));
      toast({ title: `${player.name} rated ✓`, description: 'Rating saved successfully.' });
      if (currentPlayerIndex < players.length - 1) setCurrentPlayerIndex(prev => prev + 1);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message || 'Please try again.', variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  // ── Render guards ────────────────────────────────────────────────────────

  if (isAuthLoading) return <LoadingScreen message="Loading..." />;

  // ── Auth screen — only shown when NOT already logged in ──────────────────
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
                    <Input id="phone" type="tel" placeholder="310 555 1234" value={phone}
                      onChange={e => setPhone(e.target.value)} className="h-12 text-base" disabled={authInProgress} />
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
                  <Input id="otp" type="number" autoFocus placeholder="Enter 6-digit code" value={otp}
                    onChange={e => setOtp(e.target.value)}
                    className="h-12 text-base text-center tracking-widest text-lg"
                    maxLength={6} disabled={authInProgress} />
                  <p className="text-xs text-muted-foreground">Code sent to +1 {phone}</p>
                </div>
                <Button onClick={handleVerifyOtp} disabled={authInProgress || otp.length < 6} className="w-full h-12 text-base">
                  {authInProgress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  {authInProgress ? 'Verifying...' : 'Verify & Continue'}
                </Button>
                <div className="flex gap-3">
                  <button onClick={() => { setIsCodeSent(false); setOtp(''); }}
                    className="flex-1 text-sm text-muted-foreground hover:text-foreground text-center">
                    ← Different number
                  </button>
                  <button onClick={handleSendOtp} disabled={authInProgress}
                    className="flex-1 text-sm text-primary hover:underline text-center disabled:opacity-50">
                    Resend code
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingGame || !authChecked) return <LoadingScreen message="Loading game..." />;
  if (!game) return <ErrorScreen message="Game not found. Please check the link and try again." />;

  if (!isAuthorized) {
    // Web login: uid mismatch means wrong user is logged in
    // Phone login: phone mismatch means wrong person scanned
    const mismatchMsg = isWebLogin
      ? `You are logged in as ${currentUser.email}, but this link was generated for a different selector.`
      : `This QR code was generated for a different selector. The phone number you used (${currentUser.phoneNumber}) does not match.`;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground max-w-xs">
          {selectorUidFromUrl ? mismatchMsg : 'You are not assigned as a selector for this game. Please contact your series administrator.'}
        </p>
        <p className="text-xs text-muted-foreground mt-4">
          Logged in as: {currentUser.email || currentUser.phoneNumber}
        </p>
      </div>
    );
  }

  if (players.length === 0) return <ErrorScreen message="No players found for this game." />;

  const allSaved = players.every(p => savedPlayers.has(p.id));
  if (allSaved && !isCertified) {
    // Don't redirect to done screen — show certify prompt instead (bug fix from review)
  }

  const player = players[currentPlayerIndex];
  const playerRatings = ratings[player?.id] || getDefaultRatings(player);
  const isSaved = savedPlayers.has(player?.id);
  const isFinalized = game.ratingsFinalized;
  const isReadOnly = isFinalized || isCertified;

  const hasAnyNumericRating = (playerId: string) => {
    const pr = ratings[playerId];
    return savedPlayers.has(playerId) || (pr && NUMERIC_RATINGS.some(v =>
      pr.batting === v || pr.bowling === v || pr.fielding === v || pr.wicketKeeping === v
    ));
  };

  const ratedCount = players.filter(p => hasAnyNumericRating(p.id)).length;
  const skillLabels: Record<SkillKey, string> = {
    batting: 'Batting', bowling: 'Bowling', fielding: 'Fielding', wicketKeeping: 'Wicket Keeping',
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-2.5 sticky top-0 z-10">
        <p className="text-xs font-medium leading-snug truncate">
          {game.team1} vs {game.team2}
          {game.seriesName ? <span className="opacity-70"> · {game.seriesName}</span> : ''}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs opacity-75 leading-snug truncate">
            {game.date ? (() => { try { return new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } })() : ''}
            {game.venue ? <span> · {game.venue}</span> : ''}
          </p>
          {(game as any).externalScoreUrl && (
            <a href={(game as any).externalScoreUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs opacity-90 hover:opacity-100 underline whitespace-nowrap shrink-0 flex items-center gap-1">
              📋 Scorecard
            </a>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex justify-between text-sm text-muted-foreground mb-1">
          <span>Player {currentPlayerIndex + 1} of {players.length}</span>
          <span>{ratedCount} rated</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-primary rounded-full h-2 transition-all"
            style={{ width: `${((currentPlayerIndex + 1) / players.length) * 100}%` }} />
        </div>
        <div className="flex gap-1 mt-2 flex-wrap">
          {players.map((p, i) => (
            <button key={p.id} onClick={() => setCurrentPlayerIndex(i)}
              className={cn("w-6 h-6 rounded-full text-xs font-medium transition-colors",
                i === currentPlayerIndex ? "bg-primary text-primary-foreground" :
                hasAnyNumericRating(p.id) ? "bg-green-500 text-white" : "bg-muted text-muted-foreground")}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pb-4 space-y-4">
        {/* Search */}
        {showSearch ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus placeholder="Search player name..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} className="pl-9 pr-9 h-10" />
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
            {searchQuery && (
              <div className="absolute top-full left-0 right-0 bg-card border rounded-xl shadow-lg z-20 mt-1 max-h-48 overflow-y-auto">
                {players.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => (
                  <button key={p.id} onClick={() => { setCurrentPlayerIndex(players.indexOf(p)); setShowSearch(false); setSearchQuery(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left border-b last:border-0">
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

        {/* Player card */}
        <div className="bg-card border rounded-xl overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="flex items-center gap-2 p-3">
            <button onClick={() => setCurrentPlayerIndex(prev => Math.max(0, prev - 1))}
              disabled={currentPlayerIndex === 0}
              className="h-10 w-10 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-muted transition-colors">
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
              <button onClick={() => setCurrentPlayerIndex(prev => Math.min(players.length - 1, prev + 1))}
                disabled={currentPlayerIndex === players.length - 1}
                className="h-10 w-10 rounded-full border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors">
                <ChevronRight className="h-5 w-5" />
              </button>
              {isSaved && <CheckCircle className="h-5 w-5 text-green-500" />}
            </div>
          </div>
          <div className="flex items-center justify-between px-3 pb-2">
            <p className="text-xs text-muted-foreground">← swipe to navigate →</p>
            <button onClick={() => setShowSearch(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Search className="h-3.5 w-3.5" /> Find player
            </button>
          </div>
        </div>

        {isFinalized && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center text-green-700 text-sm font-medium">
            ✓ Ratings for this game are finalized (read-only)
          </div>
        )}
        {!isFinalized && isCertified && (
          <button className="w-full bg-blue-50 border border-blue-200 rounded-xl p-3 text-center text-blue-700 text-sm font-medium active:bg-blue-100 transition-colors"
            onClick={() => setIsCertified(false)}>
            🔒 You have certified your ratings — tap here to edit and re-certify
          </button>
        )}

        {/* Skill rating cards */}
        {ALL_SKILLS.map(skill => {
          const currentRating = playerRatings[skill];
          const isNA = currentRating === 'Not Applicable';
          const isSkillExpanded = expandedSkills[player.id]?.has(skill) ?? !isNA;
          const isNoteExpanded = expandedNotes[player.id]?.has(skill) ?? false;
          const noteValue = notes[player.id]?.[skill] || '';
          const isPrimary = isPrimarySkill(player, skill);

          return (
            <div key={skill} className={cn("bg-card border rounded-xl overflow-hidden transition-all", isNA && !isSkillExpanded ? "opacity-60" : "")}>
              <button type="button" className="w-full flex items-center gap-2 px-4 py-3 text-left"
                onClick={() => toggleSkillExpanded(player.id, skill)} disabled={isReadOnly}>
                <span className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex-1">
                  {skillLabels[skill]}
                  {isPrimary && <span className="ml-2 text-primary text-xs normal-case">★ Primary</span>}
                </span>
                <span className={cn("text-sm font-bold",
                  isNA ? "text-muted-foreground text-xs font-normal" :
                  currentRating === 'Not Rated' ? "text-muted-foreground text-xs font-normal" : "text-primary")}>
                  {currentRating}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform ml-1", isSkillExpanded && "rotate-180")} />
              </button>

              {isSkillExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t pt-3">
                  <div className="grid grid-cols-5 gap-1.5">
                    {NUMERIC_RATINGS.map(val => (
                      <button key={val} type="button" disabled={isReadOnly}
                        onClick={() => handleRatingChange(player.id, skill, val)}
                        className={cn("h-11 rounded-lg text-sm font-bold border-2 transition-all",
                          currentRating === val
                            ? "bg-primary text-primary-foreground border-primary scale-105 shadow-sm"
                            : "bg-background border-border hover:border-primary hover:text-primary")}>
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SPECIAL_RATINGS.map(val => (
                      <button key={val} type="button" disabled={isReadOnly}
                        onClick={() => {
                          handleRatingChange(player.id, skill, val);
                          if (val === 'Not Applicable') {
                            setExpandedSkills(prev => {
                              const current = new Set(prev[player.id] || []);
                              current.delete(skill);
                              return { ...prev, [player.id]: current };
                            });
                          }
                        }}
                        className={cn("h-9 rounded-lg text-xs font-medium border-2 transition-all",
                          currentRating === val
                            ? "bg-muted text-foreground border-muted-foreground"
                            : "bg-background border-border hover:border-muted-foreground text-muted-foreground")}>
                        {val}
                      </button>
                    ))}
                  </div>
                  <div>
                    <button type="button" onClick={() => toggleNoteExpanded(player.id, skill)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      disabled={isReadOnly}>
                      <MessageSquare className="h-3.5 w-3.5" />
                      {isNoteExpanded ? 'Hide note' : noteValue ? `Note: "${noteValue.slice(0, 30)}${noteValue.length > 30 ? '...' : ''}"` : 'Add note'}
                      <ChevronDown className={cn("h-3 w-3 transition-transform", isNoteExpanded && "rotate-180")} />
                    </button>
                    {isNoteExpanded && (
                      <Textarea placeholder={`Notes on ${skillLabels[skill].toLowerCase()}...`}
                        value={noteValue} onChange={e => handleNoteChange(player.id, skill, e.target.value)}
                        rows={2} className="mt-2 text-sm resize-none" disabled={isReadOnly} maxLength={200} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Save button */}
        {!isReadOnly && (
          <Button onClick={handleSaveAndNext} disabled={isSaving} className="w-full h-14 text-base font-semibold">
            {isSaving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : isSaved ? <CheckCircle className="mr-2 h-5 w-5" /> : null}
            {isSaving ? 'Saving...' : isSaved ? 'Update & Next' : 'Save & Next →'}
          </Button>
        )}

        {/* Certify section */}
        {!isFinalized && (
          <div className="border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2">
                  <ShieldCheck className={`h-5 w-5 ${isCertified ? 'text-green-600' : 'text-muted-foreground'}`} />
                  {isCertified ? 'Ratings Certified' : 'Certify My Ratings'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isCertified
                    ? 'To make changes, tap the banner above to re-enter edit mode, then re-certify.'
                    : `Rate all ${players.length} players, then certify to confirm your ratings are complete.`}
                </p>
              </div>
              {isCertified && <CheckCircle className="h-6 w-6 text-green-500 shrink-0" />}
            </div>
            {!isCertified && (
              <>
                <div className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                  ⚠️ Certifying confirms all ratings are final. Any rating change after certification will reset your certification status.
                </div>
                <Button onClick={() => setShowCertifyConfirm(true)}
                  disabled={isCertifying || savedPlayers.size === 0}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-12">
                  {isCertifying
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Certifying...</>
                    : <><ShieldCheck className="mr-2 h-4 w-4" /> Certify My Ratings ({ratedCount}/{players.length} rated)</>}
                </Button>
              </>
            )}
          </div>
        )}

        {/* Certify confirmation */}
        {showCertifyConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-card rounded-xl p-6 w-full max-w-sm space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-8 w-8 text-green-600 shrink-0" />
                <div>
                  <p className="font-bold text-base">Certify Ratings?</p>
                  <p className="text-sm text-muted-foreground">You have rated {savedPlayers.size} of {players.length} players.</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                This confirms your ratings are accurate and complete. If all selectors certify, ratings will be automatically finalized.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowCertifyConfirm(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleCertify}>Confirm & Certify</Button>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-4">
          Logged in as {currentUser.email || currentUser.phoneNumber}
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
