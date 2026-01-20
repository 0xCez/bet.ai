const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function cleanupPreCachedGames() {
  console.log('🧹 Starting cleanup of pre-cached games...');
  
  const cacheRef = db.collection('matchAnalysisCache');
  const snapshot = await cacheRef.where('preCached', '==', true).get();
  
  console.log(`Found ${snapshot.size} pre-cached games to delete`);
  
  if (snapshot.empty) {
    console.log('No pre-cached games found');
    return;
  }
  
  const batch = db.batch();
  let count = 0;
  
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    count++;
    console.log(`  - Queued for deletion: ${doc.id}`);
  });
  
  await batch.commit();
  console.log(`✅ Deleted ${count} pre-cached games`);
}

cleanupPreCachedGames()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
