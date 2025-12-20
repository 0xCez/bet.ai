import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Line } from "react-native-svg";
import { Image } from "expo-image";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import i18n from "../../i18n";

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface ProfitabilityComparisonChartProps {
  animate?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 100;
const CHART_HEIGHT = 160;

// X-axis line position (separator above Month labels)
const X_AXIS_Y = CHART_HEIGHT - 8;

// Baseline Y position (where Month 1 and Month 6 dots sit) - on the x-axis
const BASELINE_Y = X_AXIS_Y;

// Bet.AI line - starts at baseline, ends high (success trajectory)
const BETAI_POINTS = [
  { x: 20, y: BASELINE_Y },              // Month 1 - start at baseline
  { x: CHART_WIDTH * 0.3, y: CHART_HEIGHT - 50 },
  { x: CHART_WIDTH * 0.5, y: CHART_HEIGHT - 75 },
  { x: CHART_WIDTH * 0.75, y: CHART_HEIGHT - 105 },
  { x: CHART_WIDTH - 20, y: CHART_HEIGHT - 130 }, // Month 6 - end high
];

// Other tools line - gentle wave pattern: subtle up, down, up, down - ends at same level as start
const OTHER_POINTS = [
  { x: 20, y: BASELINE_Y },              // Month 1 - start at baseline
  { x: CHART_WIDTH * 0.3, y: CHART_HEIGHT - 45 },   // First gentle rise
  { x: CHART_WIDTH * 0.5, y: CHART_HEIGHT - 30 },   // Slight dip
  { x: CHART_WIDTH * 0.7, y: CHART_HEIGHT - 40 },   // Second gentle rise
  { x: CHART_WIDTH - 20, y: BASELINE_Y }, // Month 6 - ends at same level as start (baseline)
];

// Create smooth curve path using bezier curves
const createCurvePath = (points: { x: number; y: number }[]) => {
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;

    const cp1x = midX;
    const cp1y = current.y;
    const cp2x = midX;
    const cp2y = next.y;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }

  return path;
};

// Create closed path for gradient fill
const createFillPath = (points: { x: number; y: number }[]) => {
  const curvePath = createCurvePath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  // Close the path at the x-axis level, not the bottom of the chart
  return `${curvePath} L ${lastPoint.x} ${X_AXIS_Y} L ${firstPoint.x} ${X_AXIS_Y} Z`;
};

