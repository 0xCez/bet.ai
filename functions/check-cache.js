const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function check() {
  const snap = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  console.log('Found', snap.size, 'cached NBA games\n');

  let withProps = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const teams = d.analysis?.teams || {};

    // Check both possible locations for mlPlayerProps
    const mlTop = d.mlPlayerProps || {};
    const mlNested = d.analysis?.mlPlayerProps || {};
    const ml = (mlTop.topProps?.length > 0) ? mlTop : mlNested;

    const tp = ml.topProps || [];
    const gl = ml.goblinLegs || [];
    const hasProps = tp.length > 0;

    console.log(`${hasProps ? '✅' : '❌'} ${teams.home || '?'} vs ${teams.away || '?'} | ${tp.length} props, ${gl.length} goblins | cached: ${d.preCachedAt || '?'}`);

    if (hasProps) {
      withProps++;
      const p = tp[0];
      console.log(`   Sample: ${p.playerName} ${p.statType} ${p.prediction} ${p.line} | greenScore=${p.greenScore}`);
      console.log(`   hitRates: ${JSON.stringify(p.hitRates)}`);
      if (gl.length > 0) {
        const g = gl[0];
        console.log(`   Goblin: ${g.playerName} alt ${g.goblinLine?.line} @ ${g.goblinOdds} | gHR=${JSON.stringify(g.goblinHitRates)}`);
      }
    }
  }

  console.log(`\n${withProps}/${snap.size} games have ML props`);
  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
