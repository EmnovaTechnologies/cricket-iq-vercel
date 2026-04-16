'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  submitMatchReportAction,
  updateMatchReportAction,
  getMatchReportsForGameAction,
  certifyMatchReportAction,
  selectorCertifyMatchReportAction,
  selectorUncertifyMatchReportAction,
  getUserReportForGameAction,
} from '@/lib/actions/match-report-actions';
import type { MatchReport } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Send, ShieldCheck, Trophy, AlertTriangle,
  Star, Heart, FileText, CheckCircle2, Clock, Lock, LockOpen
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { PERMISSIONS } from '@/lib/permissions-master-list';

interface MatchReportTabProps {
  gameId: string;
  scorecardId?: string;
  organizationId: string;
  seriesId?: string;
  team1: string;
  team2: string;
  /** Players from the game roster or scorecard — keyed by team name */
  playersByTeam: Record<string, string[]>;
  /** The team this user is a selector/coach for */
  userTeam?: string;
  /** Whether this user is an assigned selector for this game */
  isAssignedSelector: boolean;
}

export function MatchReportTab({
  gameId,
  scorecardId,
  organizationId,
  seriesId,
  team1,
  team2,
  playersByTeam,
  userTeam,
  isAssignedSelector,
}: MatchReportTabProps) {
  const { currentUser, userProfile, effectivePermissions } = useAuth();
  const { toast } = useToast();

  const [reports, setReports] = useState<MatchReport[]>([]);
  const [myReport, setMyReport] = useState<MatchReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [certifyingId, setCertifyingId] = useState<string | null>(null);
  const [isSelectorCertifying, setIsSelectorCertifying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [selectedOpposingTeam, setSelectedOpposingTeam] = useState('');
  const [top3, setTop3] = useState<string[]>(['', '', '']);
  const [highlights, setHighlights] = useState('');
  const [missedCatches, setMissedCatches] = useState('');
  const [missedRunOuts, setMissedRunOuts] = useState('');
  const [greatCatchesRunOuts, setGreatCatchesRunOuts] = useState('');
  const [sportsmanship, setSportsmanship] = useState('');

  const [isSelector, setIsSelector] = useState(isAssignedSelector);

  const canViewAdmin = effectivePermissions[PERMISSIONS.SERIES_MANAGE_ADMINS_ANY] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY] ||
    userProfile?.roles?.includes('admin');
  // Selectors can view their own submitted report (but not others)
  const canView = canViewAdmin || (isSelector && !!myReport);

  const canCertify = effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY] ||
    userProfile?.roles?.includes('admin');

  // Check selector status — from prop, game lookup, or selector role (for scorecard page)
  useEffect(() => {
    if (isAssignedSelector) return;
    // Check if user has selector role — allow submission from scorecard even without linked game
    if (userProfile?.roles?.includes('selector') ||
        userProfile?.roles?.includes('Series Admin') ||
        userProfile?.roles?.includes('Organization Admin') ||
        userProfile?.roles?.includes('admin')) {
      setIsSelector(true);
      return;
    }
    // Check if assigned to the linked game
    if (gameId && currentUser?.uid) {
      import('@/lib/db').then(({ getGameByIdFromDB }) => {
        getGameByIdFromDB(gameId).then(game => {
          if (game?.selectorUserIds?.includes(currentUser.uid)) {
            setIsSelector(true);
          }
        });
      });
    }
  }, [gameId, currentUser?.uid, isAssignedSelector, userProfile?.roles]);

  // Derive opposing team from userTeam
  const opposingTeam = userTeam
    ? (userTeam === team1 ? team2 : team1)
    : selectedOpposingTeam;

  const opposingPlayers = playersByTeam[opposingTeam] || [];

  useEffect(() => {
    if (!gameId || !currentUser) return;
    setIsLoading(true);
    Promise.all([
      canView ? getMatchReportsForGameAction(gameId) : Promise.resolve({ success: true, reports: [] }),
      getUserReportForGameAction(gameId, currentUser.uid),
    ]).then(([allRes, myRep]) => {
      if (allRes.success) setReports(allRes.reports || []);
      setMyReport(myRep);
      if (!userTeam && !selectedOpposingTeam) {
        setSelectedOpposingTeam(team2);
      }
      setIsLoading(false);
    });
  }, [gameId, currentUser?.uid, canView]);

  const handleSubmit = async () => {
    if (!currentUser || !userProfile) return;
    const reportingTeam = userTeam || (selectedOpposingTeam === team1 ? team2 : team1);
    const submittedOpposingTeam = opposingTeam;

    if (!submittedOpposingTeam) {
      toast({ title: 'Select opposing team', variant: 'destructive' }); return;
    }
    const filledTop3 = top3.filter(p => p.trim());
    if (filledTop3.length === 0) {
      toast({ title: 'Select at least 1 top performer', variant: 'destructive' }); return;
    }
    if (!highlights.trim()) {
      toast({ title: 'Please add game highlights', variant: 'destructive' }); return;
    }

    setIsSubmitting(true);
    const res = await submitMatchReportAction({
      gameId,
      scorecardId,
      organizationId,
      seriesId,
      reportingTeam,
      opposingTeam: submittedOpposingTeam,
      submittedBy: currentUser.uid,
      submittedByName: userProfile.displayName || userProfile.email || 'Unknown',
      top3Players: filledTop3,
      highlights: highlights.trim(),
      missedCatches,
      missedRunOuts,
      greatCatchesRunOuts: greatCatchesRunOuts.trim(),
      sportsmanship: sportsmanship.trim(),
    });

    if (res.success) {
      toast({ title: 'Match report submitted' });
      // Reload
      const [allRes, myRep] = await Promise.all([
        canView ? getMatchReportsForGameAction(gameId) : Promise.resolve({ success: true, reports: [] }),
        getUserReportForGameAction(gameId, currentUser.uid),
      ]);
      if (allRes.success) setReports(allRes.reports || []);
      setMyReport(myRep);
    } else {
      toast({ title: 'Submission failed', description: res.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleUpdate = async () => {
    if (!currentUser || !myReport) return;
    setIsSubmitting(true);
    const res = await updateMatchReportAction(myReport.id, currentUser.uid, {
      opposingTeam: opposingTeam || selectedOpposingTeam,
      top3Players: top3.filter(p => p.trim()),
      highlights: highlights.trim(),
      missedCatches: missedCatches.trim(),
      missedRunOuts: missedRunOuts.trim(),
      greatCatchesRunOuts: greatCatchesRunOuts.trim(),
      sportsmanship: sportsmanship.trim(),
    });
    if (res.success) {
      toast({ title: 'Report updated' });
      const [allRes, myRep] = await Promise.all([
        canViewAdmin ? getMatchReportsForGameAction(gameId) : Promise.resolve({ success: true, reports: [] }),
        getUserReportForGameAction(gameId, currentUser.uid),
      ]);
      if (allRes.success) setReports(allRes.reports || []);
      setMyReport(myRep);
      setIsEditing(false);
    } else {
      toast({ title: 'Update failed', description: res.error, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleCertify = async (reportId: string) => {
    if (!currentUser || !userProfile) return;
    setCertifyingId(reportId);
    const res = await certifyMatchReportAction(
      reportId,
      currentUser.uid,
      userProfile.displayName || userProfile.email || 'Admin'
    );
    if (res.success) {
      toast({ title: 'Report certified' });
      setReports(prev => prev.map(r =>
        r.id === reportId ? { ...r, isCertified: true, certifiedByName: userProfile.displayName || '' } : r
      ));
    } else {
      toast({ title: 'Certification failed', description: res.error, variant: 'destructive' });
    }
    setCertifyingId(null);
  };

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">

      {/* ── Submit/Edit form — shown when no report yet, OR when editing an unlocked report ── */}
      {isSelector && (!myReport || (isEditing && !myReport.isSelectorCertified && !myReport.isCertified)) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> {isEditing ? 'Edit Match Report' : 'Submit Match Report'}
            </CardTitle>
            <CardDescription>
              {isEditing ? 'Update your report. Lock it again when done.' : 'Report on the opposing team's performance. One submission per selector per game.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Team selection — only if userTeam is not known */}
            {!userTeam && (
              <div className="space-y-1.5">
                <Label>You are reporting on</Label>
                <div className="flex gap-2">
                  {[team1, team2].map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedOpposingTeam(t)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        selectedOpposingTeam === t
                          ? 'bg-primary text-white border-primary'
                          : 'border-muted-foreground/30 hover:border-primary'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {userTeam && (
              <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg px-3 py-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span>Reporting on: <strong>{opposingTeam}</strong></span>
              </div>
            )}

            {/* Top 3 performers */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Top 3 Performers
              </Label>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <select
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={top3[i]}
                    onChange={e => {
                      const updated = [...top3];
                      updated[i] = e.target.value;
                      setTop3(updated);
                    }}
                  >
                    <option value="">— Select player —</option>
                    {opposingPlayers.map(p => (
                      <option key={p} value={p}
                        disabled={top3.includes(p) && top3[i] !== p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <Separator />

            {/* Highlights */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-primary" /> Game Highlights
              </Label>
              <Textarea
                placeholder="Describe key moments, standout performances, and overall game quality..."
                value={highlights}
                onChange={e => setHighlights(e.target.value)}
                className="min-h-[80px] text-sm"
              />
            </div>

            {/* Missed catches & run-outs */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Missed Catches
                </Label>
                <Textarea
                  placeholder="Describe any missed catches — player names and situation..."
                  value={missedCatches}
                  onChange={e => setMissedCatches(e.target.value)}
                  className="min-h-[60px] text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Missed Run-Outs
                </Label>
                <Textarea
                  placeholder="Describe any missed run-out opportunities — player names and situation..."
                  value={missedRunOuts}
                  onChange={e => setMissedRunOuts(e.target.value)}
                  className="min-h-[60px] text-sm"
                />
              </div>
            </div>

            {/* Great catches / run-outs */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Great Catches / Run-Outs
              </Label>
              <Textarea
                placeholder="Name specific players and describe the effort..."
                value={greatCatchesRunOuts}
                onChange={e => setGreatCatchesRunOuts(e.target.value)}
                className="min-h-[60px] text-sm"
              />
            </div>

            {/* Sportsmanship */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-rose-500" /> Overall Sportsmanship
              </Label>
              <Textarea
                placeholder="Comment on attitude, conduct, and team spirit..."
                value={sportsmanship}
                onChange={e => setSportsmanship(e.target.value)}
                className="min-h-[60px] text-sm"
              />
            </div>

            <Button onClick={isEditing ? handleUpdate : handleSubmit} disabled={isSubmitting} className="w-full">
              {isSubmitting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isEditing ? 'Saving...' : 'Submitting...'}</>
                : isEditing
                  ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Save Changes</>
                  : <><Send className="mr-2 h-4 w-4" /> Submit Report</>
              }
            </Button>
            {isEditing && (
              <Button variant="outline" className="w-full" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Already submitted notice + selector lock/unlock ── */}
      {isSelector && myReport && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              You submitted a report on <strong>{myReport.opposingTeam}</strong> on{' '}
              {format(parseISO(myReport.submittedAt), 'PPP')}
            </span>
            {myReport.isSelectorCertified && !myReport.isCertified && (
              <Badge className="ml-auto shrink-0 text-xs bg-blue-600">🔒 Locked</Badge>
            )}
            {myReport.isCertified && (
              <Badge className="ml-auto shrink-0 text-xs bg-green-600"><ShieldCheck className="h-3 w-3 mr-1 inline" />Certified</Badge>
            )}
          </div>

          {/* Selector lock / unlock — not available once admin has certified */}
          {!myReport.isCertified && (
            myReport.isSelectorCertified ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-xs text-blue-700 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Your report is locked — awaiting admin certification.
                </span>
                <Button
                  size="sm" variant="ghost"
                  className="text-xs text-blue-600 hover:text-blue-800 h-7 px-2"
                  disabled={isSelectorCertifying}
                  onClick={async () => {
                    setIsSelectorCertifying(true);
                    const res = await selectorUncertifyMatchReportAction(myReport.id, currentUser!.uid);
                    if (res.success) {
                      toast({ title: 'Report unlocked', description: 'You can now edit and re-lock your report.' });
                      const updated = await getUserReportForGameAction(gameId, currentUser!.uid);
                      setMyReport(updated);
                    } else {
                      toast({ title: 'Could not unlock', description: res.error, variant: 'destructive' });
                    }
                    setIsSelectorCertifying(false);
                  }}
                >
                  {isSelectorCertifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LockOpen className="h-3.5 w-3.5 mr-1" />}
                  Unlock
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-muted-foreground/30"
                  onClick={() => {
                    // Pre-fill form with existing report values
                    setSelectedOpposingTeam(myReport.opposingTeam);
                    setTop3([...myReport.top3Players, '', '', ''].slice(0, 3));
                    setHighlights(myReport.highlights || '');
                    setMissedCatches(myReport.missedCatches || '');
                    setMissedRunOuts(myReport.missedRunOuts || '');
                    setGreatCatchesRunOuts(myReport.greatCatchesRunOuts || '');
                    setSportsmanship(myReport.sportsmanship || '');
                    setIsEditing(true);
                  }}
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Edit Report
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isSelectorCertifying}
                  onClick={async () => {
                    setIsSelectorCertifying(true);
                    const res = await selectorCertifyMatchReportAction(myReport.id, currentUser!.uid);
                    if (res.success) {
                      toast({ title: '🔒 Report locked', description: 'Your report is locked and ready for admin review.' });
                      const updated = await getUserReportForGameAction(gameId, currentUser!.uid);
                      setMyReport(updated);
                      setIsEditing(false);
                    } else {
                      toast({ title: 'Could not lock', description: res.error, variant: 'destructive' });
                    }
                    setIsSelectorCertifying(false);
                  }}
                >
                  {isSelectorCertifying
                    ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    : <Lock className="mr-2 h-3.5 w-3.5" />}
                  Lock Report
                </Button>
              </div>
            )
          )}
        </div>
      )}

      {/* ── Reports list — admins only ── */}
      {(canViewAdmin || (isSelector && myReport)) && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {canViewAdmin ? `Submitted Reports (${reports.length})` : 'Your Submitted Report'}
          </h3>

          {(() => {
            const visibleReports = canViewAdmin ? reports : reports.filter(r => r.submittedBy === currentUser?.uid);
            return visibleReports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No reports submitted yet.</p>
          ) : (
            visibleReports.map(report => (
              <Card key={report.id} className={report.isCertified ? 'border-green-300 bg-green-50/30' : ''}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        Report on <span className="text-primary">{report.opposingTeam}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        By {report.submittedByName} · {format(parseISO(report.submittedAt), 'PP p')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {report.isCertified ? (
                        <Badge className="bg-green-600 text-xs gap-1">
                          <ShieldCheck className="h-3 w-3" /> Certified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                          <Clock className="h-3 w-3" /> Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Top 3 */}
                  {report.top3Players.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                        <Trophy className="h-3 w-3 text-yellow-500" /> Top Performers
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {report.top3Players.map((p, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {i + 1}. {p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Highlights */}
                  {report.highlights && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                        <Star className="h-3 w-3 text-primary" /> Highlights
                      </p>
                      <p className="text-sm">{report.highlights}</p>
                    </div>
                  )}

                  {/* Missed fielding */}
                  {(report.missedCatches || report.missedRunOuts) && (
                    <div className="space-y-1.5">
                      {report.missedCatches && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                            <AlertTriangle className="h-3 w-3 text-amber-500" /> Missed Catches
                          </p>
                          <p className="text-sm">{report.missedCatches}</p>
                        </div>
                      )}
                      {report.missedRunOuts && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                            <AlertTriangle className="h-3 w-3 text-amber-500" /> Missed Run-Outs
                          </p>
                          <p className="text-sm">{report.missedRunOuts}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Great efforts */}
                  {report.greatCatchesRunOuts && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" /> Great Catches / Run-Outs
                      </p>
                      <p className="text-sm">{report.greatCatchesRunOuts}</p>
                    </div>
                  )}

                  {/* Sportsmanship */}
                  {report.sportsmanship && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                        <Heart className="h-3 w-3 text-rose-500" /> Sportsmanship
                      </p>
                      <p className="text-sm">{report.sportsmanship}</p>
                    </div>
                  )}

                  {/* Certified by */}
                  {report.isCertified && report.certifiedByName && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Certified by {report.certifiedByName}
                      {report.certifiedAt && ` on ${format(parseISO(report.certifiedAt), 'PP')}`}
                    </p>
                  )}

                  {/* Certify button — only available after selector has locked */}
                  {canCertify && !report.isCertified && (
                    report.isSelectorCertified ? (
                      <Button
                        size="sm" variant="outline"
                        className="border-green-500 text-green-600 hover:bg-green-50 w-full sm:w-auto"
                        disabled={certifyingId === report.id}
                        onClick={() => handleCertify(report.id)}
                      >
                        {certifyingId === report.id
                          ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          : <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                        }
                        Certify Report
                      </Button>
                    ) : (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Awaiting selector to lock report
                      </p>
                    )
                  )}
                </CardContent>
              </Card>
            ))
          );
          })()}
        </div>
      )}

      {/* Non-selector, non-admin message */}
      {!isSelector && !canViewAdmin && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Match reports are submitted by assigned selectors and visible to administrators only.
        </div>
      )}
    </div>
  );
}
