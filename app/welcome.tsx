import React, { useContext } from "react";
import { View, Text, StyleSheet, Dimensions, Image } from "react-native";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "../components/ui/GradientButton";
import { BorderButton } from "../components/ui/BorderButton";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { getAppState } from "../utils/appStorage";
import { RFValue } from "react-native-responsive-fontsize";
import { MultilineText } from "@/components/ui/MultilineText";
import { RevenueCatContext } from "./providers/RevenueCatProvider";
import LottieView from "lottie-react-native";
import i18n from "../i18n";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const GradientText = ({
  style,
  children,
}: {
  style?: any;
  children: string;
}) => {
  return (
    <MaskedView
      maskElement={<Text style={[styles.welcomeText, style]}>{children}</Text>}
    >
      <LinearGradient
        colors={["#FFFFFF", "#999999"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <Text style={[styles.welcomeText, style, { opacity: 0 }]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
};

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
    marginTop: 40,
  },
  content: {
    flex: 1,
    alignItems: "center",
    // justifyContent: "center",
    paddingHorizontal: 20,
    // marginBottom: 100,
  },
  welcomeText: {
    fontFamily: "Aeonik-Regular",
    fontSize: RFValue(28),
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 16,
  },
  subText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#ffffff",
    opacity: 0.8,
    textAlign: "center",
    marginBottom: 0,
    paddingHorizontal: 70,
  },
  starsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  leaf: {
    height: "59%",
    resizeMode: "contain",
    marginTop: 40,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 54,
  },
  authButtonsContainer: {
    width: "100%",
    gap: 14,
    alignItems: "center",
    marginTop: 30,
  },
});
