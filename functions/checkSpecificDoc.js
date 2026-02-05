const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkDoc() {
  const docId = 'nba_10-41_en';
  console.log(`🔍 Checking document: ${docId}\n`);

  const doc = await db.collection('matchAnalysisCache').doc(docId).get();

  if (!doc.exists) {
    console.log('❌ Document does NOT exist');
    return;
  }

  const data = doc.data();
  console.log(`✅ Document EXISTS`);
  console.log(`  Teams: ${data.analysis?.teams?.home} vs ${data.analysis?.teams?.away}`);
  console.log(`  Team IDs: ${data.team1Id} vs ${data.team2Id}`);
  console.log(`  Game Time: ${data.gameStartTime}`);
  console.log(`  Sport: ${data.sport}`);
  console.log(`  Pre-cached: ${data.preCached}`);
  console.log(`  Has Props: ${!!data.analysis?.mlPlayerProps}`);
  if (data.analysis?.mlPlayerProps) {
    console.log(`  Props Count: ${data.analysis.mlPlayerProps.topProps?.length}`);
    console.log(`\n  First prop:`);
    console.log(JSON.stringify(data.analysis.mlPlayerProps.topProps[0], null, 2));
  }
}

checkDoc()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
