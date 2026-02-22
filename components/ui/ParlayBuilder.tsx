import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from "react-native";
import ActionSheet, { ActionSheetRef } from "react-native-actions-sheet";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, spacing, borderRadius, typography, glass } from "../../constants/designTokens";
import { useCachedGames } from "../../app/hooks/useCachedGames";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { openBookmakerLink } from "../../utils/bookmakerLinks";
import { getTeamAbbreviation, formatStatType, formatOdds, BOOKMAKER_LOGOS } from "../../utils/formatters";
import { CachedGame } from "./CachedGameCard";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ──────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────

type RiskLevel = "lock" | "steady" | "swing";
type LegCount = 2 | 3 | 4 | 5 | 6;
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
  source: "stack" | "edge";
}

interface ParlaySlip {
  name: string;
  risk: RiskLevel;
  bookmaker: string;
  legs: ParlayLeg[];
  combinedOdds: number;
  totalEdge: number;
}

interface ParlayBuilderProps {
  visible: boolean;
  onClose: () => void;
}

// Risk-level color palette
const RISK_THEME = {
  lock: {
    accent: "#22C55E",
    bg06: "rgba(34, 197, 94, 0.06)",
    bg12: "rgba(34, 197, 94, 0.12)",
    bg15: "rgba(34, 197, 94, 0.15)",
    border: "rgba(34, 197, 94, 0.25)",
  },
  steady: {
    accent: "#FFB800",
    bg06: "rgba(255, 184, 0, 0.06)",
    bg12: "rgba(255, 184, 0, 0.12)",
    bg15: "rgba(255, 184, 0, 0.15)",
    border: "rgba(255, 184, 0, 0.25)",
  },
  swing: {
    accent: "#FF6B6B",
    bg06: "rgba(255, 107, 107, 0.06)",
    bg12: "rgba(255, 107, 107, 0.12)",
    bg15: "rgba(255, 107, 107, 0.15)",
    border: "rgba(255, 107, 107, 0.25)",
  },
} as const;

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
 * Build a parlay from a single bookmaker's leg pool.
 *
 * LOCK   = alt lines ONLY, heaviest juice (-500+), highest edge
 * STEADY = alt lines ONLY, balanced edge across range
 * SWING  = alt lines + regular lines (real market odds, bigger payouts)
 */
const buildParlayForBook = (
  bookLegs: ParlayLeg[],
  count: LegCount,
  risk: RiskLevel,
  bookmaker: string
): ParlaySlip | null => {
  const stackLegs = bookLegs.filter(l => l.source === "stack");
  const edgeLegs = bookLegs.filter(l => l.source === "edge");

  // Filter by risk tier
  let eligible: ParlayLeg[];

  switch (risk) {
    case "lock": {
      eligible = stackLegs.filter(l => l.altOdds <= -500 && (l.parlayEdge || 0) >= 0.05);
      if (eligible.length < count)
        eligible = stackLegs.filter(l => l.altOdds <= -450 && (l.parlayEdge || 0) >= 0.03);
      if (eligible.length < count)
        eligible = stackLegs.filter(l => (l.parlayEdge || 0) >= 0.02);
      if (eligible.length < count) eligible = [...stackLegs];
      break;
    }
    case "steady":
    default: {
      eligible = stackLegs.filter(l => (l.parlayEdge || 0) >= 0.02);
      if (eligible.length < count) eligible = [...stackLegs];
      break;
    }
    case "swing": {
      const edgeSorted = [...edgeLegs].sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0));
      const stackSorted = [...stackLegs].sort((a, b) => b.altOdds - a.altOdds);
      eligible = [...edgeSorted, ...stackSorted];
      break;
    }
  }

  if (eligible.length < count) return null;

  // Sort
  let sorted: ParlayLeg[];

  switch (risk) {
    case "lock":
      sorted = [...eligible].sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0));
      break;
    case "steady":
    default:
      sorted = [...eligible].sort((a, b) => {
        const edgeDiff = (b.parlayEdge || 0) - (a.parlayEdge || 0);
        if (Math.abs(edgeDiff) > 0.01) return edgeDiff;
        return (b.greenScore || 0) - (a.greenScore || 0);
      });
      break;
    case "swing":
      sorted = [...eligible].sort((a, b) => {
        if (a.source !== b.source) return a.source === "edge" ? -1 : 1;
        return (b.parlayEdge || 0) - (a.parlayEdge || 0);
      });
      break;
  }

  // Pick legs — one per player to diversify
  const picked: ParlayLeg[] = [];
  const usedPlayers = new Set<string>();

  for (const leg of sorted) {
    if (picked.length >= count) break;
    if (usedPlayers.has(leg.playerName)) continue;
    picked.push(leg);
    usedPlayers.add(leg.playerName);
  }

  if (picked.length < count) {
    for (const leg of sorted) {
      if (picked.length >= count) break;
      if (picked.includes(leg)) continue;
      picked.push(leg);
    }
  }

  if (picked.length < count) return null;

  const totalEdge = picked.reduce((sum, l) => sum + (l.parlayEdge || 0), 0) / picked.length;
  const riskNames = { lock: "LOCK", steady: "STEADY", swing: "SWING" };

  return {
    name: `${riskNames[risk]} PARLAY`,
    risk,
    bookmaker,
    legs: picked,
    combinedOdds: calculateCombinedOdds(picked),
    totalEdge,
  };
};

