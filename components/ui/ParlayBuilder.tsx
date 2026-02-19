import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import { useCachedGames } from "../../app/hooks/useCachedGames";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ──────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────

type RiskLevel = "lock" | "safe" | "value";
type LegCount = 3 | 4 | 5 | 6;
type BuilderStep = "config" | "result";

interface ParlayLeg {
  playerName: string;
  team: string;
  opponent: string;
  statType: string;
  prediction: string;
  altLine: number;
  altOdds: number;
  bookmaker?: string;
  l10Avg: number;
  hitRates?: {
    l10?: { over: number; total: number; pct: number };
    season?: { over: number; total: number; pct: number };
  };
  opponentDefense?: { rank?: number } | null;
  greenScore?: number;
  parlayEdge?: number;
}

interface ParlaySlip {
  name: string;
  risk: RiskLevel;
  legs: ParlayLeg[];
  combinedOdds: number;
  totalEdge: number;
}

interface ParlayBuilderProps {
  visible: boolean;
  onClose: () => void;
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
    "blocks+steals": "BLK+STL", pts_rebs_asts: "PRA",
  };
  return formatMap[statType.toLowerCase()] || statType.replace(/[_+]/g, "+").toUpperCase();
};

const formatOdds = (odds: number): string => {
  return odds > 0 ? `+${odds}` : `${odds}`;
};

/**
 * Calculate combined American odds for a parlay from individual leg odds.
 * Converts each to decimal, multiplies, converts back.
 */
const calculateCombinedOdds = (legs: ParlayLeg[]): number => {
  if (legs.length === 0) return 0;
  let combinedDecimal = 1;
  for (const leg of legs) {
    const odds = leg.altOdds;
    const decimal = odds <= -100
      ? 1 + (100 / Math.abs(odds))
      : 1 + (odds / 100);
    combinedDecimal *= decimal;
  }
  // Convert back to American
  if (combinedDecimal >= 2) {
    return Math.round((combinedDecimal - 1) * 100);
  }
  return Math.round(-100 / (combinedDecimal - 1));
};

/**
 * Build a parlay from cached legs based on risk level and leg count.
 * LOCK = safest (highest edge legs, one per player)
 * SAFE = balanced (mix of high edge + variety)
 * VALUE = highest upside (lighter juice legs with decent edge)
 */
const buildParlay = (
  allLegs: ParlayLeg[],
  count: LegCount,
  risk: RiskLevel
): ParlaySlip | null => {
  if (allLegs.length < count) return null;

  // Sort differently per risk level
  let sortedLegs: ParlayLeg[];
  switch (risk) {
    case "lock":
      // Highest edge first (safest bets)
      sortedLegs = [...allLegs].sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0));
      break;
    case "value":
      // Lightest juice first (best parlay payout)
      sortedLegs = [...allLegs].sort((a, b) => (b.altOdds) - (a.altOdds));
      break;
    case "safe":
    default:
      // Balanced: sort by green score then edge
      sortedLegs = [...allLegs].sort((a, b) => {
        const scoreDiff = (b.greenScore || 0) - (a.greenScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (b.parlayEdge || 0) - (a.parlayEdge || 0);
      });
      break;
  }

  // Pick legs — one per player to diversify
  const picked: ParlayLeg[] = [];
  const usedPlayers = new Set<string>();

  for (const leg of sortedLegs) {
    if (picked.length >= count) break;
    if (usedPlayers.has(leg.playerName)) continue;
    picked.push(leg);
    usedPlayers.add(leg.playerName);
  }

  // If not enough unique players, allow duplicates
  if (picked.length < count) {
    for (const leg of sortedLegs) {
      if (picked.length >= count) break;
      if (picked.includes(leg)) continue;
      picked.push(leg);
    }
  }

  if (picked.length < count) return null;

  const totalEdge = picked.reduce((sum, l) => sum + (l.parlayEdge || 0), 0) / picked.length;

  const riskNames = { lock: "LOCK", safe: "SAFE", value: "VALUE" };

  return {
    name: `${riskNames[risk]} PARLAY`,
    risk,
    legs: picked,
    combinedOdds: calculateCombinedOdds(picked),
    totalEdge,
  };
};

// ──────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────

