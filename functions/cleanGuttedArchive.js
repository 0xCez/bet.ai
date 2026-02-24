const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

async function clean() {
  const snapshot = await db.collection('gameArchive').get();
  const batch = db.batch();
  let deleted = 0;
  let kept = 0;

  snapshot.forEach(doc => {
    const a = doc.data().analysis || {};
    if (a.aiAnalysis && a.aiAnalysis.breakdown) {
      kept++;
    } else {
      console.log(`  DELETE: ${doc.id}`);
      batch.delete(doc.ref);
      deleted++;
    }
  });

  if (deleted > 0) {
    await batch.commit();
  }

  console.log(`\nDeleted ${deleted} gutted docs, kept ${kept} full docs`);
}

clean()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
