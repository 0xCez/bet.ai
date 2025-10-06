import { useRef, useEffect } from "react";
import { Animated } from "react-native";

export const usePageTransition = (isLoading: boolean = false) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (!isLoading) {
      // Start entrance animation when page loads
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Reset animation values when loading
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }
  }, [isLoading]);

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [
      {
        translateY: slideAnim,
      },
    ],
  };

  return { animatedStyle };
};
