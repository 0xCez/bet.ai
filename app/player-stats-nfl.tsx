import React, { useState, useEffect } from "react";
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  Text,
  ViewStyle,
  Animated,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import { LinearGradient } from "expo-linear-gradient";
import APIService from "../services/api";
import { GradientButton } from "../components/ui/GradientButton";
import { BorderButton } from "../components/ui/BorderButton";
import { TopBar } from "../components/ui/TopBar";
import { db, auth } from "../firebaseConfig";
import { BlurText } from "../components/ui/BlurText";
import { FloatingBottomNav } from "../components/ui/FloatingBottomNav";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { usePostHog } from "posthog-react-native";
import { usePageTransition } from "../hooks/usePageTransition";
import i18n from "../i18n";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist player data between screen navigation
let cachedPlayerResult: PlayerStatsResult | null = null;
let cachedParams: any = null;

// Track page view time
let pageEntryTime: number | null = null;

// Interface matching the backend player stats structure
interface PlayerStatsResult {
  sport: string;
  teams: {
    home: string;
    away: string;
    logos: {
      home: string;
      away: string;
    };
  };
  playerStats: {
    team1: {
      teamId: number;
      allPlayers: any; // This is actually an object with team/season/topPlayers/allCategories
      topPlayers: Array<{
        id: string;
        name: string;
        position: string;
        category: string;
        stats: any;
      }>;
      playerCount: number;
      error: string | null;
    };
    team2: {
      teamId: number;
      allPlayers: any; // This is actually an object with team/season/topPlayers/allCategories
      topPlayers: Array<{
        id: string;
        name: string;
        position: string;
        category: string;
        stats: any;
      }>;
      playerCount: number;
      error: string | null;
    };
  };
  timestamp: string;
  teamIds: { team1Id: number; team2Id: number };
}

type PlayerStatsParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1_code?: string;
  team2_code?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
};

export default function PlayerStatsScreen() {
  const params = useLocalSearchParams<PlayerStatsParams>();
  const { isSubscribed } = useRevenueCatPurchases();
  const posthog = usePostHog();
  const { animatedStyle } = usePageTransition(false);

  // Track page view time
  useEffect(() => {
    if (!auth.currentUser) return;

    pageEntryTime = Date.now();

    posthog?.capture("player_stats_page_viewed", {
      userId: (auth.currentUser as any)?.uid,
      sport: params.sport,
      teams: `${params.team1} vs ${params.team2}`,
    });

    return () => {
      if (pageEntryTime && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTime;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture("player_stats_page_exit", {
          userId: (auth.currentUser as any)?.uid,
          sport: params.sport,
          teams: `${params.team1} vs ${params.team2}`,
          timeSpentSeconds: timeSpentSeconds,
        });

        pageEntryTime = null;
      }
    };
  }, [params.team1, params.team2, params.sport]);

  // Check if we're navigating with the same params
  const isSameAnalysis =
    cachedParams?.team1 === params.team1 &&
    cachedParams?.team2 === params.team2 &&
    cachedParams?.sport === params.sport;

  // Cache params for future comparison
  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const hasInitializedRef = React.useRef(false);

  // Initialize state, potentially from cache
  const [isLoading, setIsLoading] = useState(
    !isSameAnalysis || !cachedPlayerResult
  );
  const [playerResult, setPlayerResult] = useState<PlayerStatsResult | null>(
    isSameAnalysis && cachedPlayerResult ? cachedPlayerResult : null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Skip re-fetching if we're navigating back to the same analysis
    if (isSameAnalysis && cachedPlayerResult) {
      setIsLoading(false);
      return;
    }

    // Reset cache when loading new analysis
    if (!isSameAnalysis) {
      cachedPlayerResult = null;
    }

    if (params.team1 && params.team2 && params.sport) {
      console.log(
        `Player Stats Flow: Starting analysis for ${params.sport}: ${params.team1} vs ${params.team2}`
      );
      getPlayerStats();
    } else {
      console.error("Error: Missing required parameters (team1, team2, sport).");
      setError("Missing team data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, auth.currentUser, isSameAnalysis]);

  // Main function to fetch player stats data
  const getPlayerStats = async () => {
    if (playerResult) return;
    setIsLoading(true);
    setError(null);

    try {
      console.log("Fetching player stats data...");

      if (!params.sport) {
        throw new Error("Sport parameter is required but missing");
      }

      const response = await APIService.getMarketIntelligence(
        params.sport,
        params.team1 || "",
        params.team2 || "",
        params.team1_code,
        params.team2_code
      );

      console.log("Player Stats Response:", response);

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.status === "error") {
        throw new Error(response.message || "Failed to fetch player stats");
      }

      const playerData: PlayerStatsResult = response;

      setPlayerResult(playerData);
      cachedPlayerResult = playerData;

    } catch (err) {
      console.error("Error in getPlayerStats:", err);
      setError(
        err instanceof Error ? err.message : "Failed to get player stats"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to render individual player card
  const renderPlayerCard = (player: any, teamName: string) => {
    if (!player) return null;

    // Get player stats based on position
    const stats = player.stats || {};

    return (
      <View style={styles.playerSection}>
        {/* Player Header Card */}
        <View style={[styles.card, styles.headerCard]}>
          <View style={styles.headerContent}>
            <Text style={styles.playerName}>{player.name || "Jalen Hurts"}</Text>
            <Image
              source={{ uri: `../assets/images/${teamName?.replace(/\s+/g, '_')}.svg` }}
              style={styles.teamLogo}
            />
          </View>
        </View>

        {/* QB Rating & Total TDs Row */}
        <View style={styles.topStatsRow}>
          {/* QB Rating Card */}
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.sectionLabel}>QB RATING</Text>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>
                {stats.qbRating?.toFixed(1) || "103.7"}
              </Text>
              <Text style={styles.statDescription}>
                Ranked on {stats.passingYards || "158.3"} points
              </Text>
              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <LinearGradient
                  colors={["#00ddff", "#0bff13"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressBar}
                />
                <View style={[
                  styles.progressIndicator,
                  { left: `${Math.min((stats.qbRating || 103.7) / 158.3 * 100, 100)}%` }
                ]} />
              </View>
            </View>
          </View>

          {/* Total TDs Card */}
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.sectionLabel}>TOTAL TD's</Text>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>
                {(stats.passingTouchdowns || 18) + (stats.rushingTouchdowns || 14)}
              </Text>
              <Text style={styles.statDescription}>
                {((stats.passingTouchdowns || 18) / ((stats.passingTouchdowns || 18) + (stats.rushingTouchdowns || 14)) * 100).toFixed(1)}% across all attempts
              </Text>
              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <LinearGradient
                  colors={["#00ddff", "#0bff13"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressBar}
                />
                <View style={[
                  styles.progressIndicator,
                  { left: "68%" }
                ]} />
              </View>
            </View>
          </View>
        </View>

        {/* Core KPIs Card */}
        <View style={[styles.card, styles.coreKpisCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Core KPIs 🦾</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>

          {/* First Row - Pass Yards, Pass TDs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats.passingYardsPerGame?.toFixed(1) || "193.5"}
                </Text>
                <Text style={styles.kpiLabel}>Pass Yards per game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats.passingTouchdowns || "18"}
                </Text>
                <Text style={styles.kpiLabel}>Pass TDs</Text>
              </View>
            </View>
          </View>

          {/* Second Row - Rush Yards, Rush TDs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats.rushingYardsPerGame?.toFixed(1) || "42.0"}
                </Text>
                <Text style={styles.kpiLabel}>Rush Yards per game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats.rushingTouchdowns || "14"}
                </Text>
                <Text style={styles.kpiLabel}>Rush TDs</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Advanced Metrics Row */}
        <View style={styles.advancedRow}>
          {/* Longest Pass Card */}
          <View style={[styles.card, styles.advancedCard]}>
            <Text style={styles.sectionLabel}>LONGEST PASS</Text>
            <View style={styles.advancedContent}>
              <Text style={styles.advancedValue}>
                {stats.longestPass || "67"}
              </Text>
              <Text style={styles.advancedLabel}>Yards</Text>
            </View>
          </View>

          {/* Sacks Taken Card */}
          <View style={[styles.card, styles.advancedCard]}>
            <Text style={styles.sectionLabel}>SACKS TAKEN</Text>
            <View style={styles.advancedContent}>
              <Text style={styles.advancedValue}>
                {stats.sacks || "38"}
              </Text>
              <Text style={styles.advancedLabel}>On all season</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Shimmer rendering
  const renderShimmer = () => (
    <View style={styles.shimmerContainer}>
      {/* Header Shimmer */}
      <View style={styles.shimmerGroup}>
        <LinearGradient
          colors={["#1A1A1A", "#363636"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientContainer}
        >
          <ShimmerPlaceholder
            style={styles.shimmerLine}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </LinearGradient>
      </View>

      {/* Content Shimmer Groups */}
      {[1, 2, 3].map((_, index) => (
        <View key={index} style={styles.shimmerGroup}>
          <LinearGradient
            colors={["#1A1A1A", "#363636"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientContainer}
          >
            <ShimmerPlaceholder
              style={styles.shimmerLine}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={[styles.shimmerLine, { width: "100%" }]}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
          </LinearGradient>
        </View>
      ))}
    </View>
  );

  // Main content rendering
  const renderPlayerContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    // Get top players from both teams - use the correct data path
    const team1TopPlayers = playerResult?.playerStats?.team1?.topPlayers || [];
    const team2TopPlayers = playerResult?.playerStats?.team2?.topPlayers || [];

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.analysisContent}
      >
        {/* Team 1 Players */}
        {team1TopPlayers.map((player, index) => (
          <View key={`team1-${index}`}>
            {renderPlayerCard(player, params.team1 || "")}
          </View>
        ))}

        {/* Team 2 Players */}
        {team2TopPlayers.map((player, index) => (
          <View key={`team2-${index}`}>
            {renderPlayerCard(player, params.team2 || "")}
          </View>
        ))}


        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <BorderButton
            onPress={() => {
              router.back();
            }}
            containerStyle={styles.floatingButton}
            borderColor="#00C2E0"
            backgroundColor="#00C2E020"
            opacity={1}
            borderWidth={1}
          >
            <Text style={styles.buttonText}>Back to Analysis</Text>
          </BorderButton>

          <GradientButton
            onPress={getPlayerStats}
            style={{ marginTop: 16 }}
          >
            <Text style={styles.buttonText}>Refresh Stats 👤</Text>
          </GradientButton>
        </View>
      </ScrollView>
    );
  };

  // Main render
  return (
    <ScreenBackground hideBg>
      <TopBar />

      <View style={styles.container}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.scrollView, animatedStyle]}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.analysisContainer}>
            {isLoading ? renderShimmer() : renderPlayerContent()}
          </View>
        </Animated.ScrollView>

        {/* Floating Bottom Navigation */}
        <FloatingBottomNav
          activeTab="players"
          analysisData={{
            team1: params.team1,
            team2: params.team2,
            sport: params.sport,
            team1Logo: params.team1Logo,
            team2Logo: params.team2Logo,
            analysisId: params.analysisId, // Pass analysisId if available
          }}
        />
      </View>
    </ScreenBackground>
  );
}

// Styles - EXACTLY matching Figma dimensions
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 0,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 120, // Extra padding for floating nav
  },
  analysisContainer: {
    paddingTop: 20,
    flex: 1,
  },
  shimmerContainer: {
    width: "100%",
  },
  shimmerGroup: {
    width: "100%",
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 0.3,
    borderColor: "#888888",
    overflow: "hidden",
  },
  gradientContainer: {
    width: "100%",
    padding: 15,
    opacity: 0.6,
    gap: 8,
  },
  shimmerLine: {
    height: 20,
    borderRadius: 15,
    marginBottom: 0,
    width: "100%",
  },
  analysisContent: {
    flex: 1,
    paddingBottom: 40,
  },
  errorContainer: {
    padding: 20,
  },
  errorText: {
    color: "#424242",
    fontSize: 16,
    textAlign: "center",
    fontFamily: "Aeonik-Regular",
  },

  // Player Section Styles
  playerSection: {
    marginBottom: 30,
  },

  // Universal Card Styles
  card: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "#212121",
    padding: 20,
    marginBottom: 15,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    fontFamily: "Aeonik-Medium",
  },
  infoIcon: {
    fontSize: 18,
    color: "#ffffff",
  },

  // Header Card Styles - Match Figma exactly
  headerCard: {
    backgroundColor: "#0c0c0c",
    height: 80,
    justifyContent: "center",
    borderRadius: 40,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 30,
  },
  playerName: {
    color: "#ffffff",
    fontSize: 18,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    flex: 1,
    textAlign: "left",
  },
  teamLogo: {
    width: 45,
    height: 45,
    borderRadius: 22,
  },

  // Top Stats Row (QB Rating & Total TDs)
  topStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 15,
  },
  statCard: {
    flex: 1,
    height: 160,
    padding: 15,
  },
  sectionLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    opacity: 0.6,
    marginBottom: 15,
  },
  statContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  statValue: {
    color: "#ffffff",
    fontSize: 24,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
  },
  statDescription: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 12,
    borderRadius: 100,
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#333333",
  },
  progressBar: {
    flex: 1,
    height: "100%",
  },
  progressIndicator: {
    position: "absolute",
    top: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },

  // Core KPIs Card Styles - Match Figma exactly
  coreKpisCard: {
    minHeight: 200,
    padding: 15,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  kpiItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
  },
  kpiIcon: {
    width: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: "#161616",
    marginRight: 10,
  },
  kpiContent: {
    flex: 1,
  },
  kpiValue: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginBottom: 2,
  },
  kpiLabel: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    opacity: 0.8,
  },

  // Advanced Metrics Row
  advancedRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 15,
  },
  advancedCard: {
    flex: 1,
    height: 140,
    padding: 15,
  },
  advancedContent: {
    flex: 1,
    justifyContent: "center",
  },
  advancedValue: {
    color: "#ffffff",
    fontSize: 24,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginBottom: 6,
  },
  advancedLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
  },


  // Action Buttons
  actionContainer: {
    marginBottom: 40,
  },
  buttonText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontFamily: "Aeonik-Medium",
  },
  floatingButton: {
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    padding: 10,
  },
});
