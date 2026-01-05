import React, { useEffect, useState, useRef } from "react";
import {
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Platform,
  Dimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  interpolate,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { useRevenueCatUser } from "./hooks/useRevenueCatUser";
import { usePaywallActions } from "./hooks/usePaywallActions";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import { LogoSpinner } from "../components/ui/LogoSpinner";
import { Logo } from "../components/ui/Logo";
import { useOnboardingAnalytics } from "../hooks/useOnboardingAnalytics";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Animated orb background
function AnimatedOrb() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 2500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.orbContainer, animatedStyle]}>
      <LinearGradient
        colors={[`${colors.primary}50`, `${colors.primary}20`, `${colors.primary}05`, 'transparent']}
        style={styles.orb}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
    </Animated.View>
  );
}

// Premium features - actual app features only
const premiumFeatures = [
  {
    icon: "scan-outline" as const,
    title: "Unlimited Bet Scans",
    desc: "Snap any bet slip for instant AI analysis"
  },
  {
    icon: "hardware-chip-outline" as const,
    title: "AI Match Analysis",
    desc: "Deep insights on matchups and value opportunities"
  },
  {
    icon: "trending-up-outline" as const,
    title: "Market Intelligence",
    desc: "Track odds movements across sportsbooks"
  },
  {
    icon: "chatbubbles-outline" as const,
    title: "Expert AI Assistant",
    desc: "Get personalized betting insights 24/7"
  },
  {
    icon: "people-outline" as const,
    title: "Player & Team Stats",
    desc: "Detailed performance data and comparisons"
  },
];

// Feature card component
function FeatureCard({ icon, title, desc, delay }: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400).springify()}
      style={styles.featureCard}
    >
      <View style={styles.featureCardLeft}>
        <View style={styles.featureIconContainer}>
          <Ionicons name={icon} size={24} color={colors.primary} />
        </View>
        <View style={styles.featureTextContainer}>
          <Text style={styles.featureTitle}>{title}</Text>
          <Text style={styles.featureDesc}>{desc}</Text>
        </View>
      </View>
      <Ionicons name="checkmark-circle" size={24} color={colors.success} />
    </Animated.View>
  );
}

// Pricing card component
function PricingCard({
  isSelected,
  onSelect,
  title,
  price,
  interval,
  perDay,
  badge,
  discount,
  delay,
}: {
  isSelected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  interval: string;
  perDay?: string;
  badge?: string;
  discount?: string;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400).springify()}>
      <Pressable
        onPress={onSelect}
        style={({ pressed }) => [
          styles.pricingCard,
          isSelected && styles.pricingCardSelected,
          pressed && styles.pricingCardPressed,
        ]}
      >
        {badge && (
          <View style={styles.badgeContainer}>
            <LinearGradient
              colors={[colors.primary, '#00B8B8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badge}
            >
              <Ionicons name="star" size={10} color={colors.primaryForeground} />
              <Text style={styles.badgeText}>{badge}</Text>
            </LinearGradient>
          </View>
        )}

        <View style={styles.cardContent}>
          <View style={styles.cardLeft}>
            <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
              {isSelected && <View style={styles.radioInner} />}
            </View>
            <View>
              <Text style={[styles.planTitle, isSelected && styles.planTitleSelected]}>
                {title}
              </Text>
              {perDay && (
                <Text style={styles.perDayText}>{perDay}</Text>
              )}
            </View>
          </View>

          <View style={styles.cardRight}>
            {discount && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{discount}</Text>
              </View>
            )}
            <Text style={[styles.priceText, isSelected && styles.priceTextSelected]}>
              {price}
            </Text>
            <Text style={styles.intervalText}>{interval}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// Trust indicator component
function TrustIndicator({ icon, text, delay }: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeIn.delay(delay).duration(400)}
      style={styles.trustIndicator}
    >
      <Ionicons name={icon} size={18} color={colors.success} />
      <Text style={styles.trustIndicatorText}>{text}</Text>
    </Animated.View>
  );
}

// Testimonial card
function TestimonialCard() {
  return (
    <Animated.View
      entering={FadeInUp.delay(900).duration(500)}
      style={styles.testimonialCard}
    >
      <View style={styles.testimonialHeader}>
        <View style={styles.starsContainer}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Ionicons key={i} name="star" size={16} color="#FFD700" />
          ))}
        </View>
        <Text style={styles.verifiedText}>Verified User</Text>
      </View>
      <Text style={styles.testimonialQuote}>
        "I was losing money on parlays until I found Bet.AI. Now I actually understand which bets have real value. Already up 3x my subscription cost!"
      </Text>
      <Text style={styles.testimonialAuthor}>— Jake M., Sports Bettor</Text>
    </Animated.View>
  );
}

