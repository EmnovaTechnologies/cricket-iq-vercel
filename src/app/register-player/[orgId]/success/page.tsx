'use client';

/**
 * FILE: src/app/register-player/[orgId]/success/page.tsx
 *
 * Shown after Stripe Checkout completes (or after free registration).
 *
 * URL: /register-player/[orgId]/success?session_id=...&pending_id=...
 *
 * For paid registrations:
 *   - Stripe redirects here with ?session_id=cs_live_...
 *   - The webhook runs asynchronously; account may not be ready yet.
 *   - We poll for up to 30s waiting for the playerPayments doc to appear.
 *
 * For free registrations:
 *   - ?session_id=free — no polling needed; webhook doesn't fire.
 *   - create-checkout route already triggered account creation server-side.
 *   - We just show the confirmation immediately.
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2, Mail, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Status = 'polling' | 'ready' | 'timeout' | 'free';

export default function RegistrationSuccessPage() {
  const params = useParams<{ orgId: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const isFree = sessionId === 'free';

  const [status, setStatus] = useState<Status>(isFree ? 'free' : 'polling');
  const [pollCount, setPollCount] = useState(0);

  // For paid registrations: poll the /api/check-payment endpoint until
  // the webhook has confirmed payment and created the account.
  useEffect(() => {
    if (isFree || !sessionId) return;

    const MAX_POLLS = 15;   // 15 × 2s = 30s timeout
    let polls = 0;

    const interval = setInterval(async () => {
      polls++;
      setPollCount(polls);

      try {
        const resp = await fetch(`/api/check-payment?session_id=${sessionId}`);
        const data = await resp.json();
        if (data.status === 'succeeded') {
          clearInterval(interval);
          setStatus('ready');
        }
      } catch {
        // ignore transient errors; keep polling
      }

      if (polls >= MAX_POLLS) {
        clearInterval(interval);
        setStatus('timeout');
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, isFree]);

  return (
    <div className="max-w-lg mx-auto pt-10 pb-20 px-4">
      <Card>
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            {status === 'polling' ? (
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
            ) : (
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            )}
          </div>
          <CardTitle className="text-2xl font-headline text-primary">
            {status === 'polling' ? 'Processing Payment…' : 'Registration Complete!'}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 text-center">
          {/* ── Polling state ── */}
          {status === 'polling' && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Your payment was received. We're setting up your account — this usually takes just a few seconds.
              </p>
              <p className="text-xs text-muted-foreground">
                ({pollCount * 2}s elapsed…)
              </p>
            </div>
          )}

          {/* ── Ready state ── */}
          {status === 'ready' && (
            <>
              <Alert className="border-green-300 bg-green-50 text-left">
                <Mail className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Check your email</AlertTitle>
                <AlertDescription className="text-green-700">
                  Your account has been created. We've sent a link to set your password and verify your email.
                  Please check your inbox (and spam folder).
                </AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground">
                Once you've set your password, you can log in to access your Cricket IQ dashboard.
              </p>
              <Button asChild className="w-full">
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" /> Go to Login
                </Link>
              </Button>
            </>
          )}

          {/* ── Free state ── */}
          {status === 'free' && (
            <>
              <Alert className="border-green-300 bg-green-50 text-left">
                <Mail className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Check your email</AlertTitle>
                <AlertDescription className="text-green-700">
                  Your registration is complete. We've sent a link to set your password and verify your email.
                  Please check your inbox (and spam folder).
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full">
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" /> Go to Login
                </Link>
              </Button>
            </>
          )}

          {/* ── Timeout state ── */}
          {status === 'timeout' && (
            <>
              <Alert>
                <AlertTitle>Still processing…</AlertTitle>
                <AlertDescription>
                  Your payment was received but your account is taking a little longer than usual to set up.
                  You should receive a password setup email within a few minutes.
                  If you don't, please contact support.
                </AlertDescription>
              </Alert>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Go to Login</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
