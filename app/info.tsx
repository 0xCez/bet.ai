import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { TopBar } from "@/components/ui/TopBar";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import i18n from "@/i18n";


type InfoParams = {
  section?: string;
  from?: string;
  // Analysis data for FloatingBottomNav
  team1?: string;
  team2?: string;
  sport?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
  // State preservation for player/team stats
  selectedTeam?: string;
  selectedPlayer?: string;
};

export default function InfoPage() {
  const params = useLocalSearchParams<InfoParams>();
  const router = useRouter();

  const handleBack = () => {
    // Navigate to the specific page the user came from with analysis data
    if (params.from) {
      const queryParams: Record<string, string> = {};
      
      // Preserve analysis data
      if (params.team1) queryParams.team1 = params.team1;
      if (params.team2) queryParams.team2 = params.team2;
      if (params.sport) queryParams.sport = params.sport;
      if (params.team1Logo) queryParams.team1Logo = params.team1Logo;
      if (params.team2Logo) queryParams.team2Logo = params.team2Logo;
      if (params.analysisId) queryParams.analysisId = params.analysisId;
      
      // Preserve state for player/team stats pages
      if (params.selectedTeam) queryParams.selectedTeam = params.selectedTeam;
      if (params.selectedPlayer) queryParams.selectedPlayer = params.selectedPlayer;
      
      // Use replace to go back without adding to navigation stack
      router.replace({
        pathname: `/${params.from}` as any,
        params: queryParams,
      });
    } else {
      // Fallback to router.back() if no 'from' param
      router.back();
    }
  };

  // Determine which tab should be active based on the 'from' parameter
  const getActiveTab = () => {
    switch (params.from) {
      case 'market-intel':
        return 'market';
      case 'player-stats':
      case 'player-stats-soccer':
      case 'player-stats-nfl':
      case 'player-stats-nba':
        return 'players';
      case 'team-stats':
      case 'team-stats-soccer':
      case 'team-stats-nfl':
      case 'team-stats-nba':
        return 'teams';
      default:
        return 'market';
    }
  };

  // Get the appropriate info content based on the 'from' parameter
  const getInfoContent = () => {
    switch (params.from) {
      case 'market-intel':
        return {
          title: i18n.t("marketIntelInfoTitle"),
          coreKPIs: {
            title: i18n.t("marketIntelInfoBestLinesTitle"),
            content: i18n.t("marketIntelInfoBestLinesContent")
          },
          consensusLines: {
            title: i18n.t("marketIntelInfoConsensusLinesTitle"),
            content: i18n.t("marketIntelInfoConsensusLinesContent")
          },
          publicVsSharp: {
            title: i18n.t("marketIntelInfoPublicVsSharpTitle"),
            content: i18n.t("marketIntelInfoPublicVsSharpContent")
          },
          marketEfficiency: {
            title: i18n.t("marketIntelInfoMarketEfficiencyTitle"),
            content: i18n.t("marketIntelInfoMarketEfficiencyContent")
          },
          oddsTable: {
            title: i18n.t("marketIntelInfoOddsTableTitle"),
            content: i18n.t("marketIntelInfoOddsTableContent")
          },
          vigAnalysis: {
            title: i18n.t("marketIntelInfoVigAnalysisTitle"),
            content: i18n.t("marketIntelInfoVigAnalysisContent")
          },
          fairValue: {
            title: i18n.t("marketIntelInfoFairValueTitle"),
            content: i18n.t("marketIntelInfoFairValueContent")
          },
          evOpportunities: {
            title: i18n.t("marketIntelInfoEVOpportunitiesTitle"),
            content: i18n.t("marketIntelInfoEVOpportunitiesContent")
          }
        };
      case 'team-stats-soccer':
        return {
          title: i18n.t("teamStatsSoccerInfoTitle"),
          recentForm: {
            title: i18n.t("teamStatsSoccerInfoRecentFormTitle"),
            content: i18n.t("teamStatsSoccerInfoRecentFormContent")
          },
          momentum: {
            title: i18n.t("teamStatsSoccerInfoMomentumTitle"),
            content: i18n.t("teamStatsSoccerInfoMomentumContent")
          },
          goalsFor: {
            title: i18n.t("teamStatsSoccerInfoGoalsForTitle"),
            content: i18n.t("teamStatsSoccerInfoGoalsForContent")
          },
          goalsAgainst: {
            title: i18n.t("teamStatsSoccerInfoGoalsAgainstTitle"),
            content: i18n.t("teamStatsSoccerInfoGoalsAgainstContent")
          },
          goalDifference: {
            title: i18n.t("teamStatsSoccerInfoGoalDifferenceTitle"),
            content: i18n.t("teamStatsSoccerInfoGoalDifferenceContent")
          },
          cleanSheets: {
            title: i18n.t("teamStatsSoccerInfoCleanSheetsTitle"),
            content: i18n.t("teamStatsSoccerInfoCleanSheetsContent")
          },
          failedToScore: {
            title: i18n.t("teamStatsSoccerInfoFailedToScoreTitle"),
            content: i18n.t("teamStatsSoccerInfoFailedToScoreContent")
          },
          homeAwayRecord: {
            title: i18n.t("teamStatsSoccerInfoHomeAwayRecordTitle"),
            content: i18n.t("teamStatsSoccerInfoHomeAwayRecordContent")
          },
          formation: {
            title: i18n.t("teamStatsSoccerInfoFormationTitle"),
            content: i18n.t("teamStatsSoccerInfoFormationContent")
          },
          peakScoring: {
            title: i18n.t("teamStatsSoccerInfoPeakScoringTitle"),
            content: i18n.t("teamStatsSoccerInfoPeakScoringContent")
          },
          bestWorstResults: {
            title: i18n.t("teamStatsSoccerInfoBestWorstResultsTitle"),
            content: i18n.t("teamStatsSoccerInfoBestWorstResultsContent")
          },
          cards: {
            title: i18n.t("teamStatsSoccerInfoCardsTitle"),
            content: i18n.t("teamStatsSoccerInfoCardsContent")
          },
          trendGraph: {
            title: i18n.t("teamStatsSoccerInfoTrendGraphTitle"),
            content: i18n.t("teamStatsSoccerInfoTrendGraphContent")
          }
        };
      case 'player-stats-soccer':
        return {
          title: i18n.t("playerStatsSoccerInfoTitle"),
          goals: {
            title: i18n.t("playerStatsSoccerInfoGoalsTitle"),
            content: i18n.t("playerStatsSoccerInfoGoalsContent")
          },
          assists: {
            title: i18n.t("playerStatsSoccerInfoAssistsTitle"),
            content: i18n.t("playerStatsSoccerInfoAssistsContent")
          },
          goalsPerGame: {
            title: i18n.t("playerStatsSoccerInfoGoalsPerGameTitle"),
            content: i18n.t("playerStatsSoccerInfoGoalsPerGameContent")
          },
          shotAccuracy: {
            title: i18n.t("playerStatsSoccerInfoShotAccuracyTitle"),
            content: i18n.t("playerStatsSoccerInfoShotAccuracyContent")
          },
          passAccuracy: {
            title: i18n.t("playerStatsSoccerInfoPassAccuracyTitle"),
            content: i18n.t("playerStatsSoccerInfoPassAccuracyContent")
          },
          minutesPerGoal: {
            title: i18n.t("playerStatsSoccerInfoMinutesPerGoalTitle"),
            content: i18n.t("playerStatsSoccerInfoMinutesPerGoalContent")
          },
          shotsOnTarget: {
            title: i18n.t("playerStatsSoccerInfoShotsOnTargetTitle"),
            content: i18n.t("playerStatsSoccerInfoShotsOnTargetContent")
          },
          keyPasses: {
            title: i18n.t("playerStatsSoccerInfoKeyPassesTitle"),
            content: i18n.t("playerStatsSoccerInfoKeyPassesContent")
          },
          dribblesSuccess: {
            title: i18n.t("playerStatsSoccerInfoDribblesSuccessTitle"),
            content: i18n.t("playerStatsSoccerInfoDribblesSuccessContent")
          },
          cards: {
            title: i18n.t("playerStatsSoccerInfoCardsTitle"),
            content: i18n.t("playerStatsSoccerInfoCardsContent")
          }
        };
      case 'team-stats-nfl':
        return {
          title: i18n.t("teamStatsNFLInfoTitle"),
          recentForm: {
            title: i18n.t("teamStatsNFLInfoRecentFormTitle"),
            content: i18n.t("teamStatsNFLInfoRecentFormContent")
          },
          momentum: {
            title: i18n.t("teamStatsNFLInfoMomentumTitle"),
            content: i18n.t("teamStatsNFLInfoMomentumContent")
          },
          ppg: {
            title: i18n.t("teamStatsNFLInfoPPGTitle"),
            content: i18n.t("teamStatsNFLInfoPPGContent")
          },
          opponentPPG: {
            title: i18n.t("teamStatsNFLInfoOpponentPPGTitle"),
            content: i18n.t("teamStatsNFLInfoOpponentPPGContent")
          },
          totalYardsPerGame: {
            title: i18n.t("teamStatsNFLInfoTotalYardsPerGameTitle"),
            content: i18n.t("teamStatsNFLInfoTotalYardsPerGameContent")
          },
          passingYardsPerGame: {
            title: i18n.t("teamStatsNFLInfoPassingYardsPerGameTitle"),
            content: i18n.t("teamStatsNFLInfoPassingYardsPerGameContent")
          },
          rushingYardsPerGame: {
            title: i18n.t("teamStatsNFLInfoRushingYardsPerGameTitle"),
            content: i18n.t("teamStatsNFLInfoRushingYardsPerGameContent")
          },
          turnoverDifferential: {
            title: i18n.t("teamStatsNFLInfoTurnoverDifferentialTitle"),
            content: i18n.t("teamStatsNFLInfoTurnoverDifferentialContent")
          },
          homeAwayAVG: {
            title: i18n.t("teamStatsNFLInfoHomeAwayAVGTitle"),
            content: i18n.t("teamStatsNFLInfoHomeAwayAVGContent")
          },
          thirdDown: {
            title: i18n.t("teamStatsNFLInfo3rdDownTitle"),
            content: i18n.t("teamStatsNFLInfo3rdDownContent")
          },
          redZone: {
            title: i18n.t("teamStatsNFLInfoRedZoneTitle"),
            content: i18n.t("teamStatsNFLInfoRedZoneContent")
          },
          sacks: {
            title: i18n.t("teamStatsNFLInfoSacksTitle"),
            content: i18n.t("teamStatsNFLInfoSacksContent")
          },
          interceptions: {
            title: i18n.t("teamStatsNFLInfoInterceptionsTitle"),
            content: i18n.t("teamStatsNFLInfoInterceptionsContent")
          },
          penaltyYardsPerGame: {
            title: i18n.t("teamStatsNFLInfoPenaltyYardsPerGameTitle"),
            content: i18n.t("teamStatsNFLInfoPenaltyYardsPerGameContent")
          },
          fieldGoal: {
            title: i18n.t("teamStatsNFLInfoFieldGoalTitle"),
            content: i18n.t("teamStatsNFLInfoFieldGoalContent")
          },
          fourthDown: {
            title: i18n.t("teamStatsNFLInfo4thDownTitle"),
            content: i18n.t("teamStatsNFLInfo4thDownContent")
          },
          trendGraph: {
            title: i18n.t("teamStatsNFLInfoTrendGraphTitle"),
            content: i18n.t("teamStatsNFLInfoTrendGraphContent")
          }
        };
      case 'player-stats-nfl':
        return {
          title: i18n.t("playerStatsNFLInfoTitle"),
          passYardsPerGame: {
            title: i18n.t("playerStatsNFLInfoPassYardsPerGameTitle"),
            content: i18n.t("playerStatsNFLInfoPassYardsPerGameContent")
          },
          passTDs: {
            title: i18n.t("playerStatsNFLInfoPassTDsTitle"),
            content: i18n.t("playerStatsNFLInfoPassTDsContent")
          },
          completion: {
            title: i18n.t("playerStatsNFLInfoCompletionTitle"),
            content: i18n.t("playerStatsNFLInfoCompletionContent")
          },
          qbRating: {
            title: i18n.t("playerStatsNFLInfoQBRatingTitle"),
            content: i18n.t("playerStatsNFLInfoQBRatingContent")
          },
          rushYardsPerGame: {
            title: i18n.t("playerStatsNFLInfoRushYardsPerGameTitle"),
            content: i18n.t("playerStatsNFLInfoRushYardsPerGameContent")
          },
          rushTDs: {
            title: i18n.t("playerStatsNFLInfoRushTDsTitle"),
            content: i18n.t("playerStatsNFLInfoRushTDsContent")
          },
          interceptions: {
            title: i18n.t("playerStatsNFLInfoInterceptionsTitle"),
            content: i18n.t("playerStatsNFLInfoInterceptionsContent")
          },
          sacksTaken: {
            title: i18n.t("playerStatsNFLInfoSacksTakenTitle"),
            content: i18n.t("playerStatsNFLInfoSacksTakenContent")
          },
          longestPassRush: {
            title: i18n.t("playerStatsNFLInfoLongestPassRushTitle"),
            content: i18n.t("playerStatsNFLInfoLongestPassRushContent")
          },
          totalTouchdowns: {
            title: i18n.t("playerStatsNFLInfoTotalTouchdownsTitle"),
            content: i18n.t("playerStatsNFLInfoTotalTouchdownsContent")
          }
        };
      case 'team-stats-nba':
        return {
          title: i18n.t("teamStatsNBAInfoTitle"),
          recentForm: {
            title: i18n.t("teamStatsNBAInfoRecentFormTitle"),
            content: i18n.t("teamStatsNBAInfoRecentFormContent")
          },
          momentum: {
            title: i18n.t("teamStatsNBAInfoMomentumTitle"),
            content: i18n.t("teamStatsNBAInfoMomentumContent")
          },
          ppg: {
            title: i18n.t("teamStatsNBAInfoPPGTitle"),
            content: i18n.t("teamStatsNBAInfoPPGContent")
          },
          opponentPPG: {
            title: i18n.t("teamStatsNBAInfoOpponentPPGTitle"),
            content: i18n.t("teamStatsNBAInfoOpponentPPGContent")
          },
          fieldGoal: {
            title: i18n.t("teamStatsNBAInfoFieldGoalTitle"),
            content: i18n.t("teamStatsNBAInfoFieldGoalContent")
          },
          threePoints: {
            title: i18n.t("teamStatsNBAInfo3PointsTitle"),
            content: i18n.t("teamStatsNBAInfo3PointsContent")
          },
          rebounds: {
            title: i18n.t("teamStatsNBAInfoReboundsTitle"),
            content: i18n.t("teamStatsNBAInfoReboundsContent")
          },
          assists: {
            title: i18n.t("teamStatsNBAInfoAssistsTitle"),
            content: i18n.t("teamStatsNBAInfoAssistsContent")
          },
          homeAwayAVG: {
            title: i18n.t("teamStatsNBAInfoHomeAwayAVGTitle"),
            content: i18n.t("teamStatsNBAInfoHomeAwayAVGContent")
          },
          steals: {
            title: i18n.t("teamStatsNBAInfoStealsTitle"),
            content: i18n.t("teamStatsNBAInfoStealsContent")
          },
          blocks: {
            title: i18n.t("teamStatsNBAInfoBlocksTitle"),
            content: i18n.t("teamStatsNBAInfoBlocksContent")
          },
          turnoverDifferential: {
            title: i18n.t("teamStatsNBAInfoTurnoverDifferentialTitle"),
            content: i18n.t("teamStatsNBAInfoTurnoverDifferentialContent")
          },
          plusMinus: {
            title: i18n.t("teamStatsNBAInfoPlusMinusTitle"),
            content: i18n.t("teamStatsNBAInfoPlusMinusContent")
          },
          offDefRebounds: {
            title: i18n.t("teamStatsNBAInfoOffDefReboundsTitle"),
            content: i18n.t("teamStatsNBAInfoOffDefReboundsContent")
          },
          freeThrow: {
            title: i18n.t("teamStatsNBAInfoFreeThrowTitle"),
            content: i18n.t("teamStatsNBAInfoFreeThrowContent")
          },
          personalFouls: {
            title: i18n.t("teamStatsNBAInfoPersonalFoulsTitle"),
            content: i18n.t("teamStatsNBAInfoPersonalFoulsContent")
          },
          trendGraph: {
            title: i18n.t("teamStatsNBAInfoTrendGraphTitle"),
            content: i18n.t("teamStatsNBAInfoTrendGraphContent")
          }
        };
      case 'player-stats-nba':
        return {
          title: i18n.t("playerStatsNBAInfoTitle"),
          points: {
            title: i18n.t("playerStatsNBAInfoPointsTitle"),
            content: i18n.t("playerStatsNBAInfoPointsContent")
          },
          rebounds: {
            title: i18n.t("playerStatsNBAInfoReboundsTitle"),
            content: i18n.t("playerStatsNBAInfoReboundsContent")
          },
          assists: {
            title: i18n.t("playerStatsNBAInfoAssistsTitle"),
            content: i18n.t("playerStatsNBAInfoAssistsContent")
          },
          fg: {
            title: i18n.t("playerStatsNBAInfoFGTitle"),
            content: i18n.t("playerStatsNBAInfoFGContent")
          },
          threePT: {
            title: i18n.t("playerStatsNBAInfo3PTTitle"),
            content: i18n.t("playerStatsNBAInfo3PTContent")
          },
          minutes: {
            title: i18n.t("playerStatsNBAInfoMinutesTitle"),
            content: i18n.t("playerStatsNBAInfoMinutesContent")
          },
          steals: {
            title: i18n.t("playerStatsNBAInfoStealsTitle"),
            content: i18n.t("playerStatsNBAInfoStealsContent")
          },
          blocks: {
            title: i18n.t("playerStatsNBAInfoBlocksTitle"),
            content: i18n.t("playerStatsNBAInfoBlocksContent")
          },
          turnovers: {
            title: i18n.t("playerStatsNBAInfoTurnoversTitle"),
            content: i18n.t("playerStatsNBAInfoTurnoversContent")
          },
          ft: {
            title: i18n.t("playerStatsNBAInfoFTTitle"),
            content: i18n.t("playerStatsNBAInfoFTContent")
          }
        };
      default:
        return {
          title: "Guide 📊",
          coreKPIs: {
            title: "Information",
            content: "No specific information available for this section."
          }
        };
    }
  };

  const infoContent = getInfoContent();

  return (
    <ScreenBackground>
      <TopBar showBack={true} onBackPress={handleBack} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        <Card style={styles.infoCard}>
          <View style={styles.infoContent}>
            {Object.entries(infoContent).map(([key, section], index) => {
              if (key === 'title') return null; // Skip the title, we don't render it
              const sectionData = section as { title: string; content: string };
              return (
                <View key={key}>
                  <Text style={index === 0 ? styles.firstSectionTitle : styles.sectionTitle}>
                    {sectionData.title}
                  </Text>
                  <Text style={styles.infoText}>{sectionData.content}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      </ScrollView>

      {/* Floating Bottom Nav - only show if we have analysis data */}
      {params.team1 && params.team2 && params.sport && (
        <FloatingBottomNav
          activeTab={getActiveTab()}
          analysisData={{
            team1: params.team1,
            team2: params.team2,
            sport: params.sport,
            team1Logo: params.team1Logo,
            team2Logo: params.team2Logo,
            analysisId: params.analysisId,
          }}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 120, // Extra padding for FloatingBottomNav
  },
  infoCard: {
    marginTop: 16,
  },
  infoContent: {
    paddingVertical: 22,
    paddingHorizontal: 24,
  },
  infoTitle: {
    fontFamily: "Aeonik-Bold",
    fontSize: 24,
    color: "#FFFFFF",
    marginBottom: 30,
    textAlign: "center",
  },
  sectionTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#ffffff",
    marginTop: 0,
    marginBottom: 8,
  },
  firstSectionTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#ffffff",
    marginTop: 0,
    marginBottom: 8,
  },
  infoText: {
    fontFamily: "Aeonik-Regular",
    fontSize: 16,
    color: "#FFFFFF",
    lineHeight: 24,
    opacity: 0.9,
    marginBottom: 16,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    color: "#888888",
    fontSize: 16,
    textAlign: "center",
    fontFamily: "Aeonik-Regular",
  },
});
