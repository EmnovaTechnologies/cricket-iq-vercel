
'use client';

import Link from 'next/link';
import type { Series } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers, CalendarFold, Tag, ArrowRight, Archive, ArchiveRestore, Info, Loader2, Trash2 } from 'lucide-react';
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
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteSeriesAdminAction } from '@/lib/actions/series-admin-actions';

interface SeriesCardProps {
  series: Series;
  onArchiveToggle: (seriesId: string, currentStatus: Series['status']) => Promise<void>;
  canArchive: boolean;
  canUnarchive: boolean;
  isPermissionsLoading: boolean;
  canDelete?: boolean | null; // pre-fetched from parent
  onDeleted?: () => void;
}

const SeriesCard: React.FC<SeriesCardProps> = ({ series, onArchiveToggle, canArchive, canUnarchive, isPermissionsLoading, canDelete, onDeleted }) => {
  const { userProfile, activeOrganizationId, effectivePermissions } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmArchiveToggle = async () => {
    await onArchiveToggle(series.id, series.status);
  };

  const isArchived = series.status === 'archived';
  const showArchiveButton = !isPermissionsLoading && ((isArchived && canUnarchive) || (!isArchived && canArchive));

  // Delete permission: Super Admin, Org Admin (own org), Series Admin (assigned series)
  const isSuperAdmin = userProfile?.roles?.includes('admin') ?? false;
  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin') ?? false;
  const isSeriesAdmin = userProfile?.roles?.includes('Series Admin') ?? false;
  const isAssignedToSeries = userProfile?.assignedSeriesIds?.includes(series.id) ?? false;
  const canDeletePermission = isSuperAdmin ||
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
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader className="p-3 space-y-1">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl font-headline text-primary flex items-center gap-1.5">
            <Layers className="h-5 w-5" />
            {series.name}
          </CardTitle>
          <Badge variant={isArchived ? 'outline' : 'default'} className="capitalize text-sm px-2 py-0.5">
            {series.status}
          </Badge>
        </div>
        <CardDescription className="text-sm flex items-center gap-1.5 pt-0.5">
          <Tag className="h-4 w-4" /> {series.ageCategory}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-1.5 p-3 pt-1">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarFold className="h-4 w-4" /> Year: {series.year}
        </p>
        {isArchived && (
            <p className="flex items-center gap-1 text-sm text-destructive/80">
                <Info className="h-4 w-4" /> This series is archived.
            </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-1.5 p-3 pt-2">
        <Button asChild variant="outline" size="sm" className="w-full flex-1 border-primary text-primary hover:bg-primary/10 text-sm">
          <Link href={`/series/${series.id}/details`} prefetch={false}>
            <span className="flex items-center justify-center gap-1.5">
              View Details <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </Button>

        {isPermissionsLoading ? (
          <Button disabled size="sm" className="w-full flex-1 text-sm">
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Loading...
          </Button>
        ) : canDeletePermission && canDelete === true ? (
          // Show Delete when series has no games
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-full flex-1 text-sm" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
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
          // Show Archive/Unarchive when series has games or not deletable
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isArchived ? "default" : "outline"}
                size="sm"
                className={cn("w-full flex-1 text-sm", isArchived ? 'bg-primary hover:bg-primary/90' : 'border-destructive text-destructive hover:bg-destructive/10')}
              >
                {isArchived ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
                {isArchived ? 'Unarchive' : 'Archive'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to {isArchived ? "unarchive" : "archive"} this series?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isArchived
                    ? `Unarchiving "${series.name}" will make it active again. Associated games will also be reactivated.`
                    : `Archiving "${series.name}" will also archive all its associated games. This will hide its games from lists and prevent new games, teams, or venues from being added to it.`}
                  {' '}Existing data will be preserved.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmArchiveToggle} className={cn(isArchived ? "" : "bg-destructive hover:bg-destructive/90")}>
                  Confirm {isArchived ? "Unarchive" : "Archive"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardFooter>
    </Card>
  );
};

export default SeriesCard;
