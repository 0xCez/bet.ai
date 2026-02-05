/**
 * Check pre-cached NBA games in Firestore
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs } = require('firebase/firestore');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCyna-iA9d5bkP8NBcCFt2bPmGTQuKxF6s",
  authDomain: "betai-f9176.firebaseapp.com",
  projectId: "betai-f9176",
  storageBucket: "betai-f9176.firebasestorage.app",
  messagingSenderId: "133991312998",
  appId: "1:133991312998:ios:4798a1f70981c5dcafc7a7",
  measurementId: "G-4C1EPC8QJY",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkNBACachedGames() {
  try {
    console.log('🔍 Checking pre-cached games in Firestore...\n');

    const cacheRef = collection(db, 'matchAnalysisCache');
    const q = query(cacheRef, where('preCached', '==', true));
    const snapshot = await getDocs(q);

    console.log(`📊 Found ${snapshot.size} pre-cached games total\n`);

    if (snapshot.empty) {
      console.log('❌ NO PRE-CACHED GAMES FOUND!\n');
      return;
    }

    const now = new Date();
    const nbaGames = [];
    const soccerGames = [];
    let expiredCount = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      const sport = data.sport || 'unknown';
      const gameStartTime = data.gameStartTime ? new Date(data.gameStartTime) : null;
      const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
      const teams = data.analysis?.teams || {};

      const isExpired = expiresAt && expiresAt < now;

      if (isExpired) {
        expiredCount++;
        return;
      }

      const game = {
        home: teams.home || '?',
        away: teams.away || '?',
        gameTime: gameStartTime,
        expires: expiresAt,
        docId: doc.id
      };

      if (sport === 'nba') {
        nbaGames.push(game);
      } else if (sport === 'soccer') {
        soccerGames.push(game);
      }
    });

    // Sort by game time
    nbaGames.sort((a, b) => a.gameTime - b.gameTime);
    soccerGames.sort((a, b) => a.gameTime - b.gameTime);

    console.log('📊 SUMMARY:');
    console.log(`   Total NBA games: ${nbaGames.length}`);
    console.log(`   Total Soccer games: ${soccerGames.length}`);
    console.log(`   Expired games: ${expiredCount}\n`);

    if (nbaGames.length > 0) {
      console.log('🏀 UPCOMING NBA GAMES:\n');
      nbaGames.forEach((g, i) => {
        const gameTime = g.gameTime ? g.gameTime.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        }) : 'Unknown';

        const expiresTime = g.expires ? g.expires.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }) : 'Unknown';

        console.log(`${i + 1}. ${g.home} vs ${g.away}`);
        console.log(`   Game: ${gameTime}`);
        console.log(`   Expires: ${expiresTime}`);
        console.log(`   Doc ID: ${g.docId}\n`);
      });
    } else {
      console.log('❌ NO UPCOMING NBA GAMES FOUND!\n');
    }

    if (soccerGames.length > 0) {
      console.log(`\n⚽ UPCOMING SOCCER GAMES (showing first 5 of ${soccerGames.length}):\n`);
      soccerGames.slice(0, 5).forEach((g, i) => {
        const gameTime = g.gameTime ? g.gameTime.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }) : 'Unknown';

        console.log(`${i + 1}. ${g.home} vs ${g.away} - ${gameTime}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
checkNBACachedGames()
  .then(() => {
    console.log('\n✨ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error.message);
    process.exit(1);
  });
