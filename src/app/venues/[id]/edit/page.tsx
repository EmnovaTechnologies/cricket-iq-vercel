
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
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { deleteDoc, doc, getDocs, collection, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
  
  // New state for intelligent delete button
  const [isInUse, setIsInUse] = useState(true); // Default to true (safe)
  const [usageCheckMessage, setUsageCheckMessage] = useState<string | null>("Checking venue usage...");

  useEffect(() => {
    if (venueId) {
      const fetchVenueAndCheckUsage = async () => {
        setLoading(true);
        try {
          const venueData = await getVenueByIdFromDB(venueId);
          if (!venueData) {
            setError("Venue not found.");
            setLoading(false);
            return;
          }
          setVenue(venueData);

          // --- Venue Usage Check ---
          // 1. Check Series Usage
          const seriesQuery = query(
            collection(db, 'series'),
            where('venueIds', 'array-contains', venueData.id),
            limit(1)
          );
          const seriesSnapshot = await getDocs(seriesQuery);
          if (!seriesSnapshot.empty) {
            const seriesName = seriesSnapshot.docs[0].data().name;
            setIsInUse(true);
            setUsageCheckMessage(`Venue is assigned to at least one series ("${seriesName}").`);
            return; // No need to check further
          }

          // 2. Check Future Games Usage
          const allGamesForOrg = await getAllGamesFromDB('active', venueData.organizationId);
          const futureGamesAtVenue = allGamesForOrg.filter(game => {
            if (game.venue?.trim().toLowerCase() === venueData.name.trim().toLowerCase()) {
              try {
                return isFuture(parseISO(game.date));
              } catch (e) {
                return false;
              }
            }
            return false;
          });

          if (futureGamesAtVenue.length > 0) {
            const gameNames = futureGamesAtVenue.slice(0, 1).map(g => `"${g.team1} vs ${g.team2}" on ${format(parseISO(g.date), 'PPP')}`).join(', ');
            setIsInUse(true);
            setUsageCheckMessage(`Venue is scheduled for future games (e.g., ${gameNames}). Please update these games first.`);
            return;
          }
          
          // If no usage found
          setIsInUse(false);
          setUsageCheckMessage("Venue is not currently in use and can be deleted.");

        } catch (err: any) {
          console.error("Error fetching venue or usage:", err);
          setError("Failed to load venue details or check usage.");
        } finally {
          setLoading(false);
        }
      };

      fetchVenueAndCheckUsage();
    }
  }, [venueId]);

  const handleDeleteVenue = async () => {
    if (!userProfile || !venue || isInUse) return;
    if (!effectivePermissions[PERMISSIONS.VENUES_DELETE_ANY]) {
        toast({ title: "Permission Denied", description: "You do not have permission to delete venues.", variant: "destructive" });
        return;
    }
    setIsDeleting(true);

    try {
        // Final safety check (redundant but good practice)
        const seriesQuery = query(collection(db, 'series'), where('venueIds', 'array-contains', venue.id), limit(1));
        const seriesSnapshot = await getDocs(seriesQuery);
        if (!seriesSnapshot.empty) {
            toast({ title: "Deletion Failed", description: "Venue is still in use by a series.", variant: "destructive" });
            setIsDeleting(false);
            return;
        }
        
        // Delete the venue
        const venueDocRef = doc(db, 'venues', venue.id);
        await deleteDoc(venueDocRef);

        toast({ title: "Venue Deleted", description: `Venue "${venue.name}" has been successfully deleted.` });
        router.push('/venues');

    } catch (error) {
        console.error("Error deleting venue:", error);
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        toast({ title: "Deletion Failed", description: message, variant: "destructive" });
        setIsDeleting(false);
    }
  };

  const canDeleteVenue = effectivePermissions[PERMISSIONS.VENUES_DELETE_ANY];
  
  const renderDeleteButton = () => {
    if (!venue || !canDeleteVenue) {
      return null;
    }

    const deleteButton = (
      <Button variant="destructive" disabled={isDeleting || isInUse}>
        <Trash2 className="mr-2 h-4 w-4" />
        {isDeleting ? "Deleting..." : "Delete Venue"}
      </Button>
    );

    if (isInUse) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* The span is necessary to make the tooltip work on a disabled button */}
              <span tabIndex={0}>{deleteButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{usageCheckMessage}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {deleteButton}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the venue "{venue.name}".
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
    );
  };

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
          <CardFooter className="border-t pt-4 mt-6 flex justify-end">
            {renderDeleteButton()}
          </CardFooter>
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
