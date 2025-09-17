import React from "react";
import { StyleSheet, View, ViewStyle, Image, ImageStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { RFValue } from "react-native-responsive-fontsize";

interface LogoProps {
  size?: "small" | "medium" | "large";
  containerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
}

const SIZES = {
  small: {
    width: 80,
    height: 32,
  },
  medium: {
    width: 90,
    height: 36,
  },
  large: {
    width: 150,
    height: 56,
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
        source={require("../../assets/images/logo.png")}
        style={[styles.image, sizeStyles, imageStyle]}
        resizeMode="contain"
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
    width: 100,
    height: 40,
  },
  title: {
    fontFamily: "Aeonik-Regular",
    fontSize: RFValue(24),
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  gradient: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  logo: {
    fontFamily: "Aeonik-Regular",
    fontSize: 30,
    color: "#FFFFFF",
    textAlign: "center",
  },
});
