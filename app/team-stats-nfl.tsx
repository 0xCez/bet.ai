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

// Static variables to persist team data between screen navigation
let cachedTeamResult: TeamStatsResult | null = null;
let cachedParams: any = null;

// Track page view time
let pageEntryTime: number | null = null;

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
  teamIds: { team1Id: number; team2Id: number };
}

type TeamStatsParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1_code?: string;
  team2_code?: string;
  team1Logo?: string;
  team2Logo?: string;
  selectedTeam?: "team1" | "team2";
  analysisId?: string;
};

// Helper function to get team logo - PROPER SVG HANDLING WITH react-native-svg
function getTeamLogo(teamName?: string): string {
  if (!teamName) return "logo"; // Return identifier, not require()

  // Systematic mapping of team names to SVG file identifiers
  const teamLogoMap: { [key: string]: string } = {
    // NFL Teams - Map to SVG file names (without extension)
    'Philadelphia Eagles': 'Philadelphia_Eagles',
    'New York Giants': 'New_York_Giants',
    'Dallas Cowboys': 'Dallas_Cowboys',
    'Washington Commanders': 'Washington_Redskins',
    'Washington Redskins': 'Washington_Redskins',
    'Chicago Bears': 'Chicago_Bears',
    'Detroit Lions': 'Detroit_lions',
    'Minnesota Vikings': 'Minnesota_Vikings',
    'Carolina Panthers': 'Carolina_Panthers',
    'New Orleans Saints': 'New_Orleans_Saints',
    'Houston Texans': 'Houston_Texans',
    'Denver Broncos': 'Denver_Broncos',
    'San Francisco 49ers': 'San_Francisco_49ers',
    'San Diego Chargers': 'San_Diego_Chargers',
    'Los Angeles Chargers': 'San_Diego_Chargers',
    'New England Patriots': 'New_England_Patriots',

    // Add partial name matching for flexibility
    'Eagles': 'Philadelphia_Eagles',
    'Giants': 'New_York_Giants',
    'Cowboys': 'Dallas_Cowboys',
    'Bears': 'Chicago_Bears',
    'Lions': 'Detroit_lions',
    'Vikings': 'Minnesota_Vikings',
    'Panthers': 'Carolina_Panthers',
    'Saints': 'New_Orleans_Saints',
    'Texans': 'Houston_Texans',
    'Broncos': 'Denver_Broncos',
    '49ers': 'San_Francisco_49ers',
    'Chargers': 'San_Diego_Chargers',
    'Patriots': 'New_England_Patriots',
  };

  // Try exact match first
  if (teamLogoMap[teamName]) {
    return teamLogoMap[teamName];
  }

  // Try partial match (last word of team name)
  const teamNickname = teamName.split(' ').pop();
  if (teamNickname && teamLogoMap[teamNickname]) {
    return teamLogoMap[teamNickname];
  }

  // Fallback identifier
  return "logo";
}

// Helper function to get actual team logo source for Image component
function getTeamLogoSource(teamName?: string) {
  const logoId = getTeamLogo(teamName);

  // If we have a team logo, try to use it as PNG (converted from SVG)
  if (logoId !== "logo") {
    // For now, fallback to logo.png until we have PNG versions
    // TODO: Convert SVG files to PNG or implement proper SVG rendering
    return require("../assets/images/logo.png");
  }

  return require("../assets/images/logo.png");
}

