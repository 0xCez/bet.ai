import React, { useState, useEffect } from "react";
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  Text,
  ViewStyle,
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
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { usePostHog } from "posthog-react-native";
import i18n from "../i18n";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Static variables to persist market data between screen navigation
let cachedMarketResult: MarketIntelResult | null = null;
let cachedDisplayImageUrl: string | null = null;
let cachedParams: any = null;

// Track page view time
let pageEntryTime: number | null = null;

// Interface matching the EXACT backend output structure
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
      rawData: {
        totalSpreads: number;
        totalMoneylines: number;
        totalTotals: number;
      };
    };
    sharpMeter: {
      primarySignal: string;
      secondarySignal: string;
      detailLine: string;
      gaugeValue: number;
      pointGap: number;
      sharpLean: string;
      avgSharpSpread: number;
      avgPublicSpread: number;
      dataQuality: string;
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
      marketsCount?: number;
      isSharp?: boolean;
      odds?: {
        moneyline?: {
          home?: number;
          away?: number;
        };
        spread?: {
          home?: {
            point?: number;
            price?: number;
          };
          away?: {
            point?: number;
            price?: number;
          };
        };
        total?: {
          over?: {
            point?: number;
            price?: number;
          };
          under?: {
            point?: number;
            price?: number;
          };
        };
      };
    }>;
  };
  teamStats: any;
  timestamp: string;
  teamIds: { team1Id: number; team2Id: number };
}

type MarketIntelParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1_code?: string;
  team2_code?: string;
  team1Logo?: string;
  team2Logo?: string;
};

// Helper function to get bookmaker logo
function getBookmakerLogo(bookmakerName?: string) {
  if (!bookmakerName) return require("../assets/images/logo.png"); // Use logo.png as fallback

  const logoMap: { [key: string]: any } = {
    'DraftKings': require("../assets/images/Draftkings.png"), // Match exact filename
    'FanDuel': require("../assets/images/Fanduel.png"), // Match exact filename
    'BetMGM': require("../assets/images/Betmgm.png"), // Match exact filename
    'Pinnacle': require("../assets/images/Pinaccle.png"), // Use existing typo filename
    'BetUS': require("../assets/images/Betus.png"), // Match exact filename
    'BetRivers': require("../assets/images/Betrivers.png"), // Match exact filename
    'Bovada': require("../assets/images/Bovada.png"), // Match exact filename
    'MyBookie.ag': require("../assets/images/mybookie.png"),
    'ESPN BET': require("../assets/images/Espnbet.png"), // Match exact filename
    'Caesars': require("../assets/images/Caesars.png"), // Match exact filename
    'LowVig.ag': require("../assets/images/logo.png"), // Use logo.png as fallback (lowvig.png missing)
    'BetOnline.ag': require("../assets/images/Betonline.png"), // Match exact filename
    'Fanatics': require("../assets/images/fanatics.png"), // Match exact filename
    'Bally Bet': require("../assets/images/Ballybet.png"), // Match exact filename
    'Hard Rock Bet': require("../assets/images/Hardrockbet.png"), // Match exact filename
  };

  return logoMap[bookmakerName] || require("../assets/images/logo.png"); // Use logo.png as fallback
}

// Helper function to format decimal odds to American odds
function formatOdds(decimalOdds?: number): string {
  if (!decimalOdds) return "-110";

  if (decimalOdds >= 2.0) {
    return `+${Math.round((decimalOdds - 1) * 100)}`;
  } else {
    return `-${Math.round(100 / (decimalOdds - 1))}`;
  }
}

// Helper functions to extract lowest vig data from EXISTING calculations
function getLowestVigSpreadBook(marketResult: MarketIntelResult | null): string {
  const spreadOpportunity = marketResult?.marketIntelligence?.evOpportunities?.opportunities?.find(
    opp => opp.type === "lowvig" && opp.title?.includes("Spread")
  );
  return spreadOpportunity?.bookmaker || "LowVig.ag";
}

function getLowestVigSpreadVig(marketResult: MarketIntelResult | null): string {
  const spreadOpportunity = marketResult?.marketIntelligence?.evOpportunities?.opportunities?.find(
    opp => opp.type === "lowvig" && opp.title?.includes("Spread")
  );
  return spreadOpportunity?.vig?.toFixed(1) || "2.3";
}

// Helper function to get team logo from SVG files
function getTeamLogo(teamName?: string) {
  if (!teamName) return require("../assets/images/logo.png"); // Use logo.png as fallback

  // Convert team name to file format (replace spaces with underscores)
  const fileName = teamName.replace(/\s+/g, '_');

  try {
    // Try to load the SVG file
    return { uri: `../assets/images/${fileName}.svg` };
  } catch {
    // Fallback to generic logo if team logo not found
    return require("../assets/images/logo.png"); // Use logo.png as fallback
  }
}

// Helper function to get team display name for Consensus Lines
function getTeamDisplayName(teamName?: string): string {
  if (!teamName) return "Team";

  // Special cases for Figma layout
  if (teamName.includes('Washington')) return 'WAS Wizards';
  if (teamName.includes('Philadelphia')) return '76ers';
  if (teamName.includes('New Orleans')) return 'Saints';
  if (teamName.includes('New York') && teamName.includes('Giants')) return 'Giants';

  // Default: return last word (team nickname)
  return teamName.split(' ').pop() || teamName;
}

