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
import { GaugeProgressBar } from "@/components/ui/GaugeProgressBar";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { TopBar } from "@/components/ui/TopBar";
import APIService from "@/services/api";
import { usePageTransition } from "@/hooks/usePageTransition";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import i18n from "@/i18n";
import { auth, db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getNBATeamLogo } from "@/utils/teamLogos";
import { useRouter } from "expo-router";
import { usePageTracking } from "@/hooks/usePageTracking";
import { colors, spacing, borderRadius as radii, typography, shimmerColors } from "../constants/designTokens";
import { Ionicons } from "@expo/vector-icons";
import { TeamSelectorHeader } from "@/components/ui/TeamSelectorHeader";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist team data between screen navigation
let cachedTeamResult: NBATeamStatsResult | null = null;
let cachedParams: any = null;

// Interface matching the backend NBA team stats structure
interface NBATeamStatsResult {
  sport: string;
  teams: {
    home: string;
    away: string;
    logos: {
      home: string;
      away: string;
    };
  };
  teamStats: {
    team1: {
      teamId: number;
      stats: {
        team: any;
        points: number;
        fgp: number;
        tpp: number;
        ftp: number;
        totReb: number;
        offReb: number;
        defReb: number;
        assists: number;
        steals: number;
        blocks: number;
        turnovers: number;
        pFouls: number;
        plusMinus: number;
        calculated: {
          reboundsPerGame: number;
          assistsPerGame: number;
          stealsPerGame: number;
          blocksPerGame: number;
          turnoversPerGame: number;
          turnoverDifferential: number;
          offRebPerGame: number;
          defRebPerGame: number;
          foulsPerGame: number;
          pointsPerGame?: number;
          opponentPointsPerGame?: number;
          homeAverage?: number;
          awayAverage?: number;
          recentForm?: string;
          momentum?: string;
        };
        games: number;
      };
      error: string | null;
    };
    team2: {
      teamId: number;
      stats: any;
      error: string | null;
    };
  };
  timestamp: string;
  teamIds: { team1Id: number; team2Id: number };
}

type NBATeamStatsParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1_code?: string;
  team2_code?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
  selectedTeam?: string;
  isDemo?: string;
  fromCache?: string; // "true" when viewing pre-cached games from carousel
  cachedGameId?: string; // Firestore doc ID for pre-cached games
};

// Helper function to parse momentum from recent form string
const parseMomentumFromForm = (recentForm?: string, momentum?: string) => {
  if (!recentForm || !momentum) return { value: 0, maxValue: 5, primaryText: "N/A", secondaryText: "No data" };

  // momentum is like "4W" or "2L"
  const streakCount = parseInt(momentum.slice(0, -1)) || 0;
  const streakType = momentum.slice(-1);
  const streakText = streakType === "W" ?
    `${streakCount}-game win streak` :
    `${streakCount}-game loss streak`;

  // For losses, show 0 momentum (no positive momentum)
  const gaugeValue = streakType === "W" ? streakCount : 0;

  return { value: gaugeValue, maxValue: 5, primaryText: momentum, secondaryText: streakText };
};

