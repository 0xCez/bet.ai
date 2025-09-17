import { useEffect, useState } from "react";
import { View, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../firebaseConfig";
import { onAuthStateChanged, User } from "firebase/auth";
import { getAppState, AppState } from "../utils/appStorage";
import * as SplashScreen from "expo-splash-screen";
import { Logo } from "@/components/ui/Logo";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { usePostHog } from "posthog-react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Localization from "expo-localization";

SplashScreen.preventAutoHideAsync();

export default function SplashPage() {
  const router = useRouter();
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const posthog = usePostHog();

  // Handle Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  // Handle navigation once auth is initialized
  useEffect(() => {
    async function initialize() {
      try {
        // Track app launch with PostHog
        await posthog?.capture("app_launched", {
          appVersion: Application.nativeApplicationVersion,
          appBuild: Application.nativeBuildVersion,
          deviceName: Device.deviceName,
          deviceType: Device.deviceType,
          osName: Device.osName,
          osVersion: Device.osVersion,
          locale: Localization.locale,
        });

        // Load app state
        const state = await getAppState();
        setAppState(state);
        console.log("Loading app state in splash state", state);

        // Hide the native splash screen
        await SplashScreen.hideAsync();

        // Handle navigation based on state
        if (!state?.onboardingComplete) {
          router.replace("/onboarding");
          return;
        }

        if (firebaseUser) {
          router.replace("/home");
          return;
        }

        if (!state.signupComplete) {
          if (!state.signupStep) {
            router.replace("/welcome");
          } else {
            router.replace("/welcome");
          }
          return;
        }

        if (!firebaseUser) {
          router.replace("/welcome");
          return;
        }

        // If all checks pass, go to home
        router.replace("/home");
      } catch (error) {
        console.error("Error in splash initialization:", error);
        // In case of error, redirect to welcome as a safe default
        router.replace("/welcome");
      }
    }

    if (isAuthInitialized) {
      initialize();
    }
  }, [isAuthInitialized, firebaseUser]);

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require("../assets/images/logo4.png")}
          style={styles.image}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#0C0C0C",
  },
  logoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "25%",
    height: "25%",
  },
});
