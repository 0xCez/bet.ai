import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  colors,
  spacing,
  borderRadius,
  typography,
  glass,
} from "../../constants/designTokens";
import { getPlayerImage } from "../../utils/playerImages";
import { getNBATeamLogo } from "../../utils/teamLogos";
import PropChartBarGraph, {
  GameLogEntry,
} from "../../components/ui/PropChartBarGraph";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const CHART_URL =
  "https://us-central1-betai-f9176.cloudfunctions.net/getPlayerPropChart";

// ── Bookmaker logos ──

const BOOKMAKER_LOGOS: Record<string, any> = {
  DK: require("../../assets/images/Draftkings.png"),
  DraftKings: require("../../assets/images/Draftkings.png"),
  FD: require("../../assets/images/Fanduel.png"),
  FanDuel: require("../../assets/images/Fanduel.png"),
  MGM: require("../../assets/images/Betmgm.png"),
  BetMGM: require("../../assets/images/Betmgm.png"),
  CAESARS: require("../../assets/images/Caesars.png"),
  Caesars: require("../../assets/images/Caesars.png"),
  ESPN: require("../../assets/images/Espnbet.png"),
  ESPNBet: require("../../assets/images/Espnbet.png"),
  BR: require("../../assets/images/Betrivers.png"),
  BetRivers: require("../../assets/images/Betrivers.png"),
  BOV: require("../../assets/images/Bovada.png"),
  Bovada: require("../../assets/images/Bovada.png"),
  FAN: require("../../assets/images/fanatics.png"),
  Fanatics: require("../../assets/images/fanatics.png"),
  HR: require("../../assets/images/Hardrockbet.png"),
  "Hard Rock": require("../../assets/images/Hardrockbet.png"),
  BALLY: require("../../assets/images/Ballybet.png"),
  BallyBet: require("../../assets/images/Ballybet.png"),
};

// ── Types ──

interface ChartData {
  success: boolean;
  source: "edge" | "stack";
  player: {
    name: string;
    position: string | null;
    team: string;
    teamCode: string;
    headshotUrl: string | null;
  };
  matchup: {
    opponent: string;
    opponentCode: string;
    isHome: boolean;
    gameTime: string;
    home: string;
    away: string;
  };
  prop: {
    stat: string;
    statType: string;
    line: number;
    prediction: string;
    oddsOver: number | null;
    oddsUnder: number | null;
    bookmaker: string | null;
    avg: number | null;
    trend: number | null;
    green: number | null;
    defRank: number | null;
    edge?: number | null;
  };
  gameLogs: GameLogEntry[];
  hitRates: {
    l5: HitRate;
    l10: HitRate;
    l20: HitRate;
    season: HitRate;
    h2h: HitRate;
  };
  safeLines: SafeLine[];
}

interface HitRate {
  over: number;
  total: number;
  pct: number;
}

type ChartWindow = "season" | "h2h" | "l5" | "l10" | "l20";

interface SafeLine {
  statType: string;
  stat: string;
  prediction: string;
  altLine: number;
  altOdds: number;
  bookmaker: string | null;
  l10HitPct: number | null;
  sznHitPct: number | null;
  l10Avg: number | null;
  parlayEdge: number | null;
  greenScore: number | null;
}


// ── Helpers ──

function formatGameTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tmrw ${time}`;
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${time}`;
}

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getPlayerInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getTeamAbbrev(teamName: string): string {
  const map: Record<string, string> = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
    "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
    "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
    "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "LA Clippers": "LAC", "Los Angeles Clippers": "LAC",
    "Los Angeles Lakers": "LAL", "LA Lakers": "LAL",
    "Memphis Grizzlies": "MEM", "Miami Heat": "MIA", "Milwaukee Bucks": "MIL",
    "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
    "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
    "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC",
    "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR", "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
  };
  return map[teamName] || teamName.substring(0, 3).toUpperCase();
}

const STAT_SHORT: Record<string, string> = {
  points: "PTS", rebounds: "REB", assists: "AST", steals: "STL",
  blocks: "BLK", turnovers: "TO", threePointersMade: "3PT",
  "points+rebounds": "PTS+REB", "points+assists": "PTS+AST",
  "rebounds+assists": "REB+AST", "points+rebounds+assists": "PRA",
  "blocks+steals": "BLK+STL",
};
function formatStatShort(st: string): string {
  return STAT_SHORT[st] || st.replace(/[_+]/g, "+").toUpperCase();
}

// ── Tappable Hit Rate Card ──

const TAPPABLE_WINDOWS = new Set<ChartWindow>(["l5", "l10", "l20"]);

