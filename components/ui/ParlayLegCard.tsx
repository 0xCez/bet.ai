import React from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { colors, spacing, borderRadius, typography, glass } from "../../constants/designTokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6];
export const PARLAY_CARD_WIDTH = SCREEN_WIDTH - HORIZONTAL_PADDING * 2;

// Parlay Stack leg data structure
export interface ParlayLeg {
  playerName: string;
  team: string;
  opponent: string;
  statType: string;
  prediction: "Over" | "Under";
  altLine: number;
  altOdds: number;
  bookmaker?: string;
  l10Avg: number;
  trend?: number;
  hitRates?: {
    l10?: { over: number; total: number; pct: number };
    season?: { over: number; total: number; pct: number };
  };
  opponentDefense?: {
    allowed?: number;
    rank?: number;
    stat?: string;
  } | null;
  greenScore?: number;
  parlayEdge?: number;
  avgMargin?: number;
  isHome?: boolean;
  gameId?: string;
  gameStartTime?: string;
}

interface ParlayLegCardProps {
  leg: ParlayLeg;
  onPress: (leg: ParlayLeg) => void;
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

const getTeamAbbreviation = (teamName?: string): string => {
  if (!teamName) return "TBD";
  const abbrevMap: { [key: string]: string } = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "LA Clippers": "LAC", "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL",
    "LA Lakers": "LAL", "Memphis Grizzlies": "MEM", "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR",
    "Utah Jazz": "UTA", "Washington Wizards": "WAS",
  };
  return abbrevMap[teamName] || teamName.substring(0, 3).toUpperCase();
};

const formatStatType = (statType: string): string => {
  const formatMap: { [key: string]: string } = {
    points: "PTS", rebounds: "REB", assists: "AST", steals: "STL",
    blocks: "BLK", turnovers: "TO", three_pointers_made: "3PT",
    threepointersmade: "3PT", threes: "3PT",
    "points+rebounds": "PTS+REB", "points+assists": "PTS+AST",
    "rebounds+assists": "REB+AST", "points+rebounds+assists": "PRA",
    "blocks+steals": "BLK+STL", pts_rebs_asts: "PRA", double_double: "DD",
  };
  return formatMap[statType.toLowerCase()] || statType.replace(/[_+]/g, "+").toUpperCase();
};

const formatOdds = (odds: number): string => {
  return odds > 0 ? `+${odds}` : `${odds}`;
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

// ──────────────────────────────────────────────
// TAG BUILDER
// ──────────────────────────────────────────────

interface LegTag {
  text: string;
  supports: boolean;
}

const buildLegTags = (leg: ParlayLeg): LegTag[] => {
  const tags: LegTag[] = [];
  const isOver = leg.prediction === "Over";

  // L10 hit rate
  const hr = leg.hitRates?.l10;
  if (hr && hr.total > 0) {
    const hitCount = isOver ? hr.over : hr.total - hr.over;
    const supports = isOver ? hr.pct >= 50 : hr.pct < 50;
    tags.push({ text: `${hitCount}/${hr.total} L10`, supports });
  }

  // Season hit rate
  const sznHr = leg.hitRates?.season;
  if (sznHr && sznHr.total > 0) {
    const sznHitPct = isOver ? sznHr.pct : 100 - sznHr.pct;
    const supports = sznHitPct >= 50;
    tags.push({ text: `${Math.round(sznHitPct)}% SZN`, supports });
  }

  // Defense rank
  if (leg.opponentDefense?.rank) {
    const abbrev = getTeamAbbreviation(leg.opponent);
    const rank = leg.opponentDefense.rank;
    const supports = isOver ? rank > 15 : rank <= 15;
    tags.push({ text: `${abbrev} ${rank}${getSuffix(rank)}`, supports });
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
        style={[styles.greenDot, i < score ? styles.greenDotFilled : styles.greenDotEmpty]}
      />
    ))}
  </View>
);

// ──────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────

