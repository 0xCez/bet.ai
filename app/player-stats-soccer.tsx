import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { GradientProgressBar } from "@/components/ui/GradientProgressBar";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { TopBar } from "@/components/ui/TopBar";
import APIService from "@/services/api";
import { usePageTransition } from "@/hooks/usePageTransition";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import i18n from "@/i18n";
import { auth, db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getSoccerTeamLogo } from "@/utils/teamLogos";
import { useRouter } from "expo-router";
import { usePageTracking } from "@/hooks/usePageTracking";
import { colors, spacing, borderRadius as radii, typography } from "../constants/designTokens";
import { Ionicons } from "@expo/vector-icons";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist player data between screen navigation
let cachedPlayerResult: SoccerPlayerStatsResult | null = null;
let cachedParams: any = null;

// Interface matching the backend soccer player stats structure
interface SoccerPlayerStatsResult {
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
      allPlayers: Array<any>;
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
      allPlayers: Array<any>;
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

type SoccerPlayerStatsParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1_code?: string;
  team2_code?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
  selectedTeam?: string;
  selectedPlayer?: string;
  isDemo?: string;
};


export default function PlayerStatsSoccerNew() {
  const params = useLocalSearchParams<SoccerPlayerStatsParams>();
  const router = useRouter();
  const { animatedStyle } = usePageTransition(false);
  const { isSubscribed } = useRevenueCatPurchases();

  // Track page views and time spent
  usePageTracking({
    pageName: 'player_stats_soccer',
    metadata: {
      team1: params.team1,
      team2: params.team2,
      sport: params.sport,
      analysisId: params.analysisId,
      selectedTeam: params.selectedTeam,
      selectedPlayer: params.selectedPlayer,
      isDemo: params.isDemo === 'true',
    },
  });

  // Check if we're navigating with the same params
  const isSameAnalysis =
    cachedParams?.team1 === params.team1 &&
    cachedParams?.team2 === params.team2 &&
    cachedParams?.sport === params.sport;

  // Cache params for future comparison
  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const hasInitializedRef = useRef(false);

  // Initialize state
  const [isLoading, setIsLoading] = useState(
    !isSameAnalysis || !cachedPlayerResult
  );
  const [playerResult, setPlayerResult] = useState<SoccerPlayerStatsResult | null>(
    isSameAnalysis && cachedPlayerResult ? cachedPlayerResult : null
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(params.selectedTeam || null);
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(
    params.selectedPlayer ? JSON.parse(params.selectedPlayer) : null
  );

  // Card animation values (5 cards in player stats view)
  const cardAnimations = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0))
  ).current;

  const animateCardsIn = useCallback(() => {
    // Reset all animations
    cardAnimations.forEach(anim => anim.setValue(0));

    // Create staggered animations
    const animations = cardAnimations.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        delay: 50 + index * 100,
        useNativeDriver: true,
      })
    );

    Animated.parallel(animations).start();
  }, [cardAnimations]);

  const getCardStyle = useCallback((index: number) => ({
    opacity: cardAnimations[index],
    transform: [
      {
        translateX: cardAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [-30, 0],
        }),
      },
      {
        scale: cardAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 1],
        }),
      },
    ],
  }), [cardAnimations]);

  // Trigger animation when player is selected and data is loaded
  useEffect(() => {
    if (selectedPlayer && playerResult && !isLoading) {
      animateCardsIn();
    }
  }, [selectedPlayer, playerResult, isLoading, animateCardsIn]);

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

    // If analysisId exists AND we have team params (fresh analysis), use API
    // If analysisId exists WITHOUT team params (demo/history), load from Firestore
    if (params.analysisId && !params.team1) {
      loadPlayerStatsFromFirestore();
      return;
    }

    if (params.team1 && params.team2 && params.sport) {
      getPlayerStats();
    } else {
      setError("Missing team data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, auth.currentUser, isSameAnalysis]);

  // Load player stats from Firestore (for history/demo mode)
  const loadPlayerStatsFromFirestore = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const isDemo = params.isDemo === 'true';
      const userId = isDemo
        ? "piWQIzwI9tNXrNTgb5dWTqAjUrj2"
        : auth.currentUser?.uid;

      if (!userId || !params.analysisId) {
        throw new Error("User ID or Analysis ID missing");
      }

      // Use demoAnalysis collection for demo mode, otherwise use userAnalyses
      const collection = isDemo ? "demoAnalysis" : "userAnalyses";
      const docRef = doc(db, collection, userId, "analyses", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Analysis not found in history");
      }

      const data = docSnap.data();
      const cachedAnalysis = data.analysis;

      if (cachedAnalysis?.playerStats) {
        const playerData: SoccerPlayerStatsResult = {
          sport: data.sport || cachedAnalysis.sport,
          teams: cachedAnalysis.teams || { home: params.team1 || "", away: params.team2 || "", logos: { home: "", away: "" } },
          playerStats: cachedAnalysis.playerStats,
          timestamp: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          teamIds: cachedAnalysis.playerStats.team1?.teamId && cachedAnalysis.playerStats.team2?.teamId ?
            { team1Id: cachedAnalysis.playerStats.team1.teamId, team2Id: cachedAnalysis.playerStats.team2.teamId } :
            { team1Id: 0, team2Id: 0 }
        };

        setPlayerResult(playerData);
        cachedPlayerResult = playerData;
        console.log("✅ Loaded player stats from Firestore cache");
      } else {
        // Player stats not available in this cached analysis - show friendly message
        setError("Player stats not available for this analysis. This analysis was created before player stats were added.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Error loading player stats from Firestore:", err);
      setError("Player stats unavailable for this analysis.");
    } finally {
      setIsLoading(false);
    }
  };

  // Main function to fetch player stats data
  const getPlayerStats = async () => {
    if (playerResult) return;
    setIsLoading(true);
    setError(null);

    try {
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

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.status === "error") {
        throw new Error(response.message || "Failed to fetch player stats");
      }

      const playerData: SoccerPlayerStatsResult = response;

      setPlayerResult(playerData);
      cachedPlayerResult = playerData;
    } catch (err) {
      console.error("Error in getPlayerStats:", err);
      setError(err instanceof Error ? err.message : "Failed to get player stats");
    } finally {
      setIsLoading(false);
    }
  };

  // Navigate to info page
  const navigateToInfo = (section: string) => {
    router.push({
      pathname: "/info",
      params: {
        section,
        from: "player-stats-soccer",
        team1: params.team1,
        team2: params.team2,
        sport: params.sport,
        team1Logo: params.team1Logo,
        team2Logo: params.team2Logo,
        analysisId: params.analysisId,
        selectedTeam: selectedTeam || undefined,
        selectedPlayer: selectedPlayer ? JSON.stringify(selectedPlayer) : undefined,
      },
    });
  };

  // Render team selection screen
  const renderTeamSelection = () => {
    const teams = [
      { name: params.team1 || "", key: "team1" },
      { name: params.team2 || "", key: "team2" },
    ];

    return (
      <View style={styles.container}>
        <TopBar onBackPress={() => router.replace("/")} />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {teams.map((team) => (
          <Pressable
            key={team.key}
            onPress={() => setSelectedTeam(team.key)}
            style={styles.selectionItem}
          >
            <View style={styles.selectionContent}>
              <Image
                source={getSoccerTeamLogo(team.name)}
                style={styles.selectionLogo}
                contentFit="contain"
              />
              <Text style={styles.selectionName}>{team.name}</Text>
              <Ionicons name="chevron-forward" size={24} color={colors.mutedForeground} />
            </View>
          </Pressable>
        ))}
        </ScrollView>
      </View>
    );
  };

  // Render player selection screen
  const renderPlayerSelection = () => {
    if (!playerResult || !selectedTeam) return null;

    const teamData = selectedTeam === "team1" ? playerResult.playerStats.team1 : playerResult.playerStats.team2;
    const teamName = selectedTeam === "team1" ? params.team1 : params.team2;
    const topPlayers = teamData.topPlayers || [];

    return (
      <View style={styles.container}>
        <TopBar showBack={true} onBackPress={() => setSelectedTeam(null)} />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {topPlayers.map((player: any) => (
          <Pressable
            key={player.id}
            onPress={() => setSelectedPlayer({ ...player, teamName })}
            style={styles.selectionItem}
          >
            <View style={styles.selectionContent}>
              <Image
                source={getSoccerTeamLogo(String(teamName || ""))}
                style={styles.selectionLogo}
                contentFit="contain"
              />
              <Text style={styles.selectionName}>{player.name}</Text>
              <Ionicons name="chevron-forward" size={24} color={colors.mutedForeground} />
            </View>
          </Pressable>
        ))}
        </ScrollView>
      </View>
    );
  };

  // Render player stats
  const renderPlayerStats = () => {
    if (!selectedPlayer) return null;

    const player = selectedPlayer;
    const stats = player.stats || {};

  return (
      <View style={styles.container}>
        <TopBar showBack={true} onBackPress={() => setSelectedPlayer(null)} />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>

        {/* Top Card - Player Header */}
        <Animated.View style={getCardStyle(0)}>
          <Card style={styles.topCard}>
            <View style={styles.playerHeader}>
              <View style={styles.nameLogoRow}>
                <Text style={styles.playerName}>{player.name}</Text>
                <Image
                  source={getSoccerTeamLogo(String(player.teamName || ""))}
                  style={styles.teamLogo}
                  contentFit="contain"
                />
              </View>
            </View>
          </Card>
        </Animated.View>


        {/* Core KPIs Card */}
        <Animated.View style={getCardStyle(1)}>
          <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("playerStatsSoccerCoreKPIs")}</Text>
              <Pressable onPress={() => navigateToInfo("coreKPIs")}>
                <Text style={styles.coreKPIsInfo}>ⓘ</Text>
              </Pressable>
            </View>

          {/* First Row of KPIs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="football-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.goals || 0}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsSoccerTotalGoals")}</Text>
                </View>
            </View>

            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="locate-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.assists || 0}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsSoccerTotalAssists")}</Text>
                </View>
            </View>
          </View>

          {/* Second Row of KPIs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="time-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.minutesPerGoal || 0} {i18n.t("playerStatsSoccerMins")}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsSoccerScoresEvery")}</Text>
                </View>
            </View>

            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="stats-chart-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.goalsPerGame || 0}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsSoccerGoalsPerGame")}</Text>
                </View>
            </View>
          </View>

          {/* Third Row of KPIs */}
          <View style={[styles.kpiRow, styles.kpiRowLast]}>
            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="swap-horizontal-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.keyPasses || 0}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsSoccerKeyPasses")}</Text>
                </View>
            </View>

            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Ionicons name="card-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.yellowCards || 0}-{stats.redCards || 0}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsSoccerCards")}</Text>
                </View>
            </View>
          </View>
          </View>
        </Card>
        </Animated.View>

        {/* Stats Row - Shot Accuracy and Pass Accuracy */}
        <Animated.View style={[styles.statsRow, getCardStyle(2)]}>
          {/* Shot Accuracy Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("playerStatsSoccerShotAccuracy")}</Text>
              <Text style={styles.statValue}>{stats.shotAccuracy || 0}%</Text>
              <Text style={styles.statDescription}>{i18n.t("playerStatsSoccerScored")}</Text>
              <GradientProgressBar value={stats.shotAccuracy || 0} maxValue={100} />
            </View>
          </Card>

          {/* Pass Accuracy Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("playerStatsSoccerPassAccuracy")}</Text>
              <Text style={styles.statValue}>{stats.passAccuracy || 0}%</Text>
              <Text style={styles.statDescription}>{i18n.t("playerStatsSoccerSucceeded")}</Text>
              <GradientProgressBar value={stats.passAccuracy || 0} maxValue={100} />
            </View>
          </Card>
        </Animated.View>
        </ScrollView>
      </View>
    );
  };

  // Shimmer rendering
  const renderShimmer = () => (
    <View style={styles.container}>
      <TopBar onBackPress={() => router.replace("/")} />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Team Selection Items */}
        {[1, 2].map((index) => (
          <View key={index} style={styles.selectionItem}>
            <View style={styles.selectionContent}>
              <ShimmerPlaceholder
                style={styles.selectionLogoShimmer}
                shimmerColors={["#272E3A", "#3A4555", "#272E3A"]}
              />
              <ShimmerPlaceholder
                style={styles.selectionNameShimmer}
                shimmerColors={["#272E3A", "#3A4555", "#272E3A"]}
              />
              <ShimmerPlaceholder
                style={styles.chevronIconShimmer}
                shimmerColors={["#272E3A", "#3A4555", "#272E3A"]}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );

  // Main render logic
  const renderContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (selectedPlayer) {
      return renderPlayerStats();
    }

    if (selectedTeam) {
      return renderPlayerSelection();
    }

    return renderTeamSelection();
  };

  return (
    <ScreenBackground hideBg>
      <Animated.View style={[styles.mainContainer, animatedStyle]}>
        {isLoading ? renderShimmer() : renderContent()}
      </Animated.View>

      {/* Floating Bottom Nav */}
      <FloatingBottomNav
        activeTab="players"
        analysisData={{
          team1: params.team1 || playerResult?.teams?.home,
          team2: params.team2 || playerResult?.teams?.away,
          sport: params.sport || playerResult?.sport,
          team1Logo: params.team1Logo,
          team2Logo: params.team2Logo,
          analysisId: params.analysisId,
          isDemo: params.isDemo === "true",
        }}
        isSubscribed={isSubscribed}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 120, // Extra padding for FloatingBottomNav
  },
  shimmerContainer: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#FF5252",
    fontSize: 16,
    textAlign: "center",
    fontFamily: "Aeonik-Regular",
  },
  selectionTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 28,
    color: "#FFFFFF",
    marginBottom: 24,
  },
  selectionItem: {
    height: 85.87,
    borderRadius: radii.xl,
    marginBottom: spacing[4],
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  selectionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[5],
    gap: spacing[3],
  },
  selectionLogo: {
    width: 58,
    height: 40,
  },
  selectionName: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.lg,
    color: colors.foreground,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16,
    color: "#00C2E0",
  },
  topCard: {
    height: 85.87,
  },
  playerHeader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13.44,
    paddingHorizontal: 22,
    gap: 4,
  },
  nameLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playerName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#FFFFFF",
  },
  teamLogo: {
    width: 58.11,
    height: 38.28,
  },
  position: {
    fontFamily: "Aeonik-Light",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    height: 132.55,
  },
  statCardSmall: {
    flex: 1,
    height: 117.1,
  },
  statContent: {
    flex: 1,
    paddingVertical: 20.15,
    paddingHorizontal: 21.83,
    gap: 8,
  },
  statLabel: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.6,
  },
  statValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 26.87,
    color: "#FFFFFF",
  },
  statDescription: {
    fontFamily: "Aeonik-Light",
    fontSize: 11.42,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  coreKPIsCard: {
    marginTop: 16,
  },
  coreKPIsContent: {
    paddingVertical: 22,
    paddingHorizontal: 0,
  },
  coreKPIsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    marginBottom: 20,
  },
  coreKPIsTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  coreKPIsInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  kpiRow: {
    flexDirection: "row",
    paddingHorizontal: 20.15,
    gap: 20,
    marginBottom: 16,
  },
  kpiRowLast: {
    marginBottom: 0,
  },
  kpiItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  kpiTextContainer: {
    flex: 1,
    gap: 4,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  kpiValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  kpiLabel: {
    fontFamily: "Aeonik-Light",
    fontSize: 11.42,
    color: "#FFFFFF",
  },
  // Shimmer Styles
  selectionLogoShimmer: {
    width: 58.11,
    height: 38.28,
  },
  selectionNameShimmer: {
    height: 20,
    borderRadius: 8,
    width: "60%",
    marginLeft: 12,
  },
  chevronIconShimmer: {
    width: 24,
    height: 24,
  },
  statLabelShimmer: {
    height: 13,
    borderRadius: 5,
    width: "70%",
  },
  statValueShimmer: {
    height: 27,
    borderRadius: 10,
    width: "50%",
  },
  statDescriptionShimmer: {
    height: 11,
    borderRadius: 4,
    width: "80%",
    marginBottom: 4,
  },
  progressBarShimmer: {
    height: 5,
    borderRadius: 20,
    width: "100%",
  },
  coreKPIsTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "50%",
  },
  coreKPIsInfoShimmer: {
    height: 17,
    borderRadius: 6,
    width: 20,
  },
  kpiValueShimmer: {
    height: 20,
    borderRadius: 6,
    width: "60%",
  },
  kpiLabelShimmer: {
    height: 11,
    borderRadius: 4,
    width: "70%",
    marginTop: 4,
  },
});
