const admin = require('firebase-admin');
const axios = require('axios');

const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function clearAndRefresh() {
  console.log('🗑️  Step 1: Clearing all cached ML props...\n');

  // Find all docs with mlPlayerProps
  const snapshot = await db.collection('matchAnalysisCache')
    .where('preCached', '==', true)
    .get();

  console.log(`Found ${snapshot.size} cached games total`);

  let cleared = 0;
  const gamesToRefresh = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const hasProps = data.analysis?.mlPlayerProps;
    const teams = data.analysis?.teams || {};
    const sport = data.sport;
    const gameStartTime = data.gameStartTime;

    if (hasProps) {
      // Clear the mlPlayerProps field
      await doc.ref.update({
        'analysis.mlPlayerProps': admin.firestore.FieldValue.delete()
      });
      cleared++;
      console.log(`  ✅ Cleared: ${teams.home} vs ${teams.away}`);
    }

    // Collect NBA games for refresh
    if (sport === 'nba') {
      const now = new Date();
      const gameTime = gameStartTime ? new Date(gameStartTime) : null;
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

      if (gameTime && gameTime > fourHoursAgo) {
        gamesToRefresh.push({
          docId: doc.id,
          home: teams.home,
          away: teams.away,
          gameDate: gameStartTime,
          sport: 'nba'
        });
      }
    }
  }

  console.log(`\n🗑️  Cleared ${cleared} cached props`);
  console.log(`\n🔄 Step 2: Refreshing ${gamesToRefresh.length} upcoming NBA games...\n`);

  // Refresh each game
  for (const game of gamesToRefresh) {
    try {
      console.log(`  Fetching: ${game.home} vs ${game.away}...`);

      const response = await axios.post(
        'https://us-central1-betai-f9176.cloudfunctions.net/getMLPlayerPropsForGame',
        {
          team1: game.home,
          team2: game.away,
          sport: game.sport,
          gameDate: game.gameDate
        },
        { timeout: 300000 }
      );

      if (response.data.success && response.data.topProps?.length > 0) {
        // Save to Firestore
        const propsData = {
          topProps: response.data.topProps,
          totalPropsAvailable: response.data.totalPropsAvailable || 0,
          highConfidenceCount: response.data.highConfidenceCount || 0,
          mediumConfidenceCount: response.data.mediumConfidenceCount || 0,
          gameTime: response.data.gameTime || null
        };

        await db.collection('matchAnalysisCache').doc(game.docId).update({
          'analysis.mlPlayerProps': propsData
        });

        console.log(`  ✅ ${game.home} vs ${game.away}: ${response.data.topProps.length} props saved`);

        // Show the props
        for (const prop of response.data.topProps) {
          console.log(`     ${prop.playerName} | ${prop.statType} ${prop.line} | ${prop.prediction} ${prop.confidencePercent}% | prob_over: ${(prop.probabilityOver * 100).toFixed(1)}%`);
        }
      } else {
        console.log(`  ⚠️  ${game.home} vs ${game.away}: No high-confidence props found`);
      }
    } catch (err) {
      console.log(`  ❌ ${game.home} vs ${game.away}: ${err.message}`);
    }
    console.log('');
  }

  console.log('✅ Done!');
}

clearAndRefresh()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