const HitRateCard: React.FC<{
  label: string;
  windowKey: ChartWindow;
  rate: HitRate;
  selected: boolean;
  onPress: (key: ChartWindow) => void;
}> = ({ label, windowKey, rate, selected, onPress }) => {
  const isTappable = TAPPABLE_WINDOWS.has(windowKey);
  const fractionColor =
    rate.pct >= 60
      ? colors.success
      : rate.pct < 40
      ? colors.destructive
      : colors.foreground;

  return (
    <Pressable
      disabled={!isTappable}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(windowKey);
      }}
      style={[styles.hitRateCard, isTappable && selected && styles.hitRateCardSelected]}
    >
      <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.hitRateContent}>
        <Text style={[styles.hitRateLabel, isTappable && selected && { color: colors.primary }]}>{label}</Text>
        <Text style={[styles.hitRateFraction, { color: fractionColor }]}>
          {rate.over}/{rate.total}
        </Text>
        <Text style={[styles.hitRatePct, { color: fractionColor }]}>
          {rate.pct}%
        </Text>
      </View>
    </Pressable>
  );
};

// ── Green Score Dots ──

const GreenScoreDots: React.FC<{ score: number; size?: number }> = ({ score, size = 6 }) => (
  <View style={styles.greenDots}>
    {Array.from({ length: 5 }).map((_, i) => (
      <View
        key={i}
        style={[
          { width: size, height: size, borderRadius: size / 2 },
          i < score ? styles.greenDotFilled : styles.greenDotEmpty,
        ]}
      />
    ))}
  </View>
);


// ── Shimmer Skeleton ──

const ChartSkeleton: React.FC = () => (
  <View style={styles.skeletonContainer}>
    <View style={styles.skeletonHeader}>
      <View style={[styles.skeleton, { width: 72, height: 72, borderRadius: 36 }]} />
      <View style={{ flex: 1, gap: 8, marginLeft: 12 }}>
        <View style={[styles.skeleton, { width: 160, height: 20 }]} />
        <View style={[styles.skeleton, { width: 100, height: 16 }]} />
        <View style={[styles.skeleton, { width: 140, height: 14 }]} />
      </View>
    </View>
    <View style={[styles.skeleton, { width: "100%", height: 300, borderRadius: borderRadius.lg, marginTop: spacing[4] }]} />
    <View style={{ flexDirection: "row", gap: spacing[2], marginTop: spacing[4] }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.skeleton, { flex: 1, height: 80, borderRadius: borderRadius.lg }]} />
      ))}
    </View>
  </View>
);

// ── Main Screen ──