export const ParlayBuilder: React.FC<ParlayBuilderProps> = ({ visible, onClose }) => {
  const { games: allGames } = useCachedGames();
  const [legCount, setLegCount] = useState<LegCount>(4);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("safe");
  const [step, setStep] = useState<BuilderStep>("config");

  // Extract all Parlay Stack legs from cache
  const allLegs = useMemo(() => {
    const legs: ParlayLeg[] = [];
    allGames.forEach((game) => {
      const stackLegs = game.analysis?.mlPlayerProps?.parlayStack?.legs || [];
      stackLegs.forEach((leg: any) => {
        if (!leg.playerName || !leg.statType) return;
        const isHomeTeam = leg.team === game.team1;
        const opponent = leg.opponent || (isHomeTeam ? game.team2 : game.team1);
        legs.push({ ...leg, opponent });
      });
    });
    legs.sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0));
    return legs;
  }, [allGames]);

  // Build parlay when user taps generate
  const generatedParlay = useMemo(() => {
    if (step !== "result") return null;
    return buildParlay(allLegs, legCount, riskLevel);
  }, [step, allLegs, legCount, riskLevel]);

  const handleGenerate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStep("result");
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("config");
  }, []);

  const handleClose = useCallback(() => {
    setStep("config");
    onClose();
  }, [onClose]);

  const riskOptions: { id: RiskLevel; label: string; icon: string; desc: string }[] = [
    { id: "lock", label: "LOCK", icon: "shield-checkmark", desc: "Safest edge" },
    { id: "safe", label: "SAFE", icon: "swap-horizontal", desc: "Balanced" },
    { id: "value", label: "VALUE", icon: "diamond", desc: "Best payout" },
  ];

  const legOptions: LegCount[] = [3, 4, 5, 6];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTouchable} onPress={handleClose} />

        <View style={styles.sheet}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {step === "config" ? (
            <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {/* Title */}
              <View style={styles.titleRow}>
                <Ionicons name="layers" size={22} color={colors.primary} />
                <Text style={styles.title}>Build Your Parlay</Text>
              </View>
              <Text style={styles.subtitle}>
                {allLegs.length} validated legs across today's games
              </Text>

              {/* Leg Count */}
              <Text style={styles.sectionLabel}>How many legs?</Text>
              <View style={styles.optionsRow}>
                {legOptions.map((count) => (
                  <Pressable
                    key={count}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setLegCount(count);
                    }}
                    style={[
                      styles.countOption,
                      legCount === count && styles.countOptionActive,
                    ]}
                  >
                    <Text style={[
                      styles.countText,
                      legCount === count && styles.countTextActive,
                    ]}>
                      {count}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Risk Level */}
              <Text style={styles.sectionLabel}>Risk level?</Text>
              <View style={styles.riskRow}>
                {riskOptions.map((opt) => (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setRiskLevel(opt.id);
                    }}
                    style={[
                      styles.riskOption,
                      riskLevel === opt.id && styles.riskOptionActive,
                    ]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={20}
                      color={riskLevel === opt.id ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={[
                      styles.riskLabel,
                      riskLevel === opt.id && styles.riskLabelActive,
                    ]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.riskDesc}>{opt.desc}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Generate Button */}
              <Pressable
                onPress={handleGenerate}
                disabled={allLegs.length < legCount}
                style={({ pressed }) => [
                  styles.generateButton,
                  pressed && styles.generateButtonPressed,
                  allLegs.length < legCount && styles.generateButtonDisabled,
                ]}
              >
                <Ionicons name="flash" size={20} color={colors.background} />
                <Text style={styles.generateText}>Generate Parlay</Text>
              </Pressable>

              {allLegs.length < legCount && (
                <Text style={styles.notEnoughText}>
                  Not enough validated legs ({allLegs.length} available)
                </Text>
              )}

              <View style={{ height: spacing[8] }} />
            </ScrollView>
          ) : (
            <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {/* Back button */}
              <Pressable onPress={handleBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={18} color={colors.primary} />
                <Text style={styles.backText}>Change settings</Text>
              </Pressable>

              {generatedParlay ? (
                <>
                  {/* Slip Header */}
                  <View style={styles.slipHeader}>
                    <View style={styles.slipTitleRow}>
                      <View style={[
                        styles.riskBadge,
                        riskLevel === "lock" && styles.riskBadgeLock,
                        riskLevel === "safe" && styles.riskBadgeSafe,
                        riskLevel === "value" && styles.riskBadgeValue,
                      ]}>
                        <Text style={styles.riskBadgeText}>{generatedParlay.name}</Text>
                      </View>
                      <Text style={styles.slipLegs}>{generatedParlay.legs.length} LEGS</Text>
                    </View>
                    <View style={styles.slipMeta}>
                      <View style={styles.slipMetaItem}>
                        <Text style={styles.slipMetaLabel}>Combined</Text>
                        <Text style={styles.slipMetaValue}>
                          {formatOdds(generatedParlay.combinedOdds)}
                        </Text>
                      </View>
                      <View style={styles.slipMetaDivider} />
                      <View style={styles.slipMetaItem}>
                        <Text style={styles.slipMetaLabel}>Avg Edge</Text>
                        <Text style={[styles.slipMetaValue, { color: colors.success }]}>
                          +{(generatedParlay.totalEdge * 100).toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Legs */}
                  {generatedParlay.legs.map((leg, index) => {
                    const isOver = leg.prediction === "Over";
                    const hr = leg.hitRates?.l10;
                    const hitCount = hr ? (isOver ? hr.over : hr.total - hr.over) : null;

                    return (
                      <View key={index} style={styles.slipLeg}>
                        <View style={styles.slipLegTop}>
                          <View style={styles.slipLegLeft}>
                            <Text style={styles.slipPlayerName}>{leg.playerName}</Text>
                            <View style={styles.slipPickRow}>
                              <Text style={styles.slipStatType}>
                                {formatStatType(leg.statType)}
                              </Text>
                              <Text style={[
                                styles.slipDirection,
                                isOver ? styles.slipOver : styles.slipUnder,
                              ]}>
                                {isOver ? "O" : "U"} {leg.altLine}
                              </Text>
                              <Text style={styles.slipAvg}>Avg {leg.l10Avg}</Text>
                            </View>
                          </View>
                          <View style={styles.slipLegRight}>
                            <Text style={styles.slipOdds}>{formatOdds(leg.altOdds)}</Text>
                            {hr && hitCount != null && (
                              <Text style={styles.slipHitRate}>{hitCount}/{hr.total} L10</Text>
                            )}
                          </View>
                        </View>
                        <View style={styles.slipLegMeta}>
                          <Text style={styles.slipTeam}>
                            {getTeamAbbreviation(leg.team)} vs {getTeamAbbreviation(leg.opponent)}
                          </Text>
                          {leg.parlayEdge != null && (
                            <Text style={styles.slipEdge}>
                              +{(leg.parlayEdge * 100).toFixed(1)}% edge
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              ) : (
                <View style={styles.noResultContainer}>
                  <Ionicons name="alert-circle-outline" size={40} color={colors.mutedForeground} />
                  <Text style={styles.noResultText}>
                    Not enough legs to build this parlay
                  </Text>
                  <Pressable onPress={handleBack} style={styles.tryAgainButton}>
                    <Text style={styles.tryAgainText}>Try different settings</Text>
                  </Pressable>
                </View>
              )}

              <View style={{ height: spacing[8] }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayTouchable: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    backgroundColor: "rgba(13, 15, 20, 0.95)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(122, 139, 163, 0.3)",
  },
  sheetContent: {
    paddingHorizontal: spacing[5],
  },
  // Config step
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  title: {
    fontSize: typography.sizes["2xl"],
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginBottom: spacing[5],
  },
  sectionLabel: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    marginBottom: spacing[2],
  },
  optionsRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginBottom: spacing[5],
  },
  countOption: {
    flex: 1,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.lg,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  countOptionActive: {
    backgroundColor: "rgba(0, 215, 215, 0.12)",
    borderColor: colors.primary,
  },
  countText: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  countTextActive: {
    color: colors.primary,
  },
  riskRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginBottom: spacing[5],
  },
  riskOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  riskOptionActive: {
    backgroundColor: "rgba(0, 215, 215, 0.12)",
    borderColor: colors.primary,
  },
  riskLabel: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 1,
  },
  riskLabelActive: {
    color: colors.primary,
  },
  riskDesc: {
    fontSize: 10,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    opacity: 0.7,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  generateButtonPressed: {
    transform: [{ scale: 0.97 }],
    shadowOpacity: 0.6,
  },
  generateButtonDisabled: {
    opacity: 0.4,
  },
  generateText: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.background,
  },
  notEnoughText: {
    textAlign: "center",
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: spacing[2],
  },
  // Result step
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    marginTop: spacing[2],
    marginBottom: spacing[3],
  },
  backText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  // Slip header
  slipHeader: {
    backgroundColor: "rgba(0, 215, 215, 0.06)",
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    marginBottom: spacing[3],
    gap: spacing[3],
  },
  slipTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  riskBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  riskBadgeLock: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  riskBadgeSafe: {
    backgroundColor: "rgba(0, 215, 215, 0.15)",
  },
  riskBadgeValue: {
    backgroundColor: "rgba(255, 184, 0, 0.15)",
  },
  riskBadgeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    letterSpacing: 1.5,
  },
  slipLegs: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 1,
  },
  slipMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  slipMetaItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  slipMetaLabel: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    letterSpacing: 0.5,
  },
  slipMetaValue: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipMetaDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(122, 139, 163, 0.2)",
  },
  // Slip legs
  slipLeg: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginBottom: spacing[2],
    gap: spacing[1] + 2,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  slipLegTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  slipLegLeft: {
    flex: 1,
    gap: 3,
  },
  slipPlayerName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipPickRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  slipStatType: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipDirection: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
  },
  slipOver: {
    color: colors.success,
  },
  slipUnder: {
    color: "#FF6B6B",
  },
  slipAvg: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  slipLegRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  slipOdds: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipHitRate: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
  },
  slipLegMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slipTeam: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  slipEdge: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  // No result
  noResultContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[10],
    gap: spacing[3],
  },
  noResultText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  tryAgainButton: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: colors.rgba.primary15,
  },
  tryAgainText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
});

export default ParlayBuilder;
