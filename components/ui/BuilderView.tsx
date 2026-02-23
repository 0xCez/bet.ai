import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { ParlayBuilderContent } from "./ParlayBuilder";
import { CachedGame } from "./CachedGameCard";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import { formatOdds, BOOKMAKER_LOGOS, SHORT_TO_BOOKMAKER } from "../../utils/formatters";
import { openBookmakerLink } from "../../utils/bookmakerLinks";
import { getPlayerImage } from "../../utils/playerImages";

type ParlayTab = "suggested" | "build";

interface BuilderViewProps {
  games: CachedGame[];
}

// Slip-level color palette
const RISK_THEME: Record<string, { accent: string; bg15: string; border: string; icon: string }> = {
  LOCK:    { accent: "#22C55E", bg15: "rgba(34, 197, 94, 0.15)",  border: "rgba(34, 197, 94, 0.25)",  icon: "shield-checkmark" },
  STEADY:  { accent: "#FFB800", bg15: "rgba(255, 184, 0, 0.15)",  border: "rgba(255, 184, 0, 0.25)",  icon: "trending-up" },
  SNIPER:  { accent: "#A78BFA", bg15: "rgba(167, 139, 250, 0.15)", border: "rgba(167, 139, 250, 0.25)", icon: "flash" },
  // Legacy fallbacks
  SAFE:    { accent: "#FFB800", bg15: "rgba(255, 184, 0, 0.15)",  border: "rgba(255, 184, 0, 0.25)",  icon: "trending-up" },
  VALUE:   { accent: "#FF6B6B", bg15: "rgba(255, 107, 107, 0.15)", border: "rgba(255, 107, 107, 0.25)", icon: "diamond" },
};

// Resolve bookmaker key for opening links
function resolveBookKey(shortCode: string): string {
  return SHORT_TO_BOOKMAKER[shortCode] || shortCode;
}

export const BuilderView: React.FC<BuilderViewProps> = ({ games }) => {
  const [activeTab, setActiveTab] = useState<ParlayTab>("suggested");

  return (
    <View style={styles.container}>
      {/* Sub-tab switcher */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("suggested"); }}
          style={[styles.tab, activeTab === "suggested" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "suggested" && styles.tabTextActive]}>Suggested</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab("build"); }}
          style={[styles.tab, activeTab === "build" && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === "build" && styles.tabTextActive]}>Build Your Own</Text>
        </Pressable>
      </View>

      {/* Tab content */}
      <View style={[styles.tabContent, activeTab !== "suggested" && styles.hidden]}>
        <SuggestedParlays />
      </View>
      <View style={[styles.tabContent, activeTab !== "build" && styles.hidden]}>
        <ParlayBuilderContent games={games} />
      </View>
    </View>
  );
};

// ── Bookmaker filter chips ──

