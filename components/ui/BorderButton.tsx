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

interface BorderButtonProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  borderColor?: string;
  backgroundColor?: string;
  gradientColors?: ColorArray;
  borderRadius?: number;
  borderWidth?: number;
  opacity?: number;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  children?: React.ReactNode;
}

export function BorderButton({
  containerStyle,
  textStyle,
  borderColor = "#4C4A4A",
  backgroundColor = "#101010",
  gradientColors,
  borderRadius = 100,
  borderWidth = 0.2,
  children,
  opacity = 1,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
  ...props
}: BorderButtonProps) {
  // Calculate inner borderRadius to account for border width
  const innerBorderRadius = borderRadius - (borderWidth || 0);

  const buttonStyle = [
    styles.button,
    { borderRadius, borderWidth, borderColor, opacity },
    containerStyle,
  ];

  // Use the first gradient color as background to prevent dark line showing through
  const buttonBackgroundColor = gradientColors ? gradientColors[0] : backgroundColor;

  return (
    <TouchableOpacity
      style={[buttonStyle, { backgroundColor: buttonBackgroundColor }]}
      activeOpacity={0.8}
      {...props}
    >
      {gradientColors ? (
        <LinearGradient
          colors={gradientColors}
          style={[styles.gradient, { borderRadius: innerBorderRadius }]}
          start={start}
          end={end}
        >
          <View style={styles.contentContainer}>
            {typeof children === "string" ? (
              <Text style={[styles.buttonText, textStyle]}>{children}</Text>
            ) : (
              children
            )}
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.contentContainer, { backgroundColor, borderRadius: innerBorderRadius }]}>
          {typeof children === "string" ? (
            <Text style={[styles.buttonText, textStyle]}>{children}</Text>
          ) : (
            children
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    height: 60,
    overflow: "hidden",
  },
  gradient: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
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
