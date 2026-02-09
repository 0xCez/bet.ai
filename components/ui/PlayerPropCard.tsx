import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
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
  playerStats?: {
    pointsPerGame?: number;
    reboundsPerGame?: number;
    assistsPerGame?: number;
    stealsPerGame?: number;
    blocksPerGame?: number;
    fgPct?: number;
    fg3Pct?: number;
    minutesPerGame?: number;
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
  bestConfidenceTier: "high" | "medium" | "low";
  playerStats?: {
    pointsPerGame?: number;
    reboundsPerGame?: number;
    assistsPerGame?: number;
    stealsPerGame?: number;
    blocksPerGame?: number;
    fgPct?: number;
    fg3Pct?: number;
    minutesPerGame?: number;
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

// Format stat type for display
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

// Get the relevant L10 average for a given stat type
const getRelevantAvg = (
  statType: string,
  stats?: PlayerWithProps["playerStats"]
): string | null => {
  if (!stats) return null;
  const st = statType.toLowerCase();
  if (st === "points" && stats.pointsPerGame != null) return `Avg ${stats.pointsPerGame}`;
  if (st === "rebounds" && stats.reboundsPerGame != null) return `Avg ${stats.reboundsPerGame}`;
  if (st === "assists" && stats.assistsPerGame != null) return `Avg ${stats.assistsPerGame}`;
  if (st === "steals" && stats.stealsPerGame != null) return `Avg ${stats.stealsPerGame}`;
  if (st === "blocks" && stats.blocksPerGame != null) return `Avg ${stats.blocksPerGame}`;
  if (st === "three_pointers_made" || st === "threes") {
    // No direct 3PM avg in stats, skip
    return null;
  }
  // Combo props: show the summed averages
  if (st === "pts_rebs_asts" || st === "points+rebounds+assists") {
    const sum = (stats.pointsPerGame || 0) + (stats.reboundsPerGame || 0) + (stats.assistsPerGame || 0);
    return sum > 0 ? `Avg ${sum.toFixed(1)}` : null;
  }
  if (st === "points+rebounds") {
    const sum = (stats.pointsPerGame || 0) + (stats.reboundsPerGame || 0);
    return sum > 0 ? `Avg ${sum.toFixed(1)}` : null;
  }
  if (st === "points+assists") {
    const sum = (stats.pointsPerGame || 0) + (stats.assistsPerGame || 0);
    return sum > 0 ? `Avg ${sum.toFixed(1)}` : null;
  }
  if (st === "rebounds+assists") {
    const sum = (stats.reboundsPerGame || 0) + (stats.assistsPerGame || 0);
    return sum > 0 ? `Avg ${sum.toFixed(1)}` : null;
  }
  return null;
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

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(player);
  };

  // Extract player stats (from player-level or first prop)
  const stats = player.playerStats || player.props[0]?.playerStats;

  return (
    <View style={styles.card}>
      <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />

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

        {/* Player Hero Section - bigger image + name + stats row */}
        <View style={styles.playerHero}>
          {playerImage ? (
            <Image source={playerImage} style={styles.playerAvatarImage} />
          ) : (
            <View style={styles.playerAvatar}>
              <Text style={styles.playerInitials}>{getPlayerInitials(playerName)}</Text>
            </View>
          )}
          <View style={styles.playerMeta}>
            <Text style={styles.playerName} numberOfLines={1}>
              {playerName}
            </Text>
            <Text style={styles.playerTeam}>
              {player.team || "Team"} vs {opponent}
            </Text>
            {/* Inline stat chips under the name */}
            {stats && (stats.pointsPerGame || stats.reboundsPerGame || stats.assistsPerGame) && (
              <View style={styles.statChipsRow}>
                {stats.pointsPerGame != null && (
                  <View style={styles.statChip}>
                    <Text style={styles.statChipValue}>{stats.pointsPerGame}</Text>
                    <Text style={styles.statChipLabel}> PPG</Text>
                  </View>
                )}
                {stats.reboundsPerGame != null && (
                  <View style={styles.statChip}>
                    <Text style={styles.statChipValue}>{stats.reboundsPerGame}</Text>
                    <Text style={styles.statChipLabel}> RPG</Text>
                  </View>
                )}
                {stats.assistsPerGame != null && (
                  <View style={styles.statChip}>
                    <Text style={styles.statChipValue}>{stats.assistsPerGame}</Text>
                    <Text style={styles.statChipLabel}> APG</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ML Props Section */}
        <View style={styles.propsContainer}>
          <View style={styles.propsHeader}>
            <View style={styles.propsIconWrapper}>
              <Ionicons name="trending-up" size={14} color={colors.success} />
            </View>
            <Text style={styles.propsLabel}>ML PREDICTIONS</Text>
          </View>

          <View style={styles.propsList}>
            {player.props.map((prop, index) => {
              const predictionLower = (prop.prediction || "").toLowerCase();
              const isOver = predictionLower === "over";

              const probability = isOver
                ? prop.probabilityOver || prop.probability_over
                : prop.probabilityUnder || prop.probability_under;

              const probabilityPercent =
                typeof probability === "number"
                  ? `${(probability * 100).toFixed(0)}%`
                  : prop.probabilityOverPercent || prop.probabilityUnderPercent || "0%";

              const probValue = typeof probability === "number" ? probability : 0;
              const isStrong = probValue >= 0.65;
              const pillBg = isStrong ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 184, 0, 0.2)";
              const pillText = isStrong ? colors.success : "#FFB800";

              // Relevant L10 average for context
              const relevantAvg = getRelevantAvg(prop.statType, stats);

              return (
                <View key={index} style={styles.propCard}>
                  <View style={styles.propCardLeft}>
                    <Text style={styles.propStatType}>{formatStatType(prop.statType)}</Text>
                    <View style={styles.propDetailsRow}>
                      <Text style={styles.propDirection}>
                        {isOver ? "▲" : "▼"} {isOver ? "Over" : "Under"} {prop.line}
                      </Text>
                      {relevantAvg && (
                        <Text style={styles.propAvg}>{relevantAvg}</Text>
                      )}
                    </View>
                  </View>
                  <View style={[styles.propProbPill, { backgroundColor: pillBg }]}>
                    <Text style={[styles.propProbText, { color: pillText }]}>{probabilityPercent}</Text>
                  </View>
                </View>
              );
            })}
          </View>
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
        <View style={styles.header}>
          <View style={[styles.skeleton, { width: 60, height: 24 }]} />
          <View style={[styles.skeleton, { width: 100, height: 16 }]} />
        </View>
        <View style={styles.playerHero}>
          <View style={[styles.skeleton, styles.skeletonAvatar]} />
          <View style={styles.playerMeta}>
            <View style={[styles.skeleton, { width: 150, height: 20, marginBottom: 6 }]} />
            <View style={[styles.skeleton, { width: 120, height: 14 }]} />
          </View>
        </View>
        <View style={[styles.skeleton, { width: "100%", height: 120, borderRadius: borderRadius.lg }]} />
        <View style={[styles.skeleton, { width: "100%", height: 44, borderRadius: borderRadius.lg }]} />
      </View>
    </View>
  );
};

const AVATAR_SIZE = 80;

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
  // Player Hero
  playerHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  playerAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.rgba.primary30,
  },
  playerAvatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.rgba.primary30,
    backgroundColor: colors.secondary,
  },
  playerInitials: {
    fontSize: 28,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  playerMeta: {
    flex: 1,
    gap: 2,
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
  },
  // Stat chips (PPG / RPG / APG) under player name
  statChipsRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: 6,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  statChipValue: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statChipLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  // Props Container
  propsContainer: {
    backgroundColor: "rgba(34, 197, 94, 0.06)",
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.15)",
    gap: spacing[2],
  },
  propsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  propsIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  propsLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1,
    color: colors.success,
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
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2] + 2,
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
  propDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  propDirection: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  propAvg: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
    opacity: 0.8,
  },
  propProbPill: {
    paddingHorizontal: spacing[2] + 4,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  propProbText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
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
  // Skeleton
  skeleton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
  },
  skeletonAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
});

export default PlayerPropCard;
