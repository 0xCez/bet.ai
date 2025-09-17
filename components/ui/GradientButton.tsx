import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type ColorArray = readonly [string, string, ...string[]];

interface GradientButtonProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  children?: React.ReactNode;
  borderRadius?: number;
  height?: number;
  colors?: ColorArray;
}

const DEFAULT_COLORS: ColorArray = ["#00A7CC", "#009EDB", "#01A7CC"];

export function GradientButton({
  containerStyle,
  textStyle,
  children,
  borderRadius = 100,
  height = 55,
  colors = DEFAULT_COLORS,
  ...props
}: GradientButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, { borderRadius, height }, containerStyle]}
      activeOpacity={0.8}
      {...props}
    >
      <LinearGradient
        colors={colors}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        locations={[0.01, 0.45, 0.95]}
      >
        <View style={styles.contentContainer}>
          {typeof children === "string" ? (
            <Text style={[styles.buttonText, textStyle]}>{children}</Text>
          ) : (
            children
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    overflow: "hidden",
    marginVertical: 0,
  },
  gradient: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 20,
    fontFamily: "Aeonik-Medium",
  },
});
