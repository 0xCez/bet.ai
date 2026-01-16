import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

export interface CachedGame {
  id: string;
  sport: "nba" | "soccer";
  team1: string;
  team2: string;
  team1Id: string;
  team2Id: string;
  confidence?: number;
  league?: string;
  timestamp: string;
  analysis: any;
}

interface CachedGameCardProps {
  game: CachedGame;
  onPress: (game: CachedGame) => void;
}

const getSportIcon = (sport: string): keyof typeof Ionicons.glyphMap => {
  switch (sport) {
    case "nba":
      return "basketball";
    case "soccer":
      return "football";
    default:
      return "trophy";
  }
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return colors.success;
  if (confidence >= 60) return "#F59E0B"; // Amber
  return colors.mutedForeground;
};

// Get short team name (e.g., "Los Angeles Lakers" -> "Lakers")
const getShortTeamName = (name: string): string => {
  if (!name || name === "Team 1" || name === "Team 2") return name;

  // Common patterns: "City TeamName" -> "TeamName"
  const parts = name.split(" ");
  if (parts.length >= 2) {
    // Return last word (usually the team name)
    return parts[parts.length - 1];
  }
  return name;
};

export const CachedGameCard: React.FC<CachedGameCardProps> = ({ game, onPress }) => {
  // Get Win Probability from marketConsensus display (e.g., "61% Los Angeles Lakers" -> 61)
  // This is the market-implied win probability calculated from the odds
  const marketConsensusDisplay = game.analysis?.keyInsightsNew?.marketConsensus?.display;
  const extractedConfidence = marketConsensusDisplay ? parseInt(marketConsensusDisplay.match(/(\d+)%/)?.[1] || '0', 10) : null;
  const confidence = game.confidence || extractedConfidence || 75;
  const confidenceColor = getConfidenceColor(confidence);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(game);
  };

  const team1Short = getShortTeamName(game.team1);
  const team2Short = getShortTeamName(game.team2);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      {/* Sport indicator line */}
      <View style={[styles.sportIndicator, { backgroundColor: game.sport === "nba" ? "#FF6B35" : "#4CAF50" }]} />

      {/* Content */}
      <View style={styles.content}>
        {/* Teams */}
        <Text style={styles.teamName} numberOfLines={1}>{team1Short}</Text>
        <Text style={styles.vsText}>vs</Text>
        <Text style={styles.teamName} numberOfLines={1}>{team2Short}</Text>

        {/* Confidence */}
        <View style={styles.confidenceRow}>
          <Ionicons name={getSportIcon(game.sport)} size={12} color={colors.mutedForeground} />
          <Text style={[styles.confidenceText, { color: confidenceColor }]}>
            {confidence}%
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

const CARD_WIDTH = 100;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  sportIndicator: {
    height: 3,
    width: "100%",
  },
  content: {
    padding: spacing[3],
    alignItems: "center",
    gap: 2,
  },
  teamName: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    textAlign: "center",
  },
  vsText: {
    color: colors.mutedForeground,
    fontSize: 10,
    fontFamily: typography.fontFamily.regular,
  },
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing[1],
  },
  confidenceText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
});

export default CachedGameCard;
