const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function migrate() {
  const oldSnap = await db.collection('propsHistory').get();
  const newSnap = await db.collection('gameArchive').get();

  console.log(`propsHistory (old): ${oldSnap.size} docs`);
  console.log(`gameArchive (new):  ${newSnap.size} docs`);

  if (oldSnap.empty) {
    console.log('\nNothing to migrate.');
    return;
  }

  // List old docs
  console.log('\n--- Old propsHistory docs ---');
  oldSnap.forEach(doc => {
    const d = doc.data();
    const teams = d.analysis?.teams || d.teams || {};
    console.log(`  ${doc.id} | ${teams.away || '?'} @ ${teams.home || '?'} | gameStart: ${d.gameStartTime || '?'}`);
  });

  // Collect existing gameArchive doc IDs to avoid duplicates
  const existingIds = new Set();
  newSnap.forEach(doc => existingIds.add(doc.id));

  // Migrate
  const batch = db.batch();
  let migrated = 0;
  let skipped = 0;

  oldSnap.forEach(doc => {
    if (existingIds.has(doc.id)) {
      console.log(`  SKIP (already exists): ${doc.id}`);
      skipped++;
      return;
    }
    batch.set(db.collection('gameArchive').doc(doc.id), doc.data());
    batch.delete(doc.ref);
    migrated++;
  });

  if (migrated > 0) {
    await batch.commit();
  }

  console.log(`\nMigrated: ${migrated}, Skipped: ${skipped}`);

  // Final count
  const finalSnap = await db.collection('gameArchive').get();
  console.log(`gameArchive now has: ${finalSnap.size} docs`);
}

migrate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
