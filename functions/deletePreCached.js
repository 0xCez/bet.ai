const admin = require('firebase-admin');

// Initialize without service account - will use default credentials
admin.initializeApp({
  projectId: 'betai-f9176'
});

const db = admin.firestore();

async function deletePreCachedGames() {
  const snapshot = await db.collection('matchAnalysisCache')
    .where('preCached', '==', true)
    .get();
  
  console.log(`Found ${snapshot.size} preCached documents to delete`);
  
  if (snapshot.size === 0) {
    console.log('No documents to delete');
    process.exit(0);
  }
  
  // Delete in batches of 500 (Firestore limit)
  const batchSize = 500;
  const docs = snapshot.docs;
  
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + batchSize);
    chunk.forEach(doc => {
      console.log(`Deleting: ${doc.id}`);
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
  
  console.log('Done!');
  process.exit(0);
}

deletePreCachedGames().catch(err => {
  console.error(err);
  process.exit(1);
});
