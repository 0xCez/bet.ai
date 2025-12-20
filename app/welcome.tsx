import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { GradientButton } from "../components/ui/GradientButton";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { getAppState } from "../utils/appStorage";
import { RFValue } from "react-native-responsive-fontsize";
import { MultilineText } from "@/components/ui/MultilineText";
import { colors, spacing, typography } from "../constants/designTokens";
import LottieView from "lottie-react-native";
import i18n from "../i18n";

export default function WelcomeScreen() {
  const handleNewUser = async () => {
    try {
      const appState = await getAppState();
      if (appState?.signupComplete) {
        router.push("/tutorial");
        // router.push("/signup");
      } else {
        router.push("/signup");
      }
    } catch (error) {
      console.error("Error checking app state:", error);
      // Default to signup if we can't check the state
      router.push("/signup");
    }
  };

  return (
    <ScreenBackground hideBg>
      <View style={styles.content}>
        {/* <Image
          source={require("../assets/images/welcome2.png")}
          style={styles.leaf}
        /> */}

        <LottieView
          source={require("../assets/lottie/welcome.json")}
          autoPlay
          loop={true}
          style={{ width: "100%", height: "60%", marginTop: 40 }}
        />

        <View style={styles.textContainer}>
          <MultilineText
            line1={i18n.t("welcomeFindWinningBets")}
            line2={i18n.t("welcomeWithJustAPic")}
            fontSize={26}
            fontFamily="Aeonik-Medium"
          />
        </View>

        <View style={styles.authButtonsContainer}>
          <GradientButton onPress={handleNewUser}>
            {i18n.t("welcomeGetStarted")}
          </GradientButton>

          <Text onPress={() => router.push("/login")} style={styles.subText}>
            {i18n.t("welcomeAlreadyHaveAccount")}
          </Text>
        </View>
      </View>

      {/* <BlurView intensity={0} tint="dark" style={styles.bottomContainer}>
        <View style={styles.authButtonsContainer}>
          <GradientButton onPress={handleNewUser}>I'm new here</GradientButton>
          <BorderButton onPress={() => router.push("/login")}>
            I already have an account
          </BorderButton>
        </View>
      </BlurView> */}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  textContainer: {
    marginTop: spacing[10],
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: spacing[5],
  },
  welcomeText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: RFValue(28),
    color: colors.foreground,
    textAlign: "center",
    marginBottom: spacing[4],
  },
  subText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground, // #7A8BA3 - muted text
    textAlign: "center",
    marginBottom: 0,
    paddingHorizontal: 70,
  },
  starsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[6],
  },
  leaf: {
    height: "59%",
    resizeMode: "contain",
    marginTop: spacing[10],
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing[5],
    paddingBottom: 54,
  },
  authButtonsContainer: {
    width: "100%",
    gap: spacing[3],
    alignItems: "center",
    marginTop: 30,
  },
});
