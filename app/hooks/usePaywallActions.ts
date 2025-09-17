import { Alert } from "react-native";
import { router } from "expo-router";
import { auth } from "../../firebaseConfig";
import { signOut } from "firebase/auth";
import { useRevenueCat } from "../providers/RevenueCatProvider";
import Purchases from "react-native-purchases";
import i18n from "../../i18n";

export const usePaywallActions = () => {
  const { restorePurchases } = useRevenueCat();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      Alert.alert(i18n.t("common.error"), i18n.t("paywallErrorDesc"));
    }
  };

  const handleRestorePurchase = async () => {
    try {
      console.log("[RevenueCat] Attempting to restore purchases...");
      const customerInfo = await restorePurchases();
      console.log("[RevenueCat] Purchases restored successfully", customerInfo);

      // Check if user is already logged in
      const isUserLoggedIn = auth.currentUser !== null;
      const currentUserEmail = auth.currentUser?.email;
      const subscriptionEmail = customerInfo?.originalAppUserId;

      // If subscription found but emails don't match
      if (
        subscriptionEmail &&
        currentUserEmail &&
        subscriptionEmail !== currentUserEmail
      ) {
        Alert.alert(
          i18n.t("settingsReauthentication"),
          i18n.t("settingsActiveSubscription"),
          [
            {
              text: i18n.t("settingsLogoutNow"),
              onPress: async () => {
                handleLogout();
                router.push("/login");
              },
              style: "default",
            },
            {
              text: i18n.t("common.cancel"),
              style: "cancel",
            },
          ]
        );
        return;
      }

      // Normal restore flow
      Alert.alert(i18n.t("common.success"), i18n.t("settingsManageSubscriptions"));

      if (isUserLoggedIn) {
        router.back();
      } else {
        router.push("/login");
      }
    } catch (error) {
      console.error("[RevenueCat] Restore error:", error);
      Alert.alert(i18n.t("common.error"), i18n.t("paywallErrorDesc"));
    }
  };

  const handlePromotionalOffer = async (selectedPackage: any) => {
    try {
      console.log("[RevenueCat] Getting promotional offer for package:", selectedPackage);
      const offers = await Purchases.getPromotionalOffer(
        selectedPackage?.product,
        selectedPackage?.product.discounts[0]
      );
      
      if (!offers) {
        console.log("[RevenueCat] No promotional offer found");
        return { success: false };
      }

      console.log("[RevenueCat] Promotional offer found:", offers);
      const purchaseResult = await Purchases.purchaseDiscountedPackage(
        selectedPackage,
        offers
      );
      
      if (purchaseResult) {
        console.log("[RevenueCat] Promotional offer purchase successful");
        return { success: true };
      }
      
      return { success: false };
    } catch (error) {
      console.error("[RevenueCat] Promotional offer purchase error:", error);
      return { success: false, error };
    }
  };

  return {
    handleLogout,
    handleRestorePurchase,
    handlePromotionalOffer,
  };
}; 