import { useEffect, useState, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../firebaseConfig";
import { onAuthStateChanged, User } from "firebase/auth";
import { getAppState, AppState } from "../utils/appStorage";
import { initializeAuthStateManager, isUserLoggedIn } from "../utils/authStateManager";
import * as SplashScreen from "expo-splash-screen";
import { LogoSpinner } from "@/components/ui/LogoSpinner";
import { usePostHog } from "posthog-react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import { colors } from "../constants/designTokens";

SplashScreen.preventAutoHideAsync();

// Minimum time to show splash (2 full animation loops @ 2400ms each + buffer)
const MIN_SPLASH_DURATION = 5500;

export default function SplashPage() {
  const router = useRouter();
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isMinDurationComplete, setIsMinDurationComplete] = useState(false);
  const posthog = usePostHog();
  const navigationDataRef = useRef<{ state: AppState | null; user: User | null } | null>(null);

  // Start minimum duration timer immediately
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMinDurationComplete(true);
    }, MIN_SPLASH_DURATION);

    return () => clearTimeout(timer);
  }, []);

  // Handle Firebase Auth state with improved persistence
  useEffect(() => {
    // Initialize auth state manager
    const unsubscribeAuthManager = initializeAuthStateManager();

    // Set up auth state listener with debouncing
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", { user: !!user, uid: user?.uid });

      // Double-check auth state to prevent false logouts
      const isLoggedIn = await isUserLoggedIn();
      console.log("Confirmed login status:", isLoggedIn);

      setFirebaseUser(user);
      setIsAuthInitialized(true);
    });

    return () => {
      unsubscribe();
      unsubscribeAuthManager();
    };
  }, []);

  // Load data once auth is initialized
  useEffect(() => {
    async function loadData() {
      try {
        // Track app launch with PostHog
        posthog?.capture("app_launched", {
          appVersion: Application.nativeApplicationVersion,
          appBuild: Application.nativeBuildVersion,
          deviceName: Device.deviceName,
          deviceType: Device.deviceType,
          osName: Device.osName,
          osVersion: Device.osVersion,
          locale: Localization.getLocales()[0]?.languageCode || "en",
        });

        // Load app state
        const state = await getAppState();
        console.log("Loading app state in splash state", state);

        // Store navigation data for later use
        navigationDataRef.current = { state, user: firebaseUser };

        // Hide the native splash screen
        await SplashScreen.hideAsync();
      } catch (error) {
        console.error("Error loading splash data:", error);
        navigationDataRef.current = { state: null, user: null };
      }
    }

    if (isAuthInitialized) {
      loadData();
    }
  }, [isAuthInitialized, firebaseUser]);

  // Navigate only when both conditions are met
  useEffect(() => {
    if (!isMinDurationComplete || !isAuthInitialized || !navigationDataRef.current) {
      return;
    }

    const { state, user } = navigationDataRef.current;

    try {
      // Handle navigation based on state
      if (!state?.onboardingComplete) {
        router.replace("/onboarding");
        return;
      }

      if (user) {
        router.replace("/home");
        return;
      }

      if (!state.signupComplete) {
        router.replace("/welcome");
        return;
      }

      if (!user) {
        router.replace("/welcome");
        return;
      }

      // If all checks pass, go to home
      router.replace("/home");
    } catch (error) {
      console.error("Error in splash navigation:", error);
      router.replace("/welcome");
    }
  }, [isMinDurationComplete, isAuthInitialized]);

  return (
    <View style={styles.container}>
      <LogoSpinner size={96} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
