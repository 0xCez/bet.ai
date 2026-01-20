const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function listCachedGames() {
  const snapshot = await db.collection('matchAnalysisCache')
    .where('preCached', '==', true)
    .get();

  console.log('\n📊 Found ' + snapshot.size + ' pre-cached games:\n');

  const games = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const teams = data.analysis && data.analysis.teams ? data.analysis.teams : {};
    games.push({
      id: doc.id,
      sport: data.sport,
      home: teams.home || '?',
      away: teams.away || '?',
      gameTime: data.gameStartTime,
      expiresAt: data.expiresAt
    });
  });

  // Sort by sport then gameTime
  games.sort((a, b) => {
    if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
    return new Date(a.gameTime) - new Date(b.gameTime);
  });

  games.forEach((g, i) => {
    const time = g.gameTime ? new Date(g.gameTime).toLocaleString() : 'no time';
    console.log((i+1) + '. [' + g.sport.toUpperCase() + '] ' + g.home + ' vs ' + g.away + ' - ' + time);
  });
}

listCachedGames().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
