import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { TopBar } from "@/components/ui/TopBar";
import { TeamSelectorHeader } from "@/components/ui/TeamSelectorHeader";
import { PlayerStatsCard } from "@/components/ui/PlayerStatsCard";
import APIService from "@/services/api";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { auth, db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getSoccerTeamLogo } from "@/utils/teamLogos";
import { usePageTracking } from "@/hooks/usePageTracking";
import { colors, spacing, borderRadius as radii, typography, shimmerColors } from "../constants/designTokens";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static cache
let cachedPlayerResult: PlayerStatsResult | null = null;
let cachedParams: any = null;

// Types
interface PlayerStatsResult {
  sport: string;
  teams: {
    home: string;
    away: string;
    logos: { home: string; away: string };
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

type PlayerStatsParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1_code?: string;
  team2_code?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
  isDemo?: string;
};

export default function PlayerStatsSoccer() {
  const params = useLocalSearchParams<PlayerStatsParams>();
  const { isSubscribed } = useRevenueCatPurchases();

  usePageTracking({
    pageName: 'player_stats_soccer',
    metadata: {
      team1: params.team1,
      team2: params.team2,
      sport: params.sport,
      analysisId: params.analysisId,
      isDemo: params.isDemo === 'true',
    },
  });

  // Check cache
  const isSameAnalysis =
    cachedParams?.team1 === params.team1 &&
    cachedParams?.team2 === params.team2 &&
    cachedParams?.sport === params.sport;

  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const hasInitializedRef = useRef(false);

  // State
  const [isLoading, setIsLoading] = useState(!isSameAnalysis || !cachedPlayerResult);
  const [playerResult, setPlayerResult] = useState<PlayerStatsResult | null>(
    isSameAnalysis && cachedPlayerResult ? cachedPlayerResult : null
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<"team1" | "team2">("team1");
  const [expandedCards, setExpandedCards] = useState<{ [key: string]: boolean }>({});

  // Animation - simple fade in for the content
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Toggle card expansion
  const toggleCard = (playerId: string) => {
    setExpandedCards(prev => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  // Fetch data
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    if (isSameAnalysis && cachedPlayerResult) {
      setIsLoading(false);
      animateIn();
      return;
    }

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
  }, [params.team1, params.team2, params.sport, isSameAnalysis]);

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

      const playerData: PlayerStatsResult = response;
      cachedPlayerResult = playerData;
      setPlayerResult(playerData);
      animateIn();
    } catch (err: any) {
      console.error("Error fetching player stats:", err);
      setError(err.message || "Failed to load player statistics");
    } finally {
      setIsLoading(false);
    }
  };

  // Load from Firestore for demo/history mode
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

