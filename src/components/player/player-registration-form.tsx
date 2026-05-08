'use client';

/**
 * FILE: src/components/player/player-registration-form.tsx
 *
 * 3-step player registration form:
 *  Step 1 — Profile (existing fields, unchanged behaviour)
 *  Step 2 — Series selection (new; pre-selects from URL ?seriesId=)
 *  Step 3 — Payment summary + promo code → redirect to Stripe Checkout
 *
 * Key change from original:
 *  - Firebase Auth account is NOT created here anymore.
 *  - Step 3 calls /api/create-checkout → redirects to Stripe.
 *  - Stripe webhook creates the account after payment.
 */

import type { Organization, Team } from '@/types';
import type { PublicSeriesInfo } from '@/lib/actions/registration-payment-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Form, FormControl, FormField, FormItem,
  FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { GENDERS } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, ChevronRight, ChevronLeft, CheckCircle2, Tag, X } from 'lucide-react';
import { DatePickerField } from '@/components/date-picker-field';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  getActiveSeriesForOrgAction,
  validatePromoCodeAction,
  createPendingRegistrationAction,
  getRegistrationFeeAction,
} from '@/lib/actions/registration-payment-action';

// ─── Schema ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  gender: z.enum(GENDERS, { required_error: 'Gender is required.' }),
  dateOfBirth: z.date({ required_error: 'Date of Birth is required.' }),
  cricClubsId: z.string().min(1, 'CricClubs ID is required.'),
  email: z.string().email('Please enter a valid email address.'),
  primaryTeamId: z.string().optional(),
  clubName: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface PlayerRegistrationFormProps {
  organization: Organization;
  teams: Team[];
  defaultSeriesId?: string;        // from URL ?seriesId=
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Profile', 'Series', 'Payment'];
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {steps.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const active = step === current;
        const done = step < current;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors
                  ${done ? 'bg-primary border-primary text-primary-foreground'
                    : active ? 'border-primary text-primary bg-background'
                    : 'border-muted text-muted-foreground bg-background'}`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : step}
              </div>
              <span className={`text-xs ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-10 mb-4 mx-1 transition-colors ${done ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlayerRegistrationForm({
  organization,
  teams,
  defaultSeriesId,
}: PlayerRegistrationFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Step state ──
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [profileData, setProfileData] = useState<ProfileFormValues | null>(null);

  // ── Step 2 state ──
  const [activeSeries, setActiveSeries] = useState<PublicSeriesInfo[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(defaultSeriesId || '');
  const [seriesLoading, setSeriesLoading] = useState(false);

  // ── Step 3 state ──
  const [fee, setFee] = useState<number>(399);        // cents
  const [feeLoading, setFeeLoading] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoApplied, setPromoApplied] = useState<{
    promoCodeId: string;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    finalFee: number;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // ── "Cancelled" banner from Stripe redirect ──
  const wasCanceled = searchParams.get('canceled') === 'true';

  // ─── Step 1 form ──────────────────────────────────────────────────────────
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '', lastName: '', gender: undefined,
      cricClubsId: '', email: '',
      primaryTeamId: undefined, clubName: undefined,
    },
  });

  // ─── Load series when entering Step 2 ────────────────────────────────────
  const loadSeries = useCallback(async () => {
    setSeriesLoading(true);
    try {
      const series = await getActiveSeriesForOrgAction(organization.id);
      setActiveSeries(series);
      // Pre-select if URL param matches a real series
      if (defaultSeriesId && series.some((s) => s.id === defaultSeriesId)) {
        setSelectedSeriesId(defaultSeriesId);
      } else if (series.length === 1) {
        setSelectedSeriesId(series[0].id);
      }
    } catch {
      toast({ title: 'Could not load series', variant: 'destructive' });
    } finally {
      setSeriesLoading(false);
    }
  }, [organization.id, defaultSeriesId, toast]);

  // ─── Load fee when entering Step 3 ───────────────────────────────────────
  const loadFee = useCallback(async () => {
    setFeeLoading(true);
    try {
      const config = await getRegistrationFeeAction();
      setFee(config.defaultFee);
    } finally {
      setFeeLoading(false);
    }
  }, []);

  // ─── Step navigation ──────────────────────────────────────────────────────
  async function onStep1Submit(data: ProfileFormValues) {
    setProfileData(data);
    await loadSeries();
    setStep(2);
  }

  async function onStep2Continue() {
    if (!selectedSeriesId) {
      toast({ title: 'Please select a series to continue.', variant: 'destructive' });
      return;
    }
    await loadFee();
    setStep(3);
  }

  // ─── Promo code ───────────────────────────────────────────────────────────
  async function applyPromo() {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const result = await validatePromoCodeAction(
        promoInput, organization.id, selectedSeriesId, fee,
      );
      if (result.valid && result.promoCodeId) {
        setPromoApplied({
          promoCodeId: result.promoCodeId,
          discountType: result.discountType!,
          discountValue: result.discountValue!,
          finalFee: result.finalFee!,
        });
      } else {
        setPromoError(result.error || 'Invalid promo code.');
      }
    } finally {
      setPromoLoading(false);
    }
  }

  function removePromo() {
    setPromoApplied(null);
    setPromoInput('');
    setPromoError(null);
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────
  async function onStep3Submit() {
    if (!profileData) return;
    setCheckoutLoading(true);
    setServerError(null);

    try {
      const effectiveFee = promoApplied ? promoApplied.finalFee : fee;

      // 1. Create pending registration doc
      const pendingResult = await createPendingRegistrationAction({
        orgId: organization.id,
        seriesId: selectedSeriesId,
        playerData: profileData,
        fee: effectiveFee,
        originalFee: fee,
        promoCodeId: promoApplied?.promoCodeId,
      });

      if (!pendingResult.success || !pendingResult.pendingId) {
        throw new Error(pendingResult.error || 'Could not save registration. Please try again.');
      }

      // 2. Create Stripe Checkout session (or free bypass)
      const resp = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingId: pendingResult.pendingId,
          orgId: organization.id,
          seriesId: selectedSeriesId,
          email: profileData.email,
          fee: effectiveFee,
          currency: 'usd',
        }),
      });

      const json = await resp.json();
      if (!resp.ok || !json.url) {
        throw new Error(json.error || 'Could not start checkout. Please try again.');
      }

      // 3. Redirect to Stripe (or free success page)
      window.location.href = json.url;
    } catch (e: any) {
      setServerError(e.message);
      setCheckoutLoading(false);
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const displayFee = promoApplied ? promoApplied.finalFee : fee;
  const displayFeeStr = displayFee === 0 ? 'Free' : `$${(displayFee / 100).toFixed(2)}`;
  const originalFeeStr = `$${(fee / 100).toFixed(2)}`;
  const selectedSeries = activeSeries.find((s) => s.id === selectedSeriesId);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <StepIndicator current={step} />

      {wasCanceled && step === 1 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Payment Cancelled</AlertTitle>
          <AlertDescription>Your registration was not completed. You can try again below.</AlertDescription>
        </Alert>
      )}

      {/* ── STEP 1: PROFILE ── */}
      {step === 1 && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onStep1Submit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl><Input placeholder="John" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl><Input placeholder="Doe" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="cricClubsId" render={({ field }) => (
              <FormItem>
                <FormLabel>CricClubs ID</FormLabel>
                <FormControl><Input placeholder="Enter your CricClubs ID" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                <DatePickerField
                  field={field} label="Date of Birth" required
                  fromYear={1950} toYear={new Date().getFullYear()}
                />
              )} />
              <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="mt-auto">
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="clubName" render={({ field }) => (
              <FormItem>
                <FormLabel>Club (Optional)</FormLabel>
                <Select
                  onValueChange={field.onChange} value={field.value}
                  disabled={!organization.clubs || organization.clubs.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={
                        organization.clubs?.length ? 'Select your club' : 'No clubs available'
                      } />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {organization.clubs?.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="primaryTeamId" render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Team (Optional)</FormLabel>
                <Select
                  onValueChange={field.onChange} value={field.value}
                  disabled={teams.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={teams.length > 0 ? 'Select a team' : 'No teams available'} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.ageCategory})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <hr />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
                <FormDescription>Used for your Stripe receipt and account setup email.</FormDescription>
                <FormMessage />
              </FormItem>
            )} />

            <Button type="submit" className="w-full">
              Continue to Series Selection <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </Form>
      )}

      {/* ── STEP 2: SERIES ── */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-1">Select a Series</h3>
            <p className="text-sm text-muted-foreground">
              Choose the series you are registering for.
            </p>
          </div>

          {seriesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading series…
            </div>
          ) : activeSeries.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No active series</AlertTitle>
              <AlertDescription>
                There are no open series for registration right now. Please check back later or contact your organization.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {activeSeries.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSeriesId(s.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors
                    ${selectedSeriesId === s.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    <div className="flex gap-2">
                      <Badge variant="secondary">{s.ageCategory}</Badge>
                      <Badge variant="outline">{s.year}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={onStep2Continue}
              disabled={!selectedSeriesId || seriesLoading}
              className="flex-1"
            >
              Continue to Payment <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: PAYMENT ── */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-1">Registration Summary</h3>
            <p className="text-sm text-muted-foreground">
              Review and complete your registration.
            </p>
          </div>

          {/* Summary card */}
          <div className="rounded-lg border bg-muted/30 divide-y">
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Player</span>
              <span className="font-medium">{profileData?.firstName} {profileData?.lastName}</span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Series</span>
              <span className="font-medium">{selectedSeries?.name ?? selectedSeriesId}</span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Registration fee</span>
              {feeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="font-medium">
                  {promoApplied ? (
                    <>
                      <span className="line-through text-muted-foreground mr-2">{originalFeeStr}</span>
                      <span className="text-green-600">{displayFeeStr}</span>
                    </>
                  ) : (
                    displayFeeStr
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Promo code */}
          {!promoApplied ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Promo Code (optional)</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter promo code"
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value.toUpperCase());
                    setPromoError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyPromo())}
                  className="font-mono uppercase"
                />
                <Button
                  type="button" variant="outline"
                  onClick={applyPromo}
                  disabled={promoLoading || !promoInput.trim()}
                >
                  {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                </Button>
              </div>
              {promoError && (
                <p className="text-sm text-destructive">{promoError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between px-3 py-2 rounded-md bg-green-50 border border-green-200">
              <div className="flex items-center gap-2 text-green-700 text-sm">
                <Tag className="h-4 w-4" />
                <span className="font-mono font-semibold">{promoInput}</span>
                <span className="text-green-600">
                  {promoApplied.discountType === 'percent'
                    ? `−${promoApplied.discountValue}%`
                    : `−$${(promoApplied.discountValue / 100).toFixed(2)}`}
                </span>
              </div>
              <button type="button" onClick={removePromo} className="text-green-600 hover:text-green-800">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {serverError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(2)} disabled={checkoutLoading} className="flex-1">
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={onStep3Submit}
              disabled={checkoutLoading || feeLoading}
              className="flex-1"
            >
              {checkoutLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {displayFee === 0
                ? 'Complete Registration'
                : `Pay ${displayFeeStr} & Register`}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            {displayFee > 0
              ? 'You will be redirected to Stripe to complete payment securely. A receipt will be emailed to you.'
              : 'No payment required for this registration.'}
          </p>
        </div>
      )}
    </div>
  );
}
