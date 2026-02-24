import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Animated,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopBar } from "../../components/ui/TopBar";
import PropChartBarGraph, { GameLogEntry } from "../../components/ui/PropChartBarGraph";
import {
  colors,
  spacing,
  borderRadius,
  typography,
  glass,
} from "../../constants/designTokens";
import { getPlayerImage } from "../../utils/playerImages";
import { getNBATeamLogo } from "../../utils/teamLogos";
import { openBookmakerLink } from "../../utils/bookmakerLinks";
import { BOOKMAKER_LOGOS } from "../../utils/formatters";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const API_URL =
  "https://us-central1-betai-f9176.cloudfunctions.net/getPlayerSearch";
// ── NBA Team Colors ──
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

// ── Stat short names ──
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

// ── Types ──

interface AvailableStat {
  key: string;
  label: string;
  hasProp: boolean;
}

interface ChartData {
  statType: string;
  stat: string;
  line: number;
  prediction: string;
  syntheticLine: boolean;
  l10Avg: number | null;
  gameLogs: GameLogEntry[];
  hitRates: { l5: HitRate; l10: HitRate; l20: HitRate; season: HitRate };
  defense: DefenseContext | null;
  ev: number | null;
}

interface StandardLine {
  statType: string;
  stat: string;
  line: number;
  prediction: string;
  oddsOver: number | null;
  oddsUnder: number | null;
  bookmaker: string | null;
  l10Avg: number | null;
  greenScore: number | null;
  betScore: number | null;
  edge: number | null;
}

interface AltLine {
  statType: string;
  stat: string;
  altLine: number;
  prediction: string;
  altOdds: number;
  bookmaker: string | null;
  l10Avg: number | null;
  parlayEdge: number | null;
  l10HitPct: number | null;
}

interface HitRate {
  over: number;
  total: number;
  pct: number;
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

interface ProfileData {
  success: boolean;
  player: {
    name: string;
    position: string | null;
    team: string;
    teamCode: string;
    headshotUrl: string | null;
  };
  hasProps: boolean;
  matchup: {
    opponent: string;
    opponentCode: string;
    isHome: boolean;
    gameTime: string;
    home: string;
    away: string;
  } | null;
  availableStats: AvailableStat[];
  standardLines: StandardLine[];
  altLines: AltLine[];
  charts: Record<string, ChartData>;
  chart: ChartData;
}

// ── Helpers ──

function formatOdds(odds: number | null): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getPlayerInitials(name: string): string {
  return name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);
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

// ── Green Score Dots ──

const GreenScoreDots: React.FC<{ score: number }> = ({ score }) => (
  <View style={styles.greenDots}>
    {Array.from({ length: 5 }).map((_, i) => (
      <View
        key={i}
        style={[styles.greenDot, i < score ? styles.greenDotFilled : styles.greenDotEmpty]}
      />
    ))}
  </View>
);

// ── Skeleton ──

const ProfileSkeleton: React.FC = () => (
  <View style={styles.skeletonContainer}>
    <View style={styles.skeletonHeader}>
      <View style={[styles.skeleton, { width: 72, height: 72, borderRadius: 36 }]} />
      <View style={{ flex: 1, gap: 8, marginLeft: 12 }}>
        <View style={[styles.skeleton, { width: "70%", height: 20 }]} />
        <View style={[styles.skeleton, { width: "50%", height: 14 }]} />
        <View style={[styles.skeleton, { width: "40%", height: 12 }]} />
      </View>
    </View>
    <View style={{ marginTop: 16, gap: 12 }}>
      <View style={[styles.skeleton, { width: "100%", height: 200 }]} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={[styles.skeleton, { flex: 1, height: 60 }]} />
        ))}
      </View>
    </View>
  </View>
);

// ── Main Screen ──

