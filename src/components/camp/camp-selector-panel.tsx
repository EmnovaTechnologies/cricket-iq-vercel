'use client';

/**
 * FILE: src/components/camp/camp-selector-panel.tsx
 * Admin UI for assigning coaches/selectors to a selection camp.
 * Mirrors the pattern of ScorecardSelectorAssignmentPanel.
 */

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus, X, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { assignSelectorToCampAction, removeSelectorFromCampAction } from '@/lib/actions/camp-actions';
import type { CampSelectorAssignment, UserProfile } from '@/types';
import { cn } from '@/lib/utils';

interface CampSelectorPanelProps {
  campId: string;
  assignments: CampSelectorAssignment[];
  availableSelectors: UserProfile[];
  onAssignmentsChanged: (updated: CampSelectorAssignment[]) => void;
  assignedBy: string; // uid of current user
}

export function CampSelectorPanel({
  campId,
  assignments,
  availableSelectors,
  onAssignmentsChanged,
  assignedBy,
}: CampSelectorPanelProps) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedUid, setSelectedUid] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [removingUid, setRemovingUid] = useState<string | null>(null);

  const assignedUids = new Set(assignments.map(a => a.uid));
  // Filter out already-assigned and admin users
  const selectorMap = new Map(availableSelectors.map(u => [u.uid, u]));
  const unassigned = availableSelectors.filter(u =>
    !assignedUids.has(u.uid) &&
    (u.roles?.includes('selector') || u.roles?.includes('Series Admin'))
  );

  const handleAssign = async () => {
    if (!selectedUid) return;
    const user = availableSelectors.find(u => u.uid === selectedUid);
    if (!user) return;
    setIsAssigning(true);
    const res = await assignSelectorToCampAction(
      campId,
      {
        uid: user.uid,
        name: user.displayName || user.email || user.uid,
        clubName: user.clubName,
      },
      assignedBy
    );
    if (res.success) {
      const newAssignment: CampSelectorAssignment = {
        uid: user.uid,
        name: user.displayName || user.email || user.uid,
        clubName: user.clubName,
        assignedAt: new Date().toISOString(),
        assignedBy,
      };
      onAssignmentsChanged([...assignments, newAssignment]);
      setSelectedUid('');
      toast({ title: `${newAssignment.name} assigned to camp` });
    } else {
      toast({ title: 'Assignment failed', description: res.error, variant: 'destructive' });
    }
    setIsAssigning(false);
  };

  const handleRemove = async (uid: string) => {
    setRemovingUid(uid);
    const res = await removeSelectorFromCampAction(campId, uid);
    if (res.success) {
      onAssignmentsChanged(assignments.filter(a => a.uid !== uid));
      toast({ title: 'Selector removed from camp' });
    } else {
      toast({ title: 'Remove failed', description: res.error, variant: 'destructive' });
    }
    setRemovingUid(null);
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
          <span className="text-xs font-medium">Coaches / Selectors</span>
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
              No coaches or selectors assigned yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {assignments.map(a => {
                const profile = selectorMap.get(a.uid);
                return (
                  <div key={a.uid} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      {(a.clubName || profile?.clubName) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200 shrink-0">
                          {a.clubName || profile?.clubName}
                        </span>
                      )}
                      {profile?.roles && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground border shrink-0">
                          {profile.roles.filter(r => r === 'selector' || r === 'Series Admin').join(', ')}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(a.uid)}
                      disabled={removingUid === a.uid}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
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
          {unassigned.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Add coach / selector</p>
              <div className="flex gap-2">
                <Select value={selectedUid} onValueChange={setSelectedUid}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Select person..." />
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
