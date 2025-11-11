/**
 * Script to inspect an analysis document and see exactly what data it contains
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc } = require('firebase/firestore');

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

// Analysis to inspect
const USER_ID = 'MTxoKPLMfIcm8UOXWpJuvXEpyL22';
const ANALYSIS_ID = 'UgGfgCqIjY4QNEJVvacj';

async function inspectAnalysis() {
  try {
    console.log('🔍 Inspecting analysis...');
    console.log(`   User ID: ${USER_ID}`);
    console.log(`   Analysis ID: ${ANALYSIS_ID}`);

    const docRef = doc(db, 'userAnalyses', USER_ID, 'analyses', ANALYSIS_ID);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('❌ Analysis not found!');
    }

    const data = docSnap.data();

    console.log('\n📊 Top-level fields:');
    Object.keys(data).forEach(key => {
      const value = data[key];
      const type = Array.isArray(value) ? 'array' : typeof value;
      console.log(`   - ${key}: ${type}`);
    });

    if (data.analysis?.marketIntelligence) {
      const mi = data.analysis.marketIntelligence;
      console.log('\n📈 Market Intelligence sections:');
      Object.keys(mi).forEach(key => {
        const value = mi[key];
        const type = Array.isArray(value) ? 'array' : typeof value;
        console.log(`   - ${key}: ${type}`);

        // Show nested structure for objects
        if (type === 'object' && value !== null) {
          Object.keys(value).forEach(subKey => {
            console.log(`     └─ ${subKey}: ${typeof value[subKey]}`);
          });
        }
      });

      // Detailed inspection
      console.log('\n🔬 Detailed Market Intelligence:');
      console.log(JSON.stringify(mi, null, 2));
    } else {
      console.log('\n⚠️  No marketIntelligence found in analysis object');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the script
inspectAnalysis()
  .then(() => {
    console.log('\n✨ Inspection complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error.message);
    process.exit(1);
  });
