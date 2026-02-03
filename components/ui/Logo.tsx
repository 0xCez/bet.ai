import React from "react";
import { StyleSheet, View, ViewStyle, ImageStyle } from "react-native";
import { Image } from "expo-image";

interface LogoProps {
  size?: "small" | "medium" | "large";
  containerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
}

const SIZES = {
  small: {
    width: 69,
    height: 69,
  },
  medium: {
    width: 86,
    height: 86,
  },
  large: {
    width: 121,
    height: 121,
  },
};

export function Logo({
  size = "medium",
  containerStyle,
  imageStyle,
}: LogoProps) {
  const sizeStyles = SIZES[size];

  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={require("../../assets/images/soloBlogo.svg")}
        style={[styles.image, sizeStyles, imageStyle]}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: 86,
    height: 86,
  },
});
