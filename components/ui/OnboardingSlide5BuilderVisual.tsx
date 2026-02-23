import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const DEMO_LEGS = [
  { name: "Jayson Tatum", stat: "PTS O 22.5", odds: "-450", l10: "90%", color: "#22C55E" },
  { name: "Luka Doncic", stat: "AST O 6.5", odds: "-420", l10: "85%", color: "#22C55E" },
  { name: "Anthony Edwards", stat: "PTS O 18.5", odds: "-500", l10: "88%", color: "#22C55E" },
  { name: "Nikola Jokic", stat: "REB O 8.5", odds: "-480", l10: "92%", color: "#22C55E" },
];

interface AnimatedLegProps {
  leg: typeof DEMO_LEGS[0];
  index: number;
  isActive: boolean;
}

function AnimatedLeg({ leg, index, isActive }: AnimatedLegProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(15);

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      translateY.value = 15;
      const delay = 600 + index * 150;
      opacity.value = withDelay(delay, withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 120 }));
    } else {
      opacity.value = 0;
      translateY.value = 15;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.legRow, animatedStyle]}>
      <View style={[styles.legDot, { backgroundColor: leg.color }]} />
      <View style={styles.legInfo}>
        <Text style={styles.legName}>{leg.name}</Text>
        <Text style={styles.legStat}>{leg.stat}</Text>
      </View>
      <View style={styles.legRight}>
        <Text style={styles.legOdds}>{leg.odds}</Text>
        <Text style={[styles.legL10, { color: colors.success }]}>L10 {leg.l10}</Text>
      </View>
    </Animated.View>
  );
}

interface OnboardingSlide5BuilderVisualProps {
  isActive?: boolean;
}

export function OnboardingSlide5BuilderVisual({ isActive = false }: OnboardingSlide5BuilderVisualProps) {
  // Card entrance
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.88);
  const cardY = useSharedValue(30);

  // CTA button
  const ctaOpacity = useSharedValue(0);
  const ctaY = useSharedValue(15);

  useEffect(() => {
    if (isActive) {
      cardOpacity.value = 0;
      cardScale.value = 0.88;
      cardY.value = 30;
      ctaOpacity.value = 0;
      ctaY.value = 15;

      cardOpacity.value = withDelay(100, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      cardScale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 90 }));
      cardY.value = withDelay(100, withSpring(0, { damping: 14, stiffness: 90 }));

      const ctaDelay = 600 + DEMO_LEGS.length * 150 + 200;
      ctaOpacity.value = withDelay(ctaDelay, withTiming(1, { duration: 400 }));
      ctaY.value = withDelay(ctaDelay, withSpring(0, { damping: 15, stiffness: 100 }));
    } else {
      cardOpacity.value = 0;
      cardScale.value = 0.88;
      cardY.value = 30;
      ctaOpacity.value = 0;
      ctaY.value = 15;
    }
  }, [isActive]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardY.value }, { scale: cardScale.value }],
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaY.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.slipCard, cardStyle]}>
        {/* Slip header */}
        <View style={styles.slipHeader}>
          <View style={styles.tierBadge}>
            <Ionicons name="lock-closed" size={12} color="#FFD700" />
            <Text style={styles.tierText}>LOCK</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.bookBadge}>
              <Text style={styles.bookBadgeText}>DK</Text>
            </View>
            <Text style={styles.legCount}>4 Legs</Text>
          </View>
        </View>

        {/* Legs */}
        <View style={styles.legsContainer}>
          {DEMO_LEGS.map((leg, index) => (
            <AnimatedLeg key={index} leg={leg} index={index} isActive={isActive} />
          ))}
        </View>

        {/* Combined odds */}
        <View style={styles.oddsRow}>
          <Text style={styles.oddsLabel}>Combined Odds</Text>
          <Text style={styles.oddsValue}>+185</Text>
        </View>

        {/* CTA */}
        <Animated.View style={[styles.ctaButton, ctaStyle]}>
          <Ionicons name="open-outline" size={16} color={colors.background} />
          <Text style={styles.ctaText}>Place on DraftKings</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const CARD_WIDTH = SCREEN_WIDTH * 0.88;

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.50,
    alignItems: "center",
    justifyContent: "center",
  },
  slipCard: {
    width: CARD_WIDTH,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: "rgba(22, 26, 34, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.2)",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    padding: spacing[4],
    gap: spacing[3],
  },
  // Header
  slipHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
  },
  tierText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: "#FFD700",
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  bookBadge: {
    backgroundColor: colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  bookBadgeText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  legCount: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  // Legs
  legsContainer: {
    gap: spacing[2],
  },
  legRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: borderRadius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  legDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legInfo: {
    flex: 1,
    gap: 1,
  },
  legName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  legStat: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  legRight: {
    alignItems: "flex-end",
    gap: 1,
  },
  legOdds: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  legL10: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
  },
  // Combined odds
  oddsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing[1],
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  oddsLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  oddsValue: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
  },
  // CTA
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.primary,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  ctaText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.background,
  },
});

export default OnboardingSlide5BuilderVisual;
