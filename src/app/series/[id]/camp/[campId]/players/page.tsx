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
import { getPlayersWithDetailsFromDB } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import type { SelectionCamp, CampPlayer, PlayerWithRatings } from '@/types';
import { Loader2, ArrowLeft, UserPlus, X, Hash, Search, Users, ShieldAlert } from 'lucide-react';

export default function CampPlayersPage() {
  const params = useParams<{ id: string; campId: string }>();
  const { id: seriesId, campId } = params;
  const { currentUser, userProfile, activeOrganizationId } = useAuth();
  const { toast } = useToast();

  const [camp, setCamp] = useState<SelectionCamp | null>(null);
  const [campPlayers, setCampPlayers] = useState<CampPlayer[]>([]);
  const [orgPlayers, setOrgPlayers] = useState<PlayerWithRatings[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    ]).then(([campRes, playersRes, orgRes]) => {
      if (campRes.success) setCamp(campRes.camp!);
      if (playersRes.success) setCampPlayers(playersRes.players || []);
      setOrgPlayers(orgRes);
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
      (!search || p.name.toLowerCase().includes(search.toLowerCase()))
    ),
    [orgPlayers, invitedPlayerIds, search]
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
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/series/${seriesId}/camp/${campId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Camp
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-primary flex items-center gap-2">
            <Users className="h-5 w-5" /> Players & Bibs
          </h1>
          <p className="text-xs text-muted-foreground">{campPlayers.length} / {camp.quota} invited</p>
        </div>
      </div>

      {/* Invite form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Invite Player</CardTitle>
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
                <SelectValue placeholder={availablePlayers.length === 0 ? 'All org players invited' : 'Select player...'} />
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

      {/* Player list */}
      <Card>
        <CardContent className="p-0">
          {sortedCampPlayers.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No players invited yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {sortedCampPlayers.map(cp => (
                <div key={cp.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Bib number — editable */}
                  {editingBibId === cp.id ? (
                    <div className="flex items-center gap-1">
                      <Input type="number" className="w-16 h-7 text-sm" value={editBibValue}
                        onChange={e => setEditBibValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleBibEdit(cp.id)} />
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleBibEdit(cp.id)}>✓</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingBibId(null)}>✕</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingBibId(cp.id); setEditBibValue(cp.bibNumber.toString()); }}
                      className="text-xl font-bold text-primary w-12 text-center hover:underline cursor-pointer shrink-0">
                      #{cp.bibNumber}
                    </button>
                  )}

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cp.playerName}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{cp.playerPrimarySkill}</Badge>
                      {cp.playerBowlingStyle && <span className="text-xs text-muted-foreground">{cp.playerBowlingStyle}</span>}
                      {cp.playerBattingOrder && <span className="text-xs text-muted-foreground">{cp.playerBattingOrder}</span>}
                    </div>
                  </div>

                  {/* Status */}
                  <Badge variant="outline" className="text-xs capitalize shrink-0">{cp.status}</Badge>

                  {/* Remove */}
                  <button onClick={() => handleRemove(cp.id, cp.playerName)}
                    disabled={removingId === cp.id}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    {removingId === cp.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <X className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
