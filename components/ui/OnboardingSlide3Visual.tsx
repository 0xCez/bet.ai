import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  interpolate,
} from "react-native-reanimated";
import Svg, { Line, Circle, Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Bar data for Sharps vs Public chart - side by side bars
// Green (sharps) and Red (public) bars next to each other
// Line connects tops of green bars
const barData = [
  { sharps: 55, public: 75 },
  { sharps: 70, public: 85 },
  { sharps: 50, public: 80 },
  { sharps: 75, public: 45 },  // Green taller here
  { sharps: 60, public: 75 },
];

// Line points connecting the tops of sharps (green) bars
const linePoints = [62, 77, 57, 82, 67];

interface AnimatedBarProps {
  sharpsHeight: number;
  publicHeight: number;
  index: number;
  isActive: boolean;
  maxHeight: number;
  barWidth: number;
}

function AnimatedBar({ sharpsHeight, publicHeight, index, isActive, maxHeight, barWidth }: AnimatedBarProps) {
  const progress = useSharedValue(0);
  const singleBarWidth = (barWidth - 4) / 2; // Two bars side by side with small gap

  useEffect(() => {
    if (isActive) {
      progress.value = 0;
      progress.value = withDelay(
        index * 100,
        withSpring(1, { damping: 12, stiffness: 80 })
      );
    } else {
      progress.value = 0;
    }
  }, [isActive]);

  const sharpsAnimatedStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, (sharpsHeight / 100) * maxHeight * 1.1]), // 10% taller
  }));

  const publicAnimatedStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, (publicHeight / 100) * maxHeight * 1.1]), // 10% taller
  }));

  return (
    <View style={[styles.barGroup, { width: barWidth }]}>
      {/* Side by side bars: Green (sharps) on left, Red (public) on right */}
      <View style={styles.sideBySideContainer}>
        {/* Green (sharps) bar */}
        <Animated.View
          style={[
            styles.bar,
            styles.sharpsBar,
            { width: singleBarWidth },
            sharpsAnimatedStyle,
          ]}
        />
        {/* Red (public) bar */}
        <Animated.View
          style={[
            styles.bar,
            styles.publicBar,
            { width: singleBarWidth },
            publicAnimatedStyle,
          ]}
        />
      </View>
    </View>
  );
}

// Animated line with dots
interface AnimatedLineProps {
  isActive: boolean;
  chartWidth: number;
  chartHeight: number;
  barWidth: number;
}

