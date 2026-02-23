const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function listGameArchive() {
  console.log('Querying gameArchive collection...\n');

  const snapshot = await db.collection('gameArchive').get();

  if (snapshot.empty) {
    console.log('No documents found in gameArchive.');
    return;
  }

  console.log(`Found ${snapshot.size} documents in gameArchive:\n`);
  console.log('='.repeat(120));

  let nbaCount = 0, soccerCount = 0, otherCount = 0;
  let withMLData = 0, withoutMLData = 0;

  snapshot.forEach(doc => {
    const data = doc.data();

    // Extract teams info
    const teams = data.teams || data.analysis?.teams || {};
    const home = teams.home || teams.homeTeam || '?';
    const away = teams.away || teams.awayTeam || '?';

    // Sport
    const sport = data.sport || '?';
    if (sport === 'nba') nbaCount++;
    else if (sport === 'soccer') soccerCount++;
    else otherCount++;

    // Game start time
    let gameStartTime = data.gameStartTime || data.analysis?.gameStartTime || '?';
    if (gameStartTime && gameStartTime._seconds) {
      gameStartTime = new Date(gameStartTime._seconds * 1000).toISOString();
    } else if (gameStartTime && gameStartTime.toDate) {
      gameStartTime = gameStartTime.toDate().toISOString();
    }

    // Archived at
    let archivedAt = data.archivedAt || '?';
    if (archivedAt && archivedAt._seconds) {
      archivedAt = new Date(archivedAt._seconds * 1000).toISOString();
    } else if (archivedAt && archivedAt.toDate) {
      archivedAt = archivedAt.toDate().toISOString();
    }

    // ML Player Props - correct structure based on actual data
    const mlProps = data.mlPlayerProps || null;
    let topPropsCount = 0;
    let edgeBoardCount = 0;
    let goblinLegsCount = 0;
    let parlayStackLegsCount = 0;

    if (mlProps && typeof mlProps === 'object') {
      // topProps: the main edge board props array
      if (Array.isArray(mlProps.topProps)) {
        topPropsCount = mlProps.topProps.length;
      }
      // edgeBoard: could be object or array
      if (Array.isArray(mlProps.edgeBoard)) {
        edgeBoardCount = mlProps.edgeBoard.length;
      } else if (mlProps.edgeBoard && typeof mlProps.edgeBoard === 'object') {
        edgeBoardCount = Object.keys(mlProps.edgeBoard).length;
      }
      // goblinLegs: alt-line filtered legs
      if (Array.isArray(mlProps.goblinLegs)) {
        goblinLegsCount = mlProps.goblinLegs.length;
      }
      // parlayStack.legs: full parlay stack
      if (mlProps.parlayStack && Array.isArray(mlProps.parlayStack.legs)) {
        parlayStackLegsCount = mlProps.parlayStack.legs.length;
      }
    }

    const hasMLData = topPropsCount > 0 || goblinLegsCount > 0 || parlayStackLegsCount > 0;
    if (hasMLData) withMLData++;
    else withoutMLData++;

    console.log(`Doc ID:         ${doc.id}`);
    console.log(`Sport:          ${sport}`);
    console.log(`Teams:          ${away} @ ${home}`);
    console.log(`Game Start:     ${gameStartTime}`);
    console.log(`Archived At:    ${archivedAt}`);
    if (hasMLData) {
      console.log(`ML Props Data:  YES`);
      console.log(`  - topProps (edge):     ${topPropsCount}`);
      console.log(`  - goblinLegs:          ${goblinLegsCount}`);
      console.log(`  - parlayStack legs:    ${parlayStackLegsCount}`);
    } else {
      console.log(`ML Props Data:  NO (mlPlayerProps field is ${mlProps === null ? 'null/missing' : 'empty object'})`);
    }
    console.log('-'.repeat(120));
  });

  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY');
  console.log('='.repeat(120));
  console.log(`Total documents:     ${snapshot.size}`);
  console.log(`NBA games:           ${nbaCount}`);
  console.log(`Soccer games:        ${soccerCount}`);
  console.log(`Other:               ${otherCount}`);
  console.log(`With ML prop data:   ${withMLData}`);
  console.log(`Without ML prop data: ${withoutMLData}`);
}

listGameArchive()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
