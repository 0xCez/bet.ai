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
import { colors, shadows, borderRadius as radii, typography } from "../../constants/designTokens";

interface GradientButtonProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  children?: React.ReactNode;
  borderRadius?: number;
  height?: number;
  variant?: 'primary' | 'pill';
}

export function GradientButton({
  containerStyle,
  textStyle,
  children,
  borderRadius = radii.lg,
  height = 55,
  variant = 'primary',
  disabled,
  onPress,
  ...props
}: GradientButtonProps) {
  // Use pill style border radius if variant is pill
  const finalBorderRadius = variant === 'pill' ? radii.full : borderRadius;

  const handlePress = (e: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        shadows.buttonGlow,
        { borderRadius: finalBorderRadius, height },
        disabled && styles.buttonDisabled,
        containerStyle,
      ]}
      activeOpacity={0.9}
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
    backgroundColor: colors.primary, // Solid cyan #00D7D7
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
    fontWeight: "600",
    color: colors.primaryForeground, // Dark text #0D0F14
    textAlign: "center",
    lineHeight: 20,
    fontFamily: typography.fontFamily.semibold,
  },
});
