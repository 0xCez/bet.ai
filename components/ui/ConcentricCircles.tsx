import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../../constants/designTokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface ConcentricCirclesProps {
  /** Number of circles to render */
  circleCount?: number;
  /** Base size of the largest circle (default: screen width * 1.3) */
  size?: number;
  /** Inner color (brighter, for center circles) */
  innerColor?: string;
  /** Outer color (dimmer, for outer circles) */
  outerColor?: string;
  /** Base opacity for inner circles (0-1, default: 0.5) */
  innerOpacity?: number;
  /** Base opacity for outer circles (0-1, default: 0.08) */
  outerOpacity?: number;
  /** Stroke width of each circle (default: 1) */
  strokeWidth?: number;
  /** Gap between circles in pixels (default: calculated based on size/count) */
  gap?: number;
  /** Center the circles vertically at this percentage (0-1, default: 0.4 = 40% from top) */
  verticalPosition?: number;
  /** Dash pattern for dashed lines [dashLength, gapLength] */
  dashPattern?: [number, number];
  /** Enable slow rotation animation (default: false) */
  rotate?: boolean;
  /** Duration of one full rotation in ms (default: 60000 = 60 seconds) */
  rotationDuration?: number;
}

export function ConcentricCircles({
  circleCount = 14,
  size = SCREEN_WIDTH * 1.05,
  innerColor = colors.primary,
  outerColor = colors.primary,
  innerOpacity = 0.80,
  outerOpacity = 0.08,
  strokeWidth = 1,
  gap,
  verticalPosition = 0.60,
  dashPattern = [10, 12],
  rotate = false,
  rotationDuration = 60000,
}: ConcentricCirclesProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (rotate) {
      rotation.value = withRepeat(
        withTiming(360, { duration: rotationDuration, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [rotate, rotationDuration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const calculatedGap = gap || size / (circleCount * 2.3);
  const circles = [];

  for (let i = 0; i < circleCount; i++) {
    const radius = (i + 1) * calculatedGap;

    // Progress from 0 (innermost) to 1 (outermost)
    const progress = i / (circleCount - 1);

    // Interpolate opacity: inner circles are brighter, outer circles are dimmer
    const circleOpacity = innerOpacity - (innerOpacity - outerOpacity) * progress;

    // Get dash pattern values
    const dashLength = dashPattern[0];
    const gapLength = dashPattern[1];

    circles.push(
      <Circle
        key={i}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={progress < 0.5 ? innerColor : outerColor}
        strokeWidth={strokeWidth}
        fill="none"
        opacity={circleOpacity}
        strokeDasharray={`${dashLength} ${gapLength}`}
      />
    );
  }

  const svgContent = (
    <Svg width={size} height={size} style={styles.svg}>
      {circles}
    </Svg>
  );

  return (
    <View style={[styles.container, { top: `${verticalPosition * 100 - 50}%` }]} pointerEvents="none">
      {rotate ? (
        <Animated.View style={animatedStyle}>
          {svgContent}
        </Animated.View>
      ) : (
        svgContent
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  },
  svg: {
    alignSelf: "center",
  },
});
