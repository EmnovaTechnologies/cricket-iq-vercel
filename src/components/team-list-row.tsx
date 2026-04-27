'use client';

/**
 * FILE: src/components/team-list-row.tsx
 *
 * List-view row for a Team — mirrors TeamCard logic exactly.
 * Same props, same permission checks, same AlertDialog for delete.
 */

import * as React from 'react';
import Link from 'next/link';
import type { Team } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Tag, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { checkTeamDeletableAction, deleteTeamAdminAction } from '@/lib/actions/team-admin-actions';
import { cn } from '@/lib/utils';

interface TeamListRowProps {
  team: Team;
  onDeleted?: () => void;
  canDelete?: boolean | null;
  isLast?: boolean;
}

const TeamListRow: React.FC<TeamListRowProps> = ({ team, onDeleted, canDelete: canDeleteProp, isLast }) => {
  const { effectivePermissions, userProfile, activeOrganizationId } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [canDelete, setCanDelete] = React.useState<boolean | null>(canDeleteProp ?? null);

  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin') ?? false;
  const canDeletePermission = effectivePermissions[PERMISSIONS.TEAMS_DELETE_ANY] ||
    (isOrgAdmin && team.organizationId === activeOrganizationId);

  React.useEffect(() => {
    if (canDeleteProp !== undefined) { setCanDelete(canDeleteProp); return; }
    if (!canDeletePermission) { setCanDelete(false); return; }
    checkTeamDeletableAction(team.id, team.playerIds || [])
      .then(r => setCanDelete(r.canDelete))
      .catch(() => setCanDelete(false));
  }, [team.id, team.playerIds, canDeletePermission, canDeleteProp]);

  const handleDelete = async () => {
    if (!canDeletePermission) return;
    setIsDeleting(true);
    try {
      const result = await deleteTeamAdminAction(team.id, team.playerIds || []);
      if (result.success) {
        toast({ title: 'Team Deleted', description: `"${team.name}" has been permanently deleted.` });
        if (onDeleted) onDeleted();
        else router.refresh();
      } else {
        toast({ title: 'Deletion Failed', description: result.error, variant: 'destructive', duration: 9000 });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-3',
      !isLast && 'border-b border-border'
    )}>
      {/* Name + club + age */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{team.name}</p>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          {team.clubName && (
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" /> {team.clubName}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Tag className="h-3 w-3" /> {team.ageCategory}
          </span>
          <span>{team.playerIds?.length ?? 0} players</span>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1.5">
        <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs border-primary text-primary hover:bg-primary/10">
          <Link href={`/teams/${team.id}/details`} className="flex items-center gap-1">
            View <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>

        {canDeletePermission && (
          canDelete === true ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs" disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {!isDeleting && <span className="ml-1">Delete</span>}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Team</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to permanently delete "{team.name}"? This cannot be undone.
                    The team has no players or associated games so it is safe to delete.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirm Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <span className="relative group cursor-not-allowed">
              <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs pointer-events-none opacity-50" disabled>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
              {canDelete === false && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-50">
                  Has players or games — cannot delete
                </span>
              )}
              {canDelete === null && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-gray-900 text-white text-xs rounded px-2 py-1 z-50">
                  Checking...
                </span>
              )}
            </span>
          )
        )}
      </div>
    </div>
  );
};

export default TeamListRow;
