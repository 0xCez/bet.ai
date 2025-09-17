import React from "react";
import { View, TouchableOpacity, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Logo } from "./Logo";
import { Image } from "expo-image";
interface TopBarProps {
  showBack?: boolean;
  title?: string;
}

export function TopBar({ showBack = true, title }: TopBarProps) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {showBack ? (
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Image
            source={require("../../assets/images/back.png")}
            style={styles.backIcon}
            contentFit="contain"
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.backButton} />
      )}

      <View style={styles.logoContainer}>
        {title ? (
          <Text style={styles.title}>{title}</Text>
        ) : (
          <Logo size="small" />
        )}
      </View>

      <View style={styles.rightPlaceholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  backIcon: {
    width: 48,
    height: 48,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    width: "100%",
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
  },
  logoContainer: {
    flex: 1,
    alignItems: "center",
  },
  rightPlaceholder: {
    width: 48,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Aeonik-Bold",
  },
});
