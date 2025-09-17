import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { PostHogProvider } from "posthog-react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import { useEffect } from "react";
import i18n from "../i18n";

import { useColorScheme } from "@/hooks/useColorScheme";
import { RevenueCatProvider } from "./providers/RevenueCatProvider";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    "Aeonik-Regular": require("../assets/fonts/Aeonik-Regular.otf"),
    "Aeonik-Bold": require("../assets/fonts/Aeonik-Bold.otf"),
    "Aeonik-Light": require("../assets/fonts/Aeonik-Light.otf"),
    "Aeonik-Medium": require("../assets/fonts/Aeonik-Medium.otf"),
    "Aeonik-LightItalic": require("../assets/fonts/Aeonik-LightItalic.otf"),
    "Aeonik-RegularItalic": require("../assets/fonts/Aeonik-RegularItalic.otf"),
    "Aeonik-Black": require("../assets/fonts/Aeonik-Black.ttf"),
  });

  // Initialize i18n with the device locale
  useEffect(() => {
    // Set the locale from the device
    i18n.locale = Localization.locale;
    console.log("Device locale set to:", i18n.locale);
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <PostHogProvider
      apiKey="phc_poDQ9VIIhfP0rbYLiovSrktgSKjtMN6Z2GxSNX0Pj1o"
      autocapture
      options={{
        host: "https://eu.i.posthog.com",
        sendFeatureFlagEvent: true,
        preloadFeatureFlags: true,
        captureNativeAppLifecycleEvents: true,
      }}
    >
      <RevenueCatProvider>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.container}>
            <ThemeProvider
              value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
              <Slot />
            </ThemeProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </RevenueCatProvider>
    </PostHogProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
