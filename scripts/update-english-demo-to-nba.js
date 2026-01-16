/**
 * Script to update the English demo analysis to use NBA instead of NFL
 *
 * This script replaces the content of the English demo analysis with an NBA game
 * to fix the issue where NFL player stats API is returning 401 errors.
 *
 * Source: NBA analysis from user
 *   - User ID: MTxoKPLMfIcm8UOXWpJuvXEpyL22
 *   - Analysis ID: OHsTQwr7fjbNIXHfBSG7
 *
 * Target: English Demo analysis
 *   - Demo User ID: piWQIzwI9tNXrNTgb5dWTqAjUrj2
 *   - Analysis ID: EzUfK8cw0tbFR0cFSIfF (used in tutorial.tsx for English locale)
 *   - Collection: demoAnalysis
 *
 * Usage:
 *   node scripts/update-english-demo-to-nba.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'betai-f9176'
});

const db = admin.firestore();

// Source: NBA analysis
const SOURCE_USER_ID = 'MTxoKPLMfIcm8UOXWpJuvXEpyL22';
const SOURCE_ANALYSIS_ID = 'OHsTQwr7fjbNIXHfBSG7';

// Target: English Demo
const DEMO_USER_ID = 'piWQIzwI9tNXrNTgb5dWTqAjUrj2';
const DEMO_ANALYSIS_ID = 'EzUfK8cw0tbFR0cFSIfF';

async function updateDemoAnalysis() {
  try {
    console.log('🏀 Updating English Demo Analysis to NBA');
    console.log('=========================================\n');

    console.log('🔍 Fetching source NBA analysis...');
    console.log(`   User ID: ${SOURCE_USER_ID}`);
    console.log(`   Analysis ID: ${SOURCE_ANALYSIS_ID}`);

    // Fetch the source analysis from userAnalyses
    const sourceDocRef = db
      .collection('userAnalyses')
      .doc(SOURCE_USER_ID)
      .collection('analyses')
      .doc(SOURCE_ANALYSIS_ID);

    const sourceDoc = await sourceDocRef.get();

    if (!sourceDoc.exists) {
      throw new Error('Source analysis not found! Check the user ID and analysis ID.');
    }

    const sourceData = sourceDoc.data();
    console.log('✅ Source analysis fetched successfully');
    console.log(`   Teams: ${sourceData.teams}`);
    console.log(`   Sport: ${sourceData.sport}`);
    console.log(`   Confidence: ${sourceData.confidence}`);
    console.log(`   Has analysis data: ${!!sourceData.analysis}`);

    // Verify it's NBA
    if (sourceData.sport?.toLowerCase() !== 'nba') {
      console.warn(`⚠️  WARNING: Source analysis sport is "${sourceData.sport}", not "nba"!`);
    }

    // Check for required data
    if (sourceData.analysis?.marketIntelligence) {
      const mi = sourceData.analysis.marketIntelligence;
      console.log(`   Market Intel sections:`);
      console.log(`     - Best Lines: ${!!mi.bestLines}`);
      console.log(`     - Sharp Meter: ${!!mi.sharpMeter}`);
      console.log(`     - Odds Table: ${mi.oddsTable ? `${mi.oddsTable.length} bookmakers` : 'none'}`);
    }

    if (sourceData.analysis?.teamStats) {
      console.log(`   Team Stats: ✓ present`);
    }

    // Prepare target in demoAnalysis collection
    console.log('\n📝 Preparing update for English demo analysis...');
    console.log(`   Collection: demoAnalysis`);
    console.log(`   Demo User ID: ${DEMO_USER_ID}`);
    console.log(`   Demo Analysis ID: ${DEMO_ANALYSIS_ID}`);

    const targetDocRef = db
      .collection('demoAnalysis')
      .doc(DEMO_USER_ID)
      .collection('analyses')
      .doc(DEMO_ANALYSIS_ID);

    // Fetch current demo doc to preserve createdAt
    const currentDemoDoc = await targetDocRef.get();
    const currentDemoData = currentDemoDoc.exists ? currentDemoDoc.data() : {};

    // Update with new data while preserving createdAt
    const updateData = {
      ...sourceData,
      // Preserve the original demo createdAt timestamp
      createdAt: currentDemoData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      // Add tracking fields
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      isDemoAnalysis: true
    };

    console.log('\n🔄 Updating demo analysis in demoAnalysis collection...');
    await targetDocRef.set(updateData, { merge: false }); // Full replace

    console.log('✅ English demo analysis updated successfully!');
    console.log('\n📊 Summary:');
    console.log(`   ✓ Replaced NFL demo with NBA game`);
    console.log(`   ✓ Teams: ${updateData.teams}`);
    console.log(`   ✓ Sport: ${updateData.sport}`);
    console.log(`   ✓ Confidence: ${updateData.confidence}`);
    console.log(`   ✓ Has market intelligence: ${!!updateData.analysis?.marketIntelligence}`);
    console.log(`   ✓ Has team stats: ${!!updateData.analysis?.teamStats}`);
    console.log(`   ✓ Image URL: ${updateData.imageUrl ? 'yes' : 'no'}`);

    console.log('\n🎉 English demo analysis now uses NBA!');
    console.log('\n✅ No changes needed to tutorial.tsx - same analysis ID is used.');

  } catch (error) {
    console.error('❌ Error updating demo analysis:', error.message);
    throw error;
  } finally {
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
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  });
