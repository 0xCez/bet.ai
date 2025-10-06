import React, { useState, useEffect } from "react";
import {
  View,
  Image,
  StyleSheet,
  ScrollView,
  Text,
  Pressable,
  ViewStyle,
} from "react-native";
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
    confidence: string;
    marketActivity: string;
    lineShift: string;
    publicVsSharps: {
      public: number;
      sharps: number;
    };
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
  const [expandedCards, setExpandedCards] = useState(
    isSameAnalysis
      ? cachedExpandedCards
      : {
          snapshot: isDemo ? false : false,
          xFactors: isDemo ? false : false,
          aiAnalysis: isDemo ? false : false,
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
          setAnalysisResult(data.analysis as AnalysisResult);
          cachedAnalysisResult = data.analysis as AnalysisResult; // Cache the result
          console.log("Set analysis result from history:", data.analysis);
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
          confidence: parsedResponse?.keyInsights?.confidence || "",
          marketActivity: parsedResponse?.keyInsights?.marketActivity || "",
          lineShift: parsedResponse?.keyInsights?.lineShift || "",
          publicVsSharps: {
            public: parsedResponse?.keyInsights?.publicVsSharps?.public || 50,
            sharps: parsedResponse?.keyInsights?.publicVsSharps?.sharps || 50,
          },
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
      };

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
            imageUrl: downloadURL,
            createdAt: serverTimestamp(),
            analysis: analysisData,
          };

          await setDoc(newAnalysisRef, analysisDataToSave);
          hasAnalysisSaved.current = true; // Mark as saved
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
      <View style={styles.imageContainer}>
        {isDemo ? (
          <Image
            source={
              i18n.locale.startsWith("fr")
                ? require("../assets/images/demo_fr.png")
                : i18n.locale.startsWith("es")
                  ? require("../assets/images/demo_es.png")
                  : require("../assets/images/demo_en.png")
            }
            style={styles.image}
            resizeMode="contain"
          />
        ) : displayImageUrl ? (
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
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "100%" }]}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "30%" }]}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </LinearGradient>
      </View>

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
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "100%" }]}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "30%" }]}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </LinearGradient>
      </View>

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
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "100%" }]}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
          <ShimmerPlaceholder
            style={[styles.shimmerLine, { width: "30%" }]}
            shimmerColors={["#919191", "#767676", "#919191"]}
          />
        </LinearGradient>
      </View>
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
        <View style={[styles.card, styles.keyInsightsCard]}>
          <Text style={styles.keyInsightsTitle}>
            {i18n.t("analysisKeyInsights")}
          </Text>
          <View style={styles.gridContainer}>
            {/* Confidence Box */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <View style={styles.metricIconBox}>
                  <Image
                    source={require("../assets/images/ki1.png")}
                    style={[styles.kIcon, { width: 32, height: 32 }]}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricLabel}>
                    {i18n.t("analysisConfidence")}
                  </Text>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights.confidence}
                  </Text>
                </View>
              </View>
            </View>

            {/* Market Activity Box */}
            <View style={styles.gridItem}>
              <View style={styles.metricContent}>
                <View style={styles.metricIconBox}>
                  <Image
                    source={require("../assets/images/ki2.png")}
                    style={styles.kIcon}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.metricTextContainer}>
                  <Text style={styles.metricLabel}>
                    {i18n.t("analysisMarketActivity")}
                  </Text>
                  <Text style={styles.metricValue}>
                    {analysisResult?.keyInsights.marketActivity}
                  </Text>
                </View>
              </View>
            </View>

            {/* Line Shift Progress */}
            <View style={styles.gridItem}>
              <Text style={styles.progressLabel}>
                {i18n.t("analysisLineShift")}
              </Text>
              <View style={styles.progressMetric}>
                <View style={styles.progressBox}>
                  <Text style={styles.progressValue}>
                    {analysisResult?.keyInsights.lineShift}
                  </Text>
                  <View style={styles.progressBarContainer}>
                    <Progress.Bar
                      progress={
                        analysisResult?.keyInsights.marketActivity === "High"
                          ? 0.9
                          : analysisResult?.keyInsights.marketActivity ===
                            "Moderate"
                          ? 0.66
                          : 0.33
                      }
                      color="#FF55D4"
                      unfilledColor="#FF55D440"
                      borderWidth={0}
                      style={[styles.progressBar, styles.lineShiftBar]}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Public vs Sharps Progress */}
            <View style={styles.gridItem}>
              <Text style={styles.progressLabel}>
                {i18n.t("analysisPublicVsSharps")}
              </Text>
              <View style={styles.progressMetric}>
                <View style={styles.progressBox}>
                  <View style={styles.percentageContainer}>
                    <Text style={styles.percentageValue}>
                      {analysisResult?.keyInsights.publicVsSharps.public}%
                    </Text>
                    <Text style={styles.percentageValue}>
                      {analysisResult?.keyInsights.publicVsSharps.sharps}%
                    </Text>
                  </View>
                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        styles.publicBar,
                        {
                          flex:
                            (analysisResult?.keyInsights?.publicVsSharps
                              ?.public ?? 50) / 100,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.progressBar,
                        styles.sharpsBar,
                        {
                          flex:
                            (analysisResult?.keyInsights?.publicVsSharps
                              ?.sharps ?? 50) / 100,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Match Snapshot Card */}
        <View style={[styles.card, styles.snapshotCard]}>
          <Pressable
            onPress={() => toggleCard("snapshot")}
            style={[
              styles.snapshotHeader,
              !expandedCards.snapshot && styles.collapsedHeader,
            ]}
          >
            <Text style={styles.snapshotTitle}>
              {i18n.t("analysisMatchSnapshot")}
            </Text>
            <Feather
              name={expandedCards.snapshot ? "chevron-up" : "chevron-down"}
              size={30}
              color="#FFFFFF"
            />
          </Pressable>
          {expandedCards.snapshot && (
            <View style={styles.snapshotContent}>
              {/* Recent Performances */}
              <View style={styles.snapshotRow}>
                <View style={styles.snapshotIconBox}>
                  <Image
                    source={require("../assets/images/ms1.png")}
                    style={styles.snapshotIcon}
                  />
                </View>
                <View style={styles.snapshotTextContainer}>
                  <Text style={styles.snapshotLabel}>
                    {i18n.t("analysisRecentPerformances")}
                  </Text>
                  <View style={styles.performanceContainer}>
                    <BlurText card="ms-1" blur={!auth.currentUser}>
                      {analysisResult?.matchSnapshot.recentPerformance.home}
                    </BlurText>

                    <BlurText
                      card="ms-2"
                      invisible={true}
                      blur={!auth.currentUser}
                    >
                      {analysisResult?.matchSnapshot.recentPerformance.away}
                    </BlurText>
                  </View>
                </View>
              </View>

              {/* Head-to-Head Record */}
              <View style={styles.snapshotRow}>
                <View style={styles.snapshotIconBox}>
                  <Image
                    source={require("../assets/images/ms2.png")}
                    style={styles.snapshotIcon}
                  />
                </View>
                <View style={styles.snapshotTextContainer}>
                  <Text style={styles.snapshotLabel}>
                    {i18n.t("analysisHeadToHead")}
                  </Text>
                  <BlurText card="ms-2" blur={!auth.currentUser}>
                    {analysisResult?.matchSnapshot.headToHead}
                  </BlurText>
                </View>
              </View>

              {/* Momentum Indicator */}
              <View style={styles.snapshotRow}>
                <View style={styles.snapshotIconBox}>
                  <Image
                    source={require("../assets/images/ms3.png")}
                    style={styles.snapshotIcon}
                  />
                </View>
                <View style={styles.snapshotTextContainer}>
                  <Text style={styles.snapshotLabel}>
                    {i18n.t("analysisMomentumIndicator")}
                  </Text>
                  <View style={styles.performanceContainer}>
                    <BlurText card="ms-3" blur={!auth.currentUser}>
                      {analysisResult?.matchSnapshot.momentum.home}
                    </BlurText>
                    <BlurText
                      card="ms-3"
                      invisible={true}
                      blur={!auth.currentUser}
                    >
                      {analysisResult?.matchSnapshot.momentum.away}
                    </BlurText>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* X-Factors Card */}
        <View style={[styles.card, styles.xFactorsCard]}>
          <Pressable
            onPress={() => toggleCard("xFactors")}
            style={[
              styles.xFactorsHeader,
              !expandedCards.xFactors && styles.collapsedHeader,
            ]}
          >
            <Text style={styles.xFactorsTitle}>
              {i18n.t("analysisXFactors")}
            </Text>
            <Feather
              name={expandedCards.xFactors ? "chevron-up" : "chevron-down"}
              size={30}
              color="#FFFFFF"
            />
          </Pressable>
          {expandedCards.xFactors && (
            <View style={styles.xFactorsContent}>
              {analysisResult?.xFactors.map((xFactor, index) => (
                <View key={index} style={styles.xFactorRow}>
                  <View style={styles.xFactorIconBox}>
                    <Image
                      source={
                        xFactor.type === 1
                          ? require("../assets/images/xf1.png") // Health & Availability
                          : xFactor.type === 2
                          ? require("../assets/images/xf2.png") // Location & Weather
                          : xFactor.type === 3
                          ? require("../assets/images/xf3.png") // Officiating & Rules
                          : xFactor.type === 4
                          ? require("../assets/images/xf4.png") // Travel & Fatigue
                          : require("../assets/images/xf4.png") // Default
                      }
                      style={styles.snapshotIcon}
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
        </View>

        {/* AI Analysis Card */}
        <View style={[styles.card, styles.aiAnalysisCard]}>
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
                    />{" "}
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
        </View>

        <View style={styles.debateContainer}>
          {!isDemo && (
            <>
              <BorderButton
                onPress={() => {
                  // Pass full analysis data to chat screen
                  router.push({
                    pathname: "/chat",
                    params: { analysisData: JSON.stringify(analysisResult) },
                  });
                }}
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

              <View style={{ marginTop: 16 }}>
                <BorderButton
                  onPress={() => {
                    // Navigate to market intel with game data
                    router.push({
                      pathname: "/market-intel",
                      params: {
                        team1: analysisResult?.teams?.home || "",
                        team2: analysisResult?.teams?.away || "",
                        sport: analysisResult?.sport || "nba", // Use actual sport from analysis
                        team1Logo: analysisResult?.teams?.logos?.home || "",
                        team2Logo: analysisResult?.teams?.logos?.away || ""
                      }
                    });
                  }}
                  containerStyle={styles.floatingButton}
                  borderColor="#FFD700"
                  backgroundColor="#FFD70020"
                  opacity={1}
                  borderWidth={1}
                >
                  <Text style={styles.buttonText}>
                    Market Intelligence 📊
                  </Text>
                </BorderButton>
              </View>
            </>
          )}
        </View>
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
      <TopBar />

      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          {/* Analysis Content */}
          <View style={styles.analysisContainer}>
            {isLoading ? renderShimmer() : renderAnalysisContent()}
          </View>
        </ScrollView>

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
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 14,
    padding: 20,
  },
  xFactorsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  xFactorsTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: "Aeonik-Medium",
  },
  xFactorsContent: {
    gap: 20,
    marginTop: 20,
  },
  xFactorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  xFactorIconBox: {
    width: 48,
    height: 48,
    backgroundColor: "rgba(32, 32, 32, 0.95)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  xFactorTextContainer: {
    flex: 1,
  },
  xFactorLabel: {
    color: "rgba(255, 255, 255, 0.8)",

    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    marginBottom: 8,
  },
  xFactorValue: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Aeonik-Regular",
    lineHeight: 22,
  },
  aiAnalysisCard: {
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 14,
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
    backgroundColor: "rgba(18, 18, 18, 0.95)",
    borderRadius: 14,
    padding: 20,
    paddingVertical: 25,
    marginTop: 20,
  },
  keyInsightsTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 14,
    fontFamily: "Aeonik-Medium",
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
    width: 26,
    height: 26,
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
});
