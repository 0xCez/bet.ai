const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function deepInspect() {
  // Check all 3 collections
  const [archive, cache, oldHistory] = await Promise.all([
    db.collection('gameArchive').get(),
    db.collection('matchAnalysisCache').get(),
    db.collection('propsHistory').get(),
  ]);

  console.log('=== COLLECTION SIZES ===');
  console.log(`gameArchive:       ${archive.size}`);
  console.log(`matchAnalysisCache: ${cache.size}`);
  console.log(`propsHistory (old): ${oldHistory.size}`);

  // Deep inspect the 3 most recent NBA archived games
  console.log('\n=== DEEP INSPECT: 3 most recent NBA archives ===\n');

  const nbaDocs = [];
  archive.forEach(doc => {
    const d = doc.data();
    if (d.sport === 'nba') nbaDocs.push({ id: doc.id, data: d });
  });
  nbaDocs.sort((a, b) => (b.data.gameStartTime || '').localeCompare(a.data.gameStartTime || ''));

  for (const doc of nbaDocs.slice(0, 3)) {
    const d = doc.data;
    const a = d.analysis || {};
    console.log(`--- ${doc.id} ---`);
    console.log(`Teams: ${a.teams?.away || '?'} @ ${a.teams?.home || '?'}`);
    console.log(`Game:  ${d.gameStartTime}`);
    console.log(`Archived: ${d.archivedAt}`);
    console.log('');
    console.log('TOP-LEVEL KEYS:', Object.keys(d).sort().join(', '));
    console.log('ANALYSIS KEYS:', Object.keys(a).sort().join(', '));
    console.log('');

    // Check each field the scan flow needs
    const checks = {
      'analysis.teams.home': a.teams?.home,
      'analysis.teams.away': a.teams?.away,
      'analysis.teams.logos.home': a.teams?.logos?.home,
      'analysis.teams.logos.away': a.teams?.logos?.away,
      'analysis.aiAnalysis.breakdown': a.aiAnalysis?.breakdown ? `${a.aiAnalysis.breakdown.substring(0, 80)}...` : null,
      'analysis.aiAnalysis.confidenceScore': a.aiAnalysis?.confidenceScore,
      'analysis.aiAnalysis.bettingSignal': a.aiAnalysis?.bettingSignal,
      'analysis.matchSnapshot.headToHead': a.matchSnapshot?.headToHead ? `${a.matchSnapshot.headToHead.substring(0, 60)}...` : null,
      'analysis.matchSnapshot.recentPerformance.home': a.matchSnapshot?.recentPerformance?.home,
      'analysis.matchSnapshot.recentPerformance.away': a.matchSnapshot?.recentPerformance?.away,
      'analysis.keyInsightsNew.marketConsensus': a.keyInsightsNew?.marketConsensus ? JSON.stringify(a.keyInsightsNew.marketConsensus).substring(0, 80) : null,
      'analysis.keyInsightsNew.bestValue': a.keyInsightsNew?.bestValue ? 'present' : null,
      'analysis.marketIntelligence': a.marketIntelligence ? `${Object.keys(a.marketIntelligence).length} keys` : null,
      'analysis.teamStats': a.teamStats ? `${Object.keys(a.teamStats).length} keys` : null,
      'analysis.xFactors': Array.isArray(a.xFactors) ? `${a.xFactors.length} factors` : null,
      'analysis.mlPlayerProps.topProps': Array.isArray(a.mlPlayerProps?.topProps) ? `${a.mlPlayerProps.topProps.length} props` : null,
      'analysis.mlPlayerProps.edgeBoard': a.mlPlayerProps?.edgeBoard ? 'present' : null,
      'analysis.mlPlayerProps.parlayStack': a.mlPlayerProps?.parlayStack ? `${a.mlPlayerProps?.parlayStack?.legs?.length || 0} legs` : null,
    };

    for (const [key, val] of Object.entries(checks)) {
      const status = val ? '✅' : '❌';
      console.log(`  ${status} ${key}: ${val || 'MISSING'}`);
    }
    console.log('');
  }

  // Also check: how many old gutted docs exist (no analysis.aiAnalysis)
  let gutted = 0;
  let full = 0;
  archive.forEach(doc => {
    const a = doc.data().analysis || {};
    if (a.aiAnalysis && a.aiAnalysis.breakdown) full++;
    else gutted++;
  });
  console.log(`\n=== ARCHIVE HEALTH ===`);
  console.log(`Full data (scan-ready): ${full}`);
  console.log(`Gutted (old broken archive): ${gutted}`);
}

deepInspect()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
