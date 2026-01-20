const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Deletes a user's account and all associated data.
 * Called from the app's settings menu "Account Deletion" button.
 *
 * Apple App Store Requirement: Users must be able to delete their accounts.
 *
 * Deletes:
 * 1. User's analyses from userAnalyses/{uid}/analyses/*
 * 2. User's parent document userAnalyses/{uid}
 * 3. Firebase Auth account
 */
exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = context.auth.uid;
  console.log(`[deleteUserAccount] Starting deletion for user: ${uid}`);

  try {
    // 1. Delete user's analyses subcollection
    const analysesRef = db.collection('userAnalyses').doc(uid).collection('analyses');
    const analysesSnapshot = await analysesRef.get();

    if (!analysesSnapshot.empty) {
      const batch = db.batch();
      analysesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 2. Delete the userAnalyses parent document
      batch.delete(db.collection('userAnalyses').doc(uid));

      // 3. Commit Firestore deletions
      await batch.commit();
      console.log(`[deleteUserAccount] Deleted ${analysesSnapshot.size} analyses for user: ${uid}`);
    } else {
      // No analyses, just delete the parent doc if it exists
      await db.collection('userAnalyses').doc(uid).delete();
      console.log(`[deleteUserAccount] No analyses found, deleted parent doc for user: ${uid}`);
    }

    // 4. Delete Firebase Auth account (server-side, no re-auth needed)
    await admin.auth().deleteUser(uid);
    console.log(`[deleteUserAccount] Auth account deleted for user: ${uid}`);

    return { success: true };
  } catch (error) {
    console.error(`[deleteUserAccount] Error deleting user ${uid}:`, error);
    throw new functions.https.HttpsError('internal', 'Failed to delete account. Please try again.');
  }
});
