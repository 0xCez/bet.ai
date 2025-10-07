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

// Static variables to persist market data between screen navigation
let cachedMarketResult: SoccerMarketIntelResult | null = null;
let cachedDisplayImageUrl: string | null = null;
let cachedParams: any = null;

// Track page view time
let pageEntryTime: number | null = null;

// Interface for Soccer Market Intelligence (3-way betting)
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
      primarySignal: string;
      secondarySignal: string;
      detailLine: string;
      gaugeValue: number;
      dataQuality: string;
    };
    vigAnalysis: {
      moneyline: {
        sharp: number;
        market: number;
      };
    };
    evOpportunities: {
      hasOpportunities: boolean;
      opportunities: Array<{
        type: string;
        title: string;
        description: string;
        icon: string;
        percentage?: number;
      }>;
      summary: string;
    };
    sharpConsensus: {
      moneyline: {
        home: number | null;
        draw: number | null;
        away: number | null;
      };
    };
    fairValue: {
      moneyline: {
        fairHome: number | null;
        fairDraw: number | null;
        fairAway: number | null;
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
          away: number;
          draw?: number;
        };
      };
    }>;
  };
}

export default function SoccerMarketIntel() {
  const params = useLocalSearchParams();
  const [marketResult, setMarketResult] = useState<SoccerMarketIntelResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
  const { hasActiveSubscription } = useRevenueCatPurchases();
  const posthog = usePostHog();
  const { fadeAnim, slideAnim } = usePageTransition();

  // Helper function to get bookmaker logo
  const getBookmakerLogo = (bookmakerKey: string) => {
    const logoMap: { [key: string]: any } = {
      pinnacle: require("../assets/images/Pinaccle.png"),
      fanduel: require("../assets/images/Fanduel.png"),
      draftkings: require("../assets/images/Draftkings.png"),
      betmgm: require("../assets/images/Betmgm.png"),
      caesars: require("../assets/images/Caesars.png"),
      pointsbet: require("../assets/images/Pointsbet.png"),
      fanatics: require("../assets/images/fanatics.png"), // Fallback
      mybookieag: require("../assets/images/mybookie.png"), // Fallback
    };
    return logoMap[bookmakerKey] || require("../assets/images/logo.png");
  };

  // Helper function to format odds
  const formatOdds = (odds: number) => {
    if (!odds || odds === 0) return "N/A";
    return odds.toFixed(2);
  };

  // Helper function to get team display name
  const getTeamDisplayName = (teamName: string) => {
    if (!teamName) return "Team";
    return teamName.length > 12 ? teamName.substring(0, 12) + "..." : teamName;
  };

  useEffect(() => {
    pageEntryTime = Date.now();

    console.log("Soccer Market Intel Params:", params);
    console.log("Team1:", params.team1, "Team2:", params.team2, "Sport:", params.sport);

    const currentParams = JSON.stringify(params);

    // Check if we have cached data for the same parameters
    if (cachedMarketResult && cachedParams === currentParams) {
      setMarketResult(cachedMarketResult);
      setDisplayImageUrl(cachedDisplayImageUrl);
      setLoading(false);
      return;
    }

    // For now, use test data until we fix the API integration
    const testSoccerData = {
      sport: "soccer",
      teams: {
        home: params.team1 || "Manchester City",
        away: params.team2 || "Everton",
        logos: {
          home: params.team1Logo || "",
          away: params.team2Logo || "",
        },
      },
      marketIntelligence: {
        bestLines: {
          consensusHomeML: 1.41,
          consensusDrawML: 4.7,
          consensusAwayML: 7.0,
          bestLines: [
            {
              type: "moneyline",
              label: "Best Home ML",
              odds: 1.43,
              bookmaker: "Pinnacle",
              team: params.team1 || "Manchester City"
            },
            {
              type: "moneyline",
              label: "Best Draw ML",
              odds: 5.0,
              bookmaker: "Fanatics",
              team: "Draw"
            },
            {
              type: "moneyline",
              label: "Best Away ML",
              odds: 7.5,
              bookmaker: "FanDuel",
              team: params.team2 || "Everton"
            }
          ],
          rawData: {
            totalMoneylines: 30
          }
        },
        sharpMeter: {
          primarySignal: "Soccer analysis",
          secondarySignal: "3-way betting",
          detailLine: "Home vs Draw vs Away",
          gaugeValue: 50,
          dataQuality: "good"
        },
        vigAnalysis: {
          moneyline: {
            sharp: 5,
            market: 6
          }
        },
        evOpportunities: {
          hasOpportunities: false,
          opportunities: [{
            type: "efficient",
            title: "Market efficiently priced",
            description: "No profitable opportunities found",
            icon: "x"
          }],
          summary: "Efficient market"
        },
        fairValue: {
          moneyline: {
            fairHome: 1.38,
            fairDraw: 4.5,
            fairAway: 6.8
          }
        },
        sharpConsensus: {
          moneyline: {
            home: 1.40,
            draw: 4.6,
            away: 6.9
          }
        },
        marketTightness: {
          tightness: "Normal",
          priceRange: 0.2,
          comment: "Soccer market analysis",
          summary: "Normal • Soccer market • 3-way betting"
        },
        oddsTable: [
          {
            bookmaker: "Pinnacle",
            bookmakerKey: "pinnacle",
            isSharp: true,
            odds: {
              moneyline: {
                home: 1.43,
                draw: 4.8,
                away: 7.2
              }
            }
          },
          {
            bookmaker: "FanDuel",
            bookmakerKey: "fanduel",
            isSharp: false,
            odds: {
              moneyline: {
                home: 1.40,
                draw: 5.0,
                away: 7.5
              }
            }
          },
          {
            bookmaker: "DraftKings",
            bookmakerKey: "draftkings",
            isSharp: false,
            odds: {
              moneyline: {
                home: 1.41,
                draw: 4.7,
                away: 7.0
              }
            }
          }
        ]
      }
    };

    setMarketResult(testSoccerData);
    setDisplayImageUrl(null);
    setLoading(false);
  }, [params]);

  const renderBestLinesCard = () => {
    const bestLines = marketResult?.marketIntelligence?.bestLines;
    if (!bestLines) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Best Lines ⚽</Text>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </View>

        <View style={styles.bestLinesContent}>
          {bestLines.bestLines?.map((line, index) => (
            <View key={index} style={styles.bestLineItem}>
              <View style={styles.bestLineLeft}>
                <Image
                  source={getBookmakerLogo(line.bookmaker?.toLowerCase())}
                  style={styles.bookmakerLogo}
                />
                <View style={styles.bestLineInfo}>
                  <Text style={styles.bestLineLabel}>{line.label}</Text>
                  <Text style={styles.bestLineTeam}>{getTeamDisplayName(line.team)}</Text>
                </View>
              </View>
              <Text style={styles.bestLineOdds}>{formatOdds(line.odds)}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderConsensusLinesCard = () => {
    const bestLines = marketResult?.marketIntelligence?.bestLines;
    if (!bestLines) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Consensus Lines ⚽</Text>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </View>

        <View style={styles.consensusLinesContent}>
          <View style={styles.consensusLineItem}>
            <View style={styles.consensusLineLeft}>
              <View style={styles.consensusIcon} />
              <View style={styles.consensusLineInfo}>
                <Text style={styles.consensusLineLabel}>Home Win</Text>
                <Text style={styles.consensusLineTeam}>{getTeamDisplayName(params.team1 as string)}</Text>
              </View>
            </View>
            <Text style={styles.consensusLineOdds}>{formatOdds(bestLines.consensusHomeML)}</Text>
          </View>

          <View style={styles.consensusLineItem}>
            <View style={styles.consensusLineLeft}>
              <View style={styles.consensusIcon} />
              <View style={styles.consensusLineInfo}>
                <Text style={styles.consensusLineLabel}>Draw</Text>
                <Text style={styles.consensusLineTeam}>Tie Game</Text>
              </View>
            </View>
            <Text style={styles.consensusLineOdds}>{formatOdds(bestLines.consensusDrawML)}</Text>
          </View>

          <View style={styles.consensusLineItem}>
            <View style={styles.consensusLineLeft}>
              <View style={styles.consensusIcon} />
              <View style={styles.consensusLineInfo}>
                <Text style={styles.consensusLineLabel}>Away Win</Text>
                <Text style={styles.consensusLineTeam}>{getTeamDisplayName(params.team2 as string)}</Text>
              </View>
            </View>
            <Text style={styles.consensusLineOdds}>{formatOdds(bestLines.consensusAwayML)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSharpMeterCard = () => {
    const sharpMeter = marketResult?.marketIntelligence?.sharpMeter;
    if (!sharpMeter) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Sharp Meter ⚽</Text>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </View>

        <View style={styles.sharpMeterContent}>
          <View style={styles.sharpMeterLeft}>
            <Text style={styles.sharpMeterPrimary}>{sharpMeter.primarySignal}</Text>
            <Text style={styles.sharpMeterSecondary}>{sharpMeter.secondarySignal}</Text>
            <Text style={styles.sharpMeterDetail}>{sharpMeter.detailLine}</Text>
          </View>
          <View style={styles.sharpMeterRight}>
            <View style={styles.circularGauge}>
              <Text style={styles.gaugeValue}>{sharpMeter.gaugeValue}</Text>
              <Text style={styles.gaugeLabel}>3-Way</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderFairValueCard = () => {
    const fairValue = marketResult?.marketIntelligence?.fairValue;
    if (!fairValue?.moneyline) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Fair Value ⚽</Text>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </View>

        <View style={styles.consensusLinesContent}>
          <View style={styles.consensusLineItem}>
            <View style={styles.consensusLineLeft}>
              <View style={styles.consensusIcon} />
              <View style={styles.consensusLineInfo}>
                <Text style={styles.consensusLineLabel}>Fair Home</Text>
                <Text style={styles.consensusLineTeam}>{getTeamDisplayName(params.team1 as string)}</Text>
              </View>
            </View>
            <Text style={styles.fairValueOdds}>{formatOdds(fairValue.moneyline.fairHome)}</Text>
          </View>

          <View style={styles.consensusLineItem}>
            <View style={styles.consensusLineLeft}>
              <View style={styles.consensusIcon} />
              <View style={styles.consensusLineInfo}>
                <Text style={styles.consensusLineLabel}>Fair Draw</Text>
                <Text style={styles.consensusLineTeam}>Vig-Free</Text>
              </View>
            </View>
            <Text style={styles.fairValueOdds}>{formatOdds(fairValue.moneyline.fairDraw)}</Text>
          </View>

          <View style={styles.consensusLineItem}>
            <View style={styles.consensusLineLeft}>
              <View style={styles.consensusIcon} />
              <View style={styles.consensusLineInfo}>
                <Text style={styles.consensusLineLabel}>Fair Away</Text>
                <Text style={styles.consensusLineTeam}>{getTeamDisplayName(params.team2 as string)}</Text>
              </View>
            </View>
            <Text style={styles.fairValueOdds}>{formatOdds(fairValue.moneyline.fairAway)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderVigAnalysisCard = () => {
    const vigAnalysis = marketResult?.marketIntelligence?.vigAnalysis;
    if (!vigAnalysis) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Vig Analysis ⚽</Text>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </View>

        <View style={styles.vigAnalysisContent}>
          <View style={styles.vigAnalysisItem}>
            <View style={styles.vigAnalysisLeft}>
              <View style={styles.vigAnalysisIcon} />
              <View style={styles.vigAnalysisInfo}>
                <Text style={styles.vigAnalysisLabel}>Match Winner</Text>
                <Text style={styles.vigAnalysisTeam}>Home/Draw/Away</Text>
              </View>
            </View>
            <View style={styles.vigAnalysisRight}>
              <Text style={styles.vigAnalysisSharp}>{vigAnalysis.moneyline?.sharp || 0}%</Text>
              <Text style={styles.vigAnalysisMarket}>{vigAnalysis.moneyline?.market || 0}%</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderEVOpportunitiesCard = () => {
    const evOpportunities = marketResult?.marketIntelligence?.evOpportunities;
    if (!evOpportunities) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>EV+ & Arb Opportunities ⚽</Text>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </View>

        <View style={styles.evOpportunitiesContent}>
          {!evOpportunities.hasOpportunities ? (
            <View style={styles.noOpportunitiesContainer}>
              <View style={styles.noOpportunitiesIcon}>
                <Text style={styles.noOpportunitiesX}>✕</Text>
              </View>
              <Text style={styles.noOpportunitiesTitle}>Soccer Analysis in Progress</Text>
              <Text style={styles.noOpportunitiesDescription}>
                3-way betting requires specialized calculations
              </Text>
            </View>
          ) : (
            evOpportunities.opportunities?.map((opportunity, index) => (
              <View key={index} style={styles.evOpportunityItem}>
                <View style={styles.evOpportunityLeft}>
                  <View style={styles.evOpportunityIcon} />
                  <View style={styles.evOpportunityInfo}>
                    <Text style={styles.evOpportunityTitle}>{opportunity.title}</Text>
                    <Text style={styles.evOpportunityDescription}>{opportunity.description}</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  const renderOddsTableCard = () => {
    const oddsTable = marketResult?.marketIntelligence?.oddsTable;
    if (!oddsTable || oddsTable.length === 0) return null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Odds Table ⚽</Text>
          <Text style={styles.infoIcon}>ⓘ</Text>
        </View>

        <View style={styles.oddsTableContent}>
          {/* Header Row */}
          <View style={styles.oddsTableHeader}>
            <Text style={styles.oddsTableHeaderText}>Bookmaker</Text>
            <Text style={styles.oddsTableHeaderText}>Home</Text>
            <Text style={styles.oddsTableHeaderText}>Draw</Text>
            <Text style={styles.oddsTableHeaderText}>Away</Text>
          </View>

          {/* Bookmaker Rows */}
          {oddsTable.slice(0, 5).map((bookmaker, index) => (
            <View key={index} style={styles.oddsTableRow}>
              <View style={styles.oddsTableBookmaker}>
                <Image
                  source={getBookmakerLogo(bookmaker.bookmakerKey)}
                  style={styles.oddsTableLogo}
                />
                <Text style={styles.oddsTableBookmakerName}>
                  {bookmaker.bookmaker.length > 8
                    ? bookmaker.bookmaker.substring(0, 8) + "..."
                    : bookmaker.bookmaker}
                </Text>
              </View>
              <Text style={styles.oddsTableOdds}>
                {formatOdds(bookmaker.odds.moneyline.home)}
              </Text>
              <Text style={styles.oddsTableOdds}>
                {formatOdds(bookmaker.odds.moneyline.draw || 0)}
              </Text>
              <Text style={styles.oddsTableOdds}>
                {formatOdds(bookmaker.odds.moneyline.away)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ScreenBackground>
        <TopBar
          title="Soccer Market Intel"
          onBackPress={() => router.back()}
        />
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.loadingContainer}>
            <ShimmerPlaceholder style={styles.shimmerCard} />
            <ShimmerPlaceholder style={styles.shimmerCard} />
            <ShimmerPlaceholder style={styles.shimmerCard} />
          </View>
        </ScrollView>
      </ScreenBackground>
    );
  }

  if (error) {
    return (
      <ScreenBackground>
        <TopBar
          title="Soccer Market Intel"
          onBackPress={() => router.back()}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <BorderButton
            title="Try Again"
            onPress={() => {
              cachedMarketResult = null;
              cachedParams = null;
              setError(null);
              setLoading(true);
            }}
          />
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <TopBar
        title="Soccer Market Intel"
        onBackPress={() => router.back()}
      />

      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.content, { transform: [{ translateY: slideAnim }] }]}>

            {/* Best Lines Card */}
            {renderBestLinesCard()}

            {/* Consensus Lines Card */}
            {renderConsensusLinesCard()}

            {/* Fair Value Card */}
            {renderFairValueCard()}

            {/* Sharp Meter Card */}
            {renderSharpMeterCard()}

            {/* Vig Analysis Card */}
            {renderVigAnalysisCard()}

            {/* EV+ & Arb Opportunities Card */}
            {renderEVOpportunitiesCard()}

            {/* Odds Table Card */}
            {renderOddsTableCard()}

            <View style={styles.bottomPadding} />
          </Animated.View>
        </ScrollView>
      </Animated.View>

      <FloatingBottomNav
        activeTab="market"
        analysisData={{
          team1: params.team1 as string,
          team2: params.team2 as string,
          sport: "soccer",
          team1Logo: params.team1Logo as string,
          team2Logo: params.team2Logo as string,
        }}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  shimmerCard: {
    height: 120,
    borderRadius: 20,
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#212121",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  infoIcon: {
    color: "#666666",
    fontSize: 16,
  },

  // Best Lines Styles
  bestLinesContent: {
    gap: 12,
  },
  bestLineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  bestLineLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  bookmakerLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  bestLineInfo: {
    flex: 1,
  },
  bestLineLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  bestLineTeam: {
    color: "#999999",
    fontSize: 12,
    marginTop: 2,
  },
  bestLineOdds: {
    color: "#00FF88",
    fontSize: 16,
    fontWeight: "600",
  },

  // Consensus Lines Styles
  consensusLinesContent: {
    gap: 12,
  },
  consensusLineItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  consensusLineLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  consensusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#333333",
    marginRight: 12,
  },
  consensusLineInfo: {
    flex: 1,
  },
  consensusLineLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  consensusLineTeam: {
    color: "#999999",
    fontSize: 12,
    marginTop: 2,
  },
  consensusLineOdds: {
    color: "#00DDFF",
    fontSize: 16,
    fontWeight: "600",
  },
  fairValueOdds: {
    color: "#FF9500",
    fontSize: 16,
    fontWeight: "600",
  },

  // Sharp Meter Styles
  sharpMeterContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sharpMeterLeft: {
    flex: 1,
  },
  sharpMeterPrimary: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sharpMeterSecondary: {
    color: "#999999",
    fontSize: 14,
    marginBottom: 2,
  },
  sharpMeterDetail: {
    color: "#666666",
    fontSize: 12,
  },
  sharpMeterRight: {
    alignItems: "center",
  },
  circularGauge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#00DDFF",
  },
  gaugeValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  gaugeLabel: {
    color: "#999999",
    fontSize: 10,
  },

  // Vig Analysis Styles
  vigAnalysisContent: {
    gap: 12,
  },
  vigAnalysisItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  vigAnalysisLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  vigAnalysisIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#333333",
    marginRight: 12,
  },
  vigAnalysisInfo: {
    flex: 1,
  },
  vigAnalysisLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  vigAnalysisTeam: {
    color: "#999999",
    fontSize: 12,
    marginTop: 2,
  },
  vigAnalysisRight: {
    alignItems: "flex-end",
  },
  vigAnalysisSharp: {
    color: "#00FF88",
    fontSize: 14,
    fontWeight: "600",
  },
  vigAnalysisMarket: {
    color: "#999999",
    fontSize: 12,
    marginTop: 2,
  },

  // EV Opportunities Styles
  evOpportunitiesContent: {
    gap: 12,
  },
  noOpportunitiesContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  noOpportunitiesIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  noOpportunitiesX: {
    color: "#FF6B6B",
    fontSize: 18,
    fontWeight: "600",
  },
  noOpportunitiesTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  noOpportunitiesDescription: {
    color: "#999999",
    fontSize: 14,
    textAlign: "center",
  },
  evOpportunityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  evOpportunityLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  evOpportunityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#333333",
    marginRight: 12,
  },
  evOpportunityInfo: {
    flex: 1,
  },
  evOpportunityTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  evOpportunityDescription: {
    color: "#999999",
    fontSize: 12,
    marginTop: 2,
  },

  // Odds Table Styles
  oddsTableContent: {
    gap: 8,
  },
  oddsTableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  oddsTableHeaderText: {
    color: "#999999",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  oddsTableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  oddsTableBookmaker: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  oddsTableLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  oddsTableBookmakerName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  oddsTableOdds: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    textAlign: "center",
  },
  bottomPadding: {
    height: 100,
  },
});
