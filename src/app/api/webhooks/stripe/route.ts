/**
 * FILE: src/app/api/webhooks/stripe/route.ts
 */

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export const runtime = 'nodejs';

// ─── Helper: send password reset email via Firebase Auth REST API ─────────────
async function sendPasswordResetEmail(email: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  console.log('[sendPasswordResetEmail] Sending to:', email, 'apiKey exists:', !!apiKey);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email,
      }),
    }
  );
  const data = await res.json();
  console.log('[sendPasswordResetEmail] Response:', JSON.stringify(data));
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to send password reset email');
  }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    if (!sig) {
      return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error('[stripe-webhook] Signature verification failed:', err.message);
      return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[stripe-webhook] Unexpected error:', err);
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 500 });
  }
}

// ─── Handler: checkout.session.completed ─────────────────────────────────────
async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const pendingId = session.metadata?.pendingId || session.client_reference_id;

  if (!pendingId) {
    console.error('[stripe-webhook] No pendingId in session metadata:', session.id);
    return;
  }

  const pendingSnap = await adminDb.doc(`pendingRegistrations/${pendingId}`).get();
  if (!pendingSnap.exists) {
    console.error(`[stripe-webhook] pendingRegistration not found: ${pendingId}`);
    return;
  }

  const pending = pendingSnap.data()!;

  const existingPayment = await adminDb
    .collection('playerPayments')
    .where('stripeSessionId', '==', session.id)
    .limit(1)
    .get();

  if (!existingPayment.empty) {
    console.log(`[stripe-webhook] Already processed session ${session.id} — skipping.`);
    return;
  }

  const { orgId, seriesId, playerData, fee, originalFee, promoCodeId } = pending;
  const { firstName, lastName, dateOfBirth, gender, cricClubsId, email, primaryTeamId, clubName } = playerData;

  const result = await createAndLinkPlayerFromWebhook({
    orgId, seriesId, firstName, lastName, dateOfBirth, gender,
    cricClubsId, email, primaryTeamId, clubName,
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent as string | undefined,
    fee, originalFee, promoCodeId,
    receiptUrl: session.payment_intent
      ? await getReceiptUrl(session.payment_intent as string)
      : undefined,
  });

  if (!result.success) {
    console.error('[stripe-webhook] Player creation failed:', result.error);
    return;
  }

  if (promoCodeId) {
    await adminDb
      .doc(`promoCodes/${promoCodeId}`)
      .update({ usedCount: admin.firestore.FieldValue.increment(1) })
      .catch((e) => console.warn('[stripe-webhook] Could not increment promoCode usedCount:', e));
  }

  await pendingSnap.ref.delete().catch(() => { /* non-fatal */ });

  console.log(`[stripe-webhook] Successfully processed session ${session.id} for ${email}`);
}

// ─── Core: createAndLinkPlayerFromWebhook ────────────────────────────────────
interface WebhookPlayerInput {
  orgId: string;
  seriesId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  cricClubsId: string;
  email: string;
  primaryTeamId?: string;
  clubName?: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string;
  fee: number;
  originalFee: number;
  promoCodeId?: string;
  receiptUrl?: string;
}

interface WebhookPlayerResult {
  success: boolean;
  uid?: string;
  playerId?: string;
  error?: string;
}

