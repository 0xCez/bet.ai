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
import * as Haptics from "expo-haptics";
import { colors, borderRadius as radii, typography } from "../../constants/designTokens";

interface BlackGradientButtonProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  children?: React.ReactNode;
  borderRadius?: number;
  height?: number;
}

export function BlackGradientButton({
  containerStyle,
  textStyle,
  children,
  borderRadius = radii.lg,
  height = 55,
  disabled,
  onPress,
  ...props
}: BlackGradientButtonProps) {
  const handlePress = (e: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { borderRadius, height },
        disabled && styles.buttonDisabled,
        containerStyle,
      ]}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={handlePress}
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
    marginVertical: 0,
    backgroundColor: colors.secondary, // #212733 - secondary surface
    borderWidth: 1,
    borderColor: colors.rgba.borderGlass, // rgba(39, 46, 58, 0.5)
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
