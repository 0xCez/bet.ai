import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Pressable,
  ScrollView,
} from "react-native";
import PagerView from "react-native-pager-view";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientText } from "../components/ui/GradientText";
import { GradientButton } from "../components/ui/GradientButton";
import { BorderButton } from "../components/ui/BorderButton";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { updateAppState, getAppState } from "@/utils/appStorage";
import { MultilineText } from "@/components/ui/MultilineText";
import { BlackGradientButton } from "@/components/ui/BlackGradientButton";
import * as StoreReview from "expo-store-review";
import { usePostHog } from "posthog-react-native";
import i18n from "../i18n";

// Define the type for the onboarding slides
interface OnboardingSlide {
  id: number;
  title1?: string; // Made optional since slides can have either title or question
  title2?: string;
  description1?: string;
  description2?: string;
  image?: any;
  question1?: string;
  question2?: string;
  options?: string[];
}

// Create the array of onboarding slides
const slides: OnboardingSlide[] = [
  {
    id: 1,
    question1: i18n.t("signupBettingDecisions1"),
    question2: i18n.t("signupBettingDecisions2"),
    description1: i18n.t("signupWillCustomize1"),
    description2: i18n.t("signupWillCustomize2"),
    options: [
      i18n.t("signupOptionResearch"),
      i18n.t("signupOptionGut"),
      i18n.t("signupOptionFollow"),
    ],
  },
  {
    id: 2,
    question1: i18n.t("signupRiskLevel1"),
    question2: i18n.t("signupRiskLevel2"),
    description1: i18n.t("signupWillCustomize1"),
    description2: i18n.t("signupWillCustomize2"),
    options: [
      i18n.t("signupOptionLow"),
      i18n.t("signupOptionMedium"),
      i18n.t("signupOptionHigh"),
    ],
  },
  {
    id: 3,
    title1: i18n.t("signupMaximizeProfits1"),
    title2: i18n.t("signupMaximizeProfits2"),
    image:
      i18n.locale.startsWith("fr")
        ? require("../assets/images/signup/signup1-fr.png")
        : i18n.locale.startsWith("es")
          ? require("../assets/images/Signup1-es.png")
          : require("../assets/images/signup/signup1.png"),
  },
  {
    id: 4,
    question1: i18n.t("signupFeelConfident1"),
    question2: i18n.t("signupFeelConfident2"),
    description1: i18n.t("signupWillCustomize1"),
    description2: i18n.t("signupWillCustomize2"),
    options: [
      i18n.t("signupOptionYes"),
      i18n.t("signupOptionSometimes"),
      i18n.t("signupOptionNotReally"),
    ],
  },
  {
    id: 5,
    question1: i18n.t("signupBetFrequency1"),
    question2: i18n.t("signupBetFrequency2"),
    description1: i18n.t("signupWillCustomize1"),
    description2: i18n.t("signupWillCustomize2"),
    options: [
      i18n.t("signupOptionEveryDay"),
      i18n.t("signupOptionFewTimesWeek"),
      i18n.t("signupOptionMajorEvents"),
      i18n.t("signupOptionJustStarting"),
    ],
  },
  {
    id: 6,
    title1: i18n.t("signupDataBacked1"),
    title2: i18n.t("signupDataBacked2"),
    image:
      i18n.locale.startsWith("fr")
        ? require("../assets/images/signup/signup2-fr.png")
        : i18n.locale.startsWith("es")
          ? require("../assets/images/Signup2-es.png")
          : require("../assets/images/signup/signup2.png"),
  },
  {
    id: 7,
    question1: i18n.t("signupSportsBet1"),
    question2: i18n.t("signupSportsBet2"),
    description1: i18n.t("signupWillCustomize1"),
    description2: i18n.t("signupWillCustomize2"),
    options: [
      i18n.t("signupSportNFL"),
      i18n.t("signupSportNBA"),
      i18n.t("signupSportMLB"),
      i18n.t("signupSportSoccer"),
      i18n.t("signupSportUFC"),
      i18n.t("signupSportTennis"),
    ],
  },
  {
    id: 8,
    title1: i18n.t("signupWinningConsistently1"),
    title2: i18n.t("signupWinningConsistently2"),
    image: require("../assets/images/review.png"),
  },
];

