import React, { useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Alert,
  Share,
  Linking,
  Platform,
} from "react-native";
import ActionSheet, { ActionSheetRef } from "react-native-actions-sheet";
import { TouchableOpacity } from "react-native-gesture-handler";
import { Feather } from "@expo/vector-icons";
import { Logo } from "./Logo";
import { router } from "expo-router";
import { auth } from "../../firebaseConfig";
import { deleteUser, signOut } from "firebase/auth";
import { updateAppState } from "../../utils/appStorage";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { useRevenueCatPurchases } from "../../app/hooks/useRevenueCatPurchases";
import { useRevenueCat } from "../../app/providers/RevenueCatProvider";
import i18n from "../../i18n";

interface SettingsBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

export function SettingsBottomSheet({
  isVisible,
  onClose,
}: SettingsBottomSheetProps) {
  const actionSheetRef = useRef<ActionSheetRef>(null);
  const { checkSubscriptionStatus } = useRevenueCatPurchases();
  const { restorePurchases } = useRevenueCat();

  React.useEffect(() => {
    if (isVisible) {
      actionSheetRef.current?.show();
    } else {
      actionSheetRef.current?.hide();
    }
  }, [isVisible]);

  const handleContactPress = async () => {
    // await actionSheetRef.current?.hide();
    setTimeout(() => {
      // Add contact functionality send email to cesar@betaiapp.com
      const email = "cesar@betaiapp.com";
      const subject = "Betting AI App Support";
      const body = "I need help with the Betting AI App";
      const url = `mailto:${email}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
      Linking.openURL(url);
    }, 300);
  };

  const handleRestorePress = async () => {
    try {
      console.log("[RevenueCat] Attempting to restore purchases...");
      await restorePurchases();
      console.log("[RevenueCat] Purchases restored successfully");
      Alert.alert(
        i18n.t("common.success"),
        "Your purchases have been restored!"
      );
    } catch (error) {
      console.error("[RevenueCat] Restore error:", error);
      Alert.alert(
        i18n.t("common.error"),
        "Failed to restore purchases. Please try again."
      );
    }
  };

  const handleSharePress = async () => {
    // await actionSheetRef.current?.hide();
    setTimeout(() => {
      // Add share functionality
      Share.share({
        message: i18n.t("settingsShareText"),
        url: "https://betaiapp.com",
      });
    }, 300);
  };

  const handleLogout = async () => {
    try {
      // await actionSheetRef.current?.hide();
      // Reset app state
      Alert.alert("Logging out", i18n.t("settingsLogoutConfirm"), [
        { text: i18n.t("common.cancel"), style: "cancel" },
        {
          text: i18n.t("settingsLogoutAction"),
          style: "destructive",
          onPress: async () => {
            await updateAppState({
              onboardingComplete: false,
              signupComplete: false,
              signupAnswers: {},
              signupStep: 0,
            });
            // Sign out user
            await signOut(auth);
            router.replace("/login");
          },
        },
      ]);
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const handleDeleteAccount = async () => {
    // await actionSheetRef.current?.hide();

    // First check if user has an active subscription
    try {
      const hasActiveSubscription = await checkSubscriptionStatus();

      if (hasActiveSubscription) {
        // If user has active subscription, prompt them to cancel it first
        Alert.alert(
          "Active Subscription Found",
          i18n.t("settingsActiveSubscription"),
          [
            { text: i18n.t("common.cancel"), style: "cancel" },
            {
              text: i18n.t("settingsManageSubscriptions"),
              onPress: () => {
                // Open subscription management in App Store/Google Play
                if (Platform.OS === "ios") {
                  Linking.openURL(
                    "itms-apps://apps.apple.com/account/subscriptions"
                  );
                } else if (Platform.OS === "android") {
                  Linking.openURL(
                    "https://play.google.com/store/account/subscriptions"
                  );
                }
              },
            },
          ]
        );
        return;
      }

      // If no active subscription, proceed with account deletion flow
      Alert.alert(
        i18n.t("settingsDeleteAccount"),
        i18n.t("settingsDeleteConfirm"),
        [
          { text: i18n.t("common.cancel"), style: "cancel" },
          {
            text: i18n.t("settingsDeleteAction"),
            style: "destructive",
            onPress: async () => {
              try {
                if (!auth.currentUser) {
                  throw new Error("No authenticated user found");
                }
                await deleteUser(auth.currentUser);
                await signOut(auth);
                router.replace("/login");
              } catch (error: any) {
                if (error?.code === "auth/requires-recent-login") {
                  Alert.alert(
                    "Re-authentication Required",
                    i18n.t("settingsReauthentication"),
                    [
                      { text: i18n.t("common.cancel"), style: "cancel" },
                      {
                        text: i18n.t("settingsLogoutNow"),
                        style: "destructive",
                        onPress: handleLogout,
                      },
                    ]
                  );
                } else {
                  console.error("Error deleting account:", error);
                  Alert.alert(
                    i18n.t("common.error"),
                    "Failed to delete account. Please try again."
                  );
                }
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error checking subscription status:", error);
      // If we can't check subscription status, show default delete account flow
      Alert.alert(
        i18n.t("settingsDeleteAccount"),
        i18n.t("settingsDeleteConfirm"),
        [
          { text: i18n.t("common.cancel"), style: "cancel" },
          {
            text: i18n.t("settingsDeleteAction"),
            style: "destructive",
            onPress: async () => {
              try {
                if (!auth.currentUser) {
                  throw new Error("No authenticated user found");
                }
                await deleteUser(auth.currentUser);
                await signOut(auth);
                router.replace("/login");
              } catch (error: any) {
                if (error?.code === "auth/requires-recent-login") {
                  Alert.alert(
                    "Re-authentication Required",
                    i18n.t("settingsReauthentication"),
                    [
                      { text: i18n.t("common.cancel"), style: "cancel" },
                      {
                        text: i18n.t("settingsLogoutNow"),
                        style: "destructive",
                        onPress: handleLogout,
                      },
                    ]
                  );
                } else {
                  console.error("Error deleting account:", error);
                  Alert.alert(
                    i18n.t("common.error"),
                    "Failed to delete account. Please try again."
                  );
                }
              }
            },
          },
        ]
      );
    }
  };

  const handleClose = async () => {
    await actionSheetRef.current?.hide();
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handlePrivacyPress = () => {
    WebBrowser.openBrowserAsync("https://betaiapp.com/privacy.html");
  };

  const handleTermsPress = () => {
    WebBrowser.openBrowserAsync("https://betaiapp.com/terms.html");
  };

  return (
    // <LinearGradient
    //   colors={["#1f1f1f", "#141414"]}
    //   start={{ x: 0, y: 0 }}
    //   end={{ x: 0, y: 1 }}
    //   style={styles.gradientBackground}
    // >
    <ActionSheet
      headerAlwaysVisible={false}
      useBottomSafeAreaPadding={true}
      CustomHeaderComponent={<View></View>}
      // safeAreaInsets={{ top: 0, left: 10, right: 10, bottom: 10 }}
      ref={actionSheetRef}
      onClose={handleClose}
      containerStyle={styles.container}
      indicatorStyle={styles.indicator}
      gestureEnabled={true}
    >
      <LinearGradient
        colors={["#1f1f1f", "#141414", "#141414"]}
        start={{ x: 0, y: 0 }}
        locations={[0.01, 0.75, 0.95]}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBackground}
      >
        <View style={styles.contentContainer}>
          <TouchableOpacity style={styles.option} onPress={handleContactPress}>
            <View style={styles.optionContent}>
              <Feather name="phone" size={30} color="#00A7CC" />
              <Text style={styles.optionText}>
                {i18n.t("settingsContactUs")}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.option} onPress={handleRestorePress}>
            <View style={styles.optionContent}>
              <Feather name="shopping-cart" size={30} color="#00A7CC" />
              <Text style={styles.optionText}>
                {i18n.t("settingsRestorePurchase")}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.option} onPress={handleSharePress}>
            <View style={styles.optionContent}>
              <Feather name="share-2" size={30} color="#00A7CC" />
              <Text style={styles.optionText}>{i18n.t("settingsShare")}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.option} onPress={handleLogout}>
            <View style={styles.optionContent}>
              <Feather name="log-out" size={30} color="#00A7CC" />
              <Text style={styles.optionText}>{i18n.t("settingsLogout")}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.option} onPress={handleDeleteAccount}>
            <View style={styles.optionContent}>
              <Feather name="trash-2" size={30} color="#F44336" />
              <Text style={[styles.optionText, styles.deleteText]}>
                {i18n.t("settingsDeleteAccount")}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Logo size="medium" />
            <View style={styles.links}>
              <TouchableOpacity onPress={handleRestorePress}>
                <Text style={styles.linkText}>
                  {i18n.t("settingsRestorePurchase")}
                </Text>
              </TouchableOpacity>
              <Text style={styles.separator}>|</Text>
              <TouchableOpacity onPress={handlePrivacyPress}>
                <Text style={styles.linkText}>
                  {i18n.t("paywallTrialPrivacyPolicy")}
                </Text>
              </TouchableOpacity>
              <Text style={styles.separator}>|</Text>
              <TouchableOpacity onPress={handleTermsPress}>
                <Text style={styles.linkText}>
                  {i18n.t("paywallTrialTermsOfService")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </LinearGradient>
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  gradientBackground: {
    borderTopLeftRadius: 30,
    // backgroundColor: "#1f1f1f",
    borderTopRightRadius: 30,
  },
  container: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#141414",
  },
  indicator: {
    backgroundColor: "transparent",
    width: 0,
    height: 0,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  option: {
    paddingVertical: 24,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 24,
  },
  optionText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Aeonik-Medium",
    opacity: 0.8,
    fontWeight: "500",
  },
  divider: {
    height: 0.7,
    backgroundColor: "#ffffff20",
  },
  footer: {
    marginTop: 40,
    marginBottom: 20,
    alignItems: "center",
    gap: 20,
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  linkText: {
    color: "#ffffff",
    opacity: 0.5,
    fontSize: 10,
    padding: 8,
    fontFamily: "Aeonik-Light",
  },
  separator: {
    color: "#ffffff40",
    fontSize: 14,
  },
  deleteText: {
    color: "#F44336", // Red color for delete account
  },
});
