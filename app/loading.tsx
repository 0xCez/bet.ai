import React, { useEffect, useState } from "react";
import { StyleSheet, View, Text, Animated } from "react-native";
import { router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import CircularProgress from "react-native-circular-progress-indicator";
import { GradientText } from "../components/ui/GradientText";
import i18n from "../i18n";

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
        router.push("/tutorial");
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
            activeStrokeColor={"#00C2E0"}
            inActiveStrokeColor={"#0C0C0C"}
            inActiveStrokeOpacity={0.5}
            inActiveStrokeWidth={16}
            activeStrokeWidth={16}
            maxValue={100}
            showProgressValue={false}
          />
          <View style={styles.progressOverlay}>
            <Text style={styles.progressText}>
              {displayProgress}
              <Text style={{ fontSize: 44 }}>%</Text>
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
    marginTop: 15,

    gap: 0,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 30,
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
    color: "#fff",
    fontFamily: "Aeonik-Medium",
  },
  textContainer: {
    alignItems: "center",
    marginTop: 40,
    paddingHorizontal: 5,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 0,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.5,
    lineHeight: 24,
    letterSpacing: 0.5,
    fontFamily: "Aeonik-Regular",
    color: "#fff",
  },
});
