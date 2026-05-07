'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCampsForOrgAction, getCampPlayersAction } from '@/lib/actions/camp-actions';
import { getSeriesByIdFromDB } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import type { SelectionCamp } from '@/types';
import {
  Loader2, ShieldAlert, PlusCircle, Trophy,
  Users, Target, CalendarDays, MapPin, Layers, LayoutGrid, List
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const statusColors: Record<SelectionCamp['status'], string> = {
  upcoming: 'bg-blue-100 text-blue-700 border-blue-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  completed: 'bg-muted text-muted-foreground border',
};

export default function CampsListPage() {
  const router = useRouter();
  const { activeOrganizationId, effectivePermissions, currentUser, userProfile } = useAuth();

  const [camps, setCamps] = useState<SelectionCamp[]>([]);
  const [seriesNames, setSeriesNames] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterSeries, setFilterSeries] = useState('all');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [playerCounts, setPlayerCounts] = useState<Map<string, { invited: number; selected: number }>>(new Map());

  const canManage = effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY];

  const isSelector = userProfile?.roles?.includes('selector') && !canManage;

  useEffect(() => {
    if (!activeOrganizationId) return;
    getCampsForOrgAction(activeOrganizationId).then(async res => {
      if (res.success && res.camps) {
        // For selectors, only show camps they are assigned to
        const visibleCamps = isSelector && currentUser
          ? res.camps.filter(c => (c.assignedSelectors || []).some((s: any) => s.uid === currentUser.uid))
          : res.camps;
        setCamps(visibleCamps);
        // Load series names
        const uniqueSeriesIds = [...new Set(res.camps.map(c => c.seriesId))];
        const nameMap = new Map<string, string>();
        await Promise.all(uniqueSeriesIds.map(async sid => {
          try {
            const s = await getSeriesByIdFromDB(sid);
            if (s) nameMap.set(sid, s.name);
          } catch {}
        }));
        setSeriesNames(nameMap);
        // Load player counts for each camp
        const countMap = new Map<string, { invited: number; selected: number }>();
        await Promise.all((res.camps || []).map(async c => {
          try {
            const pr = await getCampPlayersAction(c.id);
            if (pr.success && pr.players) {
              countMap.set(c.id, {
                invited: pr.players.filter(p => p.status !== 'withdrawn').length,
                selected: pr.players.filter(p => p.selectionStatus === 'selected').length,
              });
            }
          } catch {}
        }));
        setPlayerCounts(countMap);
      } else {
        setError(res.error || 'Could not load camps.');
      }
      setIsLoading(false);
    });
  }, [activeOrganizationId]);

  const years = [...new Set(camps.map(c => c.year?.toString()).filter(Boolean))].sort().reverse();

  const filtered = camps.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterYear !== 'all' && c.year?.toString() !== filterYear) return false;
    if (filterSeries !== 'all' && c.seriesId !== filterSeries) return false;
    return true;
  });

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_SERIES_DETAILS}
      FallbackComponent={
        <Alert variant="destructive" className="mt-8 max-w-2xl mx-auto">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view camps.</AlertDescription>
        </Alert>
      }
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
            <Trophy className="h-8 w-8" /> Selection Camps
          </h1>
          {canManage && (
            <Button asChild>
              <Link href="/camps/new">
                <PlusCircle className="mr-2 h-4 w-4" /> New Camp
              </Link>
            </Button>
          )}
        </div>

        {/* Filters — matches series page style */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-card shadow">
          <div className="flex-1 min-w-[130px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Year</label>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger><SelectValue placeholder="All Years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Series</label>
            <Select value={filterSeries} onValueChange={setFilterSeries}>
              <SelectTrigger><SelectValue placeholder="All Series" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Series</SelectItem>
                {camps.map(c => c.seriesId).filter((id, i, arr) => arr.indexOf(id) === i).map(sid => (
                  <SelectItem key={sid} value={sid}>{seriesNames.get(sid) || sid}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-sm font-medium text-muted-foreground mb-1">Filter by Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col items-end gap-1 justify-end">
            <span className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'camp' : 'camps'}</span>
            <div className="flex rounded-md border border-input overflow-hidden">
              <button onClick={() => setViewMode('cards')}
                className={`flex items-center px-3 py-2 text-sm transition-colors ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                title="Card view"><LayoutGrid className="h-4 w-4" /></button>
              <button onClick={() => setViewMode('list')}
                className={`flex items-center px-3 py-2 text-sm transition-colors border-l border-input ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                title="List view"><List className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center items-center min-h-[calc(100vh-16rem)]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Trophy className="h-14 w-14 mx-auto text-muted-foreground/20" />
            <p className="text-muted-foreground font-medium">
              {camps.length === 0 ? 'No selection camps yet.' : 'No camps match the selected filters.'}
            </p>
            {canManage && camps.length === 0 && (
              <Button asChild variant="outline">
                <Link href="/camps/new">
                  <PlusCircle className="mr-2 h-4 w-4" /> Create First Camp
                </Link>
              </Button>
            )}
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(camp => (
              <Card key={camp.id}
                className="hover:shadow-md transition-shadow cursor-pointer flex flex-col"
                onClick={() => router.push(`/camps/${camp.id}`)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-tight">{camp.name}</CardTitle>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize shrink-0 ${statusColors[camp.status]}`}>
                      {camp.status}
                    </span>
                  </div>
                  {seriesNames.get(camp.seriesId) && (
                    <CardDescription className="flex items-center gap-1 text-xs">
                      <Layers className="h-3 w-3" /> {seriesNames.get(camp.seriesId)}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0 flex-1 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {camp.startDate && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(parseISO(camp.startDate), 'PP')}
                        {camp.endDate !== camp.startDate && ` → ${format(parseISO(camp.endDate), 'PP')}`}
                      </span>
                    )}
                    {camp.venue && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {camp.venue}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" /> {playerCounts.get(camp.id)?.invited ?? 0}/{camp.quota} invited
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Target className="h-3 w-3" /> {playerCounts.get(camp.id)?.selected ?? 0}/{camp.selectionTarget} selected
                    </span>
                  </div>
                  <Button size="sm" className="w-full mt-auto"
                    onClick={e => { e.stopPropagation(); router.push(`/camps/${camp.id}`); }}>
                    Open Camp →
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card">
            {filtered.map((camp, idx) => (
              <div key={camp.id}
                className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer ${idx !== filtered.length - 1 ? 'border-b' : ''}`}
                onClick={() => router.push(`/camps/${camp.id}`)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-primary">{camp.name}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border capitalize ${statusColors[camp.status]}`}>
                      {camp.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {seriesNames.get(camp.seriesId) && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3" /> {seriesNames.get(camp.seriesId)}
                      </span>
                    )}
                    {camp.startDate && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(parseISO(camp.startDate), 'PP')}
                      </span>
                    )}
                    {camp.venue && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {camp.venue}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" /> {playerCounts.get(camp.id)?.invited ?? 0}/{camp.quota} invited
                      <Target className="h-3 w-3 ml-2" /> {playerCounts.get(camp.id)?.selected ?? 0}/{camp.selectionTarget} selected
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0"
                  onClick={e => { e.stopPropagation(); router.push(`/camps/${camp.id}`); }}>
                  Open →
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthProviderClientComponent>
  );
}
