import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, borderRadius, typography, glass } from "../../constants/designTokens";
import { getPlayerImage } from "../../utils/playerImages";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6];
export const PLAYER_CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

// Player prop data structure from ML predictions
export interface PlayerProp {
  playerName: string;
  team: string;
  statType: string;
  line: number;
  prediction: "over" | "under";
  probabilityOver?: number;
  probabilityUnder?: number;
  probability_over?: number;
  probability_under?: number;
  probabilityOverPercent?: string;
  probabilityUnderPercent?: string;
  confidence: number;
  confidencePercent?: string;
  confidenceTier?: "high" | "medium" | "low";
  bettingValue?: "high" | "medium" | "low";
  oddsOver?: number;
  oddsUnder?: number;
  gamesUsed?: number;
  // Player stats (if available from ML model)
  playerStats?: {
    pointsPerGame?: number;
    reboundsPerGame?: number;
    assistsPerGame?: number;
    stealsPerGame?: number;
    blocksPerGame?: number;
  };
}

// Enriched prop with game context
export interface EnrichedPlayerProp extends PlayerProp {
  gameId: string;
  sport: "nba" | "soccer";
  opponent: string;
  gameStartTime?: string;
}

// Player with all their props grouped
export interface PlayerWithProps {
  playerName: string;
  team: string;
  gameId: string;
  sport: "nba" | "soccer";
  opponent: string;
  gameStartTime?: string;
  props: EnrichedPlayerProp[];
  // Best confidence tier from all props
  bestConfidenceTier: "high" | "medium" | "low";
  // Player stats (if available)
  playerStats?: {
    pointsPerGame?: number;
    reboundsPerGame?: number;
    assistsPerGame?: number;
  };
}

interface PlayerPropCardProps {
  player: PlayerWithProps;
  onPress: (player: PlayerWithProps) => void;
}

// Get team abbreviation (e.g., "Los Angeles Lakers" -> "LAL")
const getTeamAbbreviation = (teamName?: string): string => {
  if (!teamName) return "TBD";
  const abbrevMap: { [key: string]: string } = {
    "Atlanta Hawks": "ATL",
    "Boston Celtics": "BOS",
    "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI",
    "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL",
    "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW",
    "Houston Rockets": "HOU",
    "Indiana Pacers": "IND",
    "LA Clippers": "LAC",
    "Los Angeles Clippers": "LAC",
    "Los Angeles Lakers": "LAL",
    "LA Lakers": "LAL",
    "Memphis Grizzlies": "MEM",
    "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN",
    "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK",
    "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI",
    "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS",
    "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
  };
  return abbrevMap[teamName] || teamName.substring(0, 3).toUpperCase();
};

// Format stat type for display (e.g., "points" -> "POINTS", "three_pointers_made" -> "3PT MADE")
const formatStatType = (statType: string): string => {
  const formatMap: { [key: string]: string } = {
    points: "POINTS",
    rebounds: "REBOUNDS",
    assists: "ASSISTS",
    steals: "STEALS",
    blocks: "BLOCKS",
    turnovers: "TURNOVERS",
    three_pointers_made: "3PT MADE",
    threes: "3PT MADE",
    pts_rebs_asts: "PTS+REB+AST",
    double_double: "DOUBLE-DOUBLE",
  };
  return formatMap[statType.toLowerCase()] || statType.replace(/_/g, " ").toUpperCase();
};

// Format game time
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

