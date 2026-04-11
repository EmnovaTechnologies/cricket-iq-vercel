'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { VenueForm } from '@/components/venue-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { getVenueByIdFromDB, getAllGamesFromDB } from '@/lib/db';
import type { Venue } from '@/types';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldAlert, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
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
import { useToast } from '@/hooks/use-toast';
import { deleteDoc, doc, getDocs, collection, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { deleteVenueAdminAction } from '@/lib/actions/venue-admin-actions';
import { parseISO, isFuture, format } from 'date-fns';

export default function EditVenuePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { userProfile, effectivePermissions } = useAuth();
  const venueId = params.id;

  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (venueId) {
      getVenueByIdFromDB(venueId)
        .then(venueData => {
          if (venueData) {
            setVenue(venueData);
          } else {
            setError("Venue not found.");
          }
        })
        .catch(err => {
          console.error("Error fetching venue:", err);
          setError("Failed to load venue details.");
        })
        .finally(() => setLoading(false));
    }
  }, [venueId]);

  const handleDeleteVenue = async () => {
    if (!userProfile || !venue) return;
    if (!effectivePermissions[PERMISSIONS.VENUES_DELETE_ANY]) {
        toast({ title: "Permission Denied", description: "You do not have permission to delete venues.", variant: "destructive" });
        return;
    }
    setIsDeleting(true);
    try {
      const result = await deleteVenueAdminAction(venue.id, venue.name, venue.organizationId);
      if (result.success) {
        toast({ title: "Venue Deleted", description: `Venue "${venue.name}" has been successfully deleted.` });
        router.push('/venues');
      } else {
        toast({ title: "Deletion Failed", description: result.error, variant: "destructive", duration: 9000 });
        setIsDeleting(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({ title: "Deletion Failed", description: message, variant: "destructive" });
      setIsDeleting(false);
    }
  };


  const isSuperAdmin = userProfile?.roles?.includes('admin') ?? false;
  const isOrgAdmin = userProfile?.roles?.includes('Organization Admin') ?? false;
  const { activeOrganizationId } = useAuth();
  const canDeleteVenue = effectivePermissions[PERMISSIONS.VENUES_DELETE_ANY] ||
    (isOrgAdmin && !!venue && venue.organizationId === activeOrganizationId);

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.VENUES_EDIT_ANY}
      FallbackComponent={
        <div className="max-w-2xl mx-auto">
          <Alert variant="destructive" className="mt-8">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>
              You do not have permission to edit venues.
            </AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto">
         <div className="mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/venues">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Venues List
            </Link>
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-headline text-primary">Edit Venue</CardTitle>
            <CardDescription>
              Update the details for "{loading ? '...' : venue?.name}".
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <ShieldAlert className="h-5 w-5" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : venue ? (
              <VenueForm initialData={venue} />
            ) : (
              <p>Venue could not be loaded.</p>
            )}
          </CardContent>
          {venue && canDeleteVenue && (
            <CardFooter className="border-t pt-4 mt-6 flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                   <Button variant="destructive" disabled={isDeleting}>
                     <Trash2 className="mr-2 h-4 w-4" />
                     {isDeleting ? "Deleting..." : "Delete Venue"}
                   </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                           This action cannot be undone. This will permanently delete the venue "{venue.name}".
                           Deletion will fail if the venue is currently used in any series or future games.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteVenue}
                            disabled={isDeleting}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            Confirm Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          )}
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}