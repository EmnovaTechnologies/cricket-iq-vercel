/**
 * FILE: src/app/api/create-checkout/route.ts
 *
 * Creates a Stripe Checkout session for player registration.
 *
 * Body: { pendingId, orgId, seriesId, email, fee, currency }
 *
 * Flow:
 *  1. Validate input
 *  2. Update pendingRegistrations/{pendingId} with stripeSessionId (after session created)
 *  3. Return { url } — client redirects to Stripe
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pendingId, orgId, seriesId, email, fee, currency = 'usd' } = body;

    if (!pendingId || !orgId || !seriesId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: pendingId, orgId, seriesId, email.' },
        { status: 400 },
      );
    }

    // Verify the pending registration exists and hasn't expired
    const pendingSnap = await adminDb.doc(`pendingRegistrations/${pendingId}`).get();
    if (!pendingSnap.exists) {
      return NextResponse.json(
        { error: 'Registration session not found. Please start over.' },
        { status: 404 },
      );
    }
    const pendingData = pendingSnap.data()!;
    if (new Date(pendingData.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'Registration session has expired. Please start over.' },
        { status: 410 },
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

    // ── Zero-fee path: skip Stripe entirely ──
    if (fee === 0) {
      // Call our own free registration handler (Stripe webhook won't fire)
      const freeResp = await fetch(`${baseUrl}/api/complete-free-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingId }),
      });
      if (!freeResp.ok) {
        const errData = await freeResp.json();
        return NextResponse.json(
          { error: errData.error || 'Free registration processing failed.' },
          { status: 500 },
        );
      }
      return NextResponse.json({
        url: `${baseUrl}/register-player/${orgId}/success?session_id=free&pending_id=${pendingId}`,
      });
    }

    // ── Paid path ──
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Player Registration',
              description: `Series registration for Cricket IQ Hub`,
            },
            unit_amount: fee,
          },
          quantity: 1,
        },
      ],
      metadata: {
        pendingId,
        orgId,
        seriesId,
      },
      client_reference_id: pendingId,
      success_url: `${baseUrl}/register-player/${orgId}/success?session_id={CHECKOUT_SESSION_ID}&pending_id=${pendingId}`,
      cancel_url: `${baseUrl}/register-player/${orgId}?canceled=true`,
      // Stripe built-in receipt
      payment_intent_data: {
        receipt_email: email,
        metadata: { pendingId, orgId, seriesId },
      },
    });

    // Back-fill the session ID into the pending doc
    await pendingSnap.ref.update({ stripeSessionId: session.id });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[create-checkout] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create checkout session.' },
      { status: 500 },
    );
  }
}
