import React from "react";
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import i18n from "@/i18n";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  interpolateColor,
  Easing,
  interpolate,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Track if the Next button has been shown during this demo session
// This persists across component remounts so the button stays visible once shown
let demoNextButtonShown = false;

// Reset function to be called when starting a new demo session
export const resetDemoNextButton = () => {
  demoNextButtonShown = false;
};

interface FloatingBottomNavProps {
  activeTab: "insight" | "market" | "teams" | "players" | "props" | "expert";
  analysisData?: {
    team1?: string;
    team2?: string;
    sport?: string;
    team1Logo?: string;
    team2Logo?: string;
    analysisId?: string;
    isDemo?: boolean;
  };
  isSubscribed?: boolean;
}

// Tab configuration with icons
const TAB_CONFIG = [
  { key: "insight", label: "Insight", icon: "bulb-outline" as const, activeIcon: "bulb" as const },
  { key: "market", label: "Market", icon: "trending-up-outline" as const, activeIcon: "trending-up" as const },
  { key: "teams", label: "Teams", icon: "shield-outline" as const, activeIcon: "shield" as const },
  { key: "players", label: "Players", icon: "person-outline" as const, activeIcon: "person" as const },
  // { key: "props", label: "Props", icon: "stats-chart-outline" as const, activeIcon: "stats-chart" as const },
  { key: "expert", label: "Expert", icon: "chatbubble-ellipses-outline" as const, activeIcon: "chatbubble-ellipses" as const },
];

// Individual nav item component
const NavItem: React.FC<{
  tabKey: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, icon, activeIcon, isActive, onPress, disabled }) => {
  const scale = useSharedValue(1);
  const progress = useSharedValue(isActive ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, { duration: 250 });
  }, [isActive]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [colors.mutedForeground, colors.foreground]
    ),
    opacity: 0.7 + progress.value * 0.3,
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[styles.navItem, animatedContainerStyle]}
    >
      <Ionicons
        name={isActive ? activeIcon : icon}
        size={24}
        color={isActive ? colors.primary : colors.mutedForeground}
      />
      <Animated.Text style={[styles.navItemLabel, animatedTextStyle]}>
        {label}
      </Animated.Text>
    </AnimatedPressable>
  );
};

