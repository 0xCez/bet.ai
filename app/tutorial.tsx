import React, { useEffect, useRef, useCallback } from "react";
import { Text, StyleSheet, View, TouchableOpacity, Dimensions, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import LottieView from "lottie-react-native";
import GlowComponent from "../components/ui/GlowComponent";
import i18n from "../i18n";
import { useOnboardingAnalytics } from "../hooks/useOnboardingAnalytics";
import { resetDemoNextButton } from "../components/ui/FloatingBottomNav";
import { useDemoTooltip } from "../contexts/DemoTooltipContext";
// TODO: Image transition - commented out for now, will finish later
// import { useImageTransition } from "../contexts/ImageTransitionContext";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  FadeInDown,
  FadeInUp,
  interpolate,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Animated orb background (same as paywall)
function AnimatedOrb() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.orbContainer, animatedStyle]}>
      <LinearGradient
        colors={[`${colors.primary}50`, `${colors.primary}20`, `${colors.primary}05`, 'transparent']}
        style={styles.orb}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
    </Animated.View>
  );
}

// Feature item for the demo preview - enhanced design
function DemoFeatureItem({ icon, text, delay }: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400)}
      style={styles.featureItem}
    >
      <LinearGradient
        colors={[colors.rgba.primary20, colors.rgba.primary10]}
        style={styles.featureIconContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name={icon} size={18} color={colors.primary} />
      </LinearGradient>
      <Text style={styles.featureText}>{text}</Text>
    </Animated.View>
  );
}

