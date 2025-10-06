import React, { useState, useEffect } from "react";
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  Text,
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

// Static variables to persist team data between screen navigation
let cachedTeamResult: SoccerTeamStatsResult | null = null;
let cachedParams: any = null;

// Track page view time
let pageEntryTime: number | null = null;

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
};

export default function SoccerTeamStatsScreen() {
  const params = useLocalSearchParams<SoccerTeamStatsParams>();
  const { isSubscribed } = useRevenueCatPurchases();
  const posthog = usePostHog();
  const { animatedStyle } = usePageTransition(false);

  // Track page view time
  useEffect(() => {
    if (!auth.currentUser) return;

    pageEntryTime = Date.now();

    posthog?.capture("soccer_team_stats_page_viewed", {
      userId: (auth.currentUser as any)?.uid,
      sport: params.sport,
      teams: `${params.team1} vs ${params.team2}`,
    });

    return () => {
      if (pageEntryTime && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTime;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture("soccer_team_stats_page_exit", {
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
    !isSameAnalysis || !cachedTeamResult
  );
  const [teamResult, setTeamResult] = useState<SoccerTeamStatsResult | null>(
    isSameAnalysis && cachedTeamResult ? cachedTeamResult : null
  );
  const [error, setError] = useState<string | null>(null);

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
      console.log(
        `Soccer Team Stats Flow: Starting analysis for ${params.sport}: ${params.team1} vs ${params.team2}`
      );
      getTeamStats();
    } else {
      console.error("Error: Missing required parameters (team1, team2, sport).");
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
      console.log("Fetching soccer team stats data...");

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

      console.log("Soccer Team Stats Response:", response);

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.status === "error") {
        throw new Error(response.message || "Failed to fetch soccer team stats");
      }

      const teamData: SoccerTeamStatsResult = response;

      setTeamResult(teamData);
      cachedTeamResult = teamData;

    } catch (err) {
      console.error("Error in getTeamStats:", err);
      setError(
        err instanceof Error ? err.message : "Failed to get soccer team stats"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to render individual team stats
  const renderSoccerTeamStats = (teamStats: any, teamName: string, teamKey: string) => {
    if (!teamStats) return null;

    const stats = teamStats.stats;

    // Calculate win percentage
    const winRate = stats?.fixtures?.played?.total > 0 ?
      Math.round((stats.fixtures.wins.total / stats.fixtures.played.total) * 100) : 0;

    // Parse form pattern (WLLWD)
    const formPattern = stats?.form || "NNNNN";
    const momentum = formPattern.length > 0 ? formPattern : "None";

    return (
      <View key={teamKey}>
        {/* Recent Form & Momentum Row - SAME STRUCTURE AS NFL */}
        <View style={styles.formMomentumRow}>
          {/* Recent Form Card - Soccer: Season Record */}
          <View style={[styles.card, styles.formCard]}>
            <Text style={styles.sectionLabel}>SEASON RECORD</Text>
            <View style={styles.formContent}>
              <Text style={styles.recordText}>
                {stats?.fixtures?.wins?.total || 0}-{stats?.fixtures?.draws?.total || 0}-{stats?.fixtures?.loses?.total || 0}
              </Text>
              <Text style={styles.winRateText}>{winRate}% Win Rate</Text>
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
                  { left: `${winRate}%` }
                ]} />
              </View>
            </View>
          </View>

          {/* Momentum Card - Soccer: Form Pattern */}
          <View style={[styles.card, styles.momentumCard]}>
            <Text style={styles.sectionLabel}>MOMENTUM</Text>
            <View style={styles.momentumContent}>
              <View style={styles.momentumGauge}>
                <Text style={styles.momentumValue}>
                  {momentum === "NNNNN" ? "None" : momentum.slice(-1)}
                </Text>
                <Text style={styles.momentumDescription}>
                  {formPattern}
                </Text>
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

          {/* First Row - Goals Scored, Goals Against */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {parseFloat(stats?.goals?.for?.average?.total || 0).toFixed(1)} pg
                </Text>
                <Text style={styles.kpiLabel}>Goals Scored</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {parseFloat(stats?.goals?.against?.average?.total || 0).toFixed(1)} pg
                </Text>
                <Text style={styles.kpiLabel}>Goals Against</Text>
              </View>
            </View>
          </View>

          {/* Second Row - Home Record, Away Record */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.fixtures?.wins?.home || 0}-{stats?.fixtures?.draws?.home || 0}-{stats?.fixtures?.loses?.home || 0}
                </Text>
                <Text style={styles.kpiLabel}>Home Record</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.fixtures?.wins?.away || 0}-{stats?.fixtures?.draws?.away || 0}-{stats?.fixtures?.loses?.away || 0}
                </Text>
                <Text style={styles.kpiLabel}>Away Record</Text>
              </View>
            </View>
          </View>

          {/* Third Row - Home Goals, Away Goals */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {parseFloat(stats?.goals?.for?.average?.home || 0).toFixed(1)} pg
                </Text>
                <Text style={styles.kpiLabel}>Home Goals</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {parseFloat(stats?.goals?.for?.average?.away || 0).toFixed(1)} pg
                </Text>
                <Text style={styles.kpiLabel}>Away Goals</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Efficiency Row - SAME STRUCTURE AS NFL 3rd/4th Down */}
        <View style={styles.efficiencyRow}>
          {/* Clean Sheets Card - Soccer equivalent of 3rd Down */}
          <View style={[styles.card, styles.efficiencyCard]}>
            <Text style={styles.sectionLabel}>CLEAN SHEETS</Text>
            <View style={styles.efficiencyContent}>
              <Text style={styles.percentageValue}>
                {stats?.fixtures?.played?.total > 0 ?
                  Math.round((stats.clean_sheet.total / stats.fixtures.played.total) * 100) : 0}%
              </Text>
              <Text style={styles.perGameText}>
                {stats?.clean_sheet?.total || 0} out of {stats?.fixtures?.played?.total || 0} games
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
                  { left: `${stats?.fixtures?.played?.total > 0 ?
                    Math.round((stats.clean_sheet.total / stats.fixtures.played.total) * 100) : 0}%` }
                ]} />
              </View>
            </View>
          </View>

          {/* Failed to Score Card - Soccer equivalent of 4th Down */}
          <View style={[styles.card, styles.efficiencyCard]}>
            <Text style={styles.sectionLabel}>FAILED TO SCORE</Text>
            <View style={styles.efficiencyContent}>
              <Text style={styles.percentageValue}>
                {stats?.fixtures?.played?.total > 0 ?
                  Math.round((stats.failed_to_score.total / stats.fixtures.played.total) * 100) : 0}%
              </Text>
              <Text style={styles.perGameText}>
                {stats?.failed_to_score?.total || 0} out of {stats?.fixtures?.played?.total || 0}
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
                  { left: `${stats?.fixtures?.played?.total > 0 ?
                    Math.round((stats.failed_to_score.total / stats.fixtures.played.total) * 100) : 0}%` }
                ]} />
              </View>
            </View>
          </View>
        </View>

        {/* Home/Away Averages Row - SAME STRUCTURE AS NFL */}
        <View style={styles.homeAwayRow}>
          {/* Home Goals Card */}
          <View style={[styles.card, styles.homeAwayCard]}>
            <Text style={styles.sectionLabel}>HOME GOALS</Text>
            <View style={styles.homeAwayContent}>
              <Text style={styles.averageValue}>
                {parseFloat(stats?.goals?.for?.average?.home || 0).toFixed(1)}
              </Text>
              <Text style={styles.averageLabel}>Goals per Game</Text>
            </View>
          </View>

          {/* Away Goals Card */}
          <View style={[styles.card, styles.homeAwayCard]}>
            <Text style={styles.sectionLabel}>AWAY GOALS</Text>
            <View style={styles.homeAwayContent}>
              <Text style={styles.averageValue}>
                {parseFloat(stats?.goals?.for?.average?.away || 0).toFixed(1)}
              </Text>
              <Text style={styles.averageLabel}>Goals per Game</Text>
            </View>
          </View>
        </View>

        {/* Performance Stats Card - SAME STRUCTURE AS NFL Defensive Stats */}
        <View style={[styles.card, styles.performanceStatsCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Performance Stats ⚽</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>

          {/* Performance Row - Clean Sheets, Failed to Score */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.fixtures?.played?.total > 0 ?
                    Math.round((stats.clean_sheet.total / stats.fixtures.played.total) * 100) : 0}%
                </Text>
                <Text style={styles.kpiLabel}>Clean Sheets</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.fixtures?.played?.total > 0 ?
                    Math.round((stats.failed_to_score.total / stats.fixtures.played.total) * 100) : 0}%
                </Text>
                <Text style={styles.kpiLabel}>Failed to Score</Text>
              </View>
            </View>
          </View>

          {/* Performance Row - Goal Timing, Formation */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>31-45'</Text>
                <Text style={styles.kpiLabel}>Peak Scoring</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.lineups?.[0]?.formation || "4-1-4-1"}
                </Text>
                <Text style={styles.kpiLabel}>Most Used Formation</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Advanced Metrics Card - SAME STRUCTURE AS NFL Advanced Metrics */}
        <View style={[styles.card, styles.advancedMetricsCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Advanced Metrics 🚀</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>

          {/* Advanced Row - Biggest Win, Biggest Loss */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.biggest?.wins?.away || "0-4 away"}
                </Text>
                <Text style={styles.kpiLabel}>Biggest Win</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.biggest?.loses?.home || "0-2 home"}
                </Text>
                <Text style={styles.kpiLabel}>Biggest Loss</Text>
              </View>
            </View>
          </View>

          {/* Advanced Row - Disciplinary, Goal Difference */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.cards?.yellow?.total || 0} - {stats?.cards?.red?.total || 0}
                </Text>
                <Text style={styles.kpiLabel}>Disciplinary (Y-R)</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.goals?.for?.average?.total && stats?.goals?.against?.average?.total ?
                    `${stats.goals.for.average.total - stats.goals.against.average.total > 0 ? '+' : ''}${(stats.goals.for.average.total - stats.goals.against.average.total).toFixed(1)}` :
                    "+0.0"}
                </Text>
                <Text style={styles.kpiLabel}>Goal Difference</Text>
              </View>
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

  // Main content rendering
  const renderTeamContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.analysisContent}
      >
        {/* Team 1 Header Card */}
        <View style={[styles.card, styles.headerCard]}>
          <View style={styles.headerContent}>
            <Text style={styles.teamName}>{params.team1 || "Manchester City"}</Text>
            <Image
              source={{ uri: `../assets/images/${params.team1?.replace(/\s+/g, '_')}.svg` }}
              style={styles.teamLogo}
            />
          </View>
        </View>

        {/* Team 1 Stats */}
        {renderSoccerTeamStats(teamResult?.teamStats?.team1, params.team1, "team1")}

        {/* Team 2 Header Card */}
        <View style={[styles.card, styles.headerCard]}>
          <View style={styles.headerContent}>
            <Text style={styles.teamName}>{params.team2 || "Arsenal"}</Text>
            <Image
              source={{ uri: `../assets/images/${params.team2?.replace(/\s+/g, '_')}.svg` }}
              style={styles.teamLogo}
            />
          </View>
        </View>

        {/* Team 2 Stats */}
        {renderSoccerTeamStats(teamResult?.teamStats?.team2, params.team2, "team2")}

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
            onPress={getTeamStats}
            style={{ marginTop: 16 }}
          >
            <Text style={styles.buttonText}>Refresh Stats ⚽</Text>
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
            {isLoading ? renderShimmer() : renderTeamContent()}
          </View>
        </Animated.ScrollView>

        {/* Floating Bottom Navigation */}
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
      </View>
    </ScreenBackground>
  );
}

