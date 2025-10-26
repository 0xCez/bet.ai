import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ScreenBackgroundProps {
  children: React.ReactNode;
  containerStyle?: ViewStyle;
  statusBarStyle?: "light" | "dark" | "auto";
}

export function ScreenBackground({
  children,
  containerStyle,
  statusBarStyle = "light",
}: Omit<ScreenBackgroundProps, 'backgroundImage' | 'imageStyle' | 'hideBg'>) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingTop: insets.top }, containerStyle]}
    >
      <StatusBar style={statusBarStyle} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
