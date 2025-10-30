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
import i18n from "@/i18n";
import { auth } from "@/firebaseConfig";
import { getNBATeamLogo } from "@/utils/teamLogos";
import { useRouter } from "expo-router";

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

    if (params.team1 && params.team2 && params.sport) {
      getTeamStats();
    } else {
      setError("Missing team data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, auth.currentUser, isSameAnalysis]);

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

  // Render team selection screen
  const renderTeamSelection = () => {
    const teams = [
      { name: params.team1 || "", key: "team1" as "team1" | "team2" },
      { name: params.team2 || "", key: "team2" as "team1" | "team2" },
    ];

    return (
      <View style={styles.container}>
        <TopBar showBack={false} />
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
                source={getNBATeamLogo(team.name)}
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
    const calculated = stats?.calculated || {};

    // Calculate win rate from recent form
    const recentForm = calculated.recentForm || "0-0";
    const [wins, losses] = recentForm.split('-').map((n: string) => parseInt(n) || 0);
    const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

    // Parse momentum
    const momentum = parseMomentumFromForm(calculated.recentForm, calculated.momentum);

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
                source={getNBATeamLogo(String(teamName))}
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
        </View>

        {/* Core KPIs Card */}
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
                  <Image
                    source={require("../assets/images/icons/meter.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.pointsPerGame?.toFixed(1) || stats?.points || "0.0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAPointsPerGame")}</Text>
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
                  <Text style={styles.kpiValue}>{calculated.opponentPointsPerGame?.toFixed(1) || "0.0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAOpponentPPG")}</Text>
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
                  <Text style={styles.kpiValue}>{stats?.fgp || "0"}%</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAFieldGoalPercent")}</Text>
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
                  <Text style={styles.kpiValue}>{stats?.tpp || "0"}%</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBA3PointsPercent")}</Text>
                </View>
              </View>
            </View>

            {/* Third Row of KPIs */}
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
                  <Text style={styles.kpiValue}>{calculated.reboundsPerGame || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAReboundsPerGame")}</Text>
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
                  <Text style={styles.kpiValue}>{calculated.assistsPerGame || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAAssistsPerGame")}</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Stats Row - HOME AVG and AWAY AVG */}
        <View style={styles.statsRow}>
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
        </View>

        {/* Stats Row - STEALS and BLOCKS */}
        <View style={styles.statsRow}>
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
        </View>

        {/* Advanced Metrics Card */}
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
                  <Image
                    source={require("../assets/images/icons/shield.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
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
                  <Image
                    source={require("../assets/images/icons/plus-minus.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
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
                  <Image
                    source={require("../assets/images/icons/bolt.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.offRebPerGame || "0"} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAOffRebounds")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/shield.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
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
                  <Image
                    source={require("../assets/images/icons/flame.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats?.ftp || "0"}%</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAFreeThrowPercent")}</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/card.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{calculated.foulsPerGame || "0"} pg</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("teamStatsNBAPersonalFouls")}</Text>
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
      {[1, 2, 3, 4].map((_, index) => (
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
    <ScreenBackground>
      <Animated.View style={[styles.mainContainer, animatedStyle]}>
        {isLoading ? renderShimmer() : renderContent()}
      </Animated.View>

      {/* Floating Bottom Nav */}
      <FloatingBottomNav
        activeTab="teams"
        analysisData={{
          team1: params.team1,
          team2: params.team2,
          sport: params.sport,
          team1Logo: params.team1Logo,
          team2Logo: params.team2Logo,
          analysisId: params.analysisId,
        }}
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
});