export default function PlayerProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    playerName?: string;
    from?: string;
    initialView?: string;
    statType?: string;
    line?: string;
  }>();
  const playerName = params.playerName || "";
  const from = params.from || "";

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStat, setActiveStat] = useState<string>("");
  const [selectedRange, setSelectedRange] = useState<"l5" | "l10" | "l20" | "season">("l10");
  const [viewMode, setViewMode] = useState<"props" | "stats">("stats");
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(1)).current;

  // Fade in content when data arrives
  useEffect(() => {
    if (data && !loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }
  }, [data, loading]);

  // Set default viewMode + activeStat when data arrives
  useEffect(() => {
    if (!data) return;
    // Set view mode based on params or prop availability
    if (params.initialView === "props" && data.hasProps && data.standardLines.length > 0) {
      setViewMode("props");
      // If a specific statType was requested, use it
      if (params.statType) {
        setActiveStat(params.statType);
      }
    } else if (params.initialView === "stats" || !data.hasProps || data.standardLines.length === 0) {
      setViewMode("stats");
    } else if (data.hasProps && data.standardLines.length > 0) {
      setViewMode("props");
      // Default to the first standard line's stat
      setActiveStat(data.standardLines[0].statType);
    }
  }, [data]);

  // Fetch the full player profile on mount
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName }),
      });
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setError("Server returned an invalid response. Function may not be deployed yet.");
        return;
      }
      if (!json.success) {
        setError(json.error || "Player not found");
        return;
      }
      setData(json);
      setActiveStat(json.chart?.statType || json.availableStats?.[0]?.key || "points");
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [playerName]);

  useEffect(() => {
    if (playerName) fetchProfile();
  }, [playerName]);

  // Instant stat switching — all chart data pre-loaded from backend
  const handleStatChange = useCallback((statKey: string) => {
    if (!data || statKey === activeStat) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveStat(statKey);
    setSelectedRange("l10");
  }, [data, activeStat]);

  // Toggle view mode with smooth content fade
  const handleToggleView = useCallback(() => {
    if (!data) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Fade out
    Animated.timing(contentFadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      // Swap mode
      setViewMode(prev => {
        const next = prev === "props" ? "stats" : "props";
        // When switching to props, ensure activeStat matches a line
        if (next === "props" && data.standardLines.length > 0) {
          const hasCurrentStat = data.standardLines.some(l => l.statType === activeStat);
          if (!hasCurrentStat) {
            setActiveStat(data.standardLines[0].statType);
          }
        }
        return next;
      });
      setSelectedRange("l10");
      // Fade in
      Animated.timing(contentFadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [data, activeStat, contentFadeAnim]);

  // Active chart derived from pre-loaded charts map
  const activeChart = useMemo((): ChartData | null => {
    if (!data) return null;
    return data.charts?.[activeStat] || data.chart || null;
  }, [data, activeStat]);

  // Active prop for props view — derived from standardLines + charts
  const activeProp = useMemo(() => {
    if (!data?.hasProps) return null;
    const line = data.standardLines.find(l => l.statType === activeStat)
               || data.standardLines[0];
    if (!line) return null;
    const chart = data.charts[line.statType];
    return { ...line, chart };
  }, [data, activeStat]);

  // Local player image
  const localPlayerImage = data ? getPlayerImage(data.player.name, data.player.teamCode) : null;

  // Lines for the currently selected stat
  const currentStdLines = useMemo(() => {
    if (!data) return [];
    return activeStat
      ? data.standardLines.filter((l) => l.statType === activeStat)
      : data.standardLines;
  }, [data, activeStat]);

  const currentAltLines = useMemo(() => {
    if (!data) return [];
    return activeStat
      ? data.altLines.filter((l) => l.statType === activeStat)
      : data.altLines;
  }, [data, activeStat]);

  // All lines (other stats) for the "Other Lines" section
  const otherStdLines = useMemo(() => {
    if (!data) return [];
    return data.standardLines.filter((l) => l.statType !== activeStat);
  }, [data, activeStat]);

  const otherAltLines = useMemo(() => {
    if (!data) return [];
    return data.altLines.filter((l) => l.statType !== activeStat);
  }, [data, activeStat]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TopBar
        showBack
        onBackPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (from) {
            const page = from === "picks" ? "picks"
              : from === "parlay" || from === "builder" ? "parlay"
              : from === "scan" ? "scan"
              : "board";
            router.replace({ pathname: "/home" as any, params: { page } });
          } else {
            router.replace({ pathname: "/home" as any, params: { page: "board" } });
          }
        }}
        rightElement={
          data?.hasProps && data.standardLines.length > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.toggleButton, pressed && styles.toggleButtonPressed]}
              onPress={handleToggleView}
            >
              <Ionicons
                name={viewMode === "props" ? "stats-chart-outline" : "pricetag-outline"}
                size={20}
                color={colors.primary}
              />
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ProfileSkeleton />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={fetchProfile} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* ── Player Header Card (STATIC — same for both views) ── */}
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
                  {teamLogoWatermark && (
                    <View style={styles.teamWatermark}>
                      <ExpoImage source={teamLogoWatermark} style={styles.teamWatermarkImage} contentFit="contain" />
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
                      {data.matchup ? (
                        <Text style={styles.matchupText}>
                          {getTeamAbbrev(data.matchup.away)} @ {getTeamAbbrev(data.matchup.home)}
                        </Text>
                      ) : (
                        <Text style={styles.matchupText}>{data.player.teamCode}</Text>
                      )}
                      <Text style={styles.propsCountText}>
                        {data.hasProps
                          ? `${data.standardLines.length} standard · ${data.altLines.length} alt lines`
                          : data.matchup
                            ? `Next: vs ${data.matchup.opponentCode}`
                            : "No upcoming games"
                        }
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            {/* ── Animated Content Area ── */}
            <Animated.View style={{ opacity: contentFadeAnim }}>

              {viewMode === "props" && activeProp ? (
                /* ═══════════════════════════════════════════ */
                /* ═══         PROPS VIEW                  ═══ */
                /* ═══════════════════════════════════════════ */
                <>
                  {/* ── Stat Pills (show available props) ── */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.statPillsContent}
                    style={styles.statPillsScroll}
                  >
                    {data.availableStats.filter(s => s.hasProp).map((stat) => {
                      const isActive = stat.key === activeProp.statType;
                      return (
                        <Pressable
                          key={stat.key}
                          onPress={() => handleStatChange(stat.key)}
                          style={[styles.statPill, isActive && styles.statPillActive]}
                        >
                          <Text style={[styles.statPillText, isActive && styles.statPillTextActive]}>
                            {stat.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* ── Direction Badge + Stat Line ── */}
                  <View style={styles.propHeaderRow}>
                    <View style={[styles.dirBadge, {
                      backgroundColor: activeProp.prediction === "over" ? "rgba(34,197,94,0.15)" : "rgba(255,107,107,0.15)",
                    }]}>
                      <Text style={[styles.dirBadgeText, {
                        color: activeProp.prediction === "over" ? colors.success : "#FF6B6B",
                      }]}>
                        {activeProp.prediction === "over" ? "OVER" : "UNDER"}
                      </Text>
                    </View>
                    <Text style={styles.propStatLine}>
                      {formatStatShort(activeProp.statType)} {activeProp.prediction === "over" ? "O" : "U"} {activeProp.line}
                    </Text>
                    {activeProp.greenScore != null && <GreenScoreDots score={activeProp.greenScore} />}
                  </View>

                  {/* ── Odds Row ── */}
                  <View style={styles.oddsRow}>
                    {activeProp.bookmaker && BOOKMAKER_LOGOS[activeProp.bookmaker] && (
                      <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openBookmakerLink(activeProp.bookmaker!, "nba"); }}>
                        <ExpoImage source={BOOKMAKER_LOGOS[activeProp.bookmaker]} style={styles.oddsBookLogo} contentFit="contain" />
                      </Pressable>
                    )}
                    <View style={styles.oddsContainer}>
                      <Text style={styles.oddsLabel}>Line: {activeProp.line}</Text>
                      <View style={styles.oddsValues}>
                        <Text style={styles.oddsOver}>O {formatOdds(activeProp.oddsOver)}</Text>
                        <Text style={styles.oddsUnder}>U {formatOdds(activeProp.oddsUnder)}</Text>
                      </View>
                    </View>
                    {activeProp.chart?.l10Avg != null && (
                      <View style={styles.avgBadge}>
                        <Text style={styles.avgLabel}>AVG</Text>
                        <Text style={styles.avgValue}>{activeProp.chart.l10Avg}</Text>
                      </View>
                    )}
                    {activeProp.chart?.ev != null && (
                      <View style={[styles.valueBadge, {
                        borderColor: activeProp.chart.ev >= 0 ? "rgba(34, 197, 94, 0.3)" : "rgba(255, 107, 107, 0.3)",
                        backgroundColor: activeProp.chart.ev >= 0 ? "rgba(34, 197, 94, 0.08)" : "rgba(255, 107, 107, 0.08)",
                      }]}>
                        <Text style={styles.valueLabel}>EV</Text>
                        <Text style={[styles.valueScore, {
                          color: activeProp.chart.ev >= 0 ? colors.success : "#FF6B6B",
                        }]}>{activeProp.chart.ev >= 0 ? "+" : ""}{activeProp.chart.ev}%</Text>
                      </View>
                    )}
                  </View>

                  {/* ── Bar Chart ── */}
                  {activeProp.chart && activeProp.chart.gameLogs.length > 0 && (
                    <View style={styles.chartSection}>
                      <PropChartBarGraph
                        gameLogs={activeProp.chart.gameLogs}
                        line={activeProp.line}
                        matchup={data.matchup ? {
                          opponent: data.matchup.opponent,
                          opponentCode: data.matchup.opponentCode,
                        } : undefined}
                        maxGames={selectedRange === "l5" ? 5 : selectedRange === "l10" ? 10 : selectedRange === "l20" ? 20 : activeProp.chart.gameLogs.length}
                      />
                    </View>
                  )}

                  {/* ── Hit Rate Cards ── */}
                  {activeProp.chart && activeProp.chart.gameLogs.length > 0 && (
                    <View style={styles.hitRatesRow}>
                      {(["l5", "l10", "l20", "season"] as const).map((key) => {
                        const rate = activeProp.chart!.hitRates[key];
                        const label = key === "season" ? "SZN" : key.toUpperCase();
                        const isActive = selectedRange === key;
                        const fractionColor = rate.pct >= 60 ? colors.success : rate.pct < 40 ? "#FF6B6B" : colors.foreground;
                        return (
                          <Pressable
                            key={key}
                            style={[styles.hitRateCard, isActive && styles.hitRateCardActive]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSelectedRange(key);
                            }}
                          >
                            <Text style={[styles.hitRateLabel, isActive && styles.hitRateLabelActive]}>{label}</Text>
                            <Text style={[styles.hitRateFraction, { color: fractionColor }]}>{rate.over}/{rate.total}</Text>
                            <Text style={[styles.hitRatePct, { color: fractionColor }]}>{rate.pct}%</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {/* ── Defense Matchup ── */}
                  {activeProp.chart?.defense && (
                    <View style={styles.defenseSection}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="shield-half" size={14} color={colors.primary} />
                        <Text style={styles.sectionTitle}>DEFENSE MATCHUP</Text>
                      </View>
                      <View style={styles.defenseCard}>
                        <View style={styles.defenseRow}>
                          {(() => {
                            const oppName = data.matchup?.opponent || activeProp.chart!.defense!.opponentCode;
                            const oppLogo = oppName ? getNBATeamLogo(oppName) : null;
                            return oppLogo ? (
                              <ExpoImage source={oppLogo} style={styles.defenseTeamLogo} contentFit="contain" />
                            ) : null;
                          })()}
                          <Text style={styles.defenseTeam}>vs {activeProp.chart.defense.opponentCode}</Text>
                          <View style={[styles.defenseRankBadge, {
                            backgroundColor: activeProp.chart.defense.rank <= 10 ? "rgba(34,197,94,0.12)" : activeProp.chart.defense.rank >= 21 ? "rgba(255,107,107,0.12)" : "rgba(0,215,215,0.08)",
                          }]}>
                            <Text style={[styles.defenseRankText, {
                              color: activeProp.chart.defense.rank <= 10 ? colors.success : activeProp.chart.defense.rank >= 21 ? "#FF6B6B" : colors.primary,
                            }]}>DEF #{activeProp.chart.defense.rank}/30</Text>
                          </View>
                          <Text style={[styles.defenseLabel, {
                            color: activeProp.chart.defense.rank <= 12 ? colors.success : activeProp.chart.defense.rank <= 18 ? colors.mutedForeground : "#FF6B6B",
                          }]}>{activeProp.chart.defense.label}</Text>
                        </View>
                        <Text style={styles.defenseAllowed}>
                          Allows {activeProp.chart.defense.allowed} {activeProp.chart.defense.stat}/G
                        </Text>
                        <View style={[styles.defenseNarrativeTag, {
                          backgroundColor: activeProp.chart.defense.supports ? "rgba(34,197,94,0.12)" : "rgba(255,165,0,0.12)",
                        }]}>
                          <Ionicons
                            name={activeProp.chart.defense.supports ? "checkmark-circle" : "warning"}
                            size={12}
                            color={activeProp.chart.defense.supports ? colors.success : "#FFA500"}
                          />
                          <Text style={[styles.defenseNarrativeText, {
                            color: activeProp.chart.defense.supports ? colors.success : "#FFA500",
                          }]}>
                            {activeProp.chart.defense.narrative} {activeProp.prediction === "over" ? "Over" : "Under"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* ── Alt Lines for current stat ── */}
                  {currentAltLines.length > 0 && (
                    <View style={styles.linesSection}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                        <Text style={styles.sectionTitle}>ALT LINES</Text>
                      </View>
                      {currentAltLines.map((line, i) => {
                        const isOver = line.prediction === "over";
                        const bookLogo = line.bookmaker ? BOOKMAKER_LOGOS[line.bookmaker] : null;
                        return (
                          <View key={`alt-${i}`} style={styles.lineRow}>
                            <View style={styles.lineLeft}>
                              <Text style={[styles.lineDir, isOver ? { color: colors.success } : { color: "#FF6B6B" }]}>
                                {isOver ? "O" : "U"} {line.altLine}
                              </Text>
                              {line.l10Avg != null && (
                                <Text style={styles.lineAvg}>Avg {line.l10Avg}</Text>
                              )}
                            </View>
                            <View style={styles.lineCenter}>
                              <Text style={styles.lineOdds}>{formatOdds(line.altOdds)}</Text>
                              {line.l10HitPct != null && (
                                <Text style={[styles.lineHitPct, {
                                  color: line.l10HitPct >= 70 ? colors.success : line.l10HitPct >= 50 ? colors.foreground : "#FF6B6B",
                                }]}>{line.l10HitPct}% L10</Text>
                              )}
                            </View>
                            <View style={styles.lineRight}>
                              {bookLogo && (
                                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openBookmakerLink(line.bookmaker!, "nba"); }}>
                                  <ExpoImage source={bookLogo} style={styles.lineBookLogo} contentFit="contain" />
                                </Pressable>
                              )}
                              <View style={styles.altBadge}>
                                <Text style={styles.altBadgeText}>ALT</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* ── Other Props (different stats) ── */}
                  {otherStdLines.length > 0 && (
                    <View style={styles.linesSection}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="list" size={14} color={colors.mutedForeground} />
                        <Text style={styles.sectionTitle}>OTHER PROPS</Text>
                      </View>
                      {otherStdLines.map((line, i) => {
                        const isOver = line.prediction === "over";
                        const bookLogo = line.bookmaker ? BOOKMAKER_LOGOS[line.bookmaker] : null;
                        return (
                          <Pressable
                            key={`other-std-${i}`}
                            style={styles.lineRow}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              handleStatChange(line.statType);
                            }}
                          >
                            <View style={styles.lineLeft}>
                              <Text style={styles.lineStat}>{line.stat}</Text>
                              <Text style={[styles.lineDir, isOver ? { color: colors.success } : { color: "#FF6B6B" }]}>
                                {isOver ? "O" : "U"} {line.line}
                              </Text>
                            </View>
                            <View style={styles.lineCenter}>
                              {line.oddsOver != null && <Text style={styles.lineOdds}>{formatOdds(isOver ? line.oddsOver : line.oddsUnder)}</Text>}
                              {line.greenScore != null && <GreenScoreDots score={line.greenScore} />}
                            </View>
                            <View style={styles.lineRight}>
                              {bookLogo && <ExpoImage source={bookLogo} style={styles.lineBookLogo} contentFit="contain" />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              ) : (
                /* ═══════════════════════════════════════════ */
                /* ═══         STATS VIEW                  ═══ */
                /* ═══════════════════════════════════════════ */
                <>
                  {/* ── Stat Pills ── */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.statPillsContent}
                    style={styles.statPillsScroll}
                  >
                    {data.availableStats.map((stat) => {
                      const isActive = stat.key === activeStat;
                      return (
                        <Pressable
                          key={stat.key}
                          onPress={() => handleStatChange(stat.key)}
                          style={[styles.statPill, isActive && styles.statPillActive]}
                        >
                          <Text style={[styles.statPillText, isActive && styles.statPillTextActive]}>
                            {stat.label}
                          </Text>
                          {stat.hasProp && <View style={styles.propDot} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* ── Chart Section ── */}
                  {activeChart && activeChart.gameLogs.length > 0 ? (
                    <View style={styles.chartSection}>
                      {/* Direction + Line badge */}
                      <View style={styles.chartHeaderRow}>
                        <View style={[styles.dirBadge, {
                          backgroundColor: activeChart.syntheticLine
                            ? "rgba(0,215,215,0.15)"
                            : activeChart.prediction === "over" ? "rgba(34,197,94,0.15)" : "rgba(255,107,107,0.15)",
                        }]}>
                          <Text style={[styles.dirBadgeText, {
                            color: activeChart.syntheticLine
                              ? colors.primary
                              : activeChart.prediction === "over" ? colors.success : "#FF6B6B",
                          }]}>
                            {activeChart.syntheticLine ? "AVG" : activeChart.prediction === "over" ? "OVER" : "UNDER"} {activeChart.line}
                          </Text>
                        </View>
                        {activeChart.ev != null && !activeChart.syntheticLine && (
                          <View style={[styles.evBadge, {
                            borderColor: activeChart.ev >= 0 ? "rgba(34,197,94,0.3)" : "rgba(255,107,107,0.3)",
                            backgroundColor: activeChart.ev >= 0 ? "rgba(34,197,94,0.08)" : "rgba(255,107,107,0.08)",
                          }]}>
                            <Text style={[styles.evText, {
                              color: activeChart.ev >= 0 ? colors.success : "#FF6B6B",
                            }]}>EV {activeChart.ev >= 0 ? "+" : ""}{activeChart.ev}%</Text>
                          </View>
                        )}
                      </View>

                      <PropChartBarGraph
                        gameLogs={activeChart.gameLogs}
                        line={activeChart.line}
                        matchup={data.matchup ? {
                          opponent: data.matchup.opponent,
                          opponentCode: data.matchup.opponentCode,
                        } : undefined}
                        maxGames={selectedRange === "l5" ? 5 : selectedRange === "l10" ? 10 : selectedRange === "l20" ? 20 : activeChart.gameLogs.length}
                      />
                    </View>
                  ) : (
                    <View style={styles.noDataSection}>
                      <Ionicons name="bar-chart-outline" size={32} color={colors.mutedForeground} />
                      <Text style={styles.noDataText}>No game log data available yet</Text>
                      <Text style={styles.noDataSubtext}>Stats will appear once the season starts</Text>
                    </View>
                  )}

                  {/* ── Hit Rate Cards ── */}
                  {activeChart && activeChart.gameLogs.length > 0 && (
                    <View style={styles.hitRatesRow}>
                      {(["l5", "l10", "l20", "season"] as const).map((key) => {
                        const rate = activeChart.hitRates[key];
                        const label = key === "season" ? "SZN" : key.toUpperCase();
                        const isActive = selectedRange === key;
                        const fractionColor = rate.pct >= 60 ? colors.success : rate.pct < 40 ? "#FF6B6B" : colors.foreground;
                        return (
                          <Pressable
                            key={key}
                            style={[styles.hitRateCard, isActive && styles.hitRateCardActive]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSelectedRange(key);
                            }}
                          >
                            <Text style={[styles.hitRateLabel, isActive && styles.hitRateLabelActive]}>{label}</Text>
                            <Text style={[styles.hitRateFraction, { color: fractionColor }]}>{rate.over}/{rate.total}</Text>
                            <Text style={[styles.hitRatePct, { color: fractionColor }]}>{rate.pct}%</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {/* ── Defense Matchup (only when props exist) ── */}
                  {data.hasProps && activeChart?.defense && (
                    <View style={styles.defenseSection}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="shield-half" size={14} color={colors.primary} />
                        <Text style={styles.sectionTitle}>DEFENSE MATCHUP</Text>
                      </View>
                      <View style={styles.defenseCard}>
                        <View style={styles.defenseRow}>
                          {(() => {
                            const oppName = data.matchup?.opponent || activeChart.defense?.opponentCode;
                            const oppLogo = oppName ? getNBATeamLogo(oppName) : null;
                            return oppLogo ? (
                              <ExpoImage source={oppLogo} style={styles.defenseTeamLogo} contentFit="contain" />
                            ) : null;
                          })()}
                          <Text style={styles.defenseTeam}>vs {activeChart.defense.opponentCode}</Text>
                          <View style={[styles.defenseRankBadge, {
                            backgroundColor: activeChart.defense.rank <= 10 ? "rgba(34,197,94,0.12)" : activeChart.defense.rank >= 21 ? "rgba(255,107,107,0.12)" : "rgba(0,215,215,0.08)",
                          }]}>
                            <Text style={[styles.defenseRankText, {
                              color: activeChart.defense.rank <= 10 ? colors.success : activeChart.defense.rank >= 21 ? "#FF6B6B" : colors.primary,
                            }]}>DEF #{activeChart.defense.rank}/30</Text>
                          </View>
                          <Text style={[styles.defenseLabel, {
                            color: activeChart.defense.rank <= 12 ? colors.success : activeChart.defense.rank <= 18 ? colors.mutedForeground : "#FF6B6B",
                          }]}>{activeChart.defense.label}</Text>
                        </View>
                        <Text style={styles.defenseAllowed}>
                          Allows {activeChart.defense.allowed} {activeChart.defense.stat}/G
                        </Text>
                        <View style={[styles.defenseNarrativeTag, {
                          backgroundColor: activeChart.defense.supports ? "rgba(34,197,94,0.12)" : "rgba(255,165,0,0.12)",
                        }]}>
                          <Ionicons
                            name={activeChart.defense.supports ? "checkmark-circle" : "warning"}
                            size={12}
                            color={activeChart.defense.supports ? colors.success : "#FFA500"}
                          />
                          <Text style={[styles.defenseNarrativeText, {
                            color: activeChart.defense.supports ? colors.success : "#FFA500",
                          }]}>
                            {activeChart.defense.narrative} {activeChart.prediction === "over" ? "Over" : "Under"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* ── No Props Notice ── */}
                  {!data.hasProps && (
                    <View style={styles.noPropsCard}>
                      <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
                      <Text style={styles.noPropsText}>No active props available for this player</Text>
                    </View>
                  )}

                  {/* ── Next Game (when no props available) ── */}
                  {!data.hasProps && data.matchup && (
                    <View style={styles.nextGameSection}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                        <Text style={styles.sectionTitle}>NEXT GAME</Text>
                      </View>
                      <View style={styles.nextGameCard}>
                        <View style={styles.nextGameRow}>
                          {(() => {
                            const oppLogo = getNBATeamLogo(data.matchup.opponent);
                            return oppLogo ? (
                              <ExpoImage source={oppLogo} style={styles.nextGameLogo} contentFit="contain" />
                            ) : null;
                          })()}
                          <View style={styles.nextGameInfo}>
                            <Text style={styles.nextGameMatchup}>
                              {data.matchup.isHome ? "vs" : "@"} {data.matchup.opponentCode}
                            </Text>
                            {data.matchup.gameTime && (
                              <Text style={styles.nextGameTime}>
                                {new Date(data.matchup.gameTime).toLocaleDateString("en-US", {
                                  weekday: "short", month: "short", day: "numeric",
                                })}
                              </Text>
                            )}
                          </View>
                        </View>
                        <Text style={styles.nextGameNote}>Props will be available closer to game time</Text>
                      </View>
                    </View>
                  )}

                  {/* ── Available Lines for Current Stat ── */}
                  {(currentStdLines.length > 0 || currentAltLines.length > 0) && (
                    <View style={styles.linesSection}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="analytics" size={14} color={colors.primary} />
                        <Text style={styles.sectionTitle}>LINES — {data.availableStats.find(s => s.key === activeStat)?.label || activeStat}</Text>
                      </View>

                      {currentStdLines.map((line, i) => {
                        const isOver = line.prediction === "over";
                        const bookLogo = line.bookmaker ? BOOKMAKER_LOGOS[line.bookmaker] : null;
                        return (
                          <Pressable
                            key={`std-${i}`}
                            style={styles.lineRow}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              setActiveStat(line.statType);
                              setViewMode("props");
                            }}
                          >
                            <View style={styles.lineLeft}>
                              <Text style={[styles.lineDir, isOver ? { color: colors.success } : { color: "#FF6B6B" }]}>
                                {isOver ? "O" : "U"} {line.line}
                              </Text>
                              {line.l10Avg != null && (
                                <Text style={styles.lineAvg}>Avg {line.l10Avg}</Text>
                              )}
                            </View>
                            <View style={styles.lineCenter}>
                              {line.oddsOver != null && (
                                <Text style={styles.lineOdds}>{formatOdds(isOver ? line.oddsOver : line.oddsUnder)}</Text>
                              )}
                              {line.greenScore != null && <GreenScoreDots score={line.greenScore} />}
                            </View>
                            <View style={styles.lineRight}>
                              {bookLogo && (
                                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openBookmakerLink(line.bookmaker!, "nba"); }}>
                                  <ExpoImage source={bookLogo} style={styles.lineBookLogo} contentFit="contain" />
                                </Pressable>
                              )}
                              <View style={styles.stdBadge}>
                                <Text style={styles.stdBadgeText}>STD</Text>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}

                      {currentAltLines.map((line, i) => {
                        const isOver = line.prediction === "over";
                        const bookLogo = line.bookmaker ? BOOKMAKER_LOGOS[line.bookmaker] : null;
                        return (
                          <Pressable
                            key={`alt-${i}`}
                            style={styles.lineRow}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              setActiveStat(line.statType);
                              setViewMode("props");
                            }}
                          >
                            <View style={styles.lineLeft}>
                              <Text style={[styles.lineDir, isOver ? { color: colors.success } : { color: "#FF6B6B" }]}>
                                {isOver ? "O" : "U"} {line.altLine}
                              </Text>
                              {line.l10Avg != null && (
                                <Text style={styles.lineAvg}>Avg {line.l10Avg}</Text>
                              )}
                            </View>
                            <View style={styles.lineCenter}>
                              <Text style={styles.lineOdds}>{formatOdds(line.altOdds)}</Text>
                              {line.l10HitPct != null && (
                                <Text style={[styles.lineHitPct, {
                                  color: line.l10HitPct >= 70 ? colors.success : line.l10HitPct >= 50 ? colors.foreground : "#FF6B6B",
                                }]}>{line.l10HitPct}% L10</Text>
                              )}
                            </View>
                            <View style={styles.lineRight}>
                              {bookLogo && (
                                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openBookmakerLink(line.bookmaker!, "nba"); }}>
                                  <ExpoImage source={bookLogo} style={styles.lineBookLogo} contentFit="contain" />
                                </Pressable>
                              )}
                              <View style={styles.altBadge}>
                                <Text style={styles.altBadgeText}>ALT</Text>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {/* ── Other Stats Lines ── */}
                  {(otherStdLines.length > 0 || otherAltLines.length > 0) && (
                    <View style={styles.linesSection}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="list" size={14} color={colors.mutedForeground} />
                        <Text style={styles.sectionTitle}>OTHER LINES</Text>
                      </View>

                      {otherStdLines.map((line, i) => {
                        const isOver = line.prediction === "over";
                        const bookLogo = line.bookmaker ? BOOKMAKER_LOGOS[line.bookmaker] : null;
                        return (
                          <Pressable
                            key={`other-std-${i}`}
                            style={styles.lineRow}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              handleStatChange(line.statType);
                            }}
                          >
                            <View style={styles.lineLeft}>
                              <Text style={styles.lineStat}>{line.stat}</Text>
                              <Text style={[styles.lineDir, isOver ? { color: colors.success } : { color: "#FF6B6B" }]}>
                                {isOver ? "O" : "U"} {line.line}
                              </Text>
                            </View>
                            <View style={styles.lineCenter}>
                              {line.oddsOver != null && <Text style={styles.lineOdds}>{formatOdds(isOver ? line.oddsOver : line.oddsUnder)}</Text>}
                              {line.greenScore != null && <GreenScoreDots score={line.greenScore} />}
                            </View>
                            <View style={styles.lineRight}>
                              {bookLogo && <ExpoImage source={bookLogo} style={styles.lineBookLogo} contentFit="contain" />}
                            </View>
                          </Pressable>
                        );
                      })}

                      {otherAltLines.map((line, i) => {
                        const isOver = line.prediction === "over";
                        const bookLogo = line.bookmaker ? BOOKMAKER_LOGOS[line.bookmaker] : null;
                        return (
                          <Pressable
                            key={`other-alt-${i}`}
                            style={styles.lineRow}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              handleStatChange(line.statType);
                            }}
                          >
                            <View style={styles.lineLeft}>
                              <Text style={styles.lineStat}>{line.stat}</Text>
                              <Text style={[styles.lineDir, isOver ? { color: colors.success } : { color: "#FF6B6B" }]}>
                                {isOver ? "O" : "U"} {line.altLine}
                              </Text>
                            </View>
                            <View style={styles.lineCenter}>
                              <Text style={styles.lineOdds}>{formatOdds(line.altOdds)}</Text>
                              {line.l10HitPct != null && (
                                <Text style={[styles.lineHitPct, {
                                  color: line.l10HitPct >= 70 ? colors.success : colors.foreground,
                                }]}>{line.l10HitPct}% L10</Text>
                              )}
                            </View>
                            <View style={styles.lineRight}>
                              {bookLogo && <ExpoImage source={bookLogo} style={styles.lineBookLogo} contentFit="contain" />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

            </Animated.View>

            <View style={{ height: 40 }} />
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing[5],
    paddingBottom: 120,
  },

  // Error
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing[12],
    gap: spacing[3],
  },
  errorText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  retryText: {
    color: colors.primaryForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },

  // Skeleton
  skeletonContainer: { paddingTop: spacing[2] },
  skeletonHeader: { flexDirection: "row", alignItems: "center" },
  skeleton: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
  },

  // Header Card
  headerCard: {
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  teamWatermark: {
    position: "absolute",
    right: -20,
    top: -10,
    opacity: 0.06,
  },
  teamWatermarkImage: { width: 140, height: 140 },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  headshotContainer: { position: "relative" },
  headshot: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    backgroundColor: colors.secondary,
  },
  headshotFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  headshotInitials: {
    fontSize: 24,
    fontFamily: typography.fontFamily.bold,
  },
  teamLogoOverlay: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  teamLogoSmall: { width: 16, height: 16 },
  playerInfo: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  playerName: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    flexShrink: 1,
  },
  position: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  matchupText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  propsCountText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
    marginTop: 2,
  },

  // Stat Pills
  statPillsScroll: { marginBottom: spacing[3] },
  statPillsContent: { gap: spacing[2], paddingHorizontal: 0 },
  statPill: {
    paddingHorizontal: spacing[3] + 2,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  statPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statPillText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
  },
  statPillTextActive: {
    color: colors.primaryForeground,
  },
  propDot: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.success,
  },

  // Chart — break out of parent padding so SVG spans full screen width
  chartSection: {
    marginBottom: spacing[3],
    minHeight: 200,
    marginLeft: -spacing[6],
    marginRight: -spacing[4],
  },
  chartHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[5],
  },
  dirBadge: {
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  dirBadgeText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.5,
  },
  evBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  evText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
  },

  // Props view — header row
  propHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  propStatLine: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },

  // Props view — odds row
  oddsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  oddsBookLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  oddsContainer: {
    flex: 1,
    gap: 2,
  },
  oddsLabel: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  oddsValues: {
    flexDirection: "row",
    gap: spacing[2],
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
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: spacing[1],
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(0, 215, 215, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.2)",
  },
  avgLabel: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  avgValue: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  valueBadge: {
    alignItems: "center",
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: spacing[1],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  valueLabel: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
  },
  valueScore: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },

  // Hit Rates
  hitRatesRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  hitRateCard: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  hitRateCardActive: {
    borderColor: "rgba(0, 215, 215, 0.4)",
    backgroundColor: "rgba(0, 215, 215, 0.08)",
  },
  hitRateLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
  },
  hitRateLabelActive: {
    color: colors.primary,
  },
  hitRateFraction: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
  },
  hitRatePct: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
  },

  // Next Game (no props)
  nextGameSection: { marginBottom: spacing[4] },
  nextGameCard: {
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    padding: spacing[4],
  },
  nextGameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginBottom: spacing[2],
  },
  nextGameLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  nextGameInfo: {
    flex: 1,
  },
  nextGameMatchup: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  nextGameTime: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  nextGameNote: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    fontStyle: "italic",
    opacity: 0.7,
  },

  // No props notice
  noPropsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: spacing[2] + 2,
    paddingHorizontal: spacing[3],
    marginBottom: spacing[4],
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  noPropsText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },

  // No data empty state
  noDataSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[8],
    gap: spacing[2],
  },
  noDataText: {
    fontSize: 15,
    fontFamily: typography.fontFamily.semibold,
    color: colors.foreground,
    marginTop: spacing[2],
  },
  noDataSubtext: {
    fontSize: 13,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },

  // Defense
  defenseSection: { marginBottom: spacing[4] },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1] + 2,
    marginBottom: spacing[2],
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 1,
  },
  defenseCard: {
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: spacing[2],
  },
  defenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  defenseTeamLogo: { width: 22, height: 22 },
  defenseTeam: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  defenseRankBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  defenseRankText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.3,
  },
  defenseLabel: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
  },
  defenseAllowed: {
    fontSize: 12,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  defenseNarrativeTag: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  defenseNarrativeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
  },

  // Lines Section
  linesSection: { marginBottom: spacing[4] },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[2] + 2,
    paddingHorizontal: spacing[3],
    marginBottom: spacing[1],
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  lineLeft: {
    flex: 1,
    gap: 2,
  },
  lineStat: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
  },
  lineDir: {
    fontSize: 14,
    fontFamily: typography.fontFamily.bold,
  },
  lineAvg: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  lineCenter: {
    alignItems: "center",
    gap: 2,
    marginHorizontal: spacing[2],
  },
  lineOdds: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  lineHitPct: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
  },
  lineRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  lineBookLogo: {
    width: 24,
    height: 24,
  },
  stdBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(0, 215, 215, 0.1)",
  },
  stdBadgeText: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
    letterSpacing: 0.3,
  },
  altBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(255, 165, 0, 0.1)",
  },
  altBadgeText: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    color: "#FFA500",
    letterSpacing: 0.3,
  },

  // Green dots
  greenDots: {
    flexDirection: "row",
    gap: 2,
  },
  greenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  greenDotFilled: { backgroundColor: colors.primary },
  greenDotEmpty: { backgroundColor: "rgba(122, 139, 163, 0.25)" },

  // View toggle
  toggleButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 26, 34, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.2)",
  },
  toggleButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
    backgroundColor: "rgba(22, 26, 34, 0.8)",
    borderColor: "rgba(0, 215, 215, 0.4)",
  },
});
