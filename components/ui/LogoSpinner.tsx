import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";
import Svg, { Rect, Path } from "react-native-svg";
import { colors } from "../../constants/designTokens";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface LogoSpinnerProps {
  size?: number;
  color?: string;
}

export function LogoSpinner({ size = 48, color = colors.primary }: LogoSpinnerProps) {
  // Create individual animation values for each element
  const animations = useRef(
    Array.from({ length: 7 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const CYCLE_DURATION = 2400;
    const STAGGER_DELAY = 100; // Delay between each element starting

    // Create a continuous animation for each element
    // Each runs forever with a stagger offset
    const startAnimation = (anim: Animated.Value, index: number) => {
      const delay = index * STAGGER_DELAY;

      // Initial delay before first cycle
      setTimeout(() => {
        const runCycle = () => {
          anim.setValue(0);
          Animated.timing(anim, {
            toValue: 1,
            duration: CYCLE_DURATION,
            easing: Easing.linear,
            useNativeDriver: false,
          }).start(() => {
            // Immediately start next cycle - no gap
            runCycle();
          });
        };
        runCycle();
      }, delay);
    };

    // Start all animations
    animations.forEach((anim, index) => {
      startAnimation(anim, index);
    });

    return () => {
      animations.forEach(anim => anim.stopAnimation());
    };
  }, []);

  // Interpolate opacity for each element
  // Pattern: hidden -> fade in -> visible -> fade out -> hidden
  const getElementOpacity = (index: number) => {
    return animations[index].interpolate({
      inputRange: [0, 0.15, 0.25, 0.55, 0.65, 1],
      outputRange: [0, 0, 1, 1, 0, 0],
    });
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox="40 45 100 95"
        fill="none"
      >
        {/* Element 1 - Top bar */}
        <AnimatedRect
          x="64.236"
          y="50.4492"
          width="54.7445"
          height="16.1983"
          fill={color}
          opacity={getElementOpacity(0)}
        />

        {/* Element 2 - Middle bar */}
        <AnimatedRect
          x="64.236"
          y="81.9009"
          width="54.7445"
          height="16.1983"
          fill={color}
          opacity={getElementOpacity(1)}
        />

        {/* Element 3 - Bottom bar */}
        <AnimatedRect
          x="64.236"
          y="113.353"
          width="54.7445"
          height="16.1983"
          fill={color}
          opacity={getElementOpacity(2)}
        />

        {/* Element 4 - Top right arrow */}
        <AnimatedPath
          d="M118.98 89.73V64.2177V50.7866L132.188 66.6474V81.709L125.685 89.73H118.98Z"
          fill={color}
          opacity={getElementOpacity(3)}
        />

        {/* Element 5 - Bottom right arrow */}
        <AnimatedPath
          d="M118.98 89.6626V116.12V129.551L132.188 113.324V98.3337L125.632 89.6626H118.98Z"
          fill={color}
          opacity={getElementOpacity(4)}
        />

        {/* Element 6 - Top left square */}
        <AnimatedRect
          x="47.8125"
          y="66.6475"
          width="16.4234"
          height="15.2534"
          fill={color}
          opacity={getElementOpacity(5)}
        />

        {/* Element 7 - Bottom left square */}
        <AnimatedRect
          x="47.8125"
          y="98.0991"
          width="16.4234"
          height="15.2534"
          fill={color}
          opacity={getElementOpacity(6)}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default LogoSpinner;
