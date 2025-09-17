const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// To use this script, you need a Firebase service account key file
// You can download this from Firebase Console > Project Settings > Service Accounts > Generate new private key
// Save the JSON file to your project directory (don't commit it to version control!)

try {
  // Path to your service account key file
  const serviceAccountPath = path.join(__dirname, 'betai-f9176-firebase-adminsdk-fbsvc-b4d9a8b3d6.json');
  
  if (!fs.existsSync(serviceAccountPath)) {
    console.error('Service account key file not found at:', serviceAccountPath);
    console.log('\nFollow these steps to get a service account key:');
    console.log('1. Go to Firebase Console: https://console.firebase.google.com');
    console.log('2. Select your project');
    console.log('3. Go to Project Settings (gear icon) > Service accounts');
    console.log('4. Click "Generate new private key"');
    console.log('5. Save the file as "serviceAccountKey.json" in the scripts directory');
    process.exit(1);
  }
  
  // Initialize Firebase Admin with service account
  const serviceAccount = require('./betai-f9176-firebase-adminsdk-fbsvc-b4d9a8b3d6.json');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  // Load Spanish demo data
  const spanishDemoDataPath = path.join(__dirname, 'spanish-demo-data.json');
  
  if (!fs.existsSync(spanishDemoDataPath)) {
    console.error('Spanish demo data file not found at:', spanishDemoDataPath);
    process.exit(1);
  }
  
  const spanishDemoData = JSON.parse(fs.readFileSync(spanishDemoDataPath, 'utf8'));
  
  // Format data for Firestore - structure it exactly as expected
  const firestoreData = {
    analysis: spanishDemoData.analysis,
    imageUrl: spanishDemoData.imageUrl,
    confidence: 75, // You can adjust this
    teams: `${spanishDemoData.analysis.teams.home} vs ${spanishDemoData.analysis.teams.away}`,
    createdAt: admin.firestore.Timestamp.now(),
    language: 'es'
  };
  
  // Define path to the Spanish demo document
  const demoUserId = 'piWQIzwI9tNXrNTgb5dWTqAjUrj2';
  const spanishDemoId = 'SpanishDemoAnalysis';
  
  // Upload data to Firestore
  console.log('Uploading Spanish demo data to Firestore...');
  admin.firestore()
    .collection('userAnalyses')
    .doc(demoUserId)
    .collection('analyses')
    .doc(spanishDemoId)
    .set(firestoreData)
    .then(() => {
      console.log('Spanish demo data uploaded successfully!');
      console.log(`Document path: userAnalyses/${demoUserId}/analyses/${spanishDemoId}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error uploading Spanish demo data:', error);
      process.exit(1);
    });

} catch (error) {
  console.error('Unhandled error:', error);
  process.exit(1);
}
