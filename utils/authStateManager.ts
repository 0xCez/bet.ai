import { User } from "firebase/auth";
import { auth } from "../firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_STATE_KEY = "@auth_state";
const LAST_AUTH_CHECK_KEY = "@last_auth_check";

interface AuthState {
  isLoggedIn: boolean;
  userId: string | null;
  email: string | null;
  lastCheck: number;
}

// Cache auth state to prevent unnecessary re-authentication
let cachedAuthState: AuthState | null = null;
let authStateListeners: ((user: User | null) => void)[] = [];

export const saveAuthState = async (user: User | null) => {
  try {
    const authState: AuthState = {
      isLoggedIn: !!user,
      userId: user?.uid || null,
      email: user?.email || null,
      lastCheck: Date.now(),
    };

    cachedAuthState = authState;
    await AsyncStorage.setItem(AUTH_STATE_KEY, JSON.stringify(authState));
    await AsyncStorage.setItem(LAST_AUTH_CHECK_KEY, Date.now().toString());

    console.log("Auth state saved:", { isLoggedIn: authState.isLoggedIn, userId: authState.userId });
  } catch (error) {
    console.error("Error saving auth state:", error);
  }
};

export const getAuthState = async (): Promise<AuthState | null> => {
  try {
    // Return cached state if available and recent (less than 5 minutes old)
    if (cachedAuthState && (Date.now() - cachedAuthState.lastCheck) < 5 * 60 * 1000) {
      return cachedAuthState;
    }

    const authStateJson = await AsyncStorage.getItem(AUTH_STATE_KEY);
    if (!authStateJson) {
      return null;
    }

    const authState: AuthState = JSON.parse(authStateJson);

    // Check if auth state is recent (less than 1 hour old)
    const isRecent = (Date.now() - authState.lastCheck) < 60 * 60 * 1000;

    if (isRecent) {
      cachedAuthState = authState;
      return authState;
    }

    return null;
  } catch (error) {
    console.error("Error getting auth state:", error);
    return null;
  }
};

export const clearAuthState = async () => {
  try {
    cachedAuthState = null;
    await AsyncStorage.removeItem(AUTH_STATE_KEY);
    await AsyncStorage.removeItem(LAST_AUTH_CHECK_KEY);
    console.log("Auth state cleared");
  } catch (error) {
    console.error("Error clearing auth state:", error);
  }
};

export const isUserLoggedIn = async (): Promise<boolean> => {
  try {
    // First check Firebase auth current user
    const currentUser = auth.currentUser;
    if (currentUser) {
      // Update cached state if user is logged in
      await saveAuthState(currentUser);
      return true;
    }

    // Then check cached auth state
    const authState = await getAuthState();
    return authState?.isLoggedIn || false;
  } catch (error) {
    console.error("Error checking login status:", error);
    return false;
  }
};

// Enhanced auth state listener that prevents multiple rapid calls
let authCheckTimeout: NodeJS.Timeout | null = null;

export const addAuthStateListener = (callback: (user: User | null) => void) => {
  authStateListeners.push(callback);

  // Return unsubscribe function
  return () => {
    authStateListeners = authStateListeners.filter(listener => listener !== callback);
  };
};

// Debounced auth state change handler
const handleAuthStateChange = (user: User | null) => {
  if (authCheckTimeout) {
    clearTimeout(authCheckTimeout);
  }

  authCheckTimeout = setTimeout(async () => {
    await saveAuthState(user);

    // Notify all listeners
    authStateListeners.forEach(listener => {
      try {
        listener(user);
      } catch (error) {
        console.error("Error in auth state listener:", error);
      }
    });
  }, 500); // 500ms debounce
};

// Initialize auth state monitoring
export const initializeAuthStateManager = () => {
  console.log("Initializing auth state manager...");

  // Set up Firebase auth state listener with debouncing
  return auth.onAuthStateChanged(handleAuthStateChange);
};
