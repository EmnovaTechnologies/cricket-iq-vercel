'use client';

/**
 * FILE: src/app/match-report/[scorecardId]/page.tsx
 *
 * Mobile Match Report page — reached via QR code from the scorecard page.
 * URL format: /match-report/{scorecardId}?uid={selectorUid}
 *
 * Flow:
 *   1. User scans QR → lands here unauthenticated
 *   2. Phone OTP auth (Firebase)
 *   3. Authorization: phone must match the ?uid= selector's profile
 *      AND that uid must be in the linked game's selectorUserIds
 *   4. If authorized → show match report form
 *   5. On submit → submitMatchReportAction (same action as desktop)
 */

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getScorecardByIdAction } from '@/lib/actions/scorecard-actions';
import { submitMatchReportAction, getUserReportForGameAction, selectorCertifyMatchReportAction, selectorUncertifyMatchReportAction } from '@/lib/actions/match-report-actions';
import type { MatchScorecard, MatchReport } from '@/types';
import type { ConfirmationResult } from 'firebase/auth';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2, Send, CheckCircle, ShieldAlert, Trophy,
  Star, AlertTriangle, Heart, CheckCircle2, ShieldCheck, FileText, Lock, LockOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MentionTextarea, MentionText } from '@/components/ui/mention-textarea';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPlayersByTeam(scorecard: MatchScorecard): Record<string, string[]> {
  const byTeam: Record<string, Set<string>> = {};
  for (const inn of scorecard.innings) {
    const team = inn.battingTeam;
    if (!byTeam[team]) byTeam[team] = new Set();
    inn.batting.forEach(b => byTeam[team].add(b.name));
    inn.didNotBat?.forEach(n => byTeam[team].add(n));
    const bowlingTeam = team === scorecard.team1 ? scorecard.team2 : scorecard.team1;
    if (!byTeam[bowlingTeam]) byTeam[bowlingTeam] = new Set();
    inn.bowling.forEach(b => byTeam[bowlingTeam].add(b.name));
  }
  return Object.fromEntries(
    Object.entries(byTeam).map(([t, s]) => [t, Array.from(s).sort()])
  );
}

// ─── Loading / Error screens ──────────────────────────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

