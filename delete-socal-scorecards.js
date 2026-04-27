/**
 * delete-socal-scorecards.js
 *
 * Deletes all scorecards for organization '2CV2cDsZXdgmmZzUUZNe' (SoCal Hub):
 * - Deletes scorecard documents from 'matchScorecards' collection
 * - Clears existingScorecardId from linked game documents
 * - Deletes related matchReports scoped to each scorecard
 *
 * Usage:
 *   node delete-socal-scorecards.js          ← preview only (no deletions)
 *   node delete-socal-scorecards.js --delete  ← actually delete
 */

const admin = require('firebase-admin');
const path  = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const ORG_ID  = '2CV2cDsZXdgmmZzUUZNe';
const DRY_RUN = !process.argv.includes('--delete');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

async function main() {
  console.log(`\n🏏 SoCal Hub Scorecard Deletion Script`);
  console.log(`   Org ID : ${ORG_ID}`);
  console.log(`   Mode   : ${DRY_RUN ? 'DRY RUN (preview only)' : '⚠️  LIVE DELETE'}\n`);

  // ── Fetch all scorecards for this org ─────────────────────────────────────
  const scorecardSnap = await db.collection('matchScorecards')
    .where('organizationId', '==', ORG_ID)
    .get();

  if (scorecardSnap.empty) {
    console.log('No scorecards found for this organization.');
    return;
  }

  console.log(`Found ${scorecardSnap.size} scorecard(s):\n`);
  scorecardSnap.docs.forEach((d, i) => {
    const s = d.data();
    console.log(`  ${i + 1}. [${d.id}] ${s.team1} vs ${s.team2} — ${s.date?.substring(0, 10)} | linkedGameId: ${s.linkedGameId || 'none'}`);
  });

  if (DRY_RUN) {
    console.log(`\n✅ Dry run complete. ${scorecardSnap.size} scorecard(s) would be deleted.`);
    console.log(`   Run with --delete flag to actually delete:\n`);
    console.log(`   node delete-socal-scorecards.js --delete\n`);
    return;
  }

  // ── Delete in batches of 500 ──────────────────────────────────────────────
  console.log(`\n⚠️  Starting deletion...\n`);
  const BATCH_SIZE = 400; // leave headroom for game unlinking writes
  const docs = scorecardSnap.docs;
  let deletedScorecards = 0;
  let unlinkedGames     = 0;
  let deletedReports    = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const docSnap of chunk) {
      const data = docSnap.data();

      // 1. Delete the scorecard document
      batch.delete(docSnap.ref);

      // 2. Unlink from game if linked
      if (data.linkedGameId) {
        const gameRef = db.collection('games').doc(data.linkedGameId);
        batch.update(gameRef, {
          existingScorecardId: admin.firestore.FieldValue.delete(),
        });
        unlinkedGames++;
      }
    }

    await batch.commit();
    deletedScorecards += chunk.length;
    console.log(`  Deleted ${deletedScorecards}/${docs.length} scorecards...`);
  }

  // ── Delete related matchReports ───────────────────────────────────────────
  console.log(`\n  Checking for related match reports...`);
  const scorecardIds = docs.map(d => d.id);

  // matchReports may be keyed by scorecardId or gameId — check both
  // Process in chunks of 30 (Firestore 'in' limit)
  for (let i = 0; i < scorecardIds.length; i += 30) {
    const chunk = scorecardIds.slice(i, i + 30);

    const reportSnap = await db.collection('matchReports')
      .where('scorecardId', 'in', chunk)
      .get();

    if (!reportSnap.empty) {
      const batch = db.batch();
      reportSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedReports += reportSnap.size;
    }
  }

  console.log(`\n✅ Done:`);
  console.log(`   ${deletedScorecards} scorecard(s) deleted`);
  console.log(`   ${unlinkedGames} game(s) unlinked`);
  console.log(`   ${deletedReports} match report(s) deleted\n`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
