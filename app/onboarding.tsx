import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, Dimensions, Image, Alert } from "react-native";
import { router } from "expo-router";
import Carousel, { ICarouselInstance } from "react-native-reanimated-carousel";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "../components/ui/GradientButton";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { Logo } from "../components/ui/Logo";
import { GradientText } from "../components/ui/GradientText";
import { updateAppState } from "../utils/appStorage";
import { MultilineText } from "@/components/ui/MultilineText";
import i18n from "../i18n";
import LottieView from "lottie-react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface OnboardingSlide {
  id: number;
  title: string;
  title2: string;
  description: string;
  image: any;
}

const slides: OnboardingSlide[] = [
  {
    id: 1,
    title: i18n.t('onboardingSlide1Title'),
    title2: i18n.t('onboardingSlide1Title2'),
    description: i18n.t('onboardingSlide1Description'),
    image: require("../assets/images/onboarding/slide1.png"),
  },
  {
    id: 2,
    title: i18n.t('onboardingSlide2Title'),
    title2: i18n.t('onboardingSlide2Title2'),
    description: i18n.t('onboardingSlide2Description'),
    image: i18n.locale.startsWith("fr")
    ? require("../assets/images/onboarding/slide2-fr.png")
    : i18n.locale.startsWith("es")
    ? require("../assets/images/onboarding/slide2-es.png")
    : require("../assets/images/onboarding/slide2.png"),
  },
  {
    id: 3,
    title: i18n.t('onboardingSlide3Title'),
    title2: i18n.t('onboardingSlide3Title2'),
    description: i18n.t('onboardingSlide3Description'),
    image: i18n.locale.startsWith("fr")
    ? require("../assets/images/onboarding/slide3-fr.png")
    : i18n.locale.startsWith("es")
    ? require("../assets/images/onboarding/slide3-es.png")
    : require("../assets/images/onboarding/slide3.png"),
  },
  {
    id: 4,
    title: i18n.t('onboardingSlide4Title'),
    title2: i18n.t('onboardingSlide4Title2'),
    description: i18n.t('onboardingSlide4Description'),
    image: i18n.locale.startsWith("fr")
    ? require("../assets/images/onboarding/slide4-fr.png")
    : i18n.locale.startsWith("es")
    ? require("../assets/images/onboarding/slide4-es.png")
    : require("../assets/images/onboarding/slide4.png"),
  },
  {
    id: 5,
    title: i18n.t('onboardingSlide5Title'),
    title2: i18n.t('onboardingSlide5Title2'),
    description: i18n.t('onboardingSlide5Description'),
    image: i18n.locale.startsWith("fr")
    ? require("../assets/images/onboarding/slide5-fr.png")
    : i18n.locale.startsWith("es")
    ? require("../assets/images/onboarding/slide5-es.png")
    : require("../assets/images/onboarding/slide5.png"),
  },
];

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef<ICarouselInstance>(null);

  const isLastSlide = activeIndex === slides.length - 1;

  const handleNext = () => {
    if (isLastSlide) {
      handleOnboardingComplete();
      return;
    }
    carouselRef.current?.scrollTo({ index: activeIndex + 1, animated: true });
  };

  const handleOnboardingComplete = async () => {
    try {
      console.log("Starting onboarding completion...");

      // Save onboarding completion state
      await updateAppState({
        onboardingComplete: true,
        signupStep: 0,
        signupComplete: false,
        signupAnswers: {},
      });

      // Navigate to welcome screen
      console.log("Navigating to welcome screen...");
      router.replace("/welcome");
    } catch (error) {
      console.error("Error in handleOnboardingComplete:", error);
      Alert.alert(
        "Error",
        "There was an error saving your progress. Please try again."
      );
    }
  };

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={styles.slide}>
      <View style={styles.contentContainer}>
        <View style={styles.titleContainer}>
          {/* <GradientText fontSize={38}>{item.title}</GradientText> */}
          <MultilineText
            line1={item.title}
            line2={item.title2}
            fontSize={26} // optional
          />
        </View>
        {item.id === 1 ? (
          <LottieView
            source={require("../assets/lottie/welcome.json")}
            autoPlay
            loop={true}
            style={{ width: "100%", height: "60%", marginBottom: 20 }}
          />
        ) : (
          <View style={styles.imageContainer}>
            <Image
              source={item.image}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
        )}

        <View style={styles.textContainer}>
          <GradientText fontSize={24} style={styles.description}>
            {item.description}
          </GradientText>
        </View>
      </View>
    </View>
  );

  const renderPaginationDots = () => (
    <View style={styles.paginationContainer}>
      {slides.map((_, index) => (
        <View
          key={index}
          style={[
            styles.paginationDot,
            index === activeIndex && styles.paginationDotActive,
          ]}
        />
      ))}
    </View>
  );

  return (
    <ScreenBackground backgroundImage={require("../assets/images/bg4.png")}>
      <View style={styles.header}>
        <Logo size="small" />
      </View>

      <Carousel
        ref={carouselRef}
        loop={false}
        width={SCREEN_WIDTH}
        height={SCREEN_WIDTH * 1.9}
        data={slides}
        renderItem={renderSlide}
        onSnapToItem={setActiveIndex}
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 0.9,
          parallaxScrollingOffset: 30,
        }}
      />

      <BlurView intensity={0} tint="dark" style={styles.bottomContainer}>
        {renderPaginationDots()}
        <GradientButton onPress={handleNext}>{i18n.t('onboardingButtonNext')}</GradientButton>
      </BlurView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: "center",
  },
  logo: {
    fontFamily: "Aeonik-Regular",
    fontSize: 30,
    color: "#FFFFFF",
    textAlign: "center",
  },
  slide: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 0,
    justifyContent: "space-between",
    paddingTop: 0,
    paddingBottom: 100,
    alignItems: "center",
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: 32,
    width: "100%",
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  textContainer: {
    marginTop: 32,
    alignItems: "center",
    width: "100%",
    marginBottom: 30,
  },
  title: {
    fontFamily: "Aeonik-Medium",
    fontSize: 38,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  description: {
    fontFamily: "Aeonik-Regular",
    fontSize: 20,
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 30,
    // letterSpacing: 0.5,
    paddingHorizontal: 0,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 34,
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
    width: "100%",
  },
  paginationDot: {
    width: 9,
    height: 9,
    borderRadius: 4,
    backgroundColor: "#333333",
    marginHorizontal: 5,
  },
  paginationDotActive: {
    backgroundColor: "#ffffff",
    width: 9,
  },
});
