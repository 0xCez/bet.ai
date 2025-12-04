import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { GradientProgressBar } from "@/components/ui/GradientProgressBar";
import { GaugeProgressBar } from "@/components/ui/GaugeProgressBar";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { TopBar } from "@/components/ui/TopBar";
import { useLocalSearchParams, useRouter } from "expo-router";
import APIService from "@/services/api";
import i18n from "@/i18n";
import { usePageTransition } from "@/hooks/usePageTransition";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { auth, db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getNFLTeamLogo } from "@/utils/teamLogos";
import { usePageTracking } from "@/hooks/usePageTracking";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Cached variables to persist data between navigation
let cachedTeamResult: TeamStatsResult | null = null;
let cachedParams: any = null;

// Interface matching the backend team stats structure
interface TeamStatsResult {
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
        team: string;
        season: string;
        offense: {
          passing: {
            yardsPerGame: number;
            totalYards: number;
            touchdowns: number;
            completions: number;
            attempts: number;
            completionPct: number;
            interceptions: number;
            sacks: number;
            sackedYards: number;
          };
          rushing: {
            yardsPerGame: number;
            totalYards: number;
            touchdowns: number;
            attempts: number;
            yardsPerRush: number;
            fumbles: number;
            fumblesLost: number;
          };
          efficiency: {
            thirdDownPct: number;
            fourthDownPct: number;
            totalFirstDowns: number;
            penaltyYards: number;
            penalties: number;
          };
        };
        defense: {
          passing: {
            yardsAllowedPerGame: number;
            touchdownsAllowed: number;
            interceptions: number;
            sacks: number;
          };
          rushing: {
            yardsAllowedPerGame: number;
            touchdownsAllowed: number;
            fumblesRecovered: number;
          };
        };
        specialTeams: {
          fieldGoals: {
            made: number;
            attempts: number;
            percentage: string;
          };
        };
        calculated: {
          totalYardsPerGame: number;
          turnoverDifferential: number;
          pointsPerGame: number;
          opponentPointsPerGame: number;
          homeAverage: number;
          awayAverage: number;
          recentForm: string;
          momentum: string;
        };
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
}

type TeamStatsParams = {
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
};

// Helper function to calculate recent form from string
const parseRecentForm = (recentForm: string) => {
  const [wins, losses] = recentForm.split('-').map(Number);
  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  return { record: recentForm, winRate };
};

// Helper function to parse momentum string
const parseMomentum = (momentum: string) => {
  // momentum is like "4L" or "2W"
  const streakCount = parseInt(momentum.slice(0, -1)) || 0;
  const streakType = momentum.slice(-1);
  const streakText = streakType === "W" ?
    `${streakCount}-game win streak` :
    `${streakCount}-game loss streak`;

  // For losses, show 0 momentum (no positive momentum)
  // For wins, show the streak count
  const gaugeValue = streakType === "W" ? streakCount : 0;

  return { value: gaugeValue, maxValue: 5, primaryText: momentum, secondaryText: streakText };
};

