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
  type ParsedMatchReport,
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

  // Read pre-filled import data from sessionStorage (set by scorecard card/list import)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = sessionStorage.getItem(`import_report_${scorecardId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.highlights) setHighlights(parsed.highlights);
        if (parsed.missedCatches) setMissedCatches(parsed.missedCatches);
        if (parsed.missedRunOuts) setMissedRunOuts(parsed.missedRunOuts);
        if (parsed.greatCatchesRunOuts) setGreatCatchesRunOuts(parsed.greatCatchesRunOuts);
        if (parsed.sportsmanship) setSportsmanship(parsed.sportsmanship);
        sessionStorage.removeItem(`import_report_${scorecardId}`);
        toast({ title: 'Report imported ✓', description: 'Fields pre-filled — review and edit before submitting.' });
      } catch {}
    }
  }, [scorecardId]);
  const [isImporting, setIsImporting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<ParsedMatchReport | null>(null);
  const [analysisDeltas, setAnalysisDeltas] = useState<(MatchReportDelta & { id?: string })[]>([]);
  const [deltaAccepted, setDeltaAccepted] = useState<Map<number, boolean | null>>(new Map());
  const [isSavingDeltas, setIsSavingDeltas] = useState(false);
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

            {/* ── Import section — prominent, at top of form ── */}
            <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-primary">Import from photo or Word doc</p>
                  <p className="text-xs text-muted-foreground">Upload a handwritten or typed report — fields will be auto-filled below</p>
                </div>
              </div>
              <div className="flex gap-3 flex-wrap">
                <label className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 bg-background border border-primary/30 rounded-lg text-sm font-medium cursor-pointer hover:bg-primary/5 transition-colors">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Photo / Scan (JPG, PNG)
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setIsImporting(true); setImportPreview(null);
                      const reader = new FileReader();
                      reader.onload = async ev => {
                        const base64 = (ev.target?.result as string).split(',')[1];
                        const res = await parseMatchReportImageAction(base64, file.type as any, allPlayers.map(p => p.name));
                        if (res.success && res.parsed) {
                          setImportPreview(res.parsed);
                          // Auto-fill fields immediately
                          if (res.parsed.highlights) setHighlights(res.parsed.highlights);
                          if (res.parsed.missedCatches) setMissedCatches(res.parsed.missedCatches);
                          if (res.parsed.missedRunOuts) setMissedRunOuts(res.parsed.missedRunOuts);
                          if (res.parsed.greatCatchesRunOuts) setGreatCatchesRunOuts(res.parsed.greatCatchesRunOuts);
                          if (res.parsed.sportsmanship) setSportsmanship(res.parsed.sportsmanship);
                          toast({ title: 'Report imported ✓', description: 'Fields filled — review and edit before submitting.' });
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
                      setIsImporting(true); setImportPreview(null);
                      const reader = new FileReader();
                      reader.onload = async ev => {
                        try {
                          let mammoth: any;
                          try { mammoth = await import('mammoth'); }
                          catch {
                            await new Promise<void>((res, rej) => {
                              const s = document.createElement('script');
                              s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
                              s.onload = () => res(); s.onerror = rej;
                              document.head.appendChild(s);
                            });
                            mammoth = (window as any).mammoth;
                          }
                          const result = await mammoth.extractRawText({ arrayBuffer: ev.target?.result as ArrayBuffer });
                          const res = await parseMatchReportDocxAction(result.value, allPlayers.map(p => p.name));
                          if (res.success && res.parsed) {
                            setImportPreview(res.parsed);
                            if (res.parsed.highlights) setHighlights(res.parsed.highlights);
                            if (res.parsed.missedCatches) setMissedCatches(res.parsed.missedCatches);
                            if (res.parsed.missedRunOuts) setMissedRunOuts(res.parsed.missedRunOuts);
                            if (res.parsed.greatCatchesRunOuts) setGreatCatchesRunOuts(res.parsed.greatCatchesRunOuts);
                            if (res.parsed.sportsmanship) setSportsmanship(res.parsed.sportsmanship);
                            toast({ title: 'Report imported ✓', description: 'Fields filled — review and edit before submitting.' });
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
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Scanning report — please wait...
                </div>
              )}
              {importPreview && !isImporting && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Fields filled from imported report. Review and edit below before submitting.
                  <button onClick={() => setImportPreview(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
                </div>
              )}
            </div>

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