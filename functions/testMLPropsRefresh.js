/**
 * Test script for ML Props daily refresh
 * This simulates what the scheduled function does
 */

const admin = require('firebase-admin');
const axios = require('axios');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function testMLPropsRefresh() {
  console.log('🧪 Testing ML Props refresh logic...\n');

  try {
    const now = new Date();
    const next48Hours = new Date(now.getTime() + (48 * 60 * 60 * 1000)).toISOString();

    // Find all pre-cached NBA games in next 48 hours
    const snapshot = await db.collection('matchAnalysisCache')
      .where('sport', '==', 'nba')
      .where('preCached', '==', true)
      .get();

    const gamesNeedingProps = snapshot.docs.filter(doc => {
      const data = doc.data();
      const gameTime = data.gameStartTime;
      if (!gameTime) return false;

      // Only refresh games within next 48 hours
      return gameTime <= next48Hours && gameTime > now.toISOString();
    });

    console.log(`📊 Found ${gamesNeedingProps.length} NBA games in next 48 hours\n`);

    if (gamesNeedingProps.length === 0) {
      console.log('❌ No games found to test. Run preCacheTopGames first.');
      return;
    }

    // Test with first game
    const testDoc = gamesNeedingProps[0];
    const data = testDoc.data();
    const analysis = data.analysis;
    const team1 = analysis?.teams?.home;
    const team2 = analysis?.teams?.away;
    const gameStartTime = data.gameStartTime;

    console.log(`🎯 Testing with game: ${team1} vs ${team2}`);
    console.log(`   Game Time: ${gameStartTime}`);
    console.log(`   Currently has props: ${!!analysis?.mlPlayerProps}\n`);

    const baseUrl = 'https://us-central1-betai-f9176.cloudfunctions.net';

    console.log('📞 Calling getMLPlayerPropsForGame endpoint...');
    const mlPropsResponse = await axios.post(`${baseUrl}/getMLPlayerPropsForGame`, {
      team1,
      team2,
      sport: 'nba',
      gameDate: gameStartTime
    }, {
      timeout: 30000
    });

    console.log(`\n✅ Response received:`);
    console.log(`   Success: ${mlPropsResponse.data.success}`);
    console.log(`   Top Props: ${mlPropsResponse.data.topProps?.length || 0}`);
    console.log(`   High Confidence: ${mlPropsResponse.data.highConfidenceCount || 0}`);
    console.log(`   Medium Confidence: ${mlPropsResponse.data.mediumConfidenceCount || 0}`);

    if (mlPropsResponse.data.success && mlPropsResponse.data.topProps?.length > 0) {
      console.log(`\n📝 Would update Firestore with ${mlPropsResponse.data.topProps.length} props`);

      // Show first prop as example
      const firstProp = mlPropsResponse.data.topProps[0];
      console.log(`\n   Example prop:`);
      console.log(`   - ${firstProp.playerName}: ${firstProp.statType} ${firstProp.prediction.toUpperCase()} ${firstProp.line}`);
      console.log(`   - Confidence: ${firstProp.confidencePercent} (${firstProp.confidenceTier})`);

      console.log(`\n✅ Test PASSED - ML Props endpoint is working!`);
      console.log(`   The daily refresh function will update ${gamesNeedingProps.length} games`);
    } else {
      console.log(`\n⚠️ No props available yet for this game`);
      console.log(`   This is expected if SGO hasn't released props yet`);
    }

  } catch (error) {
    console.error('\n❌ Test FAILED:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

testMLPropsRefresh()
  .then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
