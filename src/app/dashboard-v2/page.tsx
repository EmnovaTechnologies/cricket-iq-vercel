'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Users, Gamepad2, Target, Layers, Shield, MapPinned, Loader2, LogOut,
  Hourglass, FileText, ClipboardCheck, AlertCircle, CheckCircle,
  PlusCircle, Upload, Building, UserCog, BarChart3, ArrowRight,
  CalendarDays, Table, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import React, { useState, useEffect, useCallback } from 'react';
import { getAllOrganizationsFromDB, getAllUsersFromDB, getUsersForOrgAdminViewFromDB as getUsersForOrgFromDB, getAllPlayersFromDB, getAllTeamsFromDB, getAllSeriesFromDB, getAllGamesFromDB } from '@/lib/db';
import { getScorecardsForOrgAction } from '@/lib/actions/scorecard-actions';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuickLink {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission?: string;
}

interface PendingAction {
  label: string;
  href: string;
  variant: 'warning' | 'info' | 'success' | 'default';
}

interface StatCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  href?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const badgeClass: Record<string, string> = {
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
  success: 'bg-green-50 text-green-700 border border-green-200',
  default: 'bg-muted text-muted-foreground border border-border',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatGrid({ stats }: { stats: StatCard[] }) {
  if (!stats.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map(s => (
        <div key={s.label} className={`bg-muted/50 rounded-lg p-3 ${s.href ? 'cursor-pointer hover:bg-muted transition-colors' : ''}`}
          onClick={() => s.href && window.location.assign(s.href)}>
          <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">{s.icon}<span className="text-xs">{s.label}</span></div>
          <div className="text-2xl font-semibold text-primary">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function PendingActions({ actions }: { actions: PendingAction[] }) {
  if (!actions.length) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
      <CheckCircle className="h-4 w-4 text-green-500" /> All caught up — no pending actions.
    </div>
  );
  return (
    <div className="space-y-2">
      {actions.map(a => (
        <Link key={a.label} href={a.href} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 transition-colors group">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm">{a.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass[a.variant]}`}>
              {a.variant === 'warning' ? 'Needs action' : a.variant === 'info' ? 'Review' : a.variant === 'success' ? 'Done' : 'FYI'}
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function QuickActions({ links }: { links: QuickLink[] }) {
  if (!links.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {links.map(l => (
        <Link key={l.href} href={l.href}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-card hover:bg-muted/40 transition-colors text-sm font-medium">
          <span className="text-primary shrink-0">{l.icon}</span>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Role-based content builders ─────────────────────────────────────────────

interface Counts {
  orgs: number | null;
  users: number | null;
  players: number | null;
  teams: number | null;
  series: number | null;
  games: number | null;
  scorecards: number | null;
}

function useRoleDashboard(counts: Counts) {
  const { userProfile, activeOrganizationDetails, effectivePermissions, currentUser } = useAuth();
  const roles = userProfile?.roles || [];
  const orgName = activeOrganizationDetails?.name || 'your organization';
  const selectionModel = activeOrganizationDetails?.selectionModel;

  const isSuperAdmin = roles.includes('admin');
  const isOrgAdmin = roles.includes('Organization Admin');
  const isSeriesAdmin = roles.includes('Series Admin');
  const isTeamManager = roles.includes('Team Manager');
  const isSelector = roles.includes('selector');
  const isPlayer = roles.includes('Player');

  // ── System Admin ────────────────────────────────────────────────────────────
  if (isSuperAdmin) {
    return {
      greeting: `System Admin`,
      subtitle: 'Full access across all organizations',
      stats: [
        { label: 'Organizations', value: counts.orgs === null ? '…' : counts.orgs.toString(), icon: <Building className="h-3.5 w-3.5" />, href: '/admin/organizations' },
        { label: 'Users', value: counts.users === null ? '…' : counts.users.toString(), icon: <Users className="h-3.5 w-3.5" />, href: '/admin/users' },
        { label: 'Players', value: counts.players === null ? '…' : counts.players.toString(), icon: <Users className="h-3.5 w-3.5" />, href: '/players' },
        { label: 'Series', value: counts.series === null ? '…' : counts.series.toString(), icon: <Layers className="h-3.5 w-3.5" />, href: '/series' },
        { label: 'Teams', value: counts.teams === null ? '…' : counts.teams.toString(), icon: <Shield className="h-3.5 w-3.5" />, href: '/teams' },
        { label: 'Games', value: counts.games === null ? '…' : counts.games.toString(), icon: <Gamepad2 className="h-3.5 w-3.5" />, href: '/games' },
        { label: 'Scorecards', value: counts.scorecards === null ? '…' : counts.scorecards.toString(), icon: <Table className="h-3.5 w-3.5" />, href: '/scorecards' },
      ] as StatCard[],
      pendingActions: [
        { label: 'Review users without assigned roles', href: '/admin/users?role=unassigned', variant: 'warning' as const },
        { label: 'Check organizations for inactive status', href: '/admin/organizations?status=inactive', variant: 'info' as const },
      ],
      quickLinks: [
        { href: '/admin/organizations/add', label: 'Add org', icon: <PlusCircle className="h-4 w-4" /> },
        { href: '/admin/users', label: 'Manage users', icon: <UserCog className="h-4 w-4" /> },
        { href: '/series/add', label: 'Add series', icon: <PlusCircle className="h-4 w-4" /> },
        { href: '/players/import', label: 'Import players', icon: <Upload className="h-4 w-4" /> },
        { href: '/scorecards/import', label: 'Import scorecard', icon: <Upload className="h-4 w-4" /> },
        { href: '/games', label: 'Manage games', icon: <Gamepad2 className="h-4 w-4" /> },
        { href: '/team-composition', label: 'AI team select', icon: <Target className="h-4 w-4" /> },
        { href: '/admin/organizations', label: 'Organizations', icon: <Building className="h-4 w-4" /> },
      ] as QuickLink[],
      navSections: [
        { title: 'Player & team management', links: ['/players', '/teams', '/venues'] },
        { title: 'Competition', links: ['/series', '/games', '/scorecards'] },
        { title: 'Administration', links: ['/admin/organizations', '/admin/users'] },
      ],
    };
  }

  // ── Organization Admin ───────────────────────────────────────────────────────
  if (isOrgAdmin) {
    return {
      greeting: `Organization Admin`,
      subtitle: orgName,
      stats: [
        { label: 'Players', value: counts.players === null ? '…' : counts.players.toString(), icon: <Users className="h-3.5 w-3.5" />, href: '/players' },
        { label: 'Series', value: counts.series === null ? '…' : counts.series.toString(), icon: <Layers className="h-3.5 w-3.5" />, href: '/series' },
        { label: 'Teams', value: counts.teams === null ? '…' : counts.teams.toString(), icon: <Shield className="h-3.5 w-3.5" />, href: '/teams' },
        { label: 'Games', value: counts.games === null ? '…' : counts.games.toString(), icon: <Gamepad2 className="h-3.5 w-3.5" />, href: '/games' },
        { label: 'Scorecards', value: counts.scorecards === null ? '…' : counts.scorecards.toString(), icon: <Table className="h-3.5 w-3.5" />, href: '/scorecards' },
        { label: 'Users', value: counts.users === null ? '…' : counts.users.toString(), icon: <UserCog className="h-3.5 w-3.5" />, href: '/admin/users' },
      ] as StatCard[],
      pendingActions: [
        { label: 'Games with unfinalized ratings', href: '/games', variant: 'warning' as const },
        { label: 'Scorecards missing for played games', href: '/scorecards', variant: 'warning' as const },
        { label: 'Players not assigned to a team', href: '/players', variant: 'info' as const },
        { label: 'Selectors not assigned to games', href: '/games', variant: 'info' as const },
      ],
      quickLinks: [
        { href: '/players/import', label: 'Import players', icon: <Upload className="h-4 w-4" /> },
        { href: '/scorecards/import', label: 'Import scorecard', icon: <Upload className="h-4 w-4" /> },
        { href: '/admin/users', label: 'Manage users', icon: <UserCog className="h-4 w-4" /> },
        { href: '/games', label: 'Manage games', icon: <Gamepad2 className="h-4 w-4" /> },
        { href: '/series', label: 'View series', icon: <Layers className="h-4 w-4" /> },
        { href: '/team-composition', label: 'AI team select', icon: <Target className="h-4 w-4" /> },
        { href: '/players/add', label: 'Add player', icon: <PlusCircle className="h-4 w-4" /> },
        { href: '/venues', label: 'Manage venues', icon: <MapPinned className="h-4 w-4" /> },
      ] as QuickLink[],
      navSections: [],
    };
  }

  // ── Series Admin ─────────────────────────────────────────────────────────────
  if (isSeriesAdmin) {
    const assignedCount = userProfile?.assignedSeriesIds?.length || 0;
    return {
      greeting: `Series Admin`,
      subtitle: orgName,
      stats: [
        { label: 'Assigned series', value: assignedCount.toString(), icon: <Layers className="h-3.5 w-3.5" />, href: '/series' },
        { label: 'Games', value: counts.games === null ? '…' : counts.games.toString(), icon: <Gamepad2 className="h-3.5 w-3.5" />, href: '/games' },
        { label: 'Scorecards', value: counts.scorecards === null ? '…' : counts.scorecards.toString(), icon: <Table className="h-3.5 w-3.5" />, href: '/scorecards' },
        { label: 'Players', value: counts.players === null ? '…' : counts.players.toString(), icon: <Users className="h-3.5 w-3.5" />, href: '/players' },
      ] as StatCard[],
      pendingActions: [
        { label: 'Games pending selector certification', href: '/games', variant: 'warning' as const },
        { label: 'Missing scorecards for your series', href: '/scorecards', variant: 'warning' as const },
        { label: 'Games ready to finalize', href: '/games', variant: 'info' as const },
      ],
      quickLinks: [
        { href: '/scorecards/import', label: 'Import scorecard', icon: <Upload className="h-4 w-4" /> },
        { href: '/games', label: 'Manage games', icon: <Gamepad2 className="h-4 w-4" /> },
        { href: '/series', label: 'Your series', icon: <Layers className="h-4 w-4" /> },
        { href: '/scorecards', label: 'Scorecards', icon: <Table className="h-4 w-4" /> },
        { href: '/players', label: 'Players', icon: <Users className="h-4 w-4" /> },
        { href: '/team-composition', label: 'AI team select', icon: <Target className="h-4 w-4" /> },
      ] as QuickLink[],
      navSections: [],
    };
  }

  // ── Team Manager ─────────────────────────────────────────────────────────────
  if (isTeamManager) {
    const teamCount = userProfile?.assignedTeamIds?.length || 0;
    return {
      greeting: `Team Manager`,
      subtitle: orgName,
      stats: [
        { label: 'My teams', value: teamCount.toString(), icon: <Shield className="h-3.5 w-3.5" />, href: '/teams' },
        { label: 'Players', value: counts.players === null ? '…' : counts.players.toString(), icon: <Users className="h-3.5 w-3.5" />, href: '/players' },
        { label: 'Games', value: counts.games === null ? '…' : counts.games.toString(), icon: <Gamepad2 className="h-3.5 w-3.5" />, href: '/games' },
        { label: 'Series', value: counts.series === null ? '…' : counts.series.toString(), icon: <Layers className="h-3.5 w-3.5" />, href: '/series' },
      ] as StatCard[],
      pendingActions: [
        { label: 'Review team rosters for upcoming games', href: '/teams', variant: 'info' as const },
        { label: 'Check player eligibility for active series', href: '/players', variant: 'info' as const },
      ],
      quickLinks: [
        { href: '/teams', label: 'My teams', icon: <Shield className="h-4 w-4" /> },
        { href: '/players', label: 'Players', icon: <Users className="h-4 w-4" /> },
        { href: '/games', label: 'Games', icon: <Gamepad2 className="h-4 w-4" /> },
        { href: '/series', label: 'Series', icon: <Layers className="h-4 w-4" /> },
        { href: '/team-composition', label: 'AI team select', icon: <Target className="h-4 w-4" /> },
        { href: '/players/add', label: 'Add player', icon: <PlusCircle className="h-4 w-4" /> },
      ] as QuickLink[],
      navSections: [],
    };
  }

  // ── Selector ──────────────────────────────────────────────────────────────────
  if (isSelector) {
    const assignedGames = userProfile?.assignedGameIds?.length || 0;
    const isPerformanceModel = selectionModel === 'performance';
    return {
      greeting: `Selector`,
      subtitle: orgName,
      stats: [
        { label: 'Assigned games', value: assignedGames.toString(), icon: <Gamepad2 className="h-3.5 w-3.5" />, href: '/games' },
        { label: 'Scorecards', value: counts.scorecards === null ? '…' : counts.scorecards.toString(), icon: <Table className="h-3.5 w-3.5" />, href: '/scorecards' },
        { label: 'Selection model', value: selectionModel || '—', icon: <BarChart3 className="h-3.5 w-3.5" /> },
      ] as StatCard[],
      pendingActions: [
        ...(isPerformanceModel ? [] : [
          { label: 'Games awaiting your rating certification', href: '/games', variant: 'warning' as const },
        ]),
        { label: 'Scorecards assigned to you for match reports', href: '/scorecards', variant: 'warning' as const },
        { label: 'View XI Selector recommendations', href: '/xi-selector', variant: 'info' as const },
      ],
      quickLinks: [
        { href: '/scorecards', label: 'My scorecards', icon: <Table className="h-4 w-4" /> },
        { href: '/games', label: 'My games', icon: <Gamepad2 className="h-4 w-4" /> },
        { href: '/xi-selector', label: 'XI Selector', icon: <Target className="h-4 w-4" /> },
        { href: '/players', label: 'Players', icon: <Users className="h-4 w-4" /> },
      ] as QuickLink[],
      navSections: [],
    };
  }

  // ── Player ────────────────────────────────────────────────────────────────────
  if (isPlayer) {
    return {
      greeting: `Player`,
      subtitle: orgName,
      stats: [] as StatCard[],
      pendingActions: [] as PendingAction[],
      quickLinks: [
        { href: '/players', label: 'Player profiles', icon: <Users className="h-4 w-4" /> },
        { href: '/series', label: 'Series', icon: <Layers className="h-4 w-4" /> },
        { href: '/games', label: 'Games', icon: <Gamepad2 className="h-4 w-4" /> },
      ] as QuickLink[],
      navSections: [],
    };
  }

  // ── Fallback ──────────────────────────────────────────────────────────────────
  return {
    greeting: 'Welcome',
    subtitle: orgName,
    stats: [] as StatCard[],
    pendingActions: [] as PendingAction[],
    quickLinks: [] as QuickLink[],
    navSections: [],
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const {
    activeOrganizationDetails,
    isAuthLoading,
    userProfile,
    currentUser,
    logout,
    isLoggingOut,
  } = useAuth();

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!currentUser && !isAuthLoading) router.push('/login');
  }, [currentUser, isAuthLoading, router]);

  const [counts, setCounts] = useState<Counts>({
    orgs: null, users: null, players: null,
    teams: null, series: null, games: null, scorecards: null,
  });
  const [countsLoading, setCountsLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    if (!activeOrganizationDetails) return;
    setCountsLoading(true);
    try {
      const isSuperAdminUser = userProfile?.roles.includes('admin');
      const orgId = activeOrganizationDetails.id;
      const [orgsData, usersData, playersData, teamsData, seriesData, gamesData, scorecardsData] = await Promise.all([
        isSuperAdminUser ? getAllOrganizationsFromDB() : Promise.resolve([]),
        isSuperAdminUser ? getAllUsersFromDB() : getUsersForOrgFromDB(orgId),
        getAllPlayersFromDB(orgId),
        getAllTeamsFromDB(orgId),
        getAllSeriesFromDB('active', orgId),
        getAllGamesFromDB('all', orgId),
        getScorecardsForOrgAction(orgId),
      ]);
      setCounts({
        orgs: isSuperAdminUser ? orgsData.length : null,
        users: usersData.filter((u: any) => !u.roles?.includes('admin')).length,
        players: playersData.length,
        teams: teamsData.length,
        series: seriesData.length,
        games: gamesData.length,
        scorecards: scorecardsData.success ? (scorecardsData.scorecards?.length ?? 0) : 0,
      });
    } catch (e) {
      console.error('[Dashboard] counts fetch failed:', e);
    }
    setCountsLoading(false);
  }, [activeOrganizationDetails, userProfile]);

  useEffect(() => { if (mounted && activeOrganizationDetails) fetchCounts(); }, [mounted, activeOrganizationDetails]);

  const dashboard = useRoleDashboard(counts);
  const today = mounted ? format(new Date(), 'EEEE, MMM d') : '';

  if (isLoggingOut) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Logging out...</p>
      </div>
    );
  }

  if (isAuthLoading || !mounted) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-12rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // Unassigned role
  if (userProfile && userProfile.roles.length === 1 && userProfile.roles[0] === 'unassigned') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-12rem)] text-center">
        <Hourglass className="h-16 w-16 text-primary mb-4" />
        <h1 className="text-2xl font-semibold text-primary mb-2">Account Pending Role Assignment</h1>
        <p className="text-muted-foreground mb-6 max-w-md">
          Welcome, {userProfile.displayName || userProfile.email}! An administrator needs to assign you a role before you can access features.
        </p>
        <Button variant="outline" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    );
  }

  const displayName = userProfile?.displayName || userProfile?.email?.split('@')[0] || 'there';

  return (
    <div className="space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 p-5 rounded-xl bg-muted/40 border">
        <div>
          <h1 className="text-2xl font-headline font-semibold text-primary">
            Welcome back, {displayName}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm text-muted-foreground">{dashboard.subtitle}</span>
            {dashboard.greeting !== 'Welcome' && (
              <>
                <span className="text-muted-foreground">·</span>
                <Badge variant="secondary" className="text-xs">{dashboard.greeting}</Badge>
              </>
            )}
            {today && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {today}
                </span>
              </>
            )}
          </div>
          {activeOrganizationDetails?.selectionModel && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-xs text-muted-foreground">Selection model:</span>
              <span className="text-xs font-medium capitalize text-foreground">{activeOrganizationDetails.selectionModel}</span>
              {activeOrganizationDetails.ratingScope && (
                <>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground capitalize">{activeOrganizationDetails.ratingScope.replace(/_/g, ' ')}</span>
                </>
              )}
            </div>
          )}
        </div>
        <button
          onClick={fetchCounts}
          disabled={countsLoading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
          title="Refresh counts"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${countsLoading ? 'animate-spin' : ''}`} />
          {countsLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Stats ── */}
      {dashboard.stats.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">At a glance</h2>
          <StatGrid stats={dashboard.stats} />
        </section>
      )}

      {/* ── Pending actions + Quick actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Pending actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PendingActions actions={dashboard.pendingActions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-primary" /> Quick actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuickActions links={dashboard.quickLinks} />
          </CardContent>
        </Card>
      </div>

      {/* ── No org selected ── */}
      {!activeOrganizationDetails && (
        <Alert variant="default" className="border-primary/50">
          <Hourglass className="h-5 w-5 text-primary" />
          <AlertTitle>No organization selected</AlertTitle>
          <AlertDescription>
            Select an organization from the navbar to see org-specific data and actions.
          </AlertDescription>
        </Alert>
      )}

    </div>
  );
}