// Shimmer CTA Button with glow
function ShimmerCTAButton({
  onPress,
  loading,
  disabled,
  planName,
  price,
}: {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  planName: string;
  price: string;
}) {
  const shimmerPosition = useSharedValue(-1);
  const glowPulse = useSharedValue(1);

  useEffect(() => {
    // Shimmer sweep animation
    shimmerPosition.value = withRepeat(
      withSequence(
        withDelay(2000, withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })),
        withTiming(-1, { duration: 0 })
      ),
      -1,
      false
    );

    // Subtle glow pulse
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmerPosition.value, [-1, 1], [-200, 400]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowPulse.value }],
    shadowOpacity: interpolate(glowPulse.value, [1, 1.05], [0.3, 0.5]),
  }));

  return (
    <Animated.View style={[styles.shimmerButtonWrapper, glowStyle]}>
      <TouchableOpacity
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        disabled={disabled || loading}
        activeOpacity={0.9}
        style={[styles.shimmerButton, disabled && styles.shimmerButtonDisabled]}
      >
        <LinearGradient
          colors={[colors.primary, '#00B8B8', colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Shimmer overlay */}
        <Animated.View style={[styles.shimmerOverlay, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255, 255, 255, 0.3)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>

        {loading ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <View style={styles.shimmerButtonContent}>
            <View style={styles.shimmerButtonLeft}>
              <Text style={styles.shimmerButtonTitle}>Continue</Text>
              <Text style={styles.shimmerButtonSubtitle}>{price}/{planName === 'Annual' ? 'year' : 'week'}</Text>
            </View>
            <View style={styles.shimmerButtonArrow}>
              <Ionicons name="arrow-forward" size={20} color={colors.primaryForeground} />
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function PaywallScreen() {
  const { purchasePackage, purchaseLoading, currentOffering } =
    useRevenueCatPurchases();
  const { getAnonymousUser } = useRevenueCatUser();
  const { handleRestorePurchase } = usePaywallActions();
  const [selectedPlan, setSelectedPlan] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);
  const { trackFunnelStep } = useOnboardingAnalytics();
  const hasTrackedView = useRef(false);

  useEffect(() => {
    setupPaywall();
  }, []);

  useEffect(() => {
    if (!hasTrackedView.current) {
      trackFunnelStep('paywall_viewed');
      hasTrackedView.current = true;
    }
  }, []);

  useEffect(() => {
    if (currentOffering?.availablePackages) {
      setPackages(currentOffering.availablePackages);
      if (currentOffering.availablePackages.length > 0) {
        const annualPackage = currentOffering.availablePackages.find(
          (pkg: any) => pkg.packageType === "ANNUAL"
        );
        const selectedPackageId =
          annualPackage?.identifier ||
          currentOffering.availablePackages[0].identifier;
        setSelectedPlan(selectedPackageId);
      }
    }
  }, [currentOffering]);

  const setupPaywall = async () => {
    try {
      await getAnonymousUser();
      setIsLoading(false);
    } catch (error) {
      console.error("[RevenueCat] Failed to setup paywall:", error);
      setIsLoading(false);
    }
  };

  const handlePlanSelect = (planId: string, packageType: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(planId);
    trackFunnelStep('paywall_plan_selected', {
      plan: packageType === 'ANNUAL' ? 'annual' : 'weekly',
    });
  };

  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const selectedPackage = packages.find(
        (pkg) => pkg.identifier === selectedPlan
      );

      if (!selectedPackage) {
        throw new Error("Selected package not found");
      }

      trackFunnelStep('paywall_purchase_attempted', {
        plan: selectedPackage.packageType === 'ANNUAL' ? 'annual' : 'weekly',
      });

      const result = await purchasePackage(selectedPlan);

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        trackFunnelStep('paywall_purchase_success', {
          plan: selectedPackage.packageType === 'ANNUAL' ? 'annual' : 'weekly',
        });
        router.push("/login");
      } else {
        trackFunnelStep('paywall_purchase_failed', {
          plan: selectedPackage.packageType === 'ANNUAL' ? 'annual' : 'weekly',
          error: 'cancelled_or_failed',
        });

        if (Platform.OS === "ios") {
          router.push({
            pathname: "/paywall-trial",
            params: { package: JSON.stringify(selectedPackage) },
          });
        } else {
          Alert.alert("Payment Failed", "Please try again or choose a different payment method.");
        }
      }
    } catch (error: any) {
      console.error("[RevenueCat] Purchase error:", error);
      trackFunnelStep('paywall_purchase_failed', {
        error: error?.message || 'unknown_error',
      });

      if (Platform.OS === "ios") {
        const selectedPackage = packages.find(
          (pkg) => pkg.identifier === selectedPlan
        );
        if (selectedPackage) {
          router.push({
            pathname: "/paywall-trial",
            params: { package: JSON.stringify(selectedPackage) },
          });
          return;
        }
      }

      Alert.alert("Error", "Something went wrong. Please try again.");
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/tutorial");
  };

  // Get selected package for CTA
  const selectedPackage = packages.find((pkg) => pkg.identifier === selectedPlan);
  const ctaPrice = selectedPackage?.product.priceString || '';
  const selectedPlanName = selectedPackage?.packageType === 'ANNUAL' ? 'Annual' : 'Weekly';

  if (isLoading) {
    return (
      <ScreenBackground hideBg>
        <View style={styles.loadingContainer}>
          <LogoSpinner size={96} />
        </View>
      </ScreenBackground>
    );
  }

  // Get package info
  const annualPackage = packages.find((pkg) => pkg.packageType === "ANNUAL");
  const weeklyPackage = packages.find((pkg) => pkg.packageType === "WEEKLY");

  return (
    <ScreenBackground hideBg>
      {/* Animated background orb */}
      <AnimatedOrb />

      {/* Close button */}
      <Animated.View
        entering={FadeIn.delay(200).duration(300)}
        style={styles.closeButton}
      >
        <Pressable onPress={handleClose} hitSlop={20}>
          <Ionicons name="close" size={28} color={colors.mutedForeground} />
        </Pressable>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header with Logo + Hero */}
        <View style={styles.header}>
          <Animated.View entering={FadeInDown.delay(50).duration(400)}>
            <Logo size="medium" />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(100).duration(400)}
            style={styles.heroTextContainer}
          >
            <Text style={styles.heroTitle}>Unlock Your</Text>
            <Text style={styles.heroTitleAccent}>Betting Edge</Text>
          </Animated.View>

          <Animated.Text
            entering={FadeInDown.delay(150).duration(400)}
            style={styles.heroSubtitle}
          >
            Join smart bettors using AI to find winning opportunities
          </Animated.Text>
        </View>

        {/* Social Proof Stats */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(400)}
          style={styles.statsCard}
        >
          <View style={styles.statItem}>
            <Text style={styles.statValue}>30K+</Text>
            <Text style={styles.statLabel}>Active Users</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>4.8</Text>
            <Text style={styles.statLabel}>App Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>1M+</Text>
            <Text style={styles.statLabel}>Bets Analyzed</Text>
          </View>
        </Animated.View>

        {/* Section Header */}
        <Animated.Text
          entering={FadeInDown.delay(250).duration(400)}
          style={styles.sectionHeader}
        >
          Everything You Get
        </Animated.Text>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          {premiumFeatures.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              desc={feature.desc}
              delay={300 + index * 70}
            />
          ))}
        </View>

        {/* Choose Your Plan Header */}
        <Animated.Text
          entering={FadeInDown.delay(550).duration(400)}
          style={styles.sectionHeader}
        >
          Choose Your Plan
        </Animated.Text>

        {/* Pricing Cards */}
        <View style={styles.pricingContainer}>
          {annualPackage && (
            <PricingCard
              isSelected={selectedPlan === annualPackage.identifier}
              onSelect={() => handlePlanSelect(annualPackage.identifier, "ANNUAL")}
              title="Annual"
              price={annualPackage.product.priceString}
              interval="/year"
              badge="BEST VALUE"
              discount="60% OFF"
              delay={550}
            />
          )}

          {weeklyPackage && (
            <PricingCard
              isSelected={selectedPlan === weeklyPackage.identifier}
              onSelect={() => handlePlanSelect(weeklyPackage.identifier, "WEEKLY")}
              title="Weekly"
              price={weeklyPackage.product.priceString}
              interval="/week"
              delay={600}
            />
          )}
        </View>

        {/* Trust Indicators */}
        <View style={styles.trustSection}>
          <TrustIndicator
            icon="shield-checkmark-outline"
            text="Cancel anytime"
            delay={700}
          />
          <TrustIndicator
            icon="lock-closed-outline"
            text="Secure & encrypted payment"
            delay={750}
          />
          <TrustIndicator
            icon="eye-off-outline"
            text="100% private & discreet"
            delay={800}
          />
        </View>

        {/* Testimonial */}
        <TestimonialCard />

        {/* Spacer for fixed footer */}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Fixed Bottom Footer */}
      <Animated.View
        entering={FadeInUp.delay(800).duration(500)}
        style={styles.fixedFooter}
      >
        <LinearGradient
          colors={['transparent', colors.background, colors.background]}
          style={styles.footerGradient}
        />

        <View style={styles.footerContent}>
          {/* CTA Button with shimmer */}
          <ShimmerCTAButton
            onPress={handlePurchase}
            loading={purchaseLoading}
            disabled={packages.length === 0}
            planName={selectedPlanName}
            price={ctaPrice}
          />

          {/* Footer links */}
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={handleRestorePurchase}>
              <Text style={styles.restoreText}>Restore Purchases</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>•</Text>
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL("https://betaiapp.com/terms")}
            >
              Terms
            </Text>
            <Text style={styles.footerDot}>•</Text>
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL("https://betaiapp.com/privacy")}
            >
              Privacy
            </Text>
          </View>
        </View>
      </Animated.View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing[12],
    paddingBottom: spacing[10],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Background orb
  orbContainer: {
    position: "absolute",
    top: SCREEN_HEIGHT * 0.12,
    left: SCREEN_WIDTH / 2 - 175,
    width: 350,
    height: 350,
    zIndex: 0,
  },
  orb: {
    width: "100%",
    height: "100%",
    borderRadius: 175,
  },

  // Close button
  closeButton: {
    position: "absolute",
    top: spacing[12],
    right: spacing[4],
    zIndex: 100,
    padding: spacing[2],
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: spacing[4],
  },
  heroTextContainer: {
    marginTop: spacing[4],
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 34,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    textAlign: "center",
    lineHeight: 40,
  },
  heroTitleAccent: {
    fontSize: 34,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
    textAlign: "center",
    lineHeight: 40,
  },
  heroSubtitle: {
    marginTop: spacing[2],
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing[6],
  },

  // Stats card
  statsCard: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginHorizontal: spacing[4],
    marginBottom: spacing[5],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: typography.sizes["2xl"],
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },

  // Features section
  featuresSection: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    marginBottom: spacing[6],
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing[3],
  },
  featureIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.rgba.primary15,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.semibold,
    color: colors.foreground,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },

  // Section header
  sectionHeader: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    paddingHorizontal: spacing[4],
    marginBottom: spacing[4],
  },

  // Pricing cards
  pricingContainer: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
    marginBottom: spacing[5],
  },
  pricingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    position: "relative",
    overflow: "visible",
  },
  pricingCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.rgba.primary10,
  },
  pricingCardPressed: {
    opacity: 0.9,
  },
  badgeContainer: {
    position: "absolute",
    top: -12,
    left: spacing[4],
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.primaryForeground,
    letterSpacing: 0.5,
  },
  discountBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 2,
  },
  discountText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
  },
  planTitle: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.semibold,
    color: colors.foreground,
  },
  planTitleSelected: {
    color: colors.primary,
  },
  perDayText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  cardRight: {
    alignItems: "flex-end",
  },
  originalPrice: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    textDecorationLine: "line-through",
  },
  priceText: {
    fontSize: typography.sizes["2xl"],
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  priceTextSelected: {
    color: colors.primary,
  },
  intervalText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },

  // Trust section
  trustSection: {
    paddingHorizontal: spacing[4],
    gap: spacing[2],
    marginBottom: spacing[5],
  },
  trustIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  trustIndicatorText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },

  // Testimonial
  testimonialCard: {
    marginHorizontal: spacing[4],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[5],
    borderWidth: 1,
    borderColor: colors.border,
  },
  testimonialHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[3],
  },
  starsContainer: {
    flexDirection: "row",
    gap: 2,
  },
  verifiedText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.success,
  },
  testimonialQuote: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.foreground,
    lineHeight: 22,
    marginBottom: spacing[2],
  },
  testimonialAuthor: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },

  // Fixed Footer
  fixedFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  footerGradient: {
    position: "absolute",
    top: -40,
    left: 0,
    right: 0,
    height: 60,
  },
  footerContent: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[12],
    alignItems: "center",
    gap: spacing[4],
  },
  footerLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginTop: spacing[1],
  },
  footerDot: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
  },
  restoreText: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  termsLink: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },

  // Shimmer CTA Button
  shimmerButtonWrapper: {
    width: "95%",
    alignSelf: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  shimmerButton: {
    width: "100%",
    height: 68,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  shimmerButtonDisabled: {
    opacity: 0.5,
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 200,
  },
  shimmerGradient: {
    flex: 1,
    width: "100%",
  },
  shimmerButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: spacing[5],
  },
  shimmerButtonLeft: {
    flex: 1,
  },
  shimmerButtonTitle: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.primaryForeground,
  },
  shimmerButtonSubtitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.primaryForeground,
    opacity: 0.85,
    marginTop: 2,
  },
  shimmerButtonArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});
