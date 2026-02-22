import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  Pressable,
  Modal,
  Dimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { CachedGame } from "./CachedGameCard";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import { getTeamAbbreviation, formatStatType, formatOdds, formatGameTime, BOOKMAKER_LOGOS } from "../../utils/formatters";
import { getPlayerImage } from "../../utils/playerImages";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Types ──

type ViewMode = "topPicks" | "byGame";
type SportFilter = "all" | "nba" | "soccer";
type TeamFilter = "all" | string;

interface PickRow {
  key: string;
  playerName: string;
  team: string;
  opponent: string;
  statType: string;
  line: number;
  prediction: string;
  oddsOver?: number;
  oddsUnder?: number;
  bookmakerOver?: string;
  bookmakerUnder?: string;
  l10Avg?: number;
  hitRates?: {
    l10?: { over: number; total: number; pct: number };
    season?: { over: number; total: number; pct: number };
  };
  greenScore?: number;
  confidenceTier?: string;
  gameId: string;
  sport: string;
  gameStartTime?: string;
  team1: string;
  team2: string;
  team1Id?: string;
  team2Id?: string;
}

interface GameSection {
  title: string;
  gameTime: string | null;
  data: PickRow[];
}

// ── Props ──

interface BoardViewProps {
  games: CachedGame[];
  loading: boolean;
  error: string | null;
}

// ── Component ──

