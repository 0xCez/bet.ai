const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function checkArchiveReady() {
  const snapshot = await db.collection('gameArchive').get();
  console.log(`Total archived games: ${snapshot.size}\n`);

  const ready = [];
  const incomplete = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const a = data.analysis || {};
    const teams = a.teams || {};

    const fields = {
      aiAnalysis: Boolean(a.aiAnalysis && a.aiAnalysis.breakdown),
      matchSnapshot: Boolean(a.matchSnapshot && a.matchSnapshot.recentPerformance),
      keyInsightsNew: Boolean(a.keyInsightsNew && a.keyInsightsNew.marketConsensus),
      marketIntelligence: Boolean(a.marketIntelligence),
      teamStats: Boolean(a.teamStats),
      xFactors: Boolean(a.xFactors && a.xFactors.length > 0),
      mlPlayerProps: Boolean(a.mlPlayerProps && a.mlPlayerProps.topProps),
      logos: Boolean(teams.logos && (teams.logos.home || teams.logos.away)),
    };

    const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);

    const entry = {
      id: doc.id,
      matchup: `${teams.away || '?'} @ ${teams.home || '?'}`,
      sport: data.sport || '?',
      gameStart: data.gameStartTime || '?',
      missing,
    };

    if (missing.length === 0) {
      ready.push(entry);
    } else {
      incomplete.push(entry);
    }
  });

  console.log(`=== SCAN-READY (${ready.length} games) ===\n`);
  ready
    .sort((a, b) => (b.gameStart || '').localeCompare(a.gameStart || ''))
    .forEach(g => {
      console.log(`  ✅ ${g.sport.toUpperCase().padEnd(7)} ${g.matchup.padEnd(55)} ${g.gameStart}`);
    });

  if (incomplete.length > 0) {
    console.log(`\n=== INCOMPLETE (${incomplete.length} games) ===\n`);
    incomplete
      .sort((a, b) => (b.gameStart || '').localeCompare(a.gameStart || ''))
      .forEach(g => {
        console.log(`  ❌ ${g.sport.toUpperCase().padEnd(7)} ${g.matchup.padEnd(55)} ${g.gameStart}`);
        console.log(`     Missing: ${g.missing.join(', ')}`);
      });
  }
}

checkArchiveReady()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
