import React, { useState, useEffect, useRef } from "react";
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
import { getSoccerTeamLogo } from "@/utils/teamLogos";
import { useRouter } from "expo-router";
import { usePageTracking } from "@/hooks/usePageTracking";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist team data between screen navigation
let cachedTeamResult: SoccerTeamStatsResult | null = null;
let cachedParams: any = null;

// Interface matching the backend soccer team stats structure
interface SoccerTeamStatsResult {
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
        fixtures: {
          played: { total: number; home: number; away: number };
          wins: { total: number; home: number; away: number };
          draws: { total: number; home: number; away: number };
          loses: { total: number; home: number; away: number };
        };
        goals: {
          for: {
            total: { total: number; home: number; away: number };
            average: { total: number; home: number; away: number };
          };
          against: {
            total: { total: number; home: number; away: number };
            average: { total: number; home: number; away: number };
          };
        };
        clean_sheet: { total: number; home: number; away: number };
        failed_to_score: { total: number; home: number; away: number };
        lineups: Array<{ formation: string; played: number }>;
        cards: { yellow: { total: number }; red: { total: number } };
        biggest: {
          wins: { home: string; away: string };
          loses: { home: string; away: string };
        };
        form: string;
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

type SoccerTeamStatsParams = {
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


// Helper function to parse momentum from form string
const parseMomentumFromForm = (form: string) => {
  if (!form || form === "NNNNN") return { value: 0, maxValue: 5, primaryText: "N/A", secondaryText: "No data" };

  // Count consecutive W or L from the end
  const lastChar = form.slice(-1);
  let count = 1;
  for (let i = form.length - 2; i >= 0; i--) {
    if (form[i] === lastChar) count++;
    else break;
  }

  const streakText = lastChar === "W" ?
    `${count}-game win streak` :
    lastChar === "L" ?
    `${count}-game loss streak` :
    "Mixed form";

  // For losses, show 0 momentum
  const gaugeValue = lastChar === "W" ? count : 0;

  return { value: gaugeValue, maxValue: 5, primaryText: `${count}${lastChar}`, secondaryText: streakText };
};

export default function TeamStatsSoccerNew() {
  const params = useLocalSearchParams<SoccerTeamStatsParams>();
  const router = useRouter();
  const { animatedStyle } = usePageTransition(false);
  const { isSubscribed } = useRevenueCatPurchases();

  // Track page views and time spent
  usePageTracking({
    pageName: 'team_stats_soccer',
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
  const [teamResult, setTeamResult] = useState<SoccerTeamStatsResult | null>(
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
      const userId = params.analysisId?.includes("Demo") || params.analysisId === "OT8KyNVdriQgnRi7Q5b6" || params.analysisId === "WxmvWHRNBCrULv7uuKeV"
        ? "piWQIzwI9tNXrNTgb5dWTqAjUrj2" // Demo user
        : auth.currentUser?.uid; // Regular user

      if (!userId || !params.analysisId) {
        throw new Error("User ID or Analysis ID missing");
      }

      const docRef = doc(db, "userAnalyses", userId, "analyses", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Analysis not found in history");
      }

      const data = docSnap.data();
      const cachedAnalysis = data.analysis;

      if (cachedAnalysis?.teamStats) {
        const teamData: SoccerTeamStatsResult = {
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

      const teamData: SoccerTeamStatsResult = response;

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
        from: "team-stats-soccer",
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
                source={getSoccerTeamLogo(team.name)}
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
    const stats = teamData.stats;

    // Calculate win percentage
    const winRate = stats?.fixtures?.played?.total > 0 ?
      Math.round((stats.fixtures.wins.total / stats.fixtures.played.total) * 100) : 0;

    // Parse momentum from form
    const momentum = parseMomentumFromForm(stats?.form || "");

    // Calculate clean sheet and failed to score percentages
    const cleanSheetPercent = stats?.fixtures?.played?.total > 0 ?
      Math.round((stats.clean_sheet.total / stats.fixtures.played.total) * 100) : 0;
    const failedToScorePercent = stats?.fixtures?.played?.total > 0 ?
      Math.round((stats.failed_to_score.total / stats.fixtures.played.total) * 100) : 0;

    // Get goal difference
    const goalDiff = stats?.goals?.for?.average?.total && stats?.goals?.against?.average?.total ?
      (stats.goals.for.average.total - stats.goals.against.average.total).toFixed(1) : "0.0";

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
                source={getSoccerTeamLogo(String(teamName))}
                style={styles.teamLogo}
                contentFit="contain"
              />
            </View>
          </View>
        </Card>

        {/* Stats Row - Recent Form and Momentum */}
        <View style={styles.statsRow}>
          {/* Season Record Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsSoccerSeasonRecord")}</Text>
              <Text style={styles.statValue}>
                {stats?.fixtures?.wins?.total || 0}-{stats?.fixtures?.draws?.total || 0}-{stats?.fixtures?.loses?.total || 0}
              </Text>
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
        </View>

        {/* Core KPIs Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("teamStatsSoccerCoreKPIs")}</Text>
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
                  <Text style={styles.kpiValue}>{parseFloat(stats?.goals?.for?.average?.total || 0).toFixed(1)} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerGoalsScored")}</Text>
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
                  <Text style={styles.kpiValue}>{parseFloat(stats?.goals?.against?.average?.total || 0).toFixed(1)} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerGoalsAgainst")}</Text>
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
                  <Text style={styles.kpiValue}>
                    {stats?.fixtures?.wins?.home || 0}-{stats?.fixtures?.draws?.home || 0}-{stats?.fixtures?.loses?.home || 0}
                  </Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerHomeRecord")}</Text>
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
                  <Text style={styles.kpiValue}>
                    {stats?.fixtures?.wins?.away || 0}-{stats?.fixtures?.draws?.away || 0}-{stats?.fixtures?.loses?.away || 0}
                  </Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerAwayRecord")}</Text>
                </View>
              </View>
            </View>

            {/* Third Row of KPIs */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/home.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{parseFloat(stats?.goals?.for?.average?.home || 0).toFixed(1)} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerHomeGoals")}</Text>
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
                  <Text style={styles.kpiValue}>{parseFloat(stats?.goals?.for?.average?.away || 0).toFixed(1)} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerAwayGoals")}</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Stats Row - Clean Sheets and Failed to Score */}
        <View style={styles.statsRow}>
          {/* Clean Sheets Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsSoccerCleanSheets")}</Text>
              <Text style={styles.statValue}>{cleanSheetPercent}%</Text>
              <Text style={styles.statDescription}>{stats?.clean_sheet?.total || 0} {i18n.t("teamStatsSoccerOutOf")} {stats?.fixtures?.played?.total || 0} {i18n.t("teamStatsSoccerGames")}</Text>
              <GradientProgressBar value={cleanSheetPercent} maxValue={100} />
            </View>
          </Card>

          {/* Failed to Score Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsSoccerFailedToScore")}</Text>
              <Text style={styles.statValue}>{failedToScorePercent}%</Text>
              <Text style={styles.statDescription}>{stats?.failed_to_score?.total || 0} {i18n.t("teamStatsSoccerOutOf")} {stats?.fixtures?.played?.total || 0}</Text>
              <GradientProgressBar value={failedToScorePercent} maxValue={100} />
            </View>
          </Card>
        </View>

        {/* Stats Row - Goal Timing and Most Used Form */}
        <View style={styles.statsRow}>
          {/* Goal Timing Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsSoccerGoalTiming")}</Text>
              <Text style={styles.statValue}>31-45'</Text>
              <Text style={styles.statDescription}>{i18n.t("teamStatsSoccerScoringWindow")}</Text>
              <GradientProgressBar value={75} maxValue={100} />
            </View>
          </Card>

          {/* Most Used Form Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("teamStatsSoccerMostUsedForm")}</Text>
              <Text style={styles.statValue}>{stats?.lineups?.[0]?.formation || "4-1-4-1"}</Text>
              <Text style={styles.statDescription}>{stats?.lineups?.[0]?.played || 60}% {i18n.t("teamStatsSoccerOfTheirGames")}</Text>
              <GradientProgressBar value={stats?.lineups?.[0]?.played || 60} maxValue={100} />
            </View>
          </Card>
        </View>

        {/* Advanced Metrics Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("teamStatsSoccerAdvancedMetrics")}</Text>
              <Pressable onPress={() => navigateToInfo("advancedMetrics")}>
                <Text style={styles.coreKPIsInfo}>ⓘ</Text>
              </Pressable>
            </View>

            {/* First Row of Advanced Metrics */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/cup.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats?.biggest?.wins?.away || "0-4 away"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerBiggestWin")}</Text>
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
                  <Text style={styles.kpiValue}>{stats?.biggest?.loses?.home || "0-2 home"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerBiggestLoss")}</Text>
                </View>
              </View>
            </View>

            {/* Second Row of Advanced Metrics */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/card.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats?.cards?.yellow?.total || 0}-{stats?.cards?.red?.total || 0}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerDisciplinary")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/flag.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{parseFloat(goalDiff) > 0 ? "+" : ""}{goalDiff} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsSoccerGoalDifference")}</Text>
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

  // Main render logic
  const renderContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (selectedTeam) {
      return renderTeamStats();
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
    tintColor: "#FFFFFF",
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
