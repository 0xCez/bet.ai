import React, { useEffect, useState } from "react";
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
} from "react-native";
import { router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientButton } from "../components/ui/GradientButton";
import { Logo } from "../components/ui/Logo";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { useRevenueCatUser } from "./hooks/useRevenueCatUser";
import { auth } from "../firebaseConfig";
import Purchases from "react-native-purchases";
import { usePaywallActions } from "./hooks/usePaywallActions";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import { LogoSpinner } from "../components/ui/LogoSpinner";
import { FeatureCardCarousel } from "../components/ui/FeatureCardCarousel";
import i18n from "../i18n";

// Feature list for paywall - 6 cards in 2 pages
const features = [
  // Page 1
  {
    title: i18n.t("paywallFeatureAIAnalysis"),
    description: i18n.t("paywallFeatureAIAnalysisDesc"),
    icon: "ai-analysis" as const,
  },
  {
    title: i18n.t("paywallFeatureMarketIntel"),
    description: i18n.t("paywallFeatureMarketIntelDesc"),
    icon: "market-intel" as const,
  },
  {
    title: i18n.t("paywallFeatureXFactors"),
    description: i18n.t("paywallFeatureXFactorsDesc"),
    icon: "x-factors" as const,
  },
  // Page 2
  {
    title: i18n.t("paywallFeatureTeamStats"),
    description: i18n.t("paywallFeatureTeamStatsDesc"),
    icon: "team-stats" as const,
  },
  {
    title: i18n.t("paywallFeaturePlayerStats"),
    description: i18n.t("paywallFeaturePlayerStatsDesc"),
    icon: "player-stats" as const,
  },
  {
    title: i18n.t("paywallFeatureExpertChat"),
    description: i18n.t("paywallFeatureExpertChatDesc"),
    icon: "expert-chat" as const,
  },
];

