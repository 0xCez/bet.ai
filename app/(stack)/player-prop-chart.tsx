import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Modal,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopBar } from "../../components/ui/TopBar";
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

// ── NBA Team Primary Colors ──
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
    betScore?: number | null;
  };
  gameLogs: GameLogEntry[];
  hitRates: {
    l5: HitRate;
    l10: HitRate;
    l20: HitRate;
    season: HitRate;
    h2h: HitRate;
  };
  defense: DefenseContext | null;
  ev: number | null;
  safeLines: SafeLine[];
  otherProps: OtherProp[];
}

interface DefenseContext {
  rank: number;
  totalTeams: number;
  label: string;
  allowed: number;
  stat: string;
  opponentCode: string;
  supports: boolean;
  narrative: string;
}

interface OtherProp {
  statType: string;
  stat: string;
  line: number;
  prediction: string;
  oddsOver: number | null;
  oddsUnder: number | null;
  bookmaker: string | null;
  l10Avg: number | null;
  greenScore: number | null;
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
}


// ── Helpers ──

// Map home team code → IANA timezone for venue-local formatting
const TEAM_TIMEZONE: Record<string, string> = {
  ATL: "America/New_York", BOS: "America/New_York", BKN: "America/New_York",
  CHA: "America/New_York", CLE: "America/New_York", DET: "America/Detroit",
  IND: "America/Indiana/Indianapolis", MIA: "America/New_York",
  NYK: "America/New_York", ORL: "America/New_York", PHI: "America/New_York",
  TOR: "America/Toronto", WAS: "America/New_York",
  CHI: "America/Chicago", DAL: "America/Chicago", HOU: "America/Chicago",
  MEM: "America/Chicago", MIL: "America/Chicago", MIN: "America/Chicago",
  NOP: "America/Chicago", OKC: "America/Chicago", SAS: "America/Chicago",
  DEN: "America/Denver", UTA: "America/Denver", PHX: "America/Phoenix",
  POR: "America/Los_Angeles", GSW: "America/Los_Angeles",
  LAC: "America/Los_Angeles", LAL: "America/Los_Angeles",
  SAC: "America/Los_Angeles",
};

