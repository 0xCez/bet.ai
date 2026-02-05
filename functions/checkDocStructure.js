const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkDocStructure() {
  console.log('🔍 Checking document structure...\n');

  const snapshot = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log('❌ No documents found');
    return;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  console.log(`Document ID: ${doc.id}`);
  console.log(`\nTop-level fields:`);
  console.log(Object.keys(data));
  console.log(`\nanalysis field type: ${typeof data.analysis}`);
  console.log(`\nanalysis keys (if object):`);
  if (typeof data.analysis === 'object') {
    console.log(Object.keys(data.analysis));
  }

  console.log(`\n\nFull document structure (truncated):`);
  const truncated = {
    ...data,
    analysis: data.analysis ? {
      ...Object.keys(data.analysis).reduce((acc, key) => {
        acc[key] = typeof data.analysis[key];
        return acc;
      }, {})
    } : undefined
  };
  console.log(JSON.stringify(truncated, null, 2));
}

checkDocStructure()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
