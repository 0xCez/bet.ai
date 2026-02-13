import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { GaugeProgressBar } from "@/components/ui/GaugeProgressBar";
import { GradientProgressBar } from "@/components/ui/GradientProgressBar";
import { TopBar } from "@/components/ui/TopBar";
import APIService from "@/services/api";
import { usePageTransition } from "@/hooks/usePageTransition";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import i18n from "@/i18n";
import { auth, db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { getNBATeamLogo, getNFLTeamLogo, getSoccerTeamLogo } from "@/utils/teamLogos";
import { usePageTracking } from "@/hooks/usePageTracking";
import { useBookmakerTracking } from "@/hooks/useBookmakerTracking";
import { BookmakerTappable } from "@/components/BookmakerTappable";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius as radii, typography, shimmerColors } from "../constants/designTokens";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist market data between screen navigation
let cachedMarketResult: MarketIntelResult | null = null;
let cachedParams: any = null;

// Track last refresh time for rate limiting (10 minutes cooldown)
let lastRefreshTime: number = 0;
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

// Interface matching the backend market intelligence structure
interface MarketIntelResult {
  sport: string;
  teams: {
    home: string;
    away: string;
    logos: {
      home: string;
      away: string;
    };
  };
  marketIntelligence: {
    bestLines: {
      consensusSpreadPoint: number;
      consensusTotal: number;
      consensusHomeML: number;
      consensusAwayML: number;
      bestLines: Array<{
        type: string;
        label: string;
        line?: number;
        odds: number;
        bookmaker: string;
        team: string;
      }>;
    };
    sharpMeter: {
      line1: string;
      line2: string;
      line3: string;
      gaugeValue: number;
      gaugeLabel: string;
    };
    vigAnalysis: {
      moneyline: { sharp: number; market: number };
      spread: { sharp: number; market: number };
      total: { sharp: number; market: number };
    };
    fairValue: {
      moneyline: { fair1: number; fair2: number };
      spread: { fair1: number; fair2: number };
      total: { fair1: number; fair2: number };
    };
    evOpportunities: {
      hasOpportunities: boolean | null;
      opportunities: Array<{
        type: string;
        title: string;
        description: string;
        icon?: string;
        ev?: number;
        vig?: number;
        bookmaker?: string;
      }>;
      summary: string;
    };
    marketTightness: {
      tightness: string;
      pointRange: number;
      priceRange: number;
      comment: string;
      summary: string;
    };
    oddsTable: Array<{
      bookmaker: string;
      bookmakerKey: string;
      odds?: {
        moneyline?: { home?: number; away?: number };
        spread?: {
          home?: { point?: number; price?: number };
          away?: { point?: number; price?: number };
        };
        total?: {
          over?: { point?: number; price?: number };
          under?: { point?: number; price?: number };
        };
      };
    }>;
  };
  timestamp: string;
}

type MarketIntelParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1_code?: string;
  team2_code?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
  isDemo?: string;
  fromCache?: string; // "true" when viewing pre-cached games from carousel
  cachedGameId?: string; // Firestore doc ID for pre-cached games
};

// Helper function to get bookmaker logo
const getBookmakerLogo = (bookmakerName?: string) => {
  if (!bookmakerName) return require("../assets/images/logo.png");

  const logoMap: { [key: string]: any } = {
    'DraftKings': require("../assets/images/Draftkings.png"),
    'FanDuel': require("../assets/images/Fanduel.png"),
    'BetMGM': require("../assets/images/Betmgm.png"),
    'Pinnacle': require("../assets/images/Pinaccle.png"),
    'BetUS': require("../assets/images/Betus.png"),
    'BetRivers': require("../assets/images/Betrivers.png"),
    'Bovada': require("../assets/images/Bovada.png"),
    'MyBookie.ag': require("../assets/images/mybookie.png"),
    'ESPN BET': require("../assets/images/Espnbet.png"),
    'Caesars': require("../assets/images/Caesars.png"),
    'LowVig.ag': require("../assets/images/Lowvig.png"),
    'BetOnline.ag': require("../assets/images/Betonline.png"),
    'Fanatics': require("../assets/images/fanatics.png"),
    'Bally Bet': require("../assets/images/Ballybet.png"),
    'Hard Rock Bet': require("../assets/images/Hardrockbet.png"),
  };

  return logoMap[bookmakerName] || require("../assets/images/logo.png");
};

// Helper function to format decimal odds to American odds
const formatOdds = (decimalOdds?: number): string => {
  if (!decimalOdds) return "-110";

  if (decimalOdds >= 2.0) {
    return `+${Math.round((decimalOdds - 1) * 100)}`;
  } else {
    return `-${Math.round(100 / (decimalOdds - 1))}`;
  }
};

// Helper function to get team display name
const getTeamDisplayName = (teamName?: string): string => {
  if (!teamName) return "TEAM";

  // Default: return last word (team nickname), with first letter capitalized
  const nickname = teamName.split(' ').pop() || teamName;
  return nickname.charAt(0).toUpperCase() + nickname.slice(1).toLowerCase();
};

// Helper function to get team logo based on sport
const getTeamLogo = (teamName: string, sport?: string) => {
  if (!sport || !teamName) return require("../assets/images/logo.png");

  switch (sport.toLowerCase()) {
    case 'nba':
      return getNBATeamLogo(teamName);
    case 'nfl':
      return getNFLTeamLogo(teamName);
    case 'soccer':
    case 'football':
      return getSoccerTeamLogo(teamName);
    default:
      return require("../assets/images/logo.png");
  }
};

