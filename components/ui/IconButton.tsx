import React from "react";
import { StyleSheet, Pressable, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, borderRadius } from "../../constants/designTokens";

type IconName = "menu" | "time-outline" | "chevron-back" | "close";

interface IconButtonProps {
  icon: IconName;
  onPress: () => void;
  size?: number;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  size = 24,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.2)",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
    backgroundColor: "rgba(22, 26, 34, 0.8)",
    borderColor: "rgba(0, 215, 215, 0.4)",
  },
});
