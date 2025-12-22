import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Card data - alternating left and right positions
const cardsData = [
  { label: "Recent performances", icon: "trophy", iconColor: "#F59E0B", iconBg: "#F59E0B20", side: "left" },
  { label: "Head-to-Head", icon: "flash", iconColor: "#22D3EE", iconBg: "#22D3EE20", side: "right" },
  { label: "Momentum Indicator", icon: "flame", iconColor: "#F97316", iconBg: "#F9731620", side: "left" },
  { label: "External Conditions", icon: "location", iconColor: "#8B5CF6", iconBg: "#8B5CF620", side: "right" },
  { label: "Ref Impact", icon: "megaphone", iconColor: "#22C55E", iconBg: "#22C55E20", side: "left" },
  { label: "Health & Injuries", icon: "heart", iconColor: "#EF4444", iconBg: "#EF444420", side: "right" },
  { label: "Travel & Prep.", icon: "airplane", iconColor: "#94A3B8", iconBg: "#94A3B820", side: "left" },
];

interface AnimatedCardProps {
  label: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  side: "left" | "right";
  index: number;
  isActive: boolean;
}

function AnimatedCard({ label, icon, iconColor, iconBg, side, index, isActive }: AnimatedCardProps) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(side === "left" ? -60 : 60);
  const translateY = useSharedValue(20);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      translateX.value = side === "left" ? -60 : 60;
      translateY.value = 20;
      scale.value = 0.8;

      const delay = 150 + index * 120;

      opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateX.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 100 }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 100 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
    } else {
      opacity.value = 0;
      translateX.value = side === "left" ? -60 : 60;
      translateY.value = 20;
      scale.value = 0.8;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        side === "left" ? styles.cardLeft : styles.cardRight,
        { zIndex: side === "right" ? 10 : 1, marginTop: index === 0 ? 0 : -12 },
        animatedStyle,
      ]}
    >
      <View style={styles.card}>
        <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
          <Ionicons name={icon as any} size={22} color={iconColor} />
        </View>
        <Text style={styles.cardLabel}>{label}</Text>
      </View>
    </Animated.View>
  );
}

interface OnboardingSlide4VisualProps {
  isActive?: boolean;
}

export function OnboardingSlide4Visual({ isActive = false }: OnboardingSlide4VisualProps) {
  return (
    <View style={styles.container}>
      <View style={styles.cardsContainer}>
        {cardsData.map((card, index) => (
          <AnimatedCard
            key={index}
            label={card.label}
            icon={card.icon}
            iconColor={card.iconColor}
            iconBg={card.iconBg}
            side={card.side as "left" | "right"}
            index={index}
            isActive={isActive}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.50,
    alignItems: "center",
    justifyContent: "center",
  },
  cardsContainer: {
    width: SCREEN_WIDTH * 0.85,
  },
  cardWrapper: {
    width: "70%",
  },
  cardLeft: {
    alignSelf: "flex-start",
  },
  cardRight: {
    alignSelf: "flex-end",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.foreground,
    flex: 1,
  },
});

export default OnboardingSlide4Visual;