export const BoardView: React.FC<BoardViewProps> = ({ games, loading, error }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("topPicks");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  // ── Extract all picks from games (recycled from PlayerPropsCarousel logic) ──
  const { allPicks, uniqueTeams } = useMemo(() => {
    const picks: PickRow[] = [];
    const teamsSet = new Set<string>();

    games.forEach((game) => {
      // Sport filter
      if (sportFilter !== "all" && game.sport !== sportFilter) return;

      const mlProps = game.analysis?.mlPlayerProps;
      const topProps = mlProps?.edgeBoard?.topProps || mlProps?.topProps || [];

      topProps.forEach((prop: any) => {
        if (!prop.playerName || !prop.statType) return;

        const isHomeTeam = prop.team === game.team1;
        const opponent = isHomeTeam ? game.team2 : game.team1;

        picks.push({
          key: `${game.id}-${prop.playerName}-${prop.statType}-${prop.line}`,
          playerName: prop.playerName,
          team: prop.team || "",
          opponent,
          statType: prop.statType,
          line: prop.line,
          prediction: prop.prediction?.toLowerCase() || "over",
          oddsOver: prop.oddsOver,
          oddsUnder: prop.oddsUnder,
          bookmakerOver: prop.bookmakerOver,
          bookmakerUnder: prop.bookmakerUnder,
          l10Avg: prop.l10Avg,
          hitRates: prop.hitRates,
          greenScore: prop.greenScore,
          confidenceTier: prop.confidenceTier || prop.bettingValue || "medium",
          gameId: game.id,
          sport: game.sport,
          gameStartTime: game.gameStartTime,
          team1: game.team1,
          team2: game.team2,
          team1Id: game.team1Id,
          team2Id: game.team2Id,
        });

        if (prop.team) teamsSet.add(prop.team);
      });
    });

    // Sort: green score desc → confidence tier → l10 hit rate
    const tierOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    picks.sort((a, b) => {
      const greenDiff = (b.greenScore || 0) - (a.greenScore || 0);
      if (greenDiff !== 0) return greenDiff;
      const tierDiff = (tierOrder[a.confidenceTier || "medium"] || 1) - (tierOrder[b.confidenceTier || "medium"] || 1);
      if (tierDiff !== 0) return tierDiff;
      return (b.hitRates?.l10?.pct || 0) - (a.hitRates?.l10?.pct || 0);
    });

    return {
      allPicks: picks,
      uniqueTeams: Array.from(teamsSet).sort(),
    };
  }, [games, sportFilter]);

  // ── Team filter ──
  const filteredPicks = useMemo(() => {
    if (teamFilter === "all") return allPicks;
    return allPicks.filter((p) => p.team === teamFilter);
  }, [allPicks, teamFilter]);

  // ── By Game sections ──
  const gameSections = useMemo((): GameSection[] => {
    const byGame = new Map<string, { picks: PickRow[], game: PickRow }>();
    filteredPicks.forEach((pick) => {
      if (!byGame.has(pick.gameId)) {
        byGame.set(pick.gameId, { picks: [], game: pick });
      }
      byGame.get(pick.gameId)!.picks.push(pick);
    });

    const sections: GameSection[] = [];
    for (const [, { picks, game }] of byGame) {
      sections.push({
        title: `${getTeamAbbreviation(game.team1)} vs ${getTeamAbbreviation(game.team2)}`,
        gameTime: formatGameTime(game.gameStartTime),
        data: picks,
      });
    }
    // Sort by game time
    sections.sort((a, b) => {
      if (!a.gameTime && !b.gameTime) return 0;
      if (!a.gameTime) return 1;
      if (!b.gameTime) return -1;
      return 0;
    });
    return sections;
  }, [filteredPicks]);

  // ── Team options ──
  const teamOptions = useMemo(() => {
    const opts: { id: TeamFilter; label: string }[] = [{ id: "all", label: "All Teams" }];
    uniqueTeams.forEach((team) => {
      const parts = team.split(" ");
      opts.push({ id: team, label: parts[parts.length - 1] });
    });
    return opts;
  }, [uniqueTeams]);

  const currentTeamLabel = teamOptions.find((o) => o.id === teamFilter)?.label || "All Teams";

  // ── Navigation ──
  const handlePickPress = useCallback((pick: PickRow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Collect other props for same player in same game
    const otherProps = filteredPicks
      .filter((p) => p.playerName === pick.playerName && p.gameId === pick.gameId && p.key !== pick.key)
      .map((p) => JSON.stringify({
        statType: p.statType,
        line: p.line,
        prediction: p.prediction,
        oddsOver: p.oddsOver,
        oddsUnder: p.oddsUnder,
        bookmakerOver: p.bookmakerOver,
        bookmakerUnder: p.bookmakerUnder,
        l10Avg: p.l10Avg,
        greenScore: p.greenScore,
      }));

    router.push({
      pathname: "/player-prop-chart" as any,
      params: {
        playerName: pick.playerName,
        statType: pick.statType,
        line: String(pick.line),
        otherProps: JSON.stringify(otherProps),
      },
    });
  }, [filteredPicks]);

  // ── Pick Row Renderer ──
  const renderPickRow = useCallback(({ item }: { item: PickRow }) => {
    const isOver = item.prediction === "over";
    const odds = isOver ? item.oddsOver : item.oddsUnder;
    const bookmaker = isOver ? item.bookmakerOver : item.bookmakerUnder;
    const bookLogo = bookmaker ? BOOKMAKER_LOGOS[bookmaker] : null;
    const l10Pct = item.hitRates?.l10?.pct;
    const greenDots = item.greenScore || 0;
    const playerImage = getPlayerImage(item.playerName);

    return (
      <Pressable
        onPress={() => handlePickPress(item)}
        style={({ pressed }) => [styles.pickRow, pressed && styles.pickRowPressed]}
      >
        {/* Headshot */}
        <View style={styles.headshotWrap}>
          {playerImage ? (
            <ExpoImage source={playerImage} style={styles.headshot} contentFit="cover" />
          ) : (
            <View style={styles.headshotPlaceholder}>
              <Text style={styles.initialsText}>
                {item.playerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </Text>
            </View>
          )}
        </View>

        {/* Center: Player + Prop */}
        <View style={styles.pickCenter}>
          <View style={styles.pickNameRow}>
            <Text style={styles.pickPlayerName} numberOfLines={1}>{item.playerName}</Text>
            <Text style={styles.pickTeamCode}>{getTeamAbbreviation(item.team)}</Text>
          </View>
          <View style={styles.pickPropRow}>
            <Text style={styles.pickStatType}>{formatStatType(item.statType)}</Text>
            <Text style={[styles.pickDirection, isOver ? styles.pickOver : styles.pickUnder]}>
              {isOver ? "O" : "U"} {item.line}
            </Text>
            {odds != null && (
              <Text style={styles.pickOdds}>{formatOdds(odds)}</Text>
            )}
            {bookLogo && (
              <ExpoImage source={bookLogo} style={styles.pickBookLogo} contentFit="contain" />
            )}
          </View>
          <View style={styles.pickMetaRow}>
            <Text style={styles.pickMatchup}>
              vs {getTeamAbbreviation(item.opponent)}
              {item.gameStartTime ? ` · ${formatGameTime(item.gameStartTime)}` : ""}
            </Text>
            <View style={styles.pickSignals}>
              {l10Pct != null && (
                <Text style={[styles.pickHitRate, l10Pct >= 60 ? styles.hitGreen : l10Pct < 40 ? styles.hitRed : null]}>
                  L10: {l10Pct}%
                </Text>
              )}
              {greenDots > 0 && (
                <View style={styles.greenDotsRow}>
                  {Array.from({ length: Math.min(greenDots, 5) }).map((_, i) => (
                    <View key={i} style={styles.greenDot} />
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    );
  }, [handlePickPress]);

  // ── Section Header (By Game mode) ──
  const renderSectionHeader = useCallback(({ section }: { section: GameSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.gameTime && (
        <Text style={styles.sectionTime}>{section.gameTime}</Text>
      )}
    </View>
  ), []);

  // ── Header ──
  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.title}>Today's Picks</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowTeamDropdown(true);
          }}
          style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
        >
          <Ionicons name="people" size={13} color={colors.primary} />
          <Text style={styles.filterChipText}>{currentTeamLabel}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Sport chips */}
      <View style={styles.sportChips}>
        {(["all", "nba", "soccer"] as SportFilter[]).map((sport) => (
          <Pressable
            key={sport}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSportFilter(sport);
              setTeamFilter("all");
            }}
            style={[styles.sportChip, sportFilter === sport && styles.sportChipActive]}
          >
            <Ionicons
              name={sport === "all" ? "trophy" : sport === "nba" ? "basketball" : "football"}
              size={14}
              color={sportFilter === sport ? colors.background : colors.mutedForeground}
            />
            <Text style={[styles.sportChipText, sportFilter === sport && styles.sportChipTextActive]}>
              {sport === "all" ? "All" : sport.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* View mode toggle */}
      <View style={styles.modeToggle}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setViewMode("topPicks");
          }}
          style={[styles.modeTab, viewMode === "topPicks" && styles.modeTabActive]}
        >
          <Ionicons
            name="flame"
            size={14}
            color={viewMode === "topPicks" ? colors.background : colors.mutedForeground}
          />
          <Text style={[styles.modeTabText, viewMode === "topPicks" && styles.modeTabTextActive]}>
            Top Picks
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setViewMode("byGame");
          }}
          style={[styles.modeTab, viewMode === "byGame" && styles.modeTabActive]}
        >
          <Ionicons
            name="basketball"
            size={14}
            color={viewMode === "byGame" ? colors.background : colors.mutedForeground}
          />
          <Text style={[styles.modeTabText, viewMode === "byGame" && styles.modeTabTextActive]}>
            By Game
          </Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Team Dropdown ──
  const renderTeamDropdown = () => (
    <Modal visible={showTeamDropdown} transparent animationType="fade" onRequestClose={() => setShowTeamDropdown(false)}>
      <Pressable style={styles.dropdownOverlay} onPress={() => setShowTeamDropdown(false)}>
        <View style={styles.dropdownContainer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Select Team</Text>
            <FlatList
              data={teamOptions}
              keyExtractor={(item) => item.id}
              style={styles.dropdownScroll}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: option }) => (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTeamFilter(option.id);
                    setShowTeamDropdown(false);
                  }}
                  style={({ pressed }) => [
                    styles.dropdownOption,
                    teamFilter === option.id && styles.dropdownOptionActive,
                    pressed && styles.dropdownOptionPressed,
                  ]}
                >
                  <Ionicons
                    name={option.id === "all" ? "people" : "basketball"}
                    size={18}
                    color={teamFilter === option.id ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.dropdownOptionText, teamFilter === option.id && styles.dropdownOptionTextActive]}>
                    {option.label}
                  </Text>
                  {teamFilter === option.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading picks...</Text>
        </View>
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Couldn't load picks right now</Text>
        </View>
      </View>
    );
  }

  // ── Empty ──
  if (filteredPicks.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderTeamDropdown()}
        <View style={styles.emptyContainer}>
          <Ionicons name="analytics-outline" size={40} color={colors.mutedForeground} style={{ marginBottom: spacing[2] }} />
          <Text style={styles.emptyText}>
            {teamFilter === "all" ? "No picks available" : `No picks for ${currentTeamLabel}`}
          </Text>
          <Text style={styles.emptySubtext}>Check back closer to game time</Text>
        </View>
      </View>
    );
  }

  // ── Main Render ──
  return (
    <View style={styles.container}>
      {renderTeamDropdown()}

      {viewMode === "topPicks" ? (
        <FlatList
          data={filteredPicks}
          keyExtractor={(item) => item.key}
          renderItem={renderPickRow}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: 80,
            offset: 80 * index,
            index,
          })}
        />
      ) : (
        <SectionList
          sections={gameSections}
          keyExtractor={(item) => item.key}
          renderItem={renderPickRow}
          renderSectionHeader={renderSectionHeader as any}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
};