export default function TeamStatsNFLNew() {
  const params = useLocalSearchParams<TeamStatsParams>();
  const router = useRouter();
  const { animatedStyle } = usePageTransition(false);
  const { isSubscribed } = useRevenueCatPurchases();

  // Track page views and time spent
  usePageTracking({
    pageName: 'team_stats_nfl',
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

  // Initialize state, potentially from cache
  const [isLoading, setIsLoading] = useState(!isSameAnalysis || !cachedTeamResult);
  const [teamResult, setTeamResult] = useState<TeamStatsResult | null>(
    isSameAnalysis && cachedTeamResult ? cachedTeamResult : null
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<"team1" | "team2" | null>(
    (params.selectedTeam as "team1" | "team2") || null
  );

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

    // If analysisId exists (history/demo), load from Firestore instead of API
    if (params.analysisId) {
      loadTeamStatsFromFirestore();
      return;
    }

    if (params.team1 && params.team2 && params.sport) {
      console.log(`Team Stats Flow: Starting analysis for ${params.sport}: ${params.team1} vs ${params.team2}`);
      getTeamStats();
    } else {
      console.error("Error: Missing required parameters (team1, team2, sport).");
      setError("Missing team data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, isSameAnalysis]);

  // Load team stats from Firestore (for history/demo mode)
  const loadTeamStatsFromFirestore = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const userId = params.analysisId?.includes("Demo") || params.analysisId === "OT8KyNVdriQgnRi7Q5b6" || params.analysisId === "WxmvWHRNBCrULv7uuKeV"
        ? "piWQIzwI9tNXrNTgb5dWTqAjUrj2"
        : auth.currentUser?.uid;

      if (!userId || !params.analysisId) {
        throw new Error("User ID or Analysis ID missing");
      }

      const { doc, getDoc } = await import("firebase/firestore");
      const { db } = await import("@/firebaseConfig");

      const docRef = doc(db, "userAnalyses", userId, "analyses", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Analysis not found in history");
      }

      const data = docSnap.data();
      const cachedAnalysis = data.analysis;

      if (cachedAnalysis?.teamStats) {
        const teamData: NFLTeamStatsResult = {
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

  // Main function to fetch team stats data
  const getTeamStats = async () => {
    if (teamResult) return;
    setIsLoading(true);
    setError(null);

    try {
      console.log("Fetching team stats data...");

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

      console.log("Team Stats Response:", response);

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.status === "error") {
        throw new Error(response.message || "Failed to fetch team stats");
      }

      const teamData: TeamStatsResult = response;

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
        from: "team-stats-nfl",
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

  // Render team selection screen
  const renderTeamSelection = () => {
    const teams = [
      { name: params.team1 || "", key: "team1" as "team1" | "team2" },
      { name: params.team2 || "", key: "team2" as "team1" | "team2" },
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
            <LinearGradient
              colors={["#0D0D0D", "#161616"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.selectionGradient}
            >
              <Image
                source={getNFLTeamLogo(team.name)}
                style={styles.selectionLogo}
                contentFit="contain"
              />
              <Text style={styles.selectionName}>{team.name}</Text>
              <Image
                source={require("../assets/images/icons/chevron.svg")}
                style={styles.chevronIcon}
                contentFit="contain"
              />
            </LinearGradient>
          </Pressable>
        ))}
        </ScrollView>
      </View>
    );
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
          <TopBar showBack={true} onBackPress={() => setSelectedTeam(null)} />
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
    const calc = stats.calculated || {};

    // Parse recent form and momentum
    const recentForm = parseRecentForm(calc.recentForm);
    const momentum = parseMomentum(calc.momentum);

  return (
      <View style={styles.container}>
        <TopBar showBack={true} onBackPress={() => setSelectedTeam(null)} />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>

        {/* Top Card - Team Header */}
        <Card style={styles.topCard}>
          <View style={styles.teamHeader}>
            <View style={styles.nameLogoRow}>
              <Text style={styles.teamName}>{teamName}</Text>
              <Image
                source={getNFLTeamLogo(String(teamName))}
                style={styles.teamLogo}
                contentFit="contain"
              />
            </View>
          </View>
        </Card>

        {/* Stats Row - Recent Form and Momentum */}
        <View style={styles.statsRow}>
          {/* Recent Form Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsRecentForm")}</Text>
              <Text style={styles.statValue}>{recentForm.record}</Text>
              <Text style={styles.statDescription}>{recentForm.winRate}% {i18n.t("teamStatsWinRate")}</Text>
              <GradientProgressBar value={recentForm.winRate} maxValue={100} />
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
        </View>

        {/* Core KPIs Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("teamStatsCoreKPIs")}</Text>
              <Pressable onPress={() => navigateToInfo("coreKPIs")}>
                <Text style={styles.coreKPIsInfo}>ⓘ</Text>
              </Pressable>
            </View>

            {/* First Row of KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/meter.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calc.pointsPerGame.toFixed(1)}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsPointsPerGame")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/target.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calc.opponentPointsPerGame.toFixed(1)}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsOpponentPPG")}</Text>
                </View>
              </View>
            </View>

            {/* Second Row of KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/shield.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.offense.passing.yardsPerGame.toFixed(0)}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsPassingYards")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/bars.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calc.totalYardsPerGame.toFixed(0)}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsTotalYards")}</Text>
                </View>
              </View>
            </View>

            {/* Third Row of KPIs */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/steps.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.offense.rushing.yardsPerGame.toFixed(0)}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsRushingYards")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/double-sided-arrow.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>
                    {calc.turnoverDifferential > 0 ? "+" : ""}{calc.turnoverDifferential.toFixed(1)}
                  </Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsTurnoverDiff")}</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Stats Row - 3rd DOWN and 4th DOWN */}
        <View style={styles.statsRow}>
          {/* 3rd DOWN Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStats3rdDown")}</Text>
              <Text style={styles.statValue}>{stats.offense.efficiency.thirdDownPct.toFixed(2)}%</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsPerGame")}</Text>
              <GradientProgressBar value={stats.offense.efficiency.thirdDownPct} maxValue={100} />
            </View>
          </Card>

          {/* 4th DOWN Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStats4thDown")}</Text>
              <Text style={styles.statValue}>{stats.offense.efficiency.fourthDownPct.toFixed(2)}%</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsPerGame")}</Text>
              <GradientProgressBar value={stats.offense.efficiency.fourthDownPct} maxValue={100} />
            </View>
          </Card>
        </View>

        {/* Stats Row - HOME AVG and AWAY AVG */}
        <View style={styles.statsRow}>
          {/* HOME AVG Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsHomeAvg")}</Text>
              <Text style={styles.statValue}>{calc.homeAverage.toFixed(1)}</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsPointsPerGame")}</Text>
            </View>
          </Card>

          {/* AWAY AVG Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsAwayAvg")}</Text>
              <Text style={styles.statValue}>{calc.awayAverage.toFixed(1)}</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsPointsPerGame")}</Text>
            </View>
          </Card>
        </View>

        {/* Defensive Stats Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("teamStatsDefensiveStats")}</Text>
              <Pressable onPress={() => navigateToInfo("defensiveStats")}>
                <Text style={styles.coreKPIsInfo}>ⓘ</Text>
              </Pressable>
            </View>

            {/* First Row of Defensive Stats */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/shield.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.defense.passing.yardsAllowedPerGame.toFixed(0)} {i18n.t("teamStatsYards")}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsPassDef")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/steps.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.defense.rushing.yardsAllowedPerGame.toFixed(0)} {i18n.t("teamStatsYards")}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsRushDef")}</Text>
                </View>
              </View>
            </View>

            {/* Second Row of Defensive Stats */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/bolt.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.defense.passing.sacks}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSacks")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/interceptions.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.defense.passing.interceptions}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsInterceptions")}</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Advanced Metrics Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("teamStatsAdvancedMetrics")}</Text>
              <Pressable onPress={() => navigateToInfo("advancedMetrics")}>
                <Text style={styles.coreKPIsInfo}>ⓘ</Text>
              </Pressable>
            </View>

            {/* First Row of Advanced Metrics */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/torch.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.offense.passing.touchdowns} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsPassingTDs")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/steps.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.offense.rushing.touchdowns} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsRushingTDs")}</Text>
                </View>
              </View>
            </View>

            {/* Second Row of Advanced Metrics */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/flag.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{Math.round(stats.offense.efficiency.penaltyYards / 6)} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsPenaltyYards")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/geo-tag.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.offense.rushing.yardsPerRush.toFixed(1)} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsYardsPerRush")}</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>
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
          <Pressable key={index} style={styles.selectionItem}>
            <LinearGradient
              colors={["#0D0D0D", "#161616"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.selectionGradient}
            >
              <ShimmerPlaceholder
                style={styles.selectionLogoShimmer}
                shimmerColors={["#919191", "#767676", "#919191"]}
              />
              <ShimmerPlaceholder
                style={styles.selectionNameShimmer}
                shimmerColors={["#919191", "#767676", "#919191"]}
              />
              <ShimmerPlaceholder
                style={styles.chevronIconShimmer}
                shimmerColors={["#919191", "#767676", "#919191"]}
              />
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  // Main render
  return (
    <ScreenBackground hideBg>
      {isLoading ? (
        renderShimmer()
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        !selectedTeam ? renderTeamSelection() : renderTeamStats()
      )}

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
        }}
        isSubscribed={isSubscribed}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
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
  selectionTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 24,
    color: "#FFFFFF",
    marginBottom: 24,
    textAlign: "center",
  },
  selectionItem: {
    height: 85.87,
    borderRadius: 14,
    marginBottom: 16,
    overflow: "hidden",
  },
  selectionGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    gap: 12,
  },
  selectionLogo: {
    width: 58.11,
    height: 38.28,
  },
  selectionName: {
    flex: 1,
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#FFFFFF",
  },
  chevronIcon: {
    width: 24,
    height: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16,
    color: "#00C2E0",
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
    fontFamily: "Aeonik-Medium",
    fontSize: 16,
    color: "#FF6B6B",
    textAlign: "center",
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
    width: 45.11,
    height: 44.17,
    borderRadius: 12.62,
    backgroundColor: "#161616",
    justifyContent: "center",
    alignItems: "center",
  },
  kpiIcon: {
    width: 24,
    height: 24,
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