export default function SignupScreen() {
  const { width } = useWindowDimensions();
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<{
    [key: number]: string | string[];
  }>({});
  const [isRatingVisible, setIsRatingVisible] = useState(false);
  const posthog = usePostHog();

  const handlePageSelected = async (e: any) => {
    const newPage = e.nativeEvent.position;
    setCurrentPage(newPage);

    // Track step change with PostHog
    const currentSlide = slides[newPage];
    await posthog?.capture("signup_step_changed", {
      step_number: newPage + 1,
      total_steps: slides.length,
      step_type: currentSlide.question1 ? "question" : "info",
      step_title: currentSlide.title1 || currentSlide.question1,
      selected_options: selectedOptions[currentSlide.id],
    });

    // Show store review prompt when slide 8 is reached
    if (newPage === 7) {
      // Index 7 corresponds to slide 8
      try {
        setIsRatingVisible(true);
        const isAvailable = await StoreReview.isAvailableAsync();
        if (isAvailable) {
          await StoreReview.requestReview();
        }
        // Add a small delay to ensure the rating dialog has been shown
        setTimeout(() => {
          setIsRatingVisible(false);
        }, 500);
      } catch (error) {
        console.error("[Signup] Error requesting store review:", error);
        setIsRatingVisible(false);
      }
    }
  };

  const handleBack = () => {
    if (currentPage === 0) {
      // If on first slide, go back to welcome screen
      router.back();
    } else {
      // If on any other slide, go to previous slide
      pagerRef.current?.setPage(currentPage - 1);
    }
  };

  const handleOptionSelect = async (slideId: number, option: string) => {
    let newSelectedOptions;

    // Special handling for sports selection (slide 7)
    if (slideId === 7) {
      const currentSports = (selectedOptions[slideId] as string[]) || [];
      const newSports = currentSports.includes(option)
        ? currentSports.filter((sport) => sport !== option)
        : [...currentSports, option];

      newSelectedOptions = {
        ...selectedOptions,
        [slideId]: newSports,
      };
    } else {
      // Regular single selection for other slides
      newSelectedOptions = {
        ...selectedOptions,
        [slideId]: option,
      };
    }

    setSelectedOptions(newSelectedOptions);

    // Track option selection with PostHog
    const currentSlide = slides[slideId - 1];
    await posthog?.capture("signup_option_selected", {
      step_number: slideId,
      step_type: "question",
      step_title: currentSlide.question1,
      selected_option: option,
      is_sports_selection: slideId === 7,
      total_sports_selected:
        slideId === 7 ? newSelectedOptions[slideId].length : undefined,
    });

    try {
      await updateAppState({
        onboardingComplete: true,
        signupStep: currentPage + 1,
        signupComplete: false,
        signupAnswers: newSelectedOptions,
      });

      console.log("[Signup] Progress saved:", {
        step: currentPage + 1,
        answers: newSelectedOptions,
      });
    } catch (error) {
      console.error("[Signup] Error saving progress:", error);
    }

    // Only auto-advance for non-sports selection slides
    if (slideId !== 7 && currentPage < slides.length - 1) {
      setTimeout(() => {
        pagerRef.current?.setPage(currentPage + 1);
      }, 500);
    } else if (currentPage === slides.length - 1) {
      // Handle completion if it's the last slide
      await handleSignupComplete();
    }
  };

  const handleSignupComplete = async () => {
    try {
      // Track signup completion with PostHog
      await posthog?.capture("signup_completed", {
        total_steps_completed: slides.length,
        selected_answers: selectedOptions,
      });

      // Store all the final answers and mark signup as complete
      console.log("[Signup] Saving completion status:");
      await updateAppState({
        signupComplete: true,
      });

      // console.log("[Signup] Completion status saved:", selectedOptions);

      router.push("/loading");
    } catch (error) {
      console.error("[Signup] Error saving signup completion:", error);
    }
  };

  // Load saved progress on mount
  useEffect(() => {
    const loadProgress = async () => {
      try {
        const appState = await getAppState();
        console.log("[Signup] Loaded progress:", appState);

        if (appState.signupAnswers) {
          setSelectedOptions(appState.signupAnswers);
        }
        if (appState.signupStep && appState.signupStep > 0) {
          pagerRef.current?.setPage(appState.signupStep - 1);
        }
      } catch (error) {
        console.error("[Signup] Error loading signup progress:", error);
      }
    };
    loadProgress();
  }, []);

  const renderImageSlide = (slide: OnboardingSlide) => (
    <View style={styles.slideContainer}>
      <View style={styles.headerContainer}>
        <MultilineText
          line1={slide.title1 || ""}
          line2={slide.title2 || ""}
          fontSize={slide.id === 6 || slide.id === 3 ? 24 : 26}
          fontFamily="Aeonik-Medium"
          letterSpacing={slide.id === 6 ? "tight" : "normal"}
        />

        {slide.description1 && (
          <MultilineText
            line1={slide.description1 || ""}
            line2={slide.description2 || ""}
            fontSize={13}
            lineHeight={18}
            fontFamily="Aeonik-Light"
            isLight={true}
          />
        )}
      </View>

      {slide.id !== 8 && (
        <Image
          source={slide.image}
          style={[
            styles.slideImage,
            {
              marginTop: slide.id === 3 ? 30 : slide.id === 6 ? 20 : 20,
            },
          ]}
          contentFit="contain"
          // transition={200}
        />
      )}

      {slide.id === 8 && (
        <ScrollView
          style={styles.reviewScrollContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.reviewContentContainer}
        >
          <View style={styles.reviewContainer}>
            <Image
              source={require("../assets/images/welcome.png")}
              style={styles.starImage}
              contentFit="contain"
            />
            <View style={styles.reviewImageContainer}>
              <Image
                source={
                  i18n.locale.startsWith("fr")
                    ? require("../assets/images/review1-fr.png")
                    : i18n.locale.startsWith("es")
                      ? require("../assets/images/review1-es.png")
                      : require("../assets/images/review1.png")
                }
                style={styles.reviewImage}
                contentFit="contain"
              />
              <Image
                source={
                  i18n.locale.startsWith("fr")
                    ? require("../assets/images/review2-fr.png")
                    : i18n.locale.startsWith("es")
                      ? require("../assets/images/review2-es.png")
                      : require("../assets/images/review2.png")
                }
                style={styles.reviewImage}
                contentFit="contain"
              />
              <Image
                source={
                  i18n.locale.startsWith("fr")
                    ? require("../assets/images/review3-fr.png")
                    : i18n.locale.startsWith("es")
                      ? require("../assets/images/review3-es.png")
                      : require("../assets/images/review3.png")
                }
                style={styles.reviewImage}
                contentFit="contain"
              />
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );

  const renderQuestionSlide = (slide: OnboardingSlide) => (
    <View style={styles.slideContainer}>
      <View style={styles.headerContainer}>
        <MultilineText
          line1={slide.question1 || ""}
          line2={slide.question2 || ""}
          fontSize={26}
          fontFamily="Aeonik-Medium"
        />

        {slide.description1 && (
          <MultilineText
            line1={slide.description1 || ""}
            line2={slide.description2 || ""}
            fontSize={13}
            lineHeight={18}
            fontFamily="Aeonik-Light"
            isLight={true}
          />
        )}
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={[
          styles.optionsContainer,
          // Add bottom padding for sports selection to account for the Next button
          slide.id === 7 ? styles.optionsContainerWithButton : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {slide.options?.map((option, index) => {
          const isSelected =
            slide.id === 7
              ? ((selectedOptions[slide.id] as string[]) || []).includes(option)
              : selectedOptions[slide.id] === option;

          return isSelected ? (
            <GradientButton
              borderRadius={20}
              key={index}
              height={60}
              colors={["#00C1E0", "#009EDB", "#00A6CD"]}
              onPress={() => handleOptionSelect(slide.id, option)}
            >
              <Text style={styles.buttonText}>{option}</Text>
            </GradientButton>
          ) : (
            <BlackGradientButton
              key={index}
              borderRadius={20}
              onPress={() => handleOptionSelect(slide.id, option)}
            >
              <Text style={styles.buttonText}>{option}</Text>
            </BlackGradientButton>
          );
        })}
      </ScrollView>

      {/* Show Next button for sports selection when at least one sport is selected */}
      {slide.id === 7 &&
        ((selectedOptions[7] as string[]) || []).length > 0 && (
          <View style={styles.fixedNextButtonContainer}>
            <GradientButton
              onPress={() => {
                if (currentPage < slides.length - 1) {
                  pagerRef.current?.setPage(currentPage + 1);
                }
              }}
            >
              <Text style={styles.nextButtonText}>{i18n.t("signupNext")}</Text>
            </GradientButton>
          </View>
        )}
    </View>
  );

  return (
    <ScreenBackground hideBg>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          {/* <Ionicons name="arrow-back" size={24} color="white" /> */}
          <Image
            source={require("../assets/images/back.png")}
            style={styles.backIcon}
            contentFit="contain"
          />
        </TouchableOpacity>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentPage + 1) / slides.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={handlePageSelected}
        scrollEnabled={false} // Disable manual swiping
      >
        {slides.map((slide) => (
          <View key={slide.id} style={styles.page}>
            {slide.image ? renderImageSlide(slide) : renderQuestionSlide(slide)}
          </View>
        ))}
      </PagerView>

      {/* Only show bottom button for image slides */}
      {slides[currentPage].image && (
        <BlurView intensity={0} tint="dark" style={styles.bottomContainer}>
          <GradientButton
            onPress={() => {
              if (currentPage < slides.length - 1) {
                pagerRef.current?.setPage(currentPage + 1);
              } else {
                handleSignupComplete();
              }
            }}
            disabled={isRatingVisible}
          >
            <Text
              style={[
                styles.nextButtonText,
                isRatingVisible && styles.buttonTextDisabled,
              ]}
            >
              {i18n.t("signupNext")}
            </Text>
          </GradientButton>
        </BlurView>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  reviewScrollContainer: {
    flex: 1,
    width: "100%",
  },
  reviewContentContainer: {
    flexGrow: 1,
  },
  reviewImageContainer: {
    width: "100%",
    gap: 0,
    alignItems: "center",
    marginTop: 0,
  },
  reviewContainer: {
    width: "100%",
    gap: 20,
    alignItems: "center",
  },
  reviewImage: {
    width: "100%",
    aspectRatio: 2,
    // height: 180,
    borderRadius: 12,
  },
  starImage: {
    width: "100%",
    height: 50,
    marginTop: 0,
  },
  welcomeImage: {
    width: 130,
    aspectRatio: 1,
    marginTop: 20,
  },
  backIcon: {
    width: 40,
    height: 40,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center",
    padding: 20,
    paddingVertical: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(14, 14, 14, 0.83)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: "#3A3838",
    borderRadius: 10,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#00C2E0",
    borderRadius: 10,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  slideContainer: {
    flex: 1,
    padding: 20,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 20,
    gap: 15,
  },
  scrollContainer: {
    flex: 1,
  },
  slideImage: {
    aspectRatio: 0.9,
    marginTop: 30,
    alignSelf: "flex-start",
    // backgroundColor: "red",
    width: "100%",
  },
  description: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    fontFamily: "Aeonik-Light",
    paddingHorizontal: 0,
  },
  optionsContainer: {
    gap: 16,
    paddingTop: 30,
  },
  optionsContainerWithButton: {
    paddingBottom: 100, // Add space for the fixed Next button
  },
  fixedNextButtonContainer: {
    position: "absolute",
    bottom: 60,
    left: 20,
    right: 20,
    backgroundColor: "transparent",
  },
  bottomContainer: {
    padding: 20,
    paddingBottom: 60,
  },
  buttonText: {
    fontSize: 18,
    color: "white",
    textAlign: "center",
    fontFamily: "Aeonik-Regular",
  },
  nextButtonText: {
    fontSize: 18,
    color: "white",
    textAlign: "center",
    fontFamily: "Aeonik-Medium",
  },
  buttonTextDisabled: {
    opacity: 0.5,
  },
} as const);
