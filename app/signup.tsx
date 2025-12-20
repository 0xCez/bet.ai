import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from "react-native";

// Animated wrapper - only handles animation, doesn't care about children content
const AnimatedOptionWrapper = ({ children, animValue }: { children: React.ReactNode; animValue: Animated.Value }) => {
  return (
    <Animated.View
      style={{
        opacity: animValue,
        transform: [
          { translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) },
          { scale: animValue.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
};
import PagerView from "react-native-pager-view";
import { router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientButton } from "../components/ui/GradientButton";
import { IconButton } from "../components/ui/IconButton";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { updateAppState, getAppState } from "@/utils/appStorage";
import { MultilineText } from "@/components/ui/MultilineText";
import { ProfitGrowthChart } from "../components/ui/ProfitGrowthChart";
import { ProfitabilityComparisonChart } from "../components/ui/ProfitabilityComparisonChart";
import { UserReviewsCard } from "../components/ui/UserReviewsCard";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
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
  useCustomComponent?: string; // For custom animated components
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
    // Using custom component instead of image
    useCustomComponent: "profitGrowthChart",
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
    // Using custom component instead of image
    useCustomComponent: "profitabilityComparisonChart",
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
    useCustomComponent: "userReviewsCard",
  },
];

export default function SignupScreen() {
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<{
    [key: number]: string | string[];
  }>({});
  const [isRatingVisible, setIsRatingVisible] = useState(false);
  const posthog = usePostHog();

  // Animated progress bar
  const progressAnim = useRef(new Animated.Value(1 / slides.length)).current;

  // Track which pages have been visited (to render their options)
  const [visitedPages, setVisitedPages] = useState<Set<number>>(new Set([0]));

  // Animation values for each option on each page (max 6 options per page)
  // Using refs so they persist across renders
  const optionAnims = useRef<{ [pageIndex: number]: Animated.Value[] }>({}).current;

  // Get or create animation values for a page
  const getPageAnims = (pageIndex: number) => {
    if (!optionAnims[pageIndex]) {
      optionAnims[pageIndex] = Array.from({ length: 6 }, () => new Animated.Value(0));
    }
    return optionAnims[pageIndex];
  };

  // Animate options for a page
  const animatePageOptions = (pageIndex: number) => {
    const anims = getPageAnims(pageIndex);
    anims.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        delay: 50 + index * 60,
        useNativeDriver: true,
      }).start();
    });
  };

  // Animate first page on mount
  useEffect(() => {
    if (slides[0].options) {
      setTimeout(() => animatePageOptions(0), 100);
    }
  }, []);

  const handlePageSelected = async (e: any) => {
    const newPage = e.nativeEvent.position;
    setCurrentPage(newPage);

    // Mark page as visited and animate options
    if (!visitedPages.has(newPage)) {
      setVisitedPages(prev => new Set([...prev, newPage]));
      if (slides[newPage].options) {
        animatePageOptions(newPage);
      }
    }

    // Animate progress bar smoothly
    Animated.timing(progressAnim, {
      toValue: (newPage + 1) / slides.length,
      duration: 300,
      useNativeDriver: false,
    }).start();

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

      {/* Custom animated component for slide 3 */}
      {slide.useCustomComponent === "profitGrowthChart" && (
        <View style={styles.customComponentContainer}>
          <ProfitGrowthChart animate={true} />
        </View>
      )}

      {/* Custom animated component for slide 6 */}
      {slide.useCustomComponent === "profitabilityComparisonChart" && (
        <View style={styles.customComponentContainer}>
          <ProfitabilityComparisonChart animate={true} />
        </View>
      )}

      {/* Regular image slides */}
      {slide.image && !slide.useCustomComponent && (
        <Image
          source={slide.image}
          style={[
            styles.slideImage,
            {
              marginTop: slide.id === 6 ? 20 : 20,
            },
          ]}
          contentFit="contain"
          // transition={200}
        />
      )}

      {/* Custom animated component for slide 8 (User Reviews) */}
      {slide.useCustomComponent === "userReviewsCard" && (
        <View style={styles.customComponentContainer}>
          <UserReviewsCard animate={true} />
        </View>
      )}
    </View>
  );

  const renderQuestionSlide = (slide: OnboardingSlide, slideIndex: number) => (
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
        {visitedPages.has(slideIndex) && slide.options?.map((option, index) => {
          const isSelected =
            slide.id === 7
              ? ((selectedOptions[slide.id] as string[]) || []).includes(option)
              : selectedOptions[slide.id] === option;
          const anims = getPageAnims(slideIndex);

          return (
            <AnimatedOptionWrapper key={`${slideIndex}-${index}`} animValue={anims[index]}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  isSelected && styles.optionButtonSelected,
                ]}
                activeOpacity={0.8}
                onPress={() => handleOptionSelect(slide.id, option)}
              >
                <Text style={[
                  styles.buttonText,
                  isSelected && styles.buttonTextSelected,
                ]}>
                  {option}
                </Text>
              </TouchableOpacity>
            </AnimatedOptionWrapper>
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
        <IconButton icon="chevron-back" onPress={handleBack} size={28} />
        <View style={styles.progressBar}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
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
        {slides.map((slide, index) => (
          <View key={slide.id} style={styles.page}>
            {(slide.image || slide.useCustomComponent) ? renderImageSlide(slide) : renderQuestionSlide(slide, index)}
          </View>
        ))}
      </PagerView>

      {/* Only show bottom button for image/custom component slides */}
      {(slides[currentPage].image || slides[currentPage].useCustomComponent) && (
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
  welcomeImage: {
    width: 130,
    aspectRatio: 1,
    marginTop: spacing[5],
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center",
    padding: spacing[5],
    paddingVertical: 15,
    gap: spacing[3],
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: "rgba(39, 46, 58, 0.6)",
    borderRadius: borderRadius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    // Glow effect
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  slideContainer: {
    flex: 1,
    padding: spacing[5],
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: spacing[5],
    gap: 15,
  },
  scrollContainer: {
    flex: 1,
  },
  slideImage: {
    aspectRatio: 0.9,
    marginTop: 30,
    alignSelf: "flex-start",
    width: "100%",
  },
  customComponentContainer: {
    flex: 1,
    justifyContent: "center",
    marginTop: spacing[4],
  },
  description: {
    fontSize: typography.sizes.base,
    color: colors.mutedForeground, // #7A8BA3
    textAlign: "center",
    fontFamily: typography.fontFamily.light,
    paddingHorizontal: 0,
  },
  optionsContainer: {
    gap: spacing[4],
    paddingTop: 30,
  },
  optionsContainerWithButton: {
    paddingBottom: 100,
  },
  fixedNextButtonContainer: {
    position: "absolute",
    bottom: 60,
    left: spacing[5],
    right: spacing[5],
    backgroundColor: "transparent",
  },
  bottomContainer: {
    padding: spacing[5],
    paddingBottom: 60,
  },
  optionButton: {
    width: "100%",
    height: 60,
    borderRadius: borderRadius.xl,
    backgroundColor: "rgba(22, 26, 34, 0.8)",
    borderWidth: 1.5,
    borderColor: colors.rgba.primary20,
    alignItems: "center",
    justifyContent: "center",
    // Subtle shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  optionButtonSelected: {
    backgroundColor: colors.rgba.primary15,
    borderColor: colors.primary,
    borderWidth: 1.5,
    // Cyan glow effect
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonText: {
    fontSize: typography.sizes.base,
    color: colors.foreground, // #F5F8FC - light text
    textAlign: "center",
    fontFamily: typography.fontFamily.regular,
  },
  buttonTextSelected: {
    color: colors.foreground, // Keep text white for better contrast
    fontFamily: typography.fontFamily.medium,
  },
  nextButtonText: {
    fontSize: typography.sizes.base,
    color: colors.primaryForeground, // #0D0F14 - dark text on cyan
    textAlign: "center",
    fontFamily: typography.fontFamily.medium,
  },
  buttonTextDisabled: {
    opacity: 0.5,
  },
});
