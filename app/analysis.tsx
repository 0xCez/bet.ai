import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import type { ParamListBase } from "@react-navigation/native";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import { LinearGradient } from "expo-linear-gradient";
import APIService from "../services/api";
import {
  MaterialCommunityIcons,
  MaterialIcons,
  Ionicons,
  FontAwesome5,
  Feather,
} from "@expo/vector-icons";
import { GradientButton } from "../components/ui/GradientButton";
import { BorderButton } from "@/components/ui/BorderButton";
import { TopBar } from "../components/ui/TopBar";
import { Card } from "@/components/ui/Card";
import { getNBATeamLogo, getNFLTeamLogo, getSoccerTeamLogo } from "@/utils/teamLogos";
import {
  doc,
  setDoc,
  collection,
  serverTimestamp,
  Timestamp,
  getDoc,
} from "firebase/firestore";
import { db, auth } from "../firebaseConfig"; // Assuming firebaseConfig.ts exports db and auth
import { BlurText } from "@/components/ui/BlurText";
import { FloatingBottomNav } from "../components/ui/FloatingBottomNav";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { usePostHog } from "posthog-react-native";
import * as Progress from "react-native-progress";
import i18n from "../i18n";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// No extra function needed for translations

// Static variables to persist analysis data between screen navigation
let cachedAnalysisResult: AnalysisResult | null = null;
let cachedDisplayImageUrl: string | null = null;
let cachedParams: any = null;
let cachedExpandedCards = {
  snapshot: false,
  xFactors: false,
  aiAnalysis: false,
};

// Track page view time
let pageEntryTime: number | null = null;

interface APIAnalysisResponse {
  teams?: {
    home?: string;
    away?: string;
    logos?: {
      home?: string;
      away?: string;
    };
  };
  keyInsights?: {
    confidence?: string;
    marketActivity?: string;
    lineShift?: string;
    publicVsSharps?: {
      public?: number;
      sharps?: number;
    };
  };
  matchSnapshot?: {
    recentPerformance?: {
      home?: string;
      away?: string;
    };
    headToHead?: string;
    momentum?: {
      home?: string;
      away?: string;
    };
  };
  xFactors?: Array<{
    title: string;
    detail: string;
    type?: number;
  }>;
  aiAnalysis?: {
    confidenceScore?: string;
    bettingSignal?: string;
    breakdown?: string;
  };
}

interface AnalysisResult {
  sport?: string; // Add sport field to match backend response
  teams: {
    home: string;
    away: string;
    logos: {
      home: string;
      away: string;
    };
  };
  keyInsights: {
    marketConsensus: {
      display: string;
      label: string;
    } | null;
    bestValue: {
      display: string;
      label: string;
    } | null;
    offensiveEdge: {
      display: string;
      label: string;
    } | null;
    defensiveEdge: {
      display: string;
      label: string;
    } | null;
  };
  matchSnapshot: {
    recentPerformance: {
      home: string;
      away: string;
    };
    headToHead: string;
    momentum: {
      home: string;
      away: string;
    };
  };
  xFactors: Array<{
    title: string;
    detail: string;
    type?: number;
  }>;
  aiAnalysis: {
    confidenceScore: string;
    bettingSignal: string;
    breakdown: string;
  };
  // Lightweight data for chatbot context (~4k total)
  marketIntelligence?: any;  // Small or null
  teamStats?: any;  // ~2k chars - reasonable for chatbot
}

// Type for the data passed from history screen (matches Firestore doc structure)
interface UserAnalysis {
  id: string;
  teams: string;
  // date field might not be directly in the top-level anymore if using analysis sub-object
  confidence: number; // This might be redundant if inside analysis obj
  imageUrl?: string;
  createdAt: Timestamp | { seconds: number; nanoseconds: number }; // Handle potential serialized timestamp
  analysis: AnalysisResult; // The nested analysis data used for display
  // Include other fields if necessary (e.g., aiRawResponse, imageData)
}

type AnalysisParams = {
  imageUri?: string;
  analysisId?: string;
  isDemo?: string;
};

