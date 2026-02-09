import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, Text } from "react-native";
import { router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import CircularProgress from "react-native-circular-progress-indicator";
import { GradientText } from "../components/ui/GradientText";
import { colors, spacing, typography } from "../constants/designTokens";
import i18n from "../i18n";
import { useOnboardingAnalytics } from "../hooks/useOnboardingAnalytics";

interface LoadingState {
  threshold: number;
  title1: string;
  title2: string;
  description1: string;
  description2: string;
}

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [currentState, setCurrentState] = useState<LoadingState>({
    threshold: 25,
    title1: i18n.t("loadingAnalyzingTradingStyle1"),
    title2: i18n.t("loadingAnalyzingTradingStyle2"),
    description1: i18n.t("loadingAnalyzingDesc1"),
    description2: i18n.t("loadingAnalyzingDesc2"),
  });
  const { trackFunnelStep } = useOnboardingAnalytics();
  const hasTracked = useRef(false);
  const hasNavigated = useRef(false);

  // Track loading screen viewed on mount
  useEffect(() => {
    if (!hasTracked.current) {
      trackFunnelStep('loading_viewed');
      hasTracked.current = true;
    }
  }, []);

  useEffect(() => {
    // Create loading states with i18n translations
    const loadingStates: LoadingState[] = [
      {
        threshold: 25,
        title1: i18n.t("loadingAnalyzingTradingStyle1"),
        title2: i18n.t("loadingAnalyzingTradingStyle2"),
        description1: i18n.t("loadingAnalyzingDesc1"),
        description2: i18n.t("loadingAnalyzingDesc2"),
      },
      {
        threshold: 45,
        title1: i18n.t("loadingBuildingStrategy1"),
        title2: i18n.t("loadingBuildingStrategy2"),
        description1: i18n.t("loadingBuildingDesc1"),
        description2: i18n.t("loadingBuildingDesc2"),
      },
      {
        threshold: 65,
        title1: i18n.t("loadingTrainingModel1"),
        title2: i18n.t("loadingTrainingModel2"),
        description1: i18n.t("loadingTrainingDesc1"),
        description2: i18n.t("loadingTrainingDesc2"),
      },
      {
        threshold: 85,
        title1: i18n.t("loadingFinalizing1"),
        title2: i18n.t("loadingFinalizing2"),
        description1: i18n.t("loadingFinalizingDesc1"),
        description2: i18n.t("loadingFinalizingDesc2"),
      },
    ];

    const duration = 6000; // 5 seconds total
    const interval = 16; // Update every 16ms for smooth animation
    const increment = (60 * interval) / duration;
    let currentProgress = 0;

    const timer = setInterval(() => {
      currentProgress += increment;

      if (currentProgress >= 100) {
        clearInterval(timer);
        if (!hasNavigated.current) {
          hasNavigated.current = true;
          router.push("/paywall");
        }
        return;
      }

      // Update the state based on current progress
      const newState =
        loadingStates.find(
          (state, index) =>
            currentProgress <= state.threshold &&
            (index === 0 ||
              currentProgress > loadingStates[index - 1].threshold)
        ) || loadingStates[loadingStates.length - 1];

      setCurrentState(newState);
      setProgress(currentProgress);

      // Update display progress in steps of 1
      const targetStep = Math.round(currentProgress);
      setDisplayProgress(targetStep > 99 ? 100 : targetStep);
    }, interval);

    return () => clearInterval(timer);
  }, []);

  return (
    <ScreenBackground hideBg>
      <View style={styles.container}>
        <View style={styles.progressContainer}>
          <CircularProgress
            value={progress}
            radius={130}
            duration={16}
            progressValueColor={"transparent"}
            activeStrokeColor={colors.primary}
            inActiveStrokeColor={colors.card}
            inActiveStrokeOpacity={0.8}
            inActiveStrokeWidth={16}
            activeStrokeWidth={16}
            maxValue={100}
            showProgressValue={false}
          />
          <View style={styles.progressOverlay}>
            <Text style={styles.progressText}>
              {displayProgress}
              <Text style={styles.percentSymbol}>%</Text>
            </Text>
          </View>
        </View>
        <View style={styles.textContainer}>
          <GradientText fontFamily="Aeonik-Medium" style={styles.title}>
            {currentState.title1}
          </GradientText>
          <GradientText fontFamily="Aeonik-Medium" style={styles.title}>
            {currentState.title2}
          </GradientText>

          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>{currentState.description1}</Text>
            <Text style={styles.description}>{currentState.description2}</Text>
          </View>
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  descriptionContainer: {
    marginTop: spacing[4],
    gap: 0,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[5],
    gap: spacing[8],
  },
  progressContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  progressOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  progressText: {
    fontSize: 70,
    fontWeight: "bold",
    color: colors.foreground,
    fontFamily: typography.fontFamily.medium,
  },
  percentSymbol: {
    fontSize: 44,
  },
  textContainer: {
    alignItems: "center",
    marginTop: spacing[10],
    paddingHorizontal: spacing[1],
  },
  title: {
    fontSize: typography.sizes["3xl"],
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 0,
  },
  description: {
    fontSize: typography.sizes.base,
    textAlign: "center",
    color: colors.mutedForeground,
    lineHeight: 24,
    letterSpacing: 0.5,
    fontFamily: typography.fontFamily.regular,
  },
});
