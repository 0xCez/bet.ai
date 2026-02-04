import React, { useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import { colors, spacing, borderRadius, typography, glass, shimmerColors } from "../../constants/designTokens";
import { getNBATeamLogo, getSoccerTeamLogo } from "../../utils/teamLogos";
import { CachedGame } from "./CachedGameCard";

// Create shimmer placeholder component
const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6];
export const HERO_CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;
export const HERO_CARD_MARGIN = 0;

interface HeroGameCardProps {
  game: CachedGame;
  onPress: (game: CachedGame) => void;
}

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

const formatGameTime = (isoString?: string): string | null => {
  if (!isoString) return null;

  const gameDate = new Date(isoString);
  const now = new Date();

  const isToday = gameDate.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = gameDate.toDateString() === tomorrow.toDateString();

  const timeStr = gameDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tomorrow ${timeStr}`;

  const dayStr = gameDate.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayStr} ${timeStr}`;
};

// ============================================================================
// ANIMATED CONFIDENCE BAR
// ============================================================================

const ConfidenceBar: React.FC<{ value: number; color: string }> = ({ value, color }) => {
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
            { width: widthInterpolate, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
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

  // ML Player Props (NBA only)
  const mlProps = game.analysis?.mlPlayerProps?.topProps || [];
  const hasProps = mlProps.length > 0;

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
              <View style={styles.aiPickRow}>
                <View style={styles.aiPickTeamContainer}>
                  <Text style={styles.aiPickTeam}>{aiPick}</Text>
                  {/* Best Odds */}
                  {(homeMLDisplay || awayMLDisplay) && (
                    <Text style={styles.aiPickOdds}>
                      Best ML: {homeMLDisplay || awayMLDisplay}
                    </Text>
                  )}
                </View>
                <View style={styles.aiPickConfidenceBadge}>
                  <Text style={[styles.aiPickConfidenceText, { color: confidenceColor }]}>
                    {confidence}%
                  </Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        )}

        {/* ML Player Props Banner - NBA Only */}
        {hasProps && (
          <View style={styles.propsContainer}>
            <View style={styles.propsHeader}>
              <View style={styles.propsIconWrapper}>
                <Ionicons name="trending-up" size={16} color={colors.success} />
              </View>
              <Text style={styles.propsLabel}>TOP PLAYER PROPS</Text>
            </View>

            <View style={styles.propsList}>
              {mlProps.slice(0, 3).map((prop, index) => {
                // Show the PROBABILITY (not confidence)
                const probability = prop.prediction === 'over'
                  ? prop.probabilityOver || prop.probability_over
                  : prop.probabilityUnder || prop.probability_under;

                const probabilityPercent = typeof probability === 'number'
                  ? `${(probability * 100).toFixed(0)}%`
                  : (prop.probabilityOverPercent || prop.probabilityUnderPercent || '0%');

                return (
                  <View key={index} style={styles.propCard}>
                    <View style={styles.propCardLeft}>
                      <Text style={styles.propPlayerName} numberOfLines={1}>
                        {prop.playerName}
                      </Text>
                      <Text style={styles.propDetails}>
                        {prop.statType.replace('_', ' ').toUpperCase()} {prop.prediction === 'over' ? '▲' : '▼'} {prop.line}
                      </Text>
                    </View>
                    <View style={styles.propProbabilityPill}>
                      <Text style={styles.propProbability}>{probabilityPercent}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

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
// SKELETON LOADING COMPONENT
// ============================================================================

export const HeroGameCardSkeleton: React.FC = () => {
  const shimmerColorsArray = shimmerColors as unknown as string[];

  return (
    <View style={styles.card}>
      <BlurView
        intensity={glass.card.blurIntensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        {/* Header Skeleton */}
        <View style={styles.header}>
          <ShimmerPlaceholder
            shimmerColors={shimmerColorsArray}
            style={{ width: 80, height: 24, borderRadius: borderRadius.full }}
          />
          <ShimmerPlaceholder
            shimmerColors={shimmerColorsArray}
            style={{ width: 100, height: 16, borderRadius: borderRadius.md }}
          />
        </View>

        {/* Teams Skeleton */}
        <View style={styles.teamsSection}>
          <View style={styles.teamColumn}>
            <ShimmerPlaceholder
              shimmerColors={shimmerColorsArray}
              style={{ width: 64, height: 64, borderRadius: borderRadius.lg }}
            />
            <ShimmerPlaceholder
              shimmerColors={shimmerColorsArray}
              style={{ width: 80, height: 16, borderRadius: borderRadius.md }}
            />
          </View>
          <View style={styles.vsDivider}>
            <ShimmerPlaceholder
              shimmerColors={shimmerColorsArray}
              style={{ width: 32, height: 32, borderRadius: 16 }}
            />
          </View>
          <View style={styles.teamColumn}>
            <ShimmerPlaceholder
              shimmerColors={shimmerColorsArray}
              style={{ width: 64, height: 64, borderRadius: borderRadius.lg }}
            />
            <ShimmerPlaceholder
              shimmerColors={shimmerColorsArray}
              style={{ width: 80, height: 16, borderRadius: borderRadius.md }}
            />
          </View>
        </View>

        {/* Prediction Skeleton */}
        <ShimmerPlaceholder
          shimmerColors={shimmerColorsArray}
          style={{ width: '100%', height: 120, borderRadius: borderRadius.lg, marginBottom: spacing[4] }}
        />

        {/* CTA Skeleton */}
        <ShimmerPlaceholder
          shimmerColors={shimmerColorsArray}
          style={{ width: '100%', height: 48, borderRadius: borderRadius.lg }}
        />
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
    paddingTop: spacing[3],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    gap: spacing[2] + 2,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  gameTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  gameTimeText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
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
    gap: spacing[1],
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
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  aiPickIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.rgba.primary15,
    alignItems: "center",
    justifyContent: "center",
  },
  aiPickContent: {
    flex: 1,
    gap: spacing[1],
  },
  aiPickLabel: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1,
  },
  aiPickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  aiPickTeamContainer: {
    flex: 1,
  },
  aiPickTeam: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    marginBottom: 2,
  },
  aiPickOdds: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  aiPickConfidenceBadge: {
    backgroundColor: colors.rgba.primary15,
    paddingHorizontal: spacing[2] + 4,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  aiPickConfidenceText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
  // Props Container
  propsContainer: {
    backgroundColor: "rgba(76, 175, 80, 0.08)",
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: "rgba(76, 175, 80, 0.2)",
    gap: spacing[2],
  },
  propsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  propsIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.rgba.success15,
    alignItems: "center",
    justifyContent: "center",
  },
  propsLabel: {
    color: colors.success,
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1,
  },
  propsList: {
    gap: spacing[1] + 2,
  },
  propCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: borderRadius.md,
    padding: spacing[2],
    gap: spacing[2],
  },
  propCardLeft: {
    flex: 1,
  },
  propPlayerName: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    marginBottom: 2,
  },
  propDetails: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  propProbabilityPill: {
    backgroundColor: "rgba(76, 175, 80, 0.25)",
    paddingHorizontal: spacing[2] + 4,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  propProbability: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
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
