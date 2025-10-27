const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function clearCache() {
  const cacheSnapshot = await db.collection('matchAnalysisCache').get();
  console.log(`Deleting ${cacheSnapshot.size} cached analyses...`);
  
  const batch = db.batch();
  cacheSnapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  console.log('✅ Cache cleared!');
  process.exit(0);
}

clearCache().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
