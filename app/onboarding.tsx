import React, { useState, useRef } from "react";
import { View, StyleSheet, Dimensions, Image, Alert, Text } from "react-native";
import { router } from "expo-router";
import Carousel, { ICarouselInstance } from "react-native-reanimated-carousel";
import { GradientButton } from "../components/ui/GradientButton";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { Logo } from "../components/ui/Logo";
import { updateAppState } from "../utils/appStorage";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import i18n from "../i18n";
import LottieView from "lottie-react-native";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingSlide {
  id: number;
  title: string;
  title2: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  image?: any;
}

const slides: OnboardingSlide[] = [
  {
    id: 1,
    title: i18n.t('onboardingSlide1Title'),
    title2: i18n.t('onboardingSlide1Title2'),
    description: i18n.t('onboardingSlide1Description'),
    icon: "gift-outline",
  },
  {
    id: 2,
    title: i18n.t('onboardingSlide2Title'),
    title2: i18n.t('onboardingSlide2Title2'),
    description: i18n.t('onboardingSlide2Description'),
    icon: "camera-outline",
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
    icon: "analytics-outline",
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
    icon: "flash-outline",
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
    icon: "trending-up-outline",
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
        {/* Icon in circular container */}
        <View style={styles.iconCircle}>
          <Ionicons name={item.icon} size={48} color={colors.primary} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.titleHighlight}>{item.title2}</Text>
        </View>

        {item.id === 1 ? (
          <LottieView
            source={require("../assets/lottie/welcome.json")}
            autoPlay
            loop={true}
            style={styles.lottieAnimation}
          />
        ) : item.image ? (
          <View style={styles.imageContainer}>
            <Image
              source={item.image}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
        ) : null}

        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>{item.description}</Text>
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
    <ScreenBackground hideBg>
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

      <View style={styles.bottomContainer}>
        {renderPaginationDots()}
        <GradientButton onPress={handleNext}>{i18n.t('onboardingButtonNext')}</GradientButton>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    alignItems: "center",
  },
  slide: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: spacing[5],
    justifyContent: "flex-start",
    paddingTop: spacing[6],
    paddingBottom: 120,
    alignItems: "center",
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(22, 26, 34, 0.9)",
    borderWidth: 2,
    borderColor: colors.rgba.primary50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[6],
    // Strong glow effect
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: spacing[4],
    width: "100%",
  },
  title: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes["2xl"],
    color: colors.mutedForeground,
    textAlign: "center",
  },
  titleHighlight: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.sizes["3xl"],
    color: colors.foreground,
    textAlign: "center",
    marginTop: spacing[1],
  },
  lottieAnimation: {
    width: "100%",
    height: "55%",
    marginTop: spacing[4],
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    marginTop: spacing[4],
    paddingHorizontal: spacing[2],
    // Glass card styling
    backgroundColor: "rgba(22, 26, 34, 0.7)",
    borderRadius: borderRadius["2xl"],
    borderWidth: 1.5,
    borderColor: colors.rgba.primary40,
    overflow: "hidden",
    // Subtle glow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  descriptionContainer: {
    marginTop: spacing[6],
    alignItems: "center",
    width: "100%",
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[5],
    backgroundColor: "rgba(22, 26, 34, 0.85)",
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.rgba.primary30,
    // Glow effect
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  description: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.base,
    color: colors.foreground,
    textAlign: "center",
    lineHeight: 24,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing[5],
    paddingBottom: 34,
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing[6],
    width: "100%",
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
    marginHorizontal: 5,
  },
  paginationDotActive: {
    backgroundColor: colors.primary,
    width: 28,
    height: 10,
    // Strong glow on active dot
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 6,
  },
});
