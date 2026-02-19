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
  l10Avg?: number;
  trend?: number;
  greenScore?: number;
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

const formatStatType = (statType: string): string => {
  const formatMap: { [key: string]: string } = {
    points: "PTS",
    rebounds: "REB",
    assists: "AST",
    steals: "STL",
    blocks: "BLK",
    turnovers: "TO",
    three_pointers_made: "3PT",
    threepointersmade: "3PT",
    threes: "3PT",
    "points+rebounds": "PTS+REB",
    "points+assists": "PTS+AST",
    "rebounds+assists": "REB+AST",
    "points+rebounds+assists": "PRA",
    "blocks+steals": "BLK+STL",
    pts_rebs_asts: "PRA",
    double_double: "DD",
  };
  return formatMap[statType.toLowerCase()] || statType.replace(/[_+]/g, "+").toUpperCase();
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
  if (isTomorrow) return `Tmrw ${timeStr}`;
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
  supports: boolean;
}

const buildPropTags = (
  prop: EnrichedPlayerProp,
  isOver: boolean
): PropTag[] => {
  const tags: PropTag[] = [];

  // L10 hit rate — show count in predicted direction
  const hr = prop.hitRates?.l10;
  if (hr && hr.total > 0) {
    const hitCount = isOver ? hr.over : hr.total - hr.over;
    const supports = isOver ? hr.pct >= 50 : hr.pct < 50;
    tags.push({ text: `${hitCount}/${hr.total} L10`, supports });
  }

  // Season hit rate
  const sznHr = prop.hitRates?.season;
  if (sznHr && sznHr.total > 0) {
    const sznHitPct = isOver ? sznHr.pct : 100 - sznHr.pct;
    const supports = sznHitPct >= 50;
    tags.push({ text: `${Math.round(sznHitPct)}% SZN`, supports });
  }

  // Opponent defense rank (1-30: 1=best defense, 30=worst)
  if (prop.opponentDefense?.rank && prop.opponent) {
    const abbrev = getTeamAbbreviation(prop.opponent);
    const rank = prop.opponentDefense.rank;
    const supports = isOver ? rank > 15 : rank <= 15;
    tags.push({
      text: `${abbrev} ${rank}${getSuffix(rank)}`,
      supports,
    });
  }

  return tags;
};

// ──────────────────────────────────────────────
// GREEN SCORE DOTS
// ──────────────────────────────────────────────

const GreenScoreDots: React.FC<{ score: number; max?: number }> = ({ score, max = 5 }) => (
  <View style={styles.greenDots}>
    {Array.from({ length: max }).map((_, i) => (
      <View
        key={i}
        style={[
          styles.greenDot,
          i < score ? styles.greenDotFilled : styles.greenDotEmpty,
        ]}
      />
    ))}
  </View>
);

// ──────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────

