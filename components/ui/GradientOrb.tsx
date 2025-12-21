import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../constants/designTokens";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

interface GradientOrbProps {
  /** Size of the orb (default: 300) */
  size?: number;
  /** Vertical position as percentage from top (0-1, default: 0.4) */
  verticalPosition?: number;
  /** Enable pulse animation (default: true) */
  pulse?: boolean;
  /** Primary color (default: colors.primary) */
  primaryColor?: string;
  /** Opacity of the orb (default: 0.6) */
  opacity?: number;
}

export function GradientOrb({
  size = 330,
  verticalPosition = 0.42,
  pulse = true,
  primaryColor = colors.primary,
  opacity = 0.5,
}: GradientOrbProps) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(opacity);
  const glowScale = useSharedValue(1);
  const outerRotation = useSharedValue(0);

  useEffect(() => {
    if (pulse) {
      // Stronger breathing scale animation
      scale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      // Stronger opacity pulse
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(opacity - 0.2, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      // Outer glow pulsing separately for extra effect
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      // Slow rotation on outer glow only
      outerRotation.value = withRepeat(
        withTiming(360, { duration: 25000, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [pulse, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: glowOpacity.value,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: glowScale.value },
      { rotate: `${outerRotation.value}deg` },
    ],
    opacity: glowOpacity.value * 0.6,
  }));

  return (
    <View
      style={[
        styles.container,
        { top: SCREEN_HEIGHT * verticalPosition - size / 2 },
      ]}
      pointerEvents="none"
    >
      {/* Extra outer glow ring that pulses independently */}
      <Animated.View style={[styles.outerGlow, { width: size * 2, height: size * 2 }, glowAnimatedStyle]}>
        <LinearGradient
          colors={[
            "transparent",
            `${primaryColor}08`,
            `${primaryColor}15`,
            `${primaryColor}08`,
            "transparent",
          ]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      <Animated.View style={[styles.orbWrapper, { width: size, height: size }, animatedStyle]}>
        {/* Outer glow layer */}
        <View style={[styles.glowLayer, { width: size * 1.5, height: size * 1.5 }]}>
          <LinearGradient
            colors={[
              "transparent",
              `${primaryColor}20`,
              `${primaryColor}35`,
              `${primaryColor}20`,
              "transparent",
            ]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>

        {/* Main orb gradient - more intense */}
        <LinearGradient
          colors={[
            `${primaryColor}00`,
            `${primaryColor}30`,
            `${primaryColor}60`,
            `${primaryColor}30`,
            `${primaryColor}00`,
          ]}
          style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />

        {/* Inner bright core - stronger glow */}
        <View style={[styles.core, { width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25 }]}>
          <LinearGradient
            colors={[
              `${primaryColor}90`,
              `${primaryColor}50`,
              `${primaryColor}00`,
            ]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 1, y: 1 }}
          />
        </View>
      </Animated.View>
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
  outerGlow: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  orbWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowLayer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  orb: {
    position: "absolute",
  },
  core: {
    position: "absolute",
    overflow: "hidden",
  },
});

export default GradientOrb;
