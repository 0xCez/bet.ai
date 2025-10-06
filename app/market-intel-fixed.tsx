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
import { BorderButton } from "@/components/ui/BorderButton";
import { TopBar } from "../components/ui/TopBar";
import { db, auth } from "../firebaseConfig";
import { BlurText } from "@/components/ui/BlurText";
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
      marketsCount: number;
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
        {/* Image Container */}
        <View style={styles.imageContainer}>
          {displayImageUrl ? (
            <Image
              source={{ uri: displayImageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : params.team1Logo ? (
            <Image
              source={{ uri: params.team1Logo }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}></Text>
            </View>
          )}
        </View>

        {/* Best Lines Card - EXACT Figma structure: 6 vertical items */}
        <View style={[styles.card, styles.bestLinesCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Best Lines 💰</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.bestLinesContent}>
            {/* Over Total Line */}
            <View style={styles.bestLineItem}>
              <Image
                source={{ uri: params.team1Logo || 'https://via.placeholder.com/120x120' }}
                style={styles.bestLineTeamLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-over" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  Over {marketResult?.marketIntelligence?.bestLines?.consensusTotal || "43.5"} -102
                </BlurText>
                <BlurText card="best-over-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available Over with lowest juice
                </BlurText>
              </View>
            </View>

            {/* Under Total Line */}
            <View style={styles.bestLineItem}>
              <Image
                source={{ uri: params.team2Logo || 'https://via.placeholder.com/120x120' }}
                style={styles.bestLineTeamLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-under" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  Under {(marketResult?.marketIntelligence?.bestLines?.consensusTotal || 43.5) + 1} -106
                </BlurText>
                <BlurText card="best-under-desc" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available Under with lowest juice
                </BlurText>
              </View>
            </View>

            {/* Team 1 Spread */}
            <View style={styles.bestLineItem}>
              <Image
                source={{ uri: params.team1Logo || 'https://via.placeholder.com/120x120' }}
                style={styles.bestLineTeamLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-spread-1" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team1?.split(' ').pop()} {marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || "-3.5"} at -105
                </BlurText>
                <BlurText card="best-spread-desc-1" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available Spread on {params.team1?.split(' ').pop()}
                </BlurText>
              </View>
            </View>

            {/* Team 2 Spread */}
            <View style={styles.bestLineItem}>
              <Image
                source={{ uri: params.team2Logo || 'https://via.placeholder.com/120x120' }}
                style={styles.bestLineTeamLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-spread-2" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team2?.split(' ').pop()} +{Math.abs(marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || -3.5)} at -105
                </BlurText>
                <BlurText card="best-spread-desc-2" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available Spread on {params.team2?.split(' ').pop()}
                </BlurText>
              </View>
            </View>

            {/* Team 1 Moneyline */}
            <View style={styles.bestLineItem}>
              <Image
                source={{ uri: params.team1Logo || 'https://via.placeholder.com/120x120' }}
                style={styles.bestLineTeamLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-ml-1" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team1?.split(' ').pop()} ML at -147
                </BlurText>
                <BlurText card="best-ml-desc-1" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available ML on {params.team1?.split(' ').pop()}
                </BlurText>
              </View>
            </View>

            {/* Team 2 Moneyline */}
            <View style={styles.bestLineItem}>
              <Image
                source={{ uri: params.team2Logo || 'https://via.placeholder.com/120x120' }}
                style={styles.bestLineTeamLogo}
              />
              <View style={styles.bestLineTextSection}>
                <BlurText card="best-ml-2" blur={!auth.currentUser} style={styles.bestLineMainText}>
                  {params.team2?.split(' ').pop()} ML at +265
                </BlurText>
                <BlurText card="best-ml-desc-2" blur={!auth.currentUser} style={styles.bestLineDescription}>
                  Best available ML on {params.team2?.split(' ').pop()}
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
                  source={{ uri: params.team1Logo || 'https://via.placeholder.com/120x120' }}
                  style={styles.consensusTeamLogo}
                />
                <Text style={styles.consensusTeamName}>
                  {params.team1?.includes('Los Angeles') ? 'Chargers' :
                   params.team1?.includes('Washington') ? 'Commanders' :
                   params.team1?.split(' ').pop()}
                </Text>
              </View>
              <View style={styles.consensusOddsContainer}>
                <View style={styles.consensusOddsBox}>
                  <BlurText card="consensus-spread-1" blur={!auth.currentUser} style={styles.consensusOdds}>
                    {marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || "-3"}
                  </BlurText>
                  <BlurText card="consensus-spread-juice-1" blur={!auth.currentUser} style={styles.consensusJuice}>
                    -105
                  </BlurText>
                </View>
                <View style={styles.consensusOddsBox}>
                  <BlurText card="consensus-ml-1" blur={!auth.currentUser} style={styles.consensusOdds}>
                    -190
                  </BlurText>
                </View>
                <View style={styles.consensusOddsBox}>
                  <BlurText card="consensus-total-1" blur={!auth.currentUser} style={styles.consensusOdds}>
                    O{marketResult?.marketIntelligence?.bestLines?.consensusTotal || "47"}
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
                  source={{ uri: params.team2Logo || 'https://via.placeholder.com/120x120' }}
                  style={styles.consensusTeamLogo}
                />
                <Text style={styles.consensusTeamName}>
                  {params.team2?.includes('Washington') ? 'Commanders' :
                   params.team2?.includes('Philadelphia') ? '76ers' :
                   params.team2?.split(' ').pop()}
                </Text>
              </View>
              <View style={styles.consensusOddsContainer}>
                <View style={styles.consensusOddsBox}>
                  <BlurText card="consensus-spread-2" blur={!auth.currentUser} style={styles.consensusOdds}>
                    +{Math.abs(marketResult?.marketIntelligence?.bestLines?.consensusSpreadPoint || -3)}
                  </BlurText>
                  <BlurText card="consensus-spread-juice-2" blur={!auth.currentUser} style={styles.consensusJuice}>
                    -105
                  </BlurText>
                </View>
                <View style={styles.consensusOddsBox}>
                  <BlurText card="consensus-ml-2" blur={!auth.currentUser} style={styles.consensusOdds}>
                    +165
                  </BlurText>
                </View>
                <View style={styles.consensusOddsBox}>
                  <BlurText card="consensus-total-2" blur={!auth.currentUser} style={styles.consensusOdds}>
                    U{marketResult?.marketIntelligence?.bestLines?.consensusTotal || "48"}
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
            <View style={styles.oddsTableHeaderRow}>
              <Text style={styles.oddsTableHeaderText}>MONEYLINE</Text>
              <Text style={styles.oddsTableHeaderText}>SPREAD</Text>
              <Text style={styles.oddsTableHeaderText}>TOTALS</Text>
            </View>

            {/* Team 1 Header */}
            <View style={styles.oddsTableTeamHeader}>
              <Text style={styles.oddsTableTeamName}>
                {params.team1?.includes('Los Angeles') ? 'Los Angeles Chargers' : params.team1}
              </Text>
            </View>

            {/* Team 1 Odds Row */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={{ uri: params.team1Logo || 'https://via.placeholder.com/90x90' }}
                  style={styles.oddsTableLogo}
                />
                <BlurText card="odds-ml-1" blur={!auth.currentUser} style={styles.oddsTableOdds}>
                  -118
                </BlurText>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={{ uri: params.team1Logo || 'https://via.placeholder.com/90x90' }}
                  style={styles.oddsTableLogo}
                />
                <View style={styles.oddsTableSpreadContainer}>
                  <BlurText card="odds-spread-1" blur={!auth.currentUser} style={styles.oddsTableOdds}>
                    +1.5
                  </BlurText>
                  <BlurText card="odds-spread-juice-1" blur={!auth.currentUser} style={styles.oddsTableJuice}>
                    -110
                  </BlurText>
                </View>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={{ uri: params.team1Logo || 'https://via.placeholder.com/90x90' }}
                  style={styles.oddsTableLogo}
                />
                <View style={styles.oddsTableSpreadContainer}>
                  <BlurText card="odds-total-1" blur={!auth.currentUser} style={styles.oddsTableOdds}>
                    o 43
                  </BlurText>
                  <BlurText card="odds-total-juice-1" blur={!auth.currentUser} style={styles.oddsTableJuice}>
                    -120
                  </BlurText>
                </View>
              </View>
            </View>

            {/* Team 2 Header */}
            <View style={styles.oddsTableTeamHeader}>
              <Text style={styles.oddsTableTeamName}>
                {params.team2?.includes('Washington') ? 'Washington Commanders' : params.team2}
              </Text>
            </View>

            {/* Team 2 Odds Row */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={{ uri: params.team2Logo || 'https://via.placeholder.com/90x90' }}
                  style={styles.oddsTableLogo}
                />
                <BlurText card="odds-ml-2" blur={!auth.currentUser} style={styles.oddsTableOdds}>
                  -110
                </BlurText>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={{ uri: params.team2Logo || 'https://via.placeholder.com/90x90' }}
                  style={styles.oddsTableLogo}
                />
                <View style={styles.oddsTableSpreadContainer}>
                  <BlurText card="odds-spread-2" blur={!auth.currentUser} style={styles.oddsTableOdds}>
                    -1.5
                  </BlurText>
                  <BlurText card="odds-spread-juice-2" blur={!auth.currentUser} style={styles.oddsTableJuice}>
                    +110
                  </BlurText>
                </View>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={{ uri: params.team2Logo || 'https://via.placeholder.com/90x90' }}
                  style={styles.oddsTableLogo}
                />
                <View style={styles.oddsTableSpreadContainer}>
                  <BlurText card="odds-total-2" blur={!auth.currentUser} style={styles.oddsTableOdds}>
                    u 53.4
                  </BlurText>
                  <BlurText card="odds-total-juice-2" blur={!auth.currentUser} style={styles.oddsTableJuice}>
                    -116
                  </BlurText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Vig Analysis Card */}
        <View style={[styles.card, styles.vigAnalysisCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Vig Analysis 🧃</Text>
            <Text style={styles.infoIcon}>ⓘ</Text>
          </View>
          <View style={styles.vigAnalysisContent}>
            <View style={styles.vigHeader}>
              <Text style={styles.vigHeaderText}>Spread</Text>
              <Text style={styles.vigHeaderText}>Moneyline</Text>
              <Text style={styles.vigHeaderText}>Total</Text>
            </View>

            <View style={styles.vigRow}>
              <Text style={styles.vigTeamName}>Sharp Books 🎯</Text>
              <View style={styles.vigCell}>
                <BlurText card="vig-sharp-spread" blur={!auth.currentUser} style={styles.vigPercentage}>
                  {marketResult?.marketIntelligence?.vigAnalysis?.spread?.sharp ?
                    `${marketResult.marketIntelligence.vigAnalysis.spread.sharp.toFixed(1)}%` : "3.3%"}
                </BlurText>
              </View>
              <View style={styles.vigCell}>
                <BlurText card="vig-sharp-ml" blur={!auth.currentUser} style={styles.vigPercentage}>
                  {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.sharp ?
                    `${marketResult.marketIntelligence.vigAnalysis.moneyline.sharp.toFixed(1)}%` : "3.2%"}
                </BlurText>
              </View>
              <View style={styles.vigCell}>
                <BlurText card="vig-sharp-total" blur={!auth.currentUser} style={styles.vigPercentage}>
                  {marketResult?.marketIntelligence?.vigAnalysis?.total?.sharp ?
                    `${marketResult.marketIntelligence.vigAnalysis.total.sharp.toFixed(1)}%` : "3.9%"}
                </BlurText>
              </View>
            </View>

            <View style={styles.vigRow}>
              <Text style={styles.vigTeamName}>All books 👥</Text>
              <View style={styles.vigCell}>
                <BlurText card="vig-market-spread" blur={!auth.currentUser} style={styles.vigPercentage}>
                  {marketResult?.marketIntelligence?.vigAnalysis?.spread?.market ?
                    `${marketResult.marketIntelligence.vigAnalysis.spread.market.toFixed(1)}%` : "4.4%"}
                </BlurText>
              </View>
              <View style={styles.vigCell}>
                <BlurText card="vig-market-ml" blur={!auth.currentUser} style={styles.vigPercentage}>
                  {marketResult?.marketIntelligence?.vigAnalysis?.moneyline?.market ?
                    `${marketResult.marketIntelligence.vigAnalysis.moneyline.market.toFixed(1)}%` : "4.1%"}
                </BlurText>
              </View>
              <View style={styles.vigCell}>
                <BlurText card="vig-market-total" blur={!auth.currentUser} style={styles.vigPercentage}>
                  {marketResult?.marketIntelligence?.vigAnalysis?.total?.market ?
                    `${marketResult.marketIntelligence.vigAnalysis.total.market.toFixed(1)}%` : "4.6%"}
                </BlurText>
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
              <Text style={styles.fairValueHeaderText}>Spread</Text>
              <Text style={styles.fairValueHeaderText}>Moneyline</Text>
              <Text style={styles.fairValueHeaderText}>Total</Text>
            </View>

            {/* Team 1 Row */}
            <View style={styles.fairValueTeamRow}>
              <View style={styles.fairValueTeamInfo}>
                <Image
                  source={{ uri: params.team1Logo || 'https://via.placeholder.com/120x120' }}
                  style={styles.fairValueTeamLogo}
                />
                <Text style={styles.fairValueTeamName}>
                  {params.team1?.includes('Los Angeles') ? 'Los Angeles Chargers' : params.team1}
                </Text>
              </View>
              <View style={styles.fairValueOddsContainer}>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-spread-1" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    -3
                  </BlurText>
                  <BlurText card="fair-spread-juice-1" blur={!auth.currentUser} style={styles.fairValueJuice}>
                    -105
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-ml-1" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {marketResult?.marketIntelligence?.fairValue?.moneyline?.fair1 ?
                      (marketResult.marketIntelligence.fairValue.moneyline.fair1 > 2 ?
                        `+${Math.round((marketResult.marketIntelligence.fairValue.moneyline.fair1 - 1) * 100)}` :
                        `-${Math.round(100 / (marketResult.marketIntelligence.fairValue.moneyline.fair1 - 1))}`) : "-141"}
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-total-1" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    O47
                  </BlurText>
                  <BlurText card="fair-total-juice-1" blur={!auth.currentUser} style={styles.fairValueJuice}>
                    -105
                  </BlurText>
                </View>
              </View>
            </View>

            {/* Team 2 Row */}
            <View style={styles.fairValueTeamRow}>
              <View style={styles.fairValueTeamInfo}>
                <Image
                  source={{ uri: params.team2Logo || 'https://via.placeholder.com/120x120' }}
                  style={styles.fairValueTeamLogo}
                />
                <Text style={styles.fairValueTeamName}>
                  {params.team2?.includes('Washington') ? 'Washington Commanders' : params.team2}
                </Text>
              </View>
              <View style={styles.fairValueOddsContainer}>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-spread-2" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    +3
                  </BlurText>
                  <BlurText card="fair-spread-juice-2" blur={!auth.currentUser} style={styles.fairValueJuice}>
                    -105
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-ml-2" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    {marketResult?.marketIntelligence?.fairValue?.moneyline?.fair2 ?
                      (marketResult.marketIntelligence.fairValue.moneyline.fair2 > 2 ?
                        `+${Math.round((marketResult.marketIntelligence.fairValue.moneyline.fair2 - 1) * 100)}` :
                        `-${Math.round(100 / (marketResult.marketIntelligence.fairValue.moneyline.fair2 - 1))}`) : "+141"}
                  </BlurText>
                </View>
                <View style={styles.fairValueOddsBox}>
                  <BlurText card="fair-total-2" blur={!auth.currentUser} style={styles.fairValueOdds}>
                    U47
                  </BlurText>
                  <BlurText card="fair-total-juice-2" blur={!auth.currentUser} style={styles.fairValueJuice}>
                    -105
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
        <View style={evStyles.noEvArbContainer}>
          <View style={evStyles.noEvArbIcon}>
            <Text style={evStyles.noEvArbIconText}>✕</Text>
          </View>
          <View style={evStyles.noEvArbInfo}>
            <BlurText card="no-ev-title" blur={!auth.currentUser} style={evStyles.noEvArbTitle}>
              Market is efficiently priced
            </BlurText>
            <BlurText card="no-ev-desc" blur={!auth.currentUser} style={evStyles.noEvArbDescription}>
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
        <View key={index} style={evStyles.evArbItem}>
          {opportunity.type === 'arbitrage' ? (
            <>
              <View style={evStyles.evArbLogos}>
                <Image source={{ uri: params.team1Logo || 'https://via.placeholder.com/74x74' }} style={evStyles.evArbLogo} />
                <Image source={{ uri: params.team2Logo || 'https://via.placeholder.com/74x74' }} style={evStyles.evArbLogo} />
              </View>
              <View style={evStyles.evArbInfo}>
                <BlurText card={`ev-arb-title-${index}`} blur={!auth.currentUser} style={evStyles.evArbTitle}>
                  {opportunity.title}
                </BlurText>
                <BlurText card={`ev-arb-desc-${index}`} blur={!auth.currentUser} style={evStyles.evArbDescription}>
                  {opportunity.description}
                </BlurText>
              </View>
            </>
          ) : (
            <>
              <Image
                source={{ uri: params.team1Logo || 'https://via.placeholder.com/120x120' }}
                style={evStyles.teamLogo}
              />
              <View style={evStyles.evArbInfo}>
                <BlurText card={`ev-title-${index}`} blur={!auth.currentUser} style={evStyles.evTitle}>
                  {opportunity.title}
                </BlurText>
                <BlurText card={`ev-desc-${index}`} blur={!auth.currentUser} style={evStyles.evDescription}>
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
    borderRadius: 42, // Figma cornerRadius: 41.67939376831055
    padding: 20,
  },
  bestLinesContent: {
    gap: 20,
  },
  bestLineItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22, 22, 22, 0.95)",
    borderRadius: 38, // Figma cornerRadius: 37.6699104309082
    padding: 20,
    height: 180, // Figma height: 180
  },
  bestLineTeamLogo: {
    width: 120, // Figma width: 120
    height: 120, // Figma height: 120
    borderRadius: 60,
    marginRight: 20,
  },
  bestLineTextSection: {
    flex: 1,
    justifyContent: "center",
  },
  bestLineMainText: {
    fontSize: 42, // Figma fontSize: 42
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    lineHeight: 50,
    marginBottom: 8,
  },
  bestLineDescription: {
    color: "#FFFFFF",
    fontSize: 38, // Figma fontSize: 38
    fontFamily: "Aeonik-Light",
    opacity: 0.7,
    lineHeight: 50,
  },
  // Consensus Lines Card Styles
  consensusLinesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 42,
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
    fontSize: 30, // Figma fontSize: 30
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    flex: 1,
    textAlign: "center",
  },
  consensusTeamRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    height: 156, // Figma height: 156
  },
  consensusTeamInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  consensusTeamLogo: {
    width: 120, // Figma width: 120
    height: 120, // Figma height: 120
    borderRadius: 60,
    marginRight: 12,
  },
  consensusTeamName: {
    fontSize: 42, // Figma fontSize: 42
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
    borderRadius: 38, // Figma cornerRadius: 37.6699104309082
    borderWidth: 1,
    borderColor: "#212121",
    width: 132, // Figma width: 132
    height: 132, // Figma height: 132
    justifyContent: "center",
    alignItems: "center",
  },
  consensusOdds: {
    fontSize: 30, // Figma fontSize: 30
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  consensusJuice: {
    fontSize: 30, // Figma fontSize: 30
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    opacity: 0.5,
  },
  // Sharp Meter Card Styles - EXACT Figma layout
  sharpMeterCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 42,
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
    fontSize: 34, // Figma fontSize: 34
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterValueText: {
    fontSize: 34, // Figma fontSize: 34
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterSecondaryText: {
    fontSize: 34, // Figma fontSize: 34
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterSpreadText: {
    fontSize: 34, // Figma fontSize: 34
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterDetailText: {
    fontSize: 34, // Figma fontSize: 34
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
  },
  sharpMeterGaugeSection: {
    width: 306, // Figma width: 306.1875
    height: 306, // Figma height: 306.1875
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 20,
  },
  sharpMeterCircle: {
    width: 306,
    height: 306,
    borderRadius: 153,
    borderWidth: 3,
    borderColor: "#00c2e0",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 194, 224, 0.1)",
  },
  sharpMeterGaugeText: {
    fontSize: 57, // Figma fontSize: 56.734745025634766
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    marginBottom: 8,
  },
  sharpMeterGaugeSubtext: {
    fontSize: 23, // Figma fontSize: 22.693897247314453
    fontFamily: "Aeonik-Light",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 24,
  },
  // Market Efficiency Card Styles
  marketEfficiencyCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 42,
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
    paddingHorizontal: 10,
  },
  efficiencyLabel: {
    fontSize: 30, // Figma fontSize: 30
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    opacity: 0.6,
  },
  efficiencyBar: {
    height: 16, // Figma height: 16
    borderRadius: 100,
    position: "relative",
    overflow: "hidden",
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
    backgroundColor: "#f7f7f7",
  },
  efficiencyDescription: {
    fontSize: 38, // Figma fontSize: 38
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    opacity: 0.8,
    textAlign: "left",
  },
  // Odds Table Card Styles
  oddsTableCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 42,
    padding: 20,
  },
  oddsTableContent: {
    gap: 0,
  },
  oddsTableHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
    height: 80, // Figma height: 80
    borderBottomWidth: 1,
    borderBottomColor: "#888888",
  },
  oddsTableHeaderText: {
    fontSize: 40, // Figma fontSize: 40
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    letterSpacing: 0.8,
    textAlign: "center",
    flex: 1,
  },
  oddsTableTeamHeader: {
    alignItems: "center",
    paddingVertical: 10,
    height: 80, // Figma height: 80
    borderBottomWidth: 1,
    borderBottomColor: "#888888",
  },
  oddsTableTeamName: {
    fontSize: 44, // Figma fontSize: 44
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    letterSpacing: 0.88,
  },
  oddsTableRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 15,
    height: 152, // Figma height: 152
    borderBottomWidth: 1,
    borderBottomColor: "#888888",
  },
  oddsTableCell: {
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  oddsTableLogo: {
    width: 90, // Figma width: 90
    height: 90, // Figma height: 90
    borderRadius: 45,
  },
  oddsTableOdds: {
    fontSize: 40, // Figma fontSize: 40
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  oddsTableSpreadContainer: {
    alignItems: "center",
    gap: 5,
  },
  oddsTableJuice: {
    fontSize: 40, // Figma fontSize: 40
    fontFamily: "Aeonik-Bold",
    color: "#ffffff",
  },
  // Vig Analysis Card Styles
  vigAnalysisCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 42,
    padding: 20,
  },
  vigAnalysisContent: {
    gap: 24,
  },
  vigHeader: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
  },
  vigHeaderText: {
    fontSize: 30, // Figma fontSize: 30
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
    flex: 1,
    fontSize: 42, // Figma fontSize: 42
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
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
    fontSize: 30, // Figma fontSize: 30
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  // Fair Value Card Styles
  fairValueCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 42,
    padding: 20,
  },
  fairValueContent: {
    gap: 15,
  },
  fairValueHeader: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
  },
  fairValueHeaderText: {
    fontSize: 30, // Figma fontSize: 30
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
    fontSize: 42, // Figma fontSize: 42
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
    fontSize: 30, // Figma fontSize: 30
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
  },
  fairValueJuice: {
    fontSize: 30, // Figma fontSize: 30
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    opacity: 0.5,
  },
  // EV Opportunities Card Styles
  evOpportunitiesCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 42,
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

// EV Section Styles
const evStyles = StyleSheet.create({
  evArbContainer: {
    gap: 20, // Figma gap between items: 20
  },
  evArbItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 38, // Figma cornerRadius: 37.6699104309082
    padding: 20,
    height: 180, // Figma height: 180
    borderWidth: 1,
    borderColor: "#212121",
  },
  evArbLogos: {
    flexDirection: "row",
    marginRight: 15,
  },
  evArbLogo: {
    width: 74, // Figma width: 74.03876495361328
    height: 74, // Figma height: 74.03876495361328
    borderRadius: 37,
    marginLeft: -10,
  },
  evArbInfo: {
    flex: 1,
  },
  evArbTitle: {
    fontSize: 42, // Figma fontSize: 42
    fontFamily: "Aeonik-Medium",
    color: "#0bff13",
    marginBottom: 5,
    lineHeight: 50,
  },
  evArbDescription: {
    fontSize: 38, // Figma fontSize: 38
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    lineHeight: 50,
  },
  evTitle: {
    fontSize: 42, // Figma fontSize: 42
    fontFamily: "Aeonik-Medium",
    color: "#0bff13",
    marginBottom: 5,
    lineHeight: 50,
  },
  evDescription: {
    fontSize: 38, // Figma fontSize: 38
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    lineHeight: 42,
  },
  noEvArbContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 38,
    padding: 20,
    height: 180,
    borderWidth: 1,
    borderColor: "#212121",
  },
  noEvArbIcon: {
    width: 120, // Figma width: 120
    height: 120, // Figma height: 120
    borderRadius: 60,
    backgroundColor: "#ff4444",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  noEvArbIconText: {
    fontSize: 60,
    color: "#ffffff",
  },
  noEvArbInfo: {
    flex: 1,
  },
  noEvArbTitle: {
    fontSize: 42, // Figma fontSize: 42
    fontFamily: "Aeonik-Medium",
    color: "#ffffff",
    marginBottom: 5,
    lineHeight: 50,
  },
  noEvArbDescription: {
    fontSize: 38, // Figma fontSize: 38
    fontFamily: "Aeonik-Regular",
    color: "#ffffff",
    lineHeight: 42,
  },
  teamLogo: {
    width: 120, // Figma width: 120
    height: 120, // Figma height: 120
    borderRadius: 60,
    marginRight: 15,
  },
});
