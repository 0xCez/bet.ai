import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import { useDemoTooltip, TooltipId } from "../../contexts/DemoTooltipContext";
import i18n from "../../i18n";

// Tooltip content configuration
const TOOLTIP_CONFIG: Record<TooltipId, {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  position: "top" | "center" | "bottom";
  showArrow?: "down" | "up" | "none";
  ctaText?: string;
}> = {
  welcome: {
    title: "demoTooltipWelcomeTitle",
    description: "demoTooltipWelcomeDesc",
    icon: "sparkles",
    position: "center",
    showArrow: "none",
    ctaText: "demoTooltipGotIt",
  },
  insight_tab: {
    title: "demoTooltipInsightTitle",
    description: "demoTooltipInsightDesc",
    icon: "bulb",
    position: "center",
    showArrow: "none",
    ctaText: "demoTooltipExplore",
  },
  nav_hint: {
    title: "demoTooltipNavTitle",
    description: "demoTooltipNavDesc",
    icon: "apps",
    position: "bottom",
    showArrow: "down",
    ctaText: "demoTooltipGotIt",
  },
  market_tab: {
    title: "demoTooltipMarketTitle",
    description: "demoTooltipMarketDesc",
    icon: "trending-up",
    position: "center",
    showArrow: "none",
    ctaText: "demoTooltipContinue",
  },
  teams_tab: {
    title: "demoTooltipTeamsTitle",
    description: "demoTooltipTeamsDesc",
    icon: "shield",
    position: "center",
    showArrow: "none",
    ctaText: "demoTooltipContinue",
  },
  players_tab: {
    title: "demoTooltipPlayersTitle",
    description: "demoTooltipPlayersDesc",
    icon: "person",
    position: "center",
    showArrow: "none",
    ctaText: "demoTooltipContinue",
  },
  expert_tab: {
    title: "demoTooltipExpertTitle",
    description: "demoTooltipExpertDesc",
    icon: "chatbubble-ellipses",
    position: "center",
    showArrow: "none",
    ctaText: "demoTooltipContinue",
  },
  demo_complete: {
    title: "demoTooltipCompleteTitle",
    description: "demoTooltipCompleteDesc",
    icon: "checkmark-circle",
    position: "center",
    showArrow: "none",
    ctaText: "demoTooltipUnlock",
  },
};

interface DemoTooltipOverlayProps {
  tooltipId: TooltipId;
}

export function DemoTooltipOverlay({ tooltipId }: DemoTooltipOverlayProps) {
  const { currentTooltip, dismissTooltip, showTooltip } = useDemoTooltip();
  const config = TOOLTIP_CONFIG[tooltipId];

  // Animation values
  const scale = useSharedValue(0.9);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (currentTooltip === tooltipId) {
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });

      // Pulse animation for the icon
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [currentTooltip, tooltipId]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  if (currentTooltip !== tooltipId) {
    return null;
  }

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissTooltip();

    // Auto-show next tooltip in the flow
    setTimeout(() => {
      if (tooltipId === "welcome") {
        showTooltip("nav_hint");
      }
    }, 300);
  };

  const getPositionStyle = (): { top?: number; bottom?: number } => {
    switch (config.position) {
      case "top":
        return { top: 120 };
      case "bottom":
        return { bottom: 180 };
      case "center":
      default:
        return { top: 220 };
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.overlay}
    >
      {/* Semi-transparent backdrop */}
      <Pressable style={styles.backdrop} onPress={handleDismiss} />

      {/* Tooltip card */}
      <Animated.View style={[styles.tooltipContainer, getPositionStyle(), cardStyle]}>
        <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
          <LinearGradient
            colors={[colors.rgba.primary15, colors.rgba.primary10, "transparent"]}
            style={styles.gradientOverlay}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />

          <View style={styles.tooltipContent}>
            {/* Icon */}
            <Animated.View style={[styles.iconContainer, iconStyle]}>
              <LinearGradient
                colors={[colors.rgba.primary30, colors.rgba.primary15]}
                style={styles.iconGradient}
              >
                <Ionicons name={config.icon} size={28} color={colors.primary} />
              </LinearGradient>
            </Animated.View>

            {/* Title */}
            <Text style={styles.title}>{i18n.t(config.title)}</Text>

            {/* Description */}
            <Text style={styles.description}>{i18n.t(config.description)}</Text>

            {/* CTA Button */}
            <Pressable onPress={handleDismiss} style={styles.ctaButton}>
              <LinearGradient
                colors={[colors.primary, '#00B8B8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>{i18n.t(config.ctaText || "demoTooltipGotIt")}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </BlurView>

        {/* Arrow pointing down to nav bar */}
        {config.showArrow === "down" && (
          <View style={styles.arrowContainer}>
            <View style={styles.arrowDown} />
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

// Simplified component that just shows the current tooltip
export function DemoTooltipRenderer() {
  const { currentTooltip } = useDemoTooltip();

  if (!currentTooltip) {
    return null;
  }

  return <DemoTooltipOverlay tooltipId={currentTooltip} />;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  tooltipContainer: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    zIndex: 10000,
  },
  blurContainer: {
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  tooltipContent: {
    padding: spacing[5],
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: spacing[3],
  },
  iconGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.rgba.primary40,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    textAlign: "center",
    marginBottom: spacing[2],
  },
  description: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing[4],
    paddingHorizontal: spacing[2],
  },
  ctaButton: {
    width: "100%",
  },
  ctaGradient: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: borderRadius.lg,
    alignItems: "center",
  },
  ctaText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semibold,
    color: colors.primaryForeground,
  },
  arrowContainer: {
    alignItems: "center",
    marginTop: -1,
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.rgba.primary30,
  },
});

export default DemoTooltipRenderer;