function formatGameTime(iso: string, homeTeamCode?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = homeTeamCode ? TEAM_TIMEZONE[homeTeamCode] : undefined;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true };
  if (tz) opts.timeZone = tz;
  return d.toLocaleString("en-US", opts);
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
    from?: string;
  }>();

  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<ChartWindow>("l10");
  const [activeStat, setActiveStat] = useState<string>(params.statType || "");
  const [activeLine, setActiveLine] = useState<number>(Number(params.line) || 0);
  const [showLineDropdown, setShowLineDropdown] = useState(false);

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
      <TopBar
        showBack
        onBackPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (params.from) {
            // Navigate back to the specific tab the user came from
            const page = params.from === "picks" ? "picks"
              : params.from === "parlay" || params.from === "builder" ? "parlay"
              : "board";
            router.replace({ pathname: "/home" as any, params: { page } });
          } else if (router.canGoBack()) {
            router.back();
          } else {
            router.replace({ pathname: "/home" as any, params: { page: "board" } });
          }
        }}
      />

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
            {(() => {
              const teamColor = NBA_TEAM_COLORS[data.player.teamCode] || "#0D7377";
              const teamLogoWatermark = getNBATeamLogo(data.player.team);
              return (
                <View style={styles.headerCard}>
                  <LinearGradient
                    colors={[`${teamColor}40`, `${teamColor}18`, "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* Team logo watermark — large, faded, right-aligned */}
                  {teamLogoWatermark && (
                    <View style={styles.teamWatermark}>
                      <ExpoImage
                        source={teamLogoWatermark}
                        style={styles.teamWatermarkImage}
                        contentFit="contain"
                      />
                    </View>
                  )}

                  <View style={styles.headerContent}>
                    <View style={styles.headshotContainer}>
                      {data.player.headshotUrl ? (
                        <ExpoImage source={{ uri: data.player.headshotUrl }} style={[styles.headshot, { borderColor: `${teamColor}66` }]} contentFit="cover" />
                      ) : localPlayerImage ? (
                        <ExpoImage source={localPlayerImage} style={[styles.headshot, { borderColor: `${teamColor}66` }]} contentFit="cover" />
                      ) : (
                        <View style={[styles.headshotFallback, { borderColor: `${teamColor}66` }]}>
                          <Text style={[styles.headshotInitials, { color: teamColor }]}>{getPlayerInitials(data.player.name)}</Text>
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

                      {/* Direction badge */}
                      <View style={[styles.dirBadge, {
                        backgroundColor: data.prop.prediction === "over" ? "rgba(34,197,94,0.15)" : "rgba(255,107,107,0.15)",
                      }]}>
                        <Text style={[styles.dirBadgeText, {
                          color: data.prop.prediction === "over" ? colors.success : "#FF6B6B",
                        }]}>
                          {data.prop.prediction === "over" ? "OVER" : "UNDER"}
                        </Text>
                      </View>

                      {/* Stat line with dropdown trigger */}
                      {data.otherProps && data.otherProps.length > 0 ? (
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setShowLineDropdown(true);
                          }}
                          style={styles.statLineRow}
                        >
                          <Text style={styles.statLineBold}>
                            {formatStatShort(activeStat)} {data.prop.prediction === "over" ? "O" : "U"} {data.prop.line}
                          </Text>
                          <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
                        </Pressable>
                      ) : (
                        <Text style={styles.statLineBold}>
                          {formatStatShort(activeStat)} {data.prop.prediction === "over" ? "O" : "U"} {data.prop.line}
                        </Text>
                      )}

                      <Text style={styles.matchupText}>
                        {getTeamAbbrev(data.matchup.away)} @ {getTeamAbbrev(data.matchup.home)} {" · "}
                        {formatGameTime(data.matchup.gameTime, getTeamAbbrev(data.matchup.home))}
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
                    {data.ev != null && (
                      <View style={[styles.valueBadge, {
                        borderColor: data.ev >= 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(255, 107, 107, 0.3)",
                        backgroundColor: data.ev >= 0 ? "rgba(34, 197, 94, 0.08)" : "rgba(255, 107, 107, 0.08)",
                      }]}>
                        <Text style={styles.valueLabel}>EV</Text>
                        <Text style={[styles.valueScore, {
                          color: data.ev >= 0 ? colors.success : "#FF6B6B",
                        }]}>{data.ev >= 0 ? "+" : ""}{data.ev}%</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

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

            {/* ── Defense Matchup Section ── */}
            {data.defense && (
              <View style={styles.defenseSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="shield-half" size={14} color={colors.primary} />
                  <Text style={styles.sectionTitle}>DEFENSE MATCHUP</Text>
                </View>
                <View style={styles.defenseCard}>
                  <View style={styles.defenseRow}>
                    {(() => {
                      const oppLogo = getNBATeamLogo(data.matchup.opponent);
                      return oppLogo ? (
                        <ExpoImage source={oppLogo} style={styles.defenseTeamLogo} contentFit="contain" />
                      ) : null;
                    })()}
                    <Text style={styles.defenseTeam}>vs {data.defense.opponentCode}</Text>
                    <View style={[styles.defenseRankBadge, {
                      backgroundColor: data.defense.rank <= 10 ? "rgba(34, 197, 94, 0.12)" : data.defense.rank >= 21 ? "rgba(255, 107, 107, 0.12)" : "rgba(0, 215, 215, 0.08)",
                    }]}>
                      <Text style={[styles.defenseRankText, {
                        color: data.defense.rank <= 10 ? colors.success : data.defense.rank >= 21 ? "#FF6B6B" : colors.primary,
                      }]}>DEF #{data.defense.rank}/{data.defense.totalTeams}</Text>
                    </View>
                    <Text style={[styles.defenseLabel, {
                      color: data.defense.rank <= 5 ? colors.success : data.defense.rank <= 12 ? colors.success : data.defense.rank <= 18 ? colors.mutedForeground : "#FF6B6B",
                    }]}>{data.defense.label}</Text>
                  </View>
                  <Text style={styles.defenseAllowed}>
                    Allows {data.defense.allowed} {data.defense.stat}/G to opponents
                  </Text>
                  <View style={[styles.defenseNarrativeTag, {
                    backgroundColor: data.defense.supports ? "rgba(34, 197, 94, 0.12)" : "rgba(255, 165, 0, 0.12)",
                  }]}>
                    <Ionicons
                      name={data.defense.supports ? "checkmark-circle" : "warning"}
                      size={12}
                      color={data.defense.supports ? colors.success : "#FFA500"}
                    />
                    <Text style={[styles.defenseNarrativeText, {
                      color: data.defense.supports ? colors.success : "#FFA500",
                    }]}>
                      {data.defense.narrative} {data.prop.prediction === "over" ? "Over" : "Under"}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── Safe Lines (validated alt lines from parlay stack) ── */}
            {data.safeLines && data.safeLines.length > 0 && (
              <View style={styles.safeLinesSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                  <Text style={styles.sectionTitle}>ALT LINES</Text>
                  <Text style={styles.sectionSubtitle}>Alternative lines</Text>
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
                        {bookLogo && (
                          <ExpoImage source={bookLogo} style={styles.safeLineBook} contentFit="contain" />
                        )}
                        {sl.altOdds != null && (
                          <Text style={styles.safeLineOdds}>{formatOdds(sl.altOdds)}</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

          </>
        ) : null}
      </ScrollView>

      {/* ── Line Selector Dropdown ── */}
      {data && data.otherProps && data.otherProps.length > 0 && (
        <Modal
          visible={showLineDropdown}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLineDropdown(false)}
        >
          <Pressable style={styles.dropdownOverlay} onPress={() => setShowLineDropdown(false)}>
            <View style={styles.dropdownContainer}>
              <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={styles.dropdownContent}>
                <Text style={styles.dropdownTitle}>Other Lines</Text>

                {/* Currently viewing */}
                <View style={[styles.dropdownOption, styles.dropdownOptionActive]}>
                  <Text style={styles.dropdownStatType}>{formatStatShort(activeStat)}</Text>
                  <Text style={styles.dropdownLine}>
                    {data.prop.prediction === "over" ? "O" : "U"} {activeLine}
                  </Text>
                  {data.prop.bookmaker && BOOKMAKER_LOGOS[data.prop.bookmaker] && (
                    <ExpoImage source={BOOKMAKER_LOGOS[data.prop.bookmaker]} style={styles.dropdownBookLogo} contentFit="contain" />
                  )}
                  <Ionicons name="checkmark" size={16} color={colors.primary} style={{ marginLeft: "auto" }} />
                </View>

                {/* Other lines */}
                {data.otherProps.map((op, i) => {
                  const isOver = op.prediction === "over";
                  const bookLogo = op.bookmaker ? BOOKMAKER_LOGOS[op.bookmaker] : null;
                  return (
                    <Pressable
                      key={`${op.statType}-${op.line}-${i}`}
                      style={({ pressed }) => [styles.dropdownOption, pressed && styles.dropdownOptionPressed]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setActiveStat(op.statType);
                        setActiveLine(op.line);
                        setShowLineDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownStatType}>{formatStatShort(op.statType)}</Text>
                      <Text style={[styles.dropdownLine, isOver ? styles.dirOver : styles.dirUnder]}>
                        {isOver ? "O" : "U"} {op.line}
                      </Text>
                      {bookLogo && (
                        <ExpoImage source={bookLogo} style={styles.dropdownBookLogo} contentFit="contain" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  teamWatermark: {
    position: "absolute",
    right: -20,
    top: "50%",
    transform: [{ translateY: -75 }],
    width: 150,
    height: 150,
    opacity: 0.06,
  },
  teamWatermarkImage: {
    width: 150,
    height: 150,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    position: "relative",
    zIndex: 1,
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
  statLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  statLineBold: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
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
    marginHorizontal: -spacing[6],
    alignItems: "center",
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
    gap: spacing[1],
    minWidth: 100,
  },
  safeLineStat: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    minWidth: 40,
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

  dirBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 2,
  },
  dirBadgeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.8,
  },

  // ── Defense Matchup Section ──
  defenseSection: {
    marginTop: spacing[5],
  },
  defenseCard: {
    backgroundColor: glass.card.backgroundColor,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    gap: spacing[2],
  },
  defenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  defenseTeamLogo: {
    width: 24,
    height: 24,
  },
  defenseTeam: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  defenseRankBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  defenseRankText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.3,
  },
  defenseLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.semibold,
  },
  defenseAllowed: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    marginLeft: spacing[1],
  },
  defenseNarrativeTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  defenseNarrativeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.3,
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

  // ── Value Badge ──
  valueBadge: {
    alignItems: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  valueLabel: {
    fontSize: 9,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
  },
  valueScore: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
  },

  // ── Line Selector Dropdown ──
  dropdownOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  dropdownContainer: {
    width: SCREEN_WIDTH - spacing[8] * 2,
    maxHeight: 400,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
  },
  dropdownContent: {
    padding: spacing[4],
    gap: spacing[2],
  },
  dropdownTitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 1,
    marginBottom: spacing[1],
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
  },
  dropdownOptionActive: {
    backgroundColor: "rgba(0, 215, 215, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.25)",
  },
  dropdownOptionPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  dropdownStatType: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    minWidth: 48,
  },
  dropdownLine: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semibold,
    color: colors.foreground,
  },
  dropdownBookLogo: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
});
