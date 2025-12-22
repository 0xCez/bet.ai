import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import { ConcentricCircles } from "./ConcentricCircles";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Info Card Component
interface InfoCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  showBar?: boolean;
  barColor?: string;
  barProgress?: number;
  secondaryValue?: string;
  secondaryBarColor?: string;
}

function InfoCard({
  label,
  value,
  icon,
  showBar,
  barColor,
  barProgress = 100,
  secondaryValue,
  secondaryBarColor,
}: InfoCardProps) {
  return (
    <View style={styles.infoCard}>
      {icon && <View style={styles.infoCardIcon}>{icon}</View>}
      <View style={styles.infoCardContent}>
        <Text style={styles.infoCardLabel}>{label}</Text>
        {secondaryValue ? (
          // Single line split between Public and Sharps
          <View style={styles.dualValueContainer}>
            <View style={styles.dualValueRow}>
              <Text style={styles.infoCardValue}>{value}</Text>
              <Text style={styles.infoCardValue}>{secondaryValue}</Text>
            </View>
            <View style={styles.splitProgressBar}>
              <View style={[styles.splitProgressFill, { width: `${barProgress}%`, backgroundColor: barColor }]} />
              <View style={[styles.splitProgressFill, { width: `${100 - barProgress}%`, backgroundColor: secondaryBarColor }]} />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.infoCardValue}>{value}</Text>
            {showBar && (
              <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressFill, { width: `${barProgress}%`, backgroundColor: barColor }]} />
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// Animated Icon Card Component
interface AnimatedIconCardProps {
  name: string;
  color: string;
  index: number;
  angle: number;
  isActive: boolean;
}

function AnimatedIconCard({ name, color, index, angle, isActive }: AnimatedIconCardProps) {
  const progress = useSharedValue(0);
  const CIRCLE_RADIUS = 80;
  const ANIMATION_DELAY = 100;
  const CIRCLE_DURATION = 400;

  useEffect(() => {
    if (isActive) {
      // Reset and start animation
      progress.value = 0;
      progress.value = withDelay(
        index * ANIMATION_DELAY,
        withSequence(
          // First phase: appear and move in circle
          withTiming(1, { duration: CIRCLE_DURATION, easing: Easing.out(Easing.cubic) }),
          // Second phase: settle into final position
          withSpring(2, { damping: 12, stiffness: 100 })
        )
      );
    } else {
      // Reset when not active
      progress.value = 0;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => {
    const phase = progress.value;

    // Calculate circular position
    const angleRad = (angle - 90) * (Math.PI / 180); // -90 to start from top
    const circleX = Math.cos(angleRad) * CIRCLE_RADIUS;
    const circleY = Math.sin(angleRad) * CIRCLE_RADIUS;

    // Interpolate between states
    // Phase 0: invisible at center
    // Phase 1: visible on circle
    // Phase 2: final grid position

    const opacity = interpolate(phase, [0, 0.3, 1, 2], [0, 1, 1, 1]);
    const scale = interpolate(phase, [0, 0.5, 1, 1.5, 2], [0.3, 1.1, 1, 1.05, 1]);

    // Position interpolation
    const translateX = interpolate(phase, [0, 1, 2], [0, circleX, 0]);
    const translateY = interpolate(phase, [0, 1, 2], [0, circleY, 0]);

    return {
      opacity,
      transform: [
        { translateX },
        { translateY },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <View style={[styles.iconCard, { backgroundColor: colors.card }]}>
        <Ionicons name={name as any} size={26} color={color} />
      </View>
    </Animated.View>
  );
}

// Animated Card Wrapper
interface AnimatedCardProps {
  children: React.ReactNode;
  delay: number;
  direction: "left" | "right";
  isActive: boolean;
}

function AnimatedCard({ children, delay, direction, isActive }: AnimatedCardProps) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(direction === "left" ? -50 : 50);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (isActive) {
      // Reset and start animation
      opacity.value = 0;
      translateX.value = direction === "left" ? -50 : 50;
      scale.value = 0.8;

      opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateX.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 100 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
    } else {
      // Reset when not active
      opacity.value = 0;
      translateX.value = direction === "left" ? -50 : 50;
      scale.value = 0.8;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

// Trending Icon for Betting Signal
function TrendingIcon() {
  return (
    <View style={styles.trendingIcon}>
      <Ionicons name="trending-up" size={28} color={colors.primary} />
    </View>
  );
}

// Checkered Flag Icon for Confidence Score
function CheckeredIcon() {
  return (
    <View style={styles.checkeredIcon}>
      <Ionicons name="flag" size={22} color={colors.primary} />
    </View>
  );
}

interface OnboardingSlide2VisualProps {
  isActive?: boolean;
}

export function OnboardingSlide2Visual({ isActive = false }: OnboardingSlide2VisualProps) {
  return (
    <View style={styles.container}>
      {/* Background concentric circles */}
      <ConcentricCircles
        size={SCREEN_WIDTH * 1.2}
        circleCount={14}
        verticalPosition={0.45}
        innerOpacity={0.4}
        outerOpacity={0.05}
        rotate
      />

      {/* Top Left - Betting Signal */}
      <View style={[styles.cardPosition, styles.topLeft]}>
        <AnimatedCard delay={200} direction="left" isActive={isActive}>
          <InfoCard
            label="Betting Signal"
            value="Bullish"
            icon={<TrendingIcon />}
          />
        </AnimatedCard>
      </View>

      {/* Top Right - Confidence Score */}
      <View style={[styles.cardPosition, styles.topRight]}>
        <AnimatedCard delay={350} direction="right" isActive={isActive}>
          <InfoCard
            label="Confidence Score"
            value="7/10"
            icon={<CheckeredIcon />}
          />
        </AnimatedCard>
      </View>

      {/* Middle - Animated Icon Grid */}
      <View style={styles.iconGridContainer}>
        {/* Row 1 - 4 icons */}
        <View style={styles.iconRow}>
          <View style={[styles.iconWrapper, { marginTop: 22, marginLeft: -3, zIndex: 1 }]}>
            <AnimatedIconCard name="trophy" color="#FFD700" index={0} angle={0} isActive={isActive} />
          </View>
          <View style={[styles.iconWrapper, { marginTop: 5, marginLeft: -12, zIndex: 2 }]}>
            <AnimatedIconCard name="shield-checkmark" color="#EF4444" index={1} angle={51} isActive={isActive} />
          </View>
          <View style={[styles.iconWrapper, { marginTop: -10, marginLeft: -8, zIndex: 3 }]}>
            <AnimatedIconCard name="airplane" color="#FFFFFF" index={2} angle={103} isActive={isActive} />
          </View>
          <View style={[styles.iconWrapper, { marginTop: 5, marginLeft: -20, zIndex: 2 }]}>
            <AnimatedIconCard name="location" color="#8B5CF6" index={3} angle={154} isActive={isActive} />
          </View>
        </View>
        {/* Row 2 - 3 icons */}
        <View style={[styles.iconRow, { marginTop: -30 }]}>
          <View style={[styles.iconWrapper, { marginTop: 0, marginLeft: 8, zIndex: 4 }]}>
            <AnimatedIconCard name="american-football" color="#22C55E" index={4} angle={206} isActive={isActive} />
          </View>
          <View style={[styles.iconWrapper, { marginTop: -15, marginLeft: -12, zIndex: 5 }]}>
            <AnimatedIconCard name="flame" color="#F97316" index={5} angle={257} isActive={isActive} />
          </View>
          <View style={[styles.iconWrapper, { marginTop: -5, marginLeft: -14, zIndex: 4 }]}>
            <AnimatedIconCard name="flash" color="#3B82F6" index={6} angle={309} isActive={isActive} />
          </View>
        </View>
      </View>

      {/* Bottom Left - Public vs Sharps */}
      <View style={[styles.cardPosition, styles.bottomLeft]}>
        <AnimatedCard delay={900} direction="left" isActive={isActive}>
          <InfoCard
            label="Public vs Sharps"
            value="68%"
            secondaryValue="32%"
            barProgress={68}
            barColor="#22C55E"
            secondaryBarColor="#EF4444"
          />
        </AnimatedCard>
      </View>

      {/* Bottom Right - Line Shift */}
      <View style={[styles.cardPosition, styles.bottomRight]}>
        <AnimatedCard delay={1050} direction="right" isActive={isActive}>
          <InfoCard
            label="Line Shift"
            value="High"
            showBar
            barProgress={75}
            barColor="#EC4899"
          />
        </AnimatedCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cardPosition: {
    position: "absolute",
    width: SCREEN_WIDTH * 0.50,
  },
  topLeft: {
    top: 27,
    left: spacing[3],
  },
  topRight: {
    top: 60,
    right: spacing[3],
  },
  bottomLeft: {
    bottom: 70,
    left: spacing[3],
  },
  bottomRight: {
    bottom: 27,
    right: spacing[3],
  },
  iconWrapper: {
    zIndex: 1,
  },
  // Info Card Styles
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[3],
    gap: spacing[2],
  },
  infoCardIcon: {
    marginRight: spacing[1],
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 2,
  },
  infoCardValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.foreground,
  },
  dualValueContainer: {
    flex: 1,
  },
  dualValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing[1],
  },
  splitProgressBar: {
    height: 4,
    borderRadius: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  splitProgressFill: {
    height: "100%",
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginTop: spacing[1],
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  // Icon Styles
  trendingIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.rgba.primary15,
    alignItems: "center",
    justifyContent: "center",
  },
  checkeredIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.rgba.primary15,
    alignItems: "center",
    justifyContent: "center",
  },
  // Icon Grid Styles
  iconGridContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[6],
  },
  iconRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing[2],
    marginVertical: spacing[1],
  },
  iconCard: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default OnboardingSlide2Visual;
