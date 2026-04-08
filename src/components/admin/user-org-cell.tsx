'use client';

import { useState } from 'react';
import { assignOrgToUserAction } from '@/lib/actions/assign-org-action';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Building, Check, X, ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Organization } from '@/types';

interface UserOrgCellProps {
  userId: string;
  assignedOrgIds: string[];
  allOrgs: Organization[];
  onUpdated: () => void;
}

export function UserOrgCell({ userId, assignedOrgIds, allOrgs, onUpdated }: UserOrgCellProps) {
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null); // orgId currently being toggled
  const [open, setOpen] = useState(false);

  const hasOrg = assignedOrgIds.length > 0;
  const assignedSet = new Set(assignedOrgIds);

  const handleToggle = async (org: Organization) => {
    const action = assignedSet.has(org.id) ? 'remove' : 'add';
    setPending(org.id);
    try {
      const result = await assignOrgToUserAction(userId, org.id, action);
      if (result.success) {
        toast({
          title: action === 'add' ? 'Organization Added' : 'Organization Removed',
          description: `${org.name} has been ${action === 'add' ? 'assigned to' : 'removed from'} this user.`,
        });
        onUpdated();
      } else {
        toast({ title: 'Error', description: result.error || 'Could not update organization.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setPending(null);
    }
  };

  const assignedOrgs = allOrgs.filter(o => assignedSet.has(o.id));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Current org badges */}
      {assignedOrgs.length === 0
        ? <span className="text-xs text-muted-foreground">None</span>
        : assignedOrgs.map(org => (
            <Badge key={org.id} variant="outline" className="text-xs gap-1 pr-1">
              {org.name}
              <button
                onClick={() => handleToggle(org)}
                disabled={!!pending}
                className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                title={`Remove ${org.name}`}
              >
                {pending === org.id
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <X className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />}
              </button>
            </Badge>
          ))}

      {/* Add org popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs gap-1 border-dashed"
            disabled={!!pending}
          >
            <Building className="h-3 w-3" />
            Assign
            <ChevronDown className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <p className="text-xs font-medium text-muted-foreground mb-1 px-1">Toggle organization assignment</p>
          {hasOrg && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
              Users can only belong to one organization. Remove the current one first to assign another.
            </p>
          )}
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {allOrgs.map(org => {
              const isAssigned = assignedSet.has(org.id);
              const isLoading = pending === org.id;
              const isBlocked = hasOrg && !isAssigned; // can't add if already has a different org
              return (
                <button
                  key={org.id}
                  onClick={() => !isBlocked && handleToggle(org)}
                  disabled={!!pending || isBlocked}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors',
                    isAssigned
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : isBlocked
                      ? 'opacity-40 cursor-not-allowed text-foreground'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  {isLoading
                    ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    : <Check className={cn('h-4 w-4 shrink-0', isAssigned ? 'opacity-100' : 'opacity-0')} />}
                  <span className="flex-1 truncate">{org.name}</span>
                  {isAssigned && (
                    <Badge variant="secondary" className="text-xs ml-auto shrink-0">Assigned</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