export default function MarketIntelNew() {
  const params = useLocalSearchParams<MarketIntelParams>();
  const router = useRouter();
  const { animatedStyle } = usePageTransition(false);
  const { isSubscribed } = useRevenueCatPurchases();

  // Track page views and time spent
  usePageTracking({
    pageName: 'market_intel',
    metadata: {
      team1: params.team1,
      team2: params.team2,
      sport: params.sport,
      analysisId: params.analysisId,
      isDemo: params.isDemo === 'true',
    },
  });

  // Track bookmaker link taps by section
  const trackBestLinesTap = useBookmakerTracking({
    section: 'best_lines',
    sport: params.sport,
    team1: params.team1,
    team2: params.team2,
  });
  const trackOddsTableTap = useBookmakerTracking({
    section: 'odds_table',
    sport: params.sport,
    team1: params.team1,
    team2: params.team2,
  });
  const trackEvOpsTap = useBookmakerTracking({
    section: 'ev_opportunities',
    sport: params.sport,
    team1: params.team1,
    team2: params.team2,
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
  const [isLoading, setIsLoading] = useState(!isSameAnalysis || !cachedMarketResult);
  const [marketResult, setMarketResult] = useState<MarketIntelResult | null>(
    isSameAnalysis && cachedMarketResult ? cachedMarketResult : null
  );
  const [error, setError] = useState<string | null>(null);
  const [cooldownMessage, setCooldownMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Card animation values (9 cards in market intel view)
  const cardAnimations = useRef(
    Array.from({ length: 9 }, () => new Animated.Value(0))
  ).current;

  const animateCardsIn = useCallback(() => {
    // Reset all animations
    cardAnimations.forEach(anim => anim.setValue(0));

    // Create staggered animations
    const animations = cardAnimations.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        delay: 50 + index * 100,
        useNativeDriver: true,
      })
    );

    Animated.parallel(animations).start();
  }, [cardAnimations]);

  const getCardStyle = useCallback((index: number) => ({
    opacity: cardAnimations[index],
    transform: [
      {
        translateX: cardAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [-30, 0],
        }),
      },
      {
        scale: cardAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 1],
        }),
      },
    ],
  }), [cardAnimations]);

  // Trigger animation when data is loaded
  useEffect(() => {
    if (marketResult && !isLoading) {
      animateCardsIn();
    }
  }, [marketResult, isLoading, animateCardsIn]);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Skip re-fetching if we're navigating back to the same analysis
    if (isSameAnalysis && cachedMarketResult) {
      setIsLoading(false);
      return;
    }

    // Reset cache when loading new analysis
    if (!isSameAnalysis) {
      cachedMarketResult = null;
    }

    // If analysisId exists (history/demo/cached), load from Firestore instead of API
    if (params.analysisId) {
      if (params.fromCache === "true") {
        loadMarketIntelFromCache();
      } else {
        loadMarketIntelFromFirestore();
      }
      return;
    }

    if (params.team1 && params.team2 && params.sport) {
      getMarketIntelligence();
    } else {
      setError("Missing game data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, auth.currentUser, isSameAnalysis]);

  // Load market intel from Firestore (for history/demo mode)
  const loadMarketIntelFromFirestore = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const isDemo = params.isDemo === 'true';
      const userId = isDemo
        ? "piWQIzwI9tNXrNTgb5dWTqAjUrj2" // Demo user
        : auth.currentUser?.uid; // Regular user

      if (!userId || !params.analysisId) {
        throw new Error("User ID or Analysis ID missing");
      }

      // Use demoAnalysis collection for demo mode, otherwise use userAnalyses
      const collection = isDemo ? "demoAnalysis" : "userAnalyses";
      const docRef = doc(db, collection, userId, "analyses", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Analysis not found in history");
      }

      const data = docSnap.data();

      // Extract market intel data from cached analysis
      const cachedAnalysis = data.analysis;

      if (cachedAnalysis?.marketIntelligence) {
        // Handle nested evAnalysis structure (some old data has vigAnalysis/fairValue/evOpportunities nested inside evAnalysis)
        const mi = cachedAnalysis.marketIntelligence;
        const flattenedMarketIntel = {
          ...mi,
          // Un-nest if data is inside evAnalysis
          vigAnalysis: mi.vigAnalysis || mi.evAnalysis?.vigAnalysis || null,
          fairValue: mi.fairValue || mi.evAnalysis?.fairValue || null,
          evOpportunities: mi.evOpportunities || mi.evAnalysis?.uiOpportunities || mi.evAnalysis?.evOpportunities || null,
          sharpConsensus: mi.sharpConsensus || mi.evAnalysis?.sharpConsensus || null,
        };

        // Build the expected structure
        const marketData: MarketIntelResult = {
          sport: data.sport || cachedAnalysis.sport,
          teams: cachedAnalysis.teams || { home: params.team1 || "", away: params.team2 || "", logos: { home: "", away: "" } },
          marketIntelligence: flattenedMarketIntel,
          timestamp: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };

        setMarketResult(marketData);
        cachedMarketResult = marketData;
        console.log("✅ Loaded market intel from Firestore cache");
        console.log("Market intel structure:", JSON.stringify(Object.keys(flattenedMarketIntel), null, 2));
      } else {
        throw new Error("No market intelligence data in cached analysis");
      }
    } catch (err) {
      console.error("Error loading from Firestore:", err);
      setError("Historical data unavailable. Click 'Get Fresh Odds' to fetch current data.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load market intel from pre-cached games (matchAnalysisCache collection)
  const loadMarketIntelFromCache = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!params.analysisId) {
        throw new Error("Cache ID missing");
      }

      // Pre-cached games are stored in matchAnalysisCache collection
      const docRef = doc(db, "matchAnalysisCache", params.analysisId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error("Cached analysis not found");
      }

      const data = docSnap.data();
      const cachedAnalysis = data.analysis || {};

      if (cachedAnalysis?.marketIntelligence) {
        const mi = cachedAnalysis.marketIntelligence;
        const flattenedMarketIntel = {
          ...mi,
          vigAnalysis: mi.vigAnalysis || mi.evAnalysis?.vigAnalysis || null,
          fairValue: mi.fairValue || mi.evAnalysis?.fairValue || null,
          evOpportunities: mi.evOpportunities || mi.evAnalysis?.uiOpportunities || mi.evAnalysis?.evOpportunities || null,
          sharpConsensus: mi.sharpConsensus || mi.evAnalysis?.sharpConsensus || null,
        };

        const marketData: MarketIntelResult = {
          sport: data.sport || cachedAnalysis.sport,
          teams: cachedAnalysis.teams || { home: params.team1 || "", away: params.team2 || "", logos: { home: "", away: "" } },
          marketIntelligence: flattenedMarketIntel,
          timestamp: data.timestamp || new Date().toISOString()
        };

        setMarketResult(marketData);
        cachedMarketResult = marketData;
        console.log("✅ Loaded market intel from pre-cached game");
      } else {
        throw new Error("No market intelligence data in pre-cached analysis");
      }
    } catch (err) {
      console.error("Error loading from cache:", err);
      setError("Cached data unavailable. Click 'Get Fresh Odds' to fetch current data.");
    } finally {
      setIsLoading(false);
    }
  };

  // Main function to fetch market intelligence data
  const getMarketIntelligence = async () => {
    if (marketResult) return;
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
        throw new Error(response.message || "Failed to fetch market intelligence");
      }

      const marketData: MarketIntelResult = response;

      setMarketResult(marketData);
      cachedMarketResult = marketData;
    } catch (err) {
      console.error("Error in getMarketIntelligence:", err);
      setError(err instanceof Error ? err.message : "Failed to get market intelligence");
    } finally {
      setIsLoading(false);
    }
  };

  // Shake animation for button when in cooldown
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  // Function to refresh market intelligence (clear cache and fetch fresh data)
  const refreshMarketIntelligence = async () => {
    // Disable refresh in demo mode
    if (params.isDemo === 'true') {
      triggerShake();
      setCooldownMessage('Feature unavailable in demo mode');
      setTimeout(() => setCooldownMessage(null), 3000);
      return;
    }

    // Check if enough time has passed since last refresh (10 minutes)
    const now = Date.now();
    const timeElapsed = now - lastRefreshTime;
    const remainingTime = Math.ceil((REFRESH_COOLDOWN_MS - timeElapsed) / 1000 / 60); // Minutes remaining

    if (lastRefreshTime > 0 && timeElapsed < REFRESH_COOLDOWN_MS) {
      // Still in cooldown period - trigger shake and show message
      triggerShake();
      setCooldownMessage(`Try again in ${remainingTime} minute${remainingTime > 1 ? 's' : ''}`);
      setTimeout(() => setCooldownMessage(null), 3000); // Clear message after 3 seconds
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      if (!params.sport) {
        throw new Error("Sport parameter is required but missing");
      }

      console.log("Fetching FRESH market intelligence data...");

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
        throw new Error(response.message || "Failed to fetch market intelligence");
      }

      const marketData: MarketIntelResult = response;

      setMarketResult(marketData);
      cachedMarketResult = marketData;

      // Update last refresh time
      lastRefreshTime = Date.now();

      console.log("Fresh market intelligence data loaded successfully!");

    } catch (err) {
      console.error("Error in refreshMarketIntelligence:", err);
      setError(err instanceof Error ? err.message : "Failed to get fresh market intelligence");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Navigate to info page
  const navigateToInfo = (section: string) => {
    router.push({
      pathname: "/info",
      params: {
        section,
        from: "market-intel",
        team1: params.team1,
        team2: params.team2,
        sport: params.sport,
        team1Logo: params.team1Logo,
        team2Logo: params.team2Logo,
        analysisId: params.analysisId,
      },
    });
  };

  // Shimmer rendering
  const renderShimmer = () => (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Top Card - Market Intelligence Header */}
      <Card style={styles.topCard}>
        <View style={styles.marketHeader}>
          <ShimmerPlaceholder
            style={styles.marketTitleShimmer}
            shimmerColors={shimmerColors}
          />
        </View>
      </Card>

      {/* Best Lines Section */}
      <Card style={styles.bestLinesCard}>
        <View style={styles.bestLinesContent}>
          {/* Header */}
          <View style={styles.bestLinesHeader}>
            <ShimmerPlaceholder
              style={styles.bestLinesTitleShimmer}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.bestLinesInfoShimmer}
              shimmerColors={shimmerColors}
            />
          </View>

          {/* Best Lines Items */}
          <View style={styles.linesList}>
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <View key={index} style={styles.lineItem}>
                <ShimmerPlaceholder
                  style={styles.bookmakerLogo}
                  shimmerColors={shimmerColors}
                />
                <View style={styles.lineTextContainer}>
                  <ShimmerPlaceholder
                    style={styles.lineBigTextShimmer}
                    shimmerColors={shimmerColors}
                  />
                  <ShimmerPlaceholder
                    style={styles.lineSmallTextShimmer}
                    shimmerColors={shimmerColors}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* Consensus Lines Section */}
      <Card style={styles.consensusLinesCard}>
        <View style={styles.consensusLinesContent}>
          {/* Header */}
          <View style={styles.consensusLinesHeader}>
            <ShimmerPlaceholder
              style={styles.consensusLinesTitleShimmer}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.consensusLinesInfoShimmer}
              shimmerColors={shimmerColors}
            />
          </View>

          {/* Consensus Table */}
          <View style={styles.consensusTable}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <View style={styles.teamColumn} />
              {[1, 2, 3].map((index) => (
                <View key={index} style={styles.dataColumn}>
                  <ShimmerPlaceholder
                    style={styles.columnHeaderTextShimmer}
                    shimmerColors={shimmerColors}
                  />
                </View>
              ))}
            </View>

            {/* Team Rows */}
            {[1, 2].map((teamIndex) => (
              <View key={teamIndex} style={styles.tableRow}>
                <View style={styles.teamColumn}>
                  <ShimmerPlaceholder
                    style={styles.teamLogo}
                    shimmerColors={shimmerColors}
                  />
                  <ShimmerPlaceholder
                    style={styles.teamNameShimmer}
                    shimmerColors={shimmerColors}
                  />
                </View>
                {[1, 2, 3].map((colIndex) => (
                  <View key={colIndex} style={styles.dataColumn}>
                    <View style={styles.dataCell}>
                      <ShimmerPlaceholder
                        style={styles.dataValueShimmer}
                        shimmerColors={shimmerColors}
                      />
                      {colIndex !== 3 && (
                        <ShimmerPlaceholder
                          style={styles.dataSecondaryShimmer}
                          shimmerColors={shimmerColors}
                        />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* Public vs Sharp Meter Card */}
      <Card style={styles.publicSharpCard}>
        {/* Header */}
        <View style={styles.publicSharpHeader}>
          <ShimmerPlaceholder
            style={styles.publicSharpTitleShimmer}
            shimmerColors={shimmerColors}
          />
          <ShimmerPlaceholder
            style={styles.publicSharpInfoShimmer}
            shimmerColors={shimmerColors}
          />
        </View>

        <View style={styles.publicSharpContent}>
          {/* Left Side - Text Content */}
          <View style={styles.publicSharpLeft}>
            {[1, 2, 3].map((index) => (
              <View key={index} style={[styles.publicSharpRow, index === 2 && styles.publicSharpRowBordered]}>
                <ShimmerPlaceholder
                  style={styles.publicSharpTextShimmer}
                  shimmerColors={shimmerColors}
                />
              </View>
            ))}
          </View>

          {/* Right Side - Gauge */}
          <View style={styles.publicSharpRight}>
            <ShimmerPlaceholder
              style={styles.gaugeShimmer}
              shimmerColors={shimmerColors}
            />
          </View>
        </View>
      </Card>

      {/* Market Efficiency Card */}
      <Card style={styles.marketEfficiencyCard}>
        {/* Header */}
        <View style={styles.marketEfficiencyHeader}>
          <ShimmerPlaceholder
            style={styles.marketEfficiencyTitleShimmer}
            shimmerColors={shimmerColors}
          />
          <ShimmerPlaceholder
            style={styles.marketEfficiencyInfoShimmer}
            shimmerColors={shimmerColors}
          />
        </View>

        <View style={styles.marketEfficiencyContent}>
          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <ShimmerPlaceholder
              style={styles.progressBarShimmer}
              shimmerColors={shimmerColors}
            />
            <View style={styles.progressBarLabels}>
              <ShimmerPlaceholder
                style={styles.progressBarLabelShimmer}
                shimmerColors={shimmerColors}
              />
              <ShimmerPlaceholder
                style={styles.progressBarLabelShimmer}
                shimmerColors={shimmerColors}
              />
            </View>
          </View>

          {/* Description */}
          <ShimmerPlaceholder
            style={styles.marketEfficiencyDescriptionShimmer}
            shimmerColors={shimmerColors}
          />
        </View>
      </Card>

      {/* Odds Table Card */}
      <Card style={styles.oddsTableCard}>
        {/* Header */}
        <View style={styles.oddsTableHeader}>
          <ShimmerPlaceholder
            style={styles.oddsTableTitleShimmer}
            shimmerColors={shimmerColors}
          />
          <ShimmerPlaceholder
            style={styles.oddsTableInfoShimmer}
            shimmerColors={shimmerColors}
          />
        </View>

        <View style={styles.oddsTableContainer}>
          {/* Column Headers */}
          <View style={styles.oddsTableHeaderRow}>
            {[1, 2, 3].map((index) => (
              <ShimmerPlaceholder
                key={index}
                style={[styles.oddsTableColumnHeaderShimmer, index === 3 && styles.oddsTableColumnHeaderCellLast]}
                shimmerColors={shimmerColors}
              />
            ))}
          </View>

          {/* Team Name */}
          <ShimmerPlaceholder
            style={styles.oddsTableTeamNameShimmer}
            shimmerColors={shimmerColors}
          />

          {/* Bookmaker Rows */}
          {[1, 2, 3].map((rowIndex) => (
            <View key={rowIndex} style={styles.oddsTableRow}>
              {[1, 2, 3].map((colIndex) => (
                <View key={colIndex} style={[styles.oddsTableCell, colIndex === 3 && styles.oddsTableCellLast]}>
                  <ShimmerPlaceholder
                    style={styles.oddsTableLogo}
                    shimmerColors={shimmerColors}
                  />
                  {colIndex === 1 ? (
                    <ShimmerPlaceholder
                      style={styles.oddsTableValueShimmer}
                      shimmerColors={shimmerColors}
                    />
                  ) : (
                    <View style={styles.oddsTableMultiValue}>
                      <ShimmerPlaceholder
                        style={styles.oddsTableValueShimmer}
                        shimmerColors={shimmerColors}
                      />
                      <ShimmerPlaceholder
                        style={styles.oddsTableValueShimmer}
                        shimmerColors={shimmerColors}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </Card>

      {/* Get Fresh Odds Button */}
      <View style={styles.buttonContainer}>
        <ShimmerPlaceholder
          style={styles.freshOddsButtonShimmer}
          shimmerColors={shimmerColors}
        />
      </View>
    </ScrollView>
  );

  // Main content rendering
  const renderMarketContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Top Card - Market Intelligence Header */}
        <Animated.View style={getCardStyle(0)}>
          <Card style={styles.topCard}>
            <View style={styles.marketHeader}>
              <Text style={styles.marketTitle}>{i18n.t("marketIntelTitle")}</Text>
            </View>
          </Card>
        </Animated.View>

        {/* Best Lines Section */}
        <Animated.View style={getCardStyle(1)}>
          <Card style={styles.bestLinesCard}>
            <View style={styles.bestLinesContent}>
              {/* Header */}
              <View style={styles.bestLinesHeader}>
                <Text style={styles.bestLinesTitle}>{i18n.t("marketIntelBestLines")}</Text>
                <Pressable onPress={() => navigateToInfo("bestLines")}>
                  <Text style={styles.bestLinesInfo}>ⓘ</Text>
                </Pressable>
              </View>

              {/* Dynamic Line Items */}
              <View style={styles.linesList}>
                {marketResult?.marketIntelligence?.bestLines?.bestLines && marketResult.marketIntelligence.bestLines.bestLines.length > 0 ? (
                  marketResult.marketIntelligence.bestLines.bestLines.slice(0, 6).map((line, index) => (
                    <BookmakerTappable
                      key={index}
                      bookmaker={line.bookmaker}
                      sport={params.sport}
                      onLinkOpened={trackBestLinesTap}
                      style={styles.lineItem}
                    >
                      <Image
                        source={getBookmakerLogo(line.bookmaker)}
                        style={styles.bookmakerLogo}
                        contentFit="contain"
                      />
                      <View style={styles.lineTextContainer}>
                        <Text style={styles.lineBigText}>
                          {line.team?.split(' ').pop() || ""} {
                            line.type === "soccer_win" ? (line.fractionalOdds || formatOdds(line.odds)) + " to win" :
                            line.type === "soccer_draw" ? (line.fractionalOdds || formatOdds(line.odds)) :
                            line.type === "moneyline" ? "ML " + formatOdds(line.odds) :
                            line.type === "spread" ? (line.line || "") + " " + formatOdds(line.odds) :
                            `${line.type === "over" ? "Over" : "Under"} ${line.line || ""} ${formatOdds(line.odds)}`
                          }
                        </Text>
                        <Text style={styles.lineSmallText}>{line.label}</Text>
                      </View>
                    </BookmakerTappable>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>{i18n.t("marketIntelNoBestLines")}</Text>
                  </View>
                )}
              </View>
            </View>
          </Card>
        </Animated.View>

        {/* Consensus Lines Section */}
        <Animated.View style={getCardStyle(2)}>
          <Card style={styles.consensusLinesCard}>
            <View style={styles.consensusLinesContent}>
              {/* Header */}
              <View style={styles.consensusLinesHeader}>
              <Text style={styles.consensusLinesTitle}>{i18n.t("marketIntelConsensusLines")}</Text>
              <Pressable onPress={() => navigateToInfo("consensusLines")}>
                <Text style={styles.consensusLinesInfo}>ⓘ</Text>
              </Pressable>
            </View>

            {marketResult?.marketIntelligence?.bestLines ? (
              params.sport?.includes('soccer') ? (
                // SOCCER: 1 row with Home/Draw/Away
                <View style={styles.consensusTable}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.teamColumn} />
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelHomeWin")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelDraw")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelAwayWin")}</Text>
                    </View>
                  </View>

                  {/* Single Match Winner Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Text style={styles.teamName}>{i18n.t("marketIntelMatchWinner")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.bestLines.consensusHomeMLFractional || "1/1"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.bestLines.consensusDrawMLFractional || "4/1"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.bestLines.consensusAwayMLFractional || "7/1"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                // NFL/NBA: 2 rows with Spread/ML/Total
                <View style={styles.consensusTable}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.teamColumn} />
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelSpread")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelMoneyline")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelTotal")}</Text>
                    </View>
                  </View>

                  {/* Team 1 Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Image
                        source={getTeamLogo(params.team1 || "", params.sport)}
                        style={styles.teamLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.teamName}>{getTeamDisplayName(params.team1)}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>{marketResult.marketIntelligence.bestLines.consensusSpreadPoint || "-2"}</Text>
                        <Text style={styles.dataSecondary}>-105</Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>{formatOdds(marketResult.marketIntelligence.bestLines.consensusHomeML)}</Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>O{marketResult.marketIntelligence.bestLines.consensusTotal || "42"}</Text>
                        <Text style={styles.dataSecondary}>-105</Text>
                      </View>
                    </View>
                  </View>

                  {/* Team 2 Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Image
                        source={getTeamLogo(params.team2 || "", params.sport)}
                        style={styles.teamLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.teamName}>{getTeamDisplayName(params.team2)}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>+{Math.abs(marketResult.marketIntelligence.bestLines.consensusSpreadPoint || -2)}</Text>
                        <Text style={styles.dataSecondary}>-105</Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>{formatOdds(marketResult.marketIntelligence.bestLines.consensusAwayML)}</Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>U{(marketResult.marketIntelligence.bestLines.consensusTotal || 42) + 0.5}</Text>
                        <Text style={styles.dataSecondary}>-105</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{i18n.t("marketIntelNoConsensusLines")}</Text>
              </View>
            )}
            </View>
          </Card>
        </Animated.View>

        {/* Public vs Sharp Meter Card */}
        <Animated.View style={getCardStyle(3)}>
          <Card style={styles.publicSharpCard}>
          {/* Header */}
          <View style={styles.publicSharpHeader}>
            <Text style={styles.publicSharpTitle}>{i18n.t("marketIntelPublicVsSharp")}</Text>
            <Pressable onPress={() => navigateToInfo("publicVsSharp")}>
              <Text style={styles.publicSharpInfo}>ⓘ</Text>
            </Pressable>
          </View>

          {marketResult?.marketIntelligence?.sharpMeter ? (
            <View style={styles.publicSharpContent}>
              {/* Left Side - Text Content */}
              <View style={styles.publicSharpLeft}>
                {/* Line 1 */}
                <View style={styles.publicSharpRow}>
                  <Text style={styles.publicSharpText}>
                    {marketResult.marketIntelligence.sharpMeter.line1 || "No clear sharp lean"}
                  </Text>
                </View>

                {/* Line 2 with borders */}
                <View style={[styles.publicSharpRow, styles.publicSharpRowBordered]}>
                  <Text style={styles.publicSharpText}>
                    {marketResult.marketIntelligence.sharpMeter.line2 || "Limited data"}
                  </Text>
                </View>

                {/* Line 3 */}
                <View style={styles.publicSharpRow}>
                  <Text style={styles.publicSharpText}>
                    {marketResult.marketIntelligence.sharpMeter.line3 || i18n.t("marketIntelNoComparison")}
                  </Text>
                </View>
              </View>

              {/* Right Side - Gauge */}
              <View style={styles.publicSharpRight}>
                <GaugeProgressBar
                  value={marketResult.marketIntelligence.sharpMeter.gaugeValue || 50}
                  maxValue={100}
                  primaryText={String(marketResult.marketIntelligence.sharpMeter.gaugeValue || "50")}
                  secondaryText={marketResult.marketIntelligence.sharpMeter.gaugeLabel || "MED"}
                />
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{i18n.t("marketIntelNoSharpMeter")}</Text>
            </View>
          )}
          </Card>
        </Animated.View>

        {/* Market Efficiency Card */}
        <Animated.View style={getCardStyle(4)}>
          <Card style={styles.marketEfficiencyCard}>
            {/* Header */}
            <View style={styles.marketEfficiencyHeader}>
              <Text style={styles.marketEfficiencyTitle}>{i18n.t("marketIntelEfficiency")}</Text>
              <Pressable onPress={() => navigateToInfo("marketEfficiency")}>
                <Text style={styles.marketEfficiencyInfo}>ⓘ</Text>
              </Pressable>
            </View>

          {marketResult?.marketIntelligence?.marketTightness ? (
            <View style={styles.marketEfficiencyContent}>
              {/* Progress Bar with Labels */}
              <View style={styles.progressBarContainer}>
                <GradientProgressBar
                  value={marketResult.marketIntelligence.marketTightness.tightness === "Tight" ? 80 :
                         marketResult.marketIntelligence.marketTightness.tightness === "Normal" ? 50 : 20}
                  maxValue={100}
                />
                <View style={styles.progressBarLabels}>
                  <Text style={styles.progressBarLabel}>{i18n.t("marketIntelLoose")}</Text>
                  <Text style={styles.progressBarLabel}>{i18n.t("marketIntelTight")}</Text>
                </View>
              </View>

              {/* Description */}
              <Text style={styles.marketEfficiencyDescription}>
                {marketResult.marketIntelligence.marketTightness.summary || "Normal market conditions"}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{i18n.t("marketIntelNoEfficiency")}</Text>
            </View>
          )}
          </Card>
        </Animated.View>

        {/* Odds Table Card */}
        <Animated.View style={getCardStyle(5)}>
          <Card style={styles.oddsTableCard}>
            {/* Header */}
            <View style={styles.oddsTableHeader}>
              <Text style={styles.oddsTableTitle}>{i18n.t("marketIntelOddsTable")}</Text>
              <Pressable onPress={() => navigateToInfo("oddsTable")}>
                <Text style={styles.oddsTableInfo}>ⓘ</Text>
              </Pressable>
            </View>

          {marketResult?.marketIntelligence?.oddsTable && marketResult.marketIntelligence.oddsTable.length > 0 ? (
            params.sport?.includes('soccer') ? (
              // SOCCER: Single section with Home/Draw/Away columns
              <View style={styles.oddsTableContainer}>
                {/* Column Headers */}
                <View style={styles.oddsTableHeaderRow}>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>HOME W</Text>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>DRAW</Text>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCellLast]}>AWAY W</Text>
                </View>

                {/* Bookmaker Rows */}
                {marketResult.marketIntelligence.oddsTable.slice(0, 5).map((bookmaker, index) => (
                  <BookmakerTappable
                    key={`soccer-${index}`}
                    bookmaker={bookmaker.bookmakerKey || bookmaker.bookmaker}
                    sport={params.sport}
                    onLinkOpened={trackOddsTableTap}
                    style={styles.oddsTableRow}
                    showLinkIcon={false}
                  >
                    <View style={styles.oddsTableCell}>
                      <Image
                        source={getBookmakerLogo(bookmaker.bookmaker)}
                        style={styles.oddsTableLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.oddsTableValue}>
                        {bookmaker.odds?.moneyline?.homeFractional || formatOdds(bookmaker.odds?.moneyline?.home)}
                      </Text>
                    </View>
                    <View style={styles.oddsTableCell}>
                      <Image
                        source={getBookmakerLogo(bookmaker.bookmaker)}
                        style={styles.oddsTableLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.oddsTableValue}>
                        {bookmaker.odds?.moneyline?.drawFractional || formatOdds(bookmaker.odds?.moneyline?.draw)}
                      </Text>
                    </View>
                    <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                      <Image
                        source={getBookmakerLogo(bookmaker.bookmaker)}
                        style={styles.oddsTableLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.oddsTableValue}>
                        {bookmaker.odds?.moneyline?.awayFractional || formatOdds(bookmaker.odds?.moneyline?.away)}
                      </Text>
                    </View>
                  </BookmakerTappable>
                ))}
              </View>
            ) : (
              // NFL/NBA: Team 1 and Team 2 sections with ML/Spread/Total
              <View style={styles.oddsTableContainer}>
                {/* Column Headers */}
                <View style={styles.oddsTableHeaderRow}>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>{i18n.t("marketIntelMoneyline").toUpperCase()}</Text>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>{i18n.t("marketIntelSpread").toUpperCase()}</Text>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCellLast]}>{i18n.t("marketIntelTotal").toUpperCase()}</Text>
                </View>

                {/* Team 1 Section */}
                <Text style={styles.oddsTableTeamName}>{getTeamDisplayName(params.team1)}</Text>

            {/* Dynamic Bookmaker Rows for Team 1 */}
            {marketResult.marketIntelligence.oddsTable.slice(0, 3).map((bookmaker, index) => (
              <BookmakerTappable
                key={`team1-${index}`}
                bookmaker={bookmaker.bookmakerKey || bookmaker.bookmaker}
                sport={params.sport}
                onLinkOpened={trackOddsTableTap}
                style={styles.oddsTableRow}
                showLinkIcon={false}
              >
                <View style={styles.oddsTableCell}>
                  <Image
                    source={getBookmakerLogo(bookmaker.bookmaker)}
                    style={styles.oddsTableLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.oddsTableValue}>
                    {formatOdds(bookmaker.odds?.moneyline?.home)}
                  </Text>
                </View>
                <View style={styles.oddsTableCell}>
                  <Image
                    source={getBookmakerLogo(bookmaker.bookmaker)}
                    style={styles.oddsTableLogo}
                    contentFit="contain"
                  />
                  <View style={styles.oddsTableMultiValue}>
                    <Text style={styles.oddsTableValue}>
                      {bookmaker.odds?.spread?.home?.point ?
                        `${bookmaker.odds.spread.home.point > 0 ? '+' : ''}${bookmaker.odds.spread.home.point}` :
                        "+1.5"}
                    </Text>
                    <Text style={styles.oddsTableValue}>
                      {formatOdds(bookmaker.odds?.spread?.home?.price)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                  <Image
                    source={getBookmakerLogo(bookmaker.bookmaker)}
                    style={styles.oddsTableLogo}
                    contentFit="contain"
                  />
                  <View style={styles.oddsTableMultiValue}>
                    <Text style={styles.oddsTableValue}>
                      {bookmaker.odds?.total?.over ?
                        `O ${bookmaker.odds.total.over.point}` :
                        "O 43"}
                    </Text>
                    <Text style={styles.oddsTableValue}>
                      {formatOdds(bookmaker.odds?.total?.over?.price)}
                    </Text>
                  </View>
                </View>
              </BookmakerTappable>
            ))}

            {/* Team 2 Section */}
            <Text style={styles.oddsTableTeamName}>{getTeamDisplayName(params.team2)}</Text>

            {/* Dynamic Bookmaker Rows for Team 2 */}
            {marketResult.marketIntelligence.oddsTable.slice(0, 3).map((bookmaker, index) => (
              <BookmakerTappable
                key={`team2-${index}`}
                bookmaker={bookmaker.bookmakerKey || bookmaker.bookmaker}
                sport={params.sport}
                onLinkOpened={trackOddsTableTap}
                style={styles.oddsTableRow}
                showLinkIcon={false}
              >
                <View style={styles.oddsTableCell}>
                  <Image
                    source={getBookmakerLogo(bookmaker.bookmaker)}
                    style={styles.oddsTableLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.oddsTableValue}>
                    {formatOdds(bookmaker.odds?.moneyline?.away)}
                  </Text>
                </View>
                <View style={styles.oddsTableCell}>
                  <Image
                    source={getBookmakerLogo(bookmaker.bookmaker)}
                    style={styles.oddsTableLogo}
                    contentFit="contain"
                  />
                  <View style={styles.oddsTableMultiValue}>
                    <Text style={styles.oddsTableValue}>
                      {bookmaker.odds?.spread?.away?.point ?
                        `${bookmaker.odds.spread.away.point > 0 ? '+' : ''}${bookmaker.odds.spread.away.point}` :
                        "-1.5"}
                    </Text>
                    <Text style={styles.oddsTableValue}>
                      {formatOdds(bookmaker.odds?.spread?.away?.price)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                  <Image
                    source={getBookmakerLogo(bookmaker.bookmaker)}
                    style={styles.oddsTableLogo}
                    contentFit="contain"
                  />
                  <View style={styles.oddsTableMultiValue}>
                    <Text style={styles.oddsTableValue}>
                      {bookmaker.odds?.total?.under ?
                        `U ${bookmaker.odds.total.under.point}` :
                        "U 53.4"}
                    </Text>
                    <Text style={styles.oddsTableValue}>
                      {formatOdds(bookmaker.odds?.total?.under?.price)}
                    </Text>
                  </View>
                </View>
              </BookmakerTappable>
            ))}
              </View>
              )
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{i18n.t("marketIntelNoOddsTable")}</Text>
            </View>
          )}
          </Card>
        </Animated.View>

        {/* Vig Analysis Card */}
        <Animated.View style={getCardStyle(6)}>
          <Card style={styles.consensusLinesCard}>
            <View style={styles.consensusLinesContent}>
              {/* Header */}
              <View style={styles.consensusLinesHeader}>
                <Text style={styles.consensusLinesTitle}>{i18n.t("marketIntelVigAnalysis")}</Text>
                <Pressable onPress={() => navigateToInfo("vigAnalysis")}>
                  <Text style={styles.consensusLinesInfo}>ⓘ</Text>
                </Pressable>
              </View>

            {marketResult?.marketIntelligence?.vigAnalysis ? (
              params.sport?.includes('soccer') ? (
                // SOCCER: Home Win / Draw / Away Win columns
                <View style={styles.consensusTable}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.teamColumn} />
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelHomeWin")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelDraw")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelAwayWin")}</Text>
                    </View>
                  </View>

                  {/* Sharp Books Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Text style={styles.teamName}>{i18n.t("marketIntelSharpBooks")} 🎯</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.sharpHome ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.sharpHome.toFixed(1)}%` :
                            "5.2%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.sharpDraw ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.sharpDraw.toFixed(1)}%` :
                            "5.8%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.sharpAway ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.sharpAway.toFixed(1)}%` :
                            "5.5%"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* All Books Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Text style={styles.teamName}>{i18n.t("marketIntelAllBooks")} 👥</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.marketHome ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.marketHome.toFixed(1)}%` :
                            "6.4%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.marketDraw ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.marketDraw.toFixed(1)}%` :
                            "7.1%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.marketAway ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.marketAway.toFixed(1)}%` :
                            "6.8%"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                // NFL/NBA: Spread / Moneyline / Total columns
                <View style={styles.consensusTable}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.teamColumn} />
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelSpread")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelMoneyline")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelTotal")}</Text>
                    </View>
                  </View>

                  {/* Sharp Books Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Text style={styles.teamName}>{i18n.t("marketIntelSharpBooks")} 🎯</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.spread?.sharp ?
                            `${marketResult.marketIntelligence.vigAnalysis.spread.sharp.toFixed(1)}%` :
                            "3.1%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.sharp ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.sharp.toFixed(1)}%` :
                            "3.1%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.total?.sharp ?
                            `${marketResult.marketIntelligence.vigAnalysis.total.sharp.toFixed(1)}%` :
                            "3.7%"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* All books Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Text style={styles.teamName}>{i18n.t("marketIntelAllBooks")} 👥</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.spread?.market ?
                            `${marketResult.marketIntelligence.vigAnalysis.spread.market.toFixed(1)}%` :
                            "4.5%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.moneyline?.market ?
                            `${marketResult.marketIntelligence.vigAnalysis.moneyline.market.toFixed(1)}%` :
                            "4.1%"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.vigAnalysis.total?.market ?
                            `${marketResult.marketIntelligence.vigAnalysis.total.market.toFixed(1)}%` :
                            "4.6%"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{i18n.t("marketIntelNoVigAnalysis")}</Text>
              </View>
            )}
            </View>
          </Card>
        </Animated.View>

        {/* Fair Value Card */}
        <Animated.View style={getCardStyle(7)}>
          <Card style={styles.consensusLinesCard}>
            <View style={styles.consensusLinesContent}>
              {/* Header */}
              <View style={styles.consensusLinesHeader}>
                <Text style={styles.consensusLinesTitle}>{i18n.t("marketIntelFairValue")}</Text>
                <Pressable onPress={() => navigateToInfo("fairValue")}>
                  <Text style={styles.consensusLinesInfo}>ⓘ</Text>
                </Pressable>
              </View>

              {marketResult?.marketIntelligence?.fairValue ? (
              params.sport?.includes('soccer') ? (
                // SOCCER: 1 row with Home/Draw/Away fractional odds
                <View style={styles.consensusTable}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.teamColumn} />
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelHomeWin")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelDraw")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelAwayWin")}</Text>
                    </View>
                  </View>

                  {/* Single Fair Value Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Text style={styles.teamName}>{i18n.t("marketIntelFairValueRow")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.fairValue.moneyline?.fairHomeFractional || formatOdds(marketResult.marketIntelligence.fairValue.moneyline?.fairHome)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.fairValue.moneyline?.fairDrawFractional || formatOdds(marketResult.marketIntelligence.fairValue.moneyline?.fairDraw)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {marketResult.marketIntelligence.fairValue.moneyline?.fairAwayFractional || formatOdds(marketResult.marketIntelligence.fairValue.moneyline?.fairAway)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                // NFL/NBA: 2 rows with Spread/ML/Total
                <View style={styles.consensusTable}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.teamColumn} />
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelSpread")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelMoneyline")}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>{i18n.t("marketIntelTotal")}</Text>
                    </View>
                  </View>

                  {/* Team 1 Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Image
                        source={getTeamLogo(params.team1 || "", params.sport)}
                        style={styles.teamLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.teamName}>{getTeamDisplayName(params.team1)}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {formatOdds(marketResult.marketIntelligence.fairValue.spread?.fair1)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {formatOdds(marketResult.marketIntelligence.fairValue.moneyline?.fair1)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {formatOdds(marketResult.marketIntelligence.fairValue.total?.fair1)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Team 2 Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Image
                        source={getTeamLogo(params.team2 || "", params.sport)}
                        style={styles.teamLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.teamName}>{getTeamDisplayName(params.team2)}</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {formatOdds(marketResult.marketIntelligence.fairValue.spread?.fair2)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {formatOdds(marketResult.marketIntelligence.fairValue.moneyline?.fair2)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dataColumn}>
                      <View style={styles.dataCell}>
                        <Text style={styles.dataValue}>
                          {formatOdds(marketResult.marketIntelligence.fairValue.total?.fair2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>{i18n.t("marketIntelNoFairValue")}</Text>
              </View>
            )}
            </View>
          </Card>
        </Animated.View>

        {/* EV+ & Arb Opportunities Card */}
        <Animated.View style={getCardStyle(8)}>
          <Card style={styles.bestLinesCard}>
            <View style={styles.bestLinesContent}>
              {/* Header */}
              <View style={styles.bestLinesHeader}>
                <Text style={styles.bestLinesTitle}>{i18n.t("marketIntelEVOpportunities")}</Text>
                <Pressable onPress={() => navigateToInfo("evOpportunities")}>
                  <Text style={styles.bestLinesInfo}>ⓘ</Text>
                </Pressable>
              </View>

              {/* Dynamic Line Items */}
              {marketResult?.marketIntelligence?.evOpportunities?.opportunities &&
               marketResult.marketIntelligence.evOpportunities.opportunities.length > 0 ? (
                <View style={styles.linesList}>
                  {marketResult.marketIntelligence.evOpportunities.opportunities.map((opportunity, index) => (
                    opportunity.icon === "x" ? (
                      <View key={index} style={styles.lineItem}>
                        <Image
                          source={require("../assets/images/noevopps.png")}
                          style={styles.bookmakerLogo}
                          contentFit="contain"
                        />
                        <View style={styles.lineTextContainer}>
                          <Text style={styles.opportunityBigText}>{opportunity.title}</Text>
                          <Text style={styles.lineSmallText}>{opportunity.description}</Text>
                        </View>
                      </View>
                    ) : (
                      <BookmakerTappable
                        key={index}
                        bookmaker={opportunity.bookmaker}
                        sport={params.sport}
                        onLinkOpened={trackEvOpsTap}
                        style={styles.lineItem}
                      >
                        <Image
                          source={getBookmakerLogo(opportunity.bookmaker)}
                          style={styles.bookmakerLogo}
                          contentFit="contain"
                        />
                        <View style={styles.lineTextContainer}>
                          <Text style={styles.opportunityBigText}>{opportunity.title}</Text>
                          <Text style={styles.lineSmallText}>{opportunity.description}</Text>
                        </View>
                      </BookmakerTappable>
                    )
                  ))}
                </View>
              ) : (
                <View style={styles.linesList}>
                  <View style={styles.lineItem}>
                    <Image
                      source={require("../assets/images/noevopps.png")}
                      style={styles.bookmakerLogo}
                      contentFit="contain"
                    />
                    <View style={styles.lineTextContainer}>
                      <Text style={styles.opportunityBigText}>{i18n.t("marketIntelNoOpportunities")}</Text>
                      <Text style={styles.lineSmallText}>{i18n.t("marketIntelNoEVOpps")}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </Card>
        </Animated.View>

        {/* Get Fresh Odds Button */}
        <View style={styles.buttonContainer}>
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <Pressable
              style={[styles.freshOddsButton, isRefreshing && styles.freshOddsButtonDisabled]}
              onPress={refreshMarketIntelligence}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Text style={styles.freshOddsButtonText}>Refreshing...</Text>
              ) : (
                <>
                  <Ionicons name="refresh" size={16} color={colors.primaryForeground} />
                  <Text style={styles.freshOddsButtonText}>{i18n.t("marketIntelFreshOdds")}</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
          {cooldownMessage && (
            <Text style={styles.cooldownMessage}>{cooldownMessage}</Text>
          )}
        </View>
      </ScrollView>
    );
  };

  // Main render
  return (
    <ScreenBackground hideBg>
      <TopBar onBackPress={() => router.replace("/")} />
      <Animated.View style={[styles.mainContainer, animatedStyle]}>
        {isLoading ? renderShimmer() : renderMarketContent()}
      </Animated.View>

      {/* Floating Bottom Nav */}
      <FloatingBottomNav
        activeTab="market"
        analysisData={{
          team1: params.team1 || marketResult?.teams?.home,
          team2: params.team2 || marketResult?.teams?.away,
          sport: params.sport || marketResult?.sport,
          team1Logo: params.team1Logo,
          team2Logo: params.team2Logo,
          analysisId: params.analysisId,
          isDemo: params.isDemo === "true",
          fromCache: params.fromCache === "true",
          cachedGameId: params.cachedGameId,
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
  contentContainer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: 120, // Extra padding for FloatingBottomNav
  },
  shimmerContainer: {
    width: "100%",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
  },
  shimmerGroup: {
    width: "100%",
    marginBottom: spacing[5],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.rgba.primary20,
    overflow: "hidden",
  },
  gradientContainer: {
    width: "100%",
    padding: spacing[4],
    opacity: 0.6,
    gap: spacing[2],
  },
  shimmerLine: {
    height: 20,
    borderRadius: radii.md,
    marginBottom: 0,
    width: "100%",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing[5],
  },
  errorText: {
    color: colors.destructive,
    fontSize: typography.sizes.base,
    textAlign: "center",
    fontFamily: typography.fontFamily.regular,
  },
  emptyState: {
    padding: spacing[8],
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    textAlign: "center",
    fontFamily: typography.fontFamily.regular,
  },
  topCard: {
    height: 85.87,
  },
  marketHeader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
  },
  marketTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xl,
    color: colors.foreground,
  },
  bestLinesCard: {
    marginTop: spacing[4],
  },
  bestLinesContent: {
    paddingVertical: spacing[4],
    paddingHorizontal: 0,
  },
  bestLinesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[6],
    marginBottom: spacing[5],
  },
  bestLinesTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xl,
    color: colors.foreground,
  },
  bestLinesInfo: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.base,
    color: colors.primary,
  },
  linesList: {
    gap: spacing[3],
  },
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginHorizontal: spacing[4],
    gap: spacing[3],
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  bookmakerLogo: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
  },
  lineTextContainer: {
    flex: 1,
    gap: spacing[1],
  },
  lineBigText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
    color: colors.mutedForeground,
  },
  lineSmallText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xs,
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  consensusLinesCard: {
    marginTop: spacing[4],
  },
  consensusLinesContent: {
    paddingVertical: spacing[5],
    paddingHorizontal: 0,
  },
  consensusLinesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[6],
    marginBottom: spacing[5],
  },
  consensusLinesTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xl,
    color: colors.foreground,
  },
  consensusLinesInfo: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.base,
    color: colors.primary,
  },
  consensusTable: {
    paddingHorizontal: spacing[5],
    gap: spacing[3],
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[1],
  },
  teamColumn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  dataColumn: {
    flex: 0.85,
    alignItems: "center",
  },
  dataCell: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  columnHeaderText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
    flexWrap: "nowrap",
  },
  teamLogo: {
    width: 40,
    height: 40,
  },
  teamName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.foreground,
  },
  dataValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xs,
    color: colors.foreground,
  },
  dataSecondary: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xs,
    color: colors.foreground,
    opacity: 0.5,
  },
  publicSharpCard: {
    marginTop: spacing[4],
  },
  publicSharpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[6],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
  },
  publicSharpTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xl,
    color: colors.foreground,
  },
  publicSharpInfo: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.base,
    color: colors.primary,
  },
  publicSharpContent: {
    flexDirection: "row",
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[5],
    justifyContent: "space-between",
    alignItems: "center",
  },
  publicSharpLeft: {
    flex: 1,
    gap: spacing[3],
  },
  publicSharpRight: {
    marginLeft: spacing[5],
    marginTop: -30,
    marginRight: -10,
  },
  publicSharpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  publicSharpRowBordered: {
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: colors.rgba.primary20,
    paddingVertical: spacing[3],
  },
  publicSharpText: {
    fontFamily: typography.fontFamily.light,
    fontSize: typography.sizes.xs,
    color: colors.foreground,
  },
  marketEfficiencyCard: {
    marginTop: spacing[4],
  },
  marketEfficiencyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[6],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
  },
  marketEfficiencyTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xl,
    color: colors.foreground,
  },
  marketEfficiencyInfo: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.base,
    color: colors.primary,
  },
  marketEfficiencyContent: {
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[5],
    gap: spacing[3],
  },
  progressBarContainer: {
    gap: spacing[2],
  },
  progressBarLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressBarLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    color: colors.foreground,
    opacity: 0.6,
  },
  marketEfficiencyDescription: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.xs,
    color: colors.foreground,
    opacity: 0.8,
  },
  oddsTableCard: {
    marginTop: spacing[4],
  },
  oddsTableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[6],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
  },
  oddsTableTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xl,
    color: colors.foreground,
  },
  oddsTableInfo: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.base,
    color: colors.primary,
  },
  oddsTableContainer: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[5],
  },
  oddsTableHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.rgba.primary20,
  },
  oddsTableColumnHeader: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.foreground,
    flex: 1,
    textAlign: "center",
    paddingVertical: spacing[3],
  },
  oddsTableColumnHeaderCell: {
    borderRightWidth: 0.5,
    borderRightColor: colors.rgba.primary20,
  },
  oddsTableColumnHeaderCellLast: {
    borderRightWidth: 0,
  },
  oddsTableTeamName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.foreground,
    paddingVertical: spacing[3],
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.rgba.primary20,
  },
  oddsTableRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 0.5,
    borderBottomColor: colors.rgba.primary20,
  },
  oddsTableCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRightWidth: 0.5,
    borderRightColor: colors.rgba.primary20,
  },
  oddsTableLogo: {
    width: 30,
    height: 30,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  oddsTableValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.foreground,
  },
  oddsTableMultiValue: {
    gap: spacing[1],
    alignItems: "center",
  },
  oddsTableCellLast: {
    borderRightWidth: 0,
  },
  opportunityLogo: {
    width: 40,
    height: 40,
  },
  opportunityTextContainer: {
    flex: 1,
    gap: spacing[1],
  },
  opportunityBigText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.success,
  },
  opportunitySmallText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
  },
  buttonContainer: {
    alignItems: "center",
    marginTop: spacing[6],
    marginBottom: spacing[5],
  },
  freshOddsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: radii.full,
    minWidth: 160,
  },
  freshOddsButtonDisabled: {
    opacity: 0.6,
  },
  freshOddsButtonText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.sm,
    color: colors.primaryForeground,
  },
  cooldownMessage: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: spacing[2],
    textAlign: "center",
  },
  // Shimmer Styles
  marketTitleShimmer: {
    height: 20,
    borderRadius: radii.sm,
    width: "70%",
  },
  bestLinesTitleShimmer: {
    height: 20,
    borderRadius: radii.sm,
    width: "40%",
  },
  bestLinesInfoShimmer: {
    height: 17,
    borderRadius: radii.sm,
    width: 20,
  },
  lineBigTextShimmer: {
    height: 17,
    borderRadius: radii.sm,
    width: "80%",
  },
  lineSmallTextShimmer: {
    height: 14,
    borderRadius: radii.sm,
    width: "60%",
    marginTop: spacing[1],
  },
  consensusLinesTitleShimmer: {
    height: 20,
    borderRadius: radii.sm,
    width: "50%",
  },
  consensusLinesInfoShimmer: {
    height: 17,
    borderRadius: radii.sm,
    width: 20,
  },
  columnHeaderTextShimmer: {
    height: 11,
    borderRadius: spacing[1],
    width: "80%",
  },
  teamNameShimmer: {
    height: 14,
    borderRadius: radii.sm,
    width: "60%",
    marginTop: spacing[3],
  },
  dataValueShimmer: {
    height: 12,
    borderRadius: spacing[1],
    width: "60%",
  },
  dataSecondaryShimmer: {
    height: 12,
    borderRadius: spacing[1],
    width: "40%",
    marginTop: 2,
    opacity: 0.5,
  },
  publicSharpTitleShimmer: {
    height: 20,
    borderRadius: radii.sm,
    width: "60%",
  },
  publicSharpInfoShimmer: {
    height: 17,
    borderRadius: radii.sm,
    width: 20,
  },
  publicSharpTextShimmer: {
    height: 12,
    borderRadius: radii.sm,
    width: "90%",
  },
  gaugeShimmer: {
    height: 120,
    width: 120,
    borderRadius: 60,
  },
  marketEfficiencyTitleShimmer: {
    height: 20,
    borderRadius: radii.sm,
    width: "50%",
  },
  marketEfficiencyInfoShimmer: {
    height: 17,
    borderRadius: radii.sm,
    width: 20,
  },
  progressBarShimmer: {
    height: 5,
    borderRadius: radii.full,
    width: "100%",
  },
  progressBarLabelShimmer: {
    height: 10,
    borderRadius: spacing[1],
    width: 30,
  },
  marketEfficiencyDescriptionShimmer: {
    height: 12,
    borderRadius: radii.sm,
    width: "85%",
    marginTop: spacing[3],
  },
  oddsTableTitleShimmer: {
    height: 20,
    borderRadius: radii.sm,
    width: "45%",
  },
  oddsTableInfoShimmer: {
    height: 17,
    borderRadius: radii.sm,
    width: 20,
  },
  oddsTableColumnHeaderShimmer: {
    height: 14,
    borderRadius: radii.sm,
    width: "90%",
    marginVertical: spacing[3],
  },
  oddsTableTeamNameShimmer: {
    height: 14,
    borderRadius: radii.sm,
    width: "30%",
    marginVertical: spacing[3],
    marginHorizontal: spacing[4],
  },
  oddsTableValueShimmer: {
    height: 14,
    borderRadius: radii.sm,
    width: "60%",
  },
  freshOddsButtonShimmer: {
    height: 44,
    borderRadius: radii.full,
    width: 176,
  },
});
