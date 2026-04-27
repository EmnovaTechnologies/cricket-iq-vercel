/**
 * delete-socal-games.js
 * 
 * Deletes all games for organization '2CV2cDsZXdgmmZzUUZNe' (SoCal Hub)
 * 
 * Usage:
 *   node delete-socal-games.js          ← preview only (no deletions)
 *   node delete-socal-games.js --delete  ← actually delete
 */

const admin = require('firebase-admin');
const path  = require('path');

// ── Load env vars from .env.local ──────────────────────────────────────────
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const ORG_ID = '2CV2cDsZXdgmmZzUUZNe';
const DRY_RUN = !process.argv.includes('--delete');

// ── Init Admin SDK ─────────────────────────────────────────────────────────
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
  console.log(`\n🏏 SoCal Hub Game Deletion Script`);
  console.log(`   Org ID : ${ORG_ID}`);
  console.log(`   Mode   : ${DRY_RUN ? 'DRY RUN (preview only)' : '⚠️  LIVE DELETE'}\n`);

  // Fetch all games for this org
  const snap = await db.collection('games')
    .where('organizationId', '==', ORG_ID)
    .get();

  if (snap.empty) {
    console.log('No games found for this organization.');
    return;
  }

  console.log(`Found ${snap.size} games:\n`);
  snap.docs.forEach((d, i) => {
    const g = d.data();
    console.log(`  ${i + 1}. [${d.id}] ${g.team1} vs ${g.team2} — ${g.date?.substring(0, 10)} (${g.seriesId})`);
  });

  if (DRY_RUN) {
    console.log(`\n✅ Dry run complete. ${snap.size} games would be deleted.`);
    console.log(`   Run with --delete flag to actually delete them:\n`);
    console.log(`   node delete-socal-games.js --delete\n`);
    return;
  }

  // Delete in batches of 500
  console.log(`\n⚠️  Deleting ${snap.size} games...`);
  const batchSize = 500;
  const docs = snap.docs;
  let deleted = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
    console.log(`  Deleted ${deleted}/${docs.length}...`);
  }

  console.log(`\n✅ Done — ${deleted} games deleted from SoCal Hub.\n`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