function MobileMatchReportPage() {
  const params = useParams<{ scorecardId: string }>();
  const searchParams = useSearchParams();
  const scorecardId = params.scorecardId;
  const selectorUidFromUrl = searchParams.get('uid');

  const { signInWithPhoneNumberFlow, confirmPhoneNumberCode, isAuthLoading, currentUser, userProfile } = useAuth();
  const { toast } = useToast();

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [authInProgress, setAuthInProgress] = useState(false);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [scorecard, setScorecard] = useState<MatchScorecard | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [resolvedSelectorUid, setResolvedSelectorUid] = useState<string | null>(null);
  const [myReport, setMyReport] = useState<MatchReport | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [selectedOpposingTeam, setSelectedOpposingTeam] = useState('');
  const [top3, setTop3] = useState<string[]>(['', '', '']);
  const [highlights, setHighlights] = useState('');
  const [missedCatches, setMissedCatches] = useState('');
  const [missedRunOuts, setMissedRunOuts] = useState('');
  const [greatCatchesRunOuts, setGreatCatchesRunOuts] = useState('');
  const [sportsmanship, setSportsmanship] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSelectorCertifying, setIsSelectorCertifying] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Load scorecard + authorize after phone sign-in ──────────────────────────
  useEffect(() => {
    if (!currentUser || !scorecardId || isLoadingData) return;

    const load = async () => {
      setIsLoadingData(true);
      try {
        // 1. Fetch scorecard
        const result = await getScorecardByIdAction(scorecardId);
        if (!result.success || !result.scorecard) {
          setAuthChecked(true);
          setIsLoadingData(false);
          return;
        }
        const sc = result.scorecard;
        setScorecard(sc);

        // 2. Authorization — same pattern as /rate/[gameId]
        //    We need the linked game's selectorUserIds.
        //    If there's no linkedGameId, we can't verify selector assignment.
        const linkedGameId = sc.linkedGameId;
        let authorizedUid: string | null = null;

        const isWebLogin = !currentUser.phoneNumber;

        if (selectorUidFromUrl) {
          if (isWebLogin) {
            // Path A: web login (Google/email) — trust currentUser.uid directly
            if (currentUser.uid === selectorUidFromUrl) {
              if (linkedGameId) {
                const { getGameByIdFromDB } = await import('@/lib/db');
                const game = await getGameByIdFromDB(linkedGameId);
                if (game?.selectorUserIds?.includes(selectorUidFromUrl)) {
                  authorizedUid = selectorUidFromUrl;
                }
              } else {
                // No linked game — check roles on profile
                const profileSnap = await getDocs(
                  query(collection(db, 'users'), where('uid', '==', currentUser.uid), limit(1))
                );
                if (!profileSnap.empty) {
                  const profile = profileSnap.docs[0].data();
                  if (profile.roles?.includes('selector') || profile.roles?.includes('Series Admin') ||
                      profile.roles?.includes('Organization Admin') || profile.roles?.includes('admin')) {
                    authorizedUid = selectorUidFromUrl;
                  }
                }
              }
            } else {
              // Wrong user logged in — reject immediately
              setAuthChecked(true);
              setIsAuthorized(false);
              setIsLoadingData(false);
              return;
            }
          } else {
            // Path B: phone OTP — match phone to expected selector profile
            const expectedUserSnap = await getDocs(
              query(collection(db, 'users'), where('uid', '==', selectorUidFromUrl), limit(1))
            );
            if (!expectedUserSnap.empty) {
              const expectedProfile = expectedUserSnap.docs[0].data();
              const expectedPhone = expectedProfile.phoneNumber;
              if (currentUser.phoneNumber && expectedPhone && currentUser.phoneNumber === expectedPhone) {
                if (linkedGameId) {
                  const { getGameByIdFromDB } = await import('@/lib/db');
                  const game = await getGameByIdFromDB(linkedGameId);
                  if (game?.selectorUserIds?.includes(selectorUidFromUrl)) {
                    authorizedUid = selectorUidFromUrl;
                  }
                } else {
                  if (expectedProfile.roles?.includes('selector') || expectedProfile.roles?.includes('Series Admin') ||
                      expectedProfile.roles?.includes('Organization Admin') || expectedProfile.roles?.includes('admin')) {
                    authorizedUid = selectorUidFromUrl;
                  }
                }
              }
            }
          }
        }

        // Fallback: no uid in URL — check directly
        if (!authorizedUid) {
          if (linkedGameId) {
            const { getGameByIdFromDB } = await import('@/lib/db');
            const game = await getGameByIdFromDB(linkedGameId);
            if (game?.selectorUserIds?.includes(currentUser.uid)) {
              authorizedUid = currentUser.uid;
            } else if (currentUser.phoneNumber) {
              // Phone lookup fallback
              const usersSnap = await getDocs(
                query(collection(db, 'users'), where('phoneNumber', '==', currentUser.phoneNumber), limit(5))
              );
              for (const doc of usersSnap.docs) {
                if (game?.selectorUserIds?.includes(doc.id)) {
                  authorizedUid = doc.id;
                  break;
                }
              }
            }
          } else {
            // No linked game — check user profile roles
            const profileSnap = await getDocs(
              query(collection(db, 'users'), where('uid', '==', currentUser.uid), limit(1))
            );
            if (!profileSnap.empty) {
              const profile = profileSnap.docs[0].data();
              if (
                profile.roles?.includes('selector') ||
                profile.roles?.includes('Series Admin') ||
                profile.roles?.includes('Organization Admin') ||
                profile.roles?.includes('admin')
              ) {
                authorizedUid = currentUser.uid;
              }
            }
          }
        }

        const authorized = !!authorizedUid;
        setIsAuthorized(authorized);
        setResolvedSelectorUid(authorizedUid || currentUser.uid);
        setAuthChecked(true);

        if (authorized) {
          // Default opposing team
          setSelectedOpposingTeam(sc.team2);

          // Check if already submitted
          const gameIdToCheck = linkedGameId || scorecardId;
          const uidToCheck = authorizedUid!;
          const existingReport = await getUserReportForGameAction(gameIdToCheck, uidToCheck);
          if (existingReport) {
            setMyReport(existingReport);
            setSubmitted(true);
          }
        }
      } catch (e) {
        console.error('Error loading scorecard:', e);
      } finally {
        setIsLoadingData(false);
      }
    };

    load();
  }, [currentUser, scorecardId]);

  // ── OTP handlers ────────────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setAuthInProgress(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const formatted = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
      const result = await signInWithPhoneNumberFlow(formatted, 'recaptcha-container-report');
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

  // ── Submit handler ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!currentUser || !scorecard) return;

    const filledTop3 = top3.filter(p => p.trim());
    if (filledTop3.length === 0) {
      toast({ title: 'Select at least 1 top performer', variant: 'destructive' });
      return;
    }
    if (!highlights.trim()) {
      toast({ title: 'Please add game highlights', variant: 'destructive' });
      return;
    }
    if (!selectedOpposingTeam) {
      toast({ title: 'Select the opposing team', variant: 'destructive' });
      return;
    }

    const uidToUse = resolvedSelectorUid || currentUser.uid;
    const reportingTeam = selectedOpposingTeam === scorecard.team1 ? scorecard.team2 : scorecard.team1;
    const gameIdToUse = scorecard.linkedGameId || scorecardId;

    setIsSubmitting(true);
    try {
      const res = await submitMatchReportAction({
        gameId: gameIdToUse,
        scorecardId,
        organizationId: scorecard.organizationId,
        seriesId: scorecard.seriesId,
        reportingTeam,
        opposingTeam: selectedOpposingTeam,
        submittedBy: uidToUse,
        submittedByName: userProfile?.displayName || currentUser.phoneNumber || 'Selector',
        top3Players: filledTop3,
        highlights: highlights.trim(),
        missedCatches: missedCatches.trim(),
        missedRunOuts: missedRunOuts.trim(),
        greatCatchesRunOuts: greatCatchesRunOuts.trim(),
        sportsmanship: sportsmanship.trim(),
      });

      if (res.success) {
        toast({ title: '✅ Report submitted!', description: 'Your match report has been submitted.' });
        // Reload the report so the submitted view shows full details
        const saved = await getUserReportForGameAction(gameIdToUse, uidToUse);
        if (saved) setMyReport(saved);
        setSubmitted(true);
      } else {
        toast({ title: 'Submission failed', description: res.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render guards ────────────────────────────────────────────────────────────

  if (isAuthLoading) return <LoadingScreen message="Loading..." />;

  // Auth screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-2">🏏</div>
            <h1 className="text-2xl font-bold text-primary">Cricket IQ</h1>
            <p className="text-muted-foreground mt-1">Match Report</p>
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
                      placeholder="310 555 1234"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                      className="h-12 text-base"
                      disabled={authInProgress}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Enter your 10-digit US phone number</p>
                </div>
                <div id="recaptcha-container-report" />
                <Button
                  onClick={handleSendOtp}
                  disabled={authInProgress || !phone.trim()}
                  className="w-full h-12 text-base"
                >
                  {authInProgress
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Send className="mr-2 h-4 w-4" />}
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
                    autoFocus
                    placeholder="Enter 6-digit code"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && otp.length >= 6 && handleVerifyOtp()}
                    className="h-12 text-base text-center tracking-widest text-lg"
                    maxLength={6}
                    disabled={authInProgress}
                  />
                  <p className="text-xs text-muted-foreground">Code sent to +1 {phone}</p>
                </div>
                <Button
                  onClick={handleVerifyOtp}
                  disabled={authInProgress || otp.length < 6}
                  className="w-full h-12 text-base"
                >
                  {authInProgress
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <CheckCircle className="mr-2 h-4 w-4" />}
                  {authInProgress ? 'Verifying...' : 'Verify & Continue'}
                </Button>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setIsCodeSent(false); setOtp(''); }}
                    className="flex-1 text-sm text-muted-foreground hover:text-foreground text-center"
                  >
                    ← Different number
                  </button>
                  <button
                    onClick={handleSendOtp}
                    disabled={authInProgress}
                    className="flex-1 text-sm text-primary hover:underline text-center disabled:opacity-50"
                  >
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

  if (isLoadingData || !authChecked) return <LoadingScreen message="Loading match data..." />;
  if (!scorecard) return <ErrorScreen message="Scorecard not found. Please check the link and try again." />;

  // Not authorized
  if (!isAuthorized) {
    const isWebLogin = !currentUser?.phoneNumber;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Access Denied</h2>
        {selectorUidFromUrl && isWebLogin ? (
          <p className="text-muted-foreground max-w-xs">
            You are logged in as <span className="font-medium">{currentUser.email}</span>, but this link was generated for a different selector.
          </p>
        ) : selectorUidFromUrl && !isWebLogin ? (
          <p className="text-muted-foreground max-w-xs">
            This QR code was generated for a different selector. The phone number you used (
            <span className="font-medium">{currentUser.phoneNumber}</span>) does not match.
          </p>
        ) : (
          <p className="text-muted-foreground max-w-xs">
            You are not assigned as a selector for this game. Please contact your series administrator.
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-4">
          Logged in as: {currentUser?.phoneNumber || currentUser?.email}
        </p>
      </div>
    );
  }

  // Already submitted — show report details
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-primary text-primary-foreground px-4 py-2.5 sticky top-0 z-10">
          <p className="text-xs font-medium leading-snug truncate">
            {scorecard.team1} vs {scorecard.team2}
            {scorecard.cricClubsLeague ? <span className="opacity-70"> · {scorecard.cricClubsLeague}</span> : ''}
          </p>
          <p className="text-xs opacity-75 leading-snug truncate">
            {scorecard.date ? (() => { try { return new Date(scorecard.date.replace(/-/g, '/')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } })() : ''}
            {scorecard.venue ? <span> · {scorecard.venue}</span> : ''}
          </p>
        </div>

        <div className="flex-1 px-4 py-5 space-y-4">
          {/* Submitted banner */}
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              You submitted a report on{' '}
              <span className="font-semibold">{myReport?.opposingTeam}</span>
              {myReport?.submittedAt ? (() => { try { return ` on ${new Date(myReport.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`; } catch { return ''; } })() : ''}
            </span>
            {myReport?.isCertified && (
              <span className="ml-auto shrink-0 flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                <ShieldCheck className="h-3 w-3" /> Certified
              </span>
            )}
          </div>

          {/* Selector lock / unlock */}
          {myReport && !myReport.isCertified && (
            myReport.isSelectorCertified ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="text-xs text-blue-700 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Report locked — awaiting admin review.
                </span>
                <button
                  disabled={isSelectorCertifying}
                  className="text-xs text-blue-600 font-medium flex items-center gap-1 disabled:opacity-50"
                  onClick={async () => {
                    setIsSelectorCertifying(true);
                    const res = await selectorUncertifyMatchReportAction(myReport.id, resolvedSelectorUid || currentUser!.uid);
                    if (res.success) {
                      const updated = await getUserReportForGameAction(scorecard!.linkedGameId || scorecardId, resolvedSelectorUid || currentUser!.uid);
                      if (updated) setMyReport(updated);
                      toast({ title: 'Report unlocked' });
                    } else {
                      toast({ title: 'Could not unlock', description: res.error, variant: 'destructive' });
                    }
                    setIsSelectorCertifying(false);
                  }}
                >
                  {isSelectorCertifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockOpen className="h-3.5 w-3.5 mr-0.5" />}
                  Unlock
                </button>
              </div>
            ) : (
              <Button
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                disabled={isSelectorCertifying}
                onClick={async () => {
                  setIsSelectorCertifying(true);
                  const res = await selectorCertifyMatchReportAction(myReport.id, resolvedSelectorUid || currentUser!.uid);
                  if (res.success) {
                    const updated = await getUserReportForGameAction(scorecard!.linkedGameId || scorecardId, resolvedSelectorUid || currentUser!.uid);
                    if (updated) setMyReport(updated);
                    toast({ title: '🔒 Report locked', description: 'Ready for admin review.' });
                  } else {
                    toast({ title: 'Could not lock', description: res.error, variant: 'destructive' });
                  }
                  setIsSelectorCertifying(false);
                }}
              >
                {isSelectorCertifying
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Lock className="mr-2 h-4 w-4" />}
                Lock My Report
              </Button>
            )
          )}

          {/* Report detail card */}
          {myReport && (
            <div className="bg-card border rounded-xl p-4 space-y-4">
              <p className="font-semibold text-sm">
                Report on <span className="text-primary">{myReport.opposingTeam}</span>
              </p>

              {/* Top 3 */}
              {myReport.top3Players?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Top Performers
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {myReport.top3Players.map((p, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground border">
                        {i + 1}. {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Highlights */}
              {myReport.highlights && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Star className="h-3.5 w-3.5 text-primary" /> Highlights
                  </p>
                  <MentionText text={myReport.highlights} knownPlayers={allPlayers} className="text-sm" />
                </div>
              )}

              {/* Missed catches */}
              {myReport.missedCatches && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Missed Catches
                  </p>
                  <MentionText text={myReport.missedCatches} knownPlayers={allPlayers} className="text-sm" />
                </div>
              )}

              {/* Missed run-outs */}
              {myReport.missedRunOuts && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Missed Run-Outs
                  </p>
                  <MentionText text={myReport.missedRunOuts} knownPlayers={allPlayers} className="text-sm" />
                </div>
              )}

              {/* Great catches */}
              {myReport.greatCatchesRunOuts && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Great Catches / Run-Outs
                  </p>
                  <MentionText text={myReport.greatCatchesRunOuts} knownPlayers={allPlayers} className="text-sm" />
                </div>
              )}

              {/* Sportsmanship */}
              {myReport.sportsmanship && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                    <Heart className="h-3.5 w-3.5 text-rose-500" /> Sportsmanship
                  </p>
                  <MentionText text={myReport.sportsmanship} knownPlayers={allPlayers} className="text-sm" />
                </div>
              )}

              {/* Certified by */}
              {myReport.isCertified && myReport.certifiedByName && (
                <p className="text-xs text-green-600 flex items-center gap-1.5 pt-1 border-t">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Certified by {myReport.certifiedByName}
                  {myReport.certifiedAt ? (() => { try { return ` on ${new Date(myReport.certifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`; } catch { return ''; } })() : ''}
                </p>
              )}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground pb-4">
            Logged in as {currentUser.phoneNumber || currentUser.email}
          </p>
        </div>
      </div>
    );
  }

  // ── Match report form ────────────────────────────────────────────────────────
  const playersByTeam = buildPlayersByTeam(scorecard);
  const opposingPlayers = playersByTeam[selectedOpposingTeam] || [];
  const allPlayers = Object.values(playersByTeam).flat();

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-2.5 sticky top-0 z-10">
        <p className="text-xs font-medium leading-snug truncate">
          {scorecard.team1} vs {scorecard.team2}
          {scorecard.cricClubsLeague
            ? <span className="opacity-70"> · {scorecard.cricClubsLeague}</span>
            : ''}
        </p>
        <p className="text-xs opacity-75 leading-snug truncate">
          {scorecard.date
            ? (() => {
                try {
                  return new Date(scorecard.date.replace(/-/g, '/')).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  });
                } catch { return ''; }
              })()
            : ''}
          {scorecard.venue ? <span> · {scorecard.venue}</span> : ''}
        </p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5">

        {/* Form title */}
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h1 className="text-base font-bold">Submit Match Report</h1>
            <p className="text-xs text-muted-foreground">One submission per selector per game.</p>
          </div>
        </div>

        {/* Opposing team selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">You are reporting on</Label>
          <div className="flex gap-2">
            {[scorecard.team1, scorecard.team2].map(t => (
              <button
                key={t}
                onClick={() => {
                  setSelectedOpposingTeam(t);
                  setTop3(['', '', '']);
                }}
                className={cn(
                  'flex-1 py-3 px-3 rounded-xl border text-sm font-medium transition-colors',
                  selectedOpposingTeam === t
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-muted-foreground/30 hover:border-primary bg-card'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Top 3 performers */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <Label className="flex items-center gap-1.5 font-semibold">
            <Trophy className="h-4 w-4 text-yellow-500" /> Top 3 Performers
          </Label>
          <p className="text-xs text-muted-foreground -mt-1">Select from the opposing team's players</p>
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5 shrink-0 font-bold">{i + 1}.</span>
              <select
                className="flex-1 h-11 rounded-lg border border-input bg-background px-3 text-sm"
                value={top3[i]}
                onChange={e => {
                  const updated = [...top3];
                  updated[i] = e.target.value;
                  setTop3(updated);
                }}
              >
                <option value="">— Select player —</option>
                {opposingPlayers.map(p => (
                  <option key={p} value={p} disabled={top3.includes(p) && top3[i] !== p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Highlights — required */}
        <div className="bg-card border rounded-xl p-4 space-y-2">
          <Label className="flex items-center gap-1.5 font-semibold">
            <Star className="h-4 w-4 text-primary" /> Game Highlights
            <span className="text-destructive text-xs ml-1">*</span>
          </Label>
          <MentionTextarea
            placeholder="Key moments, standout performances... (type @ to tag a player)"
            value={highlights}
            onChange={e => setHighlights(e.target.value)}
            rows={3}
            className="text-sm resize-none"
            maxLength={1000}
          />
        </div>

        {/* Fielding section */}
        <div className="bg-card border rounded-xl p-4 space-y-4">
          <p className="font-semibold text-sm flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Fielding Observations
          </p>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Missed Catches</Label>
            <MentionTextarea
              placeholder="Player names and situation... (@ to tag)"
              value={missedCatches}
              onChange={setMissedCatches}
              players={allPlayers}
              rows={2}
              className="text-sm resize-none"
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Missed Run-Outs</Label>
            <MentionTextarea
              placeholder="Player names and situation... (@ to tag)"
              value={missedRunOuts}
              onChange={setMissedRunOuts}
              players={allPlayers}
              rows={2}
              className="text-sm resize-none"
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Great Catches / Run-Outs
            </Label>
            <MentionTextarea
              placeholder="Name specific players... (@ to tag)"
              value={greatCatchesRunOuts}
              onChange={setGreatCatchesRunOuts}
              players={allPlayers}
              rows={2}
              className="text-sm resize-none"
              maxLength={500}
            />
          </div>
        </div>

        {/* Sportsmanship */}
        <div className="bg-card border rounded-xl p-4 space-y-2">
          <Label className="flex items-center gap-1.5 font-semibold">
            <Heart className="h-4 w-4 text-rose-500" /> Overall Sportsmanship
          </Label>
          <MentionTextarea
            placeholder="Attitude, conduct, and team spirit... (@ to tag)"
            value={sportsmanship}
            onChange={setSportsmanship}
              players={allPlayers}
            rows={2}
            className="text-sm resize-none"
            maxLength={500}
          />
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full h-14 text-base font-semibold"
        >
          {isSubmitting
            ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting...</>
            : <><Send className="mr-2 h-5 w-5" /> Submit Match Report</>}
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Logged in as {currentUser.phoneNumber || currentUser.email}
        </p>
      </div>
    </div>
  );
}

export default function MobileMatchReportPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    }>
      <MobileMatchReportPage />
    </Suspense>
  );
}
