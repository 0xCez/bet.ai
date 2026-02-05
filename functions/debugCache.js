/**
 * Simple debug script to check what's actually in the cache
 * Run: node debugCache.js
 */

const admin = require('firebase-admin');

// Try to use existing initialization from index.js
try {
  admin.app();
  console.log('✅ Using existing Firebase Admin instance');
} catch (e) {
  // Initialize fresh if needed
  admin.initializeApp({ projectId: 'betai-f9176' });
  console.log('✅ Initialized new Firebase Admin instance');
}

const db = admin.firestore();

async function debugCache() {
  try {
    console.log('\n🔍 Fetching ALL documents from matchAnalysisCache...\n');

    const allDocs = await db.collection('matchAnalysisCache').limit(50).get();

    console.log(`📊 Total documents found: ${allDocs.size}\n`);

    const nbaGames = [];
    const soccerGames = [];
    const otherGames = [];
    const preCachedGames = [];

    allDocs.forEach(doc => {
      const data = doc.data();
      const sport = data.sport || 'unknown';
      const preCached = data.preCached || false;
      const teams = data.analysis?.teams || {};

      const gameInfo = {
        docId: doc.id,
        sport: sport,
        preCached: preCached,
        home: teams.home || '?',
        away: teams.away || '?',
        gameStartTime: data.gameStartTime,
        expiresAt: data.expiresAt,
        timestamp: data.timestamp
      };

      if (preCached) {
        preCachedGames.push(gameInfo);
      }

      if (sport === 'nba' || sport === 'basketball' || sport === 'NBA') {
        nbaGames.push(gameInfo);
      } else if (sport === 'soccer' || sport === 'Soccer') {
        soccerGames.push(gameInfo);
      } else {
        otherGames.push(gameInfo);
      }
    });

    console.log('📈 BREAKDOWN:');
    console.log(`   Pre-cached games: ${preCachedGames.length}`);
    console.log(`   NBA games: ${nbaGames.length}`);
    console.log(`   Soccer games: ${soccerGames.length}`);
    console.log(`   Other sports: ${otherGames.length}\n`);

    if (preCachedGames.length > 0) {
      console.log('🔥 PRE-CACHED GAMES:');
      preCachedGames.forEach((g, i) => {
        const gameTime = g.gameStartTime ? new Date(g.gameStartTime).toLocaleString() : 'no time';
        console.log(`${i + 1}. [${g.sport.toUpperCase()}] ${g.home} vs ${g.away}`);
        console.log(`   Doc ID: ${g.docId}`);
        console.log(`   Game Time: ${gameTime}`);
        console.log(`   Expires: ${g.expiresAt || 'no expiry'}\n`);
      });
    }

    if (nbaGames.length > 0) {
      console.log('\n🏀 ALL NBA GAMES (pre-cached or not):');
      nbaGames.forEach((g, i) => {
        console.log(`${i + 1}. ${g.home} vs ${g.away} - PreCached: ${g.preCached ? '✅' : '❌'}`);
      });
    } else {
      console.log('\n❌ NO NBA GAMES FOUND AT ALL!\n');
    }

    if (soccerGames.length > 0) {
      console.log('\n⚽ ALL SOCCER GAMES (showing first 5):');
      soccerGames.slice(0, 5).forEach((g, i) => {
        console.log(`${i + 1}. ${g.home} vs ${g.away} - PreCached: ${g.preCached ? '✅' : '❌'}`);
      });
    }

    // Check for sport field values
    console.log('\n🔬 UNIQUE SPORT VALUES IN CACHE:');
    const sportValues = new Set();
    allDocs.forEach(doc => {
      const sport = doc.data().sport;
      if (sport) sportValues.add(sport);
    });
    sportValues.forEach(sport => {
      console.log(`   - "${sport}"`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

debugCache();
