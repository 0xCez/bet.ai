import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { TopBar } from "../components/ui/TopBar";
import { FloatingBottomNav } from "../components/ui/FloatingBottomNav";
import { colors, spacing, borderRadius, typography, shadows } from "../constants/designTokens";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface MLProp {
  playerName: string;
  team: string;
  statType: string;
  line: number;
  prediction: string;
  probabilityOver?: number;
  probabilityUnder?: number;
  confidence: number;
  confidencePercent?: string;
  oddsOver?: number;
  oddsUnder?: number;
  gamesUsed?: number;
}

interface PropsParams {
  team1?: string;
  team2?: string;
  sport?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
  isDemo?: string;
  fromCache?: string;
  cachedGameId?: string;
  mlProps?: string; // JSON stringified ML props data
}

export default function PlayerPropsScreen() {
  const params = useLocalSearchParams<PropsParams>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mlProps, setMlProps] = useState<MLProp[]>([]);

  useEffect(() => {
    // Try to use pre-loaded props first
    if (params.mlProps) {
      try {
        const preloadedProps = JSON.parse(params.mlProps);
        setMlProps(preloadedProps);
        setLoading(false);
        console.log("[Props Page] ✅ Using pre-loaded ML props");
        return;
      } catch (e) {
        console.error("[Props Page] ❌ Failed to parse pre-loaded props:", e);
      }
    }

    // Fall back to API fetch
    fetchMLProps();
  }, [params.team1, params.team2, params.mlProps]);

  const fetchMLProps = async () => {
    try {
      setLoading(true);
      setError(null);

      const team1 = params.team1 || "";
      const team2 = params.team2 || "";

      const apiUrl = "https://us-central1-betai-f9176.cloudfunctions.net/getMLPlayerPropsV2";

      console.log("[Props Page] Fetching ML props for:", team1, "vs", team2);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          team1,
          team2,
          sport: "nba",
        }),
      });

      const data = await response.json();

      console.log("[Props Page] Response:", data);

      if (data.success && data.topProps) {
        setMlProps(data.topProps);
      } else {
        setError(data.message || "No props available for this game.");
      }
    } catch (err) {
      console.error("[Props Page] Error fetching ML props:", err);
      setError("Failed to load player props. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackNavigation = () => {
    router.back();
  };

  const renderPropCard = (prop: MLProp, index: number) => {
    const probability = prop.prediction === 'over'
      ? prop.probabilityOver
      : prop.probabilityUnder;

    const probabilityPercent = probability
      ? `${(probability * 100).toFixed(1)}%`
      : prop.confidencePercent || "N/A";

    // Use confidence tier from backend or calculate from confidence value
    const bettingValue = prop.confidenceTier || (
      typeof prop.confidence === 'number'
        ? (prop.confidence > 0.15 ? 'high' : prop.confidence >= 0.10 ? 'medium' : 'low')
        : parseFloat(prop.confidencePercent?.replace('%', '') || '0') / 100 > 0.15
        ? 'high'
        : parseFloat(prop.confidencePercent?.replace('%', '') || '0') / 100 >= 0.10
        ? 'medium'
        : 'low'
    );

    // Color-code by tier: Green (high), Orange (medium)
    const confidenceColor = bettingValue === 'high'
      ? colors.success // Green for high confidence
      : bettingValue === 'medium'
      ? '#FFB800' // Orange for medium confidence
      : colors.mutedForeground; // Gray for low (shouldn't appear)

    return (
      <Animated.View
        key={index}
        entering={FadeInUp.duration(400).delay(100 + index * 50)}
        style={styles.propCard}
      >
        <View style={styles.propHeader}>
          <View style={styles.propPlayerInfo}>
            <Text style={styles.propPlayerName}>{prop.playerName}</Text>
            <Text style={styles.propType}>
              {prop.statType.replace('_', ' ').toUpperCase()}
            </Text>
          </View>
          <View style={[styles.confidenceBadge, { borderColor: confidenceColor }]}>
            <Text style={[styles.confidenceText, { color: confidenceColor }]}>
              {bettingValue.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.propBody}>
          <View style={styles.propLine}>
            <Text style={styles.propLineLabel}>Line</Text>
            <Text style={styles.propLineValue}>{prop.line}</Text>
          </View>

          <View style={styles.propPrediction}>
            <View style={styles.predictionRow}>
              <Feather
                name={prop.prediction === 'over' ? 'trending-up' : 'trending-down'}
                size={20}
                color={colors.primary}
              />
              <Text style={styles.predictionText}>
                {prop.prediction.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.probabilityText}>{probabilityPercent}</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading player props...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <Feather name="alert-circle" size={48} color={colors.mutedForeground} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={fetchMLProps}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (mlProps.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Feather name="info" size={48} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>
            No high-confidence props available for this game.
          </Text>
          <Text style={styles.emptySubtext}>
            Our ML model requires 65%+ probability to recommend props.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ML PLAYER PROPS</Text>
          <Text style={styles.headerSubtitle}>
            {mlProps.length} AI-Powered Prediction{mlProps.length !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={styles.propsContainer}>
          {mlProps.map((prop, index) => renderPropCard(prop, index))}
        </View>
      </ScrollView>
    );
  };

  return (
    <ScreenBackground hideBg>
      <TopBar onBackPress={handleBackNavigation} />

      <View style={styles.container}>
        {renderContent()}

        <FloatingBottomNav
          activeTab="props"
          analysisData={{
            team1: params.team1,
            team2: params.team2,
            sport: params.sport,
            team1Logo: params.team1Logo,
            team2Logo: params.team2Logo,
            analysisId: params.analysisId,
            isDemo: params.isDemo === "true",
            fromCache: params.fromCache === "true",
            cachedGameId: params.cachedGameId,
          }}
        />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 0,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing[5],
  },
  scrollContent: {
    paddingTop: spacing[4],
    paddingBottom: 120,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing[5],
  },
  loadingText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    marginTop: spacing[4],
  },
  errorText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    textAlign: "center",
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
  },
  retryButtonText: {
    color: colors.primaryForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semibold,
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    textAlign: "center",
    marginTop: spacing[4],
  },
  emptySubtext: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    textAlign: "center",
    marginTop: spacing[2],
    opacity: 0.7,
  },
  header: {
    marginBottom: spacing[6],
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    marginBottom: spacing[2],
  },
  headerSubtitle: {
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
  propsContainer: {
    gap: spacing[4],
  },
  propCard: {
    backgroundColor: "rgba(25, 28, 35, 0.6)",
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(76, 175, 80, 0.15)",
  },
  propHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  propPlayerInfo: {
    flex: 1,
  },
  propPlayerName: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semibold,
    marginBottom: spacing[1],
  },
  propType: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  confidenceBadge: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  confidenceText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.5,
  },
  propBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  propLine: {
    flex: 1,
  },
  propLineLabel: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing[1],
  },
  propLineValue: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
  },
  propPrediction: {
    alignItems: "flex-end",
  },
  predictionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[1],
  },
  predictionText: {
    color: colors.primary,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.5,
  },
  probabilityText: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
  },
});
