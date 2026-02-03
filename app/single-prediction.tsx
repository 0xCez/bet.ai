import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Animated as RNAnimated,
  Easing as RNEasing,
  ActivityIndicator,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInUp,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseConfig";
import { colors, typography, spacing, borderRadius } from "../constants/designTokens";
import { getNBATeamLogo, getNFLTeamLogo, getSoccerTeamLogo } from "../utils/teamLogos";
import { GradientOrb } from "../components/ui/GradientOrb";
import { FloatingParticles } from "../components/ui/FloatingParticles";

// Format game time nicely
function formatGameTime(isoString?: string): string | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;

    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return `${dateStr} at ${timeStr}`;
  } catch {
    return null;
  }
}

export default function SinglePredictionScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    analysisData: string;
    imageUrl: string;
    imageUri: string;
    from?: string;
  }>();

  const rawApiResponse = params.analysisData
    ? JSON.parse(params.analysisData)
    : null;

  const analysisResult = rawApiResponse;

  // === STATE ===
  const [bulletPoints, setBulletPoints] = useState<string[]>([]);
  const [isLoadingReasons, setIsLoadingReasons] = useState(true);

  // === COUNT-UP ANIMATION ===
  const countAnim = useRef(new RNAnimated.Value(0)).current;
  const [displayedCount, setDisplayedCount] = useState(0);

  // === CTA SHIMMER ===
  const shimmerAnim = useRef(new RNAnimated.Value(0)).current;

  const getTeamLogo = (teamName: string, sport?: string) => {
    if (!sport) return require("../assets/images/logo.png");

    switch (sport.toLowerCase()) {
      case "nba":
        return getNBATeamLogo(teamName);
      case "nfl":
        return getNFLTeamLogo(teamName);
      case "soccer":
      case "soccer_epl":
        return getSoccerTeamLogo(teamName);
      default:
        return require("../assets/images/logo.png");
    }
  };

  const handleFullAnalysis = () => {
    router.replace({
      pathname: "/analysis",
      params: {
        analysisData: params.analysisData,
        imageUrl: params.imageUrl,
        skipApiCall: "true",
        from: params.from || "scan",
      },
    });
  };

  // === EXTRACT THE PREDICTION ===
  const marketConsensus =
    analysisResult?.keyInsights?.marketConsensus ||
    analysisResult?.keyInsightsNew?.marketConsensus;

  const teamSide = marketConsensus?.teamSide;
  const marketDisplay = marketConsensus?.display || "";

  const confidenceMatch = marketDisplay.match(/(\d+)%/);
  const confidenceNumber = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 72;

  const homeTeam = analysisResult?.teams?.home || "Home";
  const awayTeam = analysisResult?.teams?.away || "Away";
  const favoredTeam = teamSide === "home" ? homeTeam : teamSide === "away" ? awayTeam : homeTeam;
  const opponentTeam = teamSide === "home" ? awayTeam : teamSide === "away" ? homeTeam : awayTeam;

  // === FALLBACK "WHY THEY WIN" REASONS (used if LLM fails) ===
  const buildFallbackReasons = (): string[] => {
    const reasons: string[] = [];
    const isFavoredHome = teamSide === "home";

    // 1. MOMENTUM - Recent form is compelling (e.g., "On a 5-game win streak")
    const momentum = isFavoredHome
      ? analysisResult?.matchSnapshot?.momentum?.home
      : analysisResult?.matchSnapshot?.momentum?.away;
    if (momentum && momentum.length > 5 && momentum.toLowerCase() !== "n/a") {
      reasons.push(momentum);
    }

    // 2. X-FACTOR - Injury/travel/weather edge (most impactful)
    if (analysisResult?.xFactors?.length > 0) {
      const xFactor = analysisResult.xFactors[0];
      if (xFactor?.detail && xFactor.detail.length > 10) {
        const detail = xFactor.detail.length > 70
          ? xFactor.detail.substring(0, 67) + "..."
          : xFactor.detail;
        reasons.push(detail);
      }
    }

    // 3. OFFENSIVE/DEFENSIVE EDGE - Stats advantage
    const offensiveEdge = analysisResult?.keyInsights?.offensiveEdge;
    const defensiveEdge = analysisResult?.keyInsights?.defensiveEdge;
    if (offensiveEdge?.label && reasons.length < 3) {
      reasons.push(offensiveEdge.label);
    } else if (defensiveEdge?.label && reasons.length < 3) {
      reasons.push(defensiveEdge.label);
    }

    // 4. BEST VALUE - Market inefficiency
    const bestValue = analysisResult?.keyInsights?.bestValue || analysisResult?.keyInsightsNew?.bestValue;
    if (bestValue?.label && reasons.length < 3) {
      reasons.push(bestValue.label);
    }

    // 5. AI SIGNAL as fallback
    const bettingSignal = analysisResult?.aiAnalysis?.bettingSignal;
    if (bettingSignal && reasons.length < 2 && bettingSignal !== "Market Conflicted") {
      reasons.push(`AI Signal: ${bettingSignal}`);
    }

    // Fallback if nothing good found
    if (reasons.length === 0) {
      reasons.push("Statistical models favor this outcome");
      reasons.push("Market trends align with prediction");
    }

    return reasons.slice(0, 3); // Max 3 reasons
  };

  // Get game time from analysis data
  const gameTime = formatGameTime(analysisResult?.gameStartTime);

  // === FETCH AI-GENERATED WIN REASONS ===
  useEffect(() => {
    const fetchWinReasons = async () => {
      try {
        setIsLoadingReasons(true);

        console.log("Calling generateWinReasons with:", {
          favoredTeam,
          opponentTeam,
          confidence: confidenceNumber,
          hasAnalysisData: !!analysisResult,
        });

        // Send only the data we need to avoid payload size issues
        const compactAnalysisData = {
          xFactors: analysisResult?.xFactors || [],
          keyInsights: analysisResult?.keyInsights || {},
          keyInsightsNew: analysisResult?.keyInsightsNew || {},
          matchSnapshot: analysisResult?.matchSnapshot || {},
          sport: analysisResult?.sport,
        };

        const generateWinReasons = httpsCallable(functions, "generateWinReasons");
        const result = await generateWinReasons({
          favoredTeam,
          opponentTeam,
          confidence: confidenceNumber,
          analysisData: compactAnalysisData,
        });

        const data = result.data as { success: boolean; reasons: string[] };

        if (data.success && data.reasons?.length === 3) {
          setBulletPoints(data.reasons);
        } else {
          // Fallback to old logic if LLM didn't return 3 reasons
          setBulletPoints(buildFallbackReasons());
        }
      } catch (error) {
        console.error("Error fetching AI reasons:", error);
        // Fallback to old logic on error
        setBulletPoints(buildFallbackReasons());
      } finally {
        setIsLoadingReasons(false);
      }
    };

    fetchWinReasons();
  }, []);

  // === ANIMATIONS ===
  useEffect(() => {
    // Count-up animation for confidence number
    countAnim.setValue(0);
    RNAnimated.timing(countAnim, {
      toValue: confidenceNumber,
      duration: 2600,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: false,
    }).start();

    // Listen to animated value changes
    const listenerId = countAnim.addListener(({ value }) => {
      setDisplayedCount(Math.round(value));
    });

    // CTA shimmer - continuous sweep
    const runShimmer = () => {
      shimmerAnim.setValue(0);
      RNAnimated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2000,
        easing: RNEasing.inOut(RNEasing.ease),
        useNativeDriver: true,
      }).start(() => {
        setTimeout(runShimmer, 1500); // Pause between sweeps
      });
    };
    setTimeout(runShimmer, 800); // Initial delay

    return () => {
      countAnim.removeListener(listenerId);
    };
  }, [confidenceNumber]);

  // Shimmer interpolation
  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 400],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background Effects - Bigger orb for more presence */}
      <FloatingParticles verticalPosition={0.38} count={12} spread={180} />
      <GradientOrb verticalPosition={0.38} size={380} opacity={0.55} />

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          {/* Small header */}
          <Animated.Text
            entering={FadeIn.duration(400)}
            style={styles.headerLabel}
          >
            AI PREDICTION
          </Animated.Text>

          {/* Team Logo */}
          <Animated.View
            entering={FadeInUp.duration(500).delay(100)}
            style={styles.logoWrapper}
          >
            <Image
              source={getTeamLogo(favoredTeam, analysisResult?.sport)}
              style={styles.teamLogo}
              contentFit="contain"
            />
          </Animated.View>

          {/* Team Name */}
          <Animated.Text
            entering={FadeInUp.duration(500).delay(150)}
            style={styles.teamName}
          >
            {favoredTeam}
          </Animated.Text>

          {/* Confidence Score - Animated count-up */}
          <Animated.View
            entering={FadeInUp.duration(500).delay(200)}
            style={styles.confidenceWrapper}
          >
            <Text style={styles.confidenceText}>{displayedCount}%</Text>
          </Animated.View>

          {/* Chance to win */}
          <Animated.Text
            entering={FadeIn.duration(400).delay(250)}
            style={styles.chanceLabel}
          >
            chance to win
          </Animated.Text>

          {/* VS Opponent pill */}
          <Animated.View
            entering={FadeIn.duration(400).delay(300)}
            style={styles.opponentPill}
          >
            <Text style={styles.vsText}>vs</Text>
            <Image
              source={getTeamLogo(opponentTeam, analysisResult?.sport)}
              style={styles.opponentLogo}
              contentFit="contain"
            />
            <Text style={styles.opponentName}>{opponentTeam}</Text>
          </Animated.View>

          {/* Game Time */}
          {gameTime && (
            <Animated.View
              entering={FadeIn.duration(400).delay(350)}
              style={styles.gameTimeWrapper}
            >
              <Feather name="clock" size={12} color={colors.mutedForeground} />
              <Text style={styles.gameTimeText}>{gameTime}</Text>
            </Animated.View>
          )}
        </View>

        {/* Why They Win Card */}
        <Animated.View
          entering={FadeInUp.duration(500).delay(350)}
          style={styles.factorsCard}
        >
          <Text style={styles.factorsTitle}>WHY {favoredTeam.toUpperCase()} WINS</Text>
          {isLoadingReasons ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Analyzing matchup...</Text>
            </View>
          ) : (
            bulletPoints.map((point, index) => (
              <View
                key={index}
                style={[
                  styles.factorRow,
                  index === bulletPoints.length - 1 && styles.factorRowLast
                ]}
              >
                <Feather name="zap" size={16} color={colors.primary} />
                <Text style={styles.factorText}>{point}</Text>
              </View>
            ))
          )}
        </Animated.View>

        {/* CTA Section */}
        <Animated.View
          entering={FadeInUp.duration(500).delay(400)}
          style={styles.ctaSection}
        >
          <Pressable
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && styles.ctaPressed,
            ]}
            onPress={handleFullAnalysis}
          >
            <LinearGradient
              colors={[colors.primary, "#00B8B8"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>See Full Analysis</Text>
              <Feather name="arrow-right" size={20} color={colors.background} />

              {/* Shimmer overlay */}
              <RNAnimated.View
                style={[
                  styles.shimmer,
                  { transform: [{ translateX: shimmerTranslate }] },
                ]}
              />
            </LinearGradient>
          </Pressable>
          <Text style={styles.ctaSubtext}>
            Deep dive into stats, matchups & betting edges
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing[5],
    zIndex: 2,
  },

  // Hero Section
  heroSection: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingBottom: spacing[2],
  },
  headerLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xs,
    color: colors.mutedForeground,
    letterSpacing: 2,
    marginBottom: spacing[5],
  },
  logoWrapper: {
    marginBottom: spacing[3],
  },
  teamLogo: {
    width: 120,
    height: 120,
  },
  teamName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.sizes["2xl"],
    color: colors.foreground,
    textAlign: "center",
    marginBottom: spacing[1],
  },
  confidenceWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  confidenceText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 76,
    color: colors.foreground,
    includeFontPadding: false,
    textShadowColor: "rgba(0, 215, 215, 0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  chanceLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: -spacing[1],
    marginBottom: spacing[4],
  },
  opponentPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.muted,
    gap: spacing[2],
  },
  vsText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
  },
  opponentLogo: {
    width: 22,
    height: 22,
  },
  opponentName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.foreground,
  },

  // Factors Card - glass effect
  factorsCard: {
    backgroundColor: "rgba(30, 35, 45, 0.9)",
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.2)",
    marginBottom: spacing[5],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  factorsTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.sizes.sm,
    color: colors.primary,
    letterSpacing: 2,
    marginBottom: spacing[4],
  },
  factorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing[3],
    gap: spacing[2],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  factorRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    marginBottom: 0,
  },
  factorText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
    color: colors.foreground,
    lineHeight: 21,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[4],
  },
  loadingText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
    color: colors.mutedForeground,
  },

  // CTA - positioned above safe area
  ctaSection: {
    alignItems: "center",
    marginTop: "auto",
    paddingTop: spacing[2],
  },
  ctaButton: {
    width: "100%",
    borderRadius: borderRadius.full,
    overflow: "hidden",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  ctaPressed: {
    transform: [{ scale: 0.97 }],
    shadowOpacity: 0.6,
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    paddingVertical: spacing[5],
  },
  ctaText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.sizes.lg,
    color: colors.background,
    letterSpacing: 0.5,
  },
  ctaSubtext: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
    marginTop: spacing[3],
    textAlign: "center",
  },

  // Shimmer effect
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 100,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    transform: [{ skewX: "-20deg" }],
  },

  // Game time
  gameTimeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[3],
  },
  gameTimeText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.xs,
    color: colors.mutedForeground,
  },
});
