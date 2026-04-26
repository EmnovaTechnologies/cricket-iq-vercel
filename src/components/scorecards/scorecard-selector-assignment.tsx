'use client';

/**
 * FILE: src/components/scorecards/scorecard-selector-assignment.tsx
 *
 * Admin-only UI for assigning selectors to a scorecard directly.
 * Shows in the scorecard detail header area.
 * Selector gets team association (team1 / team2 / neutral).
 */

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, UserPlus, X, Users, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  assignSelectorToScorecardAction,
  removeSelectorFromScorecardAction,
} from '@/lib/actions/scorecard-actions';
import type { ScorecardSelectorAssignment, UserProfile } from '@/types';
import { cn } from '@/lib/utils';

interface ScorecardSelectorAssignmentProps {
  scorecardId: string;
  team1: string;
  team2: string;
  assignments: ScorecardSelectorAssignment[];
  availableSelectors: UserProfile[];
  onAssignmentsChanged: (updated: ScorecardSelectorAssignment[]) => void;
  ratingScope?: 'opposing_only' | 'own_team' | 'both_teams' | null;
}

export function ScorecardSelectorAssignmentPanel({
  scorecardId,
  team1,
  team2,
  assignments,
  availableSelectors,
  onAssignmentsChanged,
  ratingScope,
}: ScorecardSelectorAssignmentProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedUid, setSelectedUid] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('neutral');
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  const assignedUids = new Set(assignments.map(a => a.uid));
  const unassigned = availableSelectors.filter(u => !assignedUids.has(u.uid));

  // Full lookup map including already-assigned selectors
  const selectorMap = new Map(availableSelectors.map(u => [u.uid, u]));

  // Auto-suggest team scope when selector is picked
  const suggestTeam = (uid: string): string => {
    const user = selectorMap.get(uid);
    if (!user?.clubName) return 'neutral';
    const norm = (s: string) => s.trim().toLowerCase();
    const club = norm(user.clubName);
    const t1 = norm(team1);
    const t2 = norm(team2);
    const matchesTeam1 = t1.includes(club) || club.includes(t1);
    const matchesTeam2 = t2.includes(club) || club.includes(t2);
    if (matchesTeam1) return ratingScope === 'opposing_only' ? team2 : team1;
    if (matchesTeam2) return ratingScope === 'opposing_only' ? team1 : team2;
    return 'neutral';
  };

  // Auto-suggest when selector changes
  useEffect(() => {
    if (selectedUid) setSelectedTeam(suggestTeam(selectedUid));
    else setSelectedTeam('neutral');
  }, [selectedUid]);

  const handleAssign = async () => {
    if (!selectedUid) return;
    const user = availableSelectors.find(u => u.uid === selectedUid);
    if (!user) return;

    setIsAssigning(true);
    const res = await assignSelectorToScorecardAction(scorecardId, {
      uid: user.uid,
      name: user.displayName || user.email || user.uid,
      teamAssociation: selectedTeam,
    });

    if (res.success) {
      const newAssignment: ScorecardSelectorAssignment = {
        uid: user.uid,
        name: user.displayName || user.email || user.uid,
        teamAssociation: selectedTeam,
        assignedAt: new Date().toISOString(),
      };
      onAssignmentsChanged([...assignments, newAssignment]);
      setSelectedUid('');
      setSelectedTeam('neutral');
      toast({ title: `${newAssignment.name} assigned` });
    } else {
      toast({ title: 'Assignment failed', description: res.error, variant: 'destructive' });
    }
    setIsAssigning(false);
  };

  const handleRemove = async (uid: string) => {
    setRemovingUid(uid);
    const res = await removeSelectorFromScorecardAction(scorecardId, uid);
    if (res.success) {
      onAssignmentsChanged(assignments.filter(a => a.uid !== uid));
      toast({ title: 'Selector removed' });
    } else {
      toast({ title: 'Remove failed', description: res.error, variant: 'destructive' });
    }
    setRemovingUid(null);
  };

  const teamColor = (team: string) => {
    if (team === team1 || team === team2) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">
            Assigned Selectors
          </span>
          {assignments.length > 0 && (
            <Badge variant="secondary" className="text-xs h-4 px-1.5">
              {assignments.length}
            </Badge>
          )}
        </div>
        {isExpanded
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {isExpanded && (
        <div className="px-3 py-3 space-y-3">
          {/* Current assignments */}
          {assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-1">
              No selectors assigned yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {assignments.map(a => {
                const profile = selectorMap.get(a.uid);
                return (
                  <div key={a.uid} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      {profile?.clubName && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200 shrink-0">
                          {profile.clubName}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={cn('text-xs shrink-0', teamColor(a.teamAssociation))}
                      >
                        {a.teamAssociation === 'neutral' ? 'Neutral' : `→ ${a.teamAssociation}`}
                      </Badge>
                    </div>
                    <button
                      onClick={() => handleRemove(a.uid)}
                      disabled={removingUid === a.uid}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Remove selector"
                    >
                      {removingUid === a.uid
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <X className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add selector */}
          {/* Instruction */}
          <p className="text-xs text-muted-foreground border-t pt-2">
            Club associations (shown in green) are used to auto-suggest team scope based on your org's rating settings.
          </p>

          {unassigned.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Add selector</p>
              <div className="flex gap-2">
                <Select value={selectedUid} onValueChange={setSelectedUid}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Select selector..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unassigned.map(u => (
                      <SelectItem key={u.uid} value={u.uid} className="text-xs">
                        <span className="flex items-center gap-2">
                          {u.displayName || u.email}
                          {u.clubName && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200">
                              {u.clubName}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger className="h-8 text-xs w-32">
                    <SelectValue placeholder="Team..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={team1} className="text-xs">{team1}</SelectItem>
                    <SelectItem value={team2} className="text-xs">{team2}</SelectItem>
                    <SelectItem value="neutral" className="text-xs">Neutral</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  className="h-8 px-3 shrink-0"
                  disabled={!selectedUid || isAssigning}
                  onClick={handleAssign}
                >
                  {isAssigning
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <UserPlus className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {/* Suggestion hint */}
              {selectedUid && (() => {
                const suggested = suggestTeam(selectedUid);
                const user = selectorMap.get(selectedUid);
                if (user?.clubName && suggested !== 'neutral') {
                  return (
                    <p className="text-xs text-blue-600 italic">
                      ↗ Club matched — suggested team scope: {suggested}
                    </p>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {unassigned.length === 0 && assignments.length > 0 && (
            <p className="text-xs text-muted-foreground text-center border-t pt-2">
              All available selectors are assigned.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
