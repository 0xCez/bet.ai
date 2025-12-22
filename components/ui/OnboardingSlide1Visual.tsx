import React, { useEffect } from "react";
import { View, Image, StyleSheet, Dimensions, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import Svg, { Line, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors, spacing, borderRadius } from "../../constants/designTokens";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const FRAME_WIDTH = SCREEN_WIDTH * 0.88;
const FRAME_HEIGHT = FRAME_WIDTH * 0.9;
const CORNER_SIZE = 30;
const CORNER_THICKNESS = 4;

// Animated corner bracket component
interface CornerBracketProps {
  position: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
  focusProgress: { value: number };
}

function CornerBracket({ position, focusProgress }: CornerBracketProps) {
  const isTop = position.includes("top");
  const isLeft = position.includes("Left");

  const animatedStyle = useAnimatedStyle(() => {
    const offset = interpolate(focusProgress.value, [0, 1], [8, 0]);
    return {
      transform: [
        { translateX: isLeft ? -offset : offset },
        { translateY: isTop ? -offset : offset },
      ],
      opacity: interpolate(focusProgress.value, [0, 1], [0.6, 1]),
    };
  });

  return (
    <Animated.View
      style={[
        styles.cornerBracket,
        {
          top: isTop ? 0 : undefined,
          bottom: !isTop ? 0 : undefined,
          left: isLeft ? 0 : undefined,
          right: !isLeft ? 0 : undefined,
        },
        animatedStyle,
      ]}
    >
      {/* Horizontal line */}
      <View
        style={[
          styles.cornerLine,
          {
            width: CORNER_SIZE,
            height: CORNER_THICKNESS,
            top: isTop ? 0 : undefined,
            bottom: !isTop ? 0 : undefined,
            left: isLeft ? 0 : undefined,
            right: !isLeft ? 0 : undefined,
          },
        ]}
      />
      {/* Vertical line */}
      <View
        style={[
          styles.cornerLine,
          {
            width: CORNER_THICKNESS,
            height: CORNER_SIZE,
            top: isTop ? 0 : undefined,
            bottom: !isTop ? 0 : undefined,
            left: isLeft ? 0 : undefined,
            right: !isLeft ? 0 : undefined,
          },
        ]}
      />
    </Animated.View>
  );
}

// Animated scan line
function ScanLine({ scanProgress }: { scanProgress: { value: number } }) {
  const animatedStyle = useAnimatedStyle(() => {
    // Back and forth: 0->1 goes down, 1->2 goes back up
    const position = scanProgress.value <= 1
      ? interpolate(scanProgress.value, [0, 1], [0, FRAME_HEIGHT - 8])
      : interpolate(scanProgress.value, [1, 2], [FRAME_HEIGHT - 8, 0]);

    return {
      top: position,
      opacity: 1,
    };
  });

  return (
    <Animated.View style={[styles.scanLineContainer, animatedStyle]}>
      {/* Main scan line */}
      <Svg width={FRAME_WIDTH - 20} height={12}>
        <Defs>
          <LinearGradient id="scanGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={colors.primary} stopOpacity="0" />
            <Stop offset="20%" stopColor={colors.primary} stopOpacity="1" />
            <Stop offset="80%" stopColor={colors.primary} stopOpacity="1" />
            <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Line
          x1="0"
          y1="6"
          x2={FRAME_WIDTH - 20}
          y2="6"
          stroke="url(#scanGradient)"
          strokeWidth="6"
        />
      </Svg>
      {/* Enhanced glow effect */}
      <View style={styles.scanGlow} />
      <View style={styles.scanGlowOuter} />
    </Animated.View>
  );
}

// Detection box that appears after scan
interface DetectionBoxProps {
  x: number;
  y: number;
  width: number;
  height: number;
  delay: number;
  isActive: boolean;
}

function DetectionBox({ x, y, width, height, delay, isActive }: DetectionBoxProps) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    } else {
      opacity.value = 0;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.detectionBox,
        { left: x, top: y, width, height },
        animatedStyle,
      ]}
    />
  );
}

// Best Line Card showing bookmaker comparison
interface BestLineCardProps {
  x: number;
  y: number;
  delay: number;
  isActive: boolean;
  bookmaker: "pinnacle" | "draftkings";
  odds: string;
  label: string;
}

function BestLineCard({ x, y, delay, isActive, bookmaker, odds, label }: BestLineCardProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(15);

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      translateY.value = 15;
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
      translateY.value = withDelay(delay, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
    } else {
      opacity.value = 0;
      translateY.value = 15;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const logoSource = bookmaker === "pinnacle"
    ? require("../../assets/images/Pinaccle.png")
    : require("../../assets/images/Draftkings.png");

  return (
    <Animated.View
      style={[
        styles.bestLineCard,
        { left: x, top: y },
        animatedStyle,
      ]}
    >
      <View style={styles.bestLineHeader}>
        <Text style={styles.bestLineLabel}>{label}</Text>
      </View>
      <View style={styles.bestLineContent}>
        <Image source={logoSource} style={styles.bookmakerLogo} resizeMode="contain" />
        <Text style={styles.bestLineOdds}>{odds}</Text>
      </View>
    </Animated.View>
  );
}

// Probability Badge with arrow
interface ProbabilityBadgeProps {
  x: number;
  y: number;
  delay: number;
  isActive: boolean;
  text: string;
  arrowDirection: "left" | "right" | "down";
}

function ProbabilityBadge({ x, y, delay, isActive, text, arrowDirection }: ProbabilityBadgeProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-10);

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      translateY.value = -10;
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
      translateY.value = withDelay(delay, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
    } else {
      opacity.value = 0;
      translateY.value = -10;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.probabilityBadge,
        { left: x, top: y },
        animatedStyle,
      ]}
    >
      {arrowDirection === "left" && (
        <View style={styles.arrowLeft} />
      )}
      <Text style={styles.probabilityText}>{text}</Text>
      {arrowDirection === "right" && (
        <View style={styles.arrowRight} />
      )}
      {arrowDirection === "down" && (
        <View style={styles.arrowDown} />
      )}
    </Animated.View>
  );
}

