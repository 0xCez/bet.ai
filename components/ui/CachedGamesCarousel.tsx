import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { CachedGameCard, CachedGame } from "./CachedGameCard";
import { colors, spacing, typography } from "../../constants/designTokens";
import { useCachedGames } from "../../app/hooks/useCachedGames";

interface CachedGamesCarouselProps {
  maxGames?: number;
}

export const CachedGamesCarousel: React.FC<CachedGamesCarouselProps> = ({
  maxGames = 10,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const { games, loading, error } = useCachedGames(maxGames);

  const handleGamePress = (game: CachedGame) => {
    // Navigate to analysis screen with the cached data
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
      },
    });
  };

  // Don't render anything if no games and not loading
  if (!loading && games.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="flame" size={16} color={colors.primary} />
        <Text style={styles.title}>Top Picks</Text>
      </View>

      {/* Loading State */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {/* Error State */}
      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Couldn't load games</Text>
        </View>
      )}

      {/* Games Carousel */}
      {!loading && !error && games.length > 0 && (
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          decelerationRate="fast"
        >
          {games.map((game) => (
            <CachedGameCard
              key={game.id}
              game={game}
              onPress={handleGamePress}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  title: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[4],
  },
  errorContainer: {
    alignItems: "center",
    paddingVertical: spacing[4],
  },
  errorText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
});

export default CachedGamesCarousel;
