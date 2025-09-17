import React from "react";
import {
  View,
  Image,
  StyleSheet,
  ViewStyle,
  ImageSourcePropType,
  ImageStyle,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ScreenBackgroundProps {
  children: React.ReactNode;
  backgroundImage?: ImageSourcePropType;
  containerStyle?: ViewStyle;
  imageStyle?: ImageStyle;
  statusBarStyle?: "light" | "dark" | "auto";
  hideBg?: boolean;
}

export function ScreenBackground({
  children,
  backgroundImage = require("../../assets/images/bg4.png"),
  containerStyle,
  imageStyle,
  statusBarStyle = "light",
  hideBg = false,
}: ScreenBackgroundProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingTop: insets.top }, containerStyle]}
    >
      {!hideBg && (
        <Image
          source={backgroundImage}
          style={[styles.backgroundImage, imageStyle]}
        />
      )}
      <StatusBar style={statusBarStyle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0C0C0C", // Fallback color
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
});
