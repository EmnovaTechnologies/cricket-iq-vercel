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
  availableSelectors: UserProfile[]; // fetched by parent
  onAssignmentsChanged: (updated: ScorecardSelectorAssignment[]) => void;
}

export function ScorecardSelectorAssignmentPanel({
  scorecardId,
  team1,
  team2,
  assignments,
  availableSelectors,
  onAssignmentsChanged,
}: ScorecardSelectorAssignmentProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedUid, setSelectedUid] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('neutral');
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  const assignedUids = new Set(assignments.map(a => a.uid));
  const unassigned = availableSelectors.filter(u => !assignedUids.has(u.uid));

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
    if (team === team1) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (team === team2) return 'bg-green-100 text-green-700 border-green-200';
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
              {assignments.map(a => (
                <div key={a.uid} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{a.name}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-xs shrink-0', teamColor(a.teamAssociation))}
                    >
                      {a.teamAssociation === 'neutral' ? 'Neutral' : a.teamAssociation}
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
              ))}
            </div>
          )}

          {/* Add selector */}
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
                        {u.displayName || u.email}
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
