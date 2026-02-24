import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { colors, spacing, borderRadius, typography, glass } from "../../constants/designTokens";
import { formatStatType, formatOdds, BOOKMAKER_LOGOS } from "../../utils/formatters";
import { getPlayerImage } from "../../utils/playerImages";
import { getNBATeamLogo } from "../../utils/teamLogos";

const NBA_TEAM_COLORS: Record<string, string> = {
  ATL: "#E03A3E", BOS: "#007A33", BKN: "#FFFFFF", CHA: "#1D1160",
  CHI: "#CE1141", CLE: "#6F263D", DAL: "#00538C", DEN: "#0E2240",
  DET: "#C8102E", GSW: "#1D428A", HOU: "#CE1141", IND: "#002D62",
  LAC: "#C8102E", LAL: "#552583", MEM: "#5D76A9", MIA: "#98002E",
  MIL: "#00471B", MIN: "#0C2340", NOP: "#0C2340", NYK: "#F58426",
  OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#E56020",
  POR: "#E03A3E", SAC: "#5A2D81", SAS: "#C4CED4", TOR: "#CE1141",
  UTA: "#002B5C", WAS: "#002B5C",
};

const TEAM_CODE_TO_NAME: Record<string, string> = {
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers",
  LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
};

// ── Types ──

type TabId = "edge" | "stack";

interface LeaderboardProp {
  name: string;
  playerId?: string;
  teamCode: string;
  stat: string;
  statType?: string;
  dir: string;
  line: number;
  avg?: number;
  odds?: number;
  bk?: string;
  l10?: number;
  dirL10?: number;
  szn?: number;
  trend?: number;
  defRank?: number;
  defTeam?: string;
  isHome?: boolean;
  green?: number;
  betScore?: number;
  edge?: number;
  headshotUrl?: string;
  gameTime?: string;
}

// ── Component ──

