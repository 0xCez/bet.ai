import React, { useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Alert,
  Share,
  Linking,
  Platform,
  Animated,
} from "react-native";
import ActionSheet, { ActionSheetRef } from "react-native-actions-sheet";
import { TouchableOpacity } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { Logo } from "./Logo";
import { router } from "expo-router";
import { auth } from "../../firebaseConfig";
import { deleteUser, signOut } from "firebase/auth";
import { updateAppState } from "../../utils/appStorage";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { useRevenueCatPurchases } from "../../app/hooks/useRevenueCatPurchases";
import { useRevenueCat } from "../../app/providers/RevenueCatProvider";
import i18n from "../../i18n";
import { colors, spacing, borderRadius, typography, shadows } from "../../constants/designTokens";

interface SettingsBottomSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

// Menu item configuration
const menuItems = [
  { icon: "call-outline" as const, label: "settingsContactUs", action: "contact", color: colors.primary },
  { icon: "bag-handle-outline" as const, label: "settingsRestorePurchase", action: "restore", color: colors.primary },
  { icon: "share-social-outline" as const, label: "settingsShare", action: "share", color: colors.primary },
  { icon: "log-out-outline" as const, label: "settingsLogout", action: "logout", color: colors.primary },
  { icon: "trash-outline" as const, label: "settingsDeleteAccount", action: "delete", color: colors.destructive },
];

export function SettingsBottomSheet({
  isVisible,
  onClose,
}: SettingsBottomSheetProps) {
  const actionSheetRef = useRef<ActionSheetRef>(null);
  const { checkSubscriptionStatus } = useRevenueCatPurchases();
  const { restorePurchases } = useRevenueCat();

  // Animation values for staggered menu items
  const itemAnimations = useRef(
    menuItems.map(() => new Animated.Value(0))
  ).current;

  const animateItemsIn = () => {
    // Reset all animations
    itemAnimations.forEach(anim => anim.setValue(0));

    // Stagger animate each item
    const animations = itemAnimations.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        delay: index * 80,
        useNativeDriver: true,
      })
    );

    Animated.stagger(80, animations).start();
  };

  useEffect(() => {
    if (isVisible) {
      actionSheetRef.current?.show();
      // Delay animation to let sheet open first
      setTimeout(animateItemsIn, 150);
    } else {
      actionSheetRef.current?.hide();
    }
  }, [isVisible]);

  const handleContactPress = async () => {
    setTimeout(() => {
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
    setTimeout(() => {
      Share.share({
        message: i18n.t("settingsShareText"),
        url: "https://betaiapp.com",
      });
    }, 300);
  };

  const handleLogout = async () => {
    try {
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
    try {
      const hasActiveSubscription = await checkSubscriptionStatus();

      if (hasActiveSubscription) {
        Alert.alert(
          "Active Subscription Found",
          i18n.t("settingsActiveSubscription"),
          [
            { text: i18n.t("common.cancel"), style: "cancel" },
            {
              text: i18n.t("settingsManageSubscriptions"),
              onPress: () => {
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
    WebBrowser.openBrowserAsync("https://betaiapp.com/privacy");
  };

  const handleTermsPress = () => {
    WebBrowser.openBrowserAsync("https://betaiapp.com/terms");
  };

  const handleAction = (action: string) => {
    // Trigger haptic feedback on menu item press
    if (action === "delete" || action === "logout") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    switch (action) {
      case "contact":
        handleContactPress();
        break;
      case "restore":
        handleRestorePress();
        break;
      case "share":
        handleSharePress();
        break;
      case "logout":
        handleLogout();
        break;
      case "delete":
        handleDeleteAccount();
        break;
    }
  };

  return (
    <ActionSheet
      headerAlwaysVisible={false}
      useBottomSafeAreaPadding={true}
      CustomHeaderComponent={<View />}
      ref={actionSheetRef}
      onClose={handleClose}
      containerStyle={styles.container}
      indicatorStyle={styles.indicator}
      gestureEnabled={true}
    >
      <View style={styles.contentContainer}>
        {/* Drag indicator */}
        <View style={styles.dragIndicator} />

        {/* Menu Items */}
        {menuItems.map((item, index) => (
          <Animated.View
            key={item.action}
            style={{
              opacity: itemAnimations[index],
              transform: [
                {
                  translateX: itemAnimations[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [-30, 0],
                  }),
                },
                {
                  scale: itemAnimations[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            }}
          >
            <TouchableOpacity
              style={styles.option}
              onPress={() => handleAction(item.action)}
              activeOpacity={0.7}
            >
              <View style={styles.optionContent}>
                <View style={[
                  styles.iconContainer,
                  item.action === "delete" && styles.iconContainerDestructive
                ]}>
                  <Ionicons name={item.icon} size={24} color={item.color} />
                </View>
                <Text style={[
                  styles.optionText,
                  item.action === "delete" && styles.deleteText
                ]}>
                  {i18n.t(item.label)}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.mutedForeground}
                />
              </View>
            </TouchableOpacity>
            {index < menuItems.length - 1 && <View style={styles.divider} />}
          </Animated.View>
        ))}

        {/* Footer */}
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
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopLeftRadius: borderRadius.xl * 2,
    borderTopRightRadius: borderRadius.xl * 2,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.rgba.primary20,
  },
  indicator: {
    backgroundColor: "transparent",
    width: 0,
    height: 0,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: colors.muted,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: spacing[6],
  },
  contentContainer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
  },
  option: {
    paddingVertical: spacing[4],
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    gap: spacing[4],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.rgba.primary20,
  },
  iconContainerDestructive: {
    borderColor: colors.rgba.destructiveBg,
    backgroundColor: colors.rgba.destructiveBg,
  },
  optionText: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.medium,
  },
  divider: {
    height: 1,
    backgroundColor: colors.muted,
    marginLeft: 44 + spacing[4] + spacing[2], // iconContainer width + gap + padding
  },
  footer: {
    marginTop: spacing[10],
    marginBottom: spacing[4],
    alignItems: "center",
    gap: spacing[5],
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  linkText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    padding: spacing[2],
    fontFamily: typography.fontFamily.light,
  },
  separator: {
    color: colors.muted,
    fontSize: typography.sizes.sm,
  },
  deleteText: {
    color: colors.destructive,
  },
});
