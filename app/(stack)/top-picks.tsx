import React from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography } from "../../constants/designTokens";
import { PicksView } from "../../components/ui/PicksView";

/**
 * Stack screen wrapper for PicksView — provides back button for deep-link navigation.
 * The main entry point is now the Picks tab in home.tsx; this exists for compat.
 */
export default function TopPicksScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.title}>Top Picks</Text>
        <View style={styles.backBtn} />
      </View>
      <PicksView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[4],
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...typography["2xl"],
    fontWeight: "700",
    color: colors.foreground,
  },
});
