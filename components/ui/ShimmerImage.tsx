import React from "react";
import {
  View,
  Image,
  StyleSheet,
  ImageSourcePropType,
  ViewStyle,
  ImageStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  withSequence,
  Easing,
} from "react-native-reanimated";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

interface ShimmerImageProps {
  source: ImageSourcePropType;
  style?: ViewStyle;
  imageStyle?: ImageStyle;
  resizeMode?: "contain" | "cover" | "stretch" | "center";
  shimmerType?: "glow" | "shimmer";
}

export function ShimmerImage({
  source,
  style,
  imageStyle,
  resizeMode = "contain",
  shimmerType = "glow",
}: ShimmerImageProps) {
  const glowOpacity = useSharedValue(0.3);
  const glowScale = useSharedValue(1);

  React.useEffect(() => {
    if (shimmerType === "glow") {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 1000, easing: Easing.cubic }),
          withTiming(0.3, { duration: 1000, easing: Easing.cubic })
        ),
        -1,
        true
      );

      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1000, easing: Easing.cubic }),
          withTiming(1, { duration: 1000, easing: Easing.cubic })
        ),
        -1,
        true
      );
    }
  }, [shimmerType]);

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View style={[styles.container, style]}>
      {shimmerType === "glow" && (
        <Animated.Image
          source={require("@/assets/images/demoglow.png")}
          style={[styles.glow, glowAnimatedStyle]}
          resizeMode="contain"
        />
      )}
      <Image source={source} style={[styles.image]} resizeMode={resizeMode} />
      {shimmerType === "shimmer" && (
        <View style={styles.shimmerContainer}>
          <LinearGradient
            colors={["#00B5FF", "#00B5FF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientContainer}
          >
            <ShimmerPlaceholder
              style={[styles.shimmerImage]}
              shimmerColors={["#919191", "#00B5FF", "#919191"]}
            />
          </LinearGradient>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    // backgroundColor: "#000",
  },
  glow: {
    position: "absolute",
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
  shimmerContainer: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 25,
    borderWidth: 0.3,
    borderColor: "#00B5FF",
    overflow: "hidden",
    zIndex: 3,
  },
  gradientContainer: {
    width: "100%",
    height: "100%",
    opacity: 0.6,
  },
  shimmerImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  image: {
    width: "90%",
    height: "90%",
    zIndex: 2,
  },
});
