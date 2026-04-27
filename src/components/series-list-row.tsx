'use client';

/**
 * FILE: src/components/series-list-row.tsx
 *
 * List-view row for a Series — mirrors SeriesCard logic exactly.
 * Same props, same permission checks, same AlertDialogs.
 */

import Link from 'next/link';
import type { Series } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowRight, Archive, ArchiveRestore, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteSeriesAdminAction } from '@/lib/actions/series-admin-actions';

interface SeriesListRowProps {
  series: Series;
  onArchiveToggle: (seriesId: string, currentStatus: Series['status']) => Promise<void>;
  canArchive: boolean;
  canUnarchive: boolean;
  isPermissionsLoading: boolean;
  canDelete?: boolean | null;
  onDeleted?: () => void;
  isLast?: boolean;
}

const SeriesListRow: React.FC<SeriesListRowProps> = ({
  series,
  onArchiveToggle,
  canArchive,
  canUnarchive,
  isPermissionsLoading,
  canDelete,
  onDeleted,
  isLast,
}) => {
  const { userProfile, activeOrganizationId, effectivePermissions } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const isArchived = series.status === 'archived';
  const showArchiveButton = !isPermissionsLoading && ((isArchived && canUnarchive) || (!isArchived && canArchive));

  const isSuperAdmin = userProfile?.roles?.includes('admin') ?? false;
  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin') ?? false;
  const isSeriesAdmin = userProfile?.roles?.includes('Series Admin') ?? false;
  const isAssignedToSeries = userProfile?.assignedSeriesIds?.includes(series.id) ?? false;
  const canDeletePermission =
    isSuperAdmin ||
    effectivePermissions[PERMISSIONS.SERIES_DELETE_ANY] ||
    (isOrgAdmin && series.organizationId === activeOrganizationId) ||
    (isSeriesAdmin && isAssignedToSeries);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteSeriesAdminAction(series.id);
      if (result.success) {
        toast({ title: 'Series Deleted', description: `"${series.name}" has been permanently deleted.` });
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
      {/* Name + age category */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{series.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{series.ageCategory} · {series.year}</p>
      </div>

      {/* Status badge */}
      <div className="shrink-0 w-20">
        <Badge variant={isArchived ? 'outline' : 'default'} className="capitalize text-xs px-2 py-0.5">
          {series.status}
        </Badge>
      </div>

      {/* Teams count */}
      <div className="shrink-0 w-16 text-sm text-muted-foreground hidden sm:block">
        {series.participatingTeams?.length ?? 0} teams
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1.5">
        <Button asChild variant="outline" size="sm" className="text-xs border-primary text-primary hover:bg-primary/10 h-7 px-2.5">
          <Link href={`/series/${series.id}/details`} prefetch={false}>
            View <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>

        {isPermissionsLoading ? (
          <Button disabled size="sm" className="h-7 px-2.5 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
          </Button>
        ) : canDeletePermission && canDelete === true ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                {!isDeleting && <span className="ml-1">Delete</span>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Series</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete "{series.name}"? This cannot be undone.
                  The series has no games so it is safe to delete.
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
        ) : showArchiveButton ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isArchived ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'h-7 px-2.5 text-xs',
                  isArchived ? 'bg-primary hover:bg-primary/90' : 'border-destructive text-destructive hover:bg-destructive/10'
                )}
              >
                {isArchived
                  ? <><ArchiveRestore className="h-3 w-3 mr-1" />Unarchive</>
                  : <><Archive className="h-3 w-3 mr-1" />Archive</>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Are you sure you want to {isArchived ? 'unarchive' : 'archive'} this series?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isArchived
                    ? `Unarchiving "${series.name}" will make it active again. Associated games will also be reactivated.`
                    : `Archiving "${series.name}" will also archive all its associated games. This will hide its games from lists and prevent new games, teams, or venues from being added to it.`}
                  {' '}Existing data will be preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onArchiveToggle(series.id, series.status)}
                  className={cn(isArchived ? '' : 'bg-destructive hover:bg-destructive/90')}
                >
                  Confirm {isArchived ? 'Unarchive' : 'Archive'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
};

export default SeriesListRow;
