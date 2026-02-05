const admin = require('firebase-admin');

// Initialize with project ID
admin.initializeApp({
  projectId: 'betai-f9176'
});

const db = admin.firestore();

async function checkCachedGames() {
  try {
    console.log('Querying Firestore for pre-cached games...\n');

    const snapshot = await db.collection('matchAnalysisCache')
      .where('preCached', '==', true)
      .get();

    console.log(`Found ${snapshot.size} pre-cached games total\n`);

    if (snapshot.empty) {
      console.log('❌ NO PRE-CACHED GAMES FOUND!\n');
      return;
    }

    const now = new Date();
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    let nbaCount = 0;
    let soccerCount = 0;
    let expiredCount = 0;
    let upcomingNBA = [];
    let upcomingSoccer = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const sport = data.sport;
      const gameStartTime = data.gameStartTime ? new Date(data.gameStartTime) : null;
      const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
      const teams = data.analysis?.teams || {};

      const isExpired = expiresAt && expiresAt < now;
      const gameStartedTooLongAgo = gameStartTime && gameStartTime < fourHoursAgo;

      if (sport === 'nba') {
        nbaCount++;
        if (!isExpired && !gameStartedTooLongAgo) {
          upcomingNBA.push({
            home: teams.home,
            away: teams.away,
            gameTime: gameStartTime?.toLocaleString() || 'Unknown',
            expires: expiresAt?.toLocaleString() || 'Unknown'
          });
        } else {
          expiredCount++;
        }
      } else if (sport === 'soccer') {
        soccerCount++;
        if (!isExpired && !gameStartedTooLongAgo) {
          upcomingSoccer.push({
            home: teams.home,
            away: teams.away,
            gameTime: gameStartTime?.toLocaleString() || 'Unknown'
          });
        } else {
          expiredCount++;
        }
      }
    });

    console.log('📊 SUMMARY:');
    console.log(`Total NBA games: ${nbaCount}`);
    console.log(`Total Soccer games: ${soccerCount}`);
    console.log(`Expired/ended games: ${expiredCount}`);
    console.log(`Valid upcoming NBA games: ${upcomingNBA.length}`);
    console.log(`Valid upcoming Soccer games: ${upcomingSoccer.length}\n`);

    if (upcomingNBA.length > 0) {
      console.log('🏀 UPCOMING NBA GAMES:');
      upcomingNBA.forEach((g, i) => {
        console.log(`${i + 1}. ${g.home} vs ${g.away}`);
        console.log(`   Game: ${g.gameTime}`);
        console.log(`   Expires: ${g.expires}\n`);
      });
    } else {
      console.log('❌ NO UPCOMING NBA GAMES FOUND!\n');
    }

    if (upcomingSoccer.length > 0) {
      console.log('⚽ UPCOMING SOCCER GAMES:');
      upcomingSoccer.slice(0, 5).forEach((g, i) => {
        console.log(`${i + 1}. ${g.home} vs ${g.away} - ${g.gameTime}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

checkCachedGames();
