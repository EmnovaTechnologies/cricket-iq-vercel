/**
 * delete-socal-players.js
 *
 * Deletes all players for organization '2CV2cDsZXdgmmZzUUZNe' (SoCal Hub):
 * - Deletes player documents from 'players' collection
 * - Removes playerIds from team rosters (playerIds array on team docs)
 * - Removes playerIds from game rosters (team1Players/team2Players on game docs)
 * - Deletes related playerRatings documents
 * - Leaves Firebase Auth user accounts intact
 *
 * Usage:
 *   node delete-socal-players.js          ← preview only (no deletions)
 *   node delete-socal-players.js --delete  ← actually delete
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
  console.log(`\n🏏 SoCal Hub Player Deletion Script`);
  console.log(`   Org ID : ${ORG_ID}`);
  console.log(`   Mode   : ${DRY_RUN ? 'DRY RUN (preview only)' : '⚠️  LIVE DELETE'}\n`);

  // ── Fetch all players for this org ────────────────────────────────────────
  const playerSnap = await db.collection('players')
    .where('organizationId', '==', ORG_ID)
    .get();

  if (playerSnap.empty) {
    console.log('No players found for this organization.');
    return;
  }

  const playerIds = playerSnap.docs.map(d => d.id);
  const playerSet = new Set(playerIds);

  console.log(`Found ${playerSnap.size} player(s):\n`);
  playerSnap.docs.forEach((d, i) => {
    const p = d.data();
    console.log(`  ${i + 1}. [${d.id}] ${p.name} | userId: ${p.userId || 'none'}`);
  });

  if (DRY_RUN) {
    console.log(`\n✅ Dry run complete. ${playerSnap.size} player(s) would be deleted.`);

    // Preview team roster impact
    const teamSnap = await db.collection('teams')
      .where('organizationId', '==', ORG_ID).get();
    let teamImpact = 0;
    teamSnap.docs.forEach(d => {
      const ids = d.data().playerIds || [];
      const affected = ids.filter(id => playerSet.has(id)).length;
      if (affected > 0) teamImpact++;
    });
    console.log(`   ${teamImpact} team roster(s) would be updated`);

    // Preview game roster impact
    const gameSnap = await db.collection('games')
      .where('organizationId', '==', ORG_ID).get();
    let gameImpact = 0;
    gameSnap.docs.forEach(d => {
      const g = d.data();
      const t1 = (g.team1Players || []).some(id => playerSet.has(id));
      const t2 = (g.team2Players || []).some(id => playerSet.has(id));
      if (t1 || t2) gameImpact++;
    });
    console.log(`   ${gameImpact} game roster(s) would be updated`);

    console.log(`\n   Run with --delete flag to actually delete:\n`);
    console.log(`   node delete-socal-players.js --delete\n`);
    return;
  }

  console.log(`\n⚠️  Starting deletion...\n`);
  const BATCH_SIZE = 400;
  let deletedPlayers  = 0;
  let updatedTeams    = 0;
  let updatedGames    = 0;
  let deletedRatings  = 0;

  // ── 1. Remove playerIds from team rosters ─────────────────────────────────
  console.log('  Step 1: Cleaning team rosters...');
  const teamSnap = await db.collection('teams')
    .where('organizationId', '==', ORG_ID).get();

  for (let i = 0; i < teamSnap.docs.length; i += BATCH_SIZE) {
    const chunk = teamSnap.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    let changed = 0;
    chunk.forEach(teamDoc => {
      const existing = teamDoc.data().playerIds || [];
      const filtered = existing.filter(id => !playerSet.has(id));
      if (filtered.length !== existing.length) {
        batch.update(teamDoc.ref, { playerIds: filtered });
        changed++;
      }
    });
    if (changed > 0) {
      await batch.commit();
      updatedTeams += changed;
    }
  }
  console.log(`  ✓ ${updatedTeams} team roster(s) updated`);

  // ── 2. Remove playerIds from game rosters ─────────────────────────────────
  console.log('  Step 2: Cleaning game rosters...');
  const gameSnap = await db.collection('games')
    .where('organizationId', '==', ORG_ID).get();

  for (let i = 0; i < gameSnap.docs.length; i += BATCH_SIZE) {
    const chunk = gameSnap.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    let changed = 0;
    chunk.forEach(gameDoc => {
      const g = gameDoc.data();
      const t1 = (g.team1Players || []).filter(id => !playerSet.has(id));
      const t2 = (g.team2Players || []).filter(id => !playerSet.has(id));
      const t1Changed = t1.length !== (g.team1Players || []).length;
      const t2Changed = t2.length !== (g.team2Players || []).length;
      if (t1Changed || t2Changed) {
        batch.update(gameDoc.ref, { team1Players: t1, team2Players: t2 });
        changed++;
      }
    });
    if (changed > 0) {
      await batch.commit();
      updatedGames += changed;
    }
  }
  console.log(`  ✓ ${updatedGames} game roster(s) updated`);

  // ── 3. Delete playerRatings ───────────────────────────────────────────────
  console.log('  Step 3: Deleting player ratings...');
  for (let i = 0; i < playerIds.length; i += 30) {
    const chunk = playerIds.slice(i, i + 30);
    const ratingsSnap = await db.collection('playerRatings')
      .where('playerId', 'in', chunk).get();
    if (!ratingsSnap.empty) {
      const batch = db.batch();
      ratingsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      deletedRatings += ratingsSnap.size;
    }
  }
  console.log(`  ✓ ${deletedRatings} player rating(s) deleted`);

  // ── 4. Delete player documents ────────────────────────────────────────────
  console.log('  Step 4: Deleting player documents...');
  for (let i = 0; i < playerSnap.docs.length; i += BATCH_SIZE) {
    const chunk = playerSnap.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deletedPlayers += chunk.length;
    console.log(`    Deleted ${deletedPlayers}/${playerSnap.size} players...`);
  }

  console.log(`\n✅ Done:`);
  console.log(`   ${deletedPlayers} player(s) deleted`);
  console.log(`   ${updatedTeams} team roster(s) updated`);
  console.log(`   ${updatedGames} game roster(s) updated`);
  console.log(`   ${deletedRatings} player rating(s) deleted`);
  console.log(`   User accounts left intact\n`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
