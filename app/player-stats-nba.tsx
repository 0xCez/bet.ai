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
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { TopBar } from "@/components/ui/TopBar";
import APIService from "@/services/api";
import { usePageTransition } from "@/hooks/usePageTransition";
import i18n from "@/i18n";
import { auth } from "@/firebaseConfig";
import { getNBATeamLogo } from "@/utils/teamLogos";
import { LOGO_SIZES } from "@/utils/logoConstants";
import { useRouter } from "expo-router";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist player data between screen navigation
let cachedPlayerResult: NBAPlayerStatsResult | null = null;
let cachedParams: any = null;

// Interface matching the backend NBA player stats structure
interface NBAPlayerStatsResult {
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

type NBAPlayerStatsParams = {
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
};


export default function PlayerStatsNBANew() {
  const params = useLocalSearchParams<NBAPlayerStatsParams>();
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
  const [isLoading, setIsLoading] = useState(
    !isSameAnalysis || !cachedPlayerResult
  );
  const [playerResult, setPlayerResult] = useState<NBAPlayerStatsResult | null>(
    isSameAnalysis && cachedPlayerResult ? cachedPlayerResult : null
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(params.selectedTeam || null);
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(
    params.selectedPlayer ? JSON.parse(params.selectedPlayer) : null
  );

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
      getPlayerStats();
    } else {
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

      const playerData: NBAPlayerStatsResult = response;

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
        from: "player-stats-nba",
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
            <LinearGradient
              colors={["#0D0D0D", "#161616"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.selectionGradient}
            >
              <Image
                source={getNBATeamLogo(String(teamName || ""))}
                style={styles.selectionLogo}
                contentFit="contain"
              />
              <Text style={styles.selectionName}>{player.name}</Text>
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
        <Card style={styles.topCard}>
          <View style={styles.playerHeader}>
            <View style={styles.nameLogoRow}>
              <Text style={styles.playerName}>{player.name}</Text>
              <Image
                source={getNBATeamLogo(String(player.teamName || ""))}
                style={styles.teamLogo}
                contentFit="contain"
              />
            </View>
          </View>
        </Card>

        {/* Core KPIs Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>{i18n.t("playerStatsNBACoreKPIs")}</Text>
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
                  <Text style={styles.kpiValue}>{stats.pointsAverage || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsNBAPointsPerGame")}</Text>
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
                  <Text style={styles.kpiValue}>{stats.reboundsAverage || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsNBAReboundsPG")}</Text>
                </View>
            </View>
          </View>

          {/* Second Row of KPIs */}
            <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Image
                    source={require("../assets/images/icons/interceptions.svg")}
                  style={styles.kpiIcon}
                  contentFit="contain"
                />
              </View>
              <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.stealsAverage || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsNBAStealsPG")}</Text>
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
                  <Text style={styles.kpiValue}>{stats.assistsAverage || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsNBAAssistsPG")}</Text>
                </View>
              </View>
            </View>

            {/* Third Row of KPIs */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/shield.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>{stats.blocksAverage || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsNBABlocksPG")}</Text>
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
                  <Text style={styles.kpiValue}>{stats.turnoversAverage || "0"}</Text>
                  <Text style={styles.kpiLabel}>{i18n.t("playerStatsNBATurnovers")}</Text>
                </View>
            </View>
          </View>
          </View>
        </Card>

        {/* Stats Row - Field Goal and 3PTs Shooting */}
        <View style={styles.statsRow}>
          {/* Field Goal Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("playerStatsNBAFieldGoal")}</Text>
              <Text style={styles.statValue}>{stats.fgPercentage || "0"}%</Text>
              <Text style={styles.statDescription}>{i18n.t("playerStatsNBAScored")}</Text>
              <GradientProgressBar value={parseFloat(stats.fgPercentage || "0")} maxValue={100} />
            </View>
          </Card>

          {/* 3PTs Shooting Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("playerStatsNBA3PTsShooting")}</Text>
              <Text style={styles.statValue}>{stats.threePtPercentage || "0"}%</Text>
              <Text style={styles.statDescription}>{i18n.t("playerStatsNBAShot")}</Text>
              <GradientProgressBar value={parseFloat(stats.threePtPercentage || "0")} maxValue={100} />
            </View>
          </Card>
        </View>

        {/* Stats Row - Free-Throw and Team Possession */}
        <View style={styles.statsRow}>
          {/* Free-Throw Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("playerStatsNBAFreeThrow")}</Text>
              <Text style={styles.statValue}>{stats.ftPercentage || "0"}%</Text>
              <Text style={styles.statDescription}>{i18n.t("playerStatsNBAShot")}</Text>
              <GradientProgressBar value={parseFloat(stats.ftPercentage || "0")} maxValue={100} />
            </View>
          </Card>

          {/* Team Possession Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>{i18n.t("playerStatsNBATeamPossession")}</Text>
              <Text style={styles.statValue}>{stats.usagePercentage || "0"}%</Text>
              <Text style={styles.statDescription}>{i18n.t("playerStatsNBABallUsage")}</Text>
              <GradientProgressBar value={parseFloat(stats.usagePercentage || "0")} maxValue={100} />
            </View>
          </Card>
        </View>
        </ScrollView>
      </View>
    );
  };

  // Shimmer rendering
  const renderShimmer = () => (
    <View style={styles.container}>
      <TopBar showBack={false} />
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
    width: LOGO_SIZES.MEDIUM,
    height: LOGO_SIZES.MEDIUM,
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
    width: LOGO_SIZES.MEDIUM,
    height: LOGO_SIZES.MEDIUM,
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
    width: LOGO_SIZES.MEDIUM,
    height: LOGO_SIZES.MEDIUM,
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

