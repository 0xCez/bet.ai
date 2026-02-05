const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkPropsDetailed() {
  console.log('🔍 Checking Phoenix Suns game props in detail...\n');

  const snapshot = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  const sunsGame = snapshot.docs.find(doc => {
    const data = doc.data();
    return data.analysis?.teams?.home?.includes('Phoenix') ||
           data.analysis?.teams?.away?.includes('Phoenix');
  });

  if (!sunsGame) {
    console.log('❌ Phoenix Suns game not found');
    return;
  }

  const data = sunsGame.data();
  console.log(`Document ID: ${sunsGame.id}`);
  console.log(`Teams: ${data.analysis?.teams?.home} vs ${data.analysis?.teams?.away}`);
  console.log(`Game Time: ${data.gameStartTime}`);
  console.log(`\nML Player Props structure:`);
  console.log(JSON.stringify(data.analysis?.mlPlayerProps, null, 2));

  if (data.analysis?.mlPlayerProps?.topProps) {
    console.log(`\n✅ Found ${data.analysis.mlPlayerProps.topProps.length} props!`);
    console.log(`\nFirst prop:`);
    console.log(JSON.stringify(data.analysis.mlPlayerProps.topProps[0], null, 2));
  } else {
    console.log('\n❌ No props found in analysis.mlPlayerProps');
  }
}

checkPropsDetailed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
