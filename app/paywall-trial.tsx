import React from "react";
import {
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientButton } from "../components/ui/GradientButton";
import { IconButton } from "../components/ui/IconButton";
import LottieView from "lottie-react-native";
import { usePaywallActions } from "./hooks/usePaywallActions";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import i18n from "../i18n";

export default function PaywallTrialScreen() {
  const params = useLocalSearchParams();
  const selectedPackage = params.package
    ? JSON.parse(params.package as string)
    : null;
  const [isLoading, setIsLoading] = React.useState(false);
  const { handlePromotionalOffer, handleRestorePurchase } = usePaywallActions();

  const getPriceText = () => {
    if (!selectedPackage) return "";

    console.log(selectedPackage);
    const isAnnual = selectedPackage.packageType === "ANNUAL";
    const interval = isAnnual
      ? i18n.t("paywallTrialPerMonth")
      : i18n.t("paywallTrialPerWeek");
    const price = isAnnual
      ? selectedPackage.product.pricePerMonthString
      : selectedPackage.product.priceString;

    return (
      <>
        {i18n.t("paywallTrialThenOnly")}{" "}
        <Text style={styles.priceHighlight}>{price}</Text> {interval}.
      </>
    );
  };

  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setIsLoading(true);
      const result = await handlePromotionalOffer(selectedPackage);

      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push("/login");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <ScreenBackground hideBg>
      <View style={styles.container}>
        <View style={styles.closeButtonContainer}>
          <IconButton icon="close" onPress={handleClose} size={28} />
        </View>

        <View style={styles.header}>
          <View style={styles.tagContainer}>
            <Text style={styles.tag}>
              {i18n.t("paywallTrialExclusiveOffer")}
            </Text>
          </View>

          <Text style={styles.title}>{i18n.t("paywallTrialTryBetAI")}</Text>
          <Text style={styles.subtitle}>
            {i18n.t("paywallTrialStartFreeTrial")}
          </Text>
        </View>

        <View style={styles.giftContainer}>
          <LottieView
            source={require("../assets/lottie/giftbox.json")}
            autoPlay
            loop={true}
            style={{ width: 240, height: 240 }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.noChargeText}>
            {i18n.t("paywallTrialNoChargesToday")}
          </Text>
          <Text style={styles.priceText}>
            <Text>{getPriceText()}</Text>
          </Text>

          <GradientButton
            containerStyle={styles.continueButton}
            onPress={handlePurchase}
            height={60}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              i18n.t("paywallTrialContinue")
            )}
          </GradientButton>

          <View style={styles.links}>
            <TouchableOpacity onPress={handleRestorePurchase}>
              <Text style={styles.linkText}>
                {i18n.t("paywallTrialRestorePurchase")}
              </Text>
            </TouchableOpacity>
            <Text style={styles.linkDivider}>|</Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL("https://betaiapp.com/privacy")
              }
            >
              <Text style={styles.linkText}>
                {i18n.t("paywallTrialPrivacyPolicy")}
              </Text>
            </TouchableOpacity>
            <Text style={styles.linkDivider}>|</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL("https://betaiapp.com/terms")}
            >
              <Text style={styles.linkText}>
                {i18n.t("paywallTrialTermsOfService")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[4],
    paddingTop: 0,
  },
  closeButtonContainer: {
    width: "100%",
    alignItems: "flex-end",
    paddingTop: spacing[2],
  },
  header: {
    alignItems: "center",
    marginBottom: spacing[5],
  },
  tagContainer: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.full,
    marginBottom: spacing[8],
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tag: {
    color: colors.primary,
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
  },
  title: {
    fontSize: typography.sizes.lg,
    color: colors.mutedForeground,
    textAlign: "center",
    fontFamily: typography.fontFamily.medium,
    marginBottom: spacing[6],
  },
  subtitle: {
    fontSize: typography.sizes["4xl"],
    color: colors.foreground,
    textAlign: "center",
    fontFamily: typography.fontFamily.bold,
  },
  giftContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    alignItems: "center",
    marginTop: 0,
  },
  noChargeText: {
    fontSize: typography.sizes.xl,
    color: colors.foreground,
    fontFamily: typography.fontFamily.bold,
    marginBottom: spacing[3],
  },
  priceText: {
    fontSize: typography.sizes.base,
    color: colors.mutedForeground,
    fontFamily: typography.fontFamily.light,
    marginBottom: spacing[8],
  },
  priceHighlight: {
    color: colors.primary,
    fontFamily: typography.fontFamily.medium,
  },
  continueButton: {
    width: "100%",
    marginBottom: spacing[6],
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[4],
  },
  linkText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    padding: spacing[2],
    fontFamily: typography.fontFamily.light,
  },
  linkDivider: {
    color: colors.muted,
    marginHorizontal: 4,
  },
});
