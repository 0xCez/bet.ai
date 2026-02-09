import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { GradientButton } from "../components/ui/GradientButton";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { Logo } from "../components/ui/Logo";
import { getAppState } from "../utils/appStorage";
import { MultilineText } from "@/components/ui/MultilineText";
import { colors, spacing, typography } from "../constants/designTokens";
import { GradientOrb } from "../components/ui/GradientOrb";
import { FloatingParticles } from "../components/ui/FloatingParticles";
// import { OnboardingSlide1Visual } from "../components/ui/OnboardingSlide1Visual";
import i18n from "../i18n";
import { useOnboardingAnalytics } from "../hooks/useOnboardingAnalytics";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function WelcomeScreen() {
  const { trackFunnelStep } = useOnboardingAnalytics();
  const hasTracked = useRef(false);

  // Animation values for entrance
  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(-20);
  // const scanOpacity = useSharedValue(0);
  // const scanScale = useSharedValue(0.95);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(20);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(20);

  // Track welcome screen viewed on mount and start animations
  useEffect(() => {
    if (!hasTracked.current) {
      trackFunnelStep('welcome_viewed');
      hasTracked.current = true;
    }

    const timingConfig = {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    };

    // Logo animation - starts immediately
    logoOpacity.value = withTiming(1, timingConfig);
    logoTranslateY.value = withTiming(0, timingConfig);

    // Scan animation area - commented out
    // scanOpacity.value = withDelay(200, withTiming(1, timingConfig));
    // scanScale.value = withDelay(200, withTiming(1, timingConfig));

    // Text animation - starts after logo
    textOpacity.value = withDelay(200, withTiming(1, timingConfig));
    textTranslateY.value = withDelay(400, withTiming(0, timingConfig));

    // Buttons animation - even more delayed
    buttonsOpacity.value = withDelay(600, withTiming(1, timingConfig));
    buttonsTranslateY.value = withDelay(600, withTiming(0, timingConfig));
  }, []);

  // Animated styles
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTranslateY.value }],
  }));

  // const scanAnimatedStyle = useAnimatedStyle(() => ({
  //   opacity: scanOpacity.value,
  //   transform: [{ scale: scanScale.value }],
  // }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }));

  const handleNewUser = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const appState = await getAppState();
      if (appState?.signupComplete) {
        router.push("/paywall");
      } else {
        router.push("/signup");
      }
    } catch (error) {
      console.error("Error checking app state:", error);
      router.push("/signup");
    }
  };

  return (
    <ScreenBackground hideBg>
      {/* Background effects - subtle orb and particles */}
      <GradientOrb
        size={400}
        verticalPosition={0.42}
        opacity={0.35}
      />
      <FloatingParticles
        count={10}
        verticalPosition={0.42}
        spread={200}
      />

      <View style={styles.container}>
        {/* Logo at top */}
        <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
          <Logo size="medium" />
        </Animated.View>

        {/* Scan animation - commented out for now */}
        {/* <Animated.View style={[styles.scanContainer, scanAnimatedStyle]}>
          <OnboardingSlide1Visual isActive={true} scale={0.72} opacity={0.85} />
        </Animated.View> */}

        {/* Spacer to push content down appropriately */}
        <View style={styles.spacer} />

        {/* Text and CTAs at bottom */}
        <View style={styles.bottomContent}>
          <Animated.View style={[styles.textContainer, textAnimatedStyle]}>
            <MultilineText
              line1={i18n.t("welcomeFindWinningBets")}
              line2={i18n.t("welcomeWithJustAPic")}
              fontSize={26}
              fontFamily="Aeonik-Medium"
            />
          </Animated.View>

          <Animated.View style={[styles.authButtonsContainer, buttonsAnimatedStyle]}>
            <GradientButton onPress={handleNewUser}>
              {i18n.t("welcomeGetStarted")}
            </GradientButton>

            <Text
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/login");
              }}
              style={styles.subText}
            >
              {i18n.t("welcomeAlreadyHaveAccount")}
            </Text>
          </Animated.View>
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoContainer: {
    alignItems: "center",
    paddingTop: spacing[4],
    zIndex: 10,
  },
  spacer: {
    flex: 1,
  },
  scanContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -SCREEN_HEIGHT * 0.08,
    marginBottom: -SCREEN_HEIGHT * 0.05,
  },
  bottomContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: SCREEN_HEIGHT * 0.06,
  },
  textContainer: {
    alignItems: "center",
    marginBottom: spacing[6],
  },
  authButtonsContainer: {
    width: "100%",
    gap: spacing[3],
    alignItems: "center",
  },
  subText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingHorizontal: 70,
  },
});
