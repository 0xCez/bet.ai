import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, borderRadius, typography, glass } from "../../constants/designTokens";
import { getNBATeamLogo, getSoccerTeamLogo } from "../../utils/teamLogos";
import { CachedGame } from "./CachedGameCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6]; // 24px on each side
export const HERO_CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;
export const HERO_CARD_MARGIN = 0; // No margin - padding handles spacing

interface HeroGameCardProps {
  game: CachedGame;
  onPress: (game: CachedGame) => void;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatPill: React.FC<{
  label: string;
  value: string | number;
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <View style={[styles.statPill, highlight && styles.statPillHighlight]}>
    <Text style={styles.statPillValue}>{value}</Text>
    <Text style={styles.statPillLabel}>{label}</Text>
  </View>
);

const ConfidenceBar: React.FC<{
  value: number;
  color: string;
}> = ({ value, color }) => {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: value,
      duration: 800,
      delay: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value]);

  const widthInterpolate = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.confidenceBarContainer}>
      <View style={styles.confidenceBarTrack}>
        <Animated.View
          style={[
            styles.confidenceBarFill,
            {
              width: widthInterpolate,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

const getSportColor = (sport: string): string => {
  switch (sport) {
    case "nba":
      return "#FF6B35";
    case "soccer":
      return "#4CAF50";
    default:
      return colors.primary;
  }
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return colors.success;
  if (confidence >= 60) return colors.primary;
  return colors.mutedForeground;
};

const getTeamLogo = (teamName: string, sport: string) => {
  if (sport === "nba") {
    return getNBATeamLogo(teamName);
  }
  return getSoccerTeamLogo(teamName);
};

// Format game start time (e.g., "Today 7:30 PM", "Sat 3:00 PM")
const formatGameTime = (isoString?: string): string | null => {
  if (!isoString) return null;

  const gameDate = new Date(isoString);
  const now = new Date();

  // Check if today
  const isToday = gameDate.toDateString() === now.toDateString();

  // Check if tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = gameDate.toDateString() === tomorrow.toDateString();

  // Format time (e.g., "7:30 PM")
  const timeStr = gameDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;

  // Format as "Sat 3:00 PM"
  const dayStr = gameDate.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayStr} ${timeStr}`;
};

// Format decimal odds to American odds
const formatOdds = (decimalOdds?: number): string => {
  if (!decimalOdds) return "-110";
  if (decimalOdds >= 2.0) {
    return `+${Math.round((decimalOdds - 1) * 100)}`;
  } else {
    return `-${Math.round(100 / (decimalOdds - 1))}`;
  }
};

// Get short team name (e.g., "Los Angeles Lakers" -> "Lakers")
const getShortTeamName = (name: string): string => {
  if (!name) return "";
  const parts = name.split(" ");
  return parts[parts.length - 1];
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const HeroGameCard: React.FC<HeroGameCardProps> = ({ game, onPress }) => {
  // Get Win Probability from marketConsensus display (e.g., "61% Los Angeles Lakers" -> 61)
  // This is the market-implied win probability calculated from the odds
  const marketConsensusDisplay = game.analysis?.keyInsightsNew?.marketConsensus?.display;
  const extractedConfidence = marketConsensusDisplay ? parseInt(marketConsensusDisplay.match(/(\d+)%/)?.[1] || '0', 10) : null;
  const confidence = game.confidence || extractedConfidence || 75;
  const confidenceColor = getConfidenceColor(confidence);
  const sportColor = getSportColor(game.sport);

  // Get Edge % from aiAnalysis (GPT-4 generated betting edge percentage)
  const rawEdge = game.analysis?.aiAnalysis?.confidenceScore;
  const edge = rawEdge ? (typeof rawEdge === 'string' ? parseFloat(rawEdge) : rawEdge) : null;

  // Extract AI Pick / Best Value
  const bestValue = game.analysis?.keyInsightsNew?.bestValue;
  const aiPick = bestValue?.display || null;

  // Extract Key Edge / Market Consensus
  const marketConsensus = game.analysis?.keyInsightsNew?.marketConsensus;
  const keyEdge = marketConsensus?.display || null;

  // Extract Best Lines from marketIntelligence
  const bestLines = game.analysis?.marketIntelligence?.bestLines;
  const spread = bestLines?.consensusSpreadPoint;
  const total = bestLines?.consensusTotal;
  const homeML = bestLines?.consensusHomeML;
  const awayML = bestLines?.consensusAwayML;

  // For soccer, use fractional odds if available
  const isSoccer = game.sport === "soccer";
  const homeMLDisplay = isSoccer
    ? bestLines?.consensusHomeMLFractional
    : (homeML ? formatOdds(homeML) : null);
  const awayMLDisplay = isSoccer
    ? bestLines?.consensusAwayMLFractional
    : (awayML ? formatOdds(awayML) : null);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(game);
  };

  const team1Logo = getTeamLogo(game.team1, game.sport);
  const team2Logo = getTeamLogo(game.team2, game.sport);
  const team1Short = getShortTeamName(game.team1);
  const team2Short = getShortTeamName(game.team2);
  const gameTime = formatGameTime(game.gameStartTime);

  return (
    <View style={styles.card}>
      {/* Glass Background */}
      <BlurView
        intensity={glass.card.blurIntensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />

      {/* Content Container */}
      <View style={styles.content}>
        {/* Header: Sport Badge + Game Time */}
        <View style={styles.header}>
          <View style={[styles.sportBadge, { borderColor: `${sportColor}40` }]}>
            <Ionicons name={getSportIcon(game.sport)} size={12} color={sportColor} />
            <Text style={[styles.sportLabel, { color: sportColor }]}>
              {game.sport.toUpperCase()}
            </Text>
          </View>
          {gameTime && (
            <View style={styles.gameTimeBadge}>
              <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
              <Text style={styles.gameTimeText}>{gameTime}</Text>
            </View>
          )}
        </View>

        {/* Hero Teams Section */}
        <View style={styles.teamsSection}>
          {/* Team 1 */}
          <View style={styles.teamColumn}>
            <View style={styles.logoWrapper}>
              <Image source={team1Logo} style={styles.teamLogo} contentFit="contain" />
            </View>
            <Text style={styles.teamName} numberOfLines={1}>{team1Short}</Text>
            {homeMLDisplay && (
              <View style={styles.oddsChip}>
                <Text style={styles.oddsText}>{homeMLDisplay}</Text>
              </View>
            )}
          </View>

          {/* VS Divider */}
          <View style={styles.vsDivider}>
            <View style={styles.vsCircle}>
              <Text style={styles.vsText}>VS</Text>
            </View>
          </View>

          {/* Team 2 */}
          <View style={styles.teamColumn}>
            <View style={styles.logoWrapper}>
              <Image source={team2Logo} style={styles.teamLogo} contentFit="contain" />
            </View>
            <Text style={styles.teamName} numberOfLines={1}>{team2Short}</Text>
            {awayMLDisplay && (
              <View style={styles.oddsChip}>
                <Text style={styles.oddsText}>{awayMLDisplay}</Text>
              </View>
            )}
          </View>
        </View>

        {/* AI Pick Banner */}
        {aiPick && (
          <LinearGradient
            colors={[`${colors.primary}20`, `${colors.primary}05`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.aiPickBanner}
          >
            <View style={styles.aiPickIcon}>
              <Ionicons name="sparkles" size={14} color={colors.primary} />
            </View>
            <View style={styles.aiPickContent}>
              <Text style={styles.aiPickLabel}>AI RECOMMENDATION</Text>
              <Text style={styles.aiPickText} numberOfLines={1}>{aiPick}</Text>
            </View>
          </LinearGradient>
        )}

        {/* Stats Pills Row */}
        <View style={styles.statsPillsRow}>
          {!isSoccer && spread != null && (
            <StatPill label="Spread" value={spread > 0 ? `+${spread}` : spread} highlight />
          )}
          {!isSoccer && total != null && (
            <StatPill label="O/U" value={total} />
          )}
          {isSoccer && (
            <StatPill label="Match" value={game.league || "Soccer"} />
          )}
          {edge != null && (
            <StatPill label="Edge" value={`${edge}%`} highlight={edge >= 5} />
          )}
        </View>

        {/* Key Edge Insight */}
        {keyEdge && (
          <View style={styles.keyEdgeRow}>
            <Ionicons name="trending-up" size={14} color={colors.success} />
            <Text style={styles.keyEdgeText} numberOfLines={1}>{keyEdge}</Text>
          </View>
        )}

        {/* Confidence Progress Section */}
        <View style={styles.confidenceSection}>
          <View style={styles.confidenceHeader}>
            <Text style={styles.confidenceLabel}>AI Confidence</Text>
            <Text style={[styles.confidenceValue, { color: confidenceColor }]}>
              {confidence}%
            </Text>
          </View>
          <ConfidenceBar value={confidence} color={confidenceColor} />
        </View>

        {/* CTA Footer */}
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.ctaFooter,
            pressed && styles.ctaPressed,
          ]}
        >
          <Text style={styles.ctaText}>View Full Analysis</Text>
          <View style={styles.ctaArrow}>
            <Ionicons name="arrow-forward" size={16} color={colors.background} />
          </View>
        </Pressable>
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  card: {
    width: HERO_CARD_WIDTH,
    marginHorizontal: HERO_CARD_MARGIN,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: glass.card.backgroundColor,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
    // Glow effect
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  content: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[5],
    gap: spacing[3],
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing[2],
  },
  gameTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  gameTimeText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  sportBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  sportLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1,
  },
  // Teams Section
  teamsSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamColumn: {
    flex: 1,
    alignItems: "center",
    gap: spacing[2],
  },
  logoWrapper: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  teamLogo: {
    width: 56,
    height: 56,
  },
  teamName: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    textAlign: "center",
  },
  oddsChip: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  oddsText: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
  // VS Divider
  vsDivider: {
    paddingHorizontal: spacing[2],
    alignItems: "center",
  },
  vsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.rgba.white10,
  },
  vsText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
  },
  // AI Pick Banner
  aiPickBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  aiPickIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.rgba.primary15,
    alignItems: "center",
    justifyContent: "center",
  },
  aiPickContent: {
    flex: 1,
  },
  aiPickLabel: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1,
    marginBottom: 2,
  },
  aiPickText: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  // Stats Pills Row
  statsPillsRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  statPill: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    alignItems: "center",
  },
  statPillHighlight: {
    backgroundColor: colors.rgba.primary15,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  statPillValue: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statPillLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  // Key Edge
  keyEdgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  keyEdgeText: {
    flex: 1,
    color: colors.success,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  // Confidence Section
  confidenceSection: {
    gap: spacing[2],
  },
  confidenceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  confidenceLabel: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  confidenceValue: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
  },
  confidenceBarContainer: {
    height: 6,
  },
  confidenceBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.secondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  confidenceBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  // CTA Footer
  ctaFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.primary,
    paddingVertical: spacing[2] + 2,
    borderRadius: borderRadius.lg,
  },
  ctaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    color: colors.background,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
  ctaArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default HeroGameCard;