export const PlayerPropCard: React.FC<PlayerPropCardProps> = ({ player, onPress }) => {
  const gameTime = formatGameTime(player.gameStartTime);
  const teamAbbrev = getTeamAbbreviation(player.team);
  const opponentAbbrev = getTeamAbbreviation(player.opponent);
  const playerName = player.playerName || "Unknown Player";
  const playerImage = getPlayerImage(playerName, teamAbbrev);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(player);
  };

  const stats = player.playerStats || player.props[0]?.playerStats;
  const visibleProps = player.props.slice(0, MAX_PROPS_SHOWN);
  const extraCount = player.props.length - MAX_PROPS_SHOWN;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={styles.content}>
        {/* Header: Team Badge + Game Time */}
        <View style={styles.header}>
          <View style={styles.teamBadge}>
            <Ionicons name="basketball" size={11} color="#FF6B35" />
            <Text style={styles.teamAbbrev}>{teamAbbrev}</Text>
          </View>
          {gameTime && (
            <View style={styles.gameTimeBadge}>
              <Ionicons name="time-outline" size={11} color={colors.mutedForeground} />
              <Text style={styles.gameTimeText}>{gameTime}</Text>
            </View>
          )}
        </View>

        {/* Player Section — compact */}
        <View style={styles.playerRow}>
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
            <Text style={styles.playerMatchup}>
              {teamAbbrev} vs {opponentAbbrev}
            </Text>
            {stats && (stats.pointsPerGame || stats.reboundsPerGame || stats.assistsPerGame) && (
              <View style={styles.statChipsRow}>
                {stats.pointsPerGame != null && (
                  <Text style={styles.statChipText}>
                    <Text style={styles.statChipValue}>{stats.pointsPerGame}</Text>
                    <Text style={styles.statChipLabel}> PPG</Text>
                  </Text>
                )}
                {stats.reboundsPerGame != null && (
                  <Text style={styles.statChipText}>
                    <Text style={styles.statChipValue}>{stats.reboundsPerGame}</Text>
                    <Text style={styles.statChipLabel}> RPG</Text>
                  </Text>
                )}
                {stats.assistsPerGame != null && (
                  <Text style={styles.statChipText}>
                    <Text style={styles.statChipValue}>{stats.assistsPerGame}</Text>
                    <Text style={styles.statChipLabel}> APG</Text>
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Props Section */}
        <View style={styles.propsContainer}>
          <View style={styles.propsHeader}>
            <View style={styles.propsIconWrapper}>
              <Ionicons name="analytics" size={12} color={colors.primary} />
            </View>
            <Text style={styles.propsLabel}>AI PICKS</Text>
            <Text style={styles.propsCount}>
              {player.props.length} prop{player.props.length !== 1 ? "s" : ""}
            </Text>
          </View>

          <View style={styles.propsList}>
            {visibleProps.map((prop, index) => {
              const predictionLower = (prop.prediction || "").toLowerCase();
              const isOver = predictionLower === "over";

              // Calibrated + capped probability
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

              // L10 avg — use prop's own l10Avg first, fall back to playerStats
              const avgNum = prop.l10Avg ?? null;
              const avgSupports = avgNum != null
                ? (isOver ? avgNum >= prop.line : avgNum <= prop.line)
                : true;
              const avgColor = avgSupports ? colors.primary : "#FFB800";

              // Color-coded tags
              const tags = buildPropTags(prop, isOver);

              // Green score
              const greenScore = prop.greenScore ?? null;

              return (
                <View key={index} style={styles.propRow}>
                  {/* Line 1: Stat + Direction/Line + Avg ... Probability */}
                  <View style={styles.propTopRow}>
                    <View style={styles.propInfo}>
                      <Text style={styles.propStat}>{formatStatType(prop.statType)}</Text>
                      <Text style={styles.propDivider}> </Text>
                      <Text style={[styles.propDirection, isOver ? styles.propOver : styles.propUnder]}>
                        {isOver ? "O" : "U"} {prop.line}
                      </Text>
                      {avgNum != null && (
                        <>
                          <Text style={styles.propDivider}>  </Text>
                          <Text style={[styles.propAvg, { color: avgColor }]}>
                            Avg {avgNum}
                          </Text>
                        </>
                      )}
                    </View>
                    <View style={[styles.propProbPill, { backgroundColor: pillBg }]}>
                      <Text style={[styles.propProbText, { color: pillText }]}>{probabilityPercent}</Text>
                    </View>
                  </View>

                  {/* Line 2: Tags + Green Score */}
                  <View style={styles.propBottomRow}>
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
                    {greenScore != null && <GreenScoreDots score={greenScore} />}
                  </View>
                </View>
              );
            })}

            {extraCount > 0 && (
              <View style={styles.morePropsRow}>
                <Text style={styles.morePropsText}>+{extraCount} more</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

// Skeleton Loading Component
export const PlayerPropCardSkeleton: React.FC = () => {
  return (
    <View style={styles.card}>
      <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={[styles.skeleton, { width: 60, height: 22 }]} />
          <View style={[styles.skeleton, { width: 90, height: 14 }]} />
        </View>
        <View style={styles.playerRow}>
          <View style={[styles.skeleton, styles.skeletonAvatar]} />
          <View style={styles.playerMeta}>
            <View style={[styles.skeleton, { width: 140, height: 18, marginBottom: 4 }]} />
            <View style={[styles.skeleton, { width: 100, height: 13 }]} />
          </View>
        </View>
        <View style={[styles.skeleton, { width: "100%", height: 140, borderRadius: borderRadius.lg }]} />
      </View>
    </View>
  );
};

const AVATAR_SIZE = 56;

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
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  content: {
    paddingTop: spacing[3],
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[2] + 2,
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
    gap: 4,
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.35)",
    backgroundColor: "rgba(255, 107, 53, 0.08)",
  },
  teamAbbrev: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: "#FF6B35",
    letterSpacing: 0.8,
  },
  gameTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  gameTimeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  // Player Section
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2] + 2,
  },
  playerAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.rgba.primary30,
  },
  playerAvatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.rgba.primary30,
    backgroundColor: colors.secondary,
  },
  playerInitials: {
    fontSize: 20,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  playerMeta: {
    flex: 1,
    gap: 1,
  },
  playerName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  playerMatchup: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  statChipsRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: 4,
  },
  statChipText: {
    fontSize: 11,
  },
  statChipValue: {
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statChipLabel: {
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  // Props Container
  propsContainer: {
    backgroundColor: "rgba(0, 215, 215, 0.04)",
    borderRadius: borderRadius.lg,
    padding: spacing[2] + 2,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
    gap: spacing[2],
  },
  propsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1] + 2,
  },
  propsIconWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0, 215, 215, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  propsLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1.2,
    color: colors.primary,
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
  // Individual prop row — compact 2-line layout
  propRow: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: borderRadius.sm,
    paddingVertical: spacing[1] + 3,
    paddingHorizontal: spacing[2],
    gap: 5,
  },
  propTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  propInfo: {
    flexDirection: "row",
    alignItems: "baseline",
    flex: 1,
  },
  propStat: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  propDivider: {
    color: colors.mutedForeground,
    fontSize: 11,
  },
  propDirection: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
  },
  propOver: {
    color: colors.success,
  },
  propUnder: {
    color: "#FF6B6B",
  },
  propAvg: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
  },
  propProbPill: {
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginLeft: spacing[1],
  },
  propProbText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
  },
  // Tags + Green dots row
  propBottomRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center",
  },
  propTag: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
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
  // Green score dots
  greenDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 2,
  },
  greenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  greenDotFilled: {
    backgroundColor: colors.primary,
  },
  greenDotEmpty: {
    backgroundColor: "rgba(122, 139, 163, 0.25)",
  },
  // More props
  morePropsRow: {
    alignItems: "center",
    paddingVertical: 2,
  },
  morePropsText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    opacity: 0.7,
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
