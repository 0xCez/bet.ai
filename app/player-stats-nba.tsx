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
import { FloatingBottomNav } from "../components/ui/FloatingBottomNav";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { usePostHog } from "posthog-react-native";
import { usePageTransition } from "../hooks/usePageTransition";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

let cachedPlayerResult: any | null = null;
let cachedParams: any = null;

export default function NBAPlayerStatsScreen() {
  const params = useLocalSearchParams();
  const { isSubscribed } = useRevenueCatPurchases();
  const posthog = usePostHog();
  const { animatedStyle } = usePageTransition(false);

  const isSameAnalysis =
    cachedParams?.team1 === params.team1 &&
    cachedParams?.team2 === params.team2 &&
    cachedParams?.sport === params.sport;

  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const hasInitializedRef = React.useRef(false);
  const [isLoading, setIsLoading] = useState(!isSameAnalysis || !cachedPlayerResult);
  const [playerResult, setPlayerResult] = useState<any | null>(
    isSameAnalysis && cachedPlayerResult ? cachedPlayerResult : null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    if (isSameAnalysis && cachedPlayerResult) {
      setIsLoading(false);
      return;
    }

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

  const getPlayerStats = async () => {
    if (playerResult) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await APIService.getMarketIntelligence(
        params.sport as string,
        params.team1 as string || "",
        params.team2 as string || ""
      );

      if (response.error || response.status === "error") {
        throw new Error(response.error || response.message);
      }

      setPlayerResult(response);
      cachedPlayerResult = response;
    } catch (err) {
      console.error("Error in getPlayerStats:", err);
      setError(err instanceof Error ? err.message : "Failed to get player stats");
    } finally {
      setIsLoading(false);
    }
  };

  const renderNBAPlayerCard = (player: any, teamName: string) => {
    if (!player) return null;

    const stats = player.stats || {};

    return (
      <View style={styles.playerSection}>
        {/* Player Header Card */}
        <View style={[styles.card, styles.headerCard]}>
          <View style={styles.headerContent}>
            <Text style={styles.playerName}>{player.name || "LeBron James"}</Text>
            <Image
              source={{ uri: `../assets/images/${teamName?.replace(/\s+/g, '_')}.svg` }}
              style={styles.teamLogo}
            />
          </View>
        </View>

        {/* Points & Rebounds Row */}
        <View style={styles.topStatsRow}>
          {/* Points Card */}
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.sectionLabel}>POINTS</Text>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>
                {stats.pointsAverage || "27.4"}
              </Text>
              <Text style={styles.statDescription}>Per game average</Text>
              <View style={styles.progressBarContainer}>
                <LinearGradient
                  colors={["#00ddff", "#0bff13"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressBar}
                />
                <View style={[styles.progressIndicator, { left: "75%" }]} />
              </View>
            </View>
          </View>

          {/* Rebounds Card */}
          <View style={[styles.card, styles.statCard]}>
            <Text style={styles.sectionLabel}>REBOUNDS</Text>
            <View style={styles.statContent}>
              <Text style={styles.statValue}>
                {stats.reboundsAverage || "8.8"}
              </Text>
              <Text style={styles.statDescription}>Per game average</Text>
              <View style={styles.progressBarContainer}>
                <LinearGradient
                  colors={["#00ddff", "#0bff13"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.progressBar}
                />
                <View style={[styles.progressIndicator, { left: "50%" }]} />
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

          {/* Row 1: Points, Rebounds */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>{stats.pointsAverage || "27.4"}</Text>
                <Text style={styles.kpiLabel}>Points/game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>{stats.reboundsAverage || "8.8"}</Text>
                <Text style={styles.kpiLabel}>Rebounds/game</Text>
              </View>
            </View>
          </View>

          {/* Row 2: Assists, Steals */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>{stats.assistsAverage || "8.5"}</Text>
                <Text style={styles.kpiLabel}>Assists/game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>{stats.stealsAverage || "1.2"}</Text>
                <Text style={styles.kpiLabel}>Steals/game</Text>
              </View>
            </View>
          </View>

          {/* Row 3: Blocks, Turnovers */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>{stats.blocksAverage || "0.6"}</Text>
                <Text style={styles.kpiLabel}>Blocks/game</Text>
              </View>
            </View>
            <View style={styles.kpiItem}>
              <View style={styles.kpiIcon} />
              <View style={styles.kpiContent}>
                <Text style={styles.kpiValue}>{stats.turnoversAverage || "3.8"}</Text>
                <Text style={styles.kpiLabel}>Turnovers/game</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Advanced Metrics Row */}
        <View style={styles.advancedRow}>
          {/* FG% Card */}
          <View style={[styles.card, styles.advancedCard]}>
            <Text style={styles.sectionLabel}>FG %</Text>
            <View style={styles.advancedContent}>
              <Text style={styles.advancedValue}>{stats.fgPercentage || "51.3"}%</Text>
              <Text style={styles.advancedLabel}>Field Goal %</Text>
            </View>
          </View>

          {/* 3PT% Card */}
          <View style={[styles.card, styles.advancedCard]}>
            <Text style={styles.sectionLabel}>3PT %</Text>
            <View style={styles.advancedContent}>
              <Text style={styles.advancedValue}>{stats.threePtPercentage || "34.5"}%</Text>
              <Text style={styles.advancedLabel}>Three-Point %</Text>
            </View>
          </View>
        </View>

        <View style={styles.advancedRow}>
          {/* FT% Card */}
          <View style={[styles.card, styles.advancedCard]}>
            <Text style={styles.sectionLabel}>FT %</Text>
            <View style={styles.advancedContent}>
              <Text style={styles.advancedValue}>{stats.ftPercentage || "73.1"}%</Text>
              <Text style={styles.advancedLabel}>Free Throw %</Text>
            </View>
          </View>

          {/* Usage% Card */}
          <View style={[styles.card, styles.advancedCard]}>
            <Text style={styles.sectionLabel}>USAGE %</Text>
            <View style={styles.advancedContent}>
              <Text style={styles.advancedValue}>{stats.usagePercentage || "32.1"}%</Text>
              <Text style={styles.advancedLabel}>Team Usage</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderPlayerContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    const team1TopPlayers = playerResult?.playerStats?.team1?.topPlayers || [];
    const team2TopPlayers = playerResult?.playerStats?.team2?.topPlayers || [];

    return (
      <ScrollView showsVerticalScrollIndicator={false} style={styles.analysisContent}>
        {/* Team 1 Players */}
        {team1TopPlayers.map((player: any, index: number) => (
          <View key={`team1-${index}`}>
            {renderNBAPlayerCard(player, params.team1 as string || "")}
          </View>
        ))}

        {/* Team 2 Players */}
        {team2TopPlayers.map((player: any, index: number) => (
          <View key={`team2-${index}`}>
            {renderNBAPlayerCard(player, params.team2 as string || "")}
          </View>
        ))}

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <BorderButton
            onPress={() => router.back()}
            containerStyle={styles.floatingButton}
            borderColor="#00C2E0"
            backgroundColor="#00C2E020"
            opacity={1}
            borderWidth={1}
          >
            <Text style={styles.buttonText}>Back to Analysis</Text>
          </BorderButton>

          <GradientButton onPress={getPlayerStats} style={{ marginTop: 16 }}>
            <Text style={styles.buttonText}>Refresh Stats 🏀</Text>
          </GradientButton>
        </View>
      </ScrollView>
    );
  };

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
            {isLoading ? <View style={styles.shimmerContainer}><Text style={styles.errorText}>Loading...</Text></View> : renderPlayerContent()}
          </View>
        </Animated.ScrollView>

        <FloatingBottomNav
          activeTab="players"
          analysisData={{
            team1: params.team1 as string,
            team2: params.team2 as string,
            sport: params.sport as string,
            team1Logo: params.team1Logo as string,
            team2Logo: params.team2Logo as string,
            analysisId: params.analysisId as string,
          }}
        />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingBottom: 0 },
  scrollView: { flex: 1, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 120 },
  analysisContainer: { paddingTop: 20, flex: 1 },
  shimmerContainer: { width: "100%" },
  analysisContent: { flex: 1, paddingBottom: 40 },
  errorContainer: { padding: 20 },
  errorText: { color: "#424242", fontSize: 16, textAlign: "center", fontFamily: "Aeonik-Regular" },
  playerSection: { marginBottom: 30 },
  card: { backgroundColor: "rgba(18, 18, 18, 0.95)", borderRadius: 40, borderWidth: 1, borderColor: "#212121", padding: 20, marginBottom: 15 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  cardTitle: { color: "#FFFFFF", fontSize: 16, fontFamily: "Aeonik-Medium" },
  infoIcon: { fontSize: 18, color: "#ffffff" },
  headerCard: { backgroundColor: "#0c0c0c", height: 80, justifyContent: "center", borderRadius: 40 },
  headerContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 30 },
  playerName: { color: "#ffffff", fontSize: 18, fontFamily: "Aeonik-Medium", flex: 1, textAlign: "left" },
  teamLogo: { width: 45, height: 45, borderRadius: 22 },
  topStatsRow: { flexDirection: "row", gap: 12, marginBottom: 15 },
  statCard: { flex: 1, height: 160, padding: 15 },
  sectionLabel: { color: "#ffffff", fontSize: 12, fontFamily: "Aeonik-Medium", opacity: 0.6, marginBottom: 15 },
  statContent: { flex: 1, justifyContent: "space-between" },
  statValue: { color: "#ffffff", fontSize: 24, fontFamily: "Aeonik-Medium" },
  statDescription: { color: "#ffffff", fontSize: 12, fontFamily: "Aeonik-Light", marginBottom: 8 },
  progressBarContainer: { height: 12, borderRadius: 100, position: "relative", overflow: "hidden", backgroundColor: "#333333" },
  progressBar: { flex: 1, height: "100%" },
  progressIndicator: { position: "absolute", top: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: "#ffffff" },
  coreKpisCard: { minHeight: 200, padding: 15 },
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  kpiItem: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(22, 22, 22, 0.95)", borderRadius: 12, padding: 12, minHeight: 60 },
  kpiIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: "#161616", marginRight: 10 },
  kpiContent: { flex: 1 },
  kpiValue: { color: "#ffffff", fontSize: 16, fontFamily: "Aeonik-Medium", marginBottom: 2 },
  kpiLabel: { color: "#ffffff", fontSize: 10, fontFamily: "Aeonik-Light", opacity: 0.8 },
  advancedRow: { flexDirection: "row", gap: 12, marginBottom: 15 },
  advancedCard: { flex: 1, height: 140, padding: 15 },
  advancedContent: { flex: 1, justifyContent: "center" },
  advancedValue: { color: "#ffffff", fontSize: 24, fontFamily: "Aeonik-Medium", marginBottom: 6 },
  advancedLabel: { color: "#ffffff", fontSize: 12, fontFamily: "Aeonik-Light" },
  actionContainer: { marginBottom: 40 },
  buttonText: { fontSize: 18, color: "#FFFFFF", fontFamily: "Aeonik-Medium" },
  floatingButton: { shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5, padding: 10 },
});
