import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { HeroGamesCarousel } from "./HeroGamesCarousel";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientOrb } from "./GradientOrb";
import { FloatingParticles } from "./FloatingParticles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface DiscoverPageProps {
  maxGames?: number;
}

export const DiscoverPage: React.FC<DiscoverPageProps> = ({
  maxGames = 8,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { width: SCREEN_WIDTH }]}>
      {/* Background Effects */}
      <FloatingParticles verticalPosition={0.4} />
      <GradientOrb />

      {/* Content */}
      <View style={[
        styles.content,
        {
          paddingTop: insets.top + 80,
          paddingBottom: insets.bottom + 100, // Space for page indicator
        }
      ]}>
        <HeroGamesCarousel maxGames={maxGames} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

export default DiscoverPage;