      const collection = isDemo ? "demoAnalysis" : "userAnalyses";
      const docRef = doc(db, collection, userId, "analyses", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const cachedAnalysis = data.analysis;

        if (cachedAnalysis?.playerStats) {
          const playerData: PlayerStatsResult = {
            sport: data.sport || params.sport || "soccer",
            teams: cachedAnalysis.teams || { home: params.team1, away: params.team2, logos: {} },
            playerStats: cachedAnalysis.playerStats,
            timestamp: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            teamIds: cachedAnalysis.playerStats.team1?.teamId && cachedAnalysis.playerStats.team2?.teamId ?
              { team1Id: cachedAnalysis.playerStats.team1.teamId, team2Id: cachedAnalysis.playerStats.team2.teamId } :
              { team1Id: 0, team2Id: 0 },
          };
          cachedPlayerResult = playerData;
          setPlayerResult(playerData);
          animateIn();
        } else {
          throw new Error("No player stats found in analysis");
        }
      } else {
        throw new Error("Analysis not found");
      }
    } catch (err: any) {
      console.error("Error loading from Firestore:", err);
      setError(err.message || "Failed to load player statistics");
    } finally {
      setIsLoading(false);
    }
  };

  // Get players for selected team
  const getPlayers = () => {
    if (!playerResult) return [];
    const teamData = selectedTeam === "team1"
      ? playerResult.playerStats.team1
      : playerResult.playerStats.team2;
    return teamData?.topPlayers || [];
  };

  // Map API stats to component format
  const mapPlayerStats = (player: any) => {
    const stats = player.stats || {};
    // Detect if goalkeeper based on position
    const isGoalkeeper = player.position === "GK" || player.position === "Goalkeeper";

    return {
      name: player.name,
      position: isGoalkeeper ? "GK" : (player.position || "MF"),
      stats: {
        goals: stats.goals || 0,
        assists: stats.assists || 0,
        minutesPlayed: stats.minutesPlayed || stats.minutes || 0,
        shotsOnTarget: stats.shotsOnTarget || 0,
        passAccuracy: stats.passAccuracy || 0,
        tackles: stats.tackles || 0,
        interceptions: stats.interceptions || 0,
        cleanSheets: stats.cleanSheets || 0,
        saves: stats.saves || 0,
        yellowCards: stats.yellowCards || 0,
        redCards: stats.redCards || 0,
        // Additional stats from original page
        keyPasses: stats.keyPasses || 0,
        goalsPerGame: stats.goalsPerGame || 0,
        minutesPerGoal: stats.minutesPerGoal || 0,
        shotAccuracy: stats.shotAccuracy || 0,
      },
    };
  };

  // Render loading shimmer
  const renderShimmer = () => (
    <View style={styles.shimmerContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.shimmerCard}>
          <ShimmerPlaceholder
            style={styles.shimmerAvatar}
            shimmerColors={shimmerColors}
          />
          <View style={styles.shimmerContent}>
            <ShimmerPlaceholder
              style={styles.shimmerTitle}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.shimmerSubtitle}
              shimmerColors={shimmerColors}
            />
          </View>
        </View>
      ))}
    </View>
  );

  // Main content
  const players = getPlayers();

  return (
    <ScreenBackground hideBg>
      <TopBar showBack={true} />

      {/* Sticky Team Selector Header */}
      <TeamSelectorHeader
        team1Name={params.team1 || ""}
        team2Name={params.team2 || ""}
        team1Logo={getSoccerTeamLogo(params.team1 || "")}
        team2Logo={getSoccerTeamLogo(params.team2 || "")}
        activeTeam={selectedTeam}
        onTeamChange={(team) => {
          setSelectedTeam(team);
          setExpandedCards({}); // Reset expanded cards when switching teams
          animateIn(); // Animate cards when switching teams
        }}
        sticky
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Content */}
        {isLoading ? (
          renderShimmer()
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : players.length > 0 ? (
          <Animated.View style={{ opacity: fadeAnim }}>
            {players.map((player) => (
              <PlayerStatsCard
                key={player.id}
                player={mapPlayerStats(player)}
                sport="soccer"
                teamLogo={getSoccerTeamLogo(
                  selectedTeam === "team1" ? params.team1 || "" : params.team2 || ""
                )}
                isExpanded={expandedCards[player.id] || false}
                onToggle={() => toggleCard(player.id)}
              />
            ))}
          </Animated.View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No player stats available</Text>
          </View>
        )}

        {/* Bottom spacing for nav */}
        <View style={{ height: 120 }} />
      </ScrollView>

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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[4],
  },
  shimmerContainer: {
    gap: spacing[3],
  },
  shimmerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: spacing[4],
    borderRadius: radii.lg,
    gap: spacing[3],
  },
  shimmerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  shimmerContent: {
    flex: 1,
    gap: spacing[2],
  },
  shimmerTitle: {
    width: "60%",
    height: 16,
    borderRadius: radii.sm,
  },
  shimmerSubtitle: {
    width: "40%",
    height: 12,
    borderRadius: radii.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[8],
  },
  errorText: {
    color: colors.destructive,
    fontSize: typography.sizes.base,
    textAlign: "center",
    fontFamily: typography.fontFamily.regular,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[12],
  },
  emptyText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
});