export default function PlayerPropChartScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    playerName?: string;
    statType?: string;
    line?: string;
  }>();

  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<ChartWindow>("l10");
  const [activeStat, setActiveStat] = useState<string>(params.statType || "");
  const [activeLine, setActiveLine] = useState<number>(Number(params.line) || 0);

  const playerName = params.playerName || "";

  const fetchChartData = useCallback(async (st: string, ln: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(CHART_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName, statType: st, line: ln }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to load chart data");
        return;
      }
      setData(json);
      setSelectedWindow("l10"); // Reset to L10 on new prop load
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [playerName]);

  useEffect(() => {
    if (playerName && activeStat) {
      fetchChartData(activeStat, activeLine);
    }
  }, [playerName, activeStat, activeLine]);

  // Filter game logs based on selected window
  const filteredGameLogs = useMemo(() => {
    if (!data) return [];
    if (selectedWindow === "h2h") {
      return data.gameLogs.filter((g) => g.opponent === data.matchup.opponent);
    }
    return data.gameLogs;
  }, [data, selectedWindow]);

  const chartMaxGames = useMemo(() => {
    switch (selectedWindow) {
      case "l5": return 5;
      case "l10": return 10;
      case "l20": return 20;
      case "season": return 100; // Show all available
      case "h2h": return 100; // Show all H2H games
      default: return 10;
    }
  }, [selectedWindow]);

  // Local player image fallback
  const localPlayerImage = data ? getPlayerImage(data.player.name, data.player.teamCode) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.topBarTitle}>Player Props</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ChartSkeleton />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => fetchChartData(activeStat, activeLine)} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            {/* ── Player Header Card ── */}
            <View style={styles.headerCard}>
              <LinearGradient
                colors={["rgba(0, 215, 215, 0.08)", "rgba(22, 26, 34, 0.95)", "rgba(22, 26, 34, 1)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <BlurView intensity={glass.card.blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />

              <View style={styles.headerContent}>
                <View style={styles.headshotContainer}>
                  {data.player.headshotUrl ? (
                    <ExpoImage source={{ uri: data.player.headshotUrl }} style={styles.headshot} contentFit="cover" />
                  ) : localPlayerImage ? (
                    <ExpoImage source={localPlayerImage} style={styles.headshot} contentFit="cover" />
                  ) : (
                    <View style={styles.headshotFallback}>
                      <Text style={styles.headshotInitials}>{getPlayerInitials(data.player.name)}</Text>
                    </View>
                  )}
                  {(() => {
                    const teamLogo = getNBATeamLogo(data.player.team);
                    return teamLogo ? (
                      <View style={styles.teamLogoOverlay}>
                        <ExpoImage source={teamLogo} style={styles.teamLogoSmall} contentFit="contain" />
                      </View>
                    ) : null;
                  })()}
                </View>

                <View style={styles.playerInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.playerName} numberOfLines={1}>{data.player.name}</Text>
                    {data.player.position && <Text style={styles.position}>{data.player.position}</Text>}
                  </View>
                  <Text style={styles.statLine}>{data.prop.stat} {data.prop.line}</Text>
                  <Text style={styles.matchupText}>
                    {getTeamAbbrev(data.matchup.away)} @ {getTeamAbbrev(data.matchup.home)} {" · "}
                    {formatGameTime(data.matchup.gameTime)}
                  </Text>
                </View>
              </View>

              {/* Odds + Bookmaker row */}
              <View style={styles.oddsRow}>
                {data.prop.bookmaker && BOOKMAKER_LOGOS[data.prop.bookmaker] && (
                  <ExpoImage source={BOOKMAKER_LOGOS[data.prop.bookmaker]} style={styles.bookLogo} contentFit="contain" />
                )}
                <View style={styles.oddsContainer}>
                  <Text style={styles.oddsLabel}>Line: {data.prop.line}</Text>
                  <View style={styles.oddsValues}>
                    <Text style={styles.oddsOver}>O {formatOdds(data.prop.oddsOver)}</Text>
                    <Text style={styles.oddsUnder}>U {formatOdds(data.prop.oddsUnder)}</Text>
                  </View>
                </View>
                {data.prop.avg != null && (
                  <View style={styles.avgBadge}>
                    <Text style={styles.avgLabel}>AVG</Text>
                    <Text style={styles.avgValue}>{data.prop.avg}</Text>
                  </View>
                )}
                {data.prop.green != null && <GreenScoreDots score={data.prop.green} />}
              </View>
            </View>

            {/* ── Bar Chart ── */}
            <View style={styles.chartSection}>
              <PropChartBarGraph
                gameLogs={filteredGameLogs}
                line={data.prop.line}
                matchup={selectedWindow !== "h2h" ? {
                  opponent: data.matchup.opponent,
                  opponentCode: data.matchup.opponentCode,
                } : undefined}
                maxGames={chartMaxGames}
              />
            </View>

            {/* ── Hit Rate Cards (tappable) ── */}
            <View style={styles.hitRatesRow}>
              <HitRateCard label="Season" windowKey="season" rate={data.hitRates.season} selected={selectedWindow === "season"} onPress={setSelectedWindow} />
              <HitRateCard label="H2H" windowKey="h2h" rate={data.hitRates.h2h} selected={selectedWindow === "h2h"} onPress={setSelectedWindow} />
              <HitRateCard label="L5" windowKey="l5" rate={data.hitRates.l5} selected={selectedWindow === "l5"} onPress={setSelectedWindow} />
              <HitRateCard label="L10" windowKey="l10" rate={data.hitRates.l10} selected={selectedWindow === "l10"} onPress={setSelectedWindow} />
              <HitRateCard label="L20" windowKey="l20" rate={data.hitRates.l20} selected={selectedWindow === "l20"} onPress={setSelectedWindow} />
            </View>

            {/* ── Safe Lines (validated alt lines from parlay stack) ── */}
            {data.safeLines && data.safeLines.length > 0 && (
              <View style={styles.safeLinesSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                  <Text style={styles.sectionTitle}>SAFE LINES</Text>
                  <Text style={styles.sectionSubtitle}>Validated alt lines</Text>
                </View>
                {data.safeLines.map((sl, i) => {
                  const isOver = sl.prediction === "over";
                  const bookLogo = sl.bookmaker ? BOOKMAKER_LOGOS[sl.bookmaker] : null;

                  return (
                    <Pressable
                      key={i}
                      style={styles.safeLineRow}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setActiveStat(sl.statType);
                        setActiveLine(sl.altLine);
                      }}
                    >
                      <View style={styles.safeLineLeft}>
                        <Text style={styles.safeLineStat}>{formatStatShort(sl.statType)}</Text>
                        <Text style={[styles.safeLineDir, isOver ? styles.dirOver : styles.dirUnder]}>
                          {isOver ? "O" : "U"} {sl.altLine}
                        </Text>
                      </View>

                      <View style={styles.safeLineCenter}>
                        {sl.l10HitPct != null && (
                          <View style={styles.safeLineHitBadge}>
                            <Text style={styles.safeLineHitPct}>{sl.l10HitPct}%</Text>
                            <Text style={styles.safeLineHitLabel}>L10</Text>
                          </View>
                        )}
                        {sl.l10Avg != null && (
                          <Text style={styles.safeLineAvg}>Avg {sl.l10Avg}</Text>
                        )}
                      </View>

                      <View style={styles.safeLineRight}>
                        {sl.altOdds != null && (
                          <Text style={styles.safeLineOdds}>{formatOdds(sl.altOdds)}</Text>
                        )}
                        {bookLogo && (
                          <ExpoImage source={bookLogo} style={styles.safeLineBook} contentFit="contain" />
                        )}
                        {sl.greenScore != null && <GreenScoreDots score={sl.greenScore} size={5} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  topBarTitle: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[12],
  },

  // ── Header Card ──
  headerCard: {
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: glass.card.backgroundColor,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    padding: spacing[4],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  headshotContainer: {
    position: "relative",
  },
  headshot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "rgba(0, 215, 215, 0.3)",
    backgroundColor: colors.secondary,
  },
  headshotFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: "rgba(0, 215, 215, 0.3)",
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headshotInitials: {
    fontSize: 24,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  teamLogoOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  teamLogoSmall: {
    width: 18,
    height: 18,
  },
  playerInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  playerName: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    flexShrink: 1,
  },
  position: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  statLine: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  matchupText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: 2,
  },

  // ── Odds Row ──
  oddsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  bookLogo: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
  },
  oddsContainer: {
    gap: 2,
  },
  oddsLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  oddsValues: {
    flexDirection: "row",
    gap: spacing[3],
  },
  oddsOver: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
  },
  oddsUnder: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: "#FF6B6B",
  },
  avgBadge: {
    alignItems: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(0, 215, 215, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    marginLeft: "auto",
  },
  avgLabel: {
    fontSize: 9,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
  },
  avgValue: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },

  // ── Chart Section ──
  chartSection: {
    marginTop: spacing[5],
    marginHorizontal: -spacing[6], // Cancel parent scroll padding — full screen width
  },

  // ── Hit Rate Cards ──
  hitRatesRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[5],
  },
  hitRateCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    backgroundColor: glass.card.backgroundColor,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  hitRateCardSelected: {
    borderColor: "rgba(0, 215, 215, 0.4)",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  hitRateContent: {
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[1],
    gap: 2,
  },
  hitRateLabel: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    letterSpacing: 0.5,
  },
  hitRateFraction: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
  },
  hitRatePct: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },

  // ── Safe Lines Section ──
  safeLinesSection: {
    marginTop: spacing[5],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 1.2,
    color: colors.primary,
  },
  sectionSubtitle: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    marginLeft: "auto",
  },
  safeLineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(34, 197, 94, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.12)",
    marginBottom: spacing[2],
  },
  safeLineLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    minWidth: 110,
  },
  safeLineStat: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    minWidth: 48,
  },
  safeLineDir: {
    fontSize: 13,
    fontFamily: typography.fontFamily.semibold,
  },
  safeLineCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    flex: 1,
  },
  safeLineHitBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  safeLineHitPct: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
  },
  safeLineHitLabel: {
    fontSize: 9,
    fontFamily: typography.fontFamily.medium,
    color: colors.success,
  },
  safeLineAvg: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  safeLineRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  safeLineOdds: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  safeLineBook: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
  },

  dirOver: {
    color: colors.success,
  },
  dirUnder: {
    color: "#FF6B6B",
  },

  // ── Green Score ──
  greenDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  greenDotFilled: {
    backgroundColor: colors.primary,
  },
  greenDotEmpty: {
    backgroundColor: "rgba(122, 139, 163, 0.25)",
  },

  // ── Error ──
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[12],
    gap: spacing[4],
  },
  errorText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.full,
    backgroundColor: colors.rgba.primary15,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  retryText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },

  // ── Skeleton ──
  skeletonContainer: {
    paddingTop: spacing[2],
  },
  skeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeleton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
  },
});