export default function AnalysisScreen() {
  // Get both potential parameters
  const params = useLocalSearchParams<AnalysisParams>();
  const { isSubscribed } = useRevenueCatPurchases();
  const posthog = usePostHog();

  // Track page view time
  useEffect(() => {
    if (!auth.currentUser) return; // Only track for logged in users

    // Record entry time
    pageEntryTime = Date.now();

    // Track page entry
    posthog?.capture("analysis_page_viewed", {
      userId: auth.currentUser.uid,
      analysisId: params.analysisId,
      isDemo: params.isDemo === "true",
    });

    // Track page exit and time spent
    return () => {
      if (pageEntryTime && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTime;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture("analysis_page_exit", {
          userId: auth.currentUser.uid,
          analysisId: params.analysisId,
          isDemo: params.isDemo === "true",
          timeSpentSeconds: timeSpentSeconds,
          timeSpentMinutes: Math.round((timeSpentSeconds / 60) * 10) / 10, // Round to 1 decimal place
        });

        pageEntryTime = null;
      }
    };
  }, [params.analysisId, params.isDemo]);

  // Check if we're navigating with the same params
  // For demo mode, always force a fresh fetch to ensure we get the correct locale-specific content
  const isSameAnalysis =
    params.isDemo !== "true" && // Skip cache for demo mode
    cachedParams?.analysisId === params.analysisId &&
    cachedParams?.imageUri === params.imageUri &&
    cachedParams?.isDemo === params.isDemo;

  // Cache params for future comparison
  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const imageUri = params.imageUri;
  const analysisId = params.analysisId;
  const isDemo = params.isDemo === "true";

  const [showUnlockMessage, setShowUnlockMessage] = useState(false);
  const hasInitializedRef = React.useRef(false);
  const hasAnalysisSaved = React.useRef(false);

  // Initialize state, potentially from cache
  const [isLoading, setIsLoading] = useState(
    !isSameAnalysis || !cachedAnalysisResult
  );
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    isSameAnalysis && cachedAnalysisResult ? cachedAnalysisResult : null
  );
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(
    isSameAnalysis && cachedDisplayImageUrl ? cachedDisplayImageUrl : null
  );
  const [error, setError] = useState<string | null>(null);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(
    analysisId || null
  );
  const [expandedCards, setExpandedCards] = useState(
    isSameAnalysis
      ? { ...cachedExpandedCards, xFactors: true } // Ensure xFactors is always true initially
      : {
          snapshot: false,
          xFactors: true,
          aiAnalysis: false,
        }
  );

  const toggleCard = (cardName: "snapshot" | "xFactors" | "aiAnalysis") => {
    try {
      console.log(`Toggling card: ${cardName}, current state:`, expandedCards[cardName]);
      const newExpandedCards = {
        ...expandedCards,
        [cardName]: !expandedCards[cardName],
      };
      console.log(`New expanded cards state:`, newExpandedCards);
      setExpandedCards(newExpandedCards);
      cachedExpandedCards = newExpandedCards; // Update cached state
    } catch (error) {
      console.error(`Error toggling card ${cardName}:`, error);
    }
  };

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

  useEffect(() => {
    // Skip if already initialized
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Skip re-fetching if we're navigating back to the same analysis (but never skip for demo mode)
    if (isSameAnalysis && cachedAnalysisResult && params.isDemo !== "true") {
      setIsLoading(false);
      return;
    }

    // Reset cache when loading a new analysis
    if (!isSameAnalysis) {
      cachedAnalysisResult = null;
      cachedDisplayImageUrl = null;
    }

    const userId = auth.currentUser?.uid; // Get current user ID

    // --- History Flow ---
    if (analysisId) {
      if (userId) {
        console.log(
          `History Flow: Fetching analysis with ID: ${analysisId} for user: ${userId}`
        );
        if (isDemo) {
          fetchAnalysisById("piWQIzwI9tNXrNTgb5dWTqAjUrj2", analysisId);
        } else {
          fetchAnalysisById(userId, analysisId);
        }
      } else {
        if (isDemo) {
          fetchAnalysisById("piWQIzwI9tNXrNTgb5dWTqAjUrj2", analysisId);
        } else {
          // Handle case where analysisId is present but user is not logged in
          console.error(
            "History Flow Error: User not logged in but analysisId is present."
          );
          setError("Authentication error: Please log in to view history.");
        }
      }
    }
    // --- Creation Flow ---
    else if (imageUri) {
      console.log(
        `Creation Flow: Starting analysis for image URI: ${imageUri}`
      );
      getAIInsights(imageUri); // Pass imageUri to the function
    }
    // --- Error: No Valid Parameters ---
    else {
      console.error("Error: Neither analysisId nor imageUri provided.");
      setError("No image or analysis data provided.");
      setIsLoading(false);
    }
  }, [analysisId, imageUri, auth.currentUser, isSameAnalysis]);

  // --- Function to fetch analysis data by ID ---
  const fetchAnalysisById = async (userId: string, docId: string) => {
    setIsLoading(true);
    setError(null);
    setDisplayImageUrl(null); // Reset image URL on new fetch
    try {
      // Add artificial delay for demo mode
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const docRef = doc(db, "userAnalyses", userId, "analyses", docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("Fetched analysis data:", data);
        // Ensure the fetched data has the nested 'analysis' object
        if (data && data.analysis) {
          // Handle old analyses that don't have sport field - infer from team names
          let analysisData = data.analysis as AnalysisResult;

          // If no sport field, try to infer from team names or top-level
          if (!analysisData.sport) {
            console.warn("Analysis missing sport field, inferring from team names...");

            // Infer sport from team names
            const teamNames = (analysisData.teams?.home + " " + analysisData.teams?.away).toLowerCase();

            // NBA team keywords (unique identifiers)
            if (teamNames.includes("lakers") || teamNames.includes("celtics") ||
                teamNames.includes("warriors") || teamNames.includes("bulls") ||
                teamNames.includes("knicks") || teamNames.includes("heat") ||
                teamNames.includes("spurs") || teamNames.includes("mavericks") ||
                teamNames.includes("76ers") || teamNames.includes("nets") ||
                teamNames.includes("clippers") || teamNames.includes("nuggets") ||
                teamNames.includes("bucks") || teamNames.includes("suns") ||
                teamNames.includes("rockets") || teamNames.includes("cavaliers") ||
                teamNames.includes("raptors") || teamNames.includes("thunder") ||
                teamNames.includes("pelicans") || teamNames.includes("wizards") ||
                teamNames.includes("hornets") || teamNames.includes("jazz") ||
                teamNames.includes("kings") || teamNames.includes("trail blazers") ||
                teamNames.includes("grizzlies") || teamNames.includes("pacers") ||
                teamNames.includes("pistons") || teamNames.includes("timberwolves") ||
                teamNames.includes("magic") || teamNames.includes("hawks")) {
              analysisData.sport = "nba";
              console.log("Inferred sport as nba from team names");
            }
            // Soccer team keywords
            else if (teamNames.includes("palace") || teamNames.includes("bournemouth") ||
                teamNames.includes("united") || teamNames.includes("arsenal") ||
                teamNames.includes("chelsea") || teamNames.includes("liverpool") ||
                teamNames.includes("madrid") || teamNames.includes("barcelona") ||
                teamNames.includes("milan") || teamNames.includes("juventus") ||
                teamNames.includes("bayern") || teamNames.includes("everton") ||
                teamNames.includes("ajax") || teamNames.includes("brighton") ||
                teamNames.includes("fulham") || teamNames.includes("newcastle") ||
                teamNames.includes("southampton") || teamNames.includes("wolves") ||
                teamNames.includes("brentford") || teamNames.includes("villa") ||
                teamNames.includes("forest") || teamNames.includes("tottenham") ||
                teamNames.includes("leicester") || teamNames.includes("west ham")) {
              analysisData.sport = "soccer_epl";
              console.log("Inferred sport as soccer_epl from team names");
            } else {
              // Check top-level or default to nfl
              analysisData.sport = data.sport || "nfl";
              console.log(`Using top-level sport or defaulting to nfl: ${analysisData.sport}`);
            }
          }

          setAnalysisResult(analysisData);
          cachedAnalysisResult = analysisData; // Cache the result
          setCurrentAnalysisId(docId); // Set the current analysis ID
          console.log("Set analysis result from history:", analysisData);
          console.log("SPORT FROM HISTORY:", analysisData.sport);
          // Set the display image URL from the fetched data
          if (data.imageUrl) {
            setDisplayImageUrl(data.imageUrl);
            cachedDisplayImageUrl = data.imageUrl; // Cache the image URL
            console.log("Set display image URL from history:", data.imageUrl);
          } else {
            console.warn("Fetched history document missing imageUrl.");
          }
        } else {
          console.error(
            "Fetched document is missing the 'analysis' field.",
            data
          );
          setError("Failed to load analysis data structure.");
          setAnalysisResult(null);
        }
      } else {
        console.error(
          `Analysis document not found: userAnalyses/${userId}/analyses/${docId}`
        );
        setError("Analysis not found.");
        setAnalysisResult(null);
      }
    } catch (err) {
      console.error("Error fetching analysis by ID:", err);
      setError("Failed to fetch analysis details.");
      setAnalysisResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Renamed function to make it clear it's for creation flow ---
  const getAIInsights = async (uri: string) => {
    if (analysisResult) return;
    setIsLoading(true);
    setError(null);
    setDisplayImageUrl(null);
    try {
      console.log("Uploading image to Firebase Storage...");
      const downloadURL = await APIService.uploadImageAsync(uri);
      console.log("Image uploaded, URL:", downloadURL);
      setDisplayImageUrl(downloadURL);
      cachedDisplayImageUrl = downloadURL; // Cache the image URL

      console.log("Analyzing image...");
      const response = await APIService.analyzeImage(downloadURL);
      console.log("Analysis Response:", response);

      if (response.error) {
        throw new Error(response.error);
      }

      // Add status check here
      if (response.status === "false" || response.status === false) {
        throw new Error(
          response.message || "Failed to analyze image. Please try again."
        );
      }

      // Use response directly as it's already formatted
      const parsedResponse = response;
      console.log("Parsed Response:", parsedResponse);

      // Now use the parsed response
      console.log("=== KEY INSIGHTS DEBUG ===");
      console.log("Full parsedResponse:", JSON.stringify(parsedResponse, null, 2));
      console.log("keyInsightsNew:", parsedResponse?.keyInsightsNew);
      console.log("marketConsensus:", parsedResponse?.keyInsightsNew?.marketConsensus);
      console.log("bestValue:", parsedResponse?.keyInsightsNew?.bestValue);
      console.log("offensiveEdge:", parsedResponse?.keyInsightsNew?.offensiveEdge);
      console.log("defensiveEdge:", parsedResponse?.keyInsightsNew?.defensiveEdge);
      console.log("========================");

      const analysisData: AnalysisResult = {
        sport: parsedResponse?.sport || "", // ✅ CRITICAL FIX: Extract sport from API response
        teams: {
          home: parsedResponse?.teams?.home || "",
          away: parsedResponse?.teams?.away || "",
          logos: {
            home: parsedResponse?.teams?.logos?.home || "",
            away: parsedResponse?.teams?.logos?.away || "",
          },
        },
        keyInsights: {
          marketConsensus: parsedResponse?.keyInsightsNew?.marketConsensus || null,
          bestValue: parsedResponse?.keyInsightsNew?.bestValue || null,
          offensiveEdge: parsedResponse?.keyInsightsNew?.offensiveEdge || null,
          defensiveEdge: parsedResponse?.keyInsightsNew?.defensiveEdge || null,
        },
        matchSnapshot: {
          recentPerformance: {
            home: parsedResponse?.matchSnapshot?.recentPerformance?.home || "",
            away: parsedResponse?.matchSnapshot?.recentPerformance?.away || "",
          },
          headToHead: parsedResponse?.matchSnapshot?.headToHead || "",
          momentum: {
            home: parsedResponse?.matchSnapshot?.momentum?.home || "",
            away: parsedResponse?.matchSnapshot?.momentum?.away || "",
          },
        },
        xFactors: parsedResponse?.xFactors || [],
        aiAnalysis: {
          confidenceScore: parsedResponse?.aiAnalysis?.confidenceScore || "",
          bettingSignal: parsedResponse?.aiAnalysis?.bettingSignal || "",
          breakdown: parsedResponse?.aiAnalysis?.breakdown || "",
        },
        // Lightweight data for chatbot context (~4k chars total, not 80k)
        marketIntelligence: parsedResponse?.marketIntelligence,
        teamStats: parsedResponse?.teamStats,
      };

      console.log("=== ANALYSIS DATA CREATED ===");
      console.log("analysisData.keyInsights:", JSON.stringify(analysisData.keyInsights, null, 2));
      console.log("============================");

      setAnalysisResult(analysisData);
      cachedAnalysisResult = analysisData; // Cache the analysis data

      // --- Firestore Saving Logic (Only for creation flow) ---
      const userId = auth.currentUser?.uid;
      if (userId && !hasAnalysisSaved.current) {
        try {
          const userAnalysesCol = collection(
            db,
            "userAnalyses",
            userId,
            "analyses"
          );
          const newAnalysisRef = doc(userAnalysesCol);

          const analysisDataToSave = {
            teams: `${analysisData.teams.home} vs ${analysisData.teams.away}`,
            confidence: parseInt(analysisData.aiAnalysis.confidenceScore) || 50,
            sport: analysisData.sport || "nfl", // Add sport to top level for easier access
            imageUrl: downloadURL,
            createdAt: serverTimestamp(),
            analysis: analysisData,
          };

          await setDoc(newAnalysisRef, analysisDataToSave);
          hasAnalysisSaved.current = true; // Mark as saved
          setCurrentAnalysisId(newAnalysisRef.id); // Save the analysis ID to state
          console.log(
            "Analysis saved successfully to Firestore with ID:",
            newAnalysisRef.id
          );
        } catch (firestoreError) {
          console.error("Error saving analysis to Firestore:", firestoreError);
        }
      } else {
        console.warn(
          "User not logged in or analysis already saved. Skipping save to Firestore."
        );
      }
    } catch (err) {
      console.error("Error in getAIInsights:", err);
      setError(
        err instanceof Error ? err.message : "Failed to get AI insights"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const renderShimmer = () => (
    <View style={styles.shimmerContainer}>
      {/* Image Container */}
      <View style={styles.imageContainer}>
        <ShimmerPlaceholder
          style={styles.image}
          shimmerColors={["#919191", "#767676", "#919191"]}
        />
      </View>

      {/* Key Insights Card Skeleton */}
      <Card style={styles.keyInsightsCard}>
        <ShimmerPlaceholder
          style={styles.keyInsightsTitleShimmer}
          shimmerColors={["#919191", "#767676", "#919191"]}
        />

        <View style={styles.gridContainer}>
          {/* 4 Metric Items */}
          {[1, 2, 3, 4].map((index) => (
            <View key={index} style={styles.gridItem}>
              <View style={styles.metricContent}>
                <ShimmerPlaceholder
                  style={styles.kIcon}
                  shimmerColors={["#919191", "#767676", "#919191"]}
                />
                <View style={styles.metricTextContainer}>
                  <ShimmerPlaceholder
                    style={styles.metricValueShimmer}
                    shimmerColors={["#919191", "#767676", "#919191"]}
                  />
                  <ShimmerPlaceholder
                    style={styles.metricLabelShimmer}
                    shimmerColors={["#919191", "#767676", "#919191"]}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </Card>

      {/* Match Snapshot Row Skeleton */}
      <View style={styles.matchSnapshotRow}>
        {/* Home Team Card */}
        <Card style={styles.teamSnapshotCard}>
          <View style={styles.teamHeader}>
            <ShimmerPlaceholder
              style={styles.teamLogo}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.teamNameShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
          </View>
          <View style={styles.teamContent}>
            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />

            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
          </View>
        </Card>

        {/* Away Team Card */}
        <Card style={styles.teamSnapshotCard}>
          <View style={styles.teamHeader}>
            <ShimmerPlaceholder
              style={styles.teamLogo}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.teamNameShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
          </View>
          <View style={styles.teamContent}>
            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />

            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
          </View>
        </Card>
      </View>

      {/* X-Factors Card Skeleton */}
      <Card style={styles.xFactorsCard}>
        <View style={styles.xFactorsContent}>
          {/* Header */}
          <View style={styles.xFactorsHeader}>
            <ShimmerPlaceholder
              style={styles.xFactorsTitleShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
            <ShimmerPlaceholder
              style={styles.xFactorsInfoShimmer}
              shimmerColors={["#919191", "#767676", "#919191"]}
            />
          </View>

          {/* X-Factors List */}
          {[1, 2, 3].map((index) => (
            <View key={index} style={[styles.xFactorItem, index === 3 && styles.xFactorItemLast]}>
              <View style={styles.iconContainer}>
                <ShimmerPlaceholder
                  style={styles.xFactorIcon}
                  shimmerColors={["#919191", "#767676", "#919191"]}
                />
              </View>
              <View style={styles.xFactorTextContainer}>
                <ShimmerPlaceholder
                  style={styles.xFactorLabelShimmer}
                  shimmerColors={["#919191", "#767676", "#919191"]}
                />
                <ShimmerPlaceholder
                  style={styles.xFactorDetailShimmer}
                  shimmerColors={["#919191", "#767676", "#919191"]}
                />
              </View>
            </View>
          ))}
        </View>
      </Card>

      {/* AI Analysis Card Skeleton */}
      <Card style={styles.aiAnalysisCard}>
        <View style={[styles.aiAnalysisHeader, styles.collapsedHeader]}>
          <ShimmerPlaceholder
            style={styles.aiAnalysisTitleShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
          <ShimmerPlaceholder
            style={styles.aiChevronShimmer}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </View>
      </Card>
    </View>
  );

  const renderAnalysisContent = () => {
    console.log("Rendering analysis content with result:", analysisResult);
    console.log("Display Image URL:", displayImageUrl);

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
            ) : imageUri ? (
              <Image
                source={{ uri: imageUri }}
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
        {/* Image Container - Use displayImageUrl state */}
        <View style={styles.imageContainer}>
          {isDemo && displayImageUrl ? (
            // Use the image URL from the fetched Firestore document
            // This ensures the image matches the analysis data
            <Image
              source={{ uri: displayImageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : displayImageUrl ? (
            <Image
              source={{ uri: displayImageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            // Optional: Placeholder if no image URL is available yet
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}></Text>
            </View>
          )}
        </View>

        {/* <Text style={styles.sectionTitle}>AI Insights</Text>
        <Text style={styles.sectionContent}>
          {analysisResult?.aiInsights || "Waiting for AI insights..."}
        </Text> */}

        {/* Key Insights Card */}
        <Card style={styles.keyInsightsCard}>
          <Text style={styles.keyInsightsTitle}>Key Insights 💸</Text>

          <View style={styles.gridContainer}>
            {/* Market Consensus */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <Image
                  source={require("../assets/images/Fanduel.png")}
                  style={styles.kIcon}
                  contentFit="contain"
                />
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.marketConsensus?.display || "No consensus"}
                  </Text>
                  <Text style={styles.metricLabel}>
                    {analysisResult?.keyInsights?.marketConsensus?.label || "Market Consensus"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Best Value */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <Image
                  source={require("../assets/images/Draftkings.png")}
                  style={styles.kIcon}
                  contentFit="contain"
                />
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.bestValue?.display || "N/A"}
                  </Text>
                  <Text style={styles.metricLabel}>
                    {analysisResult?.keyInsights?.bestValue?.label || "Best Value"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Offensive Edge */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <Image
                  source={getTeamLogo(analysisResult?.teams?.home || "", analysisResult?.sport)}
                  style={styles.kIcon}
                  contentFit="contain"
                />
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.offensiveEdge?.display || "N/A"}
                  </Text>
                  <Text style={styles.metricLabel}>
                    {analysisResult?.keyInsights?.offensiveEdge?.label || "Offensive Edge"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Defensive Edge */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <Image
                  source={getTeamLogo(analysisResult?.teams?.away || "", analysisResult?.sport)}
                  style={styles.kIcon}
                  contentFit="contain"
                />
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.defensiveEdge?.display || "N/A"}
                  </Text>
                  <Text style={styles.metricLabel}>
                    {analysisResult?.keyInsights?.defensiveEdge?.label || "Defensive Edge"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Match Snapshot Section */}
        <View style={styles.matchSnapshotRow}>
          {/* Home Team Card */}
          <Card style={styles.teamSnapshotCard}>
            <View style={styles.teamHeader}>
                  <Image
                    source={getTeamLogo(analysisResult?.teams.home || "", analysisResult?.sport)}
                    style={styles.teamLogo}
                    contentFit="contain"
                  />
              <Text style={styles.teamName}>{analysisResult?.teams.home}</Text>
            </View>
            <View style={styles.teamContent}>
              <Text style={styles.teamSectionLabel}>
                {i18n.t("analysisRecentPerformances")}
              </Text>
              <BlurText card="ms-1" blur={!auth.currentUser} style={styles.teamSectionValue}>
                {analysisResult?.matchSnapshot.recentPerformance.home}
              </BlurText>

              <Text style={styles.teamSectionLabel}>
                {i18n.t("analysisMomentumIndicator")}
              </Text>
              <BlurText card="ms-3" blur={!auth.currentUser} style={styles.teamSectionValue}>
                {analysisResult?.matchSnapshot.momentum.home}
              </BlurText>
            </View>
          </Card>

          {/* Away Team Card */}
          <Card style={styles.teamSnapshotCard}>
            <View style={styles.teamHeader}>
                  <Image
                    source={getTeamLogo(analysisResult?.teams.away || "", analysisResult?.sport)}
                    style={styles.teamLogo}
                    contentFit="contain"
                  />
              <Text style={styles.teamName}>{analysisResult?.teams.away}</Text>
            </View>
            <View style={styles.teamContent}>
              <Text style={styles.teamSectionLabel}>
                {i18n.t("analysisRecentPerformances")}
              </Text>
              <BlurText card="ms-2" blur={!auth.currentUser} style={styles.teamSectionValue}>
                {analysisResult?.matchSnapshot.recentPerformance.away}
              </BlurText>

              <Text style={styles.teamSectionLabel}>
                {i18n.t("analysisMomentumIndicator")}
              </Text>
              <BlurText card="ms-3" blur={!auth.currentUser} style={styles.teamSectionValue}>
                {analysisResult?.matchSnapshot.momentum.away}
              </BlurText>
            </View>
          </Card>
        </View>

        {/* X-Factors Card */}
        <Card style={styles.xFactorsCard}>
          <Pressable
            onPress={() => toggleCard("xFactors")}
            style={[
              styles.xFactorsHeader,
              !expandedCards.xFactors && styles.collapsedHeader,
            ]}
          >
            <Text style={styles.xFactorsTitle}>{i18n.t("analysisXFactors")}</Text>
            <Feather
              name={expandedCards.xFactors ? "chevron-up" : "chevron-down"}
              size={30}
              color="#FFFFFF"
            />
          </Pressable>
          {expandedCards.xFactors && (
            <View style={styles.xFactorsContent}>
              {/* X-Factors List */}
              {analysisResult?.xFactors.map((xFactor, index) => (
                <View key={index} style={[styles.xFactorItem, index === (analysisResult.xFactors.length - 1) && styles.xFactorItemLast]}>
                  <View style={styles.iconContainer}>
                    <Image
                      source={
                        xFactor.type === 1
                          ? require("../assets/images/icons/shield.svg") // Health & Availability
                          : xFactor.type === 2
                          ? require("../assets/images/icons/geo-tag.svg") // Location & Weather
                          : xFactor.type === 3
                          ? require("../assets/images/icons/whistle.svg") // Officiating & Rules
                          : xFactor.type === 4
                          ? require("../assets/images/icons/plane.svg") // Travel & Fatigue
                          : require("../assets/images/icons/shield.svg") // Default
                      }
                      style={styles.xFactorIcon}
                      contentFit="contain"
                    />
                  </View>
                  <View style={styles.xFactorTextContainer}>
                    <Text style={styles.xFactorLabel}>
                      {xFactor.type === 1
                        ? "Health & Availability"
                        : xFactor.type === 2
                        ? "Location & Weather"
                        : xFactor.type === 3
                        ? "Officiating & Rules"
                        : xFactor.type === 4
                        ? "Travel & Fatigue"
                        : xFactor.title}
                    </Text>
                    <BlurText
                      card={
                        xFactor.type === 1
                          ? "xf-1"
                          : xFactor.type === 2
                          ? "xf-2"
                          : xFactor.type === 3
                          ? "xf-3"
                          : xFactor.type === 4
                          ? "xf-4"
                          : "xf-1"
                      }
                      blur={!auth.currentUser}
                    >
                      {xFactor.detail}
                    </BlurText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* AI Analysis Card */}
        <Card style={styles.aiAnalysisCard}>
          <Pressable
            onPress={() => toggleCard("aiAnalysis")}
            style={[
              styles.aiAnalysisHeader,
              !expandedCards.aiAnalysis && styles.collapsedHeader,
            ]}
          >
            <Text style={styles.aiAnalysisTitle}>
              {i18n.t("analysisAIAnalysis")}
            </Text>
            <Feather
              name={expandedCards.aiAnalysis ? "chevron-up" : "chevron-down"}
              size={30}
              color="#FFFFFF"
            />
          </Pressable>
          {expandedCards.aiAnalysis && analysisResult?.aiAnalysis && (
            <View style={styles.aiAnalysisContent}>
              <View style={styles.aiMetricsContainer}>
                {/* Confidence Score */}
                <View style={styles.aiMetricBox}>
                  <View style={styles.aiIconBox}>
                    <Image
                      source={require("../assets/images/aa1.png")}
                      style={styles.snapshotIcon}
                      contentFit="contain"
                    />
                  </View>
                  <View>
                    <Text style={styles.aiMetricLabel}>
                      {i18n.t("analysisConfidenceScore")}
                    </Text>

                    {auth.currentUser ? (
                      <BlurText
                        card="ai-2"
                        blur={false}
                        style={styles.aiMetricValue}
                      >
                        {analysisResult?.aiAnalysis.confidenceScore}
                      </BlurText>
                    ) : (
                      <Image
                        source={require("../assets/images/ai-blur-1.png")}
                        style={{
                          width: "100%",
                          height: 20,
                          left: -24,
                          resizeMode: "contain",
                        }}
                      />
                    )}
                  </View>
                </View>

                {/* Betting Signal */}
                <View style={styles.aiMetricBox}>
                  <View style={styles.aiIconBox}>
                    <Image
                      source={require("../assets/images/aa2.png")}
                      style={styles.snapshotIcon}
                      contentFit="contain"
                    />
                  </View>
                  <View>
                    <Text style={styles.aiMetricLabel}>
                      {i18n.t("analysisBettingSignal")}
                    </Text>
                    {auth.currentUser ? (
                      <BlurText
                        card="ai-2"
                        blur={false}
                        style={styles.aiMetricValue}
                      >
                        {analysisResult?.aiAnalysis.bettingSignal}
                      </BlurText>
                    ) : (
                      <Image
                        source={require("../assets/images/ai-blur-2.png")}
                        style={{
                          width: "100%",
                          height: 20,
                          left: -10,
                          resizeMode: "contain",
                        }}
                      />
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.aiBreakdownContainer}>
                <Text style={styles.aiBreakdownTitle}>
                  {i18n.t("analysisBreakdown")}
                </Text>
                {auth.currentUser ? (
                  <BlurText
                    textColor="#FFFFFF"
                    card="ai-3"
                    lineHeight={18}
                    blur={false}
                  >
                    {analysisResult?.aiAnalysis.breakdown}
                  </BlurText>
                ) : (
                  <Image
                    source={require("../assets/images/aiblur.png")}
                    style={{
                      width: "100%",
                      height: 350,
                      resizeMode: "contain",
                    }}
                  />
                )}
              </View>
            </View>
          )}
        </Card>


        {isDemo && (
          <View style={styles.demoDebateContainer}>
            <BorderButton
              onPress={() => setShowUnlockMessage(true)}
              containerStyle={styles.floatingButton}
              borderColor="#00C2E0"
              backgroundColor="#00C2E020"
              opacity={1}
              borderWidth={1}
            >
              <Text style={styles.buttonText}>
                {i18n.t("analysisDebateWithAI")}
              </Text>
            </BorderButton>
            {showUnlockMessage && (
              <Text style={styles.unlockText}>
                {i18n.t("analysisUnlockPremium")}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <ScreenBackground hideBg>
      <TopBar onBackPress={() => router.replace("/")} />

      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Analysis Content */}
          <View style={styles.analysisContainer}>
            {isLoading ? renderShimmer() : renderAnalysisContent()}
          </View>
        </ScrollView>

        {/* Floating Bottom Navigation - Only show for non-demo */}
        {!isDemo && (
          <FloatingBottomNav
            activeTab="insight"
            analysisData={{
              team1: analysisResult?.teams?.home,
              team2: analysisResult?.teams?.away,
              sport: analysisResult?.sport,
              team1Logo: analysisResult?.teams?.logos?.home,
              team2Logo: analysisResult?.teams?.logos?.away,
              analysisId: currentAnalysisId || undefined,
            }}
          />
        )}

        {/* Floating Next Button */}
        {!isLoading && isDemo && (
          <View style={styles.floatingButtonContainer}>
            {isDemo && (
              <>
                <GradientButton
                  onPress={() => {
                    if (isSubscribed) {
                      console.log("User is subscribed, navigating to login.");
                      router.push("/login");
                    } else {
                      router.push("/paywall");
                    }
                  }}
                >
                  {i18n.t("analysisNext")}
                </GradientButton>
              </>
            )}
          </View>
        )}
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  demoDebateContainer: {
    marginBottom: 120,
  },
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
    paddingBottom: 120, // Extra padding for floating nav
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 20,
    fontFamily: "Aeonik-Bold",
  },
  imageContainer: {
    width: "100%",
    height: 300,
    aspectRatio: 1,
    alignSelf: "center",
    marginBottom: 0,
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
  shimmerTitle: {
    height: 30,
    borderRadius: 8,
    marginBottom: 20,
    width: "70%",
    alignSelf: "center",
  },
  shimmerImage: {
    width: "100%",
    height: 250,
    borderRadius: 20,
    marginBottom: 20,
  },
  shimmerGroup: {
    width: "100%",
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 0.3,
    borderColor: "#888888",
    overflow: "hidden",
  },
  firstShimmerGroup: {
    marginTop: 18,
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
  analysisSection: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
    fontFamily: "Aeonik-Bold",
  },
  sectionContent: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
  },
  errorContainer: {
    // padding: 20,
    // backgroundColor: "rgba(255, 0, 0, 0.1)",
    // borderRadius: 12,
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
    marginBottom: 15,
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "Aeonik-Bold",
  },
  insightGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 15,
  },
  insightItem: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 8,
    padding: 12,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  insightLabel: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    marginTop: 8,
  },
  insightValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Aeonik-Bold",
    marginTop: 4,
  },
  snapshotCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 14,
    padding: 20,
  },
  snapshotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  snapshotTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Aeonik-Medium",
  },
  snapshotContent: {
    marginTop: 20,
    gap: 20,
  },
  snapshotRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  snapshotIconBox: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(32, 32, 32, 0.95)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  snapshotTextContainer: {
    flex: 1,
  },
  snapshotLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    marginBottom: 8,
  },
  snapshotValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    lineHeight: 22,
  },
  performanceContainer: {
    // justifyContent: "space-between",
    // alignItems: "center",
    gap: 5,
  },
  performanceText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
  },
  xFactorsCard: {
    marginTop: 16,
    padding: 20,
  },
  xFactorsContent: {
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  xFactorsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  xFactorsTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  xFactorsInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  xFactorItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  xFactorItemLast: {
    marginBottom: 0,
  },
  iconContainer: {
    width: 45.11,
    height: 44.17,
    borderRadius: 12.62,
    backgroundColor: "#161616",
    justifyContent: "center",
    alignItems: "center",
  },
  xFactorIcon: {
    width: 24,
    height: 24,
  },
  xFactorTextContainer: {
    flex: 1,
    gap: 4,
  },
  xFactorLabel: {
    fontFamily: "Aeonik-Light",
    fontSize: 11.42,
    color: "#FFFFFF",
  },
  aiAnalysisCard: {
    marginTop: 16,
    padding: 20,
  },
  aiAnalysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aiAnalysisTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Aeonik-Medium",
  },
  aiAnalysisEmoji: {
    fontSize: 24,
  },
  aiMetricsContainer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    // marginBottom: 24,
    gap: 10,
    marginTop: 20,
  },
  aiMetricBox: {
    flex: 1,
    // backgroundColor: "rgba(32, 32, 32, 0.95)",
    flexDirection: "row",
    borderRadius: 16,

    alignItems: "center",
    // padding: 16,
    gap: 10,
  },
  aiIconBox: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(40, 40, 40, 0.95)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 0,
  },
  aiMetricLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    marginBottom: 4,
  },
  aiMetricValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
  },
  aiBreakdownContainer: {
    // backgroundColor: "rgba(32, 32, 32, 0.95)",
    borderRadius: 16,
    paddingBottom: 16,
  },
  aiBreakdownTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Aeonik-Regular",
    marginBottom: 18,
    textAlign: "center",
  },
  aiBreakdownText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 16,
    fontFamily: "Aeonik-Regular",
    lineHeight: 28,
  },
  keyInsightsCard: {
    padding: 20,
    paddingVertical: 25,
    marginTop: 16,
  },
  keyInsightsTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 14,
    fontFamily: "Aeonik-Medium",
  },
  matchSnapshotRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
    marginBottom: 0,
  },
  teamSnapshotCard: {
    flex: 1,
    minHeight: 180,
    padding: 16,
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  teamLogo: {
    width: 36,
    height: 36,
  },
  teamName: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Aeonik-Medium",
  },
  teamContent: {
    gap: 8,
  },
  teamSectionLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    marginBottom: 2,
  },
  teamSectionValue: {
    color: "#FFFFFF",
    fontSize: 11.2, // Reduced by 20% from 14px
    fontFamily: "Aeonik-Regular",
    lineHeight: 18.48, // Reduced by 20% from 23.1px (14 * 1.65)
  },

  metricBox: {
    width: 160,
    // backgroundColor: "rgba(32, 32, 32, 0.95)",
    borderRadius: 16,
    // padding: 16,
    justifyContent: "center",
  },
  metricContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  metricIconBox: {
    width: 50,
    height: 50,
    backgroundColor: "#212121",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  metricTextContainer: {
    flex: 1,
  },
  metricLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginBottom: 4,
    fontFamily: "Aeonik-Regular",
  },
  metricValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Aeonik-Regular",
  },
  progressMetricsContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    gap: 0,
  },
  metricsContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  progressMetric: {
    backgroundColor: "#212121",
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
    paddingRight: 15,
    minHeight: 45,
  },
  progressLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginBottom: 8,
    fontFamily: "Aeonik-Regular",
  },
  progressBox: {
    width: "100%",
  },
  progressValue: {
    color: "#FFFFFF",
    fontSize: 16,
    marginBottom: 15,
    fontFamily: "Aeonik-Regular",
  },
  progressBar: {
    height: 5,
    borderRadius: 20,
  },
  lineShiftBar: {
    width: "100%",
    borderRadius: 20,
  },
  lineShiftBarbg: {
    backgroundColor: "#FF55D4",
    borderRadius: 20,
  },
  percentageContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  percentageValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Aeonik-Regular",
  },
  progressBarContainer: {
    flexDirection: "row",
    width: "100%",
  },
  publicBar: {
    flex: 0.68,
    backgroundColor: "#1AFF00",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  sharpsBar: {
    flex: 0.32,
    backgroundColor: "#1AFF00",
    opacity: 0.4,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  aiAnalysisContent: {
    gap: 24,
  },
  collapsedHeader: {
    marginBottom: 0,
    minHeight: 40,
    alignItems: "center",
  },
  floatingButtonContainer: {
    position: "absolute",
    backgroundColor: "#0C0C0C",
    bottom: 0,
    paddingBottom: 60,
    paddingTop: 20,
    left: 0,

    right: 0,
    paddingHorizontal: 20,
  },
  floatingButton: {
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    padding: 10,
    // marginBottom: 70,
  },
  placeholderImage: {
    backgroundColor: "#333", // Example placeholder style
    justifyContent: "center",
    alignItems: "center",
    // Ensure it takes the same space as the image
    width: "100%",
    height: "100%", // Match image container height or use aspectRatio if needed
  },
  placeholderText: {
    color: "#888",
    fontSize: 16,
  },
  snapshotIcon: {
    width: 24,
    height: 24,
    resizeMode: "contain",
  },
  kIcon: {
    width: 36,
    height: 36,
    resizeMode: "contain",
  },
  unlockText: {
    color: "#FF373A",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
    fontSize: 12,
    fontFamily: "Aeonik-LightItalic",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
  },
  gridItem: {
    width: "47%",
    marginBottom: 0,
    minHeight: 80,
    justifyContent: "center",
  },
  // Shimmer Styles
  keyInsightsTitleShimmer: {
    height: 22,
    borderRadius: 8,
    marginBottom: 14,
    width: "60%",
    alignSelf: "center",
  },
  metricValueShimmer: {
    height: 16,
    borderRadius: 6,
    width: "80%",
    marginTop: 8,
  },
  metricLabelShimmer: {
    height: 12,
    borderRadius: 4,
    width: "70%",
    marginTop: 4,
  },
  teamNameShimmer: {
    height: 16,
    borderRadius: 6,
    width: "60%",
    marginLeft: 12,
  },
  teamSectionLabelShimmer: {
    height: 12,
    borderRadius: 4,
    width: "70%",
    marginBottom: 2,
  },
  teamSectionValueShimmer: {
    height: 14,
    borderRadius: 6,
    width: "90%",
  },
  xFactorsTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "50%",
  },
  xFactorsInfoShimmer: {
    height: 17,
    borderRadius: 6,
    width: 20,
  },
  xFactorLabelShimmer: {
    height: 11,
    borderRadius: 4,
    width: "60%",
  },
  xFactorDetailShimmer: {
    height: 14,
    borderRadius: 6,
    width: "85%",
    marginTop: 4,
  },
  aiAnalysisTitleShimmer: {
    height: 20,
    borderRadius: 8,
    width: "40%",
  },
  aiChevronShimmer: {
    height: 30,
    width: 30,
    borderRadius: 15,
  },
});