export default function MarketIntelScreen() {
  const params = useLocalSearchParams<MarketIntelParams>();
  const { isSubscribed } = useRevenueCatPurchases();
  const posthog = usePostHog();

  // Track page view time
  useEffect(() => {
    if (!auth.currentUser) return;

    pageEntryTime = Date.now();

    posthog?.capture("market_intel_page_viewed", {
      userId: (auth.currentUser as any)?.uid,
      sport: params.sport,
      teams: `${params.team1} vs ${params.team2}`,
    });

    return () => {
      if (pageEntryTime && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTime;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture("market_intel_page_exit", {
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

  // Check if we're navigating with the same params
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

  // Initialize state, potentially from cache
  const [isLoading, setIsLoading] = useState(
    !isSameAnalysis || !cachedMarketResult
  );
  const [marketResult, setMarketResult] = useState<MarketIntelResult | null>(
    isSameAnalysis && cachedMarketResult ? cachedMarketResult : null
  );
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(
    isSameAnalysis && cachedDisplayImageUrl ? cachedDisplayImageUrl : null
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
      cachedDisplayImageUrl = null;
    }

    if (team1 && team2 && sport) {
      console.log(
        `Market Intel Flow: Starting analysis for ${sport}: ${team1} vs ${team2}`
      );
      getMarketIntelligence();
    } else {
      console.error("Error: Missing required parameters (team1, team2, sport).");
      setError("Missing game data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [team1, team2, sport, auth.currentUser, isSameAnalysis]);

  // Main function to fetch market intelligence data
  const getMarketIntelligence = async () => {
    if (marketResult) return;
    setIsLoading(true);
    setError(null);
    setDisplayImageUrl(null);

    try {
      console.log("Fetching market intelligence data...");

      // Set display image URL from params
      if (params.team1Logo) {
        setDisplayImageUrl(params.team1Logo);
        cachedDisplayImageUrl = params.team1Logo;
      }

      if (!sport) {
        throw new Error("Sport parameter is required but missing");
      }

      const response = await APIService.getMarketIntelligence(
        sport,
        team1 || "",
        team2 || "",
        params.team1_code,
        params.team2_code
      );

      console.log("Market Intelligence Response:", response);

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
      setError(
        err instanceof Error ? err.message : "Failed to get market intelligence"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Shimmer rendering
  const renderShimmer = () => (
    <View style={styles.shimmerContainer}>
      <View style={styles.imageContainer}>
        {displayImageUrl ? (
          <Image
            source={{ uri: displayImageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholderImage} />
        )}
      </View>

      {/* Content Shimmer Groups */}
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
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "100%" }]}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </LinearGradient>
      </View>
    </View>
  );

  // Main content rendering
  const renderMarketContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.imageContainer}>
            {displayImageUrl ? (
              <Image
                source={{ uri: displayImageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            ) : (
              <View></View>
            )}
          </View>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.analysisContent}
      >
        {/* Image Container - REMOVED as requested */}

        {/* Best Lines Card - EXACT Figma structure: 6 vertical items */}
        <View style={[styles.card, styles.bestLinesCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Best Lines 💰</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.bestLinesContent}>
            {/* 1. ML Home Team */}
            <View style={styles.bestLineItem}>
              <Image
                source={getBookmakerLogo(marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Home ML")?.bookmaker)}
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-home-ml" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Home ML")?.team?.split(' ').pop() || params.team1?.split(' ').pop()} ML at {formatOdds(marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Home ML")?.odds || 1.77)}
                </BlurText>
                <BlurText card="best-home-ml-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available ML at {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Home ML")?.bookmaker || "BetUS"}
                </BlurText>
              </View>
            </View>

            {/* 2. ML Away Team */}
            <View style={styles.bestLineItem}>
              <Image
                source={getBookmakerLogo(marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Away ML")?.bookmaker)}
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-away-ml" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Away ML")?.team?.split(' ').pop() || params.team2?.split(' ').pop()} ML at {formatOdds(marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Away ML")?.odds || 1.97)}
                </BlurText>
                <BlurText card="best-away-ml-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available ML at {marketResult?.marketIntelligence?.bestLines?.bestLines?.find(line => line.type === "moneyline" && line.label === "Best Away ML")?.bookmaker || "BetRivers"}
                </BlurText>
              </View>
            </View>

            {/* 3. Spread Home Team - CONSENSUS + LOWEST VIG */}
            <View style={styles.bestLineItem}>
              <Image
                source={getBookmakerLogo(getLowestVigSpreadBook(marketResult))}
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-home-spread" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team1?.split(' ').pop()} {marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || "-2.5"} at -105
                </BlurText>
                <BlurText card="best-home-spread-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Consensus spread with lowest vig ({getLowestVigSpreadVig(marketResult)}%)
                </BlurText>
              </View>
            </View>

            {/* 4. Spread Away Team - CONSENSUS + LOWEST VIG */}
            <View style={styles.bestLineItem}>
              <Image
                source={getBookmakerLogo(getLowestVigSpreadBook(marketResult))}
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-away-spread" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team2?.split(' ').pop()} +{Math.abs(marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || -2.5)} at -105
                </BlurText>
                <BlurText card="best-away-spread-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Consensus spread with lowest vig ({getLowestVigSpreadVig(marketResult)}%)
                </BlurText>
              </View>
            </View>

            {/* 5. Best Over - CONSENSUS + LOWEST VIG */}
            <View style={styles.bestLineItem}>
              <Image
                source={require("../assets/images/logo.png")} // Use logo.png as Over icon fallback
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-over" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  Over {marketResult?.marketIntelligence?.bestLines?.consensusTotal || "47"} -102
                </BlurText>
                <BlurText card="best-over-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Consensus total with lowest vig
                </BlurText>
              </View>
            </View>

            {/* 6. Best Under - CONSENSUS + LOWEST VIG */}
            <View style={styles.bestLineItem}>
              <Image
                source={require("../assets/images/logo.png")} // Use logo.png as Under icon fallback
                style={styles.bestLineBookmakerLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-under" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  Under {(marketResult?.marketIntelligence?.bestLines?.consensusTotal || 47) + 0.5} -106
                </BlurText>
                <BlurText card="best-under-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Consensus total with lowest vig
                </BlurText>
              </View>
            </View>
          </View>
        </View>

        {/* Consensus Lines Card */}
        <View style={[styles.card, styles.consensusLinesCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Consensus Lines 📊</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.consensusLinesContent}>
            {/* Header Row */}
            <View style={styles.consensusHeaderRow}>
              <View style={styles.consensusHeaderSpacer} />
              <Text style={styles.consensusHeaderText}>Spread</Text>
              <Text style={styles.consensusHeaderText}>Moneyline</Text>
              <Text style={styles.consensusHeaderText}>Total</Text>
            </View>

             {/* Team 1 Row */}
             <View style={styles.consensusTeamRow}>
               <View style={styles.consensusTeamInfo}>
                 <Image
                   source={getTeamLogo(params.team1)}
                   style={styles.consensusTeamLogo}
                 />
                 <Text style={styles.consensusTeamName}>
                   {getTeamDisplayName(params.team1)}
                 </Text>
               </View>
               <View style={styles.consensusOddsContainer}>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-spread-1" blur={!auth.currentUser} style={styles.consensusOdds}>
                     {marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || "-2"}
                   </BlurText>
                   <BlurText card="consensus-spread-juice-1" blur={!auth.currentUser} style={styles.consensusJuice}>
                     -105
                   </BlurText>
                 </View>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-ml-1" blur={!auth.currentUser} style={styles.consensusOdds}>
                     {formatOdds(marketResult?.marketIntelligence?.bestLines?.consensusHomeML || 1.77)}
                   </BlurText>
                 </View>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-total-1" blur={!auth.currentUser} style={styles.consensusOdds}>
                     O{marketResult?.marketIntelligence?.bestLines?.consensusTotal || "42"}
                   </BlurText>
                   <BlurText card="consensus-total-juice-1" blur={!auth.currentUser} style={styles.consensusJuice}>
                     -105
                   </BlurText>
                 </View>
               </View>
             </View>

             {/* Team 2 Row */}
             <View style={styles.consensusTeamRow}>
               <View style={styles.consensusTeamInfo}>
                 <Image
                   source={getTeamLogo(params.team2)}
                   style={styles.consensusTeamLogo}
                 />
                 <Text style={styles.consensusTeamName}>
                   {getTeamDisplayName(params.team2)}
                 </Text>
               </View>
               <View style={styles.consensusOddsContainer}>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-spread-2" blur={!auth.currentUser} style={styles.consensusOdds}>
                     +{Math.abs(marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || -2)}
                   </BlurText>
                   <BlurText card="consensus-spread-juice-2" blur={!auth.currentUser} style={styles.consensusJuice}>
                     -105
                   </BlurText>
                 </View>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-ml-2" blur={!auth.currentUser} style={styles.consensusOdds}>
                     {formatOdds(marketResult?.marketIntelligence?.bestLines?.consensusAwayML || 1.97)}
                   </BlurText>
                 </View>
                 <View style={styles.consensusOddsBox}>
                   <BlurText card="consensus-total-2" blur={!auth.currentUser} style={styles.consensusOdds}>
                     U{(marketResult?.marketIntelligence?.bestLines?.consensusTotal || 42) + 0.5}
                   </BlurText>
                   <BlurText card="consensus-total-juice-2" blur={!auth.currentUser} style={styles.consensusJuice}>
                     -105
                   </BlurText>
                 </View>
               </View>
             </View>
          </View>
        </View>

        {/* Public vs Sharp Meter Card */}
        <View style={[styles.card, styles.sharpMeterCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Public vs Sharp Meter 🌡️</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.sharpMeterContent}>
            <View style={styles.sharpMeterContainer}>
              {/* Left Side - Text Information (matching Figma exactly) */}
              <View style={styles.sharpMeterTextSection}>
                <View style={styles.sharpMeterTextRow}>
                  <BlurText card="sharp-primary" blur={!auth.currentUser} style={styles.sharpMeterPrimaryText}>
                    {marketResult?.marketIntelligence?.sharpMeter?.primarySignal?.split(' ').slice(0, 3).join(' ') || "Sharps Lean Dog"}
                  </BlurText>
                  <BlurText card="sharp-value" blur={!auth.currentUser} style={styles.sharpMeterValueText}>
                    {marketResult?.marketIntelligence?.sharpMeter?.pointGap ?
                      `${marketResult.marketIntelligence.sharpMeter.pointGap > 0 ? '+' : ''}${marketResult.marketIntelligence.sharpMeter.pointGap}`
                      : "+0.5"}
                  </BlurText>
                </View>

                <View style={styles.sharpMeterTextRow}>
                  <BlurText card="sharp-secondary" blur={!auth.currentUser} style={styles.sharpMeterSecondaryText}>
                    (RLM suspected)
                  </BlurText>
                  <BlurText card="sharp-spread" blur={!auth.currentUser} style={styles.sharpMeterSpreadText}>
                    {marketResult?.marketIntelligence?.sharpMeter?.avgPublicSpread || "-3.5"}
                  </BlurText>
                </View>

                <BlurText card="sharp-detail" blur={!auth.currentUser} style={styles.sharpMeterDetailText}>
                  {marketResult?.marketIntelligence?.sharpMeter?.detailLine || "Sharp avg −3.0 vs public −3.5"}
                </BlurText>
              </View>

              {/* Right Side - Circular Gauge (matching Figma exactly) */}
              <View style={styles.sharpMeterGaugeSection}>
                <View style={styles.sharpMeterCircle}>
                  <BlurText card="sharp-gauge-main" blur={!auth.currentUser} style={styles.sharpMeterGaugeText}>
                    3W
                  </BlurText>
                  <BlurText card="sharp-gauge-sub" blur={!auth.currentUser} style={styles.sharpMeterGaugeSubtext}>
                    3-game win streak
                  </BlurText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Market Efficiency Card */}
        <View style={[styles.card, styles.marketEfficiencyCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Market Efficiency 🦾</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.marketEfficiencyContent}>
            <View style={styles.efficiencyMeter}>
              <View style={styles.efficiencyScale}>
                <Text style={styles.efficiencyLabel}>Loose</Text>
                <Text style={styles.efficiencyLabel}>Tight</Text>
              </View>
              <View style={styles.efficiencyBar}>
                <LinearGradient
                  colors={["#00ddff", "#0bff13"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.efficiencyGradient}
                />
                <View style={[
                  styles.efficiencyIndicator,
                  { left: `${marketResult?.marketIntelligence?.marketTightness?.tightness === "Tight" ? "80%" :
                           marketResult?.marketIntelligence?.marketTightness?.tightness === "Normal" ? "50%" : "20%"}` }
                ]} />
              </View>
            </View>
            <BlurText card="market-efficiency" blur={!auth.currentUser} style={styles.efficiencyDescription}>
              {marketResult?.marketIntelligence?.marketTightness?.summary || "Normal • Spread market • point range 1.0 • price range 0¢"}
            </BlurText>
          </View>
        </View>

        {/* Odds Table Card */}
        <View style={[styles.card, styles.oddsTableCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Odds Table 🔎</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.oddsTableContent}>
            {/* Header Row */}
            <View style={styles.oddsTableHeaderRow}>
              <Text style={styles.oddsTableHeaderText}>MONEYLINE</Text>
              <Text style={styles.oddsTableHeaderText}>SPREAD</Text>
              <Text style={styles.oddsTableHeaderText}>TOTALS</Text>
            </View>

            {/* Team 1 Section */}
            <View style={styles.oddsTableTeamHeaderRow}>
              <Text style={styles.oddsTableTeamHeaderText}>{getTeamDisplayName(params.team1)}</Text>
            </View>

            {/* Dynamic Bookmaker Rows for Team 1 */}
            {(marketResult?.marketIntelligence?.oddsTable || []).map((bookmaker, index) => (
              <TeamOddsRow
                key={`${bookmaker.bookmakerKey}-team1`}
                bookmakerLogo={getBookmakerLogo(bookmaker.bookmaker)}
                mlOdds={formatOdds(bookmaker.odds?.moneyline?.home || 1.77)}
                spreadPoint={bookmaker.odds?.spread?.home?.point ?
                  `${bookmaker.odds.spread.home.point > 0 ? '+' : ''}${bookmaker.odds.spread.home.point}` : "+1.5"}
                spreadOdds={formatOdds(bookmaker.odds?.spread?.home?.price || 1.91)}
                totalLine={bookmaker.odds?.total?.over ?
                  `O ${bookmaker.odds.total.over.point}` : "O 43"}
                totalOdds={formatOdds(bookmaker.odds?.total?.over?.price || 1.83)}
              />
            ))}

            {/* Team 2 Section */}
            <View style={styles.oddsTableTeamHeaderRow}>
              <Text style={styles.oddsTableTeamHeaderText}>{getTeamDisplayName(params.team2)}</Text>
            </View>

            {/* Dynamic Bookmaker Rows for Team 2 */}
            {(marketResult?.marketIntelligence?.oddsTable || []).map((bookmaker, index) => (
              <TeamOddsRow
                key={`${bookmaker.bookmakerKey}-team2`}
                bookmakerLogo={getBookmakerLogo(bookmaker.bookmaker)}
                mlOdds={formatOdds(bookmaker.odds?.moneyline?.away || 1.97)}
                spreadPoint={bookmaker.odds?.spread?.away?.point ?
                  `${bookmaker.odds.spread.away.point > 0 ? '+' : ''}${bookmaker.odds.spread.away.point}` : "-1.5"}
                spreadOdds={formatOdds(bookmaker.odds?.spread?.away?.price || 1.91)}
                totalLine={bookmaker.odds?.total?.under ?
                  `U ${bookmaker.odds.total.under.point}` : "U 53.4"}
                totalOdds={formatOdds(bookmaker.odds?.total?.under?.price || 1.87)}
              />
            ))}
          </View>
        </View>

        {/* Vig Analysis Card */}
        <View style={[styles.card, styles.vigAnalysisCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Vig Analysis 🧃</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.vigAnalysisContent}>
            {/* Header Row - Match Consensus Lines layout */}
            <View style={styles.vigHeaderRow}>
              <View style={styles.vigHeaderSpacer} />
              <Text style={styles.vigHeaderText}>Spread</Text>
              <Text style={styles.vigHeaderText}>Moneyline</Text>
              <Text style={styles.vigHeaderText}>Total</Text>
            </View>

            {/* Sharp Books Row - Match team row layout */}
            <View style={styles.vigTeamRow}>
              <View style={styles.vigTeamInfo}>
                <Text style={styles.vigTeamIcon}>🎯</Text>
                <Text style={styles.vigTeamName}>Sharp Books</Text>
              </View>
              <View style={styles.vigOddsContainer}>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-sharp-spread" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.spread?.sharp ?
                      `${marketResult.marketIntelligence.vigAnalysis.spread.sharp.toFixed(1)}%` : "3.3%"}
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-sharp-ml" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.sharp ?
                      `${marketResult.marketIntelligence.vigAnalysis.moneyline.sharp.toFixed(1)}%` : "3.2%"}
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-sharp-total" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.total?.sharp ?
                      `${marketResult.marketIntelligence.vigAnalysis.total.sharp.toFixed(1)}%` : "3.9%"}
                  </BlurText>
                </View>
              </View>
            </View>

            {/* All Books Row - Match team row layout */}
            <View style={styles.vigTeamRow}>
              <View style={styles.vigTeamInfo}>
                <Text style={styles.vigTeamIcon}>👥</Text>
                <Text style={styles.vigTeamName}>All books</Text>
              </View>
              <View style={styles.vigOddsContainer}>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-market-spread" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.spread?.market ?
                      `${marketResult.marketIntelligence.vigAnalysis.spread.market.toFixed(1)}%` : "4.4%"}
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-market-ml" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.market ?
                      `${marketResult.marketIntelligence.vigAnalysis.moneyline.market.toFixed(1)}%` : "4.1%"}
                  </BlurText>
                </View>
                <View style={styles.vigOddsBox}>
                  <BlurText card="vig-market-total" blur={!auth.currentUser} style={styles.vigOdds}>
                    {marketResult?.marketIntelligence?.vigAnalysis?.total?.market ?
                      `${marketResult.marketIntelligence.vigAnalysis.total.market.toFixed(1)}%` : "4.6%"}
                  </BlurText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Fair Value Card */}
        <View style={[styles.card, styles.fairValueCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Fair Value ⚖️</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.fairValueContent}>
            <View style={styles.fairValueHeader}>
              <View style={styles.fairValueHeaderSpacer} />
              <Text style={styles.fairValueHeaderText}>Spread</Text>
              <Text style={styles.fairValueHeaderText}>Moneyline</Text>
              <Text style={styles.fairValueHeaderText}>Total</Text>
            </View>

            {/* Team 1 Row */}
            <View style={styles.fairValueTeamRow}>
              <View style={styles.fairValueTeamInfo}>
                <Image
                  source={getTeamLogo(params.team1)}
                  style={styles.fairValueTeamLogo}
                />
                <Text style={styles.fairValueTeamName}>
                  {getTeamDisplayName(params.team1)}
                </Text>
              </View>
              <View style={styles.fairValueOddsContainer}>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-spread-1" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {marketResult?.marketIntelligence?.fairValue?.spread?.fair1 ?
                      formatOdds(marketResult.marketIntelligence.fairValue.spread.fair1) : "-105"}
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-ml-1" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {formatOdds(marketResult?.marketIntelligence?.fairValue?.moneyline?.fair1 || 1.71)}
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-total-1" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {marketResult?.marketIntelligence?.fairValue?.total?.fair1 ?
                      formatOdds(marketResult.marketIntelligence.fairValue.total.fair1) : "-105"}
                  </BlurText>
                </View>
              </View>
            </View>

            {/* Team 2 Row */}
            <View style={styles.fairValueTeamRow}>
              <View style={styles.fairValueTeamInfo}>
                <Image
                  source={getTeamLogo(params.team2)}
                  style={styles.fairValueTeamLogo}
                />
                <Text style={styles.fairValueTeamName}>
                  {getTeamDisplayName(params.team2)}
                </Text>
              </View>
              <View style={styles.fairValueOddsContainer}>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-spread-2" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {marketResult?.marketIntelligence?.fairValue?.spread?.fair2 ?
                      formatOdds(marketResult.marketIntelligence.fairValue.spread.fair2) : "-105"}
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-ml-2" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {formatOdds(marketResult?.marketIntelligence?.fairValue?.moneyline?.fair2 || 2.29)}
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-total-2" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {marketResult?.marketIntelligence?.fairValue?.total?.fair2 ?
                      formatOdds(marketResult.marketIntelligence.fairValue.total.fair2) : "-105"}
                  </BlurText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* EV+ & Arb Opportunities Card */}
        <View style={[styles.card, styles.evOpportunitiesCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>EV+ & Arb Opportunities 💸</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.evOpportunitiesContent}>
            <EVArbSection marketData={marketResult} params={params} />
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
            <Text style={styles.buttonText}>Get Fresh Odds 🎲</Text>
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          <View style={styles.analysisContainer}>
            {isLoading ? renderShimmer() : renderMarketContent()}
          </View>
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}

// Helper Components
const EVArbSection: React.FC<{
  marketData: MarketIntelResult | null;
  params: MarketIntelParams;
}> = ({ marketData, params }) => {
  const opportunities = marketData?.marketIntelligence?.evOpportunities?.opportunities || [];

  if (opportunities.length === 0) {
    return (
      <View style={evStyles.evArbContainer}>
        {/* No Opportunities Item - Match Best Lines dimensions */}
        <View style={evStyles.noEvArbItem}>
          <Image
            source={require("../assets/images/noevopps.png")}
            style={evStyles.noEvIcon}
          />
          <View style={evStyles.noEvInfo}>
            <BlurText card="no-ev-title" blur={!auth.currentUser} style={evStyles.noEvTitle}>
              Market is efficiently priced
            </BlurText>
            <BlurText card="no-ev-desc" blur={!auth.currentUser} style={evStyles.noEvDescription}>
              No +EV or Arb opportunities found
            </BlurText>
          </View>
        </View>

        {/* Lowest Vig Items - Match Best Lines dimensions */}
        <View style={evStyles.lowVigItem}>
          <Image
            source={require("../assets/images/Pinaccle.png")} // Match existing filename
            style={evStyles.lowVigLogo}
          />
          <View style={evStyles.lowVigInfo}>
            <BlurText card="lowest-vig-ml" blur={!auth.currentUser} style={evStyles.lowVigTitle}>
              Lowest Vig at 2.5%
            </BlurText>
            <BlurText card="lowest-vig-ml-desc" blur={!auth.currentUser} style={evStyles.lowVigDescription}>
              ML on Wizards -210 at Pinnacle
            </BlurText>
          </View>
        </View>

        <View style={evStyles.lowVigItem}>
          <Image
            source={require("../assets/images/logo.png")} // Use logo.png as fallback
            style={evStyles.lowVigLogo}
          />
          <View style={evStyles.lowVigInfo}>
            <BlurText card="lowest-vig-spread" blur={!auth.currentUser} style={evStyles.lowVigTitle}>
              Lowest Vig Spread at 2.6%
            </BlurText>
            <BlurText card="lowest-vig-spread-desc" blur={!auth.currentUser} style={evStyles.lowVigDescription}>
              ML on 76ers +190 at LowVig.AG
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
          {opportunity.type === 'arbitrage' ? (
            <>
              <View style={evStyles.arbLogosContainer}>
                <Image source={{ uri: params.team1Logo || 'https://via.placeholder.com/48x48' }} style={evStyles.arbLogo} />
                <Image source={{ uri: params.team2Logo || 'https://via.placeholder.com/48x48' }} style={evStyles.arbLogo} />
              </View>
              <View style={evStyles.opportunityInfo}>
                <BlurText card={`ev-arb-title-${index}`} blur={!auth.currentUser} style={evStyles.opportunityTitle}>
                  {opportunity.title}
                </BlurText>
                <BlurText card={`ev-arb-desc-${index}`} blur={!auth.currentUser} style={evStyles.opportunityDescription}>
                  {opportunity.description}
                </BlurText>
              </View>
            </>
          ) : (
            <>
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
            </>
          )}
        </View>
      ))}
    </View>
  );
};

// TeamOddsRow Component - Matches Figma exactly
const TeamOddsRow: React.FC<{
  bookmakerLogo: any;
  mlOdds: string;
  spreadPoint: string;
  spreadOdds: string;
  totalLine: string;
  totalOdds: string;
}> = ({
  bookmakerLogo,
  mlOdds,
  spreadPoint,
  spreadOdds,
  totalLine,
  totalOdds
}) => (
  <View style={styles.oddsTableRow}>
    {/* Moneyline Column */}
    <View style={styles.oddsTableCell}>
      <Image source={bookmakerLogo} style={styles.oddsTableBookmakerLogo} />
      <BlurText card={`ml-${mlOdds}`} blur={!auth.currentUser} style={styles.oddsTableOdds}>
        {mlOdds}
      </BlurText>
    </View>

    {/* Spread Column */}
    <View style={styles.oddsTableCell}>
      <Image source={bookmakerLogo} style={styles.oddsTableBookmakerLogo} />
      <View style={styles.oddsTableSpreadContainer}>
        <BlurText card={`spread-${spreadPoint}`} blur={!auth.currentUser} style={styles.oddsTableOdds}>
          {spreadPoint}
        </BlurText>
        <BlurText card={`spread-juice-${spreadOdds}`} blur={!auth.currentUser} style={styles.oddsTableJuice}>
          {spreadOdds}
        </BlurText>
      </View>
    </View>

    {/* Totals Column */}
    <View style={styles.oddsTableCell}>
      <Image source={bookmakerLogo} style={styles.oddsTableBookmakerLogo} />
      <View style={styles.oddsTableSpreadContainer}>
        <BlurText card={`total-${totalLine}`} blur={!auth.currentUser} style={styles.oddsTableOdds}>
          {totalLine}
        </BlurText>
        <BlurText card={`total-juice-${totalOdds}`} blur={!auth.currentUser} style={styles.oddsTableJuice}>
          {totalOdds}
        </BlurText>
      </View>
    </View>
  </View>
);

// Styles - EXACTLY matching Figma dimensions
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
  imageContainer: {
    width: "100%",
    height: 300,
    aspectRatio: 1,
    alignSelf: "center",
    marginBottom: 20,
    borderRadius: 35,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    objectFit: "cover",
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
  errorContainer: {},
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
  // Universal Card Header Styles
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
  // Best Lines Card Styles - EXACT Figma dimensions
  bestLinesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Figma cornerRadius: 40 (reduced as requested)
    borderColor: "#212121", // Exact stroke color as requested
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
    padding: 12, // Smaller padding to match Figma
    minHeight: 60, // Smaller height to match Figma
  },
  bestLineBookmakerLogo: {
    width: 24, // Much smaller to match Figma
    height: 24, // Much smaller to match Figma
    borderRadius: 12,
    marginRight: 12, // Smaller margin
  },
  bestLineTextSection: {
    flex: 1,
    justifyContent: "center",
  },
  bestLineMainText: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    lineHeight: 22,
    marginBottom: 8,
  },
  bestLineDescription: {
    color: "#FFFFFF",
    fontSize: 12, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Light",
    opacity: 0.7,
    lineHeight: 18,
  },
  // Consensus Lines Card Styles
  consensusLinesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Standardized across all cards
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
    fontSize: 14, // Match analysis.tsx sizing
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
    width: 40, // Match analysis.tsx sizing
    height: 40, // Match analysis.tsx sizing
    borderRadius: 20,
    marginRight: 12,
  },
  consensusTeamName: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  consensusOddsContainer: {
    flexDirection: "row",
    flex: 2,
    justifyContent: "space-around",
  },
  consensusOddsBox: {
    backgroundColor: "#161616",
    borderRadius: 20, // Match analysis.tsx sizing
    borderWidth: 1,
    borderColor: "#212121",
    width: 66, // Match analysis.tsx sizing
    height: 66, // Match analysis.tsx sizing
    justifyContent: "center",
    alignItems: "center",
  },
  consensusOdds: {
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  consensusJuice: {
    fontSize: 12, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    opacity: 0.5,
  },
  // Sharp Meter Card Styles - EXACT Figma layout
  sharpMeterCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Standardized across all cards
    padding: 20,
  },
  sharpMeterContent: {
    height: 324, // Figma height: 324
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
  sharpMeterTextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 108, // Figma height: 108
    borderBottomWidth: 1,
    borderBottomColor: "#686868",
  },
  sharpMeterPrimaryText: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterValueText: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterSecondaryText: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterSpreadText: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterDetailText: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterGaugeSection: {
    width: 120, // Reasonable size like analysis.tsx
    height: 120, // Reasonable size like analysis.tsx
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
    fontSize: 24, // Reasonable size for gauge center
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    marginBottom: 8,
  },
  sharpMeterGaugeSubtext: {
    fontSize: 12, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 16,
  },
  // Market Efficiency Card Styles - PERFECT Figma alignment
  marketEfficiencyCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Same as all other cards
    padding: 20,
  },
  marketEfficiencyContent: {
    gap: 15,
  },
  efficiencyMeter: {
    gap: 10,
  },
  efficiencyScale: {
    flexDirection: "row",
    justifyContent: "space-between",
    // NO paddingHorizontal - align with title edges
  },
  efficiencyLabel: {
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    opacity: 0.6,
  },
  efficiencyBar: {
    height: 16, // Figma height: 16
    borderRadius: 100,
    position: "relative",
    overflow: "hidden",
    // NO margin - align with title edges
  },
  efficiencyGradient: {
    flex: 1,
    height: "100%",
  },
  efficiencyIndicator: {
    position: "absolute",
    top: -3,
    width: 22, // Figma width: 22.36079978942871
    height: 22, // Figma height: 22.36079978942871
    borderRadius: 11,
    backgroundColor: "#ffffff",
  },
  efficiencyDescription: {
    fontSize: 14, // SMALLER to fit 1-liner (was 16)
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    opacity: 0.8,
    textAlign: "center",
    lineHeight: 18, // Tight line height for 1-liner
  },
  // Odds Table Card Styles - Clean AF Table Design
  oddsTableCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Standardized across all cards
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
  oddsTableTeamHeaderRow: {
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  oddsTableTeamHeaderText: {
    fontSize: 16,
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    textAlign: "center",
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
    width: 18, // Proportionally smaller than Best Lines (24px)
    height: 18,
    borderRadius: 9,
  },
  oddsTableOdds: {
    fontSize: 14,
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  oddsTableSpreadContainer: {
    alignItems: "center",
    gap: 2,
  },
  oddsTableJuice: {
    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    color: "#888888",
    textAlign: "center",
  },
  // Vig Analysis Card Styles
  vigAnalysisCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Standardized across all cards
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
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    flex: 1,
    textAlign: "center",
  },
  vigRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    height: 156, // Figma height: 156
  },
  vigTeamName: {
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    minWidth: 60,
  },
  vigCell: {
    backgroundColor: "#161616",
    borderRadius: 38, // Figma cornerRadius: 37.6699104309082
    borderWidth: 1,
    borderColor: "#212121",
    width: 132, // Figma width: 132
    height: 132, // Figma height: 132
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 10,
  },
  vigPercentage: {
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  // New Vig Analysis Styles (matching Consensus Lines layout)
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
    width: 24, // Same width as team logos
    textAlign: "center",
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
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    textAlign: "center",
  },
  // Fair Value Card Styles
  fairValueCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Standardized across all cards
    padding: 20,
  },
  fairValueContent: {
    gap: 15,
  },
  fairValueHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  fairValueHeaderSpacer: {
    flex: 1,
  },
  fairValueHeaderText: {
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    flex: 1,
    textAlign: "center",
  },
  fairValueTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    height: 156, // Figma height: 156
  },
  fairValueTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  fairValueTeamLogo: {
    width: 120, // Figma width: 120
    height: 120, // Figma height: 120
    borderRadius: 60,
    marginRight: 12,
  },
  fairValueTeamName: {
    fontSize: 16, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  fairValueOddsContainer: {
    flexDirection: "row",
    flex: 2,
    justifyContent: "space-around",
  },
  fairValueOddsBox: {
    backgroundColor: "#161616",
    borderRadius: 38, // Figma cornerRadius: 37.6699104309082
    borderWidth: 1,
    borderColor: "#212121",
    width: 132, // Figma width: 132
    height: 132, // Figma height: 132
    justifyContent: "center",
    alignItems: "center",
  },
  fairValueOdds: {
    fontSize: 14, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  fairValueJuice: {
    fontSize: 12, // Match analysis.tsx sizing
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    opacity: 0.5,
  },
  // EV Opportunities Card Styles
  evOpportunitiesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 40, // Standardized across all cards
    padding: 20,
  },
  evOpportunitiesContent: {
    gap: 24,
  },
  floatingButton: {
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    padding: 10,
  },
  placeholderImage: {
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    height: "100%",
  },
  placeholderText: {
    color: "#888",
    fontSize: 16,
  },
});

// EV Section Styles - Match Best Lines dimensions
const evStyles = StyleSheet.create({
  evArbContainer: {
    gap: 15, // Match Best Lines gap
  },
  // No Opportunities Item - Match Best Lines dimensions
  noEvArbItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12, // Match Best Lines borderRadius
    padding: 12, // Match Best Lines padding
    minHeight: 60, // Match Best Lines minHeight
  },
  noEvIcon: {
    width: 24, // Match Best Lines logo size
    height: 24,
    marginRight: 12,
  },
  noEvInfo: {
    flex: 1,
  },
  noEvTitle: {
    fontSize: 16, // Match Best Lines main text
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  noEvDescription: {
    fontSize: 14, // Match Best Lines description
    fontFamily: "Aeonik-Regular",
    color: "#888888",
  },
  // Lowest Vig Items - Match Best Lines dimensions
  lowVigItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12, // Match Best Lines borderRadius
    padding: 12, // Match Best Lines padding
    minHeight: 60, // Match Best Lines minHeight
  },
  lowVigLogo: {
    width: 24, // Match Best Lines logo size
    height: 24,
    marginRight: 12,
  },
  lowVigInfo: {
    flex: 1,
  },
  lowVigTitle: {
    fontSize: 16, // Match Best Lines main text
    fontFamily: "Aeonik-Bold",
    color: "#00ff41", // Green for lowest vig
    marginBottom: 4,
  },
  lowVigDescription: {
    fontSize: 14, // Match Best Lines description
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
  },
  // Opportunity Items - Match Best Lines dimensions
  opportunityItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 12, // Match Best Lines borderRadius
    padding: 12, // Match Best Lines padding
    minHeight: 60, // Match Best Lines minHeight
  },
  bookmakerLogo: {
    width: 24, // Match Best Lines logo size
    height: 24,
    marginRight: 12,
  },
  opportunityInfo: {
    flex: 1,
  },
  opportunityTitle: {
    fontSize: 16, // Match Best Lines main text
    fontFamily: "Aeonik-Bold",
    color: "#00ff41", // Green for +EV
    marginBottom: 4,
  },
  opportunityDescription: {
    fontSize: 14, // Match Best Lines description
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
  },
  // Arbitrage specific styles
  arbLogosContainer: {
    flexDirection: "row",
    marginRight: 12,
  },
  arbLogo: {
    width: 20, // Even smaller for dual logos
    height: 20,
    borderRadius: 10,
    marginLeft: -3, // Slight overlap
  },
});
