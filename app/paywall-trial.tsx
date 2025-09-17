import React from "react";
import {
  Text,
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientButton } from "../components/ui/GradientButton";
import LottieView from "lottie-react-native";
import { usePaywallActions } from "./hooks/usePaywallActions";
import { Image } from "expo-image";
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
    try {
      setIsLoading(true);
      const result = await handlePromotionalOffer(selectedPackage);

      if (result.success) {
        router.push("/login");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  return (
    <ScreenBackground
      hideBg={false}
      imageStyle={{
        width: "100%",
        height: "100%",
        resizeMode: "cover",
        marginTop: 40,
      }}
      backgroundImage={require("../assets/images/giftbg.png")}
    >
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Image
            source={require("../assets/images/close.png")}
            style={styles.backIcon}
            contentFit="contain"
          />
        </TouchableOpacity>

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
              <ActivityIndicator color="#FFFFFF" />
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
                Linking.openURL("https://betaiapp.com/privacy.html")
              }
            >
              <Text style={styles.linkText}>
                {i18n.t("paywallTrialPrivacyPolicy")}
              </Text>
            </TouchableOpacity>
            <Text style={styles.linkDivider}>|</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL("https://betaiapp.com/terms.html")}
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
  backIcon: {
    width: 40,
    height: 40,
  },
  container: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 15,
    paddingTop: 0,
  },
  closeButton: {
    width: "100%",
    height: 40,
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  tagContainer: {
    backgroundColor: "#070707",

    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 30,
    marginBottom: 38,
    borderWidth: 0.5,
    borderColor: "#7C7C7C",
  },
  tag: {
    color: "#FFFFFF",
    fontSize: 19,
    fontFamily: "Aeonik-Bold",
  },
  title: {
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    fontFamily: "Aeonik-Bold",
    marginBottom: 28,
  },
  subtitle: {
    fontSize: 34,
    color: "#FFFFFF",
    textAlign: "center",
    fontFamily: "Aeonik-Bold",
  },
  giftContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  lottie: {
    width: 200,
    height: 200,
  },
  footer: {
    alignItems: "center",
    marginTop: 0,
  },
  noChargeText: {
    fontSize: 20,
    color: "#FFFFFF",
    fontFamily: "Aeonik-Bold",
    marginBottom: 14,
  },
  priceText: {
    fontSize: 17,
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: "Aeonik-RegularItalic",
    marginBottom: 32,
  },
  priceHighlight: {
    color: "#00C2E0",
    fontFamily: "Aeonik-RegularItalic",
  },
  continueButton: {
    width: "100%",
    marginBottom: 26,
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  linkText: {
    color: "#ffffff",
    opacity: 0.5,
    fontSize: 10,
    padding: 8,
    fontFamily: "Aeonik-Light",
  },
  linkDivider: {
    color: "rgba(255, 255, 255, 0.3)",
    marginHorizontal: 4,
  },
});