// Helper function to calculate recent form from last 10 games
function calculateRecentForm(last10Games: any[]): { record: string; winRate: number; streak: string } {
  if (!last10Games || last10Games.length === 0) {
    return { record: "0-0", winRate: 0, streak: "No data" };
  }

  // Take last 5 games for recent form
  const recentGames = last10Games.slice(0, 5);
  let wins = 0;
  let currentStreak = 0;
  let streakType = "";

  // Calculate wins and current streak
  recentGames.forEach((game, index) => {
    // This would need to be implemented based on actual game data structure
    const isWin = Math.random() > 0.5; // Placeholder logic
    if (isWin) wins++;

    // Calculate streak from most recent games
    if (index === 0) {
      streakType = isWin ? "W" : "L";
      currentStreak = 1;
    } else if ((isWin && streakType === "W") || (!isWin && streakType === "L")) {
      currentStreak++;
    }
  });

  const losses = recentGames.length - wins;
  const winRate = Math.round((wins / recentGames.length) * 100);

  return {
    record: `${wins}-${losses}`,
    winRate,
    streak: `${currentStreak}${streakType}`
  };
}

// Helper function to calculate home/away averages
function calculateHomeAwayAverages(last10Games: any[], teamId: number): { home: number; away: number } {
  if (!last10Games || last10Games.length === 0) {
    return { home: 0, away: 0 };
  }

  // This would need actual game data to determine home/away and scores
  // Placeholder calculation
  return {
    home: 29.4, // Average points at home
    away: 23.8  // Average points away
  };
}