async function createAndLinkPlayerFromWebhook(
  input: WebhookPlayerInput,
): Promise<WebhookPlayerResult> {
  const {
    orgId, seriesId, firstName, lastName, dateOfBirth, gender,
    cricClubsId, email, primaryTeamId, clubName,
    stripeSessionId, stripePaymentIntentId, fee, originalFee,
    promoCodeId, receiptUrl,
  } = input;

  try {
    // ── A. Find existing player by CricClubs ID ──
    const existingSnap = await adminDb
      .collection('players')
      .where('cricClubsId', '==', cricClubsId.trim())
      .limit(1)
      .get();

    let playerId: string;

    if (!existingSnap.empty) {
      const existingPlayer = existingSnap.docs[0];
      const data = existingPlayer.data();

      if (data.userId) {
        playerId = existingPlayer.id;
        const uid = data.userId as string;
        await recordPayment({ playerId, uid, seriesId, orgId, stripeSessionId, stripePaymentIntentId, fee, originalFee, promoCodeId, receiptUrl });
        return { success: true, uid, playerId };
      }

      playerId = existingPlayer.id;
    } else {
      // ── B. Create new player doc ──
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const nameTokens = fullName.toLowerCase().split(' ').filter(Boolean);

      const newPlayerData: Record<string, any> = {
        name: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        searchableNameTokens: [...nameTokens, fullName.toLowerCase()],
        cricClubsId: cricClubsId.trim(),
        dateOfBirth,
        gender,
        organizationId: orgId,
        gamesPlayed: 0,
      };
      if (primaryTeamId) newPlayerData.primaryTeamId = primaryTeamId;
      if (clubName) newPlayerData.clubName = clubName;

      const playerRef = await adminDb.collection('players').add(newPlayerData);
      playerId = playerRef.id;

      if (primaryTeamId) {
        const teamSnap = await adminDb.collection('teams').doc(primaryTeamId).get();
        if (teamSnap.exists) {
          await teamSnap.ref.update({ playerIds: admin.firestore.FieldValue.arrayUnion(playerId) });
        }
      }
    }

    // ── C. Create Firebase Auth user ──
    const tempPassword = randomBytes(16).toString('hex');
    let uid: string;
    try {
      const userRecord = await adminAuth.createUser({
        email,
        password: tempPassword,
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        emailVerified: false,
      });
      uid = userRecord.uid;
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-exists') {
        const existingUser = await adminAuth.getUserByEmail(email);
        uid = existingUser.uid;
      } else {
        throw authErr;
      }
    }

    const now = admin.firestore.Timestamp.now();

    // ── D. Atomic batch: users doc + player link ──
    const batch = adminDb.batch();
    const userDocRef = adminDb.collection('users').doc(uid);
    const userSnap = await userDocRef.get();

    if (!userSnap.exists) {
      batch.set(userDocRef, {
        uid, email,
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        roles: ['player'],
        playerId,
        assignedOrganizationIds: [orgId],
        activeOrganizationId: orgId,
        assignedSeriesIds: [seriesId],
        assignedTeamIds: [],
        assignedGameIds: [],
        phoneNumber: null,
        createdAt: now,
        lastLogin: now,
      });
    } else {
      batch.update(userDocRef, {
        assignedSeriesIds: admin.firestore.FieldValue.arrayUnion(seriesId),
      });
    }

    batch.update(adminDb.collection('players').doc(playerId), { userId: uid });
    await batch.commit();

    // ── E. Record payment ──
    await recordPayment({ playerId, uid, seriesId, orgId, stripeSessionId, stripePaymentIntentId, fee, originalFee, promoCodeId, receiptUrl });

    // ── F. Send password reset email ──
    try {
      await sendPasswordResetEmail(email);
    } catch (e) {
      console.warn('[webhook] Could not send password reset email:', e);
    }

    return { success: true, uid, playerId };
  } catch (e: any) {
    console.error('[createAndLinkPlayerFromWebhook]', e);
    return { success: false, error: e.message };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
interface RecordPaymentInput {
  playerId: string;
  uid: string;
  seriesId: string;
  orgId: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string;
  fee: number;
  originalFee: number;
  promoCodeId?: string;
  receiptUrl?: string;
}

async function recordPayment(input: RecordPaymentInput): Promise<void> {
  const now = new Date().toISOString();
  const paymentData: Record<string, any> = {
    playerId: input.playerId,
    userId: input.uid,
    seriesId: input.seriesId,
    organizationId: input.orgId,
    stripeSessionId: input.stripeSessionId,
    amount: input.fee,
    originalAmount: input.originalFee,
    status: 'succeeded',
    paidAt: now,
    createdAt: now,
  };
  if (input.stripePaymentIntentId) paymentData.stripePaymentIntentId = input.stripePaymentIntentId;
  if (input.promoCodeId) paymentData.promoCodeId = input.promoCodeId;
  if (input.receiptUrl) paymentData.receiptUrl = input.receiptUrl;

  await adminDb.collection('playerPayments').add(paymentData);
}

async function getReceiptUrl(paymentIntentId: string): Promise<string | undefined> {
  try {
    const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 });
    return charges.data[0]?.receipt_url ?? undefined;
  } catch {
    return undefined;
  }
}
