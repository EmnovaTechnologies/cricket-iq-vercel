'use client';

/**
 * FILE: src/components/scorecards/player-link-tab.tsx
 *
 * Optional tab on the scorecard detail page allowing admins to link
 * scorecardPlayers to full Player profiles (hybrid selection bridge).
 *
 * Non-intrusive: the tab is skippable, all actions are optional,
 * and nothing breaks if no links are made.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getScorecardPlayersForScorecardAction,
  suggestPlayerLinksAction,
  linkScorecardPlayerAction,
  unlinkScorecardPlayerAction,
} from '@/lib/actions/scorecard-actions';
import type { ScorecardPlayer } from '@/types';
import {
  Loader2, Link2, Unlink, CheckCircle, Search,
  Sparkles, Info, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlayerLinkTabProps {
  scorecardId: string;
  organizationId: string;
  canEdit: boolean; // only admins/org admins can link
}

type ScorecardPlayerWithId = ScorecardPlayer & { id: string };
type Suggestion = { playerId: string; playerName: string; score: number };

// ─── Confidence label ─────────────────────────────────────────────────────────
function confidenceLabel(score: number): { label: string; className: string } {
  if (score >= 0.95) return { label: 'Exact match', className: 'text-green-700 bg-green-50 border-green-200' };
  if (score >= 0.75) return { label: 'High confidence', className: 'text-blue-700 bg-blue-50 border-blue-200' };
  return { label: 'Possible match', className: 'text-amber-700 bg-amber-50 border-amber-200' };
}

// ─── Single player row ────────────────────────────────────────────────────────
function PlayerLinkRow({
  player,
  suggestions,
  canEdit,
  onLinked,
  onUnlinked,
}: {
  player: ScorecardPlayerWithId;
  suggestions: Suggestion[];
  canEdit: boolean;
  onLinked: (playerId: string, playerName: string) => void;
  onUnlinked: () => void;
}) {
  const { toast } = useToast();
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Suggestion[]>([]);

  const isLinked = !!player.linkedPlayerId;

  const handleLink = async (playerId: string, playerName: string) => {
    setIsLinking(true);
    const res = await linkScorecardPlayerAction(player.id, playerId, playerName);
    if (res.success) {
      toast({ title: `Linked to ${playerName}` });
      onLinked(playerId, playerName);
      setShowSearch(false);
      setShowSuggestions(false);
    } else {
      toast({ title: 'Link failed', description: res.error, variant: 'destructive' });
    }
    setIsLinking(false);
  };

  const handleUnlink = async () => {
    setIsUnlinking(true);
    const res = await unlinkScorecardPlayerAction(player.id);
    if (res.success) {
      toast({ title: 'Link removed' });
      onUnlinked();
    } else {
      toast({ title: 'Unlink failed', description: res.error, variant: 'destructive' });
    }
    setIsUnlinking(false);
  };

  // Simple client-side filter of suggestions for search
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    const filtered = suggestions.filter(s =>
      s.playerName.toLowerCase().includes(q.toLowerCase())
    );
    setSearchResults(filtered);
  };

  return (
    <div className={cn(
      'border rounded-xl p-3 space-y-2 transition-colors',
      isLinked ? 'border-green-200 bg-green-50/30' : 'border-muted-foreground/20'
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{player.name}</p>
          <p className="text-xs text-muted-foreground">{player.gamesAppeared} scorecard{player.gamesAppeared !== 1 ? 's' : ''}</p>
        </div>

        {isLinked ? (
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium text-green-700 truncate max-w-[140px]">
                {(player as any).linkedPlayerName || 'Linked'}
              </span>
            </div>
            {canEdit && (
              <button
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remove link"
              >
                {isUnlinking
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <X className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        ) : (
          canEdit && (
            <div className="flex items-center gap-1.5 shrink-0">
              {suggestions.length > 0 && (
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => { setShowSuggestions(v => !v); setShowSearch(false); }}
                >
                  <Sparkles className="h-3 w-3 mr-1 text-primary" />
                  {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
                  {showSuggestions ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                </Button>
              )}
              <Button
                size="sm" variant="ghost"
                className="h-7 text-xs px-2 text-muted-foreground"
                onClick={() => { setShowSearch(v => !v); setShowSuggestions(false); }}
              >
                <Search className="h-3 w-3 mr-1" /> Search
              </Button>
            </div>
          )
        )}
      </div>

      {/* Suggestions panel */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t">
          <p className="text-xs text-muted-foreground">Select the matching player profile:</p>
          {suggestions.map(s => {
            const conf = confidenceLabel(s.score);
            return (
              <div key={s.playerId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm truncate">{s.playerName}</span>
                  <Badge variant="outline" className={cn('text-xs shrink-0', conf.className)}>
                    {conf.label}
                  </Badge>
                </div>
                <Button
                  size="sm" className="h-7 text-xs px-3 shrink-0"
                  disabled={isLinking}
                  onClick={() => handleLink(s.playerId, s.playerName)}
                >
                  {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                  Link
                </Button>
              </div>
            );
          })}
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setShowSuggestions(false); setShowSearch(true); }}
          >
            None of these — search manually
          </button>
        </div>
      )}

      {/* Manual search panel */}
      {showSearch && (
        <div className="space-y-1.5 pt-1 border-t">
          <p className="text-xs text-muted-foreground">Search player profiles:</p>
          <Input
            autoFocus
            placeholder="Type player name..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            className="h-8 text-sm"
          />
          {searchResults.length > 0 && (
            <div className="space-y-1">
              {searchResults.map(s => (
                <div key={s.playerId} className="flex items-center justify-between gap-2">
                  <span className="text-sm flex-1 truncate">{s.playerName}</span>
                  <Button
                    size="sm" className="h-7 text-xs px-3 shrink-0"
                    disabled={isLinking}
                    onClick={() => handleLink(s.playerId, s.playerName)}
                  >
                    {isLinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground">No matching players found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main tab component ───────────────────────────────────────────────────────
export function PlayerLinkTab({ scorecardId, organizationId, canEdit }: PlayerLinkTabProps) {
  const { toast } = useToast();
  const [players, setPlayers] = useState<ScorecardPlayerWithId[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all');

  useEffect(() => {
    setIsLoading(true);
    getScorecardPlayersForScorecardAction(scorecardId, organizationId).then(res => {
      if (res.success && res.players) setPlayers(res.players);
      setIsLoading(false);
    });
  }, [scorecardId, organizationId]);

  const handleAutoSuggest = async () => {
    const unlinked = players.filter(p => !p.linkedPlayerId).map(p => p.name);
    if (!unlinked.length) return;
    setIsSuggesting(true);
    const res = await suggestPlayerLinksAction(organizationId, unlinked);
    if (res.success && res.suggestions) {
      setSuggestions(res.suggestions);
      setSuggestionsLoaded(true);
      const hasSuggestions = Object.values(res.suggestions).some(s => s.length > 0);
      toast({
        title: hasSuggestions ? 'Suggestions ready' : 'No matches found',
        description: hasSuggestions
          ? 'Review and confirm the suggested links below.'
          : 'No player profiles match the scorecard names. Use manual search to link.',
      });
    } else {
      toast({ title: 'Could not load suggestions', description: res.error, variant: 'destructive' });
    }
    setIsSuggesting(false);
  };

  const updatePlayer = (id: string, updates: Partial<ScorecardPlayerWithId>) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const linkedCount = players.filter(p => p.linkedPlayerId).length;
  const unlinkedCount = players.length - linkedCount;

  const filtered = players.filter(p => {
    if (filterLinked === 'linked') return !!p.linkedPlayerId;
    if (filterLinked === 'unlinked') return !p.linkedPlayerId;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!players.length) {
    return (
      <p className="text-center text-muted-foreground py-10 text-sm">
        No players found for this scorecard.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 space-y-0.5">
          <p className="font-medium">Optional — link scorecard players to player profiles</p>
          <p>Linking enables hybrid selection by combining scorecard performance data with selector ratings. You can skip this entirely — everything works without links.</p>
        </div>
      </div>

      {/* Summary + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{players.length} players</span>
          <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">
            {linkedCount} linked
          </Badge>
          {unlinkedCount > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-xs">
              {unlinkedCount} unlinked
            </Badge>
          )}
        </div>
        {canEdit && unlinkedCount > 0 && (
          <Button
            size="sm" variant="outline"
            onClick={handleAutoSuggest}
            disabled={isSuggesting}
            className="text-xs h-8"
          >
            {isSuggesting
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Finding matches...</>
              : <><Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" /> Auto-suggest links</>}
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b">
        {(['all', 'unlinked', 'linked'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterLinked(f)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors capitalize',
              filterLinked === f
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {f === 'all' ? `All (${players.length})` : f === 'linked' ? `Linked (${linkedCount})` : `Unlinked (${unlinkedCount})`}
          </button>
        ))}
      </div>

      {/* Player rows */}
      <div className="space-y-2">
        {filtered.map(player => (
          <PlayerLinkRow
            key={player.id}
            player={player}
            suggestions={suggestions[player.name] || []}
            canEdit={canEdit}
            onLinked={(playerId, playerName) => updatePlayer(player.id, { linkedPlayerId: playerId, linkedPlayerName: playerName } as any)}
            onUnlinked={() => updatePlayer(player.id, { linkedPlayerId: undefined, linkedPlayerName: undefined } as any)}
          />
        ))}
      </div>

      {linkedCount === players.length && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          All players linked — this scorecard is fully connected to player profiles.
        </div>
      )}
    </div>
  );
}
