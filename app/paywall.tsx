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
import { GradientText } from "../components/ui/GradientText";
import { Logo } from "../components/ui/Logo";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { useRevenueCatUser } from "./hooks/useRevenueCatUser";
import { useRevenueCat } from "./providers/RevenueCatProvider";
import { auth } from "../firebaseConfig";
import { signOut } from "firebase/auth";
import { MultilineText } from "@/components/ui/MultilineText";
import { LinearGradient } from "expo-linear-gradient";
import Purchases, { CustomerInfo } from "react-native-purchases";
import { usePaywallActions } from "./hooks/usePaywallActions";
import i18n from "../i18n";

// Type for RevenueCat restore response
interface RestorePurchasesResponse {
  originalAppUserId?: string;
  // Add other fields as needed
}

// Dummy data for features
const features = [
  {
    title: i18n.t("paywallFeatureAIAnalysis"),
    description: i18n.t("paywallFeatureAIAnalysisDesc"),
  },
  {
    title: i18n.t("paywallFeatureXFactors"),
    description: i18n.t("paywallFeatureXFactorsDesc"),
  },
  {
    title: i18n.t("paywallFeatureDebate"),
    description: i18n.t("paywallFeatureDebateDesc"),
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
          <ActivityIndicator size="large" color="#00C2E0" />
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
              <Text style={[styles.tagline, { color: "#ffffff" }]}>
                {i18n.t("paywallBackedByAI")}
              </Text>
            </View>
          </View>

          <View style={styles.features}>
            {features.map((feature, index) => (
              <LinearGradient
                colors={["#131313", "#1A1A1A"]}
                style={styles.featureItemGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                key={index}
              >
                <View style={styles.featureItem}>
                  <Text style={styles.checkmarkText}>✓</Text>

                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{feature.title}</Text>
                    <Text style={styles.featureDescription}>
                      {feature.description}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            ))}
          </View>

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
              <ActivityIndicator color="#FFFFFF" />
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
                Linking.openURL("https://betaiapp.com/privacy.html")
              }
            >
              <Text style={styles.footerLink}>
                {i18n.t("paywallPrivacyPolicy")}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>|</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL("https://betaiapp.com/terms.html")}
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
    marginTop: 30,
    gap: 0,
  },
  container: {
    flex: 1,
    padding: 15,
    paddingTop: 10,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  tagline: {
    fontSize: 30,
    textAlign: "center",
    fontFamily: "Aeonik-Medium",
    color: "#FFFFFF",
  },
  subTagline: {
    fontSize: 32,
    color: "#8E8E93",
    textAlign: "center",
    fontWeight: "600",
  },
  features: {
    marginTop: 25,
    marginBottom: 5,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  featureItemGradient: {
    borderRadius: 15,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    paddingHorizontal: 25,
    marginBottom: 15,
  },
  checkmark: {
    width: 30,
    height: 30,
    borderRadius: 12,
    // backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
    marginTop: 2,
  },
  checkmarkText: {
    color: "#00C2E0",
    fontSize: 24,
    fontWeight: "bold",
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    marginBottom: 4,
    fontFamily: "Aeonik-Regular",
  },
  featureDescription: {
    color: "#FFFFFF",
    opacity: 0.9,
    lineHeight: 18,
    fontSize: 14,
    fontFamily: "Aeonik-Light",
  },
  pricingContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 25,
    gap: 10,
    marginBottom: 0,
  },
  planButton: {
    flex: 1,
    backgroundColor: "rgba(30, 30, 30, 0.6)",
    borderRadius: 18,
    padding: 20,
    paddingLeft: 30,
    paddingVertical: 20,
    marginHorizontal: 0,
    borderWidth: 0.5,
    borderColor: "#5B6169",
  },
  selectedPlan: {
    backgroundColor: "#FFFFFF",
  },
  planTitle: {
    color: "#ffffff",
    fontSize: 14,
    marginBottom: 4,
    marginTop: 0,
    letterSpacing: 1.5,
    fontFamily: "Aeonik-Black",
  },
  selectedPlanTitle: {
    color: "#000000",
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  price: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  selectedPlanPrice: {
    color: "#000000",
  },
  interval: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
    marginLeft: 2,
  },
  selectedPlanInterval: {
    color: "#000000",
    fontFamily: "Aeonik-Regular",
    fontSize: 14,
  },
  popularBadge: {
    position: "absolute",
    top: -12,
    left: 0,
    right: 0,
    marginHorizontal: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#01B4DE",
    borderRadius: 15,
  },
  popularText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Aeonik-Light",
  },
  continueButton: {
    width: "100%",
    marginBottom: 0,
    marginTop: 15,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
  },
  footerLink: {
    color: "#ffffff",
    opacity: 0.5,
    fontSize: 10,
    padding: 8,
    fontFamily: "Aeonik-Light",
  },
  footerDivider: {
    color: "#8E8E93",
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
    padding: 20,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 16,
    textAlign: "center",
  },
  logoutContainer: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
  },
  logoutText: {
    color: "#ffffff",
    fontSize: 16,
    fontFamily: "Aeonik-Regular",
  },
});