function AnimatedLineOverlay({ isActive, chartWidth, chartHeight, barWidth }: AnimatedLineProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      progress.value = 0;
      progress.value = withDelay(
        500,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })
      );
    } else {
      progress.value = 0;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  // Calculate points for the line - positioned at center of green (left) bar in each group
  const singleBarWidth = (barWidth - 4) / 2; // Same calculation as in AnimatedBar
  const totalBarsWidth = (barWidth * 5) + (6 * 4); // 5 bars + 4 gaps of 6px
  const startX = (chartWidth - totalBarsWidth) / 2; // Center offset

  const points = linePoints.map((value, index) => {
    // Position at center of the green bar (left bar in each group)
    const groupStartX = startX + (index * (barWidth + 6));
    const x = groupStartX + (singleBarWidth / 2) + 7; // Center of green bar + 7px offset right
    const y = chartHeight - ((value / 100) * chartHeight * 1.1); // Match 10% taller bars
    return { x, y };
  });

  return (
    <Animated.View style={[styles.lineOverlay, animatedStyle]}>
      <Svg width={chartWidth} height={chartHeight}>
        {/* Lines connecting points */}
        {points.map((point, index) => {
          if (index === points.length - 1) return null;
          const nextPoint = points[index + 1];
          return (
            <Line
              key={index}
              x1={point.x}
              y1={point.y}
              x2={nextPoint.x}
              y2={nextPoint.y}
              stroke="#22D3EE"
              strokeWidth={2}
            />
          );
        })}
        {/* Dots at each point */}
        {points.map((point, index) => (
          <Circle
            key={`dot-${index}`}
            cx={point.x}
            cy={point.y}
            r={5}
            fill="#22D3EE"
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

interface SharpsVsPublicChartProps {
  isActive: boolean;
}

export function SharpsVsPublicChart({ isActive }: SharpsVsPublicChartProps) {
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);

  useEffect(() => {
    if (isActive) {
      cardOpacity.value = 0;
      cardScale.value = 0.9;
      cardOpacity.value = withDelay(0, withTiming(1, { duration: 400 }));
      cardScale.value = withDelay(0, withSpring(1, { damping: 15, stiffness: 100 }));
    } else {
      cardOpacity.value = 0;
      cardScale.value = 0.9;
    }
  }, [isActive]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const CHART_WIDTH = SCREEN_WIDTH * 0.55;
  const CHART_HEIGHT = 140;
  const BAR_WIDTH = (CHART_WIDTH - 8) / 5; // 5 bars, 8px total padding

  return (
    <Animated.View style={[styles.chartCard, cardAnimatedStyle]}>
      <Text style={styles.chartTitle}>Sharps vs Public</Text>

      <View style={styles.chartContainer}>
        {/* Horizontal reference line */}
        <View style={[styles.referenceLine, { top: CHART_HEIGHT * 0.25 }]} />

        {/* Bars */}
        <View style={styles.barsContainer}>
          {barData.map((data, index) => (
            <AnimatedBar
              key={index}
              sharpsHeight={data.sharps}
              publicHeight={data.public}
              index={index}
              isActive={isActive}
              maxHeight={CHART_HEIGHT}
              barWidth={BAR_WIDTH}
            />
          ))}
        </View>

        {/* Line overlay */}
        <AnimatedLineOverlay
          isActive={isActive}
          chartWidth={CHART_WIDTH}
          chartHeight={CHART_HEIGHT}
          barWidth={BAR_WIDTH}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[5],
    paddingHorizontal: spacing[6],
    width: SCREEN_WIDTH * 0.7,
    overflow: "hidden",
  },
  chartTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: colors.foreground,
    marginBottom: spacing[3],
  },
  chartContainer: {
    height: 140,
    position: "relative",
  },
  referenceLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: colors.mutedForeground,
    opacity: 0.4,
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    height: "100%",
    gap: 6,
  },
  barGroup: {
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  sideBySideContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bar: {
    borderRadius: 4,
  },
  sharpsBar: {
    backgroundColor: "#22C55E",
  },
  publicBar: {
    backgroundColor: "#EF4444",
  },
  lineOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Odds Movement Chart Styles
  oddsChartCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[4],
    width: SCREEN_WIDTH * 0.7,
    overflow: "hidden",
  },
  oddsSvg: {
    marginLeft: 0,
  },
  oddsSvgContainer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  oddsLabel: {
    position: "absolute",
    width: 35,
    alignItems: "center",
  },
  oddsLabelText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    color: colors.mutedForeground,
  },
  oddsLabelTextHighlight: {
    color: "#22D3EE",
    fontFamily: typography.fontFamily.bold,
  },
  xAxisLabels: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 5,
  },
  xAxisLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.mutedForeground,
  },
});

// ==================== ODDS MOVEMENT CHART ====================

interface OddsMovementChartProps {
  isActive: boolean;
}

// Animated dot component for OddsMovementChart
interface AnimatedOddsDotProps {
  x: number;
  y: number;
  index: number;
  isLast: boolean;
  isFirst: boolean;
  isActive: boolean;
}

function AnimatedOddsDot({ x, y, index, isLast, isFirst, isActive }: AnimatedOddsDotProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      scale.value = 0;
      opacity.value = 0;
      // Stagger dots appearing after line draws
      scale.value = withDelay(
        600 + index * 200,
        withSpring(1, { damping: 10, stiffness: 150 })
      );
      opacity.value = withDelay(
        600 + index * 200,
        withTiming(1, { duration: 300 })
      );
    } else {
      scale.value = 0;
      opacity.value = 0;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const dotSize = isLast ? 8 : 5;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: x - (isLast ? 12 : dotSize),
          top: y - (isLast ? 12 : dotSize),
          width: isLast ? 24 : dotSize * 2,
          height: isLast ? 24 : dotSize * 2,
          alignItems: "center",
          justifyContent: "center",
        },
        animatedStyle,
      ]}
    >
      {isLast && (
        <View
          style={{
            position: "absolute",
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: "#22D3EE",
            opacity: 0.3,
          }}
        />
      )}
      <View
        style={{
          width: dotSize * 2,
          height: dotSize * 2,
          borderRadius: dotSize,
          backgroundColor: isLast ? "#22D3EE" : isFirst ? "#6B7280" : "#94A3B8",
          borderWidth: isLast ? 2 : 0,
          borderColor: "#fff",
        }}
      />
    </Animated.View>
  );
}

// Animated label component for OddsMovementChart
interface AnimatedOddsLabelProps {
  x: number;
  y: number;
  label: string;
  index: number;
  isLast: boolean;
  isActive: boolean;
}

