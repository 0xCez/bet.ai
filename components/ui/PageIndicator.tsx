import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { colors, spacing, typography, borderRadius } from "../../constants/designTokens";

interface PageIndicatorProps {
  activePage: number;
  onPageChange: (page: number) => void;
}

const pages = [
  { id: 0, label: "Picks", icon: "flame" as const },
  { id: 1, label: "Scan", icon: "scan" as const },
  { id: 2, label: "Props", icon: "person" as const },
];

export const PageIndicator: React.FC<PageIndicatorProps> = ({
  activePage,
  onPageChange,
}) => {
  const slideAnim = useRef(new Animated.Value(activePage)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activePage,
      useNativeDriver: true,
      tension: 300,
      friction: 30,
    }).start();
  }, [activePage]);

  const handlePress = (page: number) => {
    if (page !== activePage) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPageChange(page);
    }
  };

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, 108, 216], // Width of one tab + gap
  });

  return (
    <View style={styles.wrapper}>
      <BlurView
        intensity={40}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.container}>
        {/* Animated sliding pill background */}
        <Animated.View
          style={[
            styles.slidingPill,
            { transform: [{ translateX }] },
          ]}
        />

        {/* Tabs */}
        {pages.map((page) => (
          <Pressable
            key={page.id}
            onPress={() => handlePress(page.id)}
            style={styles.tab}
          >
            <Ionicons
              name={page.icon}
              size={16}
              color={activePage === page.id ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.label,
                activePage === page.id && styles.labelActive,
              ]}
            >
              {page.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const TAB_WIDTH = 100;
const TAB_GAP = 8;

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "center",
    borderRadius: borderRadius.full,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.rgba.white10,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
    gap: TAB_GAP,
  },
  slidingPill: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    width: TAB_WIDTH,
    backgroundColor: colors.rgba.primary15,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  tab: {
    width: TAB_WIDTH,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
  },
  label: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  labelActive: {
    color: colors.primary,
    fontFamily: typography.fontFamily.bold,
  },
});

export default PageIndicator;
