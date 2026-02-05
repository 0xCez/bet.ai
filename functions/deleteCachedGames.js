/**
 * Delete all pre-cached NBA games to force refresh with ML props
 */

const admin = require('firebase-admin');
const serviceAccount = require('./betai-f9176-firebase-adminsdk-e0b21-15d2e4f4ca.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteCachedNBAGames() {
  try {
    console.log('🔍 Finding pre-cached NBA games...\n');

    const snapshot = await db.collection('matchAnalysisCache')
      .where('preCached', '==', true)
      .where('sport', '==', 'nba')
      .get();

    console.log(`Found ${snapshot.size} pre-cached NBA games\n`);

    if (snapshot.empty) {
      console.log('❌ No NBA games to delete');
      return;
    }

    // Show what we'll delete
    console.log('🗑️  Will delete:');
    snapshot.forEach((doc) => {
      const data = doc.data();
      const teams = data.analysis?.teams || {};
      console.log(`   - ${teams.home} vs ${teams.away}`);
    });

    console.log('\n🔥 Deleting...');

    // Delete in batches
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`✅ Deleted ${snapshot.size} NBA games successfully!`);
    console.log('\n💡 Now run the pre-cache function to refresh with ML props');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run the script
deleteCachedNBAGames()
  .then(() => {
    console.log('\n✨ Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error.message);
    process.exit(1);
  });
