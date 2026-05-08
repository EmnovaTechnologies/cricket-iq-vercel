/**
 * FILE: src/app/api/player-payments/route.ts
 *
 * GET ?playerId=xxx — returns payments for a player.
 * Used by the profile page to show payment history.
 * Admin SDK so no client Firestore rules needed.
 */

import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId.' }, { status: 400 });
  }

  // Verify the caller owns this player profile
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);

    // Verify the user owns this playerId
    const userSnap = await adminDb.doc(`users/${decoded.uid}`).get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const userData = userSnap.data()!;
    const isSuperAdmin = userData.roles?.includes('admin');
    const isOwner = userData.playerId === playerId;

    if (!isSuperAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const snap = await adminDb
      .collection('playerPayments')
      .where('playerId', '==', playerId)
      .orderBy('createdAt', 'desc')
      .get();

    if (snap.empty) return NextResponse.json({ payments: [] });

    // Enrich with series names
    const seriesIds = [...new Set(snap.docs.map(d => d.data().seriesId).filter(Boolean))];
    const seriesSnaps = await Promise.all(seriesIds.map(id => adminDb.doc(`series/${id}`).get()));
    const seriesMap: Record<string, string> = {};
    seriesSnaps.forEach(s => { if (s.exists) seriesMap[s.id] = s.data()!.name; });

    const payments = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      seriesName: seriesMap[d.data().seriesId] || 'Series Registration',
    }));

    return NextResponse.json({ payments });
  } catch (e: any) {
    console.error('[player-payments]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
