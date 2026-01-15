import React, { useEffect } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { colors } from "../../constants/designTokens";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

interface ParticleProps {
  size: number;
  initialX: number;
  initialY: number;
  delay: number;
  duration: number;
  opacity: number;
}

function Particle({ size, initialX, initialY, delay, duration, opacity }: ParticleProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const particleOpacity = useSharedValue(0);

  useEffect(() => {
    // Floating up and slight horizontal drift
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(-60, { duration, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );

    translateX.value = withDelay(
      delay,
      withRepeat(
        withTiming(Math.random() > 0.5 ? 15 : -15, { duration: duration * 1.2, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );

    // Fade in/out
    particleOpacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(opacity, { duration: duration * 0.5, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    opacity: particleOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: initialX,
          top: initialY,
        },
        animatedStyle,
      ]}
    />
  );
}

interface FloatingParticlesProps {
  /** Number of particles (default: 12) */
  count?: number;
  /** Center vertical position as percentage (0-1, default: 0.42) */
  verticalPosition?: number;
  /** Spread radius around center (default: 180) */
  spread?: number;
}

export function FloatingParticles({
  count = 12,
  verticalPosition = 0.42,
  spread = 180,
}: FloatingParticlesProps) {
  const centerY = SCREEN_HEIGHT * verticalPosition;
  const centerX = SCREEN_WIDTH / 2;

  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const radius = spread * (0.5 + Math.random() * 0.5);
    const x = centerX + Math.cos(angle) * radius - 4;
    const y = centerY + Math.sin(angle) * radius - 4;

    return {
      id: i,
      size: 3 + Math.random() * 5,
      initialX: x,
      initialY: y,
      delay: i * 200,
      duration: 3000 + Math.random() * 2000,
      opacity: 0.3 + Math.random() * 0.4,
    };
  });

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((particle) => (
        <Particle key={particle.id} {...particle} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  particle: {
    position: "absolute",
    backgroundColor: colors.primary,
  },
});

export default FloatingParticles;
