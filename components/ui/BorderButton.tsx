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
import { colors, borderRadius as radii, typography } from "../../constants/designTokens";

interface BorderButtonProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  borderColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  height?: number;
  children?: React.ReactNode;
}

export function BorderButton({
  containerStyle,
  textStyle,
  borderColor = colors.muted, // #272E3A
  backgroundColor = "transparent",
  borderRadius = radii.lg,
  borderWidth = 1,
  height = 58,
  children,
  disabled,
  ...props
}: BorderButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { borderRadius, borderWidth, borderColor, backgroundColor, height },
        disabled && styles.buttonDisabled,
        containerStyle,
      ]}
      activeOpacity={0.8}
      disabled={disabled}
      {...props}
    >
      <View style={styles.contentContainer}>
        {typeof children === "string" ? (
          <Text style={[styles.buttonText, textStyle]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    overflow: "hidden",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.foreground, // #F5F8FC - light text
    textAlign: "center",
    lineHeight: 20,
    fontFamily: typography.fontFamily.medium,
  },
});