// Shimmer CTA Button
function ShimmerCTAButton({ onPress }: { onPress: () => void }) {
  const shimmerPosition = useSharedValue(-1);
  const glowPulse = useSharedValue(1);

  useEffect(() => {
    // Shimmer sweep animation
    shimmerPosition.value = withRepeat(
      withSequence(
        withDelay(2000, withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })),
        withTiming(-1, { duration: 0 })
      ),
      -1,
      false
    );

    // Subtle glow pulse
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmerPosition.value, [-1, 1], [-200, 400]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowPulse.value }],
    shadowOpacity: interpolate(glowPulse.value, [1, 1.03], [0.3, 0.5]),
  }));

  return (
    <Animated.View style={[styles.shimmerButtonWrapper, glowStyle]}>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        activeOpacity={0.9}
        style={styles.shimmerButton}
      >
        <LinearGradient
          colors={[colors.primary, '#00B8B8', colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Shimmer overlay */}
        <Animated.View style={[styles.shimmerOverlay, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255, 255, 255, 0.3)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>

        <View style={styles.shimmerButtonContent}>
          <Text style={styles.shimmerButtonText}>{i18n.t("tutorialStartDemo")}</Text>
          <View style={styles.shimmerButtonArrow}>
            <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function TutorialScreen() {
  const { trackFunnelStep } = useOnboardingAnalytics();
  const { resetDemo } = useDemoTooltip();
  const hasTracked = useRef(false);

  // Animation values
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.95);

  // Track tutorial screen viewed on mount and reset demo state
  useEffect(() => {
    // Reset the Next button state and tooltips for a fresh demo session
    resetDemoNextButton();
    resetDemo();

    if (!hasTracked.current) {
      trackFunnelStep('tutorial_viewed');
      hasTracked.current = true;
    }

    // Animate card in
    cardOpacity.value = withDelay(300, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    cardScale.value = withDelay(300, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
  }, []);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  // Get the demo image source based on locale
  const getDemoImageSource = useCallback(() => {
    if (i18n.locale.startsWith("fr")) {
      return require("../assets/images/demo_fr.png");
    } else if (i18n.locale.startsWith("es")) {
      return require("../assets/images/demo_es.png");
    }
    return require("../assets/images/demo_en.jpg");
  }, []);

  const handleStartDemo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/analysis",
      params: {
        isDemo: "true",
        analysisId:
          i18n.locale.startsWith("fr")
            ? "9vYnwxZ4MIyDZvuaB3HR"
            : i18n.locale.startsWith("es")
              ? "JTSXUKYC5cNhfqpXvIue"
              : "EzUfK8cw0tbFR0cFSIfF",
      },
    });
  }, []);

  return (
    <ScreenBackground hideBg={true}>
      {/* Animated background orb */}
      <AnimatedOrb />

      <LottieView
        source={require("../assets/lottie/confettis.json")}
        autoPlay
        loop={false}
        style={styles.confetti}
      />

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Animated.View
            entering={FadeInDown.delay(100).duration(400)}
            style={styles.badgeContainer}
          >
            <LinearGradient
              colors={[colors.rgba.primary20, colors.rgba.primary10]}
              style={styles.badge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="play-circle" size={16} color={colors.primary} />
              <Text style={styles.badgeText}>{i18n.t("tutorialDemoBadge")}</Text>
            </LinearGradient>
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(150).duration(400)}
            style={styles.title}
          >
            {i18n.t("tutorialSeeHowItWorks")}
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(200).duration(400)}
            style={styles.subtitle}
          >
            {i18n.t("tutorialExploreDemo")}
          </Animated.Text>
        </View>

        {/* Demo Card Preview - Larger size matching analysis page */}
        <Animated.View style={[styles.gameCardContainer, cardAnimatedStyle]}>
          <View style={styles.gameCard}>
            <GlowComponent
              imageSource={getDemoImageSource()}
              style={styles.glowImage}
              pulse={true}
            />
          </View>
        </Animated.View>

        {/* Features Preview - Enhanced Cards */}
        <View style={styles.featuresSection}>
          <View style={styles.featuresGrid}>
            <DemoFeatureItem
              icon="bulb-outline"
              text={i18n.t("tutorialFeature1")}
              delay={400}
            />
            <DemoFeatureItem
              icon="trending-up-outline"
              text={i18n.t("tutorialFeature2")}
              delay={450}
            />
            <DemoFeatureItem
              icon="people-outline"
              text={i18n.t("tutorialFeature3")}
              delay={500}
            />
            <DemoFeatureItem
              icon="chatbubble-ellipses-outline"
              text={i18n.t("tutorialFeature4")}
              delay={550}
            />
          </View>
        </View>
      </ScrollView>

      {/* Fixed Footer with CTA */}
      <Animated.View
        entering={FadeInUp.delay(600).duration(400)}
        style={styles.fixedFooter}
      >
        <LinearGradient
          colors={['transparent', colors.background, colors.background]}
          style={styles.footerGradient}
        />
        <View style={styles.footerContent}>
          <ShimmerCTAButton onPress={handleStartDemo} />
          <Text style={styles.demoNote}>{i18n.t("tutorialDemoNote")}</Text>
        </View>
      </Animated.View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  // Animated Orb
  orbContainer: {
    position: "absolute",
    top: SCREEN_HEIGHT * 0.12,
    left: SCREEN_WIDTH / 2 - 175,
    width: 350,
    height: 350,
    zIndex: 0,
  },
  orb: {
    width: "100%",
    height: "100%",
    borderRadius: 175,
  },
  confetti: {
    width: "100%",
    height: "100%",
    position: "absolute",
    zIndex: 999,
    pointerEvents: "none",
  },

  // Scrollable content
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing[10],
    paddingHorizontal: spacing[4],
    paddingBottom: 180, // Space for fixed footer
  },

  // Header
  headerSection: {
    alignItems: "center",
    marginBottom: spacing[4],
  },
  badgeContainer: {
    marginBottom: spacing[2],
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  badgeText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    textAlign: "center",
    marginBottom: spacing[1],
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingHorizontal: spacing[4],
    lineHeight: 20,
  },

  // Game Card - Larger, matching analysis page
  gameCardContainer: {
    alignItems: "center",
    marginVertical: spacing[4],
    position: "relative",
  },
  gameCard: {
    width: SCREEN_WIDTH - spacing[8],
    height: 300,
    aspectRatio: 1,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
  glowImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },

  // Features
  featuresSection: {
    paddingHorizontal: spacing[1],
    marginTop: spacing[2],
  },
  featuresGrid: {
    gap: spacing[2] + 2,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.rgba.glassLight,
    paddingVertical: spacing[2] + 2,
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.rgba.white10,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  featureText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
    flex: 1,
  },

  // Fixed Footer
  fixedFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  footerGradient: {
    position: "absolute",
    top: -40,
    left: 0,
    right: 0,
    height: 60,
  },
  footerContent: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[10],
    alignItems: "center",
    gap: spacing[2],
  },

  // Shimmer Button Styles
  shimmerButtonWrapper: {
    width: "95%",
    alignSelf: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 10,
  },
  shimmerButton: {
    width: "100%",
    height: 56,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 100,
    zIndex: 1,
  },
  shimmerGradient: {
    flex: 1,
    width: "100%",
  },
  shimmerButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    zIndex: 2,
  },
  shimmerButtonText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semibold,
    color: colors.primaryForeground,
  },
  shimmerButtonArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  demoNote: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});
