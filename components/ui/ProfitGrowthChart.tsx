import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G } from "react-native-svg";
import { Image } from "expo-image";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../i18n";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

interface ProfitGrowthChartProps {
  animate?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 100;
const CHART_HEIGHT = 140; // Reduced height to minimize space below graph
const LABEL_PADDING = 20; // Padding to align with label text centers

// Data points for the growth curve (x, y coordinates)
// Y values are inverted because SVG y-axis goes down
// X positions: labels use space-between, so first label center ~20px, middle at center, last ~20px from right
// DOT_POINTS are where the visible dots appear (aligned with labels)
// CURVE_POINTS include an extension point so the curve reaches the right edge
const DOT_POINTS = [
  { x: LABEL_PADDING + 2, y: CHART_HEIGHT - 45 },    // 3 Days - dot position (perfect)
  { x: CHART_WIDTH / 2 - 5, y: CHART_HEIGHT - 85 },  // 7 Days - dot position (perfect)
  { x: CHART_WIDTH - LABEL_PADDING + 10, y: CHART_HEIGHT - 125 }, // 30 Days - dot position (moved more right)
];

const CURVE_POINTS = [
  { x: 0, y: CHART_HEIGHT - 10 },                    // Start point (left edge)
  { x: LABEL_PADDING + 2, y: CHART_HEIGHT - 45 },    // 3 Days (matches dot)
  { x: CHART_WIDTH / 2 - 5, y: CHART_HEIGHT - 85 },  // 7 Days (matches dot)
  { x: CHART_WIDTH - LABEL_PADDING + 10, y: CHART_HEIGHT - 125 }, // 30 Days (matches dot)
  { x: CHART_WIDTH + 5, y: CHART_HEIGHT - 130 },     // Extension point (curve continues past right edge)
];

// Create smooth curve path using bezier curves
const createCurvePath = () => {
  const points = CURVE_POINTS;
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;

    // Control points for smooth curve
    const cp1x = midX;
    const cp1y = current.y;
    const cp2x = midX;
    const cp2y = next.y;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }

  return path;
};

// Create closed path for gradient fill
const createFillPath = () => {
  const curvePath = createCurvePath();
  const lastPoint = CURVE_POINTS[CURVE_POINTS.length - 1];
  const firstPoint = CURVE_POINTS[0];

  return `${curvePath} L ${lastPoint.x} ${CHART_HEIGHT} L ${firstPoint.x} ${CHART_HEIGHT} Z`;
};

