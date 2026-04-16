'use client';

/**
 * FILE: src/app/selector/page.tsx
 *
 * Mobile dashboard for selector-role users who log in directly on their phone.
 * Shows their assigned games (with Rate Players link) and scorecards
 * (with Match Report link) — all linking to the mobile-optimised pages.
 *
 * Also accessible from desktop — links are mobile-aware but the page itself
 * is readable on any screen size.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { getGamesForUserViewAction } from '@/lib/actions/game-actions';
import { getScorecardsForOrgAction } from '@/lib/actions/scorecard-actions';
import type { Game, MatchScorecard } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Edit3, FileText, CalendarDays, MapPin,
  CheckCircle, AlertCircle, LogOut, ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

export default function SelectorDashboard() {
  const { currentUser, userProfile, activeOrganizationId, logout, isAuthLoading } = useAuth();
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [scorecards, setScorecards] = useState<MatchScorecard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  // Redirect non-selectors away
  useEffect(() => {
    if (isAuthLoading) return;
    if (!currentUser) { router.push('/login'); return; }
    const isSelector = userProfile?.roles?.includes('selector') ||
      userProfile?.roles?.includes('Series Admin') ||
      userProfile?.roles?.includes('Organization Admin') ||
      userProfile?.roles?.includes('admin');
    if (!isSelector) router.push('/');
  }, [currentUser, userProfile, isAuthLoading, router]);

  useEffect(() => {
    if (!currentUser || !userProfile) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [gamesResult, scorecardsResult] = await Promise.all([
          getGamesForUserViewAction(userProfile, activeOrganizationId),
          activeOrganizationId
            ? getScorecardsForOrgAction(activeOrganizationId)
            : Promise.resolve({ success: true, scorecards: [] }),
        ]);

        // Only show games this selector is assigned to, not finalized, not future
        const assignedGames = (gamesResult || []).filter(g =>
          g.selectorUserIds?.includes(currentUser.uid) &&
          !g.ratingsFinalized &&
          startOfDay(parseISO(g.date)) <= startOfDay(new Date())
        );
        // Sort: pending certification first
        assignedGames.sort((a, b) => {
          const aPending = isCertPending(a, currentUser.uid);
          const bPending = isCertPending(b, currentUser.uid);
          if (aPending && !bPending) return -1;
          if (!aPending && bPending) return 1;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        setGames(assignedGames);

        if (scorecardsResult.success) {
          // Only show scorecards linked to this selector's assigned games
          const assignedGameIds = new Set(assignedGames.map(g => g.id));
          const linked = (scorecardsResult.scorecards || []).filter(sc =>
            sc.linkedGameId && assignedGameIds.has(sc.linkedGameId)
          );
          // Also include scorecards whose team+date matches an assigned game
          // (for scorecards imported before linkedGameId was set)
          const linkedIds = new Set(linked.map(sc => sc.id));
          const byTeamDate = (scorecardsResult.scorecards || []).filter(sc => {
            if (linkedIds.has(sc.id)) return false;
            return assignedGames.some(g =>
              g.date?.slice(0, 10) === sc.date?.slice(0, 10) &&
              ((g.team1 === sc.team1 && g.team2 === sc.team2) ||
               (g.team1 === sc.team2 && g.team2 === sc.team1))
            );
          });
          const all = [...linked, ...byTeamDate]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setScorecards(all);
        }
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
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const displayName = userProfile?.displayName || currentUser?.email || 'Selector';
  const rateHref = (gameId: string) =>
    isMobile && currentUser
      ? `/rate/${gameId}?uid=${currentUser.uid}`
      : `/games/${gameId}/rate-enhanced?from=game-list`;
  const reportHref = (scorecardId: string) =>
    isMobile && currentUser
      ? `/match-report/${scorecardId}?uid=${currentUser.uid}`
      : `/scorecards/${scorecardId}`;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold">🏏 Cricket IQ</h1>
            <p className="text-xs opacity-75 mt-0.5">Welcome, {displayName}</p>
          </div>
          <button
            onClick={() => logout().then(() => router.push('/login'))}
            className="flex items-center gap-1.5 text-xs opacity-80 hover:opacity-100 transition-opacity"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6">

        {/* ── Assigned Games ── */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Edit3 className="h-4 w-4" /> My Assigned Games
          </h2>

          {games.length === 0 ? (
            <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground text-sm">
              No pending games assigned to you.
            </div>
          ) : (
            <div className="space-y-2">
              {games.map(game => {
                const pending = isCertPending(game, currentUser!.uid);
                return (
                  <div key={game.id} className={cn(
                    'bg-card border rounded-xl p-4 flex items-center gap-3',
                    pending ? 'border-amber-300 bg-amber-50/40' : ''
                  )}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {game.team1} vs {game.team2}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {format(parseISO(game.date), 'PP')}
                        </span>
                        {game.venue && (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{game.venue}</span>
                          </span>
                        )}
                      </div>
                      {pending ? (
                        <Badge variant="destructive" className="mt-1.5 text-xs gap-1 h-5">
                          <AlertCircle className="h-3 w-3" /> Cert. pending
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="mt-1.5 text-xs gap-1 h-5">
                          <CheckCircle className="h-3 w-3 text-green-500" /> Certified
                        </Badge>
                      )}
                    </div>
                    <Link href={rateHref(game.id)}>
                      <Button size="sm" className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-3 text-xs">
                        <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Rate
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Recent Scorecards ── */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Match Reports
          </h2>

          {scorecards.length === 0 ? (
            <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground text-sm">
              No scorecards found for your assigned games.
            </div>
          ) : (
            <div className="space-y-2">
              {scorecards.map(sc => (
                <div key={sc.id} className="bg-card border rounded-xl p-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{sc.team1} vs {sc.team2}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {sc.date ? (() => { try { return format(parseISO(sc.date), 'PP'); } catch { return sc.date; } })() : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {sc.innings.map((inn, i) => (
                        <Badge key={i} variant="secondary" className="text-xs h-4 px-1.5">
                          {inn.battingTeam}: {inn.totalRuns}/{inn.wickets}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Link href={reportHref(sc.id)}>
                    <Button size="sm" className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-3 text-xs">
                      <FileText className="h-3.5 w-3.5 mr-1.5" /> Report
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Full app link ── */}
        <div className="pb-4">
          <Link href="/games" className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            Go to full app <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
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
