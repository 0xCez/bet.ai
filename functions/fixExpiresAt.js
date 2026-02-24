const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function fix() {
  const snapshot = await db.collection('matchAnalysisCache')
    .where('preCached', '==', true)
    .get();

  let updated = 0, skipped = 0;
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.gameStartTime) { skipped++; return; }

    const gameStart = new Date(data.gameStartTime);
    const correctExpiresAt = new Date(gameStart.getTime() + SEVEN_DAYS_MS).toISOString();

    // Only update if expiresAt is different (i.e. still on old 4h value)
    if (data.expiresAt !== correctExpiresAt) {
      batch.update(doc.ref, { expiresAt: correctExpiresAt });
      const home = data.analysis?.teams?.home || '?';
      const away = data.analysis?.teams?.away || '?';
      console.log(`  FIX: ${away} @ ${home} — ${data.expiresAt?.substring(0,16)} → ${correctExpiresAt.substring(0,16)}`);
      updated++;
    } else {
      skipped++;
    }
  });

  if (updated > 0) {
    await batch.commit();
  }

  console.log(`\nDone — updated: ${updated}, already correct: ${skipped}`);
}

fix()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