// Get player initials
const getPlayerInitials = (name?: string): string => {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

export const PlayerPropCard: React.FC<PlayerPropCardProps> = ({ player, onPress }) => {
  const gameTime = formatGameTime(player.gameStartTime);
  const teamAbbrev = getTeamAbbreviation(player.team);
  const playerName = player.playerName || "Unknown Player";
  const opponent = player.opponent || "TBD";
  const playerImage = getPlayerImage(playerName, teamAbbrev);

  // Best confidence tier for overall card styling
  const isHighConfidence = player.bestConfidenceTier === "high";
  const headerColor = isHighConfidence ? colors.success : "#FFB800";

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(player);
  };

  // Extract player stats if available (from first prop or playerStats)
  const stats = player.playerStats || player.props[0]?.playerStats;

  return (
    <View style={styles.card}>
      {/* Glass Background */}
      <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />

      {/* Content Container */}
      <View style={styles.content}>
        {/* Header: Team Badge + Game Time */}
        <View style={styles.header}>
          <View style={styles.teamBadge}>
            <Ionicons name="basketball" size={12} color="#FF6B35" />
            <Text style={styles.teamAbbrev}>{teamAbbrev}</Text>
          </View>
          {gameTime && (
            <View style={styles.gameTimeBadge}>
              <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
              <Text style={styles.gameTimeText}>{gameTime}</Text>
            </View>
          )}
        </View>

        {/* Player Section */}
        <View style={styles.playerSection}>
          {playerImage ? (
            <Image source={playerImage} style={styles.playerAvatarImage} />
          ) : (
            <View style={styles.playerAvatar}>
              <Text style={styles.playerInitials}>{getPlayerInitials(playerName)}</Text>
            </View>
          )}
          <View style={styles.playerInfo}>
            <Text style={styles.playerName} numberOfLines={1}>
              {playerName}
            </Text>
            <Text style={styles.playerTeam}>
              {player.team || "Team"} vs {opponent}
            </Text>
          </View>
        </View>

        {/* Player Stats Pills (if available) */}
        {stats && (stats.pointsPerGame || stats.reboundsPerGame || stats.assistsPerGame) && (
          <View style={styles.statsRow}>
            {stats.pointsPerGame !== undefined && (
              <View style={styles.statPill}>
                <Text style={styles.statValue}>{stats.pointsPerGame.toFixed(1)}</Text>
                <Text style={styles.statLabel}>PPG</Text>
              </View>
            )}
            {stats.reboundsPerGame !== undefined && (
              <View style={styles.statPill}>
                <Text style={styles.statValue}>{stats.reboundsPerGame.toFixed(1)}</Text>
                <Text style={styles.statLabel}>RPG</Text>
              </View>
            )}
            {stats.assistsPerGame !== undefined && (
              <View style={styles.statPill}>
                <Text style={styles.statValue}>{stats.assistsPerGame.toFixed(1)}</Text>
                <Text style={styles.statLabel}>APG</Text>
              </View>
            )}
          </View>
        )}

        {/* ML Props Section - Show ALL props for this player */}
        <View style={styles.propsContainer}>
          <View style={styles.propsHeader}>
            <View style={styles.propsIconWrapper}>
              <Ionicons name="trending-up" size={16} color={headerColor} />
            </View>
            <Text style={[styles.propsLabel, { color: headerColor }]}>ML PREDICTIONS</Text>
          </View>

          <View style={styles.propsList}>
            {player.props.map((prop, index) => {
              // Normalize prediction to lowercase for comparison
              const predictionLower = (prop.prediction || '').toLowerCase();
              const isOver = predictionLower === 'over';

              // Show the PROBABILITY for the predicted direction
              const probability = isOver
                ? prop.probabilityOver || prop.probability_over
                : prop.probabilityUnder || prop.probability_under;

              const probabilityPercent = typeof probability === 'number'
                ? `${(probability * 100).toFixed(0)}%`
                : (prop.probabilityOverPercent || prop.probabilityUnderPercent || '0%');

              // Color based on probability strength, not just tier
              const probValue = typeof probability === 'number' ? probability : 0;
              const isStrong = probValue >= 0.65;
              const pillColor = isStrong
                ? "rgba(76, 175, 80, 0.25)"
                : "rgba(255, 184, 0, 0.25)";
              const textColor = isStrong
                ? colors.success
                : "#FFB800";

              return (
                <View key={index} style={styles.propCard}>
                  <View style={styles.propCardLeft}>
                    <Text style={styles.propStatType}>
                      {formatStatType(prop.statType)}
                    </Text>
                    <Text style={styles.propDetails}>
                      {isOver ? '▲' : '▼'} {isOver ? 'Over' : 'Under'} {prop.line}
                    </Text>
                  </View>
                  <View style={[styles.propProbabilityPill, { backgroundColor: pillColor }]}>
                    <Text style={[styles.propProbability, { color: textColor }]}>{probabilityPercent}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Confidence & Games Used */}
        <View style={styles.confidenceRow}>
          <View style={[
            styles.tierBadge,
            {
              backgroundColor: isHighConfidence ? "rgba(76, 175, 80, 0.15)" : "rgba(255, 184, 0, 0.15)",
              borderColor: isHighConfidence ? "rgba(76, 175, 80, 0.3)" : "rgba(255, 184, 0, 0.3)"
            }
          ]}>
            <Ionicons
              name={isHighConfidence ? "checkmark-circle" : "alert-circle"}
              size={14}
              color={isHighConfidence ? colors.success : "#FFB800"}
            />
            <Text style={[styles.tierText, { color: isHighConfidence ? colors.success : "#FFB800" }]}>
              {isHighConfidence ? "High Confidence" : "Medium Confidence"}
            </Text>
          </View>
          {player.props[0]?.gamesUsed && (
            <Text style={styles.gamesUsedText}>Based on {player.props[0].gamesUsed} games</Text>
          )}
        </View>

        {/* CTA Footer */}
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.ctaFooter, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>View Game Analysis</Text>
          <View style={styles.ctaArrow}>
            <Ionicons name="arrow-forward" size={16} color={colors.background} />
          </View>
        </Pressable>
      </View>
    </View>
  );
};

// Skeleton Loading Component
export const PlayerPropCardSkeleton: React.FC = () => {
  return (
    <View style={styles.card}>
      <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        {/* Header Skeleton */}
        <View style={styles.header}>
          <View style={[styles.skeleton, { width: 60, height: 24 }]} />
          <View style={[styles.skeleton, { width: 100, height: 16 }]} />
        </View>

        {/* Player Section Skeleton */}
        <View style={styles.playerSection}>
          <View style={[styles.skeleton, styles.skeletonAvatar]} />
          <View style={styles.playerInfo}>
            <View style={[styles.skeleton, { width: 150, height: 20, marginBottom: 6 }]} />
            <View style={[styles.skeleton, { width: 120, height: 14 }]} />
          </View>
        </View>

        {/* Prop Banner Skeleton */}
        <View style={[styles.skeleton, { width: "100%", height: 90, borderRadius: borderRadius.lg }]} />

        {/* Confidence Row Skeleton */}
        <View style={styles.confidenceRow}>
          <View style={[styles.skeleton, { width: 140, height: 28 }]} />
        </View>

        {/* CTA Skeleton */}
        <View style={[styles.skeleton, { width: "100%", height: 44, borderRadius: borderRadius.lg }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: PLAYER_CARD_WIDTH,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: glass.card.backgroundColor,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
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
    gap: spacing[3],
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  teamBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.4)",
    backgroundColor: "rgba(255, 107, 53, 0.1)",
  },
  teamAbbrev: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: "#FF6B35",
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
  // Player Section
  playerSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  playerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.rgba.primary30,
  },
  playerAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.rgba.primary30,
    backgroundColor: colors.secondary,
  },
  playerInitials: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  playerTeam: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  // Confidence Row
  confidenceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  tierText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  gamesUsedText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
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
  // Stats Row
  statsRow: {
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
  statValue: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  // Props Container (Multiple Props)
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
    backgroundColor: colors.rgba.successBg,
    alignItems: "center",
    justifyContent: "center",
  },
  propsLabel: {
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
  propStatType: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    marginBottom: 2,
  },
  propProbabilityPill: {
    paddingHorizontal: spacing[2] + 4,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  propProbability: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
  propDetails: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  // Skeleton
  skeleton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
  },
  skeletonAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
});

export default PlayerPropCard;