export default function TeamStatsNBANew() {
  const params = useLocalSearchParams<NBATeamStatsParams>();
  const router = useRouter();
  const { animatedStyle } = usePageTransition(false);
  const { isSubscribed } = useRevenueCatPurchases();

  // Track page views and time spent
  usePageTracking({
    pageName: 'team_stats_nba',
    metadata: {
      team1: params.team1,
      team2: params.team2,
      sport: params.sport,
      analysisId: params.analysisId,
      selectedTeam: params.selectedTeam,
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
  const [isLoading, setIsLoading] = useState(!isSameAnalysis || !cachedTeamResult);
  const [teamResult, setTeamResult] = useState<NBATeamStatsResult | null>(
    isSameAnalysis && cachedTeamResult ? cachedTeamResult : null
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<"team1" | "team2">(
    (params.selectedTeam as "team1" | "team2") || "team1"
  );

  // Card animation values (8 cards in team stats view)
  const cardAnimations = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(0))
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

  // Trigger animation when team is selected and data is loaded
  useEffect(() => {
    if (selectedTeam && teamResult && !isLoading) {
      animateCardsIn();
    }
  }, [selectedTeam, teamResult, isLoading, animateCardsIn]);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Skip re-fetching if we're navigating back to the same analysis
    if (isSameAnalysis && cachedTeamResult) {
      setIsLoading(false);
      return;
    }

    // Reset cache when loading new analysis
    if (!isSameAnalysis) {
      cachedTeamResult = null;
    }

    // If analysisId exists (history/demo/cached), load from Firestore instead of API
    if (params.analysisId) {
      if (params.fromCache === "true") {
        loadTeamStatsFromCache();
      } else {
        loadTeamStatsFromFirestore();
      }
      return;
    }

    if (params.team1 && params.team2 && params.sport) {
      getTeamStats();
    } else {
      setError("Missing team data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, auth.currentUser, isSameAnalysis]);

  // Load team stats from Firestore (for history/demo mode)
  const loadTeamStatsFromFirestore = async () => {
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

      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/firebaseConfig");

      // Use demoAnalysis collection for demo mode, otherwise use userAnalyses
      const collection = isDemo ? "demoAnalysis" : "userAnalyses";
      const docRef = doc(db, collection, userId, "analyses", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Analysis not found in history");
      }

      const data = docSnap.data();
      const cachedAnalysis = data.analysis;

      if (cachedAnalysis?.teamStats) {
        const teamData: NBATeamStatsResult = {
          sport: data.sport || cachedAnalysis.sport,
          teams: cachedAnalysis.teams || { home: params.team1 || "", away: params.team2 || "", logos: { home: "", away: "" } },
          teamStats: cachedAnalysis.teamStats,
          timestamp: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          teamIds: cachedAnalysis.teamStats.team1?.teamId && cachedAnalysis.teamStats.team2?.teamId ?
            { team1Id: cachedAnalysis.teamStats.team1.teamId, team2Id: cachedAnalysis.teamStats.team2.teamId } :
            { team1Id: 0, team2Id: 0 }
        };

        setTeamResult(teamData);
        cachedTeamResult = teamData;
        console.log("✅ Loaded team stats from Firestore cache");
      } else {
        throw new Error("No team stats data in cached analysis");
      }
    } catch (err) {
      console.error("Error loading team stats from Firestore:", err);
      setError("Team stats unavailable for this analysis.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load team stats from pre-cached games (matchAnalysisCache collection)
  const loadTeamStatsFromCache = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!params.analysisId) {
        throw new Error("Cache ID missing");
      }

      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/firebaseConfig");

      // Pre-cached games are stored in matchAnalysisCache collection
      const docRef = doc(db, "matchAnalysisCache", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Cached analysis not found");
      }

      const data = docSnap.data();
      const cachedAnalysis = data.analysis || {};

      if (cachedAnalysis?.teamStats) {
        const teamData: NBATeamStatsResult = {
          sport: data.sport || cachedAnalysis.sport,
          teams: cachedAnalysis.teams || { home: params.team1 || "", away: params.team2 || "", logos: { home: "", away: "" } },
          teamStats: cachedAnalysis.teamStats,
          timestamp: data.timestamp || new Date().toISOString(),
          teamIds: cachedAnalysis.teamStats.team1?.teamId && cachedAnalysis.teamStats.team2?.teamId ?
            { team1Id: cachedAnalysis.teamStats.team1.teamId, team2Id: cachedAnalysis.teamStats.team2.teamId } :
            { team1Id: 0, team2Id: 0 }
        };

        setTeamResult(teamData);
        cachedTeamResult = teamData;
        console.log("✅ Loaded team stats from pre-cached game");
      } else {
        throw new Error("No team stats data in pre-cached analysis");
      }
    } catch (err) {
      console.error("Error loading team stats from cache:", err);
      setError("Team stats unavailable for this cached game.");
    } finally {
      setIsLoading(false);
    }
  };

  // Main function to fetch team stats data
  const getTeamStats = async () => {
    if (teamResult) return;
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
        throw new Error(response.message || "Failed to fetch team stats");
      }

      const teamData: NBATeamStatsResult = response;

      setTeamResult(teamData);
      cachedTeamResult = teamData;
    } catch (err) {
      console.error("Error in getTeamStats:", err);
      setError(err instanceof Error ? err.message : "Failed to get team stats");
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
        from: "team-stats-nba",
        team1: params.team1,
        team2: params.team2,
        sport: params.sport,
        team1Logo: params.team1Logo,
        team2Logo: params.team2Logo,
        analysisId: params.analysisId,
        selectedTeam: selectedTeam || undefined,
      },
    });
  };


  // Render team stats
  const renderTeamStats = () => {
    if (!selectedTeam || !teamResult) return null;

    const teamData = selectedTeam === "team1" ? teamResult.teamStats.team1 : teamResult.teamStats.team2;
    const teamName = selectedTeam === "team1" ? params.team1 : params.team2;

    // Add null checks for stats
    if (!teamData || !teamData.stats) {
      return (
        <View style={styles.container}>
          <TopBar showBack={true} />
          <TeamSelectorHeader
            team1Name={params.team1 || ""}
            team2Name={params.team2 || ""}
            team1Logo={getNBATeamLogo(params.team1 || "")}
            team2Logo={getNBATeamLogo(params.team2 || "")}
            activeTeam={selectedTeam}
            onTeamChange={setSelectedTeam}
            sticky
          />
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
            <Card style={styles.topCard}>
              <View style={styles.teamHeader}>
                <Text style={styles.teamName}>{teamName}</Text>
                <Text style={styles.errorText}>{i18n.t("teamStatsUnavailable") || "Team statistics are currently unavailable"}</Text>
              </View>
            </Card>
          </ScrollView>
        </View>
      );
    }

    const stats = teamData.stats;
    const calculated = stats?.calculated || {};

    // Calculate win rate from recent form
    const recentForm = calculated.recentForm || "0-0";
    const [wins, losses] = recentForm.split('-').map((n: string) => parseInt(n) || 0);
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

    // Parse momentum
    const momentum = parseMomentumFromForm(calculated.recentForm, calculated.momentum);

  return (
      <View style={styles.container}>
        <TopBar showBack={true} />

        {/* Sticky Team Selector Header */}
        <TeamSelectorHeader
          team1Name={params.team1 || ""}
          team2Name={params.team2 || ""}
          team1Logo={getNBATeamLogo(params.team1 || "")}
          team2Logo={getNBATeamLogo(params.team2 || "")}
          activeTeam={selectedTeam}
          onTeamChange={setSelectedTeam}
          sticky
        />

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>

        {/* Stats Row - Recent Form and Momentum */}
        <Animated.View style={[styles.statsRow, getCardStyle(0)]}>
          {/* Recent Form Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsNBARecentForm")}</Text>
              <Text style={styles.statValue}>{recentForm}</Text>
              <Text style={styles.statDescription}>{winRate}% {i18n.t("teamStatsWinRate")}</Text>
              <GradientProgressBar value={winRate} maxValue={100} />
            </View>
          </Card>

          {/* Momentum Card */}
          <Card style={styles.statCard}>
            <View style={styles.momentumContent}>
              <Text style={styles.momentumLabel}>{i18n.t("teamStatsMomentum")}</Text>
              <GaugeProgressBar
                value={momentum.value}
                maxValue={momentum.maxValue}
                primaryText={momentum.primaryText}
                secondaryText={momentum.secondaryText}
              />
            </View>
          </Card>
        </Animated.View>

        {/* Core KPIs Card */}
        <Animated.View style={getCardStyle(1)}>
          <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("teamStatsNBACoreKPIs")}</Text>
              <Pressable onPress={() => navigateToInfo("coreKPIs")}>
                <Text style={styles.coreKPIsInfo}>ⓘ</Text>
              </Pressable>
            </View>

            {/* First Row of KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="basketball-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.pointsPerGame?.toFixed(1) || stats?.points || "0.0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAPointsPerGame")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="locate-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.opponentPointsPerGame?.toFixed(1) || "0.0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAOpponentPPG")}</Text>
                </View>
              </View>
            </View>

            {/* Second Row of KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="disc-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats?.fgp || "0"}%</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAFieldGoalPercent")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="stats-chart-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats?.tpp || "0"}%</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBA3PointsPercent")}</Text>
                </View>
              </View>
            </View>

            {/* Third Row of KPIs */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="resize-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.reboundsPerGame || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAReboundsPerGame")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="swap-horizontal-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.assistsPerGame || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAAssistsPerGame")}</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>
        </Animated.View>

        {/* Stats Row - HOME AVG and AWAY AVG */}
        <Animated.View style={[styles.statsRow, getCardStyle(2)]}>
          {/* HOME AVG Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsNBAHomeAvg")}</Text>
              <Text style={styles.statValue}>{calculated.homeAverage?.toFixed(1) || "0.0"}</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsNBAPointsPerGame")}</Text>
              <GradientProgressBar value={parseFloat(calculated.homeAverage?.toFixed(1) || "0")} maxValue={140} />
            </View>
          </Card>

          {/* AWAY AVG Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsNBAAwayAvg")}</Text>
              <Text style={styles.statValue}>{calculated.awayAverage?.toFixed(1) || "0.0"}</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsNBAPointsPerGame")}</Text>
              <GradientProgressBar value={parseFloat(calculated.awayAverage?.toFixed(1) || "0")} maxValue={140} />
            </View>
          </Card>
        </Animated.View>

        {/* Stats Row - STEALS and BLOCKS */}
        <Animated.View style={[styles.statsRow, getCardStyle(3)]}>
          {/* STEALS Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsNBASteals")}</Text>
              <Text style={styles.statValue}>{calculated.stealsPerGame || stats?.steals || "0"}</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsNBAPerGame")}</Text>
            </View>
          </Card>

          {/* BLOCKS Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsNBABlocks")}</Text>
              <Text style={styles.statValue}>{calculated.blocksPerGame || stats?.blocks || "0"}</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsNBAPerGame")}</Text>
            </View>
          </Card>
        </Animated.View>

        {/* Advanced Metrics Card */}
        <Animated.View style={getCardStyle(4)}>
          <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("teamStatsNBAAdvancedMetrics")}</Text>
              <Pressable onPress={() => navigateToInfo("advancedMetrics")}>
                <Text style={styles.coreKPIsInfo}>ⓘ</Text>
              </Pressable>
            </View>

            {/* First Row of Advanced Metrics */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="repeat-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>
                    {calculated.turnoverDifferential ?
                      (calculated.turnoverDifferential > 0 ? "+" : "") + calculated.turnoverDifferential + " pg" :
                      "0 pg"}
                  </Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBATurnoverDiff")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats?.plusMinus || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAPlusMinus")}</Text>
                </View>
              </View>
            </View>

            {/* Second Row of Advanced Metrics */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="arrow-up-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.offRebPerGame || "0"} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAOffRebounds")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.defRebPerGame || "0"} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBADefRebounds")}</Text>
                </View>
              </View>
            </View>

            {/* Third Row of Advanced Metrics */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="flame-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats?.ftp || "0"}%</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAFreeThrowPercent")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Ionicons name="hand-left-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.foulsPerGame || "0"} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAPersonalFouls")}</Text>
                </View>
              </View>
            </View>
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
                shimmerColors={shimmerColors}
              />
              <ShimmerPlaceholder
                style={styles.selectionNameShimmer}
                shimmerColors={shimmerColors}
              />
              <ShimmerPlaceholder
                style={styles.chevronIconShimmer}
                shimmerColors={shimmerColors}
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

    return renderTeamStats();
  };

  return (
    <ScreenBackground hideBg>
      <Animated.View style={[styles.mainContainer, animatedStyle]}>
        {isLoading ? renderShimmer() : renderContent()}
      </Animated.View>

      {/* Floating Bottom Nav */}
      <FloatingBottomNav
        activeTab="teams"
        analysisData={{
          team1: params.team1 || teamResult?.teams?.home,
          team2: params.team2 || teamResult?.teams?.away,
          sport: params.sport || teamResult?.sport,
          team1Logo: params.team1Logo,
          team2Logo: params.team2Logo,
          analysisId: params.analysisId,
          isDemo: params.isDemo === "true",
          fromCache: params.fromCache === "true",
          cachedGameId: params.cachedGameId,
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
    paddingTop: 8,
    paddingBottom: 120, // Extra padding for FloatingBottomNav
  },
  shimmerContainer: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 8,
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
  teamHeader: {
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
  teamName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#FFFFFF",
  },
  teamLogo: {
    width: 58.11,
    height: 38.28,
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
  momentumContent: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 21.83,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  statLabel: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.6,
  },
  momentumLabel: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.6,
    alignSelf: "flex-start",
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
  momentumLabelShimmer: {
    height: 13,
    borderRadius: 5,
    width: "60%",
    alignSelf: "flex-start",
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
  gaugeShimmer: {
    height: 120,
    width: 120,
    borderRadius: 60,
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
