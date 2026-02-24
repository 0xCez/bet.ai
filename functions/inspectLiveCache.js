const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function inspect() {
  const now = new Date().toISOString();

  // 1. matchAnalysisCache — the live cache
  const cache = await db.collection('matchAnalysisCache').get();
  console.log(`=== matchAnalysisCache: ${cache.size} total docs ===\n`);

  let upcoming = 0, expired = 0, shells = 0, enriched = 0, withProps = 0;
  const games = [];

  cache.forEach(doc => {
    const data = doc.data();
    const a = data.analysis || {};
    const isUpcoming = data.gameStartTime && data.gameStartTime > now;
    const isShell = !a.aiAnalysis;
    const hasProps = !!(a.mlPlayerProps?.topProps?.length || a.mlPlayerProps?.edgeBoard?.topProps?.length);

    if (isUpcoming) upcoming++;
    else expired++;
    if (isShell) shells++;
    else enriched++;
    if (hasProps) withProps++;

    games.push({
      id: doc.id,
      sport: data.sport || '?',
      home: a.teams?.home || '?',
      away: a.teams?.away || '?',
      gameStart: data.gameStartTime || '?',
      preCached: !!data.preCached,
      isUpcoming,
      hasAI: !!a.aiAnalysis,
      hasProps,
      hasMarketIntel: !!a.marketIntelligence,
      hasMatchSnapshot: !!a.matchSnapshot,
      edgeCount: a.mlPlayerProps?.topProps?.length || a.mlPlayerProps?.edgeBoard?.topProps?.length || 0,
      stackCount: a.mlPlayerProps?.parlayStack?.legs?.length || 0,
    });
  });

  // Sort by game start time
  games.sort((a, b) => (a.gameStart || '').localeCompare(b.gameStart || ''));

  console.log(`Upcoming: ${upcoming}  |  Expired: ${expired}  |  Shells: ${shells}  |  AI-enriched: ${enriched}  |  With props: ${withProps}\n`);

  for (const g of games) {
    const status = [];
    if (g.isUpcoming) status.push('UPCOMING');
    else status.push('EXPIRED');
    if (g.hasAI) status.push('AI');
    if (g.hasProps) status.push(`PROPS(${g.edgeCount}E/${g.stackCount}S)`);
    if (g.hasMarketIntel) status.push('MI');
    if (g.hasMatchSnapshot) status.push('SNAP');
    if (!g.hasAI && !g.hasProps) status.push('SHELL-ONLY');

    console.log(`  ${g.sport.toUpperCase().padEnd(7)} ${(g.away + ' @ ' + g.home).padEnd(50)} ${g.gameStart.substring(0, 16)}  [${status.join(', ')}]`);
  }

  // 2. gameArchive — the permanent archive
  const archive = await db.collection('gameArchive').get();
  console.log(`\n=== gameArchive: ${archive.size} total docs ===\n`);

  let archFull = 0, archShell = 0;
  archive.forEach(doc => {
    const a = doc.data().analysis || {};
    if (a.aiAnalysis) archFull++;
    else archShell++;
  });
  console.log(`Full (scan-ready): ${archFull}  |  Shell/gutted: ${archShell}`);

  // 3. Check special docs (leaderboard, parlayOfTheDay)
  const special = ['leaderboard', 'parlayOfTheDay'];
  for (const id of special) {
    const doc = await db.collection('matchAnalysisCache').doc(id).get();
    if (doc.exists) {
      const data = doc.data();
      console.log(`\n${id}: EXISTS (updated: ${data.updatedAt || data.timestamp || '?'})`);
    } else {
      console.log(`\n${id}: MISSING`);
    }
  }
}

inspect()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