export function PicksView() {
  const [activeTab, setActiveTab] = useState<TabId>("edge");
  const [edgeProps, setEdgeProps] = useState<LeaderboardProp[]>([]);
  const [stackLegs, setStackLegs] = useState<LeaderboardProp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const docRef = doc(db, "matchAnalysisCache", "leaderboard");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setEdgeProps(data.edge || []);
        setStackLegs(data.stack || []);
      }
    } catch (err) {
      console.error("[PicksView] Error fetching leaderboard:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handlePropPress = useCallback((prop: LeaderboardProp) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/player-profile" as any,
      params: {
        playerName: prop.name,
        statType: prop.statType || prop.stat,
        line: String(prop.line),
        initialView: "props",
        from: "picks",
      },
    });
  }, []);

  const data = activeTab === "edge" ? edgeProps : stackLegs;

  const renderProp = useCallback(({ item, index }: { item: LeaderboardProp; index: number }) => {
    const isOver = item.dir === "over";
    const bookLogo = item.bk ? BOOKMAKER_LOGOS[item.bk] : null;
    const playerImage = getPlayerImage(item.name);
    const dirColor = isOver ? colors.success : "#FF6B6B";
    const teamFullName = TEAM_CODE_TO_NAME[item.teamCode];
    const teamLogo = teamFullName ? getNBATeamLogo(teamFullName) : null;
    const teamColor = NBA_TEAM_COLORS[item.teamCode] || colors.mutedForeground;

    // Directional L10/SZN (for Under: invert raw hit rate)
    const rawL10 = item.dirL10 ?? (item.l10 != null ? (isOver ? item.l10 : 100 - item.l10) : null);
    const rawSzn = item.szn != null ? (isOver ? item.szn : 100 - item.szn) : null;

    // EV: blend L10+SZN, regress toward market implied probability
    let ev: number | null = null;
    if (rawL10 != null && item.odds != null) {
      const baseP = (rawSzn != null ? 0.4 * rawL10 + 0.6 * rawSzn : rawL10) / 100;
      const impliedP = item.odds < 0 ? Math.abs(item.odds) / (Math.abs(item.odds) + 100) : 100 / (item.odds + 100);
      const adjP = 0.4 * baseP + 0.6 * impliedP;
      const decimal = item.odds < 0 ? 1 + 100 / Math.abs(item.odds) : 1 + item.odds / 100;
      ev = parseFloat(((adjP * (decimal - 1) - (1 - adjP)) * 100).toFixed(1));
    }

    return (
      <Pressable
        onPress={() => handlePropPress(item)}
        style={({ pressed }) => [styles.propCard, pressed && styles.propCardPressed]}
      >
        <View style={styles.cardBody}>
          {/* Header: headshot + name/team + direction arrow + line */}
          <View style={styles.headerRow}>
            <View style={styles.headshotWrapper}>
              <View style={[styles.headshotBox, { borderColor: teamColor }]}>
                {playerImage ? (
                  <ExpoImage source={playerImage} style={styles.headshot} contentFit="cover" />
                ) : item.headshotUrl ? (
                  <ExpoImage source={{ uri: item.headshotUrl }} style={styles.headshot} contentFit="cover" />
                ) : (
                  <View style={styles.headshotPlaceholder}>
                    <Text style={styles.initials}>
                      {item.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </Text>
                  </View>
                )}
              </View>
              {teamLogo && (
                <View style={styles.teamLogoBadge}>
                  <ExpoImage source={teamLogo} style={styles.teamLogoImg} contentFit="contain" />
                </View>
              )}
            </View>

            <View style={styles.nameCol}>
              <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.teamText}>
                {item.teamCode}{item.defTeam ? ` vs ${item.defTeam}` : ""}
              </Text>
            </View>

            <View style={styles.pickCol}>
              <Ionicons
                name={isOver ? "arrow-up" : "arrow-down"}
                size={18}
                color={dirColor}
              />
              <View style={styles.pickTextCol}>
                <Text style={styles.pickLine}>{item.line} {formatStatType(item.statType || item.stat)}</Text>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.rowDivider} />

          {/* Four-column stats row */}
          <View style={styles.columnsRow}>
            {/* EV */}
            <View style={styles.statCol}>
              <Text style={styles.colLabel}>EV</Text>
              <Text style={[styles.colValue, { color: ev != null && ev >= 0 ? colors.success : ev != null ? "#FF6B6B" : colors.mutedForeground }]}>
                {ev != null ? `${ev >= 0 ? "+" : ""}${ev}%` : "—"}
              </Text>
            </View>

            <View style={styles.colDivider} />

            {/* ODDS */}
            <View style={styles.statCol}>
              <View style={styles.oddsColHeader}>
                {bookLogo && (
                  <ExpoImage source={bookLogo} style={styles.bookLogoSmall} contentFit="contain" />
                )}
                <Text style={styles.colLabel}>ODDS</Text>
              </View>
              <Text style={styles.colValue}>
                {item.odds != null ? formatOdds(item.odds) : "—"}
              </Text>
            </View>

            <View style={styles.colDivider} />

            {/* L10 */}
            <View style={styles.statCol}>
              <Text style={styles.colLabel}>L10</Text>
              <Text style={[styles.colValue, { color: rawL10 != null && rawL10 >= 60 ? colors.success : rawL10 != null && rawL10 < 50 ? "#FF6B6B" : colors.foreground }]}>
                {rawL10 != null ? `${Math.round(rawL10)}%` : "—"}
              </Text>
            </View>

            <View style={styles.colDivider} />

            {/* AVG */}
            <View style={styles.statCol}>
              <Text style={styles.colLabel}>AVG</Text>
              <Text style={styles.colValue}>
                {item.avg != null ? String(item.avg) : "—"}
              </Text>
            </View>
          </View>

        </View>
      </Pressable>
    );
  }, [activeTab, handlePropPress]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("edge"); }}
          style={[styles.tab, activeTab === "edge" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "edge" && styles.tabTextActive]}>Standard Lines</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("stack"); }}
          style={[styles.tab, activeTab === "stack" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "stack" && styles.tabTextActive]}>Alt Lines</Text>
        </Pressable>
      </View>

      {/* List */}
      {data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>No picks available yet</Text>
          <Text style={styles.emptySubtext}>Picks refresh multiple times daily</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, idx) => `${item.name}-${item.stat}-${idx}`}
          renderItem={renderProp}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing[3],
  },

  // Tabs
  tabRow: {
    flexDirection: "row",
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    marginBottom: spacing[4],
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    ...typography.sm,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.primary,
  },

  // List
  listContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },

  // Card
  propCard: {
    backgroundColor: glass.card.backgroundColor,
    borderWidth: glass.card.borderWidth,
    borderColor: glass.card.borderColor,
    borderRadius: borderRadius.xl,
    marginBottom: spacing[3],
    overflow: "hidden",
  },
  propCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cardBody: {
    padding: spacing[3],
    gap: spacing[3],
  },

  // Header row
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  headshotWrapper: {
    width: 48,
    height: 48,
  },
  headshotBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.secondary,
    borderWidth: 0.5,
    borderColor: colors.mutedForeground,
  },
  teamLogoBadge: {
    position: "absolute",
    bottom: -2,
    right: -4,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.rgba.borderGlass,
    alignItems: "center",
    justifyContent: "center",
  },
  teamLogoImg: {
    width: 15,
    height: 15,
  },
  headshot: {
    width: 44,
    height: 44,
  },
  headshotPlaceholder: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  initials: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  nameCol: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: 16,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  teamText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },

  // Pick column (right side — direction arrow + line)
  pickCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pickTextCol: {
    alignItems: "flex-end",
  },
  pickLine: {
    fontSize: 16,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },

  // Horizontal divider
  rowDivider: {
    height: 1,
    backgroundColor: colors.rgba.borderGlass,
  },

  // Three-column stats
  columnsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  colLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  colValue: {
    fontSize: 16,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  colDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.rgba.borderGlass,
  },
  oddsColHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bookLogoSmall: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },


  // Empty
  emptyText: {
    ...typography.base,
    fontWeight: "600",
    color: colors.foreground,
  },
  emptySubtext: {
    ...typography.sm,
    color: colors.mutedForeground,
  },
});

export default PicksView;