function AnimatedOddsLabel({ x, y, label, index, isLast, isActive }: AnimatedOddsLabelProps) {
  const translateY = useSharedValue(-10);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      translateY.value = -10;
      opacity.value = 0;
      translateY.value = withDelay(
        700 + index * 200,
        withSpring(0, { damping: 12, stiffness: 100 })
      );
      opacity.value = withDelay(
        700 + index * 200,
        withTiming(1, { duration: 300 })
      );
    } else {
      translateY.value = -10;
      opacity.value = 0;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.oddsLabel,
        {
          left: isLast ? x - 17.5 : x - 15,
          top: isLast ? y - 28 : y - 22,
        },
        animatedStyle,
      ]}
    >
      <Text style={[
        styles.oddsLabelText,
        isLast && styles.oddsLabelTextHighlight,
      ]}>
        {label}
      </Text>
    </Animated.View>
  );
}

export function OddsMovementChart({ isActive }: OddsMovementChartProps) {
  const cardOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const lineOpacity = useSharedValue(0);
  const fillOpacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      cardOpacity.value = 0;
      cardScale.value = 0.9;
      lineOpacity.value = 0;
      fillOpacity.value = 0;

      // Card appears first
      cardOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));
      cardScale.value = withDelay(200, withSpring(1, { damping: 15, stiffness: 100 }));

      // Line draws in
      lineOpacity.value = withDelay(400, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));

      // Fill fades in after line
      fillOpacity.value = withDelay(600, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    } else {
      cardOpacity.value = 0;
      cardScale.value = 0.9;
      lineOpacity.value = 0;
      fillOpacity.value = 0;
    }
  }, [isActive]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const lineAnimatedStyle = useAnimatedStyle(() => ({
    opacity: lineOpacity.value,
  }));

  const fillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fillOpacity.value,
  }));

  const CHART_WIDTH = SCREEN_WIDTH * 0.7 - spacing[4] * 2;
  const CHART_HEIGHT = 100;
  const SVG_WIDTH = CHART_WIDTH;

  // Data points for the line (x percentage, y value, label) - 3 points only
  const dataPoints = [
    { x: 5, y: 25, label: "+110" },
    { x: 50, y: 50, label: "+150" },
    { x: 95.5, y: 85, label: "+210" },
  ];

  // Calculate actual positions - full width usage
  const points = dataPoints.map((point) => ({
    x: (point.x / 100) * SVG_WIDTH,
    y: CHART_HEIGHT - (point.y / 100) * CHART_HEIGHT,
    label: point.label,
  }));

  // Create SVG path for the line
  const linePath = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");

  // Create gradient fill path (line + bottom) - extend to full width
  const fillPath = `M 0 ${CHART_HEIGHT} L ${points[0].x} ${points[0].y} ${points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ")} L ${SVG_WIDTH} ${points[points.length - 1].y} L ${SVG_WIDTH} ${CHART_HEIGHT} Z`;

  return (
    <Animated.View style={[styles.oddsChartCard, cardAnimatedStyle]}>
      <Text style={styles.chartTitle}>Odds Movement</Text>

      <View style={[styles.chartContainer, { height: CHART_HEIGHT + 40 }]}>
        {/* Animated fill layer */}
        <Animated.View style={[styles.oddsSvgContainer, fillAnimatedStyle]}>
          <Svg width={SVG_WIDTH} height={CHART_HEIGHT} style={styles.oddsSvg}>
            <Defs>
              <LinearGradient id="fillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#22D3EE" stopOpacity="0.3" />
                <Stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d={fillPath} fill="url(#fillGradient)" />
          </Svg>
        </Animated.View>

        {/* Animated line layer */}
        <Animated.View style={[styles.oddsSvgContainer, lineAnimatedStyle]}>
          <Svg width={SVG_WIDTH} height={CHART_HEIGHT} style={styles.oddsSvg}>
            <Defs>
              <LinearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#6B7280" />
                <Stop offset="100%" stopColor="#22D3EE" />
              </LinearGradient>
            </Defs>
            <Path
              d={linePath}
              stroke="url(#lineGradient)"
              strokeWidth={2.5}
              fill="none"
            />
          </Svg>
        </Animated.View>

        {/* Animated dots */}
        {points.map((point, index) => (
          <AnimatedOddsDot
            key={`dot-${index}`}
            x={point.x}
            y={point.y}
            index={index}
            isLast={index === points.length - 1}
            isFirst={index === 0}
            isActive={isActive}
          />
        ))}

        {/* Animated labels */}
        {points.map((point, index) => (
          <AnimatedOddsLabel
            key={`label-${index}`}
            x={point.x}
            y={point.y}
            label={point.label}
            index={index}
            isLast={index === points.length - 1}
            isActive={isActive}
          />
        ))}

        {/* X-axis labels */}
        <View style={[styles.xAxisLabels, { top: CHART_HEIGHT + 8 }]}>
          <Text style={styles.xAxisLabel}>Opening</Text>
          <Text style={styles.xAxisLabel}>24h Ago</Text>
          <Text style={styles.xAxisLabel}>Current</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default SharpsVsPublicChart;
