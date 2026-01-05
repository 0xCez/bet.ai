import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Image, Alert, Pressable, Animated } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Carousel, { ICarouselInstance } from "react-native-reanimated-carousel";
import { Logo } from "../components/ui/Logo";
import { updateAppState } from "../utils/appStorage";
import i18n from "../i18n";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import { OnboardingSlide2Visual } from "../components/ui/OnboardingSlide2Visual";
import { SharpsVsPublicChart, OddsMovementChart } from "../components/ui/OnboardingSlide3Visual";
import { OnboardingSlide4Visual } from "../components/ui/OnboardingSlide4Visual";
import { OnboardingSlide5Visual } from "../components/ui/OnboardingSlide5Visual";
import { OnboardingSlide1Visual } from "../components/ui/OnboardingSlide1Visual";
import { useOnboardingAnalytics } from "../hooks/useOnboardingAnalytics";

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
  const insets = useSafeAreaInsets();
  const { trackFunnelStep } = useOnboardingAnalytics();
  const hasTrackedStart = useRef(false);

  // Track carousel started on mount
  useEffect(() => {
    if (!hasTrackedStart.current) {
      trackFunnelStep('carousel_started');
      hasTrackedStart.current = true;
    }
  }, []);

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const isLastSlide = activeIndex === slides.length - 1;

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastSlide) {
      handleOnboardingComplete();
      return;
    }
    carouselRef.current?.scrollTo({ index: activeIndex + 1, animated: true });
  };

  const handleOnboardingComplete = async () => {
    try {
      console.log("Starting onboarding completion...");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Track carousel completed
      trackFunnelStep('carousel_completed');

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
      <Animated.View
        style={[
          styles.contentContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.title}>{item.title2}</Text>
        </View>
        {item.id === 1 ? (
          <OnboardingSlide1Visual isActive={activeIndex === 0} />
        ) : item.id === 2 ? (
          <OnboardingSlide2Visual isActive={activeIndex === 1} />
        ) : item.id === 3 ? (
          <View style={styles.slide3Container}>
            <View style={styles.slide3ChartsWrapper}>
              <View style={styles.sharpsChartPosition}>
                <SharpsVsPublicChart isActive={activeIndex === 2} />
              </View>
              <View style={styles.oddsChartPosition}>
                <OddsMovementChart isActive={activeIndex === 2} />
              </View>
            </View>
          </View>
        ) : item.id === 4 ? (
          <OnboardingSlide4Visual isActive={activeIndex === 3} />
        ) : item.id === 5 ? (
          <OnboardingSlide5Visual isActive={activeIndex === 4} />
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
          <Text style={styles.description}>{item.description}</Text>
        </View>
      </Animated.View>
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

  // Calculate available height for carousel (between header and bottom)
  const headerHeight = insets.top + 50; // safe area + logo + padding
  const bottomHeight = Math.max(insets.bottom, 20) + 120; // safe area + dots + button
  const carouselHeight = SCREEN_HEIGHT - headerHeight - bottomHeight;

  return (
    <View style={styles.screenContainer}>
      {/* Header with Logo */}
      <View style={[styles.header, { height: headerHeight, paddingTop: insets.top + 10 }]}>
        <Logo size="small" />
      </View>

      {/* Carousel fills middle space */}
      <View style={{ marginTop: headerHeight }}>
        <Carousel
          ref={carouselRef}
          loop={false}
          width={SCREEN_WIDTH}
          height={carouselHeight}
          data={slides}
          renderItem={renderSlide}
          onSnapToItem={setActiveIndex}
          mode="parallax"
          modeConfig={{
            parallaxScrollingScale: 0.9,
            parallaxScrollingOffset: 30,
          }}
        />
      </View>

      {/* Bottom Container */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 20) + 20 }]}>
        {renderPaginationDots()}
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {i18n.t('onboardingButtonNext')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  slide: {
    flex: 1,
    justifyContent: "center",
  },
  contentContainer: {
    paddingHorizontal: spacing[2],
    alignItems: "center",
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: spacing[5],
    width: "100%",
    paddingHorizontal: 0,
  },
  title: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 30,
    color: colors.foreground,
    textAlign: "center",
    lineHeight: 38,
  },
  imageContainer: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_HEIGHT * 0.45,
    justifyContent: "center",
    alignItems: "center",
  },
  slide3Container: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_HEIGHT * 0.50,
    justifyContent: "center",
    alignItems: "center",
  },
  slide3ChartsWrapper: {
    position: "relative",
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  sharpsChartPosition: {
    position: "absolute",
    top: 25,
    left: -10,
    zIndex: 1,
  },
  oddsChartPosition: {
    position: "absolute",
    bottom: 15,
    right: -10,
    zIndex: 2,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  textContainer: {
    marginTop: spacing[4],
    alignItems: "center",
    width: "100%",
  },
  description: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 18,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 26,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing[5],
    width: "100%",
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
    marginHorizontal: 5,
  },
  paginationDotActive: {
    backgroundColor: colors.primary,
    width: 8,
  },
  // Primary CTA Button
  primaryButton: {
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.97 }],
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
  },
});
