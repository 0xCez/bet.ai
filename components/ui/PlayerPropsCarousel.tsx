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
import { colors, spacing, typography, borderRadius } from "../../constants/designTokens";
import { useCachedGames } from "../../app/hooks/useCachedGames";

type TeamFilter = "all" | string;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6];
const SNAP_INTERVAL = PLAYER_CARD_WIDTH + HORIZONTAL_PADDING;

/**
 * Carousel showing player props extracted from all pre-cached games
 * Props are sorted by confidence (highest first)
 * Filterable by team
 */
export const PlayerPropsCarousel: React.FC = () => {
  const scrollViewRef = useRef<ScrollView>(null);
  const { games: allGames, loading, error } = useCachedGames();
  const [activeIndex, setActiveIndex] = useState(0);
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [showDropdown, setShowDropdown] = useState(false);

  // Extract all player props from all games and GROUP BY PLAYER
  const { playersByName, uniqueTeams } = useMemo(() => {
    const playerMap = new Map<string, PlayerWithProps>();
    const teamsSet = new Set<string>();

    allGames.forEach((game) => {
      const mlProps = game.analysis?.mlPlayerProps?.topProps || [];
      const gameTime = game.gameStartTime;

      mlProps.forEach((prop: any) => {
        // Skip props with missing essential data
        if (!prop.playerName || !prop.statType) {
          console.log("[PlayerPropsCarousel] Skipping prop with missing data:", prop);
          return;
        }

        // Determine opponent based on player's team
        const isHomeTeam = prop.team === game.team1;
        const opponent = isHomeTeam ? game.team2 : game.team1;

        const enrichedProp: EnrichedPlayerProp = {
          ...prop,
          gameId: game.id,
          sport: game.sport,
          opponent,
          gameStartTime: gameTime,
        };

        // Create a unique key for player (name + team + gameId to handle same player name on different teams)
        const playerKey = `${prop.playerName}-${prop.team}-${game.id}`;

        if (playerMap.has(playerKey)) {
          // Add prop to existing player
          playerMap.get(playerKey)!.props.push(enrichedProp);
          // Update best confidence tier
          const currentBest = playerMap.get(playerKey)!.bestConfidenceTier;
          const propTier = prop.confidenceTier || prop.bettingValue || "medium";
          if (propTier === "high" || (propTier === "medium" && currentBest === "low")) {
            playerMap.get(playerKey)!.bestConfidenceTier = propTier as "high" | "medium" | "low";
          }
        } else {
          // Create new player entry
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

        if (prop.team) {
          teamsSet.add(prop.team);
        }
      });
    });

    // Convert map to array and sort by best confidence tier
    const players = Array.from(playerMap.values());
    players.sort((a, b) => {
      const tierOrder = { high: 0, medium: 1, low: 2 };
      const tierDiff = tierOrder[a.bestConfidenceTier] - tierOrder[b.bestConfidenceTier];
      if (tierDiff !== 0) return tierDiff;

      // Secondary sort by number of props (more props = more interesting)
      return b.props.length - a.props.length;
    });

    return {
      playersByName: players,
      uniqueTeams: Array.from(teamsSet).sort(),
    };
  }, [allGames]);

  // Filter players by selected team
  const filteredPlayers = useMemo(() => {
    if (teamFilter === "all") return playersByName;
    return playersByName.filter((player) => player.team === teamFilter);
  }, [playersByName, teamFilter]);

  // Team options for dropdown
  const teamOptions = useMemo(() => {
    const options: { id: TeamFilter; label: string }[] = [{ id: "all", label: "All Teams" }];
    uniqueTeams.forEach((team) => {
      // Get short team name for display
      const parts = team.split(" ");
      const shortName = parts[parts.length - 1];
      options.push({ id: team, label: shortName });
    });
    return options;
  }, [uniqueTeams]);

  // Current filter label
  const currentTeamOption = teamOptions.find((opt) => opt.id === teamFilter) || teamOptions[0];

  const handleTeamSelect = (team: TeamFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTeamFilter(team);
    setShowDropdown(false);
    setActiveIndex(0);
    scrollViewRef.current?.scrollTo({ x: 0, animated: false });
  };

  const handlePlayerPress = (player: PlayerWithProps) => {
    // Navigate to game analysis
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

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SNAP_INTERVAL);
    if (index !== activeIndex && index >= 0 && index < filteredPlayers.length) {
      setActiveIndex(index);
    }
  };

  // Render header with team selector
  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>Hot Player Props</Text>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowDropdown(true);
        }}
        style={({ pressed }) => [styles.teamSelector, pressed && styles.teamSelectorPressed]}
      >
        <Ionicons name="people" size={14} color={colors.primary} />
        <Text style={styles.teamSelectorText}>{currentTeamOption.label}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );

  // Render dropdown modal
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

  // Loading state
  if (loading || (allGames.length === 0 && !error)) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <View style={styles.scrollContent}>
          <View style={styles.cardWrapper}>
            <PlayerPropCardSkeleton />
          </View>
        </View>
      </View>
    );
  }

  // Error state
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

  // Empty state (no players available)
  if (filteredPlayers.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <View style={styles.emptyContainer}>
          <Ionicons name="trending-up-outline" size={48} color={colors.mutedForeground} style={{ marginBottom: spacing[3] }} />
          <Text style={styles.emptyText}>
            {teamFilter === "all" ? "No player props available" : `No props for ${currentTeamOption.label}`}
          </Text>
          <Text style={styles.emptySubtext}>Check back later for ML predictions</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderDropdown()}

      {/* Player Cards Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        onScroll={handleScroll}
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

      {/* Page Indicator Dots */}
      {filteredPlayers.length > 1 && (
        <View style={styles.dotsContainer}>
          {filteredPlayers.slice(0, Math.min(filteredPlayers.length, 10)).map((_, index) => (
            <View key={index} style={[styles.dot, index === activeIndex && styles.dotActive]} />
          ))}
          {filteredPlayers.length > 10 && <Text style={styles.moreDotsText}>+{filteredPlayers.length - 10}</Text>}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  header: {
    paddingHorizontal: spacing[6],
    marginBottom: spacing[4],
  },
  title: {
    color: colors.foreground,
    fontSize: typography.sizes["2xl"],
    fontFamily: typography.fontFamily.bold,
    marginBottom: spacing[2],
  },
  teamSelector: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing[2],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
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
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  // Dropdown styles
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
