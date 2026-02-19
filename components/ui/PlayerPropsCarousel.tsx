import React, { useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { PlayerPropCard, PlayerPropCardSkeleton, EnrichedPlayerProp, PlayerWithProps, PLAYER_CARD_WIDTH } from "./PlayerPropCard";
import { ParlayLegCard, ParlayLegCardSkeleton, ParlayLeg, PARLAY_CARD_WIDTH } from "./ParlayLegCard";
import { colors, spacing, typography, borderRadius } from "../../constants/designTokens";
import { useCachedGames } from "../../app/hooks/useCachedGames";

type TeamFilter = "all" | string;
type PropsMode = "picks" | "parlays";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6];
const SNAP_INTERVAL = PLAYER_CARD_WIDTH + HORIZONTAL_PADDING;
const PARLAY_SNAP_INTERVAL = PARLAY_CARD_WIDTH + HORIZONTAL_PADDING;

/**
 * Carousel showing player props extracted from all pre-cached games.
 * Two modes: Picks (EdgeBoard ML predictions) and Parlays (Parlay Stack alt lines).
 */
export const PlayerPropsCarousel: React.FC = () => {
  const picksScrollRef = useRef<ScrollView>(null);
  const parlaysScrollRef = useRef<ScrollView>(null);
  const { games: allGames, loading, error } = useCachedGames();
  const [picksIndex, setPicksIndex] = useState(0);
  const [parlaysIndex, setParlaysIndex] = useState(0);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mode, setMode] = useState<PropsMode>("picks");

  // ─── Extract EdgeBoard player props (grouped by player) ───
  const { playersByName, uniqueTeams } = useMemo(() => {
    const playerMap = new Map<string, PlayerWithProps>();
    const teamsSet = new Set<string>();

    allGames.forEach((game) => {
      const mlProps = game.analysis?.mlPlayerProps;
      const topProps = mlProps?.edgeBoard?.topProps || mlProps?.topProps || [];
      const gameTime = game.gameStartTime;

      topProps.forEach((prop: any) => {
        if (!prop.playerName || !prop.statType) return;

        const isHomeTeam = prop.team === game.team1;
        const opponent = isHomeTeam ? game.team2 : game.team1;

        const enrichedProp: EnrichedPlayerProp = {
          ...prop,
          gameId: game.id,
          sport: game.sport,
          opponent,
          gameStartTime: gameTime,
        };

        const playerKey = `${prop.playerName}-${prop.team}-${game.id}`;

        if (playerMap.has(playerKey)) {
          playerMap.get(playerKey)!.props.push(enrichedProp);
          const currentBest = playerMap.get(playerKey)!.bestConfidenceTier;
          const propTier = prop.confidenceTier || prop.bettingValue || "medium";
          if (propTier === "high" || (propTier === "medium" && currentBest === "low")) {
            playerMap.get(playerKey)!.bestConfidenceTier = propTier as "high" | "medium" | "low";
          }
        } else {
          playerMap.set(playerKey, {
            playerName: prop.playerName,
            team: prop.team,
            gameId: game.id,
            sport: game.sport as "nba" | "soccer",
            opponent,
            gameStartTime: gameTime,
            props: [enrichedProp],
            bestConfidenceTier: (prop.confidenceTier || prop.bettingValue || "medium") as "high" | "medium" | "low",
            playerStats: prop.playerStats,
          });
        }

        if (prop.team) teamsSet.add(prop.team);
      });
    });

    const players = Array.from(playerMap.values());
    players.sort((a, b) => {
      const tierOrder = { high: 0, medium: 1, low: 2 };
      const tierDiff = tierOrder[a.bestConfidenceTier] - tierOrder[b.bestConfidenceTier];
      if (tierDiff !== 0) return tierDiff;
      return b.props.length - a.props.length;
    });

    return {
      playersByName: players,
      uniqueTeams: Array.from(teamsSet).sort(),
    };
  }, [allGames]);

  // ─── Extract Parlay Stack legs ───
  const parlayLegs = useMemo(() => {
    const legs: ParlayLeg[] = [];

    allGames.forEach((game) => {
      const stackLegs = game.analysis?.mlPlayerProps?.parlayStack?.legs || [];
      const gameTime = game.gameStartTime;

      stackLegs.forEach((leg: any) => {
        if (!leg.playerName || !leg.statType) return;

        const isHomeTeam = leg.team === game.team1;
        const opponent = leg.opponent || (isHomeTeam ? game.team2 : game.team1);

        legs.push({
          ...leg,
          gameId: game.id,
          opponent,
          gameStartTime: gameTime,
        });
      });
    });

    // Sort by parlayEdge descending (best value first)
    legs.sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0));
    return legs;
  }, [allGames]);

  // Filter by team
  const filteredPlayers = useMemo(() => {
    if (teamFilter === "all") return playersByName;
    return playersByName.filter((player) => player.team === teamFilter);
  }, [playersByName, teamFilter]);

  const filteredParlayLegs = useMemo(() => {
    if (teamFilter === "all") return parlayLegs;
    return parlayLegs.filter((leg) => leg.team === teamFilter);
  }, [parlayLegs, teamFilter]);

  // Team options
  const teamOptions = useMemo(() => {
    const options: { id: TeamFilter; label: string }[] = [{ id: "all", label: "All Teams" }];
    uniqueTeams.forEach((team) => {
      const parts = team.split(" ");
      options.push({ id: team, label: parts[parts.length - 1] });
    });
    return options;
  }, [uniqueTeams]);

  const currentTeamOption = teamOptions.find((opt) => opt.id === teamFilter) || teamOptions[0];

  const handleTeamSelect = (team: TeamFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTeamFilter(team);
    setShowDropdown(false);
    setPicksIndex(0);
    setParlaysIndex(0);
    picksScrollRef.current?.scrollTo({ x: 0, animated: false });
    parlaysScrollRef.current?.scrollTo({ x: 0, animated: false });
  };

  const handlePlayerPress = (player: PlayerWithProps) => {
    const game = allGames.find((g) => g.id === player.gameId);
    if (game) {
      router.push({
        pathname: "/analysis",
        params: {
          cachedGameId: game.id,
          sport: game.sport,
          team1: game.team1,
          team2: game.team2,
          team1Id: game.team1Id,
          team2Id: game.team2Id,
          fromCache: "true",
          from: "props",
        },
      });
    }
  };

  const handleParlayLegPress = (leg: ParlayLeg) => {
    const game = allGames.find((g) => g.id === leg.gameId);
    if (game) {
      router.push({
        pathname: "/analysis",
        params: {
          cachedGameId: game.id,
          sport: game.sport,
          team1: game.team1,
          team2: game.team2,
          team1Id: game.team1Id,
          team2Id: game.team2Id,
          fromCache: "true",
          from: "props",
        },
      });
    }
  };

  const handlePicksScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SNAP_INTERVAL);
    if (index !== picksIndex && index >= 0 && index < filteredPlayers.length) {
      setPicksIndex(index);
    }
  };

  const handleParlaysScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / PARLAY_SNAP_INTERVAL);
    if (index !== parlaysIndex && index >= 0 && index < filteredParlayLegs.length) {
      setParlaysIndex(index);
    }
  };

  const handleModeChange = (newMode: PropsMode) => {
    if (newMode === mode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMode(newMode);
  };

  // ─── Segmented Toggle ───
  const renderSegmentedToggle = () => (
    <View style={styles.segmentedContainer}>
      <Pressable
        onPress={() => handleModeChange("picks")}
        style={[styles.segmentedTab, mode === "picks" && styles.segmentedTabActive]}
      >
        <Ionicons
          name="analytics"
          size={14}
          color={mode === "picks" ? colors.background : colors.mutedForeground}
        />
        <Text style={[styles.segmentedText, mode === "picks" && styles.segmentedTextActive]}>
          Picks
        </Text>
      </Pressable>
      <Pressable
        onPress={() => handleModeChange("parlays")}
        style={[styles.segmentedTab, mode === "parlays" && styles.segmentedTabActive]}
      >
        <Ionicons
          name="layers"
          size={14}
          color={mode === "parlays" ? colors.background : colors.mutedForeground}
        />
        <Text style={[styles.segmentedText, mode === "parlays" && styles.segmentedTextActive]}>
          Parlays
        </Text>
        {parlayLegs.length > 0 && (
          <View style={styles.legCountBadge}>
            <Text style={styles.legCountText}>{parlayLegs.length}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );

  // ─── Header ───
  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>
        {mode === "picks" ? "Player Props" : "Parlay Legs"}
      </Text>
      <View style={styles.headerControls}>
        {renderSegmentedToggle()}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowDropdown(true);
          }}
          style={({ pressed }) => [styles.teamSelector, pressed && styles.teamSelectorPressed]}
        >
          <Ionicons name="people" size={13} color={colors.primary} />
          <Text style={styles.teamSelectorText}>{currentTeamOption.label}</Text>
          <Ionicons name="chevron-down" size={13} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );

  // ─── Team Dropdown ───
  const renderDropdown = () => (
    <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
      <Pressable style={styles.dropdownOverlay} onPress={() => setShowDropdown(false)}>
        <View style={styles.dropdownContainer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Select Team</Text>
            <ScrollView style={styles.dropdownScroll} showsVerticalScrollIndicator={false}>
              {teamOptions.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => handleTeamSelect(option.id)}
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
                  <Text
                    style={[styles.dropdownOptionText, teamFilter === option.id && styles.dropdownOptionTextActive]}
                  >
                    {option.label}
                  </Text>
                  {teamFilter === option.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // ─── Dots ───
  const renderDots = (count: number, activeIdx: number) => {
    if (count <= 1) return null;
    return (
      <View style={styles.dotsContainer}>
        {Array.from({ length: Math.min(count, 10) }).map((_, index) => (
          <View key={index} style={[styles.dot, index === activeIdx && styles.dotActive]} />
        ))}
        {count > 10 && <Text style={styles.moreDotsText}>+{count - 10}</Text>}
      </View>
    );
  };

  // ─── Loading ───
  if (loading || (allGames.length === 0 && !error)) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <View style={styles.scrollContent}>
          <View style={styles.cardWrapper}>
            {mode === "picks" ? <PlayerPropCardSkeleton /> : <ParlayLegCardSkeleton />}
          </View>
        </View>
      </View>
    );
  }

  // ─── Error ───
  if (error) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Couldn't load props right now</Text>
        </View>
      </View>
    );
  }

  // ─── Picks Mode ───
  if (mode === "picks") {
    if (filteredPlayers.length === 0) {
      return (
        <View style={styles.container}>
          {renderHeader()}
          {renderDropdown()}
          <View style={styles.emptyContainer}>
            <Ionicons name="analytics-outline" size={40} color={colors.mutedForeground} style={{ marginBottom: spacing[2] }} />
            <Text style={styles.emptyText}>
              {teamFilter === "all" ? "No player props available" : `No props for ${currentTeamOption.label}`}
            </Text>
            <Text style={styles.emptySubtext}>Check back closer to game time</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <ScrollView
          ref={picksScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          onScroll={handlePicksScroll}
          scrollEventThrottle={16}
        >
          {filteredPlayers.map((player, index) => (
            <View
              key={`${player.gameId}-${player.playerName}-${index}`}
              style={[styles.cardWrapper, index === filteredPlayers.length - 1 && styles.lastCardWrapper]}
            >
              <PlayerPropCard player={player} onPress={handlePlayerPress} />
            </View>
          ))}
        </ScrollView>
        {renderDots(filteredPlayers.length, picksIndex)}
      </View>
    );
  }

  // ─── Parlays Mode ───
  if (filteredParlayLegs.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <View style={styles.emptyContainer}>
          <Ionicons name="layers-outline" size={40} color={colors.mutedForeground} style={{ marginBottom: spacing[2] }} />
          <Text style={styles.emptyText}>
            {teamFilter === "all" ? "No parlay legs available" : `No parlay legs for ${currentTeamOption.label}`}
          </Text>
          <Text style={styles.emptySubtext}>Alt lines with validated signals</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderDropdown()}
      <ScrollView
        ref={parlaysScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={PARLAY_SNAP_INTERVAL}
        decelerationRate="fast"
        onScroll={handleParlaysScroll}
        scrollEventThrottle={16}
      >
        {filteredParlayLegs.map((leg, index) => (
          <View
            key={`${leg.gameId}-${leg.playerName}-${leg.statType}-${index}`}
            style={[styles.cardWrapper, index === filteredParlayLegs.length - 1 && styles.lastCardWrapper]}
          >
            <ParlayLegCard leg={leg} onPress={handleParlayLegPress} />
          </View>
        ))}
      </ScrollView>
      {renderDots(filteredParlayLegs.length, parlaysIndex)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  header: {
    paddingHorizontal: spacing[6],
    marginBottom: spacing[3],
  },
  title: {
    color: colors.foreground,
    fontSize: typography.sizes["2xl"],
    fontFamily: typography.fontFamily.bold,
    marginBottom: spacing[2],
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  // Segmented toggle
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.full,
    padding: 3,
    flex: 1,
  },
  segmentedTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: spacing[1] + 2,
    borderRadius: borderRadius.full,
  },
  segmentedTabActive: {
    backgroundColor: colors.primary,
  },
  segmentedText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  segmentedTextActive: {
    color: colors.background,
  },
  legCountBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: borderRadius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  legCountText: {
    fontSize: 9,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  // Team selector
  teamSelector: {
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
  teamSelectorPressed: {
    opacity: 0.7,
  },
  teamSelectorText: {
    color: colors.foreground,
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
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
  scrollContent: {
    paddingLeft: HORIZONTAL_PADDING,
  },
  cardWrapper: {
    marginRight: HORIZONTAL_PADDING,
  },
  lastCardWrapper: {
    marginRight: HORIZONTAL_PADDING,
  },
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
  dotsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing[2] + 4,
    gap: spacing[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  moreDotsText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    marginLeft: spacing[1],
  },
});

export default PlayerPropsCarousel;
