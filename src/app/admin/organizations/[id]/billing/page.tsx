'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getOrganizationByIdFromDB } from '@/lib/db'; // Corrected import
import { useAuth } from '@/contexts/auth-context';
import type { Organization } from '@/types';
import { AuthProviderClientComponent } from '@/components/auth-provider-client-component';
import { PERMISSIONS } from '@/lib/permissions-master-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldAlert, ArrowLeft, CreditCard, Star, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { loadStripe } from '@stripe/stripe-js';

// Placeholder for your Stripe public key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

export default function BillingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const orgId = params.id;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (orgId) {
      getOrganizationByIdFromDB(orgId as string) // Corrected function call
        .then(setOrganization)
        .catch(err => {
          console.error("Failed to fetch organization:", err);
          toast({ title: "Error", description: "Could not load organization details.", variant: "destructive" });
        })
        .finally(() => setLoading(false));
    }
  }, [orgId, toast]);

  const handleCreateCheckoutSession = async () => {
    setIsRedirecting(true);
    toast({ title: 'Redirecting to Checkout...', description: 'Please wait.' });

    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: orgId, orgName: organization?.name, userId: userProfile?.uid }),
      });

      const { sessionId, error } = await res.json();

      if (error) {
        throw new Error(error);
      }

      if (sessionId) {
        const stripe = await stripePromise;
        if (stripe) {
          const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });
          if (stripeError) {
            throw new Error(stripeError.message);
          }
        }
      } else {
         throw new Error('Checkout session ID not found.');
      }
    } catch (err: any) {
      console.error("Stripe Checkout Error:", err);
      toast({ title: 'Error', description: err.message || 'Could not redirect to checkout.', variant: 'destructive' });
      setIsRedirecting(false);
    }
  };


  const subscriptionTier = organization?.subscriptionTier || 'free';
  const subscriptionStatus = organization?.subscriptionStatus || 'active';

  return (
    <AuthProviderClientComponent
      requiredPermission={PERMISSIONS.PAGE_VIEW_ADMIN_ORGANIZATION_BILLING}
      FallbackComponent={
        <div className="max-w-2xl mx-auto mt-8">
          <Alert variant="destructive">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to manage billing for this organization.</AlertDescription>
          </Alert>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.push(`/admin/organizations/${orgId}/details`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Organization Details
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              Billing & Subscription
            </CardTitle>
            <CardDescription>Manage the subscription plan for {organization?.name || 'this organization'}.</CardDescription>
          </CardHeader>
          {loading ? (
            <CardContent className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </CardContent>
          ) : organization ? (
            <>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h3 className="font-semibold">Current Plan</h3>
                  <p className="text-2xl font-bold text-primary capitalize flex items-center gap-2 mt-1">
                    {subscriptionTier === 'pro' && <Star className="text-amber-400 fill-amber-400" />}
                    {subscriptionTier} Plan
                  </p>
                  <Badge variant={subscriptionStatus === 'active' ? 'default' : 'destructive'} className="mt-2 capitalize">{subscriptionStatus}</Badge>
                </div>
                {subscriptionTier === 'free' && (
                  <div className="p-4 border rounded-lg bg-card">
                    <h3 className="font-semibold">Upgrade to Pro</h3>
                    <p className="text-muted-foreground text-sm mt-1">Unlock AI features, advanced analytics, and support for more teams and players.</p>
                    <Button onClick={handleCreateCheckoutSession} disabled={isRedirecting} className="mt-4 w-full sm:w-auto">
                      {isRedirecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Upgrade to Pro
                    </Button>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                 <Button variant="outline" disabled={subscriptionTier === 'free'}>
                   <ExternalLink className="mr-2 h-4 w-4" />
                   Manage Billing in Stripe Portal
                 </Button>
              </CardFooter>
            </>
          ) : (
             <CardContent>
                <p className="text-destructive">Could not load organization details.</p>
             </CardContent>
          )}
        </Card>
      </div>
    </AuthProviderClientComponent>
  );
}
