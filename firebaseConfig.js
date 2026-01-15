import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyCyna-iA9d5bkP8NBcCFt2bPmGTQuKxF6s",
  authDomain: "betai-f9176.firebaseapp.com",
  projectId: "betai-f9176",
  storageBucket: "betai-f9176.firebasestorage.app",
  messagingSenderId: "133991312998",
  appId: "1:133991312998:ios:4798a1f70981c5dcafc7a7",
  measurementId: "G-4C1EPC8QJY",
};

const app = initializeApp(firebaseConfig);

// Initialize Auth with React Native persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);
