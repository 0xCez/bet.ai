import React from "react";
import { Text, StyleSheet, View, Image } from "react-native";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientButton } from "../components/ui/GradientButton";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MultilineText } from "@/components/ui/MultilineText";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import LottieView from "lottie-react-native";
import GlowComponent from "../components/ui/GlowComponent";
import i18n from "../i18n";

export default function TutorialScreen() {
  return (
    <ScreenBackground hideBg={true}>
      <LottieView
        source={require("../assets/lottie/confettis.json")}
        autoPlay
        loop={false}
        style={{ width: "100%", height: "100%", position: "absolute", zIndex: 999, pointerEvents: "none" }}
      />
      <View style={styles.container}>
        {/* Success Icon and Message */}
        <View style={styles.successContainer}>
          <View style={styles.checkmarkContainer}>
            <Ionicons name="checkmark" size={20} color={colors.primaryForeground} />
          </View>
          <Text style={styles.successText}>{i18n.t("tutorialAllDone")}</Text>
        </View>

        {/* Main Message */}

        <MultilineText
          line1={i18n.t("tutorialFindWinningBets")}
          line2={i18n.t("tutorialSimplePicture")}
          fontSize={26} // optional
          fontFamily="Aeonik-Medium"
        />

        {/* Game Card */}
        <View style={styles.gameCardContainer}>
          <View style={styles.gameCard}>
            <View style={{
              width: "100%",
              height: 300,
              aspectRatio: 1,
              alignSelf: "center",
              marginTop: 20,
              marginBottom: 20,
              borderRadius: 35,
            }}>
              <GlowComponent
                imageSource={
                  i18n.locale.startsWith("fr")
                    ? require("../assets/images/demo_fr.png")
                    : i18n.locale.startsWith("es")
                      ? require("../assets/images/demo_es.png")
                      : require("../assets/images/demo_en.png")
                }
                style={{width: '100%', height: '100%', backgroundColor: 'transparent'}}
                pulse={true}
              />
            </View>
            {/* <Image
              source={require("../assets/images/demo.png")}
              style={styles.gameCardWrapper}
              resizeMode="contain"
            /> */}
          </View>
          <View style={styles.demoLabel}>
            <Image
              source={
                i18n.locale.startsWith("fr")
                  ? require("../assets/images/arrow-fr.png")
                  : i18n.locale.startsWith("es")
                    ? require("../assets/images/arrow-es.png")
                    : require("../assets/images/arrow-en.png")
              }
              style={styles.arrowImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.buttonContainer}>
          <GradientButton
            onPress={() =>
              router.push({
                pathname: "/analysis",
                params: {
                  isDemo: "true",
                  analysisId:
                    i18n.locale.startsWith("fr")
                      ? "9vYnwxZ4MIyDZvuaB3HR"
                      : i18n.locale.startsWith("es")
                        ? "JTSXUKYC5cNhfqpXvIue"
                        : "EzUfK8cw0tbFR0cFSIfF",
                },
              })
            }
          >
            {i18n.t("tutorialStartDemo")}
          </GradientButton>
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  successText: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing[3],
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[10],
  },
  successContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[3],
    marginBottom: 30,
  },
  checkmarkContainer: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary, // #00D7D7 - cyan checkmark
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  mainText: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.foreground,
    textAlign: "center",
    marginBottom: spacing[10],
    lineHeight: 40,
  },
  gameCardContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: spacing[3],
    paddingHorizontal: spacing[5],
  },
  gameCard: {
    // Empty - used for layout
  },
  gameCardWrapper: {
    width: 340,
    height: 340,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
  gameImage: {
    width: 290,
    height: 290,
    resizeMode: "contain",
  },
  demoLabel: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[5],
    marginRight: spacing[10],
    width: "100%",
    height: 40,
    justifyContent: "flex-end",
  },
  arrowImage: {
    width: 200,
    height: 100,
  },
  buttonContainer: {
    width: "100%",
    paddingHorizontal: spacing[3],
    marginTop: "auto",
    marginBottom: spacing[5],
  },
  confettiContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    zIndex: 10,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  confetti: {
    width: "100%",
    height: "100%",
  },
});
