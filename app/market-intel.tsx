import React, { useState, useEffect, useRef } from "react";
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
import i18n from "@/i18n";
import { auth } from "@/firebaseConfig";
import { getNBATeamLogo, getNFLTeamLogo, getSoccerTeamLogo } from "@/utils/teamLogos";

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
  const shakeAnim = useRef(new Animated.Value(0)).current;

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

    if (params.team1 && params.team2 && params.sport) {
      getMarketIntelligence();
    } else {
      setError("Missing game data. Please go back and try again.");
      setIsLoading(false);
    }
  }, [params.team1, params.team2, params.sport, auth.currentUser, isSameAnalysis]);

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

    // Clear cached data to force fresh fetch
    setMarketResult(null);
    cachedMarketResult = null;

    setIsLoading(true);
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
      setIsLoading(false);
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
    <View style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Top Card - Market Intelligence Header */}
      <Card style={styles.topCard}>
        <View style={styles.marketHeader}>
          <ShimmerPlaceholder
            style={styles.marketTitleShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
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
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.bestLinesInfoShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
          </View>

          {/* Best Lines Items */}
          <View style={styles.linesList}>
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <View key={index} style={styles.lineItem}>
                <ShimmerPlaceholder
                  style={styles.bookmakerLogo}
                  shimmerColors={["#919191", "#767676", "#919191"]}
                />
                <View style={styles.lineTextContainer}>
                  <ShimmerPlaceholder
                    style={styles.lineBigTextShimmer}
                    shimmerColors={["#919191", "#767676", "#919191"]}
                  />
                  <ShimmerPlaceholder
                    style={styles.lineSmallTextShimmer}
                    shimmerColors={["#919191", "#767676", "#919191"]}
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
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.consensusLinesInfoShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
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
                    shimmerColors={["#919191", "#767676", "#919191"]}
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
                    shimmerColors={["#919191", "#767676", "#919191"]}
                  />
                  <ShimmerPlaceholder
                    style={styles.teamNameShimmer}
                    shimmerColors={["#919191", "#767676", "#919191"]}
                  />
                </View>
                {[1, 2, 3].map((colIndex) => (
                  <View key={colIndex} style={styles.dataColumn}>
                    <View style={styles.dataCell}>
                      <ShimmerPlaceholder
                        style={styles.dataValueShimmer}
                        shimmerColors={["#919191", "#767676", "#919191"]}
                      />
                      {colIndex !== 3 && (
                        <ShimmerPlaceholder
                          style={styles.dataSecondaryShimmer}
                          shimmerColors={["#919191", "#767676", "#919191"]}
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
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
          <ShimmerPlaceholder
            style={styles.publicSharpInfoShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </View>

        <View style={styles.publicSharpContent}>
          {/* Left Side - Text Content */}
          <View style={styles.publicSharpLeft}>
            {[1, 2, 3].map((index) => (
              <View key={index} style={[styles.publicSharpRow, index === 2 && styles.publicSharpRowBordered]}>
                <ShimmerPlaceholder
                  style={styles.publicSharpTextShimmer}
                  shimmerColors={["#919191", "#767676", "#919191"]}
                />
              </View>
            ))}
          </View>

          {/* Right Side - Gauge */}
          <View style={styles.publicSharpRight}>
            <ShimmerPlaceholder
              style={styles.gaugeShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
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
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
          <ShimmerPlaceholder
            style={styles.marketEfficiencyInfoShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </View>

        <View style={styles.marketEfficiencyContent}>
          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <ShimmerPlaceholder
              style={styles.progressBarShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <View style={styles.progressBarLabels}>
              <ShimmerPlaceholder
                style={styles.progressBarLabelShimmer}
                shimmerColors={["#919191", "#767676", "#919191"]}
              />
              <ShimmerPlaceholder
                style={styles.progressBarLabelShimmer}
                shimmerColors={["#919191", "#767676", "#919191"]}
              />
            </View>
          </View>

          {/* Description */}
          <ShimmerPlaceholder
            style={styles.marketEfficiencyDescriptionShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </View>
      </Card>

      {/* Odds Table Card */}
      <Card style={styles.oddsTableCard}>
        {/* Header */}
        <View style={styles.oddsTableHeader}>
          <ShimmerPlaceholder
            style={styles.oddsTableTitleShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
          <ShimmerPlaceholder
            style={styles.oddsTableInfoShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </View>

        <View style={styles.oddsTableContainer}>
          {/* Column Headers */}
          <View style={styles.oddsTableHeaderRow}>
            {[1, 2, 3].map((index) => (
              <ShimmerPlaceholder
                key={index}
                style={[styles.oddsTableColumnHeaderShimmer, index === 3 && styles.oddsTableColumnHeaderCellLast]}
                shimmerColors={["#919191", "#767676", "#919191"]}
              />
            ))}
          </View>

          {/* Team Name */}
          <ShimmerPlaceholder
            style={styles.oddsTableTeamNameShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />

          {/* Bookmaker Rows */}
          {[1, 2, 3].map((rowIndex) => (
            <View key={rowIndex} style={styles.oddsTableRow}>
              {[1, 2, 3].map((colIndex) => (
                <View key={colIndex} style={[styles.oddsTableCell, colIndex === 3 && styles.oddsTableCellLast]}>
                  <ShimmerPlaceholder
                    style={styles.oddsTableLogo}
                    shimmerColors={["#919191", "#767676", "#919191"]}
                  />
                  {colIndex === 1 ? (
                    <ShimmerPlaceholder
                      style={styles.oddsTableValueShimmer}
                      shimmerColors={["#919191", "#767676", "#919191"]}
                    />
                  ) : (
                    <View style={styles.oddsTableMultiValue}>
                      <ShimmerPlaceholder
                        style={styles.oddsTableValueShimmer}
                        shimmerColors={["#919191", "#767676", "#919191"]}
                      />
                      <ShimmerPlaceholder
                        style={styles.oddsTableValueShimmer}
                        shimmerColors={["#919191", "#767676", "#919191"]}
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
          shimmerColors={["#919191", "#767676", "#919191"]}
        />
      </View>
    </View>
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
        <Card style={styles.topCard}>
          <View style={styles.marketHeader}>
            <Text style={styles.marketTitle}>{i18n.t("marketIntelTitle")}</Text>
          </View>
        </Card>

        {/* Best Lines Section */}
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
                  <View key={index} style={styles.lineItem}>
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
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No best lines data available</Text>
                </View>
              )}
            </View>
          </View>
        </Card>

        {/* Consensus Lines Section */}
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
                      <Text style={styles.columnHeaderText}>Home Win</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>Draw</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>Away Win</Text>
                    </View>
                  </View>

                  {/* Single Match Winner Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Image
                        source={require("../assets/images/logo.png")}
                        style={styles.teamLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.teamName}>Match Winner</Text>
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
                <Text style={styles.emptyStateText}>No consensus lines data available</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Public vs Sharp Meter Card */}
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
                    {marketResult.marketIntelligence.sharpMeter.line3 || "No comparison available"}
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
              <Text style={styles.emptyStateText}>No sharp meter data available</Text>
            </View>
          )}
        </Card>

        {/* Market Efficiency Card */}
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
              <Text style={styles.emptyStateText}>No market efficiency data available</Text>
            </View>
          )}
        </Card>

        {/* Odds Table Card */}
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
                  <View key={`soccer-${index}`} style={styles.oddsTableRow}>
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
                  </View>
                ))}
              </View>
            ) : (
              // NFL/NBA: Team 1 and Team 2 sections with ML/Spread/Total
              <View style={styles.oddsTableContainer}>
                {/* Column Headers */}
                <View style={styles.oddsTableHeaderRow}>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>{i18n.t("marketIntelMoneyline").toUpperCase()}</Text>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>{i18n.t("marketIntelSpread").toUpperCase()}</Text>
                  <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCellLast]}>{i18n.t("marketIntelTotal").toUpperCase()}S</Text>
                </View>

                {/* Team 1 Section */}
                <Text style={styles.oddsTableTeamName}>{getTeamDisplayName(params.team1)}</Text>

            {/* Dynamic Bookmaker Rows for Team 1 */}
            {marketResult.marketIntelligence.oddsTable.slice(0, 3).map((bookmaker, index) => (
              <View key={`team1-${index}`} style={styles.oddsTableRow}>
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
              </View>
            ))}

            {/* Team 2 Section */}
            <Text style={styles.oddsTableTeamName}>{getTeamDisplayName(params.team2)}</Text>

            {/* Dynamic Bookmaker Rows for Team 2 */}
            {marketResult.marketIntelligence.oddsTable.slice(0, 3).map((bookmaker, index) => (
              <View key={`team2-${index}`} style={styles.oddsTableRow}>
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
              </View>
            ))}
              </View>
            )
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No odds table data available</Text>
            </View>
          )}
        </Card>

        {/* Vig Analysis Card */}
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
                      <Text style={styles.columnHeaderText}>Home Win</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>Draw</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>Away Win</Text>
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
                <Text style={styles.emptyStateText}>No vig analysis data available</Text>
              </View>
            )}
          </View>
        </Card>

        {/* Fair Value Card */}
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
                      <Text style={styles.columnHeaderText}>Home Win</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>Draw</Text>
                    </View>
                    <View style={styles.dataColumn}>
                      <Text style={styles.columnHeaderText}>Away Win</Text>
                    </View>
                  </View>

                  {/* Single Fair Value Row */}
                  <View style={styles.tableRow}>
                    <View style={styles.teamColumn}>
                      <Image
                        source={require("../assets/images/logo.png")}
                        style={styles.teamLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.teamName}>Fair Value</Text>
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
                <Text style={styles.emptyStateText}>No fair value data available</Text>
              </View>
            )}
          </View>
        </Card>

        {/* EV+ & Arb Opportunities Card */}
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
                  <View key={index} style={styles.lineItem}>
                    <Image
                      source={opportunity.icon === "x" ? require("../assets/images/noevopps.png") : getBookmakerLogo(opportunity.bookmaker)}
                      style={styles.bookmakerLogo}
                      contentFit="contain"
                    />
                    <View style={styles.lineTextContainer}>
                      <Text style={styles.opportunityBigText}>{opportunity.title}</Text>
                      <Text style={styles.lineSmallText}>{opportunity.description}</Text>
                    </View>
                  </View>
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
                    <Text style={styles.opportunityBigText}>No EV+ Opportunities</Text>
                    <Text style={styles.lineSmallText}>No EV+ or arbitrage opportunities available</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Card>

        {/* Get Fresh Odds Button */}
        <View style={styles.buttonContainer}>
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <Pressable style={styles.freshOddsButton} onPress={refreshMarketIntelligence}>
              <Text style={styles.freshOddsButtonText}>{i18n.t("marketIntelFreshOdds")}</Text>
            </Pressable>
          </Animated.View>

          {/* Cooldown Message */}
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
      <TopBar showBack={false} />
      <Animated.View style={[styles.mainContainer, animatedStyle]}>
        {isLoading ? renderShimmer() : renderMarketContent()}
      </Animated.View>

      {/* Floating Bottom Nav */}
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
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 120, // Extra padding for FloatingBottomNav
  },
  shimmerContainer: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 20,
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#FF5252",
    fontSize: 16,
    textAlign: "center",
    fontFamily: "Aeonik-Regular",
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    fontFamily: "Aeonik-Regular",
  },
  topCard: {
    height: 85.87,
  },
  marketHeader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13.44,
    paddingHorizontal: 22,
  },
  marketTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#FFFFFF",
  },
  bestLinesCard: {
    marginTop: 16,
  },
  bestLinesContent: {
    paddingVertical: 22,
    paddingHorizontal: 0,
  },
  bestLinesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    marginBottom: 20,
  },
  bestLinesTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  bestLinesInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  linesList: {
    gap: 36,
  },
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20.15,
    gap: 16,
  },
  bookmakerLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  lineTextContainer: {
    flex: 1,
    gap: 4,
  },
  lineBigText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.5,
    color: "#FFFFFF",
  },
  lineSmallText: {
    fontFamily: "Aeonik-Light",
    fontSize: 14,
    color: "#FFFFFF",
    opacity: 0.7,
  },
  consensusLinesCard: {
    marginTop: 16,
  },
  consensusLinesContent: {
    paddingVertical: 22,
    paddingHorizontal: 0,
  },
  consensusLinesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    marginBottom: 20,
  },
  consensusLinesTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  consensusLinesInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  consensusTable: {
    paddingHorizontal: 20.15,
    gap: 12,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  teamColumn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dataColumn: {
    flex: 0.85,
    alignItems: "center",
  },
  dataCell: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#212121",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  columnHeaderText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 11,
    color: "#FFFFFF",
  },
  teamLogo: {
    width: 40.31,
    height: 40.31,
  },
  teamName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
  },
  dataValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 12,
    color: "#FFFFFF",
  },
  dataSecondary: {
    fontFamily: "Aeonik-Medium",
    fontSize: 12,
    color: "#FFFFFF",
    opacity: 0.5,
  },
  publicSharpCard: {
    marginTop: 16,
  },
  publicSharpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    paddingTop: 22,
    paddingBottom: 16,
  },
  publicSharpTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  publicSharpInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  publicSharpContent: {
    flexDirection: "row",
    paddingHorizontal: 31.91,
    paddingBottom: 22,
    justifyContent: "space-between",
    alignItems: "center",
  },
  publicSharpLeft: {
    flex: 1,
    gap: 12,
  },
  publicSharpRight: {
    marginLeft: 20,
    marginTop: -30,
    marginRight: -10,
  },
  publicSharpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  publicSharpRowBordered: {
    borderTopWidth: 0.2,
    borderBottomWidth: 0.2,
    borderColor: "#686868",
    paddingVertical: 12,
  },
  publicSharpText: {
    fontFamily: "Aeonik-Light",
    fontSize: 12,
    color: "#FFFFFF",
  },
  marketEfficiencyCard: {
    marginTop: 16,
  },
  marketEfficiencyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    paddingTop: 22,
    paddingBottom: 16,
  },
  marketEfficiencyTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  marketEfficiencyInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  marketEfficiencyContent: {
    paddingHorizontal: 31.91,
    paddingBottom: 22,
    gap: 12,
  },
  progressBarContainer: {
    gap: 8,
  },
  progressBarLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressBarLabel: {
    fontFamily: "Aeonik-Regular",
    fontSize: 10,
    color: "#FFFFFF",
    opacity: 0.6,
  },
  marketEfficiencyDescription: {
    fontFamily: "Aeonik-Regular",
    fontSize: 12,
    color: "#FFFFFF",
    opacity: 0.8,
  },
  oddsTableCard: {
    marginTop: 16,
  },
  oddsTableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    paddingTop: 22,
    paddingBottom: 16,
  },
  oddsTableTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  oddsTableInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  oddsTableContainer: {
    paddingHorizontal: 20.15,
    paddingBottom: 22,
  },
  oddsTableHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  oddsTableColumnHeader: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
    paddingVertical: 12,
  },
  oddsTableColumnHeaderCell: {
    borderRightWidth: 0.5,
    borderRightColor: "#2A2A2A",
  },
  oddsTableColumnHeaderCellLast: {
    borderRightWidth: 0,
  },
  oddsTableTeamName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
    paddingVertical: 12,
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  oddsTableRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  oddsTableCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRightWidth: 0.5,
    borderRightColor: "#2A2A2A",
  },
  oddsTableLogo: {
    width: 30.23,
    height: 30.23,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  oddsTableValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  oddsTableMultiValue: {
    gap: 4,
    alignItems: "center",
  },
  oddsTableCellLast: {
    borderRightWidth: 0,
  },
  opportunityLogo: {
    width: 40.31,
    height: 40.31,
  },
  opportunityTextContainer: {
    flex: 1,
    gap: 4,
  },
  opportunityBigText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 15,
    color: "#0BFF13",
  },
  opportunitySmallText: {
    fontFamily: "Aeonik-Regular",
    fontSize: 14,
    color: "#FFFFFF",
  },
  buttonContainer: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  freshOddsButton: {
    width: 176.35,
    height: 43.67,
    backgroundColor: "#00C2E0",
    borderRadius: 33.59,
    justifyContent: "center",
    alignItems: "center",
  },
  freshOddsButtonText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
  },
  cooldownMessage: {
    fontFamily: "Aeonik-Regular",
    fontSize: 13,
    color: "#888888",
    marginTop: 8,
    textAlign: "center",
  },
  // Shimmer Styles
  marketTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "70%",
  },
  bestLinesTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "40%",
  },
  bestLinesInfoShimmer: {
    height: 17,
    borderRadius: 6,
    width: 20,
  },
  lineBigTextShimmer: {
    height: 17,
    borderRadius: 6,
    width: "80%",
  },
  lineSmallTextShimmer: {
    height: 14,
    borderRadius: 5,
    width: "60%",
    marginTop: 4,
  },
  consensusLinesTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "50%",
  },
  consensusLinesInfoShimmer: {
    height: 17,
    borderRadius: 6,
    width: 20,
  },
  columnHeaderTextShimmer: {
    height: 11,
    borderRadius: 4,
    width: "80%",
  },
  teamNameShimmer: {
    height: 14,
    borderRadius: 6,
    width: "60%",
    marginTop: 12,
  },
  dataValueShimmer: {
    height: 12,
    borderRadius: 4,
    width: "60%",
  },
  dataSecondaryShimmer: {
    height: 12,
    borderRadius: 4,
    width: "40%",
    marginTop: 2,
    opacity: 0.5,
  },
  publicSharpTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "60%",
  },
  publicSharpInfoShimmer: {
    height: 17,
    borderRadius: 6,
    width: 20,
  },
  publicSharpTextShimmer: {
    height: 12,
    borderRadius: 5,
    width: "90%",
  },
  gaugeShimmer: {
    height: 120,
    width: 120,
    borderRadius: 60,
  },
  marketEfficiencyTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "50%",
  },
  marketEfficiencyInfoShimmer: {
    height: 17,
    borderRadius: 6,
    width: 20,
  },
  progressBarShimmer: {
    height: 5,
    borderRadius: 20,
    width: "100%",
  },
  progressBarLabelShimmer: {
    height: 10,
    borderRadius: 4,
    width: 30,
  },
  marketEfficiencyDescriptionShimmer: {
    height: 12,
    borderRadius: 5,
    width: "85%",
    marginTop: 12,
  },
  oddsTableTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "45%",
  },
  oddsTableInfoShimmer: {
    height: 17,
    borderRadius: 6,
    width: 20,
  },
  oddsTableColumnHeaderShimmer: {
    height: 14,
    borderRadius: 6,
    width: "90%",
    marginVertical: 12,
  },
  oddsTableColumnHeaderCellLast: {
    borderRightWidth: 0,
  },
  oddsTableTeamNameShimmer: {
    height: 14,
    borderRadius: 6,
    width: "30%",
    marginVertical: 12,
    marginHorizontal: 16,
  },
  oddsTableValueShimmer: {
    height: 14,
    borderRadius: 5,
    width: "60%",
  },
  freshOddsButtonShimmer: {
    height: 44,
    borderRadius: 34,
    width: 176,
  },
});
