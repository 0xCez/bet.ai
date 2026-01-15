import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ImageSourcePropType,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, borderRadius, typography, shadows } from "../../constants/designTokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface NavTab {
  key: string;
  label: string;
  icon?: ImageSourcePropType;
  iconActive?: ImageSourcePropType;
}

interface HorizontalNavSelectorProps {
  activeTab: string;
  tabs: NavTab[];
  onTabChange: (tabKey: string) => void;
  disabled?: boolean;
}

// Individual tab item component with animations
const NavItem: React.FC<{
  tab: NavTab;
  isActive: boolean;
  onPress: () => void;
  disabled?: boolean;
}> = ({ tab, isActive, onPress, disabled }) => {
  const scale = useSharedValue(1);
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, { duration: 200 });
  }, [isActive]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      backgroundColor: interpolateColor(
        progress.value,
        [0, 1],
        ["transparent", colors.primary]
      ),
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      color: interpolateColor(
        progress.value,
        [0, 1],
        [colors.mutedForeground, colors.primaryForeground]
      ),
    };
  });

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[styles.navItem, animatedContainerStyle]}
    >
      {tab.icon && (
        <Image
          source={isActive && tab.iconActive ? tab.iconActive : tab.icon}
          style={[
            styles.navIcon,
            { tintColor: isActive ? colors.primaryForeground : colors.mutedForeground },
          ]}
        />
      )}
      <Animated.Text style={[styles.navLabel, animatedTextStyle]}>
        {tab.label}
      </Animated.Text>
    </AnimatedPressable>
  );
};

export const HorizontalNavSelector: React.FC<HorizontalNavSelectorProps> = ({
  activeTab,
  tabs,
  onTabChange,
  disabled,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const itemRefs = useRef<{ [key: string]: number }>({});

  // Scroll to active tab when it changes
  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.key === activeTab);
    if (activeIndex !== -1 && scrollViewRef.current) {
      // Calculate scroll position to center the active item
      const itemWidth = 90; // Approximate width
      const scrollX = Math.max(0, activeIndex * itemWidth - 100);
      scrollViewRef.current.scrollTo({ x: scrollX, animated: true });
    }
  }, [activeTab, tabs]);

  return (
    <View style={styles.container}>
      {/* Left fade gradient */}
      <LinearGradient
        colors={[colors.card, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fadeLeft}
        pointerEvents="none"
      />

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={90}
      >
        {tabs.map((tab) => (
          <NavItem
            key={tab.key}
            tab={tab}
            isActive={activeTab === tab.key}
            onPress={() => onTabChange(tab.key)}
            disabled={disabled}
          />
        ))}
      </ScrollView>

      {/* Right fade gradient */}
      <LinearGradient
        colors={["transparent", colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fadeRight}
        pointerEvents="none"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
    backgroundColor: colors.card,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.rgba.primary15,
    // Subtle glow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  scrollContent: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    gap: spacing[1],
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    minWidth: 80,
  },
  navIcon: {
    width: 18,
    height: 18,
    marginRight: spacing[1],
  },
  navLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  fadeLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 10,
    borderTopLeftRadius: borderRadius.full,
    borderBottomLeftRadius: borderRadius.full,
  },
  fadeRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 10,
    borderTopRightRadius: borderRadius.full,
    borderBottomRightRadius: borderRadius.full,
  },
});

export default HorizontalNavSelector;
