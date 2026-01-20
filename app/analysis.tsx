import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  ViewStyle,
  Animated,
  Easing,
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
import { colors, spacing, borderRadius as radii, typography, shadows, shimmerColors } from "../constants/designTokens";
import { useDemoTooltip } from "../contexts/DemoTooltipContext";
// TODO: Image transition - commented out for now, will finish later
// import { useImageTransition } from "../contexts/ImageTransitionContext";

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
      teamSide?: "home" | "away" | null;
    } | null;
    bestValue: {
      display: string;
      label: string;
      teamSide?: "home" | "away" | null;
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
  // Pre-cached game params
  cachedGameId?: string;
  sport?: string;
  team1?: string;
  team2?: string;
  team1Id?: string;
  team2Id?: string;
  fromCache?: string;
  // Navigation context - where the user came from
  from?: "discover" | "history" | "scan";
};

// Helper function to remove empty string keys from objects (Firestore doesn't allow them)
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      // Skip empty string keys
      if (key === '') return;
      cleaned[key] = sanitizeForFirestore(obj[key]);
    });
    return cleaned;
  }

  return obj;
}

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
      analysisId: params.analysisId || "none",
      isDemo: params.isDemo === "true",
    });

    // Track page exit and time spent
    return () => {
      if (pageEntryTime && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTime;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture("analysis_page_exit", {
          userId: auth.currentUser.uid,
          analysisId: params.analysisId || "none",
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
  // Also compare cachedGameId for pre-cached games from the home carousel
  const isSameAnalysis =
    params.isDemo !== "true" && // Skip cache for demo mode
    cachedParams?.analysisId === params.analysisId &&
    cachedParams?.imageUri === params.imageUri &&
    cachedParams?.cachedGameId === params.cachedGameId && // Compare cached game ID
    cachedParams?.isDemo === params.isDemo;

  // Cache params for future comparison
  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const imageUri = params.imageUri;
  const analysisId = params.analysisId;
  const isDemo = params.isDemo === "true";
  // Pre-cached games from home carousel have no image (they're API-only fetches)
  // Both conditions must be true to ensure we don't affect user's own scanned analyses
  const isFromPreCache = params.fromCache === "true" && !!params.cachedGameId;

  // Demo tooltip system
  const { showTooltip, setIsDemo: setDemoMode } = useDemoTooltip();
  // TODO: Image transition - commented out for now, will finish later
  // const { isTransitioning, completeTransition } = useImageTransition();
  const demoTooltipShownRef = useRef(false);

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

  // Animation values for staggered card animations (6 cards total)
  const cardAnimations = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;

  const animateCardsIn = () => {
    // Reset all animations
    cardAnimations.forEach(anim => anim.setValue(0));

    // Stagger animate each card
    const animations = cardAnimations.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        delay: 50 + index * 100,
        useNativeDriver: true,
      })
    );

    Animated.parallel(animations).start();
  };

  // Trigger animation when loading completes
  const hasAnimatedRef = useRef(false);
  useEffect(() => {
    if (!isLoading && analysisResult && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      setTimeout(animateCardsIn, 100);
    }
    if (isLoading) {
      hasAnimatedRef.current = false;
    }
  }, [isLoading, analysisResult]);

  const getCardStyle = (index: number) => ({
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
  });

  const toggleCard = (cardName: "snapshot" | "xFactors" | "aiAnalysis") => {
    const newExpandedCards = {
      ...expandedCards,
      [cardName]: !expandedCards[cardName],
    };
    setExpandedCards(newExpandedCards);
    cachedExpandedCards = newExpandedCards;
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

    // --- Cached Game Flow (from home carousel) ---
    if (params.cachedGameId && params.fromCache === "true") {
      console.log(`Cached Game Flow: Fetching cached analysis with ID: ${params.cachedGameId}`);
      fetchCachedGameAnalysis(params.cachedGameId);
    }
    // --- History Flow ---
    else if (analysisId) {
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
  }, [analysisId, imageUri, auth.currentUser, isSameAnalysis, params.cachedGameId, params.fromCache]);

  // Show demo tooltip when analysis loads in demo mode
  useEffect(() => {
    if (isDemo && !isLoading && analysisResult && !demoTooltipShownRef.current) {
      demoTooltipShownRef.current = true;
      setDemoMode(true);

      // Show welcome tooltip after a short delay
      const timer = setTimeout(() => {
        showTooltip("welcome");
      }, 800);

      return () => clearTimeout(timer);
    }

    // Reset demo mode when leaving
    if (!isDemo) {
      setDemoMode(false);
      demoTooltipShownRef.current = false;
    }
  }, [isDemo, isLoading, analysisResult]);

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

      // Use demoAnalysis collection for demo mode, otherwise use userAnalyses
      const collection = isDemo ? "demoAnalysis" : "userAnalyses";
      const docRef = doc(db, collection, userId, "analyses", docId);
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

  // --- Function to fetch pre-cached game analysis ---
  // Pre-cached games now have the FULL AI analysis (matchSnapshot, xFactors, aiAnalysis)
  // We just load it directly from Firestore - no API calls needed!
  const fetchCachedGameAnalysis = async (cacheId: string) => {
    setIsLoading(true);
    setError(null);
    setDisplayImageUrl(null);
    try {
      const docRef = doc(db, "matchAnalysisCache", cacheId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.error(`Cached game document not found: matchAnalysisCache/${cacheId}`);
        setError("Cached game analysis not found.");
        setAnalysisResult(null);
        setIsLoading(false);
        return;
      }

      const data = docSnap.data();
      console.log("Fetched pre-cached game data:", data);

      // The full analysis is stored in data.analysis
      const analysis = data.analysis || {};

      // Check if this is a full pre-cached analysis (has aiAnalysis field)
      if (!analysis.aiAnalysis || !analysis.matchSnapshot) {
        console.warn("Pre-cached data missing AI analysis, may be old format");
      }

      // Build AnalysisResult directly from pre-cached data
      const analysisData: AnalysisResult = {
        sport: analysis.sport || data.sport || params.sport || "nba",
        teams: {
          home: analysis.teams?.home || params.team1 || "Team 1",
          away: analysis.teams?.away || params.team2 || "Team 2",
          logos: {
            home: analysis.teams?.logos?.home || "",
            away: analysis.teams?.logos?.away || "",
          },
        },
        // Use keyInsightsNew for the Key Insights card (marketConsensus, bestValue, etc.)
        // Note: analysis.keyInsights from AI has different structure (confidence, marketActivity)
        keyInsights: {
          marketConsensus: analysis.keyInsightsNew?.marketConsensus || null,
          bestValue: analysis.keyInsightsNew?.bestValue || null,
          offensiveEdge: analysis.keyInsightsNew?.offensiveEdge || null,
          defensiveEdge: analysis.keyInsightsNew?.defensiveEdge || null,
        },
        matchSnapshot: analysis.matchSnapshot || {
          recentPerformance: { home: "N/A", away: "N/A" },
          headToHead: "No H2H data",
          momentum: { home: "N/A", away: "N/A" },
        },
        xFactors: analysis.xFactors || [],
        aiAnalysis: analysis.aiAnalysis || {
          confidenceScore: String(analysis.keyInsightsNew?.confidenceScore || 55),
          bettingSignal: "Market Conflicted",
          breakdown: "Pre-cached analysis. Check key insights for betting opportunities.",
        },
        marketIntelligence: analysis.marketIntelligence,
        teamStats: analysis.teamStats,
      };

      setAnalysisResult(analysisData);
      cachedAnalysisResult = analysisData;
      setCurrentAnalysisId(cacheId);
      console.log("Set analysis result from FULL pre-cached data:", analysisData);

      // No image for cached games
      setDisplayImageUrl(null);
      cachedDisplayImageUrl = null;

    } catch (err) {
      console.error("Error fetching cached game analysis:", err);
      setError("Failed to fetch game details. Please try again.");
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
            analysis: sanitizeForFirestore(analysisData), // Clean empty string keys
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
      {/* Image Container - Hide for pre-cached games (they have no image) */}
      {!isFromPreCache && (
        <View style={styles.imageContainer}>
          <ShimmerPlaceholder
            style={styles.image}
            shimmerColors={shimmerColors}
          />
        </View>
      )}

      {/* Key Insights Card Skeleton */}
      <Card style={styles.keyInsightsCard}>
        <ShimmerPlaceholder
          style={styles.keyInsightsTitleShimmer}
          shimmerColors={shimmerColors}
        />

        <View style={styles.gridContainer}>
          {/* 4 Metric Items */}
          {[1, 2, 3, 4].map((index) => (
            <View key={index} style={styles.gridItem}>
              <View style={styles.metricContent}>
                <ShimmerPlaceholder
                  style={styles.kIcon}
                  shimmerColors={shimmerColors}
                />
                <View style={styles.metricTextContainer}>
                  <ShimmerPlaceholder
                    style={styles.metricValueShimmer}
                    shimmerColors={shimmerColors}
                  />
                  <ShimmerPlaceholder
                    style={styles.metricLabelShimmer}
                    shimmerColors={shimmerColors}
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
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.teamNameShimmer}
              shimmerColors={shimmerColors}
            />
          </View>
          <View style={styles.teamContent}>
            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={shimmerColors}
            />

            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={shimmerColors}
            />
          </View>
        </Card>

        {/* Away Team Card */}
        <Card style={styles.teamSnapshotCard}>
          <View style={styles.teamHeader}>
            <ShimmerPlaceholder
              style={styles.teamLogo}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.teamNameShimmer}
              shimmerColors={shimmerColors}
            />
          </View>
          <View style={styles.teamContent}>
            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={shimmerColors}
            />

            <ShimmerPlaceholder
              style={styles.teamSectionLabelShimmer}
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.teamSectionValueShimmer}
              shimmerColors={shimmerColors}
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
              shimmerColors={shimmerColors}
            />
            <ShimmerPlaceholder
              style={styles.xFactorsInfoShimmer}
              shimmerColors={shimmerColors}
            />
          </View>

          {/* X-Factors List */}
          {[1, 2, 3].map((index) => (
            <View key={index} style={[styles.xFactorItem, index === 3 && styles.xFactorItemLast]}>
              <View style={styles.iconContainer}>
                <ShimmerPlaceholder
                  style={styles.xFactorIcon}
                  shimmerColors={shimmerColors}
                />
              </View>
              <View style={styles.xFactorTextContainer}>
                <ShimmerPlaceholder
                  style={styles.xFactorLabelShimmer}
                  shimmerColors={shimmerColors}
                />
                <ShimmerPlaceholder
                  style={styles.xFactorDetailShimmer}
                  shimmerColors={shimmerColors}
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
            shimmerColors={shimmerColors}
          />
          <ShimmerPlaceholder
            style={styles.aiChevronShimmer}
            shimmerColors={shimmerColors}
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
        {/* Image Container - Hide for pre-cached games (they have no image) */}
        {!isFromPreCache && (
          <Animated.View style={[styles.imageContainer, getCardStyle(0)]}>
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
          </Animated.View>
        )}

        {/* <Text style={styles.sectionTitle}>AI Insights</Text>
        <Text style={styles.sectionContent}>
          {analysisResult?.aiInsights || "Waiting for AI insights..."}
        </Text> */}

        {/* Key Insights Card */}
        <Animated.View style={getCardStyle(1)}>
        <Card style={styles.keyInsightsCard}>
          <Text style={styles.keyInsightsTitle}>{i18n.t("analysisKeyInsights")}</Text>

          <View style={styles.gridContainer}>
            {/* Market Consensus */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <View style={styles.gridItemIcon}>
                  <Image
                    source={getTeamLogo(
                      analysisResult?.keyInsights?.marketConsensus?.teamSide === "home"
                        ? analysisResult?.teams?.home || ""
                        : analysisResult?.keyInsights?.marketConsensus?.teamSide === "away"
                        ? analysisResult?.teams?.away || ""
                        : "",
                      analysisResult?.sport
                    )}
                    style={styles.gridItemLogo}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricLabel}>{i18n.t("analysisMarketConsensus")}</Text>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.marketConsensus?.display || i18n.t("analysisNoConsensus")}
                  </Text>
                </View>
              </View>
            </View>

            {/* Best Value */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <View style={styles.gridItemIcon}>
                  <Image
                    source={getTeamLogo(
                      analysisResult?.keyInsights?.bestValue?.teamSide === "home"
                        ? analysisResult?.teams?.home || ""
                        : analysisResult?.keyInsights?.bestValue?.teamSide === "away"
                        ? analysisResult?.teams?.away || ""
                        : "",
                      analysisResult?.sport
                    )}
                    style={styles.gridItemLogo}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricLabel}>{i18n.t("analysisBestValue")}</Text>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.bestValue?.display || i18n.t("analysisEfficientMarket")}
                  </Text>
                </View>
              </View>
            </View>

            {/* Offensive Edge */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <View style={styles.gridItemIcon}>
                  <Image
                    source={getTeamLogo(
                      (analysisResult?.keyInsights?.offensiveEdge?.display || "").startsWith("+") ||
                      (analysisResult?.keyInsights?.offensiveEdge?.display || "").startsWith("0")
                        ? analysisResult?.teams?.home || ""
                        : analysisResult?.teams?.away || "",
                      analysisResult?.sport
                    )}
                    style={styles.gridItemLogo}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricLabel}>{i18n.t("analysisOffensiveEdge")}</Text>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.offensiveEdge?.display || "N/A"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Defensive Edge */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <View style={styles.gridItemIcon}>
                  <Image
                    source={getTeamLogo(
                      (analysisResult?.keyInsights?.defensiveEdge?.display || "").startsWith("-")
                        ? analysisResult?.teams?.home || ""
                        : analysisResult?.teams?.away || "",
                      analysisResult?.sport
                    )}
                    style={styles.gridItemLogo}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricLabel}>{i18n.t("analysisDefensiveEdge")}</Text>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights?.defensiveEdge?.display || "N/A"}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Card>
        </Animated.View>

        {/* Match Snapshot - Home Team */}
        <Animated.View style={getCardStyle(2)}>
        <Card style={styles.teamCard}>
          {/* Team Title Header */}
          <View style={styles.teamCardHeader}>
            <View style={styles.iconContainer}>
              <Image
                source={getTeamLogo(analysisResult?.teams.home || "", analysisResult?.sport)}
                style={styles.xFactorIcon}
                contentFit="contain"
              />
            </View>
            <Text style={styles.teamCardTitle}>{analysisResult?.teams.home}</Text>
          </View>

          {/* Recent Performances */}
          <View style={styles.xFactorItem}>
            <View style={styles.iconContainer}>
              <Ionicons name="stats-chart" size={22} color={colors.primary} />
            </View>
            <View style={styles.xFactorTextContainer}>
              <Text style={styles.xFactorLabel}>{i18n.t("analysisRecentPerformances")}</Text>
              <BlurText card="ms-1" blur={!auth.currentUser && !isDemo} style={styles.xFactorDetail}>
                {analysisResult?.matchSnapshot.recentPerformance.home}
              </BlurText>
            </View>
          </View>

          {/* Momentum */}
          <View style={[styles.xFactorItem, styles.xFactorItemLast]}>
            <View style={styles.iconContainer}>
              <Ionicons name="trending-up" size={22} color={colors.primary} />
            </View>
            <View style={styles.xFactorTextContainer}>
              <Text style={styles.xFactorLabel}>{i18n.t("analysisMomentumIndicator")}</Text>
              <BlurText card="ms-3" blur={!auth.currentUser && !isDemo} style={styles.xFactorDetail}>
                {analysisResult?.matchSnapshot.momentum.home}
              </BlurText>
            </View>
          </View>
        </Card>
        </Animated.View>

        {/* Match Snapshot - Away Team */}
        <Animated.View style={getCardStyle(3)}>
        <Card style={styles.teamCard}>
          {/* Team Title Header */}
          <View style={styles.teamCardHeader}>
            <View style={styles.iconContainer}>
              <Image
                source={getTeamLogo(analysisResult?.teams.away || "", analysisResult?.sport)}
                style={styles.xFactorIcon}
                contentFit="contain"
              />
            </View>
            <Text style={styles.teamCardTitle}>{analysisResult?.teams.away}</Text>
          </View>

          {/* Recent Performances */}
          <View style={styles.xFactorItem}>
            <View style={styles.iconContainer}>
              <Ionicons name="stats-chart" size={22} color={colors.primary} />
            </View>
            <View style={styles.xFactorTextContainer}>
              <Text style={styles.xFactorLabel}>{i18n.t("analysisRecentPerformances")}</Text>
              <BlurText card="ms-2" blur={!auth.currentUser && !isDemo} style={styles.xFactorDetail}>
                {analysisResult?.matchSnapshot.recentPerformance.away}
              </BlurText>
            </View>
          </View>

          {/* Momentum */}
          <View style={[styles.xFactorItem, styles.xFactorItemLast]}>
            <View style={styles.iconContainer}>
              <Ionicons name="trending-up" size={22} color={colors.primary} />
            </View>
            <View style={styles.xFactorTextContainer}>
              <Text style={styles.xFactorLabel}>{i18n.t("analysisMomentumIndicator")}</Text>
              <BlurText card="ms-3" blur={!auth.currentUser && !isDemo} style={styles.xFactorDetail}>
                {analysisResult?.matchSnapshot.momentum.away}
              </BlurText>
            </View>
          </View>
        </Card>
        </Animated.View>

        {/* X-Factors Card */}
        <Animated.View style={getCardStyle(4)}>
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
                        ? i18n.t("analysisHealthAvailability")
                        : xFactor.type === 2
                        ? i18n.t("analysisLocationWeather")
                        : xFactor.type === 3
                        ? i18n.t("analysisOfficiatingRules")
                        : xFactor.type === 4
                        ? i18n.t("analysisTravelFatigue")
                        : xFactor.title}
                    </Text>
                    <Text style={styles.xFactorDetail}>
                      {xFactor.detail}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
        </Animated.View>

        {/* AI Analysis Card */}
        <Animated.View style={getCardStyle(5)}>
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
                {/* Confidence */}
                <View style={styles.aiMetricBox}>
                  <View style={styles.aiIconBox}>
                    <Image
                      source={require("../assets/images/aa1.png")}
                      style={styles.snapshotIcon}
                      contentFit="contain"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiMetricLabel}>Confidence</Text>
                    {auth.currentUser || isDemo ? (
                      <Text style={styles.aiMetricValue}>
                        {analysisResult?.aiAnalysis.confidenceScore}
                      </Text>
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

                {/* Signal */}
                <View style={styles.aiMetricBox}>
                  <View style={styles.aiIconBox}>
                    <Image
                      source={require("../assets/images/aa2.png")}
                      style={styles.snapshotIcon}
                      contentFit="contain"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiMetricLabel}>Signal</Text>
                    {auth.currentUser || isDemo ? (
                      <Text style={styles.aiMetricValue}>
                        {analysisResult?.aiAnalysis.bettingSignal}
                      </Text>
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
                {auth.currentUser || isDemo ? (
                  <Text style={styles.aiBreakdownText}>
                    {analysisResult?.aiAnalysis.breakdown}
                  </Text>
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
        </Animated.View>
      </ScrollView>
    );
  };

  // Handle back navigation based on where the user came from
  const handleBackNavigation = () => {
    switch (params.from) {
      case "discover":
        // Go back to home and show the Discover page
        router.replace({ pathname: "/home", params: { page: "discover" } });
        break;
      case "history":
        router.replace("/history");
        break;
      case "scan":
        // Go back to home (scan page is default)
        router.replace("/home");
        break;
      default:
        // Fallback: go to home
        router.replace("/home");
    }
  };

  return (
    <ScreenBackground hideBg>
      <TopBar onBackPress={handleBackNavigation} />

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

        {/* Floating Bottom Navigation - Show for both demo and regular mode */}
          <FloatingBottomNav
            activeTab="insight"
            analysisData={{
              team1: analysisResult?.teams?.home,
              team2: analysisResult?.teams?.away,
              sport: analysisResult?.sport,
              team1Logo: analysisResult?.teams?.logos?.home,
              team2Logo: analysisResult?.teams?.logos?.away,
              analysisId: currentAnalysisId || undefined,
              isDemo: isDemo,
              fromCache: params.fromCache === "true",
              cachedGameId: params.cachedGameId || undefined,
          }}
          isSubscribed={isSubscribed}
        />
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
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: radii.xl,
  },
  analysisContainer: {
    paddingTop: 4,
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
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    marginBottom: spacing[2],
    fontFamily: typography.fontFamily.bold,
  },
  sectionContent: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[4],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[4],
  },
  cardTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
  },
  insightGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing[4],
  },
  insightItem: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: radii.lg,
    padding: spacing[3],
    flexDirection: "column",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  insightLabel: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    marginTop: spacing[2],
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  insightValue: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    marginTop: spacing[1],
  },
  snapshotCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: spacing[5],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  snapshotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  snapshotTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.medium,
  },
  snapshotContent: {
    marginTop: spacing[5],
    gap: spacing[5],
  },
  snapshotRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  snapshotIconBox: {
    width: 48,
    height: 48,
    backgroundColor: colors.secondary,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  snapshotTextContainer: {
    flex: 1,
  },
  snapshotLabel: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    marginBottom: spacing[2],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  snapshotValue: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 22,
  },
  performanceContainer: {
    gap: spacing[1],
  },
  performanceText: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
  },
  xFactorsCard: {
    marginTop: spacing[4],
    padding: spacing[5],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  xFactorsContent: {
    paddingVertical: spacing[1],
    paddingHorizontal: 0,
  },
  xFactorsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[5],
  },
  xFactorsTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xl,
    color: colors.foreground,
  },
  xFactorsInfo: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.base,
    color: colors.primary,
  },
  xFactorItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginBottom: spacing[4],
    padding: spacing[3],
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  xFactorItemLast: {
    marginBottom: 0,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  xFactorIcon: {
    width: 26,
    height: 26,
  },
  xFactorTextContainer: {
    flex: 1,
    gap: 4,
  },
  xFactorLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.xs,
    color: colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  xFactorDetail: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  aiAnalysisCard: {
    marginTop: spacing[4],
    padding: spacing[5],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    ...shadows.cardGlow,
  },
  aiAnalysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aiAnalysisTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.medium,
  },
  aiAnalysisEmoji: {
    fontSize: 24,
  },
  aiMetricsContainer: {
    width: "100%",
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[5],
  },
  aiMetricBox: {
    flex: 1,
    flexDirection: "row",
    borderRadius: radii.lg,
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  aiIconBox: {
    width: 44,
    height: 44,
    backgroundColor: colors.secondary,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  aiMetricLabel: {
    color: colors.primary,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    marginBottom: spacing[1],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aiMetricValue: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 18,
  },
  aiBreakdownContainer: {
    marginTop: spacing[2],
  },
  aiBreakdownTitle: {
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    marginBottom: spacing[4],
    textAlign: "left",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aiBreakdownText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 22,
  },
  keyInsightsCard: {
    padding: spacing[5],
    paddingVertical: spacing[6],
    marginTop: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    ...shadows.cardGlow,
  },
  keyInsightsTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    textAlign: "center",
    marginBottom: spacing[4],
    fontFamily: typography.fontFamily.medium,
  },
  matchSnapshotRow: {
    flexDirection: "row",
    gap: spacing[4],
    marginTop: spacing[4],
    marginBottom: 0,
  },
  teamSnapshotCard: {
    flex: 1,
    minHeight: 180,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginBottom: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  teamLogo: {
    width: 40,
    height: 40,
  },
  teamName: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  teamContent: {
    gap: spacing[3],
  },
  teamStatItem: {
    marginBottom: spacing[3],
    gap: spacing[1],
  },
  teamCard: {
    marginTop: spacing[4],
    padding: spacing[5],
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  teamCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  teamCardTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.medium,
  },
  teamSectionLabel: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    marginBottom: spacing[1],
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  teamSectionValue: {
    color: colors.foreground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    lineHeight: 18,
  },

  metricBox: {
    width: 160,
    borderRadius: radii.lg,
    justifyContent: "center",
  },
  metricContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  metricIconBox: {
    width: 48,
    height: 48,
    backgroundColor: colors.secondary,
    borderRadius: radii.lg,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  metricTextContainer: {
    flex: 1,
  },
  metricLabel: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: spacing[1],
  },
  metricValue: {
    color: colors.foreground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
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
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: radii.lg,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    paddingRight: spacing[4],
    minHeight: 45,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  progressLabel: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    marginBottom: spacing[2],
    fontFamily: typography.fontFamily.regular,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  progressBox: {
    width: "100%",
  },
  progressValue: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    marginBottom: spacing[4],
    fontFamily: typography.fontFamily.medium,
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
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
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
    backgroundColor: colors.background,
    bottom: 0,
    paddingBottom: 60,
    paddingTop: spacing[5],
    left: 0,
    right: 0,
    paddingHorizontal: spacing[5],
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
    width: 24,
    height: 24,
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
    gap: spacing[3],
    paddingHorizontal: spacing[1],
  },
  gridItem: {
    width: "47%",
    marginBottom: 0,
    minHeight: 80,
    justifyContent: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[1],
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  gridItemIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.1)",
  },
  gridItemLogo: {
    width: 26,
    height: 26,
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
