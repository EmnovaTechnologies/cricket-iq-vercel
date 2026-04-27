'use client';

/**
 * FILE: src/components/venue-list-row.tsx
 *
 * List-view row for a Venue — mirrors VenueCard logic exactly.
 * Same props, same permission checks, same AlertDialogs.
 */

import * as React from 'react';
import type { Venue } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Map, CheckCircle, XCircle, Archive, ArchiveRestore, Loader2, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllGamesFromDB } from '@/lib/db';
import { checkVenueDeletableAction, deleteVenueAdminAction } from '@/lib/actions/venue-admin-actions';
import { parseISO, isFuture, format } from 'date-fns';
import Link from 'next/link';

interface VenueListRowProps {
  venue: Venue;
  onStatusChange?: () => void;
  canDelete?: boolean | null;
  isLast?: boolean;
}

const VenueListRow: React.FC<VenueListRowProps> = ({ venue, onStatusChange, canDelete: canDeleteProp, isLast }) => {
  const { toast } = useToast();
  const router = useRouter();
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [canDelete, setCanDelete] = React.useState<boolean | null>(canDeleteProp ?? null);
  const { effectivePermissions, userProfile, activeOrganizationId } = useAuth();

  const status = venue.status || 'active';
  const isArchived = status === 'archived';
  const hasCoordinates = venue.latitude !== undefined && venue.longitude !== undefined;

  const canManageStatus = effectivePermissions[PERMISSIONS.VENUES_ARCHIVE_ANY];
  const canEdit = effectivePermissions[PERMISSIONS.VENUES_EDIT_ANY];
  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin') ?? false;
  const canDeletePermission = effectivePermissions[PERMISSIONS.VENUES_DELETE_ANY] ||
    (isOrgAdmin && venue.organizationId === activeOrganizationId);

  React.useEffect(() => {
    if (canDeleteProp !== undefined) { setCanDelete(canDeleteProp); return; }
    if (!canDeletePermission) { setCanDelete(false); return; }
    checkVenueDeletableAction(venue.id, venue.name, venue.organizationId)
      .then(result => setCanDelete(result.canDelete))
      .catch(() => setCanDelete(false));
  }, [venue.id, venue.name, venue.organizationId, canDeletePermission, canDeleteProp]);

  const handleDeleteVenue = async () => {
    if (!canDeletePermission) return;
    setIsDeleting(true);
    try {
      const result = await deleteVenueAdminAction(venue.id, venue.name, venue.organizationId);
      if (result.success) {
        toast({ title: 'Venue Deleted', description: `"${venue.name}" has been permanently deleted.` });
        if (onStatusChange) onStatusChange();
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

  const handleToggleArchive = async () => {
    if (!canManageStatus) {
      toast({ title: 'Permission Denied', description: 'You do not have permission to change the status of this venue.', variant: 'destructive' });
      return;
    }
    setIsUpdatingStatus(true);
    try {
      if (!isArchived) {
        const allGamesForOrg = await getAllGamesFromDB('active', venue.organizationId);
        const futureGamesAtVenue = allGamesForOrg.filter(game => {
          if (game.venue?.trim().toLowerCase() === venue.name.trim().toLowerCase()) {
            try { return isFuture(parseISO(game.date)); } catch { return false; }
          }
          return false;
        });
        if (futureGamesAtVenue.length > 0) {
          const gameNames = futureGamesAtVenue.map(g => `${g.team1} vs ${g.team2} on ${format(parseISO(g.date), 'PPP')}`).join(', ');
          toast({ title: 'Archive Failed', description: `Venue "${venue.name}" cannot be archived as it is scheduled for ${futureGamesAtVenue.length} future game(s): ${gameNames}.`, variant: 'destructive', duration: 9000 });
          setIsUpdatingStatus(false);
          return;
        }
      }
      const newStatus = isArchived ? 'active' : 'archived';
      await updateDoc(doc(db, 'venues', venue.id), { status: newStatus });
      toast({ title: `Venue ${newStatus}` });
      if (onStatusChange) onStatusChange();
      else router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast({ title: 'Error', description: `Failed to update venue: ${message}`, variant: 'destructive' });
    }
    setIsUpdatingStatus(false);
  };

  return (
    <div className={cn('flex items-center gap-4 px-4 py-3', !isLast && 'border-b border-border')}>
      {/* Name + address */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-sm font-medium text-primary truncate">{venue.name}</p>
          <Badge variant={status === 'active' ? 'default' : 'secondary'} className="capitalize text-xs px-1.5 py-0.5 shrink-0">
            {status === 'active' ? <CheckCircle className="h-3 w-3 mr-1 text-green-500" /> : <XCircle className="h-3 w-3 mr-1 text-red-500" />}
            {status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate pl-5">{venue.address}</p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1.5">
        {hasCoordinates && (
          <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs border-primary text-primary hover:bg-primary/10">
            <a href={`https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
              <Map className="h-3 w-3" /> Map
            </a>
          </Button>
        )}
        {canEdit && (
          <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs">
            <Link href={`/venues/${venue.id}/edit`} className="flex items-center gap-1">
              <Edit className="h-3 w-3" /> Edit
            </Link>
          </Button>
        )}
        {canDelete === true && canDeletePermission ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-7 px-2.5 text-xs" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                {!isDeleting && <span className="ml-1">Delete</span>}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Venue</AlertDialogTitle>
                <AlertDialogDescription>Are you sure you want to permanently delete "{venue.name}"? This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteVenue} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : canManageStatus ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isArchived ? 'default' : 'outline'}
                size="sm"
                className={cn('h-7 px-2.5 text-xs', isArchived ? 'bg-primary hover:bg-primary/90' : 'border-destructive text-destructive hover:bg-destructive/10')}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? <Loader2 className="h-3 w-3 animate-spin" /> : (isArchived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />)}
                <span className="ml-1">{isArchived ? 'Unarchive' : 'Archive'}</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to {isArchived ? 'unarchive' : 'archive'} "{venue.name}"?
                  {isArchived ? ' Unarchiving will make it active again.' : ' Archiving will hide it from new series.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isUpdatingStatus}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleToggleArchive} disabled={isUpdatingStatus} className={cn(isArchived ? '' : 'bg-destructive hover:bg-destructive/90')}>
                  {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirm {isArchived ? 'Unarchive' : 'Archive'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </div>
  );
};

export default VenueListRow;
