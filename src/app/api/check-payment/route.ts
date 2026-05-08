/**
 * FILE: src/app/api/check-payment/route.ts
 *
 * Polled by the success page to confirm the webhook has processed
 * the payment and created the player account.
 *
 * Query: ?session_id=cs_live_...
 * Returns: { status: 'succeeded' | 'pending' | 'not_found' }
 */

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ status: 'not_found' }, { status: 400 });
  }

  try {
    const snap = await adminDb
      .collection('playerPayments')
      .where('stripeSessionId', '==', sessionId)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ status: 'pending' });
    }

    const payment = snap.docs[0].data();
    return NextResponse.json({ status: payment.status ?? 'pending' });
  } catch (e: any) {
    console.error('[check-payment]', e);
    return NextResponse.json({ status: 'pending' });
  }
}
