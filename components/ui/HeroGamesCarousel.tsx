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
import { HeroGameCard, HeroGameCardSkeleton, HERO_CARD_WIDTH, HERO_CARD_MARGIN } from "./HeroGameCard";
import { CachedGame } from "./CachedGameCard";
import { colors, spacing, typography, borderRadius } from "../../constants/designTokens";
import { useCachedGames } from "../../app/hooks/useCachedGames";

type SportFilter = "all" | "nba" | "soccer";

const SPORT_OPTIONS: { id: SportFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "all", label: "All Sports", icon: "trophy" },
  { id: "nba", label: "NBA", icon: "basketball" },
  { id: "soccer", label: "Soccer", icon: "football" },
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const HORIZONTAL_PADDING = spacing[6]; // Match card's padding
const SNAP_INTERVAL = HERO_CARD_WIDTH + HORIZONTAL_PADDING; // Card width + gap between cards

/**
 * Carousel showing ALL pre-cached games from Firestore
 * Games are fetched fresh from server on every mount and foreground return
 * Sorted by game start time (soonest first)
 */
export const HeroGamesCarousel: React.FC = () => {
  const scrollViewRef = useRef<ScrollView>(null);
  // Fetch ALL pre-cached games from Firestore
  const { games: allGames, loading, error } = useCachedGames();
  const [activeIndex, setActiveIndex] = useState(0);
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [showDropdown, setShowDropdown] = useState(false);

  // Filter games by selected sport (no limit - show all)
  const games = useMemo(() => {
    if (sportFilter === "all") return allGames;
    return allGames.filter(game => game.sport === sportFilter);
  }, [allGames, sportFilter]);

  // Debug logging
  console.log(`[HeroGamesCarousel] Loading: ${loading}, Filter: ${sportFilter}, AllGames: ${allGames.length}, Filtered: ${games.length}, NBA games: ${allGames.filter(g => g.sport === 'nba').length}`);

  // Get current sport label
  const currentSportOption = SPORT_OPTIONS.find(opt => opt.id === sportFilter) || SPORT_OPTIONS[0];

  const handleSportSelect = (sport: SportFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSportFilter(sport);
    setShowDropdown(false);
    setActiveIndex(0);
    // Reset scroll position
    scrollViewRef.current?.scrollTo({ x: 0, animated: false });
  };

  const handleGamePress = (game: CachedGame) => {
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
        from: "discover",
      },
    });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SNAP_INTERVAL);
    if (index !== activeIndex && index >= 0 && index < games.length) {
      setActiveIndex(index);
    }
  };

  // Render header with sport selector
  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>This Week's Top Picks</Text>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowDropdown(true);
        }}
        style={({ pressed }) => [
          styles.sportSelector,
          pressed && styles.sportSelectorPressed,
        ]}
      >
        <Ionicons name={currentSportOption.icon} size={14} color={colors.primary} />
        <Text style={styles.sportSelectorText}>{currentSportOption.label}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );

  // Render dropdown modal
  const renderDropdown = () => (
    <Modal
      visible={showDropdown}
      transparent
      animationType="fade"
      onRequestClose={() => setShowDropdown(false)}
    >
      <Pressable
        style={styles.dropdownOverlay}
        onPress={() => setShowDropdown(false)}
      >
        <View style={styles.dropdownContainer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Select Sport</Text>
            {SPORT_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => handleSportSelect(option.id)}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  sportFilter === option.id && styles.dropdownOptionActive,
                  pressed && styles.dropdownOptionPressed,
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={sportFilter === option.id ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.dropdownOptionText,
                    sportFilter === option.id && styles.dropdownOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                {sportFilter === option.id && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // Loading state - show skeleton card
  // Show loading if explicitly loading OR if we have no data yet (prevents empty state flash)
  if (loading || (allGames.length === 0 && !error)) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <View style={styles.scrollContent}>
          <View style={styles.cardWrapper}>
            <HeroGameCardSkeleton />
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
          <Text style={styles.emptyText}>Couldn't load games right now</Text>
        </View>
      </View>
    );
  }

  // Empty state (no games for selected filter)
  if (games.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderDropdown()}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No {sportFilter === "all" ? "" : currentSportOption.label + " "}games available
          </Text>
          <Text style={styles.emptySubtext}>Check back later for new picks</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderDropdown()}

      {/* Hero Cards Carousel */}
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
        {games.map((game, index) => (
          <View
            key={game.id}
            style={[
              styles.cardWrapper,
              index === games.length - 1 && styles.lastCardWrapper,
            ]}
          >
            <HeroGameCard
              game={game}
              onPress={handleGamePress}
            />
          </View>
        ))}
      </ScrollView>

      {/* Page Indicator Dots */}
      {games.length > 1 && (
        <View style={styles.dotsContainer}>
          {games.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // No flex: 1 - let it size to content
  },
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
  sportSelector: {
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
  sportSelectorPressed: {
    opacity: 0.7,
  },
  sportSelectorText: {
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
    marginTop: spacing[4],
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
});

export default HeroGamesCarousel;
