import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Image } from "react-native";
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

// Example prop data for demo
const DEMO_PROPS = [
  { stat: "POINTS", direction: "Over", line: 25.5, prob: "87%", avg: "Avg 27.3", strong: true },
  { stat: "REBOUNDS", direction: "Over", line: 8.5, prob: "82%", avg: "Avg 9.1", strong: true },
  { stat: "PTS+REB+AST", direction: "Over", line: 42.5, prob: "76%", avg: "Avg 44.8", strong: true },
];

// Animated prop row
function AnimatedPropRow({
  stat,
  direction,
  line,
  prob,
  avg,
  strong,
  index,
  isActive,
}: {
  stat: string;
  direction: string;
  line: number;
  prob: string;
  avg: string;
  strong: boolean;
  index: number;
  isActive: boolean;
}) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(30);

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      translateX.value = 30;
      const delay = 600 + index * 150;
      opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateX.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 100 }));
    } else {
      opacity.value = 0;
      translateX.value = 30;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const pillBg = strong ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 184, 0, 0.2)";
  const pillText = strong ? colors.success : "#FFB800";

  return (
    <Animated.View style={[styles.propRow, animatedStyle]}>
      <View style={styles.propLeft}>
        <Text style={styles.propStat}>{stat}</Text>
        <View style={styles.propDetailsRow}>
          <Text style={styles.propDirection}>
            {direction === "Over" ? "▲" : "▼"} {direction} {line}
          </Text>
          <Text style={styles.propAvg}>{avg}</Text>
        </View>
      </View>
      <View style={[styles.propPill, { backgroundColor: pillBg }]}>
        <Text style={[styles.propPillText, { color: pillText }]}>{prob}</Text>
      </View>
    </Animated.View>
  );
}

interface OnboardingSlide3MLPropsVisualProps {
  isActive?: boolean;
}

export function OnboardingSlide3MLPropsVisual({ isActive = false }: OnboardingSlide3MLPropsVisualProps) {
  // Card entrance animation
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);
  const cardTranslateY = useSharedValue(40);

  useEffect(() => {
    if (isActive) {
      cardOpacity.value = 0;
      cardScale.value = 0.85;
      cardTranslateY.value = 40;

      cardOpacity.value = withDelay(100, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      cardScale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 90 }));
      cardTranslateY.value = withDelay(100, withSpring(0, { damping: 14, stiffness: 90 }));
    } else {
      cardOpacity.value = 0;
      cardScale.value = 0.85;
      cardTranslateY.value = 40;
    }
  }, [isActive]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [
      { translateY: cardTranslateY.value },
      { scale: cardScale.value },
    ],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.card, cardAnimatedStyle]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.teamBadge}>
            <Ionicons name="basketball" size={13} color="#FF6B35" />
            <Text style={styles.teamAbbrev}>LAL</Text>
          </View>
          <View style={styles.gameTimeBadge}>
            <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
            <Text style={styles.gameTimeText}>Today 7:30 PM</Text>
          </View>
        </View>

        {/* Player section */}
        <View style={styles.playerSection}>
          <Image
            source={require("../../assets/images/nba-players/lal/lebron_james.png")}
            style={styles.playerImage}
          />
          <View style={styles.playerMeta}>
            <Text style={styles.playerName}>LeBron James</Text>
            <Text style={styles.playerTeam}>Lakers vs Thunder</Text>
            <View style={styles.statChipsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>27.3</Text>
                <Text style={styles.statChipLabel}> PPG</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>9.1</Text>
                <Text style={styles.statChipLabel}> RPG</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipValue}>8.4</Text>
                <Text style={styles.statChipLabel}> APG</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ML Predictions section */}
        <View style={styles.propsContainer}>
          <View style={styles.propsHeader}>
            <View style={styles.propsIconWrapper}>
              <Ionicons name="trending-up" size={14} color={colors.success} />
            </View>
            <Text style={styles.propsLabel}>ML PREDICTIONS</Text>
          </View>

          {DEMO_PROPS.map((prop, index) => (
            <AnimatedPropRow
              key={index}
              stat={prop.stat}
              direction={prop.direction}
              line={prop.line}
              prob={prop.prob}
              avg={prop.avg}
              strong={prop.strong}
              index={index}
              isActive={isActive}
            />
          ))}
        </View>

      </Animated.View>
    </View>
  );
}

const CARD_WIDTH = SCREEN_WIDTH * 0.95;
const AVATAR_SIZE = 80;

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.50,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: "rgba(22, 26, 34, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
    paddingTop: spacing[5],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[5],
    gap: spacing[4],
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teamBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.4)",
    backgroundColor: "rgba(255, 107, 53, 0.1)",
  },
  teamAbbrev: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: "#FF6B35",
    letterSpacing: 1,
  },
  gameTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  gameTimeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  // Player
  playerSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  playerImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.rgba.primary30,
    backgroundColor: colors.secondary,
  },
  playerMeta: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  playerTeam: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  statChipsRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: 5,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  statChipValue: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statChipLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  // Props section
  propsContainer: {
    backgroundColor: "rgba(34, 197, 94, 0.06)",
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.15)",
    gap: spacing[2],
  },
  propsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  propsIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  propsLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1,
    color: colors.success,
  },
  // Prop row
  propRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: borderRadius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    gap: spacing[2],
  },
  propLeft: {
    flex: 1,
  },
  propStat: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    marginBottom: 2,
  },
  propDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  propDirection: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  propAvg: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
    opacity: 0.8,
  },
  propPill: {
    paddingHorizontal: spacing[2] + 4,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  propPillText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
});

export default OnboardingSlide3MLPropsVisual;