export function ProfitGrowthChart({ animate = true }: ProfitGrowthChartProps) {
  // Animation values
  const lineProgress = useRef(new Animated.Value(0)).current;
  const fillOpacity = useRef(new Animated.Value(0)).current;
  const dotAnimations = useRef(
    DOT_POINTS.map(() => new Animated.Value(0))
  ).current;
  const dollarScale = useRef(new Animated.Value(0)).current;
  const dollarPulse = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const descOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      // If not animating, set all values to final state
      lineProgress.setValue(1);
      fillOpacity.setValue(1);
      dotAnimations.forEach(anim => anim.setValue(1));
      dollarScale.setValue(1);
      titleOpacity.setValue(1);
      descOpacity.setValue(1);
      return;
    }

    // Reset animations
    lineProgress.setValue(0);
    fillOpacity.setValue(0);
    dotAnimations.forEach(anim => anim.setValue(0));
    dollarScale.setValue(0);
    titleOpacity.setValue(0);
    descOpacity.setValue(0);

    // Sequence of animations
    const animationSequence = Animated.sequence([
      // 1. Title fade in
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // 2. Line drawing animation
      Animated.timing(lineProgress, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      // 3. Fill gradient fade in
      Animated.timing(fillOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // 4. Data points appear sequentially
      Animated.stagger(200, dotAnimations.map(anim =>
        Animated.spring(anim, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        })
      )),
      // 5. Dollar icon appears with bounce
      Animated.spring(dollarScale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
      // 6. Description fade in
      Animated.timing(descOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]);

    // Start pulse animation for dollar icon (loops)
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(dollarPulse, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(dollarPulse, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    // Run main sequence then start pulse
    animationSequence.start(() => {
      pulseAnimation.start();
    });

    return () => {
      lineProgress.stopAnimation();
      fillOpacity.stopAnimation();
      dotAnimations.forEach(anim => anim.stopAnimation());
      dollarScale.stopAnimation();
      dollarPulse.stopAnimation();
      titleOpacity.stopAnimation();
      descOpacity.stopAnimation();
    };
  }, [animate]);

  const curvePath = createCurvePath();
  const fillPath = createFillPath();

  // Calculate path length for stroke animation (approximate)
  const pathLength = 500;

  return (
    <View style={styles.container}>
      {/* Card Container */}
      <View style={styles.card}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: titleOpacity }]}>
          <Text style={styles.title}>{i18n.t("profitGrowthTitle")}</Text>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
            contentFit="contain"
          />
        </Animated.View>

        {/* Chart */}
        <View style={styles.chartContainer}>
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT + 10}>
            <Defs>
              {/* Gradient for the fill */}
              <LinearGradient id="fillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.4} />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
              {/* Gradient for the line */}
              <LinearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.6} />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity={1} />
              </LinearGradient>
            </Defs>

            {/* Gradient fill area */}
            <AnimatedPath
              d={fillPath}
              fill="url(#fillGradient)"
              opacity={fillOpacity}
            />

            {/* Main curve line */}
            <AnimatedPath
              d={curvePath}
              stroke="url(#lineGradient)"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={pathLength}
              strokeDashoffset={lineProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [pathLength, 0],
              })}
            />

            {/* Data point circles (3 Days, 7 Days, 30 Days) */}
            {DOT_POINTS.map((point, index) => (
              <AnimatedG
                key={index}
                opacity={dotAnimations[index]}
                transform={dotAnimations[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    `translate(${point.x}, ${point.y}) scale(0)`,
                    `translate(${point.x}, ${point.y}) scale(1)`,
                  ],
                })}
              >
                {/* Outer glow circle */}
                <Circle
                  cx={0}
                  cy={0}
                  r={12}
                  fill={colors.primary}
                  opacity={0.2}
                />
                {/* Inner circle */}
                <Circle
                  cx={0}
                  cy={0}
                  r={6}
                  fill={colors.primary}
                />
                {/* Center dot */}
                <Circle
                  cx={0}
                  cy={0}
                  r={3}
                  fill={colors.background}
                />
              </AnimatedG>
            ))}
          </Svg>

          {/* Dollar icon at the end */}
          <Animated.View
            style={[
              styles.dollarContainer,
              {
                transform: [
                  { scale: Animated.multiply(dollarScale, dollarPulse) },
                ],
                opacity: dollarScale,
              },
            ]}
          >
            <View style={styles.dollarCircle}>
              <Ionicons name="cash" size={20} color={colors.background} />
            </View>
          </Animated.View>

          {/* X-axis labels */}
          <View style={styles.xAxisLabels}>
            <Text style={styles.axisLabel}>{i18n.t("profitGrowth3Days")}</Text>
            <Text style={styles.axisLabel}>{i18n.t("profitGrowth7Days")}</Text>
            <Text style={styles.axisLabel}>{i18n.t("profitGrowth30Days")}</Text>
          </View>
        </View>

        {/* Description */}
        <Animated.View style={[styles.descriptionContainer, { opacity: descOpacity }]}>
          <Text style={styles.description}>
            {i18n.t("profitGrowthDescription")}
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
    // Glow effect
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
    marginBottom: spacing[4],
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
  chartContainer: {
    position: "relative",
    alignItems: "center",
    marginBottom: spacing[2],
  },
  dollarContainer: {
    position: "absolute",
    top: 0,
    right: -2,
  },
  dollarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    // Glow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
  xAxisLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: CHART_WIDTH,
    marginTop: 0,
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

export default ProfitGrowthChart;