// ── Styles ──

const StyleSheet_create = StyleSheet.create;
const styles = StyleSheet_create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[3],
  },
  title: {
    color: colors.foreground,
    fontSize: typography.sizes["2xl"],
    fontFamily: typography.fontFamily.bold,
  },
  // Sport chips
  sportChips: {
    flexDirection: "row",
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  sportChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingVertical: spacing[1] + 2,
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.full,
    backgroundColor: colors.secondary,
  },
  sportChipActive: {
    backgroundColor: colors.primary,
  },
  sportChipText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  sportChipTextActive: {
    color: colors.background,
  },
  // Filter chip
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2] + 2,
    backgroundColor: colors.rgba.primary15,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  filterChipPressed: {
    opacity: 0.7,
  },
  filterChipText: {
    color: colors.foreground,
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
  },
  // Mode toggle
  modeToggle: {
    flexDirection: "row",
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.full,
    padding: 3,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  modeTabActive: {
    backgroundColor: colors.primary,
  },
  modeTabText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  modeTabTextActive: {
    color: colors.background,
  },
  // Pick row
  listContent: {
    paddingBottom: spacing[10],
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  pickRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  headshotWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  headshot: {
    width: 40,
    height: 40,
  },
  headshotPlaceholder: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  pickCenter: {
    flex: 1,
    gap: 2,
  },
  pickNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  pickPlayerName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    flexShrink: 1,
  },
  pickTeamCode: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  pickPropRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  pickStatType: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  pickDirection: {
    fontSize: 13,
    fontFamily: typography.fontFamily.semibold,
  },
  pickOver: {
    color: colors.success,
  },
  pickUnder: {
    color: "#FF6B6B",
  },
  pickOdds: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  pickBookLogo: {
    width: 20,
    height: 20,
  },
  pickMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickMatchup: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  pickSignals: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  pickHitRate: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  hitGreen: {
    color: colors.success,
  },
  hitRed: {
    color: "#FF6B6B",
  },
  greenDotsRow: {
    flexDirection: "row",
    gap: 2,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  // Section header (By Game mode)
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2] + 2,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  sectionTime: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  // Dropdown
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownContainer: {
    width: SCREEN_WIDTH * 0.8,
    maxWidth: 300,
    maxHeight: 400,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  dropdownContent: {
    padding: spacing[4],
  },
  dropdownTitle: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    marginBottom: spacing[3],
    textAlign: "center",
  },
  dropdownScroll: {
    maxHeight: 300,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
  },
  dropdownOptionActive: {
    backgroundColor: colors.rgba.primary15,
  },
  dropdownOptionPressed: {
    opacity: 0.7,
  },
  dropdownOptionText: {
    flex: 1,
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  dropdownOptionTextActive: {
    color: colors.foreground,
  },
  // Empty
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[12],
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  emptySubtext: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    marginTop: spacing[1],
    opacity: 0.7,
  },
});

export default BoardView;