export default function TeamStatsScreen() {
  const params = useLocalSearchParams<TeamStatsParams>();
  const { isSubscribed } = useRevenueCatPurchases();
  const posthog = usePostHog();
  const { animatedStyle } = usePageTransition(false);

  // Track page view time
  useEffect(() => {
    if (!auth.currentUser) return;

    pageEntryTime = Date.now();

    posthog?.capture("team_stats_page_viewed", {
      userId: (auth.currentUser as any)?.uid,
      sport: params.sport,
      team: params.selectedTeam === "team1" ? params.team1 : params.team2,
    });

    return () => {
      if (pageEntryTime && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTime;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture("team_stats_page_exit", {
          userId: (auth.currentUser as any)?.uid,
          sport: params.sport,
          team: params.selectedTeam === "team1" ? params.team1 : params.team2,
          timeSpentSeconds: timeSpentSeconds,
        });

        pageEntryTime = null;
      }
    };
  }, [params.team1, params.team2, params.sport, params.selectedTeam]);

  // Check if we're navigating with the same params
  const isSameAnalysis =
    cachedParams?.team1 === params.team1 &&
    cachedParams?.team2 === params.team2 &&
    cachedParams?.sport === params.sport &&
    cachedParams?.selectedTeam === params.selectedTeam;

  // Cache params for future comparison
  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const selectedTeamName = params.selectedTeam === "team1" ? params.team1 : params.team2;
  const selectedTeamLogo = params.selectedTeam === "team1" ? params.team1Logo : params.team2Logo;

  const hasInitializedRef = React.useRef(false);

  // Initialize state, potentially from cache
  const [isLoading, setIsLoading] = useState(
    !isSameAnalysis || !cachedTeamResult
  );
  const [teamResult, setTeamResult] = useState<TeamStatsResult | null>(
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
        `Team Stats Flow: Starting analysis for ${params.sport}: ${selectedTeamName}`
      );
      getTeamStats();
    } else {
      console.error("Error: Missing required parameters (team1, team2, sport).");
      setError("Missing team data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, params.selectedTeam, auth.currentUser, isSameAnalysis]);

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
      setError(
        err instanceof Error ? err.message : "Failed to get team stats"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to render individual team stats
  const renderTeamStats = (teamStats: any, teamName: string, teamKey: string) => {
    if (!teamStats) return null;

    const stats = teamStats.stats;
    const recentForm = {
      record: stats?.calculated?.recentForm || "0-0",
      winRate: stats?.calculated?.recentForm ?
        Math.round((parseInt(stats.calculated.recentForm.split('-')[0]) /
        (parseInt(stats.calculated.recentForm.split('-')[0]) + parseInt(stats.calculated.recentForm.split('-')[1]))) * 100) : 0,
      streak: stats?.calculated?.momentum || "No streak"
    };
    const homeAwayAvg = {
      home: stats?.calculated?.homeAverage || 0,
      away: stats?.calculated?.awayAverage || 0
    };

    return (
      <View key={teamKey}>
        {/* Recent Form & Momentum Row */}
        <View style={styles.formMomentumRow}>
          {/* Recent Form Card */}
          <View style={[styles.card, styles.formCard]}>
            <Text style={styles.sectionLabel}>RECENT FORM</Text>
            <View style={styles.formContent}>
              <Text style={styles.recordText}>{recentForm.record}</Text>
              <Text style={styles.winRateText}>{recentForm.winRate}% Win Rate</Text>
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
                  { left: `${recentForm.winRate}%` }
                ]} />
              </View>
            </View>
          </View>

          {/* Momentum Card */}
          <View style={[styles.card, styles.momentumCard]}>
            <Text style={styles.sectionLabel}>MOMENTUM</Text>
            <View style={styles.momentumContent}>
              <View style={styles.momentumGauge}>
                <Text style={styles.momentumValue}>{recentForm.streak}</Text>
                <Text style={styles.momentumDescription}>2-game win streak</Text>
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

          {/* First Row - PPG, Opponent PPG */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.calculated?.pointsPerGame?.toFixed(1) || "0.0"}
                </Text>
                <Text style={styles.kpiLabel}>Points-per-game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.calculated?.opponentPointsPerGame?.toFixed(1) || "0.0"}
                </Text>
                <Text style={styles.kpiLabel}>Opponent PPG</Text>
              </View>
            </View>
          </View>

          {/* Second Row - Passing Yards, Total Yards */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.offense?.passing?.yardsPerGame?.toFixed(0) || "207"}
                </Text>
                <Text style={styles.kpiLabel}>Passing Yards/Game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.calculated?.totalYardsPerGame?.toFixed(0) || "320"}
                </Text>
                <Text style={styles.kpiLabel}>Total Yards/Game</Text>
              </View>
            </View>
          </View>

          {/* Third Row - Rushing Yards, Turnover Differential */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.offense?.rushing?.yardsPerGame?.toFixed(0) || "108"}
                </Text>
                <Text style={styles.kpiLabel}>Rushing Yards/Game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.calculated?.turnoverDifferential > 0 ? "+" : ""}
                  {stats?.calculated?.turnoverDifferential?.toFixed(1) || "+1.5"}
                </Text>
                <Text style={styles.kpiLabel}>Turnover Differential</Text>
              </View>
            </View>
          </View>
        </View>

        {/* 3rd & 4th Down Efficiency Row */}
        <View style={styles.efficiencyRow}>
          {/* 3rd Down Card */}
          <View style={[styles.card, styles.efficiencyCard]}>
            <Text style={styles.sectionLabel}>3rd DOWN</Text>
            <View style={styles.efficiencyContent}>
              <Text style={styles.percentageValue}>
                {stats?.offense?.efficiency?.thirdDownPct?.toFixed(2) || "41.46"}%
              </Text>
              <Text style={styles.perGameText}>Per Game</Text>
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
                  { left: `${stats?.offense?.efficiency?.thirdDownPct || 41.46}%` }
                ]} />
              </View>
            </View>
          </View>

          {/* 4th Down Card */}
          <View style={[styles.card, styles.efficiencyCard]}>
            <Text style={styles.sectionLabel}>4th DOWN</Text>
            <View style={styles.efficiencyContent}>
              <Text style={styles.percentageValue}>
                {stats?.offense?.efficiency?.fourthDownPct?.toFixed(2) || "83.33"}%
              </Text>
              <Text style={styles.perGameText}>Per Game</Text>
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
                  { left: `${stats?.offense?.efficiency?.fourthDownPct || 83.33}%` }
                ]} />
              </View>
            </View>
          </View>
        </View>

        {/* Home/Away Averages Row */}
        <View style={styles.homeAwayRow}>
          {/* Home Average Card */}
          <View style={[styles.card, styles.homeAwayCard]}>
            <Text style={styles.sectionLabel}>HOME AVG</Text>
            <View style={styles.homeAwayContent}>
              <Text style={styles.averageValue}>{homeAwayAvg.home}</Text>
              <Text style={styles.averageLabel}>Points per Game</Text>
            </View>
          </View>

          {/* Away Average Card */}
          <View style={[styles.card, styles.homeAwayCard]}>
            <Text style={styles.sectionLabel}>AWAY AVG</Text>
            <View style={styles.homeAwayContent}>
              <Text style={styles.averageValue}>{homeAwayAvg.away}</Text>
              <Text style={styles.averageLabel}>Points per Game</Text>
            </View>
          </View>
        </View>

        {/* Defensive Stats Card */}
        <View style={[styles.card, styles.defensiveStatsCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Defensive Stats 🚀</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>

          {/* Defensive Row - Pass Defense, Rush Defense */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.defense?.passing?.yardsAllowedPerGame?.toFixed(0) || "183"} yards
                </Text>
                <Text style={styles.kpiLabel}>Pass Def/game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.defense?.rushing?.yardsAllowedPerGame?.toFixed(0) || "114"} yards
                </Text>
                <Text style={styles.kpiLabel}>Rush Def/game</Text>
              </View>
            </View>
          </View>

          {/* Defensive Row - Sacks, Interceptions */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.defense?.passing?.sacks || "7"}
                </Text>
                <Text style={styles.kpiLabel}>Sacks</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.defense?.passing?.interceptions || "2"}
                </Text>
                <Text style={styles.kpiLabel}>Interceptions</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Advanced Metrics Card */}
        <View style={[styles.card, styles.advancedMetricsCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Advanced Metrics 🚀</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>

          {/* Advanced Row - Passing TDs, Rushing TDs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.offense?.passing?.touchdowns || "3"} pg
                </Text>
                <Text style={styles.kpiLabel}>Passing TDs</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.offense?.rushing?.touchdowns || "3"} pg
                </Text>
                <Text style={styles.kpiLabel}>Rushing TDs</Text>
              </View>
            </View>
          </View>

          {/* Advanced Row - Penalty Yards, Yards per Rush */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {Math.round((stats?.offense?.efficiency?.penaltyYards || 201) / 3) || "67"} pg
                </Text>
                <Text style={styles.kpiLabel}>Penalty Yards</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>
                  {stats?.offense?.rushing?.yardsPerRush?.toFixed(1) || "4"} pg
                </Text>
                <Text style={styles.kpiLabel}>Yards per Rush</Text>
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
            <Text style={styles.teamName}>{params.team1 || "Philadelphia Eagles"}</Text>
            <Image
              source={{ uri: `../assets/images/${params.team1?.replace(/\s+/g, '_')}.svg` }}
              style={styles.teamLogo}
            />
          </View>
        </View>

        {/* Team 1 Stats */}
        {renderTeamStats(teamResult?.teamStats?.team1, params.team1, "team1")}

        {/* Team 2 Header Card */}
        <View style={[styles.card, styles.headerCard]}>
          <View style={styles.headerContent}>
            <Text style={styles.teamName}>{params.team2 || "Denver Broncos"}</Text>
            <Image
              source={{ uri: `../assets/images/${params.team2?.replace(/\s+/g, '_')}.svg` }}
              style={styles.teamLogo}
            />
          </View>
        </View>

        {/* Team 2 Stats */}
        {renderTeamStats(teamResult?.teamStats?.team2, params.team2, "team2")}



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
            <Text style={styles.buttonText}>Refresh Stats 📊</Text>
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
    fontSize: 16, // Smaller font to match Figma
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
    height: 80, // Smaller height
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
    fontSize: 18, // Much smaller font
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    flex: 1,
    textAlign: "left", // Left align like Figma
  },
  teamLogo: {
    width: 45, // Smaller logo
    height: 45,
    borderRadius: 22,
  },

  // Form & Momentum Row - Match Figma exactly
  formMomentumRow: {
    flexDirection: "row",
    gap: 15,
    marginBottom: 15,
  },
  formCard: {
    flex: 1,
    height: 160, // Smaller height to match Figma
    padding: 15, // Smaller padding
  },
  momentumCard: {
    flex: 1,
    height: 160, // Smaller height to match Figma
    padding: 15, // Smaller padding
  },
  sectionLabel: {
    color: "#ffffff",
    fontSize: 12, // Smaller font
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    opacity: 0.6,
    marginBottom: 15, // Less margin
  },
  formContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  recordText: {
    color: "#ffffff",
    fontSize: 24, // Smaller font
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
  },
  winRateText: {
    color: "#ffffff",
    fontSize: 12, // Smaller font
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    marginBottom: 8, // Less margin
  },
  progressBarContainer: {
    height: 12, // Smaller progress bar
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
    top: -2, // Adjust for smaller bar
    width: 16, // Smaller indicator
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
    width: 90, // Smaller gauge
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
    fontSize: 18, // Smaller font
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginBottom: 2,
  },
  momentumDescription: {
    color: "#ffffff",
    fontSize: 8, // Much smaller font
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    textAlign: "center",
  },

  // Core KPIs Card Styles - Match Figma exactly
  coreKpisCard: {
    minHeight: 300, // Smaller height
    padding: 15, // Smaller padding
  },
  kpiRow: {
    flexDirection: "row",
    gap: 12, // Smaller gap
    marginBottom: 12, // Less margin
  },
  kpiItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12, // Smaller radius
    padding: 12, // Smaller padding
    minHeight: 60, // Much smaller height
  },
  kpiIcon: {
    width: 35, // Much smaller icon
    height: 35,
    borderRadius: 12,
    backgroundColor: "#161616",
    marginRight: 10, // Less margin
  },
  kpiContent: {
    flex: 1,
  },
  kpiValue: {
    color: "#ffffff",
    fontSize: 16, // Smaller font
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginBottom: 2, // Less margin
  },
  kpiLabel: {
    color: "#ffffff",
    fontSize: 10, // Much smaller font
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    opacity: 0.8,
  },

  // Efficiency Row Styles - Match Figma exactly
  efficiencyRow: {
    flexDirection: "row",
    gap: 12, // Smaller gap
    marginBottom: 15,
  },
  efficiencyCard: {
    flex: 1,
    height: 160, // Smaller height
    padding: 15, // Smaller padding
  },
  efficiencyContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  percentageValue: {
    color: "#ffffff",
    fontSize: 24, // Smaller font
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
  },
  perGameText: {
    color: "#ffffff",
    fontSize: 12, // Smaller font
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
    marginBottom: 8, // Less margin
  },

  // Home/Away Row Styles - Match Figma exactly
  homeAwayRow: {
    flexDirection: "row",
    gap: 12, // Smaller gap
    marginBottom: 15,
  },
  homeAwayCard: {
    flex: 1,
    height: 140, // Smaller height
    padding: 15, // Smaller padding
  },
  homeAwayContent: {
    flex: 1,
    justifyContent: "center",
  },
  averageValue: {
    color: "#ffffff",
    fontSize: 24, // Smaller font
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginBottom: 6, // Less margin
  },
  averageLabel: {
    color: "#ffffff",
    fontSize: 12, // Smaller font
    fontFamily: "Aeonik-Light",
    fontWeight: "300",
  },

  // Defensive Stats Card Styles - Match Figma exactly
  defensiveStatsCard: {
    minHeight: 280, // Smaller height
    padding: 15, // Smaller padding
  },

  // Advanced Metrics Card Styles - Match Figma exactly
  advancedMetricsCard: {
    minHeight: 280, // Smaller height
    padding: 15, // Smaller padding
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
