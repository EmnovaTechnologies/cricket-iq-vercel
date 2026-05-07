'use client';

/**
 * FILE: src/app/selector/page.tsx
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { getGamesForUserViewAction } from '@/lib/actions/game-actions';
import { getScorecardsForSelectorAction } from '@/lib/actions/scorecard-actions';
import { getCampsForOrgAction, getCampPlayersAction, getMyCampAssessmentsAction } from '@/lib/actions/camp-actions';
import { getUserReportsForGameAction } from '@/lib/actions/match-report-actions';
import type { Game, MatchScorecard, SelectionCamp } from '@/types';
import { Loader2, ChevronRight, CheckCircle, Clock, LogOut } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO, startOfDay } from 'date-fns';

function safeFormatDate(date: string): string {
  if (!date) return '';
  try { return format(parseISO(date.replace(/-/g, '/')), 'MMM d'); } catch { return date; }
}

function isCertPending(game: Game, uid: string): boolean {
  if (!game.selectorUserIds?.includes(uid)) return false;
  if (game.ratingsFinalized) return false;
  const cert = game.selectorCertifications?.[uid];
  if (!cert || cert.status === 'pending') return true;
  if (cert.status === 'certified' && game.ratingsLastModifiedAt) {
    return new Date(cert.certifiedAt) < new Date(game.ratingsLastModifiedAt);
  }
  return false;
}

function PendingDot() {
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF9F27', flexShrink: 0 }} />;
}

function DoneBadge() {
  return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">Done</span>;
}

function ActionCard({ iconBg, icon, title, meta, isPending, onClick }: {
  iconBg: string; icon: React.ReactNode; title: string; meta: string;
  isPending: boolean; onClick: () => void;
}) {
  return (
    <div onClick={onClick} className="flex items-center gap-3 p-3 bg-card border rounded-xl cursor-pointer active:bg-muted transition-colors">
      <div style={{ width: 36, height: 36, borderRadius: 10, background: iconBg, flexShrink: 0 }} className="flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{meta}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isPending ? <PendingDot /> : <DoneBadge />}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function SectionHeader({ title, moreCount }: { title: string; moreCount: number }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
      {moreCount > 0 && <span className="text-xs text-muted-foreground">+{moreCount} more</span>}
    </div>
  );
}

export default function SelectorDashboard() {
  const { currentUser, userProfile, activeOrganizationId, activeOrganizationDetails, logout, isAuthLoading } = useAuth();
  const router = useRouter();

  const selectionModel = activeOrganizationDetails?.selectionModel || 'hybrid';
  const showGames = selectionModel === 'rating' || selectionModel === 'hybrid';
  const showScorecards = selectionModel === 'performance' || selectionModel === 'hybrid';

  const [games, setGames] = useState<(Game & { isPending: boolean })[]>([]);
  const [scorecards, setScorecards] = useState<(MatchScorecard & { hasReport: boolean })[]>([]);
  const [camps, setCamps] = useState<(SelectionCamp & { pendingCount: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!currentUser) { router.push('/login'); return; }
    const allowed = userProfile?.roles?.some(r => ['selector','Series Admin','Organization Admin','admin'].includes(r));
    if (!allowed) router.push('/');
  }, [currentUser, userProfile, isAuthLoading, router]);

  useEffect(() => {
    if (!currentUser || !userProfile || !activeOrganizationId) return;
    setIsLoading(true);
    const load = async () => {
      try {
        const [gamesResult, scorecardsResult, campsResult] = await Promise.all([
          getGamesForUserViewAction(userProfile, activeOrganizationId),
          getScorecardsForSelectorAction(currentUser.uid, activeOrganizationId),
          getCampsForOrgAction(activeOrganizationId),
        ]);

        // Games
        const assignedGames = (gamesResult || [])
          .filter(g => g.selectorUserIds?.includes(currentUser.uid) && !g.ratingsFinalized &&
            g.date && startOfDay(parseISO(g.date)) <= startOfDay(new Date()))
          .map(g => ({ ...g, isPending: isCertPending(g, currentUser.uid) }))
          .sort((a, b) => (b.isPending ? 1 : 0) - (a.isPending ? 1 : 0));
        setGames(assignedGames);

        // Scorecards + report check
        const scList = scorecardsResult.success ? scorecardsResult.scorecards || [] : [];
        const reportChecks = await Promise.all(scList.map(async sc => {
          try {
            const reports = await getUserReportsForGameAction(sc.linkedGameId || sc.id, currentUser.uid);
            return { id: sc.id, hasReport: reports.length > 0 };
          } catch { return { id: sc.id, hasReport: false }; }
        }));
        const reportMap = new Map(reportChecks.map(r => [r.id, r.hasReport]));
        const scWithStatus = scList
          .map(sc => ({ ...sc, hasReport: reportMap.get(sc.id) || false }))
          .sort((a, b) => (a.hasReport ? 1 : 0) - (b.hasReport ? 1 : 0));
        setScorecards(scWithStatus);

        // Camps — filter to assigned, check real assessment counts
        const allCamps = campsResult.success ? campsResult.camps || [] : [];
        const filteredCamps = allCamps.filter(c =>
          (c.assignedSelectors || []).some((s: any) => s.uid === currentUser.uid) && c.status !== 'completed'
        );
        const campsWithCounts = await Promise.all(filteredCamps.map(async c => {
          try {
            const [playersRes, assessRes] = await Promise.all([
              getCampPlayersAction(c.id),
              getMyCampAssessmentsAction(c.id, currentUser.uid),
            ]);
            const totalPlayers = (playersRes.players || []).filter(p => p.status !== 'withdrawn').length;
            const assessedBibs = new Set((assessRes.assessments || []).map(a => a.bibNumber));
            const pendingCount = Math.max(0, totalPlayers - assessedBibs.size);
            return { ...c, pendingCount };
          } catch {
            return { ...c, pendingCount: 0 };
          }
        }));
        setCamps(campsWithCounts);

        const gPending = assignedGames.filter(g => g.isPending).length;
        const scPending = scWithStatus.filter(s => !s.hasReport).length;
        const cPending = campsWithCounts.filter(c => c.pendingCount > 0).length;
        setPendingTotal(gPending + scPending + cPending);
      } catch (e) {
        console.error('Selector dashboard load error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [currentUser, userProfile, activeOrganizationId]);

  if (isAuthLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const displayName = (userProfile?.displayName || currentUser?.email || 'Selector').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const allDone = pendingTotal === 0;
  const nextGame = games[0];
  const nextScorecard = scorecards[0];
  const nextCamp = camps[0];

  const rateHref = (gameId: string) =>
    isMobile && currentUser ? `/rate/${gameId}?uid=${currentUser.uid}` : `/games/${gameId}/rate-enhanced`;
  const reportHref = (id: string) => `/mobile/scorecard-report/${id}`;
  const campHref = (id: string) => `/rate-camp/${id}?from=selector`;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold">🏏 Cricket IQ</h1>
            <p className="text-xs opacity-75">{greeting}, {displayName}</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingTotal > 0 ? (
              <span className="flex items-center gap-1 text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
                <Clock className="h-3 w-3" /> {pendingTotal} pending
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-medium">
                <CheckCircle className="h-3 w-3" /> All done
              </span>
            )}
            <button onClick={() => logout().then(() => router.push('/login'))} className="opacity-75 hover:opacity-100">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5">

        {allDone && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            All ratings, reports and assessments are up to date.
          </div>
        )}

        {showGames && games.length > 0 && (
          <section>
            <SectionHeader title="Next game to rate" moreCount={games.length - 1} />
            {nextGame && (
              <ActionCard
                iconBg="#E6F1FB"
                icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="#185FA5" strokeWidth="1.3"/><path d="M5 8h2M6 7v2M10 8h2" stroke="#185FA5" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                title={`${nextGame.team1} vs ${nextGame.team2}`}
                meta={`${safeFormatDate(nextGame.date)}${nextGame.seriesName ? ` · ${nextGame.seriesName}` : ''}`}
                isPending={nextGame.isPending}
                onClick={() => router.push(rateHref(nextGame.id))}
              />
            )}
          </section>
        )}

        {showScorecards && scorecards.length > 0 && (
          <section>
            <SectionHeader title="Next match report" moreCount={scorecards.length - 1} />
            {nextScorecard && (
              <ActionCard
                iconBg="#E1F5EE"
                icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="#0F6E56" strokeWidth="1.3"/><path d="M5 5h6M5 8h4" stroke="#0F6E56" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                title={`${nextScorecard.team1} vs ${nextScorecard.team2}`}
                meta={`${safeFormatDate(nextScorecard.date)} · ${nextScorecard.hasReport ? 'Submitted' : 'Not submitted'}`}
                isPending={!nextScorecard.hasReport}
                onClick={() => router.push(reportHref(nextScorecard.id))}
              />
            )}
          </section>
        )}

        {camps.length > 0 && (
          <section>
            <SectionHeader title="Next camp assessment" moreCount={camps.length - 1} />
            {nextCamp && (
              <ActionCard
                iconBg="#FAEEDA"
                icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1l7 13H1L8 1z" stroke="#854F0B" strokeWidth="1.3" strokeLinejoin="round"/></svg>}
                title={nextCamp.name}
                meta={nextCamp.pendingCount > 0
                  ? `${nextCamp.pendingCount} player${nextCamp.pendingCount !== 1 ? 's' : ''} not assessed`
                  : 'All players assessed'}
                isPending={nextCamp.pendingCount > 0}
                onClick={() => router.push(campHref(nextCamp.id))}
              />
            )}
          </section>
        )}

        <div className="pt-2 border-t">
          <Link href="/" className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-2">
            Go to full app <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

      </div>
    </div>
  );
}
