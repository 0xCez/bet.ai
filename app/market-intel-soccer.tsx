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
import { shimmerColors } from "../constants/designTokens";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist market data between screen navigation
let cachedMarketResult: SoccerMarketIntelResult | null = null;
let cachedParams: any = null;

// Track page view time
let pageEntryTime: number | null = null;

// Interface for Soccer Market Intelligence - EXACT same structure as NFL but with soccer properties
interface SoccerMarketIntelResult {
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
      consensusHomeML: number;
      consensusDrawML: number;
      consensusAwayML: number;
      consensusHomeMLFractional?: string;
      consensusDrawMLFractional?: string;
      consensusAwayMLFractional?: string;
      bestLines: Array<{
        type: string;
        label: string;
        odds: number;
        bookmaker: string;
        team: string;
      }>;
      rawData: {
        totalMoneylines: number;
      };
    };
    sharpMeter: {
      // Display text (3 sentences) - NEW FORMAT
      line1: string;
      line2: string;
      line3: string;

      // Gauge data
      gaugeValue: number;
      gaugeLabel: string;

      // Backend calculation data (Soccer-specific)
      homeDiff: number;
      drawDiff: number;
      awayDiff: number;
      avgSharpHome: number;
      avgPublicHome: number;
      avgSharpDraw: number;
      avgPublicDraw: number;
      avgSharpAway: number;
      avgPublicAway: number;
      sharpVig: number;
      publicVig: number;
      vigGap: number;
      confidenceLevel: string;
      dataQuality: string;

      // Metadata
      sharpBookCount: number;
      publicBookCount: number;
      biggestEdgeOutcome: string;
    };
    vigAnalysis: {
      moneyline: {
        sharp: number;
        market: number;
      };
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
    fairValue: {
      moneyline: {
        fairHome: number;
        fairDraw: number;
        fairAway: number;
      };
    };
    marketTightness: {
      tightness: string;
      priceRange: number;
      comment: string;
      summary: string;
    };
    oddsTable: Array<{
      bookmaker: string;
      bookmakerKey: string;
      isSharp: boolean;
      odds: {
        moneyline: {
          home: number;
          draw: number;
          away: number;
        };
      };
    }>;
  };
  teamStats: any;
  timestamp: string;
  teamIds: { team1Id: number; team2Id: number };
}

type SoccerMarketIntelParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
};

// Helper function to get bookmaker logo - EXACT same as NFL
function getBookmakerLogo(bookmakerName?: string) {
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
    'Fanatics': require("../assets/images/fanatics.png"),
    'Bally Bet': require("../assets/images/Ballybet.png"),
    'Hard Rock Bet': require("../assets/images/Hardrockbet.png"),
  };

  return logoMap[bookmakerName] || require("../assets/images/logo.png");
}

// Helper function to format decimal odds
function formatOdds(decimalOdds?: number): string {
  if (!decimalOdds) return "N/A";
  return decimalOdds.toFixed(2);
}

// Helper function to get team display name
function getTeamDisplayName(teamName?: string): string {
  if (!teamName) return "Team";
  return teamName.length > 12 ? teamName.substring(0, 12) + "..." : teamName;
}