export function ProfitabilityComparisonChart({ animate = true }: ProfitabilityComparisonChartProps) {
  const betaiLineProgress = useRef(new Animated.Value(0)).current;
  const otherLineProgress = useRef(new Animated.Value(0)).current;
  const betaiFillOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const legendOpacity = useRef(new Animated.Value(0)).current;
  const descOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      titleOpacity.setValue(1);
      legendOpacity.setValue(1);
      betaiLineProgress.setValue(1);
      otherLineProgress.setValue(1);
      betaiFillOpacity.setValue(1);
      descOpacity.setValue(1);
      return;
    }

    // Reset
    titleOpacity.setValue(0);
    legendOpacity.setValue(0);
    betaiLineProgress.setValue(0);
    otherLineProgress.setValue(0);
    betaiFillOpacity.setValue(0);
    descOpacity.setValue(0);

    const animationSequence = Animated.sequence([
      // 1. Title fade in
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      // 2. Legend fade in
      Animated.timing(legendOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      // 3. Both lines draw simultaneously
      Animated.parallel([
        Animated.timing(betaiLineProgress, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(otherLineProgress, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
      // 4. Bet.AI fill fades in
      Animated.timing(betaiFillOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // 5. Description fade in
      Animated.timing(descOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]);

    animationSequence.start();

    return () => {
      titleOpacity.stopAnimation();
      legendOpacity.stopAnimation();
      betaiLineProgress.stopAnimation();
      otherLineProgress.stopAnimation();
      betaiFillOpacity.stopAnimation();
      descOpacity.stopAnimation();
    };
  }, [animate]);

  const betaiPath = createCurvePath(BETAI_POINTS);
  const otherPath = createCurvePath(OTHER_POINTS);
  const betaiFillPath = createFillPath(BETAI_POINTS);
  const pathLength = 600;

  // Reference line Y positions (two dashed lines)
  const refLine1Y = CHART_HEIGHT - 130; // Top line - aligned with cyan end dot
  const refLine2Y = CHART_HEIGHT - 70;  // Middle line - between top and x-axis

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: titleOpacity }]}>
          <Text style={styles.title}>{i18n.t("profitabilityTitle")}</Text>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
            contentFit="contain"
          />
        </Animated.View>

        {/* Legend */}
        <Animated.View style={[styles.legend, { opacity: legendOpacity }]}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>{i18n.t("profitabilityBetAI")}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.mutedForeground }]} />
            <Text style={styles.legendText}>{i18n.t("profitabilityOther")}</Text>
          </View>
        </Animated.View>

        {/* Chart */}
        <View style={styles.chartContainer}>
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT + 10}>
            <Defs>
              {/* Gradient for Bet.AI fill */}
              <LinearGradient id="betaiFillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.3} />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
              {/* Gradient for Bet.AI line */}
              <LinearGradient id="betaiLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.6} />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity={1} />
              </LinearGradient>
            </Defs>

            {/* X-axis line (separator above Month labels) - drawn first so it's behind dots */}
            <Line
              x1={10}
              y1={X_AXIS_Y}
              x2={CHART_WIDTH - 10}
              y2={X_AXIS_Y}
              stroke={colors.muted}
              strokeWidth={1}
              opacity={0.4}
            />

            {/* Horizontal reference line - top (dashed) */}
            <Line
              x1={20}
              y1={refLine1Y}
              x2={CHART_WIDTH - 20}
              y2={refLine1Y}
              stroke={colors.muted}
              strokeWidth={1}
              strokeDasharray="5,5"
              opacity={0.5}
            />

            {/* Horizontal reference line - middle (dashed) */}
            <Line
              x1={20}
              y1={refLine2Y}
              x2={CHART_WIDTH - 20}
              y2={refLine2Y}
              stroke={colors.muted}
              strokeWidth={1}
              strokeDasharray="5,5"
              opacity={0.5}
            />

            {/* Bet.AI gradient fill */}
            <AnimatedPath
              d={betaiFillPath}
              fill="url(#betaiFillGradient)"
              stroke="none"
              strokeWidth={0}
              opacity={betaiFillOpacity}
            />

            {/* Other tools line (gray) */}
            <AnimatedPath
              d={otherPath}
              stroke={colors.mutedForeground}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={pathLength}
              strokeDashoffset={otherLineProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [pathLength, 0],
              })}
              opacity={0.7}
            />

            {/* Bet.AI line (cyan) */}
            <AnimatedPath
              d={betaiPath}
              stroke="url(#betaiLineGradient)"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={pathLength}
              strokeDashoffset={betaiLineProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [pathLength, 0],
              })}
            />

            {/* Start point (shared) - at baseline */}
            <Circle
              cx={20}
              cy={BASELINE_Y}
              r={6}
              fill={colors.foreground}
              stroke={colors.background}
              strokeWidth={2}
            />

            {/* Bet.AI end point */}
            <Circle
              cx={CHART_WIDTH - 20}
              cy={CHART_HEIGHT - 130}
              r={6}
              fill={colors.foreground}
              stroke={colors.primary}
              strokeWidth={2}
            />

            {/* Other end point - at same baseline as start */}
            <Circle
              cx={CHART_WIDTH - 20}
              cy={BASELINE_Y}
              r={6}
              fill={colors.foreground}
              stroke={colors.mutedForeground}
              strokeWidth={2}
            />
          </Svg>

          {/* X-axis labels */}
          <View style={styles.xAxisLabels}>
            <Text style={styles.axisLabel}>{i18n.t("profitabilityMonth1")}</Text>
            <Text style={styles.axisLabel}>{i18n.t("profitabilityMonth6")}</Text>
          </View>
        </View>

        {/* Description */}
        <Animated.View style={[styles.descriptionContainer, { opacity: descOpacity }]}>
          <Text style={styles.description}>
            {i18n.t("profitabilityDescription")}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: spacing[2],
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(22, 26, 34, 0.85)",
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.rgba.primary30,
    padding: spacing[5],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[3],
  },
  title: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.lg,
    color: colors.foreground,
  },
  logo: {
    width: 70,
    height: 24,
  },
  legend: {
    flexDirection: "column",
    gap: spacing[1],
    marginBottom: spacing[3],
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
  },
  chartContainer: {
    position: "relative",
    alignItems: "center",
    marginBottom: spacing[2],
  },
  xAxisLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: CHART_WIDTH,
    paddingHorizontal: 10,
    marginTop: spacing[1],
  },
  axisLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
  },
  descriptionContainer: {
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.rgba.primary20,
  },
  description: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },
});

export default ProfitabilityComparisonChart;
