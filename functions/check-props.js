const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  let total = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const analysis = data.analysis;
    const teams = analysis?.teams;
    const ml = analysis?.mlPlayerProps;
    if (!ml) continue;

    const edgeCount = ml.topProps?.length || 0;
    const goblinCount = ml.goblinLegs?.length || 0;
    const parlayLegs = ml.parlayStack?.legs?.length || 0;
    const hasEdgeBoard = !!ml.edgeBoard;
    const hasParlayStack = !!ml.parlayStack;

    if (edgeCount > 0 || parlayLegs > 0) {
      total++;
      console.log(`${teams?.away} @ ${teams?.home}: ${edgeCount} EdgeBoard, ${goblinCount} goblin, ${parlayLegs} Parlay Stack | EB=${hasEdgeBoard} PS=${hasParlayStack}`);

      // Show first prop details
      if (ml.topProps?.length > 0) {
        const p = ml.topProps[0];
        console.log(`  Sample: ${p.playerName} ${p.prediction} ${p.line} ${p.statType} (green: ${p.greenScore}, odds: ${p.oddsOver}/${p.oddsUnder})`);
      }
      if (ml.parlayStack?.legs?.length > 0) {
        const l = ml.parlayStack.legs[0];
        console.log(`  Parlay: ${l.playerName} ${l.prediction} ${l.altLine} ${l.statType} @ ${l.altOdds}`);
      }
    }
  }
  console.log(`\nTotal games with props: ${total}`);
  process.exit(0);
})();
