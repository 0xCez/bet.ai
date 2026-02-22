import React from "react";
import { View, StyleSheet } from "react-native";
import { ParlayBuilderContent } from "./ParlayBuilder";
import { CachedGame } from "./CachedGameCard";
import { colors, spacing } from "../../constants/designTokens";

interface BuilderViewProps {
  games: CachedGame[];
}

/**
 * Inline full-screen version of the Parlay Builder.
 * Same config → result flow as the ActionSheet modal, but rendered
 * directly inside the Builder tab (no sheet chrome).
 */
export const BuilderView: React.FC<BuilderViewProps> = ({ games }) => {
  return (
    <View style={styles.container}>
      <ParlayBuilderContent games={games} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing[2],
  },
});

export default BuilderView;
