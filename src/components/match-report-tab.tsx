'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  submitMatchReportAction,
  updateMatchReportAction,
  getMatchReportsForGameAction,
  certifyMatchReportAction,
  adminEditMatchReportAction,
  selectorCertifyMatchReportAction,
  selectorUncertifyMatchReportAction,
  getUserReportForGameAction,
  getUserReportsForGameAction,
} from '@/lib/actions/match-report-actions';
import type { MatchReport, ScorecardSelectorAssignment, UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Send,
  ShieldCheck,
  Trophy,
  AlertTriangle,
  Star,
  Heart,
  FileText,
  CheckCircle2,
  Clock,
  Lock,
  LockOpen,
  Pencil,
  Save,
  Sparkles,
  Upload,
  ImageIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { MentionTextarea, MentionText } from '@/components/ui/mention-textarea';
import {
  analyseMatchReportAction, saveMatchReportDeltasAction,
  type MatchReportDelta,
} from '@/lib/actions/match-report-ai-action';
import {
  parseMatchReportImageAction, parseMatchReportDocxAction,
  type ParsedMatchReport, type ParsedMatchReportPair,
} from '@/lib/actions/match-report-import-action';
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
  /** Direct selector assignments on this scorecard (optional) */
  selectorAssignments?: ScorecardSelectorAssignment[];
  /** Available selectors (with clubName) for badge display */
  availableSelectors?: UserProfile[];
  /** Org-level report scope policy */
  selectorReportScope?: 'opposing_only' | 'both_teams' | 'own_team_only';
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
  selectorAssignments = [],
  availableSelectors = [],
  selectorReportScope = 'opposing_only',
}: MatchReportTabProps) {
  const { currentUser, userProfile, effectivePermissions } = useAuth();
  const { toast } = useToast();
  const selectorProfileMap = new Map(availableSelectors.map((u: UserProfile) => [u.uid, u]));

  const [reports, setReports] = useState<MatchReport[]>([]);
  const [myReport, setMyReport] = useState<MatchReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisDeltas, setAnalysisDeltas] = useState<(MatchReportDelta & { id?: string })[]>([]);
  const [deltaAccepted, setDeltaAccepted] = useState<Map<number, boolean | null>>(new Map());
  const [isSavingDeltas, setIsSavingDeltas] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ParsedMatchReport | null>(null);
  // Two-report import state
  const [importPair, setImportPair] = useState<ParsedMatchReportPair | null>(null);
  const [importTopA, setImportTopA] = useState<string[]>(['', '', '']);
  const [importTopB, setImportTopB] = useState<string[]>(['', '', '']);
  const [submittedTeams, setSubmittedTeams] = useState<Set<string>>(new Set());
  const [isSubmittingTeam, setIsSubmittingTeam] = useState<string | null>(null);

  // Read pre-filled import data from sessionStorage (set by scorecard card/list import)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem('import_report_' + scorecardId);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.highlights) setHighlights(parsed.highlights);
        if (parsed.missedCatches) setMissedCatches(parsed.missedCatches);
        if (parsed.missedRunOuts) setMissedRunOuts(parsed.missedRunOuts);
        if (parsed.greatCatchesRunOuts) setGreatCatchesRunOuts(parsed.greatCatchesRunOuts);
        if (parsed.sportsmanship) setSportsmanship(parsed.sportsmanship);
        sessionStorage.removeItem('import_report_' + scorecardId);
        toast({ title: 'Report imported', description: 'Fields pre-filled - review and edit before submitting.' });
      } catch {}
    }
  }, [scorecardId]);
  const [certifyingId, setCertifyingId] = useState<string | null>(null);
  const [isSelectorCertifying, setIsSelectorCertifying] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    top3: string[]; highlights: string; missedCatches: string;
    missedRunOuts: string; greatCatchesRunOuts: string; sportsmanship: string; editedNote: string;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
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

  // Flat list of all players for @mention autocomplete
  const allPlayers = Object.values(playersByTeam).flat();

  // Find this selector's direct assignment (if any)
  const myAssignment = selectorAssignments.find(a => a.uid === currentUser?.uid);
  const myTeamAssociation = myAssignment?.teamAssociation; // team name, 'neutral', or undefined

  // Derive what teams this selector can report on based on assignment + org policy
  const getReportableTeams = (): string[] => {
    if (myTeamAssociation && myTeamAssociation !== 'neutral') {
      // teamAssociation = the team this selector is scoped TO RATE (already the opposing team)
      if (selectorReportScope === 'both_teams') return [team1, team2];
      if (selectorReportScope === 'own_team_only') {
        // rate their own team = the one that is NOT teamAssociation
        return [myTeamAssociation === team1 ? team2 : team1];
      }
      // Default opposing_only: teamAssociation IS the team to report on
      return [myTeamAssociation];
    }
    // Neutral or no direct assignment — use org policy
    if (selectorReportScope === 'both_teams') return [team1, team2];
    if (selectorReportScope === 'own_team_only') return [team1, team2]; // no team known, show both
    return [team1, team2]; // opposing_only with no team association — let them pick
  };
  const reportableTeams = getReportableTeams();
  const reportingIsLocked = reportableTeams.length === 1;
  // Auto-set opposing team when locked to single option
  const effectiveOpposingTeam = reportingIsLocked
    ? reportableTeams[0]
    : (userTeam ? (userTeam === team1 ? team2 : team1) : selectedOpposingTeam);

  const canViewAdmin = effectivePermissions[PERMISSIONS.SERIES_MANAGE_ADMINS_ANY] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY] ||
    userProfile?.roles?.includes('admin');
  // Selectors can view their own submitted report (but not others)
  const canView = canViewAdmin || (isSelector && !!myReport);

  const canCertify = effectivePermissions[PERMISSIONS.GAMES_CERTIFY_ANY] ||
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
  // userTeam = team the selector is scoped to RATE, so opposingTeam = userTeam directly
  const opposingTeam = userTeam || selectedOpposingTeam;

  const opposingPlayers = playersByTeam[effectiveOpposingTeam] || playersByTeam[selectedOpposingTeam] || playersByTeam[team2] || [];

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
    const submittedOpposingTeam = effectiveOpposingTeam || selectedOpposingTeam || team2;
    const reportingTeam = submittedOpposingTeam === team1 ? team2 : team1;

    if (!submittedOpposingTeam) {
      toast({ title: 'Select the team to report on', variant: 'destructive' }); return;
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
      // Always update myReport so the submitted report card refreshes for selectors too
      if (myRep) setMyReport(myRep);
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
      userProfile.displayName || userProfile.email || 'Admin',
      organizationId
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

  const handleAdminEdit = async (report: any) => {
    if (!currentUser || !userProfile) return;
    setIsSavingEdit(true);
    const res = await adminEditMatchReportAction(
      report.id,
      currentUser.uid,
      userProfile.displayName || userProfile.email || 'Admin',
      {
        opposingTeam: report.opposingTeam,
        top3Players: editFields!.top3.filter(Boolean),
        highlights: editFields!.highlights,
        missedCatches: editFields!.missedCatches,
        missedRunOuts: editFields!.missedRunOuts,
        greatCatchesRunOuts: editFields!.greatCatchesRunOuts,
        sportsmanship: editFields!.sportsmanship,
        editedNote: editFields!.editedNote,
        organizationId,
      }
    );
    if (res.success) {
      toast({ title: 'Report updated and locked' });
      setReports(prev => prev.map(r => r.id === report.id ? {
        ...r,
        top3Players: editFields!.top3.filter(Boolean),
        highlights: editFields!.highlights,
        missedCatches: editFields!.missedCatches,
        missedRunOuts: editFields!.missedRunOuts,
        greatCatchesRunOuts: editFields!.greatCatchesRunOuts,
        sportsmanship: editFields!.sportsmanship,
        editedByName: userProfile.displayName || userProfile.email || 'Admin',
        editedAt: new Date().toISOString(),
        editedNote: editFields!.editedNote,
        isSelectorCertified: true,
      } : r));
      setEditingReportId(null);
      setEditFields(null);
    } else {
      toast({ title: 'Edit failed', description: res.error, variant: 'destructive' });
    }
    setIsSavingEdit(false);
  };

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">

      {/* ── Assigned Selectors — admin view ── */}
      {canViewAdmin && selectorAssignments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <FileText className="h-4 w-4" /> Assigned Selectors
          </h3>
          <div className="space-y-1.5">
            {selectorAssignments.map(a => {
              const profile = selectorProfileMap.get(a.uid);
              const clubName = profile?.clubName || a.clubName;
              return (
                <div key={a.uid} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{a.name}</span>
                  {clubName && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200 shrink-0">
                      {clubName}
                    </span>
                  )}
                  {a.teamAssociation && a.teamAssociation !== 'neutral' ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
                      → {a.teamAssociation}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground border shrink-0">
                      Neutral
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 text-xs">Club</span>
              club association
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 text-xs">→ Team</span>
              scoped to rate this team
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground border text-xs">Neutral</span>
              no scope set
            </span>
          </div>
        </div>
      )}

      {/* ── Submit/Edit form — shown when no report yet, OR when editing an unlocked report ── */}
      {isSelector && (!myReport || (isEditing && !myReport.isSelectorCertified && !myReport.isCertified)) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> {isEditing ? 'Edit Match Report' : 'Submit Match Report'}
            </CardTitle>
            <CardDescription>
              {isEditing ? 'Update your report. Lock it again when done.' : "Report on the opposing team's performance. One submission per selector per game."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Team selection — locked if scope forces single team */}
            {reportingIsLocked ? (
              <div className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg px-3 py-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span>Reporting on: <strong>{effectiveOpposingTeam}</strong></span>
                {myTeamAssociation && myTeamAssociation !== 'neutral' && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    {myTeamAssociation === team1 ? team2 : team1} selector
                  </Badge>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>You are reporting on</Label>
                <div className="flex gap-2">
                  {reportableTeams.map(t => (
                    <button
                      key={t}
                      onClick={() => setSelectedOpposingTeam(t)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        (selectedOpposingTeam || team2) === t
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

            {/* Import section - prominent */}
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">Import from photo or Word doc</p>
                  <p className="text-xs text-muted-foreground">Upload a handwritten or typed report - fields will be auto-filled below</p>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <label className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-background border border-primary/30 rounded-lg text-sm font-medium cursor-pointer hover:bg-primary/5 transition-colors">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Photo / Scan (JPG, PNG)
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setIsImporting(true); setImportPreview(null); setImportPair(null);
                      const reader = new FileReader();
                      reader.onload = async ev => {
                        const base64 = (ev.target?.result as string).split(",")[1];
                        const rosterA = playersByTeam[team1] || [];
                        const rosterB = playersByTeam[team2] || [];
                        const res = await parseMatchReportImageAction(base64, file.type as any, team1, team2, rosterA, rosterB);
                        if (res.success && res.parsed) {
                          setImportPair(res.parsed);
                          setImportTopA(res.parsed.teamA.top3Matched.concat(['','','']).slice(0,3));
                          setImportTopB(res.parsed.teamB.top3Matched.concat(['','','']).slice(0,3));
                          setSubmittedTeams(new Set());
                          toast({ title: 'Report imported', description: 'Review each team panel below and submit independently.' });
                        } else toast({ title: 'Import failed', description: res.error, variant: 'destructive' });
                        setIsImporting(false);
                      };
                      reader.readAsDataURL(file); e.target.value = '';
                    }} />
                </label>
                <label className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-background border border-primary/30 rounded-lg text-sm font-medium cursor-pointer hover:bg-primary/5 transition-colors">
                  <FileText className="h-4 w-4 text-primary" />
                  Word Document (.docx)
                  <input type="file" accept=".docx" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setIsImporting(true); setImportPreview(null); setImportPair(null);
                      const reader = new FileReader();
                      reader.onload = async ev => {
                        try {
                          let mammoth: any = (window as any).mammoth;
                          if (!mammoth) {
                            await new Promise<void>((res, rej) => {
                              const s = document.createElement("script");
                              s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
                              s.onload = () => res(); s.onerror = rej;
                              document.head.appendChild(s);
                            });
                            mammoth = (window as any).mammoth;
                          }
                          const result = await mammoth.extractRawText({ arrayBuffer: ev.target?.result as ArrayBuffer });
                          const rosterA = playersByTeam[team1] || [];
                          const rosterB = playersByTeam[team2] || [];
                          const res = await parseMatchReportDocxAction(result.value, team1, team2, rosterA, rosterB);
                          if (res.success && res.parsed) {
                            setImportPair(res.parsed);
                            setImportTopA(res.parsed.teamA.top3Matched.concat(['','','']).slice(0,3));
                            setImportTopB(res.parsed.teamB.top3Matched.concat(['','','']).slice(0,3));
                            setSubmittedTeams(new Set());
                            toast({ title: 'Report imported', description: 'Review each team panel below and submit independently.' });
                          } else toast({ title: 'Import failed', description: res.error, variant: 'destructive' });
                        } catch (err: any) {
                          toast({ title: 'Could not read docx', description: err.message, variant: 'destructive' });
                        }
                        setIsImporting(false);
                      };
                      reader.readAsArrayBuffer(file); e.target.value = '';
                    }} />
                </label>
              </div>
              {isImporting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Scanning report - please wait...
                </div>
              )}
              {importPair && !isImporting && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Report split into two team panels below. Review and submit each independently.
                  <button onClick={() => { setImportPair(null); setSubmittedTeams(new Set()); }} className="ml-auto text-muted-foreground hover:text-foreground">×</button>
                </div>
              )}
            </div>

            {/* ── Two-panel import layout ── */}
            {importPair && !isImporting && (() => {
              const handleImportSubmit = async (
                teamName: string,
                parsed: ParsedMatchReport,
                top3State: string[]
              ) => {
                if (!currentUser || !userProfile) return;
                const reportingTeam = teamName === team1 ? team2 : team1;
                const filledTop3 = top3State.filter(p => p.trim());
                if (filledTop3.length === 0) {
                  toast({ title: 'Select at least 1 top performer', variant: 'destructive' }); return;
                }
                if (!parsed.highlights.trim()) {
                  toast({ title: 'Highlights are required', variant: 'destructive' }); return;
                }
                setIsSubmittingTeam(teamName);
                const res = await submitMatchReportAction({
                  gameId,
                  scorecardId,
                  organizationId,
                  seriesId,
                  reportingTeam,
                  opposingTeam: teamName,
                  submittedBy: currentUser.uid,
                  submittedByName: userProfile.displayName || userProfile.email || 'Unknown',
                  top3Players: filledTop3,
                  highlights: parsed.highlights,
                  missedCatches: parsed.missedCatches,
                  missedRunOuts: parsed.missedRunOuts,
                  greatCatchesRunOuts: parsed.greatCatchesRunOuts,
                  sportsmanship: parsed.sportsmanship,
                });
                if (res.success) {
                  setSubmittedTeams(prev => new Set([...prev, teamName]));
                  toast({ title: `${teamName} report submitted` });
                  const [allRes, myRep] = await Promise.all([
                    canView ? getMatchReportsForGameAction(gameId) : Promise.resolve({ success: true, reports: [] }),
                    getUserReportForGameAction(gameId, currentUser.uid),
                  ]);
                  if (allRes.success) setReports(allRes.reports || []);
                  setMyReport(myRep);
                } else {
                  toast({ title: 'Submission failed', description: res.error, variant: 'destructive' });
                }
                setIsSubmittingTeam(null);
              };

              const renderTeamPanel = (
                teamName: string,
                parsed: ParsedMatchReport,
                top3State: string[],
                setTop3State: (v: string[]) => void,
                roster: string[],
                colorClass: string
              ) => {
                const isSubmitted = submittedTeams.has(teamName);
                const isThisSubmitting = isSubmittingTeam === teamName;
                return (
                  <div className="border rounded-lg overflow-hidden">
                    <div className={`px-4 py-2.5 border-b flex items-center justify-between ${colorClass}`}>
                      <span className="text-sm font-medium">{teamName}</span>
                      {parsed.unmatchedCount > 0 && !isSubmitted && (
                        <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          {parsed.unmatchedCount} name{parsed.unmatchedCount > 1 ? 's' : ''} not matched
                        </span>
                      )}
                      {isSubmitted && (
                        <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Submitted
                        </span>
                      )}
                    </div>
                    <div className="p-4 space-y-3">
                      {/* Top 3 */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1">
                          <Trophy className="h-3 w-3 text-yellow-500" /> Top performers
                        </label>
                        {[0,1,2].map(i => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-4">{i+1}.</span>
                            <select
                              className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm"
                              value={top3State[i] || ''}
                              disabled={isSubmitted}
                              onChange={e => {
                                const updated = [...top3State];
                                updated[i] = e.target.value;
                                setTop3State(updated);
                              }}
                            >
                              <option value="">— Select player —</option>
                              {roster.map(p => (
                                <option key={p} value={p} disabled={top3State.includes(p) && top3State[i] !== p}>{p}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      {/* Fields */}
                      {[
                        { label: 'Highlights', value: parsed.highlights, icon: '★', required: true },
                        { label: 'Great catches / run outs', value: parsed.greatCatchesRunOuts, icon: '✓', required: false },
                        { label: 'Missed catches', value: parsed.missedCatches, icon: '!', required: false },
                        { label: 'Missed run outs', value: parsed.missedRunOuts, icon: '!', required: false },
                        { label: 'Sportsmanship', value: parsed.sportsmanship, icon: '♥', required: false },
                      ].map(({ label, value, required }) => (
                        <div key={label} className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            {label}{required && <span className="text-destructive ml-0.5">*</span>}
                          </label>
                          {value ? (
                            <p className="text-sm leading-relaxed bg-muted rounded-md px-3 py-2">{value}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground italic px-3 py-2 bg-muted rounded-md">Nothing noted</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="px-4 pb-4">
                      {isSubmitted ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-green-700 py-2">
                          <CheckCircle2 className="h-4 w-4" /> {teamName} report submitted
                        </div>
                      ) : (
                        <Button
                          className="w-full"
                          disabled={isThisSubmitting || !!isSubmittingTeam}
                          onClick={() => handleImportSubmit(
                            teamName, parsed, top3State
                          )}
                        >
                          {isThisSubmitting
                            ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Submitting...</>
                            : <><Send className="mr-2 h-3.5 w-3.5" /> Submit {teamName} report</>
                          }
                        </Button>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {renderTeamPanel(team1, importPair.teamA, importTopA, setImportTopA, playersByTeam[team1] || [], 'bg-blue-50')}
                  {renderTeamPanel(team2, importPair.teamB, importTopB, setImportTopB, playersByTeam[team2] || [], 'bg-green-50')}
                </div>
              );
            })()}

            {/* Manual form — only shown when no import active */}
            {!importPair && <>

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
                <Star className="h-3.5 w-3.5 text-primary" /> Game Highlights <span className="text-destructive">*</span>
              </Label>
              <MentionTextarea
                placeholder="Describe key moments, standout performances, and overall game quality... (type @ to tag a player)"
                value={highlights}
                onChange={setHighlights}
                players={allPlayers}
                rows={3}
                className="min-h-[80px]"
              />
            </div>

            {/* Missed catches & run-outs */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Missed Catches
                </Label>
                <MentionTextarea
                  placeholder="Describe any missed catches... (type @ to tag a player)"
                  value={missedCatches}
                  onChange={setMissedCatches}
                  players={allPlayers}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Missed Run-Outs
                </Label>
                <MentionTextarea
                  placeholder="Describe any missed run-out opportunities... (type @ to tag a player)"
                  value={missedRunOuts}
                  onChange={setMissedRunOuts}
                  players={allPlayers}
                  rows={2}
                />
              </div>
            </div>

            {/* Great catches / run-outs */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Great Catches / Run-Outs
              </Label>
              <MentionTextarea
                placeholder="Name specific players and describe the effort... (type @ to tag a player)"
                value={greatCatchesRunOuts}
                onChange={setGreatCatchesRunOuts}
                players={allPlayers}
                rows={2}
              />
            </div>

            {/* Sportsmanship */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-rose-500" /> Overall Sportsmanship
              </Label>
              <MentionTextarea
                placeholder="Comment on attitude, conduct, and team spirit... (type @ to tag a player)"
                value={sportsmanship}
                onChange={setSportsmanship}
                players={allPlayers}
                rows={2}
              />
            </div>

            {/* AI Analysis - admin only */}
            {canViewAdmin && (
              <div className="space-y-3 pt-1 border-t">
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" /> AI Match Report Analysis
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {reports.length > 0
                        ? 'Analyses all sections - suggests rating deltas per player - umpire negations excluded'
                        : 'No reports submitted yet. Import a report above to get started.'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled={isAnalysing || reports.length === 0}
                    onClick={async () => {
                      if (!gameId || !scorecardId || !allPlayers.length) return;
                      setIsAnalysing(true); setAnalysisDeltas([]); setDeltaAccepted(new Map());
                      const latestReport = reports[0];
                      const res = await analyseMatchReportAction({
                        scorecardId, gameId,
                        organizationId: (latestReport as any).organizationId || '',
                        rosterPlayers: allPlayers.map(p => ({ id: p.id, name: p.name })),
                        sections: {
                          highlights: latestReport?.highlights || '',
                          missedCatches: latestReport?.missedCatches || '',
                          missedRunOuts: latestReport?.missedRunOuts || '',
                          greatCatchesRunOuts: latestReport?.greatCatchesRunOuts || '',
                          sportsmanship: latestReport?.sportsmanship || '',
                        },
                      });
                      if (res.success && res.deltas) {
                        setAnalysisDeltas(res.deltas);
                        const map = new Map<number, boolean | null>();
                        res.deltas.forEach((_, i) => map.set(i, null));
                        setDeltaAccepted(map);
                      } else toast({ title: 'Analysis failed', description: res.error, variant: 'destructive' });
                      setIsAnalysing(false);
                    }}>
                    {isAnalysing ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Analysing...</> : <><Sparkles className="mr-2 h-3.5 w-3.5" /> Analyse Report</>}
                  </Button>
                </div>
                {analysisDeltas.length > 0 && (
                  <div className="border border-blue-200 rounded-lg overflow-hidden">
                    <div className="bg-blue-50 dark:bg-blue-950 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {analysisDeltas.length} suggestion{analysisDeltas.length !== 1 ? 's' : ''} - review each before saving
                      </span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => { const m = new Map<number,boolean|null>(); analysisDeltas.forEach((_,i) => m.set(i,true)); setDeltaAccepted(m); }}>
                          Accept all
                        </Button>
                        <Button size="sm" className="h-7 text-xs"
                          disabled={isSavingDeltas || !Array.from(deltaAccepted.values()).some(v => v === true)}
                          onClick={async () => {
                            if (!scorecardId || !gameId) return;
                            setIsSavingDeltas(true);
                            const toSave = analysisDeltas.map((d, i) => ({
                              ...d,
                              status: (deltaAccepted.get(i) === true ? 'accepted' : deltaAccepted.get(i) === false ? 'rejected' : 'pending') as MatchReportDelta['status'],
                            }));
                            const orgId = (reports[0] as any).organizationId || '';
                            const res = await saveMatchReportDeltasAction(scorecardId, gameId, orgId, toSave);
                            if (res.success) {
                              toast({ title: toSave.filter(d => d.status === 'accepted').length + ' delta(s) saved' });
                              setAnalysisDeltas([]); setDeltaAccepted(new Map());
                            } else toast({ title: 'Error', description: res.error, variant: 'destructive' });
                            setIsSavingDeltas(false);
                          }}>
                          {isSavingDeltas && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                          Save ({Array.from(deltaAccepted.values()).filter(v => v === true).length} accepted)
                        </Button>
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded px-2 py-1.5 mb-2">
                        Umpire negation phrases excluded - Attitude uses cumulative series average
                      </p>
                      <div className="grid grid-cols-12 gap-2 px-1 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                        <div className="col-span-3">Player</div><div className="col-span-2">Dimension</div>
                        <div className="col-span-1">Delta</div><div className="col-span-4">Reason</div>
                        <div className="col-span-2 text-right">Action</div>
                      </div>
                      {analysisDeltas.map((delta, i) => {
                        const accepted = deltaAccepted.get(i);
                        const dimColor: Record<string, string> = {
                          batting: 'bg-blue-100 text-blue-700 border-blue-200',
                          bowling: 'bg-green-100 text-green-700 border-green-200',
                          fielding: 'bg-purple-100 text-purple-700 border-purple-200',
                          keeping: 'bg-amber-100 text-amber-700 border-amber-200',
                          attitude: 'bg-orange-100 text-orange-700 border-orange-200',
                        };
                        return (
                          <div key={i} className={"grid grid-cols-12 gap-2 px-1 py-2.5 border-b last:border-0 items-center text-sm transition-opacity " + (accepted === false ? 'opacity-40' : '')}>
                            <div className="col-span-3 font-medium text-sm truncate">{delta.playerName}</div>
                            <div className="col-span-2">
                              <span className={"inline-flex text-xs px-1.5 py-0.5 rounded border " + (dimColor[delta.dimension] || 'bg-muted')}>
                                {delta.dimension}
                              </span>
                            </div>
                            <div className={"col-span-1 font-bold text-sm " + (delta.delta > 0 ? 'text-green-600' : 'text-red-600')}>
                              {delta.delta > 0 ? '+' : ''}{delta.delta}
                            </div>
                            <div className="col-span-4 text-xs text-muted-foreground italic truncate" title={delta.reason}>
                              {delta.reason}
                            </div>
                            <div className="col-span-2 flex gap-1.5 justify-end">
                              <button onClick={() => setDeltaAccepted(p => { const n = new Map(p); n.set(i, accepted === true ? null : true); return n; })}
                                className={"text-xs px-2 py-1 rounded border transition-colors " + (accepted === true ? 'bg-green-100 text-green-700 border-green-300' : 'border-muted text-muted-foreground hover:bg-green-50')}>
                                Accept
                              </button>
                              <button onClick={() => setDeltaAccepted(p => { const n = new Map(p); n.set(i, accepted === false ? null : false); return n; })}
                                className={"text-xs px-2 py-1 rounded border transition-colors " + (accepted === false ? 'bg-red-100 text-red-700 border-red-300' : 'border-muted text-muted-foreground hover:bg-red-50')}>
                                Reject
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

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
            </>}
          </CardContent>
        </Card>
      )}

      {/* ── Already submitted notice + selector lock/unlock ── */}
      {isSelector && myReport && (
        <div className="space-y-2">
          {myReport.editedByName && (
            <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              <span className="flex items-center gap-1 font-medium">
                <Pencil className="h-4 w-4" /> This report was edited by {myReport.editedByName}
                {myReport.editedAt && ` on ${format(parseISO(myReport.editedAt), 'PP p')}`}
              </span>
              {myReport.editedNote && <span className="italic text-amber-700">{myReport.editedNote}</span>}
            </div>
          )}
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

          {/* Selector lock / unlock — hidden while editing */}
          {!myReport.isCertified && !isEditing && (
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
            const visibleReports = canViewAdmin
              ? reports
              : myReport ? [myReport] : [];
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
                      <MentionText text={report.highlights} knownPlayers={allPlayers} className="text-sm" />
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
                          <MentionText text={report.missedCatches} knownPlayers={allPlayers} className="text-sm" />
                        </div>
                      )}
                      {report.missedRunOuts && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                            <AlertTriangle className="h-3 w-3 text-amber-500" /> Missed Run-Outs
                          </p>
                          <MentionText text={report.missedRunOuts} knownPlayers={allPlayers} className="text-sm" />
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
                      <MentionText text={report.greatCatchesRunOuts} knownPlayers={allPlayers} className="text-sm" />
                    </div>
                  )}

                  {/* Sportsmanship */}
                  {report.sportsmanship && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                        <Heart className="h-3 w-3 text-rose-500" /> Sportsmanship
                      </p>
                      <MentionText text={report.sportsmanship} knownPlayers={allPlayers} className="text-sm" />
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

                  {/* Edit audit trail */}
                  {report.editedByName && (
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                      <span className="flex items-center gap-1 font-medium">
                        <Pencil className="h-3 w-3" /> Edited by {report.editedByName}
                        {report.editedAt && ` on ${format(parseISO(report.editedAt), 'PP p')}`}
                      </span>
                      {report.editedNote && <span className="text-amber-700 italic">{report.editedNote}</span>}
                    </div>
                  )}

                  {/* Admin edit form — inline */}
                  {canCertify && !report.isCertified && editingReportId === report.id && editFields && (
                    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Editing Report</p>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Top 3 Performers</label>
                        {[0,1,2].map(i => (
                          <input key={i} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1" placeholder={`Player ${i+1}`}
                            value={editFields.top3[i] || ''} onChange={e => { const t=[...editFields.top3]; t[i]=e.target.value; setEditFields({...editFields,top3:t}); }} />
                        ))}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Highlights</label>
                        <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px]"
                          value={editFields.highlights} onChange={e => setEditFields({...editFields,highlights:e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Missed Catches</label>
                        <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[48px]"
                          value={editFields.missedCatches} onChange={e => setEditFields({...editFields,missedCatches:e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Missed Run-Outs</label>
                        <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[48px]"
                          value={editFields.missedRunOuts} onChange={e => setEditFields({...editFields,missedRunOuts:e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Great Catches / Run-Outs</label>
                        <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[48px]"
                          value={editFields.greatCatchesRunOuts} onChange={e => setEditFields({...editFields,greatCatchesRunOuts:e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Sportsmanship</label>
                        <textarea className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[48px]"
                          value={editFields.sportsmanship} onChange={e => setEditFields({...editFields,sportsmanship:e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-amber-600">Edit Note (visible to selector)</label>
                        <input className="w-full h-9 rounded-md border border-amber-300 bg-background px-3 text-sm"
                          placeholder="Reason for edit..." value={editFields.editedNote}
                          onChange={e => setEditFields({...editFields,editedNote:e.target.value})} />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" disabled={isSavingEdit} onClick={() => handleAdminEdit(report)}>
                          {isSavingEdit ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                          Save & Lock
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingReportId(null); setEditFields(null); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Edit button — certifiers only, uncertified reports */}
                  {canCertify && !report.isCertified && editingReportId !== report.id && (
                    <Button size="sm" variant="outline" className="w-full sm:w-auto"
                      onClick={() => {
                        setEditingReportId(report.id);
                        setEditFields({
                          top3: [...(report.top3Players || []), '', '', ''].slice(0, 3),
                          highlights: report.highlights || '',
                          missedCatches: report.missedCatches || '',
                          missedRunOuts: report.missedRunOuts || '',
                          greatCatchesRunOuts: report.greatCatchesRunOuts || '',
                          sportsmanship: report.sportsmanship || '',
                          editedNote: '',
                        });
                      }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Report
                    </Button>
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
