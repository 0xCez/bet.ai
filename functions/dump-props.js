const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function dump() {
  const snap = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  const allProps = [];
  const allGoblins = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const mlTop = d.mlPlayerProps || {};
    const mlNested = d.analysis?.mlPlayerProps || {};
    const ml = (mlTop.topProps?.length > 0) ? mlTop : mlNested;

    const tp = ml.topProps || [];
    const gl = ml.goblinLegs || [];

    for (const p of tp) {
      allProps.push({
        playerName: p.playerName,
        team: p.team,
        opponent: p.opponent,
        statType: p.statType,
        prediction: p.prediction,
        line: p.line,
        bookmakerOver: p.bookmakerOver,
        probabilityOver: p.probabilityOver,
        probabilityUnder: p.probabilityUnder,
        greenScore: p.greenScore,
        hitRates: p.hitRates,
        l10Avg: p.l10Avg,
        trend: p.trend,
        isHome: p.isHome,
        opponentDefense: p.opponentDefense,
        goblinLine: p.goblinLine,
        goblinHitRates: p.goblinHitRates,
      });
    }

    for (const g of gl) {
      allGoblins.push(g);
    }
  }

  // Sort by greenScore desc, then probability
  allProps.sort((a, b) => {
    const gs = (b.greenScore || 0) - (a.greenScore || 0);
    if (gs !== 0) return gs;
    const probA = a.prediction === 'Over' ? (a.probabilityOver || 0) : (a.probabilityUnder || 0);
    const probB = b.prediction === 'Over' ? (b.probabilityOver || 0) : (b.probabilityUnder || 0);
    return probB - probA;
  });

  console.log(JSON.stringify({ topProps: allProps, goblinLegs: allGoblins }, null, 2));
  process.exit(0);
}
dump().catch(e => { console.error(e.message); process.exit(1); });
