const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function find() {
  // Check both collections for games from last 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  console.log(`Looking for games between ${threeDaysAgo.substring(0,10)} and ${now.substring(0,10)}\n`);

  // 1. Live cache
  const cache = await db.collection('matchAnalysisCache').get();
  const cacheNBA = [];
  cache.forEach(doc => {
    const data = doc.data();
    if (data.sport === 'nba' && data.gameStartTime && data.gameStartTime > threeDaysAgo) {
      cacheNBA.push({
        id: doc.id,
        home: data.analysis?.teams?.home || '?',
        away: data.analysis?.teams?.away || '?',
        gameStart: data.gameStartTime,
        expiresAt: data.expiresAt || 'NONE',
        preCached: !!data.preCached,
        hasAI: !!data.analysis?.aiAnalysis,
        hasProps: !!(data.analysis?.mlPlayerProps?.topProps?.length),
      });
    }
  });
  cacheNBA.sort((a, b) => a.gameStart.localeCompare(b.gameStart));

  console.log(`=== matchAnalysisCache: ${cacheNBA.length} NBA games from last 3 days ===\n`);
  for (const g of cacheNBA) {
    const expired = g.expiresAt < now ? 'EXPIRED' : 'VALID';
    console.log(`  ${g.gameStart.substring(0,16)}  ${(g.away + ' @ ' + g.home).padEnd(50)} [${expired}] preCached=${g.preCached} AI=${g.hasAI} Props=${g.hasProps}`);
  }

  // 2. Archive
  const archive = await db.collection('gameArchive').get();
  const archiveAll = [];
  archive.forEach(doc => {
    const data = doc.data();
    archiveAll.push({
      id: doc.id,
      sport: data.sport || '?',
      home: data.analysis?.teams?.home || '?',
      away: data.analysis?.teams?.away || '?',
      gameStart: data.gameStartTime || '?',
      archivedAt: data.archivedAt || '?',
      hasAI: !!data.analysis?.aiAnalysis,
      hasProps: !!(data.analysis?.mlPlayerProps?.topProps?.length),
    });
  });
  archiveAll.sort((a, b) => (b.gameStart || '').localeCompare(a.gameStart || ''));

  console.log(`\n=== gameArchive: ALL ${archiveAll.length} docs ===\n`);
  for (const g of archiveAll) {
    console.log(`  ${g.sport.toUpperCase().padEnd(7)} ${g.gameStart.substring(0,16).padEnd(18)} ${(g.away + ' @ ' + g.home).padEnd(50)} archived=${g.archivedAt.substring(0,16)} AI=${g.hasAI} Props=${g.hasProps}`);
  }
}

find()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