export default function PaywallScreen() {
  const { purchasePackage, purchaseLoading, currentOffering } =
    useRevenueCatPurchases();
  const { getAnonymousUser } = useRevenueCatUser();
  const { handleRestorePurchase } = usePaywallActions();
  const [selectedPlan, setSelectedPlan] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    setupPaywall();
  }, []);

  useEffect(() => {
    console.log("[RevenueCat] Current Offering:", currentOffering);
    if (currentOffering?.availablePackages) {
      console.log(
        "[RevenueCat] Available Packages:",
        currentOffering.availablePackages
      );
      setPackages(currentOffering.availablePackages);
      if (currentOffering.availablePackages.length > 0) {
        // Select the annual package by default if available, otherwise select the first package
        const annualPackage = currentOffering.availablePackages.find(
          (pkg: any) => pkg.packageType === "ANNUAL"
        );
        const selectedPackageId =
          annualPackage?.identifier ||
          currentOffering.availablePackages[0].identifier;
        console.log("[RevenueCat] Selected Package ID:", selectedPackageId);
        setSelectedPlan(selectedPackageId);
      }
    } else {
      console.log(
        "[RevenueCat] No available packages found in current offering"
      );
    }
  }, [currentOffering]);

  const setupPaywall = async () => {
    try {
      console.log("[RevenueCat] Setting up paywall...");
      const user = await getAnonymousUser();
      console.log("[RevenueCat] Anonymous user created:", user);
      setIsLoading(false);
    } catch (error) {
      console.error("[RevenueCat] Failed to setup paywall:", error);
      setIsLoading(false);
    }
  };

  const handlePromotionalOffer = async (selectedPackage: any) => {
    try {
      console.log(
        "[RevenueCat] Getting promotional offer for package:",
        selectedPackage
      );
      const offers = await Purchases.getPromotionalOffer(
        selectedPackage?.product,
        selectedPackage?.product.discounts[0]
      );

      if (!offers) {
        console.log("[RevenueCat] No promotional offer found");
        return null;
      }

      console.log("[RevenueCat] Promotional offer found:", offers);
      return offers;
    } catch (error) {
      console.error("[RevenueCat] Error getting promotional offer:", error);
      return null;
    }
  };

  const showFreeTrialPrompt = async (selectedPackage: any) => {
    return new Promise((resolve) => {
      Alert.alert(i18n.t("paywallTryFree"), i18n.t("paywallFreeTrial"), [
        {
          text: i18n.t("paywallNotNow"),
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: i18n.t("paywallStartFreeTrial"),
          onPress: () => resolve(true),
        },
      ]);
    });
  };

  const handlePurchase = async () => {
    try {
      console.log("[RevenueCat] Starting purchase for plan:", selectedPlan);
      const selectedPackage = packages.find(
        (pkg) => pkg.identifier === selectedPlan
      );

      if (!selectedPackage) {
        throw new Error("Selected package not found");
      }

      const result = await purchasePackage(selectedPlan);

      if (result.success) {
        console.log("[RevenueCat] Purchase successful, navigating to login");
        router.push("/login");
      } else {
        // Handle purchase failure based on platform
        if (Platform.OS === "ios") {
          // For iOS, redirect to trial screen
          console.log(
            "[RevenueCat] Purchase failed/cancelled on iOS, redirecting to trial screen"
          );
          router.push({
            pathname: "/paywall-trial",
            params: { package: JSON.stringify(selectedPackage) },
          });
        } else {
          // For Android, just show error message
          console.log(
            "[RevenueCat] Purchase failed/cancelled on Android, showing error"
          );
          Alert.alert(
            i18n.t("paywallPaymentFailed"),
            i18n.t("paywallPaymentFailedDesc")
          );
        }
      }
    } catch (error) {
      console.error("[RevenueCat] Purchase error:", error);

      // Platform specific error handling
      if (Platform.OS === "ios") {
        // Show trial screen on error for iOS
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

      // Generic error for both platforms
      Alert.alert(i18n.t("paywallError"), i18n.t("paywallErrorDesc"));
    }
  };

  if (isLoading) {
    return (
      <ScreenBackground hideBg>
        <View style={styles.loadingContainer}>
          <LogoSpinner size={96} />
        </View>
      </ScreenBackground>
    );
  }

  const isUserLoggedIn = auth.currentUser !== null;

  return (
    <ScreenBackground hideBg>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Logo size="medium" />

            <View style={styles.taglineContainer}>
              <Text style={styles.tagline}>{i18n.t("paywallYourBest")}</Text>
              <Text style={[styles.tagline, styles.taglineHighlight]}>
                {i18n.t("paywallBackedByAI")}
              </Text>
            </View>
          </View>

          <FeatureCardCarousel features={features} />

          <View style={styles.pricingContainer}>
            {packages.map((pkg: any) => (
              <Pressable
                key={pkg.identifier}
                style={[
                  styles.planButton,
                  selectedPlan === pkg.identifier && styles.selectedPlan,
                ]}
                onPress={() => setSelectedPlan(pkg.identifier)}
              >
                <Text
                  style={[
                    styles.planTitle,
                    selectedPlan === pkg.identifier && styles.selectedPlanTitle,
                  ]}
                >
                  {pkg.packageType === "ANNUAL"
                    ? i18n.t("paywallYearly")
                    : i18n.t("paywallWeekly")}
                </Text>
                <View style={styles.priceContainer}>
                  <Text
                    style={[
                      styles.price,
                      selectedPlan === pkg.identifier &&
                        styles.selectedPlanPrice,
                    ]}
                  >
                    {pkg.packageType === "ANNUAL"
                      ? pkg.product.priceString
                      : pkg.product.priceString}
                  </Text>
                  <Text
                    style={[
                      styles.interval,
                      selectedPlan === pkg.identifier &&
                        styles.selectedPlanInterval,
                    ]}
                  >
                    {pkg.packageType === "ANNUAL"
                      ? i18n.t("paywallMonth")
                      : i18n.t("paywallWeek")}
                  </Text>
                </View>
                {pkg.packageType === "ANNUAL" && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>
                      {i18n.t("paywallMostPopular")}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <GradientButton
            containerStyle={styles.continueButton}
            onPress={handlePurchase}
            height={60}
            textStyle={{ fontSize: 18 }}
            disabled={purchaseLoading || packages.length === 0}
          >
            {purchaseLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              i18n.t("paywallContinue")
            )}
          </GradientButton>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleRestorePurchase}>
              <Text style={styles.footerLink}>
                {i18n.t("paywallRestorePurchase")}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>|</Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL("https://betaiapp.com/privacy")
              }
            >
              <Text style={styles.footerLink}>
                {i18n.t("paywallPrivacyPolicy")}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>|</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL("https://betaiapp.com/terms")}
            >
              <Text style={styles.footerLink}>
                {i18n.t("paywallTermsOfService")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* {isUserLoggedIn ? (
          <TouchableOpacity
            onPress={handleLogout}
            style={styles.logoutContainer}
          >
            <Text style={styles.logoutText}>{i18n.t('paywallLogout')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => router.push("/login")}
            style={styles.logoutContainer}
          >
            <Text style={styles.logoutText}>{i18n.t('paywallLogin')}</Text>
          </TouchableOpacity>
        )} */}
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  taglineContainer: {
    marginTop: spacing[8],
    gap: 0,
  },
  container: {
    flex: 1,
    padding: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[10],
  },
  header: {
    alignItems: "center",
    marginBottom: spacing[5],
  },
  tagline: {
    fontSize: typography.sizes["3xl"],
    textAlign: "center",
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
  },
  taglineHighlight: {
    color: colors.foreground,
  },
  pricingContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing[6],
    gap: spacing[3],
    marginBottom: 0,
  },
  planButton: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    paddingVertical: spacing[5],
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedPlan: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
  },
  planTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.xs,
    marginBottom: 4,
    marginTop: 0,
    letterSpacing: 1.5,
    fontFamily: typography.fontFamily.bold,
    textTransform: "uppercase",
  },
  selectedPlanTitle: {
    color: colors.primary,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: spacing[2],
  },
  price: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
  },
  selectedPlanPrice: {
    color: colors.primary,
  },
  interval: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    marginLeft: 2,
  },
  selectedPlanInterval: {
    color: colors.primary,
  },
  popularBadge: {
    position: "absolute",
    top: -12,
    left: 0,
    right: 0,
    marginHorizontal: spacing[8],
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  popularText: {
    color: colors.primaryForeground,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
  },
  continueButton: {
    width: "100%",
    marginBottom: 0,
    marginTop: spacing[4],
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing[3],
  },
  footerLink: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    padding: spacing[2],
    fontFamily: typography.fontFamily.light,
  },
  footerDivider: {
    color: colors.muted,
    marginHorizontal: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[5],
  },
  errorText: {
    color: colors.destructive,
    fontSize: typography.sizes.base,
    textAlign: "center",
  },
  logoutContainer: {
    alignItems: "center",
    paddingVertical: spacing[4],
    marginTop: spacing[2],
  },
  logoutText: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
  },
});