export const FloatingBottomNav: React.FC<FloatingBottomNavProps> = ({
  activeTab,
  analysisData,
  isSubscribed,
}) => {
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  // Initialize from persisted state so button stays visible across tab navigations
  const [showNextButton, setShowNextButton] = React.useState(demoNextButtonShown);

  // Demo mode animations
  const glowOpacity = useSharedValue(0.3);
  const glowRadius = useSharedValue(15);
  const scaleValue = useSharedValue(1);
  // Start at 1 if already shown, otherwise 0
  const nextButtonOpacity = useSharedValue(demoNextButtonShown ? 1 : 0);
  // Shimmer animation for the CTA button
  const shimmerPosition = useSharedValue(-1);
  const buttonGlowPulse = useSharedValue(1);

  // Delay showing the Next button by 5 seconds in demo mode (only on first mount)
  React.useEffect(() => {
    if (analysisData?.isDemo && !demoNextButtonShown) {
      const timer = setTimeout(() => {
        demoNextButtonShown = true; // Persist across remounts
        setShowNextButton(true);
        nextButtonOpacity.value = withTiming(1, { duration: 300 });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [analysisData?.isDemo]);

  React.useEffect(() => {
    if (analysisData?.isDemo && showNextButton) {
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
      buttonGlowPulse.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1500 }),
          withTiming(0.3, { duration: 1500 })
        ),
        -1,
        true
      );

      glowRadius.value = withRepeat(
        withSequence(
          withTiming(25, { duration: 1500 }),
          withTiming(15, { duration: 1500 })
        ),
        -1,
        true
      );
    }
  }, [analysisData?.isDemo, showNextButton]);

  const nextButtonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: nextButtonOpacity.value,
    transform: [{ scale: buttonGlowPulse.value }],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: glowOpacity.value,
    shadowRadius: glowRadius.value,
    elevation: glowRadius.value,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmerPosition.value, [-1, 1], [-150, 350]) }],
  }));

  const navBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  const navigateToTab = (tab: string) => {
    if (tab === activeTab || isTransitioning) return;

    setIsTransitioning(true);
    scaleValue.value = withSequence(
      withTiming(0.97, { duration: 100 }),
      withTiming(1, { duration: 150 })
    );

    setTimeout(() => setIsTransitioning(false), 250);

    const baseParams = {
      team1: analysisData?.team1 || "",
      team2: analysisData?.team2 || "",
      sport: analysisData?.sport || "nfl",
      team1Logo: analysisData?.team1Logo || "",
      team2Logo: analysisData?.team2Logo || "",
      analysisId: analysisData?.analysisId || "",
      isDemo: analysisData?.isDemo ? "true" : undefined,
    };

    setTimeout(() => {
      const sportLower = (analysisData?.sport || "").toLowerCase();
      const isSoccer = sportLower.startsWith("soccer");
      const isNBA = sportLower === "nba";

      switch (tab) {
        case "insight":
          if (analysisData?.analysisId) {
            router.push({
              pathname: "/analysis",
              params: {
                analysisId: analysisData.analysisId,
                isDemo: analysisData.isDemo ? "true" : undefined,
              },
            });
          } else {
            router.back();
          }
          break;
        case "market":
          router.push({ pathname: "/market-intel", params: baseParams });
          break;
        case "teams":
          const teamStatsPath = isSoccer
            ? "/team-stats-soccer"
            : isNBA
            ? "/team-stats-nba"
            : "/team-stats-nfl";
          router.push({ pathname: teamStatsPath, params: baseParams });
          break;
        case "players":
          const playerStatsPath = isSoccer
            ? "/player-stats-soccer"
            : isNBA
            ? "/player-stats-nba"
            : "/player-stats-nfl";
          router.push({ pathname: playerStatsPath, params: baseParams });
          break;
        case "props":
          router.push({ pathname: "/player-props" as any, params: baseParams });
          break;
        case "expert":
          router.push({ pathname: "/chat", params: baseParams });
          break;
      }
    }, 80);
  };

  return (
    <>
      {/* Demo Next Button - appears after 5s delay */}
      {analysisData?.isDemo && showNextButton && (
        <Animated.View style={[styles.nextButtonContainer, nextButtonAnimatedStyle]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/paywall");
            }}
            activeOpacity={0.9}
            style={styles.nextButton}
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

            <View style={styles.nextButtonContent}>
              <Ionicons name="lock-open" size={18} color={colors.primaryForeground} />
              <Text style={styles.nextButtonText}>{i18n.t("demoUnlockAccess")}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Floating Bottom Nav Bar */}
      <Animated.View style={[styles.floatingContainer, navBarAnimatedStyle]}>
        {/* Gradient border wrapper */}
        <LinearGradient
          colors={["rgba(0, 215, 215, 0.25)", "rgba(0, 215, 215, 0.05)", "rgba(0, 215, 215, 0.15)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        >
          <View style={styles.navContainer}>
            <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
              <View style={styles.navContent}>
                {TAB_CONFIG.map((tab) => (
                  <NavItem
                    key={tab.key}
                    tabKey={tab.key}
                    label={tab.label}
                    icon={tab.icon}
                    activeIcon={tab.activeIcon}
                    isActive={tab.key === activeTab}
                    onPress={() => navigateToTab(tab.key)}
                    disabled={isTransitioning}
                  />
                ))}
              </View>
            </BlurView>
          </View>
        </LinearGradient>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  nextButtonContainer: {
    position: "absolute",
    bottom: 115,
    left: spacing[10],
    right: spacing[10],
    zIndex: 999,
  },
  nextButton: {
    height: 52,
    borderRadius: borderRadius.full,
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
  nextButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    zIndex: 2,
  },
  nextButtonText: {
    color: colors.primaryForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semibold,
  },
  floatingContainer: {
    position: "absolute",
    bottom: 28,
    left: spacing[3],
    right: spacing[3],
    zIndex: 1000,
  },
  gradientBorder: {
    borderRadius: 26,
    padding: 1,
    // Outer glow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  navContainer: {
    borderRadius: 25,
    overflow: "hidden",
  },
  blurContainer: {
    overflow: "hidden",
  },
  navContent: {
    flexDirection: "row",
    backgroundColor: "rgba(22, 26, 34, 0.88)",
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[1] + 2,
    minWidth: 50,
  },
  navItemLabel: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    marginTop: 4,
    letterSpacing: 0.2,
  },
});
