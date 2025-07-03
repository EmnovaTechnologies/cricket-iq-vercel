
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Venue, VenueStatus } from '../../types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context'; 
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'; 
import { Info, Loader2 } from 'lucide-react'; 
import { useState } from 'react';
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Schema without status, as it's handled on creation.
const venueFormSchema = z.object({
  name: z.string().min(3, { message: 'Venue name must be at least 3 characters.' }).trim(),
  address: z.string().min(5, { message: 'Address must be at least 5 characters.' }).trim(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

type VenueFormValues = z.infer<typeof venueFormSchema>;

interface VenueFormProps {
  initialData?: Venue;
  onSubmitSuccess?: (venue: Venue, seriesIdLinked?: string) => void;
  preselectedSeriesIdToLink?: string;
}

export function VenueForm({ initialData, onSubmitSuccess, preselectedSeriesIdToLink }: VenueFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { activeOrganizationId, loading: authLoading } = useAuth(); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VenueFormValues>({
    resolver: zodResolver(venueFormSchema),
    defaultValues: initialData ? {
      ...initialData,
      name: initialData.name.trim(),
      address: initialData.address.trim(),
    } : {
      name: '',
      address: '',
      latitude: undefined,
      longitude: undefined,
    },
  });

  async function onSubmit(data: VenueFormValues) {
    if (!activeOrganizationId) {
      toast({
        title: 'No Active Organization',
        description: 'Please select an active organization before adding a venue.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Firestore does not accept `undefined` fields.
      // We must construct a clean object that only includes defined values.
      const dataToSave: { [key: string]: any } = {
        name: data.name.trim(),
        address: data.address.trim(),
      };
      if (data.latitude !== undefined && !isNaN(data.latitude)) {
        dataToSave.latitude = data.latitude;
      }
      if (data.longitude !== undefined && !isNaN(data.longitude)) {
        dataToSave.longitude = data.longitude;
      }


      if (initialData) {
        // Update logic
        const venueDocRef = doc(db, 'venues', initialData.id);
        await updateDoc(venueDocRef, dataToSave);
        toast({ title: 'Venue Updated', description: `${data.name} has been updated.` });
        if (onSubmitSuccess) {
          // Re-construct the full object for the callback
          const updatedVenue: Venue = { ...initialData, ...dataToSave } as Venue;
          onSubmitSuccess(updatedVenue);
        } else {
          router.push('/venues');
        }
      } else {
        // Create logic
        dataToSave.organizationId = activeOrganizationId;
        dataToSave.status = 'active' as VenueStatus;
        dataToSave.createdAt = serverTimestamp();
        
        const venueRef = await addDoc(collection(db, 'venues'), dataToSave);
        const newVenueId = venueRef.id;

        let seriesLinkMessage = '';
        if (preselectedSeriesIdToLink) {
          const seriesRef = doc(db, 'series', preselectedSeriesIdToLink);
          const seriesSnap = await getDoc(seriesRef);
          if (seriesSnap.exists() && seriesSnap.data().status === 'active' && seriesSnap.data().organizationId === activeOrganizationId) {
            await updateDoc(seriesRef, { venueIds: arrayUnion(newVenueId) });
            seriesLinkMessage = ` It has also been added to the series: ${seriesSnap.data().name}.`;
          } else {
            seriesLinkMessage = ` Could not automatically add it to the series because the series was not found, is inactive, or in a different organization.`;
          }
        }
        
        toast({ title: 'Venue Created', description: `${data.name} has been added.` + seriesLinkMessage });
        
        const createdVenueObjectForCallback: Venue = {
          id: newVenueId,
          name: data.name,
          address: data.address,
          organizationId: activeOrganizationId,
          status: 'active',
          createdAt: new Date().toISOString(),
          latitude: data.latitude,
          longitude: data.longitude,
        };

        if (onSubmitSuccess) {
          onSubmitSuccess(createdVenueObjectForCallback, preselectedSeriesIdToLink);
        } else {
          if (preselectedSeriesIdToLink) {
            router.push(`/series/${preselectedSeriesIdToLink}/details`);
          } else {
            router.push('/venues');
          }
        }
      }
      router.refresh();
    } catch (error) {
      console.error("Error submitting venue form:", error);
      toast({ title: 'Error', description: 'Could not save venue details. Check permissions and network.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  }
  
  if (authLoading) {
    return <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin mr-2"/>Loading...</div>;
  }

  if (!activeOrganizationId) {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-5 w-5 text-primary" />
        <AlertTitle>No Organization Selected</AlertTitle>
        <AlertDescription>
          Please select an active organization from the dropdown in the navbar to add a new venue.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Venue Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Central Park Cricket Ground" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input placeholder="e.g. 123 Main St, Anytown, USA" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="latitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Latitude (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. 34.0522"
                    {...field}
                    value={String(field.value ?? '')}
                    onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>For map integration.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="longitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Longitude (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    placeholder="e.g. -118.2437"
                    {...field}
                    value={String(field.value ?? '')}
                    onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>For map integration.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90" disabled={isSubmitting || authLoading}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? 'Save Changes' : 'Add Venue'}
        </Button>
      </form>
    </Form>
  );
}