export const ParlayLegCard: React.FC<ParlayLegCardProps> = ({ leg, onPress }) => {
  const teamAbbrev = getTeamAbbreviation(leg.team);
  const opponentAbbrev = getTeamAbbreviation(leg.opponent);
  const gameTime = formatGameTime(leg.gameStartTime);
  const isOver = leg.prediction === "Over";
  const tags = buildLegTags(leg);

  // Edge badge color: higher edge = greener
  const edgePct = leg.parlayEdge != null ? (leg.parlayEdge * 100) : 0;
  const edgeIsStrong = edgePct >= 8;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(leg);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />

      <View style={styles.content}>
        {/* Header: team + game time + edge badge */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.teamBadge}>
              <Ionicons name="basketball" size={11} color="#FF6B35" />
              <Text style={styles.teamAbbrevText}>{teamAbbrev}</Text>
            </View>
            <Text style={styles.matchupText}>{teamAbbrev} vs {opponentAbbrev}</Text>
          </View>
          {gameTime && (
            <View style={styles.gameTimeBadge}>
              <Text style={styles.gameTimeText}>{gameTime}</Text>
            </View>
          )}
        </View>

        {/* Player + Pick */}
        <View style={styles.pickSection}>
          <View style={styles.pickLeft}>
            <Text style={styles.playerName} numberOfLines={1}>{leg.playerName}</Text>
            <View style={styles.pickRow}>
              <Text style={styles.statType}>{formatStatType(leg.statType)}</Text>
              <Text style={[styles.direction, isOver ? styles.dirOver : styles.dirUnder]}>
                {isOver ? "O" : "U"} {leg.altLine}
              </Text>
              <Text style={styles.avgText}>Avg {leg.l10Avg}</Text>
            </View>
          </View>
          <View style={styles.oddsContainer}>
            <Text style={styles.oddsText}>{formatOdds(leg.altOdds)}</Text>
            {leg.bookmaker && <Text style={styles.bookmakerText}>{leg.bookmaker}</Text>}
          </View>
        </View>

        {/* Edge Badge */}
        {leg.parlayEdge != null && (
          <View style={[
            styles.edgeBadge,
            edgeIsStrong ? styles.edgeBadgeStrong : styles.edgeBadgeNormal,
          ]}>
            <Ionicons
              name="trending-up"
              size={12}
              color={edgeIsStrong ? colors.success : colors.primary}
            />
            <Text style={[
              styles.edgeText,
              { color: edgeIsStrong ? colors.success : colors.primary },
            ]}>
              +{edgePct.toFixed(1)}% edge vs implied
            </Text>
          </View>
        )}

        {/* Tags + Green Score */}
        <View style={styles.tagsRow}>
          {tags.map((tag, i) => (
            <Text
              key={i}
              style={[
                styles.tag,
                tag.supports ? styles.tagSupports : styles.tagContradicts,
              ]}
            >
              {tag.text}
            </Text>
          ))}
          {leg.greenScore != null && <GreenScoreDots score={leg.greenScore} />}
        </View>
      </View>
    </Pressable>
  );
};

// Skeleton
export const ParlayLegCardSkeleton: React.FC = () => (
  <View style={styles.card}>
    <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={[styles.skeleton, { width: 60, height: 22 }]} />
        <View style={[styles.skeleton, { width: 90, height: 14 }]} />
      </View>
      <View style={[styles.skeleton, { width: "100%", height: 50, borderRadius: borderRadius.md }]} />
      <View style={[styles.skeleton, { width: "70%", height: 28, borderRadius: borderRadius.full }]} />
      <View style={{ flexDirection: "row", gap: 4 }}>
        <View style={[styles.skeleton, { width: 60, height: 20 }]} />
        <View style={[styles.skeleton, { width: 60, height: 20 }]} />
        <View style={[styles.skeleton, { width: 60, height: 20 }]} />
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    width: PARLAY_CARD_WIDTH,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: glass.card.backgroundColor,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  content: {
    padding: spacing[3],
    gap: spacing[2],
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  teamBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.35)",
    backgroundColor: "rgba(255, 107, 53, 0.08)",
  },
  teamAbbrevText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    color: "#FF6B35",
    letterSpacing: 0.8,
  },
  matchupText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  gameTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  gameTimeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  // Pick section
  pickSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: borderRadius.md,
    padding: spacing[2] + 2,
  },
  pickLeft: {
    flex: 1,
    gap: 4,
  },
  playerName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  statType: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  direction: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
  },
  dirOver: {
    color: colors.success,
  },
  dirUnder: {
    color: "#FF6B6B",
  },
  avgText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  oddsContainer: {
    alignItems: "flex-end",
    gap: 2,
  },
  oddsText: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  bookmakerText: {
    fontSize: 9,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    opacity: 0.7,
  },
  // Edge badge
  edgeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  edgeBadgeStrong: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  edgeBadgeNormal: {
    backgroundColor: "rgba(0, 215, 215, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
  },
  edgeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
  },
  // Tags
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center",
  },
  tag: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  tagSupports: {
    color: colors.success,
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  tagContradicts: {
    color: "#FFB800",
    backgroundColor: "rgba(255, 184, 0, 0.12)",
  },
  // Green dots
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
  // Skeleton
  skeleton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
  },
});

export default ParlayLegCard;
