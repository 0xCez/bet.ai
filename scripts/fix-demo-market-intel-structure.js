/**
 * Script to fix the market intelligence data structure in the demo analysis
 *
 * The backend returns data nested under evAnalysis, but the UI expects it at the top level
 * This script flattens the structure to match UI expectations
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc } = require('firebase/firestore');

// Firebase configuration
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

const DEMO_USER_ID = 'piWQIzwI9tNXrNTgb5dWTqAjUrj2';
const DEMO_ANALYSIS_ID = 'OT8KyNVdriQgnRi7Q5b6';

async function fixMarketIntelStructure() {
  try {
    console.log('🔧 Fixing market intelligence data structure...');
    console.log(`   Demo User ID: ${DEMO_USER_ID}`);
    console.log(`   Demo Analysis ID: ${DEMO_ANALYSIS_ID}`);

    const docRef = doc(db, 'userAnalyses', DEMO_USER_ID, 'analyses', DEMO_ANALYSIS_ID);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('❌ Demo analysis not found!');
    }

    const data = docSnap.data();
    const mi = data.analysis?.marketIntelligence;

    if (!mi) {
      throw new Error('❌ No market intelligence data found!');
    }

    console.log('\n📊 Current structure:');
    console.log('   Market Intelligence sections:', Object.keys(mi));

    // Check if evAnalysis exists
    if (!mi.evAnalysis) {
      console.log('⚠️  No evAnalysis found - data might already be restructured');
      return;
    }

    console.log('\n🔄 Restructuring data...');

    // Flatten the structure - move data from evAnalysis to top level
    const updatedMarketIntelligence = {
      ...mi,
      // Top-level fields that should stay as-is
      bestLines: mi.bestLines,
      sharpMeter: mi.sharpMeter,
      marketTightness: mi.marketTightness,
      oddsTable: mi.oddsTable,
      event: mi.event,
      lineMovement: mi.lineMovement,
      rawBookmakerCount: mi.rawBookmakerCount,

      // Flatten evAnalysis data to top level
      vigAnalysis: mi.evAnalysis?.vigAnalysis || null,
      fairValue: mi.evAnalysis?.fairValue || null,
      evOpportunities: mi.evAnalysis?.uiOpportunities || null, // Rename uiOpportunities -> evOpportunities

      // Keep evAnalysis for backward compatibility
      evAnalysis: mi.evAnalysis
    };

    console.log('\n✅ New structure:');
    console.log('   - vigAnalysis:', !!updatedMarketIntelligence.vigAnalysis);
    console.log('   - fairValue:', !!updatedMarketIntelligence.fairValue);
    console.log('   - evOpportunities:', !!updatedMarketIntelligence.evOpportunities);

    // Log sample data
    if (updatedMarketIntelligence.vigAnalysis) {
      console.log('\n📈 Vig Analysis sample:');
      console.log('   Spread:', updatedMarketIntelligence.vigAnalysis.spread);
      console.log('   Moneyline:', updatedMarketIntelligence.vigAnalysis.moneyline);
      console.log('   Total:', updatedMarketIntelligence.vigAnalysis.total);
    }

    if (updatedMarketIntelligence.fairValue) {
      console.log('\n💰 Fair Value sample:');
      console.log('   Spread:', updatedMarketIntelligence.fairValue.spread);
      console.log('   Moneyline:', updatedMarketIntelligence.fairValue.moneyline);
      console.log('   Total:', updatedMarketIntelligence.fairValue.total);
    }

    if (updatedMarketIntelligence.evOpportunities) {
      console.log('\n🎯 EV Opportunities sample:');
      console.log('   Has opportunities:', updatedMarketIntelligence.evOpportunities.hasOpportunities);
      console.log('   Summary:', updatedMarketIntelligence.evOpportunities.summary);
      console.log('   Opportunities count:', updatedMarketIntelligence.evOpportunities.opportunities?.length || 0);
    }

    // Update the document
    console.log('\n💾 Updating Firestore document...');
    await updateDoc(docRef, {
      'analysis.marketIntelligence': updatedMarketIntelligence
    });

    console.log('✅ Market intelligence structure fixed successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✓ Moved vigAnalysis to top level');
    console.log('   ✓ Moved fairValue to top level');
    console.log('   ✓ Renamed uiOpportunities → evOpportunities and moved to top level');
    console.log('   ✓ Kept evAnalysis for backward compatibility');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
fixMarketIntelStructure()
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  });
