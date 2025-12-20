import { useRef, useCallback } from "react";
import { Animated, ViewStyle } from "react-native";

interface StaggeredAnimationOptions {
  itemCount: number;
  duration?: number;
  staggerDelay?: number;
  initialDelay?: number;
}

interface AnimatedItemStyle {
  opacity: Animated.AnimatedInterpolation<number>;
  transform: ViewStyle["transform"];
}

/**
 * Hook for creating staggered pop-in animations for list items
 *
 * @param options Configuration options for the animation
 * @returns Animation values and control functions
 */
export function useStaggeredAnimation(options: StaggeredAnimationOptions) {
  const {
    itemCount,
    duration = 300,
    staggerDelay = 80,
    initialDelay = 100,
  } = options;

  // Create animation values for each item
  const animationValues = useRef<Animated.Value[]>(
    Array.from({ length: itemCount }, () => new Animated.Value(0))
  ).current;

  // Ensure we have enough animation values if itemCount changes
  while (animationValues.length < itemCount) {
    animationValues.push(new Animated.Value(0));
  }

  /**
   * Start the staggered animation
   */
  const animateIn = useCallback(() => {
    // Reset all animations
    animationValues.forEach(anim => anim.setValue(0));

    // Create staggered animations
    const animations = animationValues.slice(0, itemCount).map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration,
        delay: initialDelay + index * staggerDelay,
        useNativeDriver: true,
      })
    );

    // Start all animations
    Animated.parallel(animations).start();
  }, [animationValues, itemCount, duration, staggerDelay, initialDelay]);

  /**
   * Reset all animations to initial state
   */
  const reset = useCallback(() => {
    animationValues.forEach(anim => anim.setValue(0));
  }, [animationValues]);

  /**
   * Get animated style for a specific item
   */
  const getItemStyle = useCallback(
    (index: number): AnimatedItemStyle => {
      const anim = animationValues[index] || new Animated.Value(1);

      return {
        opacity: anim,
        transform: [
          {
            translateX: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-30, 0],
            }),
          },
          {
            scale: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.9, 1],
            }),
          },
        ] as ViewStyle["transform"],
      };
    },
    [animationValues]
  );

  return {
    animationValues,
    animateIn,
    reset,
    getItemStyle,
  };
}

/**
 * Simplified hook for animating cards/sections on a page
 * Automatically triggers animation when isLoading becomes false
 */
export function useCardAnimations(cardCount: number, isLoading: boolean) {
  const { animationValues, animateIn, getItemStyle } = useStaggeredAnimation({
    itemCount: cardCount,
    duration: 350,
    staggerDelay: 100,
    initialDelay: 50,
  });

  // Trigger animation when loading completes
  const hasAnimatedRef = useRef(false);

  if (!isLoading && !hasAnimatedRef.current) {
    hasAnimatedRef.current = true;
    // Small delay to ensure component is mounted
    setTimeout(animateIn, 50);
  }

  // Reset when loading starts again
  if (isLoading && hasAnimatedRef.current) {
    hasAnimatedRef.current = false;
  }

  return {
    getItemStyle,
    animateIn,
  };
}
