/**
 * FILE: src/app/api/complete-free-registration/route.ts
 */

import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';

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

export async function POST(request: Request) {
  try {
    const { pendingId } = await request.json();

    if (!pendingId) {
      return NextResponse.json({ error: 'Missing pendingId.' }, { status: 400 });
    }

    const pendingSnap = await adminDb.doc(`pendingRegistrations/${pendingId}`).get();
    if (!pendingSnap.exists) {
      return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
    }

    const pending = pendingSnap.data()!;

    // Idempotency
    const existing = await adminDb
      .collection('playerPayments')
      .where('stripeSessionId', '==', 'free-' + pendingId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ success: true });
    }

    const { orgId, seriesId, playerData, promoCodeId } = pending;
    const { firstName, lastName, dateOfBirth, gender, cricClubsId, email, primaryTeamId, clubName } = playerData;

    // ── Create or find player ──
    const existingPlayerSnap = await adminDb
      .collection('players')
      .where('cricClubsId', '==', cricClubsId.trim())
      .limit(1)
      .get();

    let playerId: string;

    if (!existingPlayerSnap.empty) {
      playerId = existingPlayerSnap.docs[0].id;
      const existingData = existingPlayerSnap.docs[0].data();
      if (existingData.userId) {
        await recordFreePayment(existingData.userId, playerId, seriesId, orgId, pendingId, promoCodeId);
        await pendingSnap.ref.delete();
        return NextResponse.json({ success: true });
      }
    } else {
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
    }

    // ── Create Firebase Auth user ──
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
        uid = (await adminAuth.getUserByEmail(email)).uid;
      } else {
        throw authErr;
      }
    }

    const now = admin.firestore.Timestamp.now();
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

    await recordFreePayment(uid, playerId, seriesId, orgId, pendingId, promoCodeId);
    await pendingSnap.ref.delete();

    // ── Send password reset email ──
    try {
      await sendPasswordResetEmail(email);
    } catch (e) {
      console.warn('[free-registration] Could not send password reset email:', e);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[complete-free-registration]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function recordFreePayment(
  uid: string,
  playerId: string,
  seriesId: string,
  orgId: string,
  pendingId: string,
  promoCodeId?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const paymentData: Record<string, any> = {
    playerId,
    userId: uid,
    seriesId,
    organizationId: orgId,
    stripeSessionId: 'free-' + pendingId,
    amount: 0,
    originalAmount: 0,
    status: 'succeeded',
    paidAt: now,
    createdAt: now,
  };
  if (promoCodeId) paymentData.promoCodeId = promoCodeId;
  await adminDb.collection('playerPayments').add(paymentData);
}
