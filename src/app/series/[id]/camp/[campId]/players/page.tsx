'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getCampByIdAction, getCampPlayersAction,
  invitePlayerToCampAction, removeCampPlayerAction, updateCampPlayerAction
} from '@/lib/actions/camp-actions';
import { getPlayersWithDetailsFromDB, getTeamByIdFromDB, getSeriesByIdFromDB } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import type { SelectionCamp, CampPlayer, PlayerWithRatings } from '@/types';
import { Loader2, ArrowLeft, UserPlus, X, Hash, Search, Users, ShieldAlert } from 'lucide-react';

export default function CampPlayersPage() {
  const params = useParams<{ id: string; campId: string }>();
  const { id: seriesId, campId } = params;
  const { currentUser, userProfile, activeOrganizationId, effectivePermissions } = useAuth();
  const canManage = !!(effectivePermissions[PERMISSIONS.SERIES_MANAGE_TEAMS_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ASSIGNED] ||
    effectivePermissions[PERMISSIONS.ORGANIZATIONS_EDIT_ANY]);
  const { toast } = useToast();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>([]);
  const [orgPlayers, setOrgPlayers] = useState<PlayerWithRatings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [seriesPlayerIds, setSeriesPlayerIds] = useState<Set<string>>(new Set());
  const [isSeriesScopingLoaded, setIsSeriesScopingLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [bibInput, setBibInput] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [editingBibId, setEditingBibId] = useState<string | null>(null);
  const [editBibValue, setEditBibValue] = useState('');

  useEffect(() => {
    if (!campId || !activeOrganizationId) return;
    Promise.all([
      getCampByIdAction(campId),
      getCampPlayersAction(campId),
      getPlayersWithDetailsFromDB(activeOrganizationId),
    ]).then(async ([campRes, playersRes, orgRes]) => {
      if (campRes.success) setCamp(campRes.camp!);
      if (playersRes.success) setCampPlayers(playersRes.players || []);
      setOrgPlayers(orgRes);
      // Scope to series teams only — use seriesId from URL params
      try {
        const seriesDoc = await getSeriesByIdFromDB(seriesId);
        if (seriesDoc?.participatingTeams?.length) {
          const teams = await Promise.all(
            seriesDoc.participatingTeams.map((tid: string) => getTeamByIdFromDB(tid))
          );
          const playerIds = new Set<string>();
          teams.forEach(t => (t?.playerIds || []).forEach((pid: string) => playerIds.add(pid)));
          setSeriesPlayerIds(playerIds);
          console.log('[CampPlayers] Series scoping loaded:', playerIds.size, 'players');
        } else {
          console.warn('[CampPlayers] Series has no participating teams');
        }
      } catch (e) {
        console.error('[CampPlayers] Could not scope to series:', e);
      } finally {
        setIsSeriesScopingLoaded(true);
      }
      setIsLoading(false);
    });
  }, [campId, activeOrganizationId]);

  const invitedPlayerIds = new Set(campPlayers.map(cp => cp.playerId));
  const usedBibs = new Set(campPlayers.map(cp => cp.bibNumber));

  // Suggest next available bib
  const nextBib = useMemo(() => {
    let n = 1;
    while (usedBibs.has(n)) n++;
    return n;
  }, [usedBibs]);

  const availablePlayers = useMemo(() =>
    orgPlayers.filter(p =>
      !invitedPlayerIds.has(p.id) &&
      // Scope to series players only
      (!isSeriesScopingLoaded || seriesPlayerIds.has(p.id)) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()))
    ),
    [orgPlayers, invitedPlayerIds, search, seriesPlayerIds, isSeriesScopingLoaded]
  );

  const handleInvite = async () => {
    if (!selectedPlayerId || !bibInput || !camp || !currentUser || !activeOrganizationId) return;
    const bib = parseInt(bibInput);
    if (isNaN(bib) || bib < 1) {
      toast({ title: 'Invalid bib number', variant: 'destructive' });
      return;
    }
    const player = orgPlayers.find(p => p.id === selectedPlayerId);
    if (!player) return;

    setIsInviting(true);
    const res = await invitePlayerToCampAction({
      campId,
      organizationId: activeOrganizationId,
      playerId: player.id,
      bibNumber: bib,
      playerName: player.name,
      playerPrimarySkill: player.primarySkill || '',
      playerBowlingStyle: (player as any).bowlingStyle,
      playerBattingOrder: (player as any).battingOrder,
      status: 'invited',
      invitedBy: currentUser.uid,
    });

    if (res.success) {
      const refreshed = await getCampPlayersAction(campId);
      if (refreshed.success) setCampPlayers(refreshed.players || []);
      setSelectedPlayerId('');
      setBibInput('');
      setSearch('');
      toast({ title: `${player.name} invited as Bib #${bib}` });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setIsInviting(false);
  };

  const handleRemove = async (campPlayerId: string, name: string) => {
    setRemovingId(campPlayerId);
    const res = await removeCampPlayerAction(campPlayerId);
    if (res.success) {
      setCampPlayers(prev => prev.filter(p => p.id !== campPlayerId));
      toast({ title: `${name} removed from camp` });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
    setRemovingId(null);
  };

  const handleBibEdit = async (campPlayerId: string) => {
    const bib = parseInt(editBibValue);
    if (isNaN(bib) || bib < 1) {
      toast({ title: 'Invalid bib number', variant: 'destructive' });
      return;
    }
    const res = await updateCampPlayerAction(campPlayerId, { bibNumber: bib });
    if (res.success) {
      setCampPlayers(prev => prev.map(p => p.id === campPlayerId ? { ...p, bibNumber: bib } : p));
      setEditingBibId(null);
      toast({ title: `Bib updated to #${bib}` });
    } else {
      toast({ title: 'Error', description: res.error, variant: 'destructive' });
    }
  };

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  if (!camp) return (
    <Alert variant="destructive">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle>Camp not found</AlertTitle>
    </Alert>
  );

  const sortedCampPlayers = [...campPlayers].sort((a, b) => a.bibNumber - b.bibNumber);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/series/${seriesId}/camp/${campId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Camp
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-3xl font-headline font-bold text-primary flex items-center gap-2">
          <Users className="h-8 w-8" /> Players & Bibs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{campPlayers.length} / {camp.quota} invited</p>
      </div>

      {/* Invite form */}
      <Card>
        <CardHeader>
          <CardTitle>Invite Player</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search players..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={!isSeriesScopingLoaded ? 'Loading...' : availablePlayers.length === 0 ? 'No eligible players' : 'Select player...'} />
              </SelectTrigger>
              <SelectContent>
                {availablePlayers.slice(0, 50).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.primarySkill}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 w-32">
              <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input type="number" placeholder={nextBib.toString()} value={bibInput}
                onChange={e => setBibInput(e.target.value)}
                className="w-full" min={1} />
            </div>
            <Button onClick={handleInvite} disabled={isInviting || !selectedPlayerId || !bibInput}>
              {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            </Button>
          </div>
          {bibInput && usedBibs.has(parseInt(bibInput)) && (
            <p className="text-xs text-destructive">Bib #{bibInput} is already assigned</p>
          )}
        </CardContent>
      </Card>

      {/* Player list — table style matching team roster */}
      <div className="border rounded-lg overflow-hidden bg-card shadow">
        {/* Column headers */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <div className="col-span-1">Bib</div>
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Primary Skill</div>
          <div className="col-span-2">Batting Order</div>
          <div className="col-span-2">Bowling Style</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {sortedCampPlayers.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">No players invited yet.</p>
          </div>
        ) : (
          <div className="divide-y">
            {sortedCampPlayers.map(cp => (
              <div key={cp.id} className="grid grid-cols-12 gap-4 items-center px-6 py-4 hover:bg-muted/20 transition-colors">
                {/* Bib */}
                <div className="col-span-1">
                  {canManage && editingBibId === cp.id ? (
                    <div className="flex items-center gap-1">
                      <Input type="number" className="w-14 h-7 text-sm" value={editBibValue}
                        onChange={e => setEditBibValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleBibEdit(cp.id)} />
                      <Button size="sm" className="h-7 px-1.5 text-xs" onClick={() => handleBibEdit(cp.id)}>✓</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => setEditingBibId(null)}>✕</Button>
                    </div>
                  ) : (
                    <span
                      onClick={() => canManage && (setEditingBibId(cp.id), setEditBibValue(cp.bibNumber.toString()))}
                      className={`text-lg font-bold text-primary ${canManage ? 'hover:underline cursor-pointer' : ''}`}>
                      #{cp.bibNumber}
                    </span>
                  )}
                </div>
                {/* Name */}
                <div className="col-span-4">
                  <p className="text-sm font-medium truncate">{cp.playerName}</p>
                  <Badge variant="outline" className="text-xs mt-0.5 capitalize">{cp.status}</Badge>
                </div>
                {/* Primary Skill */}
                <div className="col-span-2">
                  <span className="text-sm">{cp.playerPrimarySkill || '—'}</span>
                </div>
                {/* Batting Order */}
                <div className="col-span-2">
                  <span className="text-sm text-muted-foreground">{cp.playerBattingOrder || '—'}</span>
                </div>
                {/* Bowling Style */}
                <div className="col-span-2">
                  <span className="text-sm text-muted-foreground">{cp.playerBowlingStyle || '—'}</span>
                </div>
                {/* Actions */}
                <div className="col-span-1 flex justify-end">
                  {canManage && (
                    <button onClick={() => handleRemove(cp.id, cp.playerName)}
                      disabled={removingId === cp.id}
                      className="text-muted-foreground hover:text-destructive transition-colors">
                      {removingId === cp.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <X className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