// ──────────────────────────────────────────────
// CONTENT COMPONENT (reusable in ActionSheet or inline)
// ──────────────────────────────────────────────

interface ParlayBuilderContentProps {
  games: CachedGame[];
  showDragHandle?: boolean;
}

export const ParlayBuilderContent: React.FC<ParlayBuilderContentProps> = ({ games: allGames, showDragHandle = false }) => {
  const [legCount, setLegCount] = useState<LegCount>(4);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("steady");
  const [selectedBookmaker, setSelectedBookmaker] = useState<string | null>(null);
  const [step, setStep] = useState<BuilderStep>("config");

  // Derive color theme from selected risk level
  const theme = RISK_THEME[riskLevel];

  // Extract legs from BOTH pipelines:
  // - Parlay Stack: alt lines (-400 to -650), pre-validated → used by LOCK + SAFE + VALUE
  // - EdgeBoard: standard lines with real market odds → used by VALUE only
  const allLegs = useMemo(() => {
    const legs: ParlayLeg[] = [];
    allGames.forEach((game) => {
      const mlProps = game.analysis?.mlPlayerProps;
      if (!mlProps) return;

      // Parlay Stack legs (alt lines, goblin-tier)
      const stackLegs = mlProps.parlayStack?.legs || [];
      stackLegs.forEach((leg: any) => {
        if (!leg.playerName || !leg.statType) return;
        const isHomeTeam = leg.team === game.team1;
        const opponent = leg.opponent || (isHomeTeam ? game.team2 : game.team1);
        legs.push({ ...leg, opponent, source: "stack" as const });
      });

      // EdgeBoard picks (standard lines, real market odds)
      const edgeProps = mlProps.topProps || [];
      edgeProps.forEach((prop: any) => {
        if (!prop.playerName || !prop.statType) return;
        const isOver = prop.prediction?.toLowerCase() === "over";
        const odds = isOver ? prop.oddsOver : prop.oddsUnder;
        if (!odds) return;

        const isHomeTeam = prop.team === game.team1;
        const opponent = prop.opponent || (isHomeTeam ? game.team2 : game.team1);

        // Edge = actual probability minus implied probability from odds
        const impliedProb = odds < 0
          ? Math.abs(odds) / (Math.abs(odds) + 100)
          : 100 / (odds + 100);
        const actualProb = isOver
          ? (prop.probabilityOver || prop.probability_over || 0)
          : (prop.probabilityUnder || prop.probability_under || 0);
        const edge = actualProb - impliedProb;

        legs.push({
          playerName: prop.playerName,
          team: prop.team || "",
          opponent,
          statType: prop.statType,
          prediction: isOver ? "Over" : "Under",
          altLine: prop.line,
          altOdds: odds,
          bookmaker: isOver ? prop.bookmakerOver : prop.bookmakerUnder,
          l10Avg: prop.l10Avg || 0,
          hitRates: prop.hitRates,
          opponentDefense: prop.opponentDefense,
          greenScore: prop.greenScore,
          parlayEdge: edge,
          source: "edge" as const,
        });
      });
    });
    legs.sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0));
    return legs;
  }, [allGames]);

  // Compute which bookmakers can fill the current config
  const availableBooks = useMemo(() => {
    const viable = allLegs.filter(l => (l.parlayEdge || 0) > 0 && l.bookmaker);
    const byBook = new Map<string, ParlayLeg[]>();
    for (const leg of viable) {
      const bk = leg.bookmaker!;
      if (!byBook.has(bk)) byBook.set(bk, []);
      byBook.get(bk)!.push(leg);
    }

    const books: { name: string; legCount: number; canBuild: boolean }[] = [];
    for (const [name, legs] of byBook) {
      // Check if this book can actually build the parlay at this risk level
      const canBuild = buildParlayForBook(legs, legCount, riskLevel, name) !== null;
      books.push({ name, legCount: legs.length, canBuild });
    }
    // Buildable books first, then by leg count
    books.sort((a, b) => {
      if (a.canBuild !== b.canBuild) return a.canBuild ? -1 : 1;
      return b.legCount - a.legCount;
    });
    return books;
  }, [allLegs, legCount, riskLevel]);

  // Auto-select first viable bookmaker when config changes
  useEffect(() => {
    const firstViable = availableBooks.find(b => b.canBuild);
    if (firstViable && (!selectedBookmaker || !availableBooks.find(b => b.name === selectedBookmaker && b.canBuild))) {
      setSelectedBookmaker(firstViable.name);
    }
  }, [availableBooks]);

  // Build parlay when user taps generate (single bookmaker)
  const generatedParlay = useMemo(() => {
    if (step !== "result" || !selectedBookmaker) return null;
    const viable = allLegs.filter(l => (l.parlayEdge || 0) > 0 && l.bookmaker === selectedBookmaker);
    return buildParlayForBook(viable, legCount, riskLevel, selectedBookmaker);
  }, [step, allLegs, legCount, riskLevel, selectedBookmaker]);

  // Resolve player headshots from Firestore ml_cache
  const [headshots, setHeadshots] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!generatedParlay) return;
    const names = generatedParlay.legs.map(l => l.playerName);
    const missing = names.filter(n => !headshots[n]);
    if (missing.length === 0) return;

    (async () => {
      const map: Record<string, string> = {};
      await Promise.all(missing.map(async (name) => {
        try {
          const key = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
          const snap = await getDoc(doc(db, "ml_cache", `espn_hs_${key}`));
          if (snap.exists() && snap.data().headshotUrl) {
            map[name] = snap.data().headshotUrl;
          }
        } catch {}
      }));
      if (Object.keys(map).length > 0) {
        setHeadshots(prev => ({ ...prev, ...map }));
      }
    })();
  }, [generatedParlay]);

  const handleGenerate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStep("result");
  }, []);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("config");
  }, []);

  const riskOptions: { id: RiskLevel; label: string; icon: string; desc: string }[] = [
    { id: "lock", label: "LOCK", icon: "shield-checkmark", desc: "Safest alt lines" },
    { id: "steady", label: "STEADY", icon: "swap-horizontal", desc: "Balanced alt lines" },
    { id: "swing", label: "SWING", icon: "diamond", desc: "Alt + real odds" },
  ];

  const legOptions: LegCount[] = [2, 3, 4, 5, 6];

  return (
      <View style={styles.contentContainer}>
          {showDragHandle && (
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
          )}

          {step === "config" ? (
            <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {/* Title */}
              <View style={styles.titleRow}>
                <Ionicons name="layers" size={22} color={theme.accent} />
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
                      legCount === count && {
                        backgroundColor: theme.bg12,
                        borderColor: theme.accent,
                      },
                    ]}
                  >
                    <Text style={[
                      styles.countText,
                      legCount === count && { color: theme.accent },
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
                      riskLevel === opt.id && {
                        backgroundColor: RISK_THEME[opt.id].bg12,
                        borderColor: RISK_THEME[opt.id].accent,
                      },
                    ]}
                  >
                    <Ionicons
                      name={opt.icon as any}
                      size={20}
                      color={riskLevel === opt.id ? RISK_THEME[opt.id].accent : colors.mutedForeground}
                    />
                    <Text style={[
                      styles.riskLabel,
                      riskLevel === opt.id && { color: RISK_THEME[opt.id].accent },
                    ]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.riskDesc}>{opt.desc}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Sportsbook */}
              <Text style={styles.sectionLabel}>Sportsbook?</Text>
              {availableBooks.length > 0 ? (
                <View style={styles.booksRow}>
                  {availableBooks.filter(b => b.canBuild).map((book) => {
                    const isSelected = selectedBookmaker === book.name;
                    const logo = BOOKMAKER_LOGOS[book.name];
                    return (
                      <Pressable
                        key={book.name}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedBookmaker(book.name);
                        }}
                        style={[
                          styles.bookOption,
                          isSelected && {
                            backgroundColor: theme.bg12,
                            borderColor: theme.accent,
                          },
                        ]}
                      >
                        {logo ? (
                          <Image
                            source={logo}
                            style={styles.bookOptionLogo}
                            contentFit="contain"
                          />
                        ) : (
                          <Text style={[
                            styles.bookOptionName,
                            isSelected && { color: theme.accent },
                          ]}>
                            {book.name}
                          </Text>
                        )}
                        <Text style={[
                          styles.bookOptionCount,
                          isSelected && { color: theme.accent },
                        ]}>
                          {book.legCount} legs
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.notEnoughText}>No sportsbooks available</Text>
              )}

              {/* Generate Button */}
              <Pressable
                onPress={handleGenerate}
                disabled={!selectedBookmaker || !availableBooks.find(b => b.name === selectedBookmaker && b.canBuild)}
                style={({ pressed }) => [
                  styles.generateButton,
                  { backgroundColor: theme.accent, shadowColor: theme.accent },
                  pressed && styles.generateButtonPressed,
                  (!selectedBookmaker || !availableBooks.find(b => b.name === selectedBookmaker && b.canBuild)) && styles.generateButtonDisabled,
                ]}
              >
                <Ionicons name="flash" size={20} color={colors.background} />
                <Text style={styles.generateText}>Generate Parlay</Text>
              </Pressable>

              <View style={{ height: spacing[1] }} />
            </ScrollView>
          ) : (
            <ScrollView style={styles.sheetContent} showsVerticalScrollIndicator={false}>
              {/* Back button */}
              <Pressable onPress={handleBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={18} color={theme.accent} />
                <Text style={[styles.backText, { color: theme.accent }]}>Change settings</Text>
              </Pressable>

              {generatedParlay ? (
                <>
                  {/* Slip Header */}
                  <View style={[styles.slipHeader, {
                    backgroundColor: theme.bg06,
                    borderColor: theme.bg15,
                  }]}>
                    {/* Top row: risk badge + bookmaker logo + leg count */}
                    <View style={styles.slipTitleRow}>
                      <View style={[styles.riskBadge, { backgroundColor: theme.bg15 }]}>
                        <Ionicons
                          name={(riskLevel === "lock" ? "shield-checkmark" : riskLevel === "steady" ? "swap-horizontal" : "diamond") as any}
                          size={12}
                          color={theme.accent}
                        />
                        <Text style={[styles.riskBadgeText, { color: theme.accent }]}>
                          {generatedParlay.name}
                        </Text>
                      </View>
                      <View style={styles.slipTitleRight}>
                        {BOOKMAKER_LOGOS[generatedParlay.bookmaker] ? (
                          <Image
                            source={BOOKMAKER_LOGOS[generatedParlay.bookmaker]}
                            style={styles.headerBookLogoSmall}
                            contentFit="contain"
                          />
                        ) : (
                          <Text style={styles.headerBookName}>{generatedParlay.bookmaker}</Text>
                        )}
                        <Text style={styles.slipLegs}>{generatedParlay.legs.length} LEGS</Text>
                      </View>
                    </View>

                    {/* Combined odds + avg edge */}
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
                        <Text style={[styles.slipMetaValue, { color: theme.accent }]}>
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
                    const headshotUrl = headshots[leg.playerName];
                    return (
                      <View key={index} style={styles.slipLeg}>
                        <View style={styles.slipLegContent}>
                          {/* Player headshot */}
                          <View style={styles.headshotContainer}>
                            {headshotUrl ? (
                              <Image
                                source={{ uri: headshotUrl }}
                                style={styles.headshot}
                                contentFit="cover"
                                transition={200}
                              />
                            ) : (
                              <View style={styles.headshotPlaceholder}>
                                <Ionicons name="person" size={18} color={colors.mutedForeground} />
                              </View>
                            )}
                          </View>

                          {/* Leg details */}
                          <View style={styles.slipLegDetails}>
                            {/* Row 1: Player name + odds */}
                            <View style={styles.slipLegTop}>
                              <Text style={styles.slipPlayerName}>{leg.playerName}</Text>
                              <Text style={styles.slipOdds}>{formatOdds(leg.altOdds)}</Text>
                            </View>

                            {/* Row 2: Stat + line + avg */}
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

                            {/* Row 3: Game + L10 hit rate + edge */}
                            <View style={styles.slipLegMeta}>
                              <Text style={styles.slipTeam}>
                                {getTeamAbbreviation(leg.team)} vs {getTeamAbbreviation(leg.opponent)}
                              </Text>
                              <View style={styles.slipMetaTags}>
                                {hr && hitCount != null && (
                                  <Text style={styles.slipHitRate}>{hitCount}/{hr.total} L10</Text>
                                )}
                                {leg.parlayEdge != null && leg.parlayEdge > 0 && (
                                  <Text style={[styles.slipEdge, { color: theme.accent }]}>
                                    +{(leg.parlayEdge * 100).toFixed(1)}%
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {/* Place Bet button */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      openBookmakerLink(generatedParlay.bookmaker, "nba");
                    }}
                    style={({ pressed }) => [
                      styles.placeBetButton,
                      { backgroundColor: theme.accent, shadowColor: theme.accent },
                      pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    {BOOKMAKER_LOGOS[generatedParlay.bookmaker] ? (
                      <Image
                        source={BOOKMAKER_LOGOS[generatedParlay.bookmaker]}
                        style={styles.placeBetLogo}
                        contentFit="contain"
                      />
                    ) : null}
                    <Text style={styles.placeBetText}>Place Bet</Text>
                    <Ionicons name="open-outline" size={16} color={colors.background} />
                  </Pressable>
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

              <View style={{ height: spacing[1] }} />
            </ScrollView>
          )}
      </View>
  );
};

// ──────────────────────────────────────────────
// ACTIONSHEET WRAPPER (for Scan page backward compat)
// ──────────────────────────────────────────────

export const ParlayBuilder: React.FC<ParlayBuilderProps> = ({ visible, onClose }) => {
  const actionSheetRef = useRef<ActionSheetRef>(null);
  const { games: allGames } = useCachedGames();

  useEffect(() => {
    if (visible) {
      actionSheetRef.current?.show();
    } else {
      actionSheetRef.current?.hide();
    }
  }, [visible]);

  const handleClose = useCallback(async () => {
    await actionSheetRef.current?.hide();
    setTimeout(() => onClose(), 300);
  }, [onClose]);

  return (
    <ActionSheet
      ref={actionSheetRef}
      headerAlwaysVisible={false}
      useBottomSafeAreaPadding={true}
      CustomHeaderComponent={<View />}
      onClose={handleClose}
      containerStyle={styles.container as any}
      indicatorStyle={styles.indicator}
      gestureEnabled={true}
    >
      <ParlayBuilderContent games={allGames} showDragHandle={true} />
    </ActionSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: borderRadius.xl * 2,
    borderTopRightRadius: borderRadius.xl * 2,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  indicator: {
    backgroundColor: "transparent",
    width: 0,
    height: 0,
  },
  contentContainer: {
    paddingBottom: spacing[4],
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
  // countOptionActive — now inline with theme colors
  countText: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  // countTextActive — now inline with theme colors
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
  // riskOptionActive — now inline with per-risk colors
  riskLabel: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
    letterSpacing: 1,
  },
  // riskLabelActive — now inline with per-risk colors
  riskDesc: {
    fontSize: 10,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    opacity: 0.7,
  },
  booksRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginBottom: spacing[5],
  },
  bookOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: "transparent",
  },
  bookOptionDisabled: {
    opacity: 0.3,
  },
  bookOptionLogo: {
    width: 100,
    height: 32,
  },
  bookOptionName: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  bookOptionCount: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
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
    shadowOpacity: 0,
    elevation: 0,
  },
  generateButtonPressed: {
    transform: [{ scale: 0.97 }],
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
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    borderWidth: 1,
    marginBottom: spacing[3],
    gap: spacing[2],
  },
  headerBookLogoSmall: {
    width: 28,
    height: 28,
  },
  headerBookName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slipTitleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  // riskBadge variants — now inline with theme colors
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
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  slipLegContent: {
    flexDirection: "row",
    gap: spacing[3],
  },
  headshotContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignSelf: "center",
  },
  headshot: {
    width: 44,
    height: 44,
  },
  headshotPlaceholder: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  slipLegDetails: {
    flex: 1,
    gap: spacing[1],
  },
  slipLegTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slipPlayerName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipPickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  slipStatType: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipDirection: {
    fontSize: 13,
    fontFamily: typography.fontFamily.semibold,
  },
  slipOver: {
    color: colors.success,
  },
  slipUnder: {
    color: "#FF6B6B",
  },
  slipAvg: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  slipOdds: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  slipLegMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  slipMetaTags: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  slipHitRate: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
  },
  slipTeam: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  slipEdge: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  // Place bet CTA
  placeBetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    height: 56,
    borderRadius: borderRadius.full,
    marginTop: spacing[4],
    shadowOpacity: 0,
    elevation: 0,
  },
  placeBetLogo: {
    width: 24,
    height: 24,
  },
  placeBetText: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.background,
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