// Styles - EXACTLY matching Soccer Figma dimensions
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

  // Header Card Styles
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
  teamName: {
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

  // Form & Momentum Row
  formMomentumRow: {
    flexDirection: "row",
    gap: 15,
    marginBottom: 15,
  },
  formCard: {
    flex: 1,
    height: 160,
    padding: 15,
  },
  momentumCard: {
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
  formContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  recordText: {
    color: "#ffffff",
    fontSize: 24,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
  },
  winRateText: {
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
  momentumContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  momentumGauge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: "#00c2e0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 194, 224, 0.1)",
  },
  momentumValue: {
    color: "#ffffff",
    fontSize: 18,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginBottom: 2,
  },
  momentumDescription: {
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    textAlign: "center",
  },

  // Core KPIs Card Styles
  coreKpisCard: {
    minHeight: 300,
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

  // Efficiency Row Styles - SAME AS NFL 3rd/4th Down
  efficiencyRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 15,
  },
  efficiencyCard: {
    flex: 1,
    height: 160,
    padding: 15,
  },
  efficiencyContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  percentageValue: {
    color: "#ffffff",
    fontSize: 24,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
  },
  perGameText: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    marginBottom: 8,
  },

  // Home/Away Row Styles - SAME AS NFL
  homeAwayRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 15,
  },
  homeAwayCard: {
    flex: 1,
    height: 140,
    padding: 15,
  },
  homeAwayContent: {
    flex: 1,
    justifyContent: "center",
  },
  averageValue: {
    color: "#ffffff",
    fontSize: 24,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginBottom: 6,
  },
  averageLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
  },

  // Performance Stats Card Styles - SAME AS NFL Defensive Stats
  performanceStatsCard: {
    minHeight: 280,
    padding: 15,
  },

  // Advanced Metrics Card Styles - SAME AS NFL
  advancedMetricsCard: {
    minHeight: 280,
    padding: 15,
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
