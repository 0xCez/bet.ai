/**
 * Script to update the English demo analysis with new content
 * This version uses the Firebase client SDK (works without service account key)
 *
 * Source: User's new analysis
 *   - User ID: MTxoKPLMfIcm8UOXWpJuvXEpyL22
 *   - Analysis ID: UgGfgCqIjY4QNEJVvacj
 *
 * Target: Demo analysis
 *   - Demo User ID: piWQIzwI9tNXrNTgb5dWTqAjUrj2
 *   - Analysis ID: OT8KyNVdriQgnRi7Q5b6
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = require('firebase/firestore');

// Firebase configuration (from your firebaseConfig.js)
const firebaseConfig = {
  apiKey: "AIzaSyCyna-iA9d5bkP8NBcCFt2bPmGTQuKxF6s",
  authDomain: "betai-f9176.firebaseapp.com",
  projectId: "betai-f9176",
  storageBucket: "betai-f9176.firebasestorage.app",
  messagingSenderId: "133991312998",
  appId: "1:133991312998:ios:4798a1f70981c5dcafc7a7",
  measurementId: "G-4C1EPC8QJY",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
    const sourceDocRef = doc(db, 'userAnalyses', SOURCE_USER_ID, 'analyses', SOURCE_ANALYSIS_ID);
    const sourceDoc = await getDoc(sourceDocRef);

    if (!sourceDoc.exists()) {
      throw new Error('❌ Source analysis not found!');
    }

    const sourceData = sourceDoc.data();
    console.log('✅ Source analysis fetched successfully');
    console.log(`   Teams: ${sourceData.teams}`);
    console.log(`   Sport: ${sourceData.sport}`);
    console.log(`   Confidence: ${sourceData.confidence}`);
    console.log(`   Has analysis data: ${!!sourceData.analysis}`);
    console.log(`   Has market intelligence: ${!!sourceData.analysis?.marketIntelligence}`);

    // Check if market intelligence data is present
    if (sourceData.analysis?.marketIntelligence) {
      const mi = sourceData.analysis.marketIntelligence;
      console.log(`   Market Intel sections:`);
      console.log(`     - Best Lines: ${!!mi.bestLines}`);
      console.log(`     - Sharp Meter: ${!!mi.sharpMeter}`);
      console.log(`     - Vig Analysis: ${!!mi.vigAnalysis}`);
      console.log(`     - Fair Value: ${!!mi.fairValue}`);
      console.log(`     - EV Opportunities: ${!!mi.evOpportunities}`);
      console.log(`     - Market Tightness: ${!!mi.marketTightness}`);
      console.log(`     - Odds Table: ${mi.oddsTable ? `${mi.oddsTable.length} bookmakers` : 'none'}`);
    } else {
      console.warn('⚠️  WARNING: No market intelligence data found in source analysis!');
    }

    // Prepare the data to update in the demo analysis
    console.log('\n📝 Preparing update for demo analysis...');
    console.log(`   Demo User ID: ${DEMO_USER_ID}`);
    console.log(`   Demo Analysis ID: ${DEMO_ANALYSIS_ID}`);

    const targetDocRef = doc(db, 'userAnalyses', DEMO_USER_ID, 'analyses', DEMO_ANALYSIS_ID);

    // Fetch current demo doc to preserve createdAt
    const currentDemoDoc = await getDoc(targetDocRef);
    const currentDemoData = currentDemoDoc.exists() ? currentDemoDoc.data() : {};

    // Update with new data while preserving createdAt
    const updateData = {
      ...sourceData,
      // Preserve the original demo createdAt timestamp so it appears in the right order
      createdAt: currentDemoData.createdAt || serverTimestamp(),
      // Add a field to track when this was last updated
      lastUpdated: serverTimestamp(),
      isDemoAnalysis: true
    };

    console.log('\n🔄 Updating demo analysis...');
    await setDoc(targetDocRef, updateData);

    console.log('✅ Demo analysis updated successfully!');
    console.log('\n📊 Summary:');
    console.log(`   ✓ Copied teams: ${updateData.teams}`);
    console.log(`   ✓ Copied sport: ${updateData.sport}`);
    console.log(`   ✓ Copied confidence: ${updateData.confidence}`);
    console.log(`   ✓ Copied full analysis object with all nested data`);
    console.log(`   ✓ Copied market intelligence data: ${!!updateData.analysis?.marketIntelligence}`);
    console.log(`   ✓ Copied image URL: ${!!updateData.imageUrl}`);

    console.log('\n🎉 Demo analysis cache update complete!');
    console.log('\n⚠️  IMPORTANT: The demo analysis will now load from cache.');
    console.log('    Make sure the "Get fresh odds" button is disabled in demo mode.');

  } catch (error) {
    console.error('❌ Error updating demo analysis:', error);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    throw error;
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
