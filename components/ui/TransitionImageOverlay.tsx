import React, { useEffect } from "react";
import { StyleSheet, Image, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useImageTransition } from "../../contexts/ImageTransitionContext";
import { colors, borderRadius } from "../../constants/designTokens";

export function TransitionImageOverlay() {
  const { isTransitioning, transitionConfig, completeTransition } = useImageTransition();

  // Animation values
  const overlayOpacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (isTransitioning && transitionConfig) {
      const { startPosition, endPosition, duration = 400 } = transitionConfig;

      // Calculate the Y distance to travel (negative = moving up)
      const yDistance = endPosition.y - startPosition.y;

      // Reset values immediately
      overlayOpacity.value = 1;
      translateY.value = 0;
      glowOpacity.value = 0;

      // Fade in glow smoothly
      glowOpacity.value = withTiming(0.8, {
        duration: duration * 0.3,
        easing: Easing.out(Easing.ease)
      });

      // Smooth vertical movement with ease-out for natural deceleration
      translateY.value = withTiming(yDistance, {
        duration: duration,
        easing: Easing.out(Easing.cubic), // Smooth deceleration
      });

      // Fade out overlay after animation completes
      setTimeout(() => {
        overlayOpacity.value = withTiming(0, {
          duration: 150,
          easing: Easing.in(Easing.ease)
        }, (finished) => {
          if (finished) {
            runOnJS(completeTransition)();
          }
        });
      }, duration - 100);
    }
  }, [isTransitioning, transitionConfig]);

  // Container style - starts at measured position, moves with translateY
  const containerStyle = useAnimatedStyle(() => {
    if (!transitionConfig) return { opacity: 0 };

    const { startPosition } = transitionConfig;

    return {
      position: "absolute" as const,
      left: startPosition.x,
      top: startPosition.y,
      width: startPosition.width,
      height: startPosition.height,
      transform: [{ translateY: translateY.value }],
      opacity: overlayOpacity.value,
      zIndex: 10000,
    };
  });

  // Glow style
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  if (!isTransitioning || !transitionConfig) {
    return null;
  }

  const { imageSource, borderRadius: imgBorderRadius = borderRadius.xl } = transitionConfig;
  const isUriSource = typeof imageSource === "string";

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={containerStyle}>
        {/* Outer glow effect */}
        <Animated.View style={[styles.glowOuter, glowStyle]}>
          <LinearGradient
            colors={[
              'transparent',
              `${colors.primary}30`,
              `${colors.primary}50`,
              `${colors.primary}30`,
              'transparent',
            ]}
            style={[StyleSheet.absoluteFill, { borderRadius: imgBorderRadius + 15 }]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </Animated.View>

        {/* Inner glow effect */}
        <Animated.View style={[styles.glowInner, glowStyle]}>
          <LinearGradient
            colors={[
              `${colors.primary}40`,
              `${colors.primary}60`,
              `${colors.primary}40`,
            ]}
            style={[StyleSheet.absoluteFill, { borderRadius: imgBorderRadius + 6 }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </Animated.View>

        {/* Image with border */}
        <View
          style={[
            styles.imageWrapper,
            {
              borderRadius: imgBorderRadius,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 20,
              elevation: 20,
            },
          ]}
        >
          {/* Gradient border */}
          <LinearGradient
            colors={[
              `${colors.primary}70`,
              `${colors.primary}40`,
              `${colors.primary}70`,
            ]}
            style={[styles.gradientBorder, { borderRadius: imgBorderRadius }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View
              style={[
                styles.imageContainer,
                { borderRadius: imgBorderRadius - 2 },
              ]}
            >
              <Image
                source={isUriSource ? { uri: imageSource } : imageSource}
                style={[styles.image, { borderRadius: imgBorderRadius - 2 }]}
                resizeMode="cover"
              />
            </View>
          </LinearGradient>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
  },
  glowOuter: {
    position: "absolute",
    top: -18,
    left: -18,
    right: -18,
    bottom: -18,
  },
  glowInner: {
    position: "absolute",
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
  },
  imageWrapper: {
    flex: 1,
  },
  gradientBorder: {
    flex: 1,
    padding: 2,
  },
  imageContainer: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

export default TransitionImageOverlay;
