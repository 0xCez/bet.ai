import React from "react";
import { Text, StyleSheet, View, Image } from "react-native";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientButton } from "../components/ui/GradientButton";
import { GradientText } from "../components/ui/GradientText";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MultilineText } from "@/components/ui/MultilineText";
import LottieView from "lottie-react-native";
import { ShimmerImage } from "@/components/ui/ShimmerImage";
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
            <Ionicons name="checkmark" size={20} color="#fff" />
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
    fontSize: 22,
    fontFamily: "Aeonik-Medium",
    color: "#FFFFFF",
  },
  container: {
    flex: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  successContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 30,
  },
  checkmarkContainer: {
    width: 30,
    height: 30,
    borderRadius: 20,
    backgroundColor: "#0BB3F8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  mainText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 40,
  },
  gameCardContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: 10,
    paddingHorizontal: 20,
  },
  gameCard: {
    // width: "80%",
    // aspectRatio: 1,
    // backgroundColor: "#1A1A1A",
    // borderRadius: 30,
    // overflow: "hidden",
    // marginBottom: 10,
  },
  gameCardWrapper: {
    width: 340,
    height: 340,
    borderRadius: 25,
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
    marginTop: 20, // Reduced from 40 to maintain proper spacing with the card above
    marginRight: 40,
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
    paddingHorizontal: 10,
    marginTop: "auto",
    marginBottom: 20,
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
