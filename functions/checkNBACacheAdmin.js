const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkNBAGames() {
  console.log('Checking pre-cached NBA games for mlPlayerProps...\n');
  
  const snapshot = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .limit(5)
    .get();
  
  console.log(`Found ${snapshot.size} pre-cached NBA games\n`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const analysis = data.analysis;
    console.log(`\n=== ${doc.id} ===`);
    console.log(`Teams: ${analysis?.teams?.home} vs ${analysis?.teams?.away}`);
    console.log(`Game Time: ${data.gameStartTime}`);
    console.log(`Pre-cached at: ${data.preCachedAt || 'N/A'}`);
    console.log(`Has mlPlayerProps: ${!!analysis?.mlPlayerProps}`);
    if (analysis?.mlPlayerProps) {
      console.log(`  - Top Props: ${analysis.mlPlayerProps.topProps?.length || 0}`);
      console.log(`  - High Confidence: ${analysis.mlPlayerProps.highConfidenceCount || 0}`);
      console.log(`  - Medium Confidence: ${analysis.mlPlayerProps.mediumConfidenceCount || 0}`);
      console.log(`  - Game Time: ${analysis.mlPlayerProps.gameTime || 'N/A'}`);
    }
  });
}

checkNBAGames().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});