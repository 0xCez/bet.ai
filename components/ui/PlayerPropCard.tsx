import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { colors, spacing, borderRadius, typography, glass } from "../../constants/designTokens";
import { getPlayerImage } from "../../utils/playerImages";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6];
export const PLAYER_CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

// Max props to show on card (prevents overflow)
const MAX_PROPS_SHOWN = 3;

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
  displayConfidence?: number;
  displayConfidencePercent?: string;
  oddsOver?: number;
  oddsUnder?: number;
  gamesUsed?: number;
  bookmakerOver?: string;
  bookmakerUnder?: string;
  hitRates?: {
    l10?: { over: number; total: number; pct: number };
    season?: { over: number; total: number; pct: number };
  };
  reasoning?: {
    trend?: number;
    consistency?: number;
    lineDifficulty?: number;
    l3vsL10Ratio?: number;
    minutesTrend?: number;
  };
  opponent?: string;
  opponentDefense?: {
    allowed?: number;
    rank?: number;
    stat?: string;
  } | null;
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

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

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

// Shorter stat names for card display
const formatStatType = (statType: string): string => {
  const formatMap: { [key: string]: string } = {
    points: "POINTS",
    rebounds: "REBOUNDS",
    assists: "ASSISTS",
    steals: "STEALS",
    blocks: "BLOCKS",
    turnovers: "TURNOVERS",
    three_pointers_made: "3PT MADE",
    threepointersmade: "3PT MADE",
    threes: "3PT MADE",
    "points+rebounds": "PTS+REB",
    "points+assists": "PTS+AST",
    "rebounds+assists": "REB+AST",
    "points+rebounds+assists": "PTS+REB+AST",
    "blocks+steals": "BLK+STL",
    pts_rebs_asts: "PTS+REB+AST",
    double_double: "DOUBLE-DOUBLE",
  };
  return formatMap[statType.toLowerCase()] || statType.replace(/[_+]/g, "+").toUpperCase();
};

// Get numerical L10 average for a stat type
const getAvgNumber = (
  statType: string,
  stats?: PlayerWithProps["playerStats"]
): number | null => {
  if (!stats) return null;
  const st = statType.toLowerCase();
  if (st === "points") return stats.pointsPerGame ?? null;
  if (st === "rebounds") return stats.reboundsPerGame ?? null;
  if (st === "assists") return stats.assistsPerGame ?? null;
  if (st === "steals") return stats.stealsPerGame ?? null;
  if (st === "blocks") return stats.blocksPerGame ?? null;
  if (st === "points+rebounds") {
    const sum = (stats.pointsPerGame || 0) + (stats.reboundsPerGame || 0);
    return sum > 0 ? parseFloat(sum.toFixed(1)) : null;
  }
  if (st === "points+assists") {
    const sum = (stats.pointsPerGame || 0) + (stats.assistsPerGame || 0);
    return sum > 0 ? parseFloat(sum.toFixed(1)) : null;
  }
  if (st === "rebounds+assists") {
    const sum = (stats.reboundsPerGame || 0) + (stats.assistsPerGame || 0);
    return sum > 0 ? parseFloat(sum.toFixed(1)) : null;
  }
  if (st === "points+rebounds+assists" || st === "pts_rebs_asts") {
    const sum = (stats.pointsPerGame || 0) + (stats.reboundsPerGame || 0) + (stats.assistsPerGame || 0);
    return sum > 0 ? parseFloat(sum.toFixed(1)) : null;
  }
  if (st === "blocks+steals") {
    const sum = (stats.blocksPerGame || 0) + (stats.stealsPerGame || 0);
    return sum > 0 ? parseFloat(sum.toFixed(1)) : null;
  }
  return null;
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

const getSuffix = (n: number): string => {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
};

const getPlayerInitials = (name?: string): string => {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

// ──────────────────────────────────────────────
// TAG BUILDER — color-coded support/contradict
// ──────────────────────────────────────────────

interface PropTag {
  text: string;
  supports: boolean; // true = supports prediction, false = contradicts
}

const buildPropTags = (
  prop: EnrichedPlayerProp,
  isOver: boolean
): PropTag[] => {
  const tags: PropTag[] = [];

  // Hit rate — show count in the PREDICTED direction
  // e.g. "6/10 hit Under" or "7/10 hit Over"
  const hr = prop.hitRates?.l10;
  if (hr && hr.total > 0) {
    const hitCount = isOver ? hr.over : hr.total - hr.over;
    const supports = isOver ? hr.pct >= 50 : hr.pct < 50;
    const dir = isOver ? "Over" : "Under";
    tags.push({ text: `${hitCount}/${hr.total} hit ${dir}`, supports });
  }

  // Opponent defense (rank 1-30: 1=best defense, 30=worst)
  // Show in plain English: "WAS 29th DEF" with color = supports/contradicts
  if (prop.opponentDefense?.rank && prop.opponent) {
    const abbrev = getTeamAbbreviation(prop.opponent);
    const rank = prop.opponentDefense.rank;
    // High rank = bad defense = allows more = favors Over
    const supports = isOver ? rank > 15 : rank <= 15;
    tags.push({
      text: `${abbrev} ${rank}${getSuffix(rank)} DEF`,
      supports,
    });
  }

  return tags;
};

// ──────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────

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

  const stats = player.playerStats || player.props[0]?.playerStats;
  const visibleProps = player.props.slice(0, MAX_PROPS_SHOWN);
  const extraCount = player.props.length - MAX_PROPS_SHOWN;

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

        {/* Player Hero Section */}
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

        {/* ML Props Section — Cheat Sheet */}
        <View style={styles.propsContainer}>
          <View style={styles.propsHeader}>
            <View style={styles.propsIconWrapper}>
              <Ionicons name="trending-up" size={14} color={colors.success} />
            </View>
            <Text style={styles.propsLabel}>ML PREDICTIONS</Text>
            <Text style={styles.propsCount}>{player.props.length} pick{player.props.length !== 1 ? "s" : ""}</Text>
          </View>

          <View style={styles.propsList}>
            {visibleProps.map((prop, index) => {
              const predictionLower = (prop.prediction || "").toLowerCase();
              const isOver = predictionLower === "over";

              // Calibrated + capped probability from backend
              const calibratedProb = prop.displayConfidence;
              const rawProb = isOver
                ? prop.probabilityOver || prop.probability_over
                : prop.probabilityUnder || prop.probability_under;
              const displayProb = calibratedProb ?? rawProb;

              const probabilityPercent = prop.displayConfidencePercent
                ? `${prop.displayConfidencePercent}%`
                : typeof displayProb === "number"
                  ? `${(displayProb * 100).toFixed(0)}%`
                  : "—";

              const probValue = typeof displayProb === "number" ? displayProb : 0;
              const isStrong = probValue >= 0.65;
              const pillBg = isStrong ? "rgba(34, 197, 94, 0.2)" : "rgba(255, 184, 0, 0.2)";
              const pillText = isStrong ? colors.success : "#FFB800";

              // L10 avg — color green if supports direction, orange if contradicts
              const avgNum = getAvgNumber(prop.statType, stats);
              const avgSupports = avgNum != null
                ? (isOver ? avgNum >= prop.line : avgNum <= prop.line)
                : true;
              const avgColor = avgSupports ? colors.primary : "#FFB800";

              // Build color-coded tags
              const tags = buildPropTags(prop, isOver);

              // Bookmaker for the predicted direction
              const bookmaker = isOver ? prop.bookmakerOver : prop.bookmakerUnder;

              return (
                <View key={index} style={styles.propCard}>
                  {/* Row 1: Stat type + probability pill */}
                  <View style={styles.propCardTop}>
                    <View style={styles.propCardLeft}>
                      <Text style={styles.propStatType}>{formatStatType(prop.statType)}</Text>
                      <View style={styles.propDetailsRow}>
                        <Text style={styles.propDirection}>
                          {isOver ? "▲" : "▼"} {isOver ? "Over" : "Under"} {prop.line}
                        </Text>
                        {avgNum != null && (
                          <Text style={[styles.propAvg, { color: avgColor }]}>
                            Avg {avgNum}
                          </Text>
                        )}
                        {bookmaker && (
                          <Text style={styles.propBookmaker}>· {bookmaker}</Text>
                        )}
                      </View>
                    </View>
                    <View style={[styles.propProbPill, { backgroundColor: pillBg }]}>
                      <Text style={[styles.propProbText, { color: pillText }]}>{probabilityPercent}</Text>
                    </View>
                  </View>

                  {/* Row 2: Color-coded data point tags (hit rate + defense only) */}
                  {tags.length > 0 && (
                    <View style={styles.propTagsRow}>
                      {tags.map((tag, ti) => (
                        <Text
                          key={ti}
                          style={[
                            styles.propTag,
                            tag.supports ? styles.propTagSupports : styles.propTagContradicts,
                          ]}
                        >
                          {tag.text}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {/* "+X more" indicator */}
            {extraCount > 0 && (
              <View style={styles.morePropsRow}>
                <Text style={styles.morePropsText}>+{extraCount} more prediction{extraCount !== 1 ? "s" : ""}</Text>
              </View>
            )}
          </View>
        </View>

        {/* CTA Footer */}
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.ctaFooter, pressed && styles.ctaPressed]}
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
  // Props Container (Cheat Sheet)
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
    flex: 1,
  },
  propsCount: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  propsList: {
    gap: spacing[1] + 2,
  },
  // Individual prop card
  propCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: borderRadius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2] + 2,
    gap: 4,
  },
  propCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    opacity: 0.9,
  },
  propBookmaker: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    opacity: 0.6,
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
  // Tags row with support/contradict coloring
  propTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
    alignItems: "center",
  },
  propTag: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: "hidden",
  },
  propTagSupports: {
    color: colors.success,
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  propTagContradicts: {
    color: "#FFB800",
    backgroundColor: "rgba(255, 184, 0, 0.12)",
  },
  // More props indicator
  morePropsRow: {
    alignItems: "center",
    paddingVertical: spacing[1],
  },
  morePropsText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    opacity: 0.7,
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
