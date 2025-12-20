import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { colors, borderRadius as radii, glass, shadows } from "../../constants/designTokens";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'glass' | 'solid';
  withGlow?: boolean;
}

export function Card({
  children,
  style,
  variant = 'glass',
  withGlow = false,
}: CardProps) {
  if (variant === 'glass') {
    return (
      <View style={[
        styles.glassContainer,
        withGlow && shadows.cardGlow,
        style,
      ]}>
        <BlurView
          intensity={glass.card.blurIntensity}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassContent}>
          {children}
        </View>
      </View>
    );
  }

  // Solid variant (no blur)
  return (
    <View style={[
      styles.solidContainer,
      withGlow && shadows.cardGlow,
      style,
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  glassContainer: {
    borderRadius: radii.xl, // 16px
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)", // Subtle cyan border
    backgroundColor: glass.card.backgroundColor, // rgba(22, 26, 34, 0.8)
    overflow: "hidden",
  },
  glassContent: {
    flex: 1,
  },
  solidContainer: {
    borderRadius: radii.lg, // 12px
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)", // Subtle cyan border
    backgroundColor: colors.card, // #161A22
    overflow: "hidden",
  },
});
