import React from "react";
import { View, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Logo } from "./Logo";
import { IconButton } from "./IconButton";
import { colors, spacing, typography } from "../../constants/designTokens";

interface TopBarProps {
  showBack?: boolean;
  title?: string;
  onBackPress?: () => void;
}

export function TopBar({ showBack = true, title, onBackPress }: TopBarProps) {
  const router = useRouter();

  const handleBackPress = onBackPress || (() => router.back());

  return (
    <View style={styles.container}>
      {showBack ? (
        <IconButton icon="chevron-back" onPress={handleBackPress} size={28} />
      ) : (
        <View style={styles.placeholder} />
      )}

      <View style={styles.logoContainer}>
        {title ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <Logo size="small" />
        )}
      </View>

      <View style={styles.placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    width: "100%",
  },
  placeholder: {
    width: 48,
    height: 48,
  },
  logoContainer: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
  },
});
