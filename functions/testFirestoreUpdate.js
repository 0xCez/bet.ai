const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testUpdate() {
  console.log('🧪 Testing Firestore update with nested field...\n');

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
  console.log(`Document ID: ${doc.id}`);

  const testProps = {
    topProps: [
      {
        playerName: 'Test Player',
        statType: 'points',
        line: 25.5,
        prediction: 'over'
      }
    ],
    totalPropsAvailable: 1,
    highConfidenceCount: 1,
    mediumConfidenceCount: 0,
    gameTime: '2026-02-06T00:40:00Z'
  };

  console.log('\\nAttempting update with nested field syntax...');

  try {
    await doc.ref.update({
      'analysis.mlPlayerProps': testProps
    });
    console.log('✅ Update succeeded!');

    // Read back to verify
    const updated = await doc.ref.get();
    const data = updated.data();
    console.log('\\nVerifying update:');
    console.log(`mlPlayerProps exists: ${!!data.analysis?.mlPlayerProps}`);
    if (data.analysis?.mlPlayerProps) {
      console.log(`Props count: ${data.analysis.mlPlayerProps.topProps?.length}`);
      console.log(`First prop: ${JSON.stringify(data.analysis.mlPlayerProps.topProps[0], null, 2)}`);
    }

  } catch (error) {
    console.error('❌ Update failed:', error.message);
    console.error('Error details:', error);
  }
}

testUpdate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
