
'use client';

import * as React from 'react';
import type { Venue } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Globe, Map, CheckCircle, XCircle, Archive, ArchiveRestore, Loader2, Info, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllGamesFromDB } from '@/lib/db';
import { checkVenueDeletableAction, deleteVenueAdminAction } from '@/lib/actions/venue-admin-actions';
import { parseISO, isFuture, format } from 'date-fns';
import Link from 'next/link';

interface VenueCardProps {
  venue: Venue;
  onStatusChange?: () => void;
  canDelete?: boolean | null; // pre-fetched from parent to avoid flash
}

const VenueCard: React.FC<VenueCardProps> = ({ venue, onStatusChange, canDelete: canDeleteProp }) => {
  const { toast } = useToast();
  const router = useRouter();
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [canDelete, setCanDelete] = React.useState<boolean | null>(canDeleteProp ?? null);
  const { effectivePermissions, userProfile, activeOrganizationId } = useAuth();

  const hasCoordinates = venue.latitude !== undefined && venue.longitude !== undefined;
  const status = venue.status || 'active';
  const isArchived = status === 'archived';

  const canManageStatus = effectivePermissions[PERMISSIONS.VENUES_ARCHIVE_ANY];
  const canEdit = effectivePermissions[PERMISSIONS.VENUES_EDIT_ANY];

  const isSuperAdmin = userProfile?.roles?.includes('admin') ?? false;
  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin') ?? false;
  const canDeletePermission = effectivePermissions[PERMISSIONS.VENUES_DELETE_ANY] ||
    (isOrgAdmin && venue.organizationId === activeOrganizationId);

  // Only fetch internally if not provided by parent
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
      toast({ title: "Permission Denied", description: "You do not have permission to change the status of this venue.", variant: "destructive" });
      return;
    }
    setIsUpdatingStatus(true);
    
    try {
      // If we are archiving, first check for future games
      if (!isArchived) {
        const allGamesForOrg = await getAllGamesFromDB('active', venue.organizationId);
        const futureGamesAtVenue = allGamesForOrg.filter(game => {
          if (game.venue?.trim().toLowerCase() === venue.name.trim().toLowerCase()) {
            try {
              const gameDate = parseISO(game.date);
              return isFuture(gameDate);
            } catch (e) {
              return false; // Treat invalid dates as not conflicting
            }
          }
          return false;
        });

        if (futureGamesAtVenue.length > 0) {
          const gameNames = futureGamesAtVenue.map(g => `${g.team1} vs ${g.team2} on ${format(parseISO(g.date), 'PPP')}`).join(', ');
          toast({
            title: "Archive Failed",
            description: `Venue "${venue.name}" cannot be archived as it is scheduled for ${futureGamesAtVenue.length} future game(s): ${gameNames}. Please update these games first.`,
            variant: 'destructive',
            duration: 9000,
          });
          setIsUpdatingStatus(false);
          return;
        }
      }

      const newStatus = isArchived ? 'active' : 'archived';
      const venueDocRef = doc(db, 'venues', venue.id);
      await updateDoc(venueDocRef, { status: newStatus });

      toast({ title: `Venue ${newStatus}` });
      if (onStatusChange) {
        onStatusChange();
      } else {
        router.refresh();
      }

    } catch (error) {
      console.error(`Error toggling archive for venue ${venue.id}:`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({ title: "Error", description: `Failed to update venue: ${message}`, variant: "destructive" });
    }
    
    setIsUpdatingStatus(false);
  };

  return (
    <Card className="flex flex-col h-full hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl font-headline text-primary flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {venue.name}
          </CardTitle>
          <Badge variant={status === 'active' ? 'default' : 'secondary'} className="capitalize">
            {status === 'active' ? <CheckCircle className="h-4 w-4 mr-1 text-green-500" /> : <XCircle className="h-4 w-4 mr-1 text-red-500" />}
            {status}
          </Badge>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          {venue.address}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow space-y-2">
        {venue.latitude && venue.longitude && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="h-4 w-4" /> Lat: {venue.latitude.toFixed(4)}, Lon: {venue.longitude.toFixed(4)}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 items-stretch">
        {canEdit && (
            <Button asChild variant="outline" size="sm" className="flex-1">
                <Link href={`/venues/${venue.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4"/> Edit
                </Link>
            </Button>
        )}
        {hasCoordinates ? (
          <Button asChild variant="outline" size="sm" className="flex-1 border-primary text-primary hover:bg-primary/10 text-sm">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2"
            >
              <Map className="h-4 w-4" /> View Map
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="flex-1 border-primary text-primary hover:bg-primary/10 text-sm" disabled>
            <Map className="h-4 w-4" /> Map Unavailable
          </Button>
        )}
        {/* Show Delete if venue is deletable, Archive/Unarchive otherwise */}
        {canDelete === true && canDeletePermission ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 text-sm"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Venue</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete "{venue.name}"? This action cannot be undone.
                  This venue has no rated games so it is safe to delete.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteVenue}
                  disabled={isDeleting}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirm Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : canManageStatus ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isArchived ? "default" : "outline"}
                size="sm"
                className={cn(
                  "flex-1 text-sm",
                  isArchived ? 'bg-primary hover:bg-primary/90' : 'border-destructive text-destructive hover:bg-destructive/10'
                )}
                disabled={isUpdatingStatus}
              >
                {isUpdatingStatus ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : (isArchived ? <ArchiveRestore className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />)}
                {isUpdatingStatus ? (isArchived ? 'Unarchiving...' : 'Archiving...') : (isArchived ? 'Unarchive' : 'Archive')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to {isArchived ? 'unarchive' : 'archive'} the venue "{venue.name}"?
                  {isArchived ? ' Unarchiving will make it active again.' : ' This venue has rated games and cannot be deleted — archiving will hide it from new series.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isUpdatingStatus}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleToggleArchive} disabled={isUpdatingStatus} className={cn(isArchived ? "" : "bg-destructive hover:bg-destructive/90")}>
                  {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirm {isArchived ? 'Unarchive' : 'Archive'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </CardFooter>
    </Card>
  );
};

export default VenueCard;