export default function SoccerMarketIntelScreen() {
  const params = useLocalSearchParams<SoccerMarketIntelParams>();
  const { isSubscribed } = useRevenueCatPurchases();
  const posthog = usePostHog();
  const { animatedStyle } = usePageTransition(false);

  // Track page view time - EXACT same as NFL
  useEffect(() => {
    if (!auth.currentUser) return;

    pageEntryTime = Date.now();

    posthog?.capture("soccer_market_intel_page_viewed", {
      userId: (auth.currentUser as any)?.uid,
      sport: params.sport,
      teams: `${params.team1} vs ${params.team2}`,
    });

    return () => {
      if (pageEntryTime && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTime;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture("soccer_market_intel_page_exit", {
          userId: (auth.currentUser as any)?.uid,
          sport: params.sport,
          teams: `${params.team1} vs ${params.team2}`,
          timeSpentSeconds: timeSpentSeconds,
          timeSpentMinutes: Math.round((timeSpentSeconds / 60) * 10) / 10,
        });

        pageEntryTime = null;
      }
    };
  }, [params.team1, params.team2, params.sport]);

  // Check if we're navigating with the same params - EXACT same as NFL
  const isSameAnalysis =
    cachedParams?.team1 === params.team1 &&
    cachedParams?.team2 === params.team2 &&
    cachedParams?.sport === params.sport;

  // Cache params for future comparison
  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const team1 = params.team1;
  const team2 = params.team2;
  const sport = params.sport;

  const hasInitializedRef = React.useRef(false);

  // Initialize state, potentially from cache - EXACT same as NFL
  const [isLoading, setIsLoading] = useState(
    !isSameAnalysis || !cachedMarketResult
  );
  const [marketResult, setMarketResult] = useState<SoccerMarketIntelResult | null>(
    isSameAnalysis && cachedMarketResult ? cachedMarketResult : null
  );
  const [error, setError] = useState<string | null>(null);

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

    if (team1 && team2 && sport) {
      console.log(
        `Soccer Market Intel Flow: Starting analysis for ${sport}: ${team1} vs ${team2}`
      );
      getMarketIntelligence();
    } else {
      console.error("Error: Missing required parameters (team1, team2, sport).");
      setError("Missing game data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [team1, team2, sport, auth.currentUser, isSameAnalysis]);

  // Main function to fetch market intelligence data - EXACT same as NFL
  const getMarketIntelligence = async () => {
    if (marketResult) return;
    setIsLoading(true);
    setError(null);

    try {
      console.log("Fetching soccer market intelligence data...");

      if (!sport) {
        throw new Error("Sport parameter is required but missing");
      }

      const response = await APIService.getMarketIntelligence(
        sport,
        team1 || "",
        team2 || ""
      );

      console.log("Soccer Market Intelligence Response:", response);

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.status === "error") {
        throw new Error(response.message || "Failed to fetch soccer market intelligence");
      }

      const marketData: SoccerMarketIntelResult = response;

      setMarketResult(marketData);
      cachedMarketResult = marketData;

    } catch (err) {
      console.error("Error in getSoccerMarketIntelligence:", err);
      setError(
        err instanceof Error ? err.message : "Failed to get soccer market intelligence"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Shimmer rendering - EXACT same as NFL
  const renderShimmer = () => (
    <View style={styles.shimmerContainer}>
      <View style={styles.shimmerGroup}>
        <LinearGradient
          colors={["#1A1A1A", "#363636"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientContainer}
        >
          <ShimmerPlaceholder
            style={styles.shimmerLine}
            shimmerColors={shimmerColors}
          />
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "100%" }]}
            shimmerColors={shimmerColors}
          />
        </LinearGradient>
      </View>
    </View>
  );

  // Main content rendering - Adapted for soccer
  const renderSoccerMarketContent = () => {
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
        {/* Best Lines Card - Soccer: Home/Draw/Away */}
        <View style={[styles.card, styles.bestLinesCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Best Lines 💰</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.bestLinesContent}>
            {/* 1. Home ML */}
            <View style={styles.bestLineItem}>
              <Image
                source={getBookmakerLogo(marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Home ML")?.bookmaker)}
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-home-ml" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team1?.split(' ').pop()} {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Home to Win")?.fractionalOdds || marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Home ML")?.fractionalOdds || "1/1"} to win
                </BlurText>
                <BlurText card="best-home-ml-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available odds at {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Home ML")?.bookmaker || "Pinnacle"}
                </BlurText>
              </View>
            </View>

            {/* 2. Draw ML */}
            <View style={styles.bestLineItem}>
              <Image
                source={getBookmakerLogo(marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Draw ML")?.bookmaker)}
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-draw-ml" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  Draw {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Draw" || line.label === "Best Draw ML")?.fractionalOdds || "4/1"}
                </BlurText>
                <BlurText card="best-draw-ml-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available draw odds at {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Draw" || line.label === "Best Draw ML")?.bookmaker || "Fanatics"}
                </BlurText>
              </View>
            </View>

            {/* 3. Away ML */}
            <View style={styles.bestLineItem}>
              <Image
                source={getBookmakerLogo(marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Away to Win" || line.label === "Best Away ML")?.bookmaker)}
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-away-ml" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team2?.split(' ').pop()} {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Away to Win" || line.label === "Best Away ML")?.fractionalOdds || "7/1"} to win
                </BlurText>
                <BlurText card="best-away-ml-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available odds at {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.label === "Best Away to Win" || line.label === "Best Away ML")?.bookmaker || "FanDuel"}
                </BlurText>
              </View>
            </View>
          </View>
        </View>

        {/* Consensus Lines Card - Soccer: Home/Draw/Away */}
        <View style={[styles.card, styles.consensusLinesCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Consensus Lines 📊</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.consensusLinesContent}>
            {/* Header Row */}
            <View style={styles.consensusHeaderRow}>
              <View style={styles.consensusHeaderSpacer} />
              <Text style={styles.consensusHeaderText}>Home</Text>
              <Text style={styles.consensusHeaderText}>Draw</Text>
              <Text style={styles.consensusHeaderText}>Away</Text>
            </View>

             {/* Match Winner Row */}
             <View style={styles.consensusTeamRow}>
               <View style={styles.consensusTeamInfo}>
                 <View style={styles.consensusTeamLogo} />
                 <Text style={styles.consensusTeamName}>
                   Match Winner
                 </Text>
               </View>
               <View style={styles.consensusOddsContainer}>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-home" blur={!auth.currentUser} style={styles.consensusOdds}>
                     {marketResult?.marketIntelligence?.bestLines?.consensusHomeMLFractional || "1/1"}
                   </BlurText>
                 </View>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-draw" blur={!auth.currentUser} style={styles.consensusOdds}>
                     {marketResult?.marketIntelligence?.bestLines?.consensusDrawMLFractional || "4/1"}
                   </BlurText>
                 </View>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-away" blur={!auth.currentUser} style={styles.consensusOdds}>
                     {marketResult?.marketIntelligence?.bestLines?.consensusAwayMLFractional || "7/1"}
                   </BlurText>
                 </View>
               </View>
             </View>
          </View>
        </View>

        {/* Sharp Meter Card - Soccer 3-Way Analysis */}
        <View style={[styles.card, styles.sharpMeterCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Public vs Sharp Meter 🌡️</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.sharpMeterContent}>
            <View style={styles.sharpMeterContainer}>
              {/* Left Side - Text Information (NEW FORMAT: 3 sentences) */}
              <View style={styles.sharpMeterTextSection}>
                {/* Line 1: Primary Signal */}
                <BlurText card="sharp-line-1" blur={!auth.currentUser} style={styles.sharpMeterLineText}>
                  {marketResult?.marketIntelligence?.sharpMeter?.line1 || "No clear sharp lean"}
                </BlurText>

                {/* Line 2: Secondary Signal */}
                <BlurText card="sharp-line-2" blur={!auth.currentUser} style={styles.sharpMeterLineText}>
                  {marketResult?.marketIntelligence?.sharpMeter?.line2 || "Limited data"}
                </BlurText>

                {/* Line 3: Detail Line */}
                <BlurText card="sharp-line-3" blur={!auth.currentUser} style={styles.sharpMeterLineText}>
                  {marketResult?.marketIntelligence?.sharpMeter?.line3 || "No comparison available"}
                </BlurText>
              </View>

              {/* Right Side - Circular Gauge (NEW FORMAT: shows gauge value) */}
              <View style={styles.sharpMeterGaugeSection}>
                <View style={styles.sharpMeterCircle}>
                  <BlurText card="sharp-gauge-value" blur={!auth.currentUser} style={styles.sharpMeterGaugeText}>
                    {marketResult?.marketIntelligence?.sharpMeter?.gaugeValue || "50"}
                  </BlurText>
                  <BlurText card="sharp-gauge-label" blur={!auth.currentUser} style={styles.sharpMeterGaugeSubtext}>
                    {marketResult?.marketIntelligence?.sharpMeter?.gaugeLabel || "MED"}
                  </BlurText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Fair Value Card - Soccer: Home/Draw/Away */}
        <View style={[styles.card, styles.fairValueCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Fair Value ⚖️</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.fairValueContent}>
            {/* Home */}
            <View style={styles.fairValueTeamRow}>
              <View style={styles.fairValueTeamInfo}>
                <View style={styles.fairValueTeamLogo} />
                <Text style={styles.fairValueTeamName}>Home</Text>
              </View>
              <View style={styles.fairValueOddsContainer}>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-home" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {formatOdds(marketResult?.marketIntelligence?.fairValue?.moneyline?.fairHome)}
                  </BlurText>
                </View>
              </View>
            </View>

            {/* Draw */}
            <View style={styles.fairValueTeamRow}>
              <View style={styles.fairValueTeamInfo}>
                <View style={styles.fairValueTeamLogo} />
                <Text style={styles.fairValueTeamName}>Draw</Text>
              </View>
              <View style={styles.fairValueOddsContainer}>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-draw" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {formatOdds(marketResult?.marketIntelligence?.fairValue?.moneyline?.fairDraw)}
                  </BlurText>
                </View>
              </View>
            </View>

            {/* Away */}
            <View style={styles.fairValueTeamRow}>
              <View style={styles.fairValueTeamInfo}>
                <View style={styles.fairValueTeamLogo} />
                <Text style={styles.fairValueTeamName}>Away</Text>
              </View>
              <View style={styles.fairValueOddsContainer}>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-away" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {formatOdds(marketResult?.marketIntelligence?.fairValue?.moneyline?.fairAway)}
                  </BlurText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Vig Analysis Card - Soccer version */}
        <View style={[styles.card, styles.vigAnalysisCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Vig Analysis 🧃</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.vigAnalysisContent}>
            {/* Header Row - Match Consensus Lines layout */}
            <View style={styles.vigHeaderRow}>
              <View style={styles.vigHeaderSpacer} />
              <Text style={styles.vigHeaderText}>Home ML</Text>
              <Text style={styles.vigHeaderText}>Draw</Text>
              <Text style={styles.vigHeaderText}>Away ML</Text>
            </View>

            {/* Sharp Books Row - Match team row layout */}
            <View style={styles.vigTeamRow}>
              <View style={styles.vigTeamInfo}>
                <Text style={styles.vigTeamIcon}>🎯</Text>
                <Text style={styles.vigTeamName}>Sharp Books</Text>
              </View>
              <View style={styles.vigOddsContainer}>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-sharp-home" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.sharp?.toFixed(1) || "5.8"}%
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-sharp-draw" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.sharp?.toFixed(1) || "5.8"}%
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-sharp-away" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.sharp?.toFixed(1) || "5.8"}%
                  </BlurText>
                </View>
              </View>
            </View>

            {/* All Books Row - Match team row layout */}
            <View style={styles.vigTeamRow}>
              <View style={styles.vigTeamInfo}>
                <Text style={styles.vigTeamIcon}>👥</Text>
                <Text style={styles.vigTeamName}>All Books</Text>
              </View>
              <View style={styles.vigOddsContainer}>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-market-home" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.market?.toFixed(1) || "6.2"}%
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-market-draw" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.market?.toFixed(1) || "6.2"}%
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-market-away" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.market?.toFixed(1) || "6.2"}%
                  </BlurText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* EV+ & Arb Opportunities Card - Soccer version */}
        <View style={[styles.card, styles.evOpportunitiesCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>EV+ & Arb Opportunities 💸</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.evOpportunitiesContent}>
            <SoccerEVSection marketData={marketResult} params={params} />
          </View>
        </View>

        {/* Odds Table Card - Soccer: Home/Draw/Away columns */}
        <View style={[styles.card, styles.oddsTableCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Odds Table 🔎</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.oddsTableContent}>
            {/* Header Row */}
            <View style={styles.oddsTableHeaderRow}>
              <Text style={styles.oddsTableHeaderText}>Bookmaker</Text>
              <Text style={styles.oddsTableHeaderText}>Home</Text>
              <Text style={styles.oddsTableHeaderText}>Draw</Text>
              <Text style={styles.oddsTableHeaderText}>Away</Text>
            </View>

            {/* Bookmaker Rows */}
            {(marketResult?.marketIntelligence?.oddsTable || []).map((bookmaker, index) => (
              <View key={index} style={styles.oddsTableRow}>
                <View style={styles.oddsTableCell}>
                  <Image source={getBookmakerLogo(bookmaker.bookmaker)} style={styles.oddsTableBookmakerLogo} />
                  <Text style={styles.oddsTableBookmakerName}>{bookmaker.bookmaker}</Text>
                </View>
                <View style={styles.oddsTableCell}>
                  <BlurText card={`odds-home-${index}`} blur={!auth.currentUser} style={styles.oddsTableOdds}>
                    {formatOdds(bookmaker.odds?.moneyline?.home)}
                  </BlurText>
                </View>
                <View style={styles.oddsTableCell}>
                  <BlurText card={`odds-draw-${index}`} blur={!auth.currentUser} style={styles.oddsTableOdds}>
                    {formatOdds(bookmaker.odds?.moneyline?.draw)}
                  </BlurText>
                </View>
                <View style={styles.oddsTableCell}>
                  <BlurText card={`odds-away-${index}`} blur={!auth.currentUser} style={styles.oddsTableOdds}>
                    {formatOdds(bookmaker.odds?.moneyline?.away)}
                  </BlurText>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.debateContainer}>
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
            onPress={getMarketIntelligence}
            style={{ marginTop: 16 }}
          >
            <Text style={styles.buttonText}>Get Fresh Odds ⚽</Text>
          </GradientButton>
        </View>
      </ScrollView>
    );
  };

  // Main render - EXACT same structure as NFL
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
            {isLoading ? renderShimmer() : renderSoccerMarketContent()}
          </View>
        </Animated.ScrollView>

        {/* Floating Bottom Navigation */}
        <FloatingBottomNav
          activeTab="market"
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

// Soccer EV Section Component
const SoccerEVSection: React.FC<{
  marketData: SoccerMarketIntelResult | null;
  params: SoccerMarketIntelParams;
}> = ({ marketData, params }) => {
  const opportunities = marketData?.marketIntelligence?.evOpportunities?.opportunities || [];

  if (opportunities.length === 0 || !marketData?.marketIntelligence?.evOpportunities?.hasOpportunities) {
    return (
      <View style={evStyles.evArbContainer}>
        <View style={evStyles.noEvArbItem}>
          <Image
            source={require("../assets/images/noevopps.png")}
            style={evStyles.noEvIcon}
          />
          <View style={evStyles.noEvInfo}>
            <BlurText card="no-ev-title" blur={!auth.currentUser} style={evStyles.noEvTitle}>
              Market efficiently priced
            </BlurText>
            <BlurText card="no-ev-desc" blur={!auth.currentUser} style={evStyles.noEvDescription}>
              No +EV or Arb opportunities found
            </BlurText>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={evStyles.evArbContainer}>
      {opportunities.map((opportunity, index) => (
        <View key={index} style={evStyles.opportunityItem}>
          <Image
            source={getBookmakerLogo(opportunity.bookmaker)}
            style={evStyles.bookmakerLogo}
          />
          <View style={evStyles.opportunityInfo}>
            <BlurText card={`ev-title-${index}`} blur={!auth.currentUser} style={evStyles.opportunityTitle}>
              {opportunity.title}
            </BlurText>
            <BlurText card={`ev-desc-${index}`} blur={!auth.currentUser} style={evStyles.opportunityDescription}>
              {opportunity.description}
            </BlurText>
          </View>
        </View>
      ))}
    </View>
  );
};

// Styles - EXACT same as NFL
const styles = StyleSheet.create({
  debateContainer: {
    marginBottom: 0,
  },
  buttonText: {
    fontSize: 20,
    color: "#FFFFFF",
    fontFamily: "Aeonik-Medium",
  },
  container: {
    flex: 1,
    paddingBottom: 0,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 120,
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
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#424242",
    fontSize: 16,
    marginTop: 30,
    textAlign: "center",
    fontFamily: "Aeonik-Regular",
  },
  card: {
    backgroundColor: "#101010",
    borderWidth: 0.2,
    borderColor: "#505050",
    borderRadius: 12,
    padding: 15,
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
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Aeonik-Medium",
  },
  infoIcon: {
    fontSize: 20,
    color: "#00c2e0",
  },
  bestLinesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    borderColor: "#212121",
    padding: 20,
  },
  bestLinesContent: {
    gap: 20,
  },
  bestLineItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
  },
  bestLineBookmakerLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
  },
  bestLineTextSection: {
    flex: 1,
    justifyContent: "center",
  },
  bestLineMainText: {
    fontSize: 16,
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    lineHeight: 22,
    marginBottom: 8,
  },
  bestLineDescription: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Aeonik-Light",
    opacity: 0.7,
    lineHeight: 18,
  },
  consensusLinesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    padding: 20,
  },
  consensusLinesContent: {
    gap: 15,
  },
  consensusHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  consensusHeaderSpacer: {
    flex: 1,
  },
  consensusHeaderText: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    flex: 1,
    textAlign: "center",
  },
  consensusTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
  },
  consensusTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  consensusTeamLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333333",
    marginRight: 12,
  },
  consensusTeamName: {
    fontSize: 16,
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  consensusOddsContainer: {
    flexDirection: "row",
    flex: 1,
    justifyContent: "flex-end",
  },
  consensusOddsBox: {
    backgroundColor: "#161616",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#212121",
    width: 66,
    height: 66,
    justifyContent: "center",
    alignItems: "center",
  },
  consensusOdds: {
    fontSize: 14,
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  sharpMeterCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    padding: 20,
  },
  sharpMeterContent: {
    height: 324,
  },
  sharpMeterContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  sharpMeterTextSection: {
    flex: 1,
    height: "100%",
    justifyContent: "space-between",
  },
  sharpMeterPrimaryText: {
    fontSize: 16,
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterSecondaryText: {
    fontSize: 16,
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterDetailText: {
    fontSize: 16,
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterGaugeSection: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 20,
  },
  sharpMeterCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#00c2e0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 194, 224, 0.1)",
  },
  sharpMeterGaugeText: {
    fontSize: 24,
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    marginBottom: 8,
  },
  sharpMeterGaugeSubtext: {
    fontSize: 12,
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 16,
  },
  // Sharp Meter NEW FORMAT - 3 line text style
  sharpMeterLineText: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    marginBottom: 8,
    lineHeight: 20,
  },
  fairValueCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    padding: 20,
  },
  fairValueContent: {
    gap: 15,
  },
  fairValueTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
  },
  fairValueTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  fairValueTeamLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333333",
    marginRight: 12,
  },
  fairValueTeamName: {
    fontSize: 16,
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  fairValueOddsContainer: {
    flexDirection: "row",
    flex: 1,
    justifyContent: "flex-end",
  },
  fairValueOddsBox: {
    backgroundColor: "#161616",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#212121",
    width: 66,
    height: 66,
    justifyContent: "center",
    alignItems: "center",
  },
  fairValueOdds: {
    fontSize: 14,
    fontFamily: "Aeonik-Medium",
    color: "#FF9500",
  },
  vigAnalysisCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    padding: 20,
  },
  vigAnalysisContent: {
    gap: 15,
  },
  vigHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  vigHeaderSpacer: {
    flex: 1,
  },
  vigHeaderText: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    flex: 1,
    textAlign: "center",
  },
  vigTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  vigTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  vigTeamIcon: {
    fontSize: 16,
    marginRight: 8,
    width: 24,
    textAlign: "center",
  },
  vigTeamName: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    minWidth: 60,
  },
  vigOddsContainer: {
    flexDirection: "row",
    flex: 2,
  },
  vigOddsBox: {
    flex: 1,
    alignItems: "center",
  },
  vigOdds: {
    fontSize: 14,
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  evOpportunitiesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    padding: 20,
  },
  evOpportunitiesContent: {
    gap: 24,
  },
  oddsTableCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40,
    padding: 20,
  },
  oddsTableContent: {
    gap: 0,
  },
  oddsTableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  oddsTableHeaderText: {
    fontSize: 14,
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    textAlign: "center",
    flex: 1,
  },
  oddsTableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
    minHeight: 50,
  },
  oddsTableCell: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  oddsTableBookmakerLogo: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  oddsTableBookmakerName: {
    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    textAlign: "center",
  },
  oddsTableOdds: {
    fontSize: 14,
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  floatingButton: {
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    padding: 10,
  },
});

// EV Section Styles - EXACT same as NFL
const evStyles = StyleSheet.create({
  evArbContainer: {
    gap: 15,
  },
  noEvArbItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
  },
  noEvIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  noEvInfo: {
    flex: 1,
  },
  noEvTitle: {
    fontSize: 16,
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  noEvDescription: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    color: "#888888",
  },
  opportunityItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
  },
  bookmakerLogo: {
    width: 24,
    height: 24,
    marginRight: 12,
  },
  opportunityInfo: {
    flex: 1,
  },
  opportunityTitle: {
    fontSize: 16,
    fontFamily: "Aeonik-Bold",
    color: "#00ff41",
    marginBottom: 4,
  },
  opportunityDescription: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
  },
});
