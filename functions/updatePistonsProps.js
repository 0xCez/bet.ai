const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function updatePistons() {
  console.log('🔄 Updating Detroit Pistons game with corrected props...\n');

  const response = await axios.post('https://us-central1-betai-f9176.cloudfunctions.net/getMLPlayerPropsForGame', {
    team1: 'Detroit Pistons',
    team2: 'Washington Wizards',
    sport: 'nba',
    gameDate: '2026-02-06T00:10:00Z'
  });

  if (!response.data.success || !response.data.topProps?.length) {
    console.log('❌ No props returned');
    return;
  }

  const propsData = {
    topProps: response.data.topProps,
    totalPropsAvailable: response.data.totalPropsAvailable || 0,
    highConfidenceCount: response.data.highConfidenceCount || 0,
    mediumConfidenceCount: response.data.mediumConfidenceCount || 0,
    gameTime: response.data.gameTime || null
  };

  await db.collection('matchAnalysisCache').doc('nba_10-41_en').update({
    'analysis.mlPlayerProps': propsData
  });

  console.log('✅ Updated successfully!');
  console.log(`   Props: ${propsData.topProps.length}`);
  console.log(`   High Confidence: ${propsData.highConfidenceCount}`);
  console.log(`\nFirst 3 props:`);
  propsData.topProps.slice(0, 3).forEach((p, i) => {
    console.log(`${i+1}. ${p.playerName}: ${p.statType} ${p.prediction.toUpperCase()} ${p.line} (${(p.probabilityOver * 100).toFixed(1)}%)`);
  });
}

updatePistons()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