function BookmakerFilter({
  books,
  selected,
  onSelect,
}: {
  books: string[];
  selected: string;
  onSelect: (bk: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
      {books.map((bk) => {
        const logo = BOOKMAKER_LOGOS[bk];
        const isActive = selected === bk;
        return (
          <Pressable
            key={bk}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(bk); }}
            style={[styles.filterChip, isActive && styles.filterChipActive]}
          >
            {logo && <Image source={logo} style={styles.filterChipLogo} contentFit="contain" />}
            <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{bk}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Suggested Parlays (Parlay of the Day) ──

function SuggestedParlays() {
  const [slips, setSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSlip, setExpandedSlip] = useState<number | null>(null);
  const [bookFilter, setBookFilter] = useState("");
  const [headshots, setHeadshots] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "matchAnalysisCache", "parlayOfTheDay"));
        if (snap.exists()) {
          const data = snap.data().slips || [];
          setSlips(data);
          // Resolve headshots for players that don't have one
          const names = new Set<string>();
          const namesWithHeadshots = new Set<string>();
          for (const slip of data) {
            for (const leg of (slip.legs || [])) {
              const n = leg.name || leg.playerName;
              if (n) names.add(n);
              if (leg.headshotUrl && n) namesWithHeadshots.add(n);
            }
          }
          const map: Record<string, string> = {};
          await Promise.all([...names].map(async (name) => {
            if (namesWithHeadshots.has(name)) return;
            try {
              const key = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
              const hsSnap = await getDoc(doc(db, "ml_cache", `espn_hs_${key}`));
              if (hsSnap.exists() && hsSnap.data().headshotUrl) {
                map[name] = hsSnap.data().headshotUrl;
              }
            } catch {}
          }));
          setHeadshots(map);
        }
      } catch (err) {
        console.log("[SuggestedParlays] Could not load daily slips:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Extract unique bookmakers from slip-level bk field
  const uniqueBooks = useMemo(() => {
    const bks = new Set<string>();
    for (const slip of slips) {
      if (slip.bk) bks.add(slip.bk);
    }
    return [...bks].sort();
  }, [slips]);

  // Default to first bookmaker once data loads
  useEffect(() => {
    if (uniqueBooks.length > 0 && !bookFilter) {
      setBookFilter(uniqueBooks[0]);
    }
  }, [uniqueBooks, bookFilter]);

  // Filter slips by bookmaker (each slip is locked to one book)
  const filteredSlips = useMemo(() => {
    if (!bookFilter) return slips;
    return slips.filter((slip: any) => slip.bk === bookFilter);
  }, [slips, bookFilter]);

  const toggleSlip = useCallback((idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExpandedSlip(prev => prev === idx ? null : idx);
  }, []);

  const handleLegPress = useCallback((leg: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const legName = leg.name || leg.playerName || "";
    const legStat = leg.statType || leg.stat || "";
    const legLine = leg.line ?? leg.altLine;
    router.push({
      pathname: "/player-prop-chart" as any,
      params: {
        playerName: legName,
        statType: legStat,
        line: String(legLine ?? ""),
        from: "parlay",
      },
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (slips.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="layers-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>No suggested parlays yet</Text>
        <Text style={styles.emptySubtext}>Parlays refresh with daily picks</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.suggestedScroll} contentContainerStyle={styles.suggestedContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.suggestedTitle}>Parlay of the Day</Text>
      <Text style={styles.suggestedSubtitle}>Pre-built slips ranked by safety and edge</Text>

      {/* Bookmaker filter */}
      {uniqueBooks.length > 1 && (
        <BookmakerFilter books={uniqueBooks} selected={bookFilter} onSelect={setBookFilter} />
      )}

      {filteredSlips.map((slip: any, idx: number) => {
        const theme = RISK_THEME[slip.name] || RISK_THEME.STEADY;
        const isExpanded = expandedSlip === idx;
        const legs = slip.legs || [];

        return (
          <View key={idx} style={styles.slipCard}>
            {/* Slip header — always visible */}
            <Pressable
              onPress={() => toggleSlip(idx)}
              style={[styles.slipHeader, { borderColor: theme.border }]}
            >
              <View style={styles.slipHeaderLeft}>
                <View style={[styles.slipIconWrap, { backgroundColor: theme.bg15 }]}>
                  <Ionicons name={theme.icon as any} size={20} color={theme.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.slipName, { color: theme.accent }]}>{slip.name}</Text>
                    {slip.bk && BOOKMAKER_LOGOS[slip.bk] && (
                      <View style={styles.slipBookBadge}>
                        <Image source={BOOKMAKER_LOGOS[slip.bk]} style={styles.slipBookLogo} contentFit="contain" />
                        <Text style={styles.slipBookText}>{slip.bk}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.slipMeta} numberOfLines={1}>{legs.length} legs · {slip.subtitle || ""}</Text>
                </View>
              </View>
              <View style={styles.slipHeaderRight}>
                <View style={styles.slipOddsCol}>
                  <Text style={styles.slipOddsLabel}>Combined</Text>
                  <Text style={[styles.slipOddsValue, { color: theme.accent }]}>
                    {typeof slip.combinedOdds === "number" ? formatOdds(slip.combinedOdds) : slip.combinedOdds}
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.mutedForeground}
                />
              </View>
            </Pressable>

            {/* Expanded legs — tappable, with headshots */}
            {isExpanded && (
              <View style={styles.slipLegsContainer}>
                {legs.map((leg: any, legIdx: number) => {
                  const isOver = (leg.dir || leg.prediction || "").toLowerCase() === "over";
                  const bookKey = leg.bk || leg.bookmaker || "";
                  const legOdds = leg.odds ?? leg.altOdds;
                  const bookLogo = bookKey ? BOOKMAKER_LOGOS[bookKey] : null;
                  const legName = leg.name || leg.playerName || "";
                  const legLine = leg.line ?? leg.altLine;
                  const legStat = leg.stat || leg.statType || "";
                  const legAvg = leg.avg ?? leg.l10Avg;
                  const teamCode = leg.teamCode || "";
                  const defTeam = leg.defTeam || "";
                  const l10Pct = leg.l10;
                  const dirL10 = l10Pct != null ? (isOver ? l10Pct : 100 - l10Pct) : null;
                  const localImage = getPlayerImage(legName);
                  const headshotUrl = leg.headshotUrl || headshots[legName];
                  const isEdgeLeg = leg.source === "edge";

                  return (
                    <Pressable
                      key={legIdx}
                      onPress={() => handleLegPress(leg)}
                      style={({ pressed }) => [styles.legCard, pressed && styles.legCardPressed]}
                    >
                      <View style={styles.legCardContent}>
                        {/* Headshot */}
                        <View style={styles.legHeadshotWrap}>
                          {localImage ? (
                            <Image source={localImage} style={styles.legHeadshot} contentFit="cover" />
                          ) : headshotUrl ? (
                            <Image source={{ uri: headshotUrl }} style={styles.legHeadshot} contentFit="cover" transition={200} />
                          ) : (
                            <View style={styles.legHeadshotPlaceholder}>
                              <Ionicons name="person" size={18} color={colors.mutedForeground} />
                            </View>
                          )}
                        </View>

                        {/* Details */}
                        <View style={styles.legDetails}>
                          {/* Row 1: Player name + odds */}
                          <View style={styles.legTopRow}>
                            <View style={styles.legNameRow}>
                              <Text style={styles.legPlayerName} numberOfLines={1}>{legName}</Text>
                              {isEdgeLeg && (
                                <View style={styles.edgeBadge}>
                                  <Text style={styles.edgeBadgeText}>STD</Text>
                                </View>
                              )}
                            </View>
                            {legOdds != null && (
                              <Text style={styles.legOddsText}>{formatOdds(legOdds)}</Text>
                            )}
                          </View>

                          {/* Row 2: Stat + line + avg */}
                          <View style={styles.legPickRow}>
                            <Text style={styles.legStatType}>{legStat}</Text>
                            <Text style={[styles.legDirection, { color: isOver ? colors.success : "#FF6B6B" }]}>
                              {isOver ? "O" : "U"} {legLine}
                            </Text>
                            {legAvg != null && (
                              <Text style={styles.legAvg}>Avg {legAvg}</Text>
                            )}
                          </View>

                          {/* Row 3: Team matchup + L10 + edge + book */}
                          <View style={styles.legMetaRow}>
                            <Text style={styles.legTeam}>
                              {teamCode}{defTeam ? ` vs ${defTeam}` : ""}
                            </Text>
                            <View style={styles.legMetaTags}>
                              {dirL10 != null && (
                                <Text style={[styles.legHitRate, { color: dirL10 >= 70 ? colors.success : dirL10 >= 50 ? colors.primary : "#FF6B6B" }]}>
                                  {Math.round(dirL10)}% L10
                                </Text>
                              )}
                              {bookLogo && (
                                <Image source={bookLogo} style={styles.legBookLogo} contentFit="contain" />
                              )}
                            </View>
                          </View>
                        </View>

                        <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} style={{ alignSelf: "center" }} />
                      </View>
                    </Pressable>
                  );
                })}

                {/* Place bet CTA */}
                {(() => {
                  const slipBook = slip.bk || legs[0]?.bk || legs[0]?.bookmaker;
                  if (!slipBook) return null;
                  const bookLogo = BOOKMAKER_LOGOS[slipBook];
                  const fullBookKey = resolveBookKey(slipBook);
                  return (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        openBookmakerLink(fullBookKey, "nba");
                      }}
                      style={({ pressed }) => [
                        styles.placeBetBtn,
                        { backgroundColor: theme.accent, shadowColor: theme.accent },
                        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                      ]}
                    >
                      {bookLogo && (
                        <Image source={bookLogo} style={styles.placeBetLogo} contentFit="contain" />
                      )}
                      <Text style={styles.placeBetText}>Place Bet</Text>
                      <Ionicons name="open-outline" size={16} color={colors.background} />
                    </Pressable>
                  );
                })()}
              </View>
            )}
          </View>
        );
      })}

      <View style={{ height: spacing[8] }} />
    </ScrollView>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing[2],
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
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
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.primary,
    fontFamily: typography.fontFamily.bold,
  },
  tabContent: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing[3],
  },

  // Bookmaker filter
  filterScroll: {
    marginBottom: spacing[3],
    flexGrow: 0,
  },
  filterContent: {
    gap: spacing[2],
    paddingRight: spacing[4],
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  filterChipActive: {
    backgroundColor: "rgba(0, 215, 215, 0.1)",
    borderColor: "rgba(0, 215, 215, 0.3)",
  },
  filterChipText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  filterChipTextActive: {
    color: colors.primary,
    fontFamily: typography.fontFamily.bold,
  },
  filterChipLogo: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },

  // Suggested tab
  suggestedScroll: {
    flex: 1,
  },
  suggestedContent: {
    paddingHorizontal: spacing[4],
  },
  suggestedTitle: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    marginBottom: 2,
  },
  suggestedSubtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginBottom: spacing[4],
  },

  // Slip card — solid dark background for visibility
  slipCard: {
    marginBottom: spacing[3],
  },
  slipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    backgroundColor: "rgba(16, 20, 28, 0.95)",
  },
  slipHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    flex: 1,
  },
  slipIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  slipName: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1,
  },
  slipMeta: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    marginTop: 1,
  },
  slipBookBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  slipBookLogo: {
    width: 14,
    height: 14,
    borderRadius: 2,
  },
  slipBookText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  slipHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  slipOddsCol: {
    alignItems: "flex-end",
  },
  slipOddsLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    letterSpacing: 0.3,
  },
  slipOddsValue: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
  },

  // Expanded legs — tappable card layout
  slipLegsContainer: {
    marginTop: spacing[2],
    gap: spacing[2],
  },
  legCard: {
    backgroundColor: "rgba(16, 20, 28, 0.92)",
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  legCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  legCardContent: {
    flexDirection: "row",
    gap: spacing[3],
  },
  legHeadshotWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignSelf: "center",
  },
  legHeadshot: {
    width: 44,
    height: 44,
  },
  legHeadshotPlaceholder: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  legDetails: {
    flex: 1,
    gap: spacing[1],
  },
  legTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  legNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    flex: 1,
  },
  legPlayerName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  edgeBadge: {
    backgroundColor: "rgba(167, 139, 250, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  edgeBadgeText: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    color: "#A78BFA",
    letterSpacing: 0.5,
  },
  legOddsText: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  legPickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  legStatType: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  legDirection: {
    fontSize: 13,
    fontFamily: typography.fontFamily.semibold,
  },
  legAvg: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  legMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  legTeam: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  legMetaTags: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  legHitRate: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
  },
  legBookLogo: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },

  // Place bet
  placeBetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    height: 52,
    borderRadius: borderRadius.full,
    marginTop: spacing[2],
  },
  placeBetLogo: {
    width: 22,
    height: 22,
  },
  placeBetText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.background,
  },

  // Empty
  emptyText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  emptySubtext: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
});

export default BuilderView;
