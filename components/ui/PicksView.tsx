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
      pathname: "/player-prop-chart" as any,
      params: {
        playerName: prop.name,
        statType: prop.statType || prop.stat,
        line: String(prop.line),
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
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: dirColor }]} />

        <View style={styles.cardBody}>
          {/* Top row: headshot + name/team + bookie */}
          <View style={styles.topRow}>
            <View style={[styles.headshotRing, { borderColor: `${dirColor}40` }]}>
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

            <View style={styles.nameCol}>
              <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.teamText}>{item.teamCode}{item.defTeam ? ` vs ${item.defTeam}` : ""}</Text>
            </View>

            {/* Bookie logo + odds */}
            <View style={styles.bookCol}>
              {bookLogo && (
                <ExpoImage source={bookLogo} style={styles.bookLogo} contentFit="contain" />
              )}
              {item.odds != null && (
                <Text style={styles.bookLine}>{formatOdds(item.odds)}</Text>
              )}
            </View>
          </View>

          {/* Middle row: direction pill + stat + odds */}
          <View style={styles.middleRow}>
            <View style={[styles.dirPill, { backgroundColor: `${dirColor}15` }]}>
              <Text style={[styles.dirPillText, { color: dirColor }]}>
                {isOver ? "OVER" : "UNDER"}
              </Text>
            </View>
            <Text style={styles.statLine}>
              {formatStatType(item.statType || item.stat)} {item.line}
            </Text>
            <View style={styles.bottomSpacer} />
            <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
          </View>

          {/* Bottom row: metric chips */}
          <View style={styles.metricsRow}>
            {rawL10 != null && (
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>L10</Text>
                <Text style={[styles.metricValue, { color: rawL10 >= 60 ? colors.success : rawL10 >= 50 ? colors.foreground : "#FF6B6B" }]}>
                  {Math.round(rawL10)}%
                </Text>
              </View>
            )}
            {rawSzn != null && (
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>SZN</Text>
                <Text style={[styles.metricValue, { color: rawSzn >= 60 ? colors.success : rawSzn >= 50 ? colors.foreground : "#FF6B6B" }]}>
                  {Math.round(rawSzn)}%
                </Text>
              </View>
            )}
            {item.avg != null && (
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>AVG</Text>
                <Text style={styles.metricValue}>{item.avg}</Text>
              </View>
            )}
            {ev != null && (
              <View style={[styles.metricChip, ev >= 0 && styles.metricChipPositive]}>
                <Text style={styles.metricLabel}>EV</Text>
                <Text style={[styles.metricValue, { color: ev >= 0 ? colors.success : "#FF6B6B" }]}>
                  {ev >= 0 ? "+" : ""}{ev}%
                </Text>
              </View>
            )}
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
    flexDirection: "row",
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
  accentBar: {
    width: 3,
  },
  cardBody: {
    flex: 1,
    padding: spacing[3],
    gap: spacing[2],
  },

  // Top row
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  headshotRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.secondary,
  },
  headshot: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headshotPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  initials: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  nameCol: {
    flex: 1,
    gap: 1,
  },
  playerName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  teamText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },

  // Bookie column (top-right)
  bookCol: {
    alignItems: "center",
    gap: 2,
  },
  bookLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  bookLine: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },

  // Middle row
  middleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  dirPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  dirPillText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.5,
  },
  statLine: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.semibold,
    color: colors.foreground,
  },
  oddsText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  bottomSpacer: {
    flex: 1,
  },

  // Metrics row
  metricsRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  metricChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${colors.secondary}80`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  metricChipPositive: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  metricLabel: {
    fontSize: 9,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
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
