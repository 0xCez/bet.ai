/**
 * Script to update the English demo analysis with new content
 *
 * Source: User's new analysis
 *   - User ID: MTxoKPLMfIcm8UOXWpJuvXEpyL22
 *   - Analysis ID: UgGfgCqIjY4QNEJVvacj
 *
 * Target: Demo analysis
 *   - Demo User ID: piWQIzwI9tNXrNTgb5dWTqAjUrj2
 *   - Analysis ID: OT8KyNVdriQgnRi7Q5b6
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'betai-f9176'
});

const db = admin.firestore();

// Source and target info
const SOURCE_USER_ID = 'MTxoKPLMfIcm8UOXWpJuvXEpyL22';
const SOURCE_ANALYSIS_ID = 'UgGfgCqIjY4QNEJVvacj';
const DEMO_USER_ID = 'piWQIzwI9tNXrNTgb5dWTqAjUrj2';
const DEMO_ANALYSIS_ID = 'OT8KyNVdriQgnRi7Q5b6';

async function updateDemoAnalysis() {
  try {
    console.log('🔍 Fetching source analysis...');
    console.log(`   User ID: ${SOURCE_USER_ID}`);
    console.log(`   Analysis ID: ${SOURCE_ANALYSIS_ID}`);

    // Fetch the source analysis
    const sourceDocRef = db
      .collection('userAnalyses')
      .doc(SOURCE_USER_ID)
      .collection('analyses')
      .doc(SOURCE_ANALYSIS_ID);

    const sourceDoc = await sourceDocRef.get();

    if (!sourceDoc.exists) {
      throw new Error('❌ Source analysis not found!');
    }

    const sourceData = sourceDoc.data();
    console.log('✅ Source analysis fetched successfully');
    console.log(`   Teams: ${sourceData.teams}`);
    console.log(`   Sport: ${sourceData.sport}`);
    console.log(`   Confidence: ${sourceData.confidence}`);
    console.log(`   Has analysis data: ${!!sourceData.analysis}`);
    console.log(`   Has market intelligence: ${!!sourceData.analysis?.marketIntelligence}`);

    // Prepare the data to update in the demo analysis
    // Keep the demo's original document ID and createdAt, but replace everything else
    console.log('\n📝 Preparing update for demo analysis...');
    console.log(`   Demo User ID: ${DEMO_USER_ID}`);
    console.log(`   Demo Analysis ID: ${DEMO_ANALYSIS_ID}`);

    const targetDocRef = db
      .collection('userAnalyses')
      .doc(DEMO_USER_ID)
      .collection('analyses')
      .doc(DEMO_ANALYSIS_ID);

    // Fetch current demo doc to preserve createdAt
    const currentDemoDoc = await targetDocRef.get();
    const currentDemoData = currentDemoDoc.exists ? currentDemoDoc.data() : {};

    // Update with new data while preserving createdAt
    const updateData = {
      ...sourceData,
      // Preserve the original demo createdAt timestamp so it appears in the right order
      createdAt: currentDemoData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      // Add a field to track when this was last updated
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      isDemoAnalysis: true
    };

    console.log('\n🔄 Updating demo analysis...');
    await targetDocRef.set(updateData, { merge: false }); // Full replace, not merge

    console.log('✅ Demo analysis updated successfully!');
    console.log('\n📊 Summary:');
    console.log(`   ✓ Copied teams: ${updateData.teams}`);
    console.log(`   ✓ Copied sport: ${updateData.sport}`);
    console.log(`   ✓ Copied confidence: ${updateData.confidence}`);
    console.log(`   ✓ Copied full analysis object with all nested data`);
    console.log(`   ✓ Copied market intelligence data (if available)`);
    console.log(`   ✓ Copied image URL: ${!!updateData.imageUrl}`);

    console.log('\n🎉 Demo analysis cache update complete!');

  } catch (error) {
    console.error('❌ Error updating demo analysis:', error);
    throw error;
  } finally {
    // Close the connection
    await admin.app().delete();
  }
}

// Run the script
updateDemoAnalysis()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
