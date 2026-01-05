import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface GradientProgressBarProps {
  value: number;
  maxValue: number;
  colors?: readonly [string, string, ...string[]];
  animated?: boolean;
  animationDuration?: number;
  animationDelay?: number;
  animationKey?: string | number; // Key to trigger re-animation
}

export function GradientProgressBar({
  value,
  maxValue,
  colors = ["#00DDFF", "#0BFF13"] as const,
  animated = true,
  animationDuration = 800,
  animationDelay = 0,
  animationKey,
}: GradientProgressBarProps) {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      animatedValue.setValue(0);
      Animated.timing(animatedValue, {
        toValue: percentage,
        duration: animationDuration,
        delay: animationDelay,
        useNativeDriver: false, // Can't use native driver for left position
      }).start();
    } else {
      animatedValue.setValue(percentage);
    }
  }, [percentage, animated, animationDuration, animationDelay, animationKey]);

  const indicatorPosition = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
          locations={[0, 1]}
        />
      </View>
      <Animated.View
        style={[
          styles.indicator,
          {
            left: indicatorPosition,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    height: 5.37,
    position: "relative",
  },
  container: {
    width: "100%",
    height: 5.37,
    borderRadius: 33.59,
    overflow: "hidden",
  },
  gradient: {
    flex: 1,
  },
  indicator: {
    position: "absolute",
    top: "50%",
    width: 7.51,
    height: 7.51,
    borderRadius: 3.755,
    backgroundColor: "#f7f7f7",
    marginLeft: -3.755,
    marginTop: -3.755,
  },
});
