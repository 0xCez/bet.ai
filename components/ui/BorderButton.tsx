import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from "react-native";

interface BorderButtonProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  borderColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  opacity?: number;
  children?: React.ReactNode;
}

export function BorderButton({
  containerStyle,
  textStyle,
  borderColor = "#4C4A4A",
  backgroundColor = "#101010",
  borderRadius = 100,
  borderWidth = 0.2,
  children,
  opacity = 1,
  ...props
}: BorderButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { borderColor, backgroundColor, borderRadius, borderWidth, opacity },
        containerStyle,
      ]}
      activeOpacity={0.8}
      {...props}
    >
      {typeof children === "string" ? (
        <Text style={[styles.buttonText, textStyle]}>{children}</Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    height: 60,
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