interface OnboardingSlide1VisualProps {
  isActive?: boolean;
}

export function OnboardingSlide1Visual({ isActive = false }: OnboardingSlide1VisualProps) {
  // Animation values
  const frameOpacity = useSharedValue(0);
  const focusProgress = useSharedValue(0);
  const scanProgress = useSharedValue(0);
  const showDetections = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      // Reset
      frameOpacity.value = 0;
      focusProgress.value = 0;
      scanProgress.value = 0;
      showDetections.value = 0;

      // Sequence: fade in -> focus -> scan -> show detections (faster)
      frameOpacity.value = withTiming(1, { duration: 250 });

      // Focus animation (brackets tighten)
      focusProgress.value = withDelay(150, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));

      // Scan animation (back and forth) - keep original speed for smooth effect
      scanProgress.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), // Down
            withTiming(2, { duration: 1200, easing: Easing.inOut(Easing.quad) })  // Back up
          ),
          -1, // Infinite
          false
        )
      );

      // Show detections after first scan
      showDetections.value = withDelay(1200, withTiming(1, { duration: 100 }));

    } else {
      frameOpacity.value = 0;
      focusProgress.value = 0;
      scanProgress.value = 0;
      showDetections.value = 0;
    }
  }, [isActive]);

  const frameAnimatedStyle = useAnimatedStyle(() => ({
    opacity: frameOpacity.value,
  }));

  const detectionsVisible = isActive;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.viewfinderFrame, frameAnimatedStyle]}>
        {/* Sportsbook image */}
        <View style={styles.imageContainer}>
          <Image
            source={require("../../assets/images/onboarding/sportsbook-scan.png")}
            style={styles.sportsbookImage}
            resizeMode="cover"
          />

          {/* Dark overlay for better contrast */}
          <View style={styles.imageOverlay} />
        </View>

        {/* Corner brackets */}
        <CornerBracket position="topLeft" focusProgress={focusProgress} />
        <CornerBracket position="topRight" focusProgress={focusProgress} />
        <CornerBracket position="bottomLeft" focusProgress={focusProgress} />
        <CornerBracket position="bottomRight" focusProgress={focusProgress} />

        {/* Scan line */}
        <ScanLine scanProgress={scanProgress} />

        {/* Detection boxes - positioned over key areas */}
        <DetectionBox x={FRAME_WIDTH * 0.35} y={FRAME_HEIGHT * 0.89} width={FRAME_WIDTH * 0.6} height={35} delay={1200} isActive={detectionsVisible} />
        <DetectionBox x={FRAME_WIDTH * 0.15} y={FRAME_HEIGHT * 0.45} width={FRAME_WIDTH * 0.7} height={40} delay={1400} isActive={detectionsVisible} />

        {/* Probability Badge - pointing down at Lakers */}
        <ProbabilityBadge
          x={FRAME_WIDTH * 0.60}
          y={FRAME_HEIGHT * 0.35}
          delay={1500}
          isActive={detectionsVisible}
          text="ML 77% Win"
          arrowDirection="down"
        />

        {/* Best Line Cards - positioned side by side */}
        <BestLineCard
          x={FRAME_WIDTH * 0.38}
          y={FRAME_HEIGHT * 0.72}
          delay={1600}
          isActive={detectionsVisible}
          bookmaker="pinnacle"
          odds="+145"
          label="Best Odds"
        />
        <BestLineCard
          x={FRAME_WIDTH * 0.68}
          y={FRAME_HEIGHT * 0.72}
          delay={1750}
          isActive={detectionsVisible}
          bookmaker="draftkings"
          odds="-110"
          label="Sharp Line"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.50,
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinderFrame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    position: "relative",
  },
  imageContainer: {
    width: "100%",
    height: "100%",
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  sportsbookImage: {
    width: "100%",
    height: "140%",
    position: "absolute",
    top: "-40.6%",
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  // Corner brackets
  cornerBracket: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerLine: {
    position: "absolute",
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  // Scan line
  scanLineContainer: {
    position: "absolute",
    left: 10,
    right: 10,
    alignItems: "center",
  },
  scanGlow: {
    position: "absolute",
    top: -15,
    left: "10%",
    right: "10%",
    height: 36,
    backgroundColor: colors.primary,
    opacity: 0.25,
    borderRadius: 18,
  },
  scanGlowOuter: {
    position: "absolute",
    top: -25,
    left: "5%",
    right: "5%",
    height: 56,
    backgroundColor: colors.primary,
    opacity: 0.1,
    borderRadius: 28,
  },
  // Detection boxes
  detectionBox: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(0, 215, 215, 0.1)",
  },
  // Best Line Cards
  bestLineCard: {
    position: "absolute",
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    minWidth: 92,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  bestLineHeader: {
    marginBottom: 2,
  },
  bestLineLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.success,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bestLineContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  bookmakerLogo: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  bestLineOdds: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.foreground,
  },
  // Probability Badge
  probabilityBadge: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  probabilityText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
    letterSpacing: 0.3,
  },
  arrowLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: colors.success,
    position: "absolute",
    left: -6,
  },
  arrowRight: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 6,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: colors.success,
    position: "absolute",
    right: -6,
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: colors.success,
    position: "absolute",
    bottom: -8,
    left: "50%",
    marginLeft: -6,
  },
});

export default OnboardingSlide1Visual;
