const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function findDuplicates() {
  console.log('🔍 Finding Phoenix Suns games...\n');

  const snapshot = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  const sunsGames = snapshot.docs.filter(doc => {
    const data = doc.data();
    const home = data.analysis?.teams?.home || '';
    const away = data.analysis?.teams?.away || '';
    return home.includes('Phoenix') || away.includes('Phoenix');
  });

  console.log(`Found ${sunsGames.length} Phoenix Suns documents:\n`);

  sunsGames.forEach(doc => {
    const data = doc.data();
    console.log(`Document ID: ${doc.id}`);
    console.log(`  Teams: ${data.analysis?.teams?.home} vs ${data.analysis?.teams?.away}`);
    console.log(`  Team IDs: ${data.team1Id} vs ${data.team2Id}`);
    console.log(`  Game Time: ${data.gameStartTime}`);
    console.log(`  Has Props: ${!!data.analysis?.mlPlayerProps}`);
    if (data.analysis?.mlPlayerProps) {
      console.log(`  Props Count: ${data.analysis.mlPlayerProps.topProps?.length}`);
    }
    console.log('');
  });
}

findDuplicates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
