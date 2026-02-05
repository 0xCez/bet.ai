// Quick test to see the structure of cached game data
const admin = require('firebase-admin');
const serviceAccount = require('./betai-f9176-firebase-adminsdk-e0b21-15d2e4f4ca.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkGameStructure() {
  const snapshot = await db.collection('matchAnalysisCache')
    .where('preCached', '==', true)
    .where('sport', '==', 'nba')
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log('No games found');
    return;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  
  console.log('\n=== CACHED GAME STRUCTURE ===\n');
  console.log('Teams:', data.analysis?.teams);
  console.log('\nAI Analysis confidence:', data.analysis?.aiAnalysis?.confidenceScore);
  console.log('\nMarket Consensus:', data.analysis?.keyInsightsNew?.marketConsensus);
  console.log('\nBest Value:', data.analysis?.keyInsightsNew?.bestValue);
  console.log('\nML Player Props:', {
    topProps: data.analysis?.mlPlayerProps?.topProps?.map(p => ({
      player: p.playerName,
      stat: p.statType,
      line: p.line,
      prediction: p.prediction,
      confidence: p.confidencePercent
    })),
    count: data.analysis?.mlPlayerProps?.topProps?.length || 0
  });
  
  process.exit(0);
}

checkGameStructure().catch(console.error);
