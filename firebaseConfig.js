import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ⚠️ DEVELOPMENT FIREBASE CONFIG - DO NOT USE IN PRODUCTION
// This is a separate Firebase project for development purposes only
const firebaseConfig = {
  apiKey: "AIzaSyAByE5DUvNSFYe2rYMrYa5Uk5t1OfBxCQ0",
  authDomain: "betai-dev-16.firebaseapp.com",
  projectId: "betai-dev-16",
  storageBucket: "betai-dev-16.firebasestorage.app",
  messagingSenderId: "878948709969",
  appId: "1:878948709969:web:7d50532cd5a73da8ec2a70",
  measurementId: "G-RVG4WTZ06P"
};

const app = initializeApp(firebaseConfig);

// Initialize Auth with React Native persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);
