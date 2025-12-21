import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { Logo } from "../components/ui/Logo";
import { IconButton } from "../components/ui/IconButton";
import * as ImagePicker from "expo-image-picker";
import { ImagePickerSheet } from "../components/ui/ImagePickerSheet";
import { SettingsBottomSheet } from "../components/ui/SettingsBottomSheet";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { useRevenueCatUser } from "./hooks/useRevenueCatUser";
import { auth } from "../firebaseConfig";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { usePostHog } from "posthog-react-native";
import { colors, spacing, borderRadius, typography } from "../constants/designTokens";
import { LogoSpinner } from "../components/ui/LogoSpinner";
import { GradientOrb } from "../components/ui/GradientOrb";
import { FloatingParticles } from "../components/ui/FloatingParticles";
import i18n from "../i18n";

const RATING_SHOWN_KEY = "@rating_shown";

export default function HomeScreen() {
  const { isSubscribed, purchaseLoading } = useRevenueCatPurchases();

  // Staggered animation values (4 elements: top bar, orb, scan button, gallery button)
  const cardAnimations = useRef(
    Array.from({ length: 4 }, () => new Animated.Value(0))
  ).current;

  const animateIn = () => {
    cardAnimations.forEach(anim => anim.setValue(0));
    const animations = cardAnimations.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 350,
        delay: 50 + index * 100,
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();
  };

  const getAnimatedStyle = (index: number) => ({
    opacity: cardAnimations[index],
    transform: [
      {
        translateX: cardAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [-30, 0],
        }),
      },
      {
        scale: cardAnimations[index].interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 1],
        }),
      },
    ],
  });
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const { linkUserToFirebase } = useRevenueCatUser();
  const posthog = usePostHog();

  useEffect(() => {
    if (!purchaseLoading && !isSubscribed) {
      // router.push("/paywall");
    }
  }, [isSubscribed, purchaseLoading]);

  // Trigger staggered animation when loading completes
  const hasAnimatedRef = useRef(false);
  useEffect(() => {
    if (!purchaseLoading && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      setTimeout(animateIn, 100);
    }
  }, [purchaseLoading]);

  useEffect(() => {
    const user = auth.currentUser;
    if (user?.uid) {
      linkRevenueCatUser(user.uid);
      // Identify user in PostHog
      posthog?.identify(user.uid, {
        email: user.email,
        name: user.displayName,
        subscriptionStatus: isSubscribed ? "subscribed" : "free",
      });
    }
  }, [isSubscribed]);

  // Rating popup effect
  useEffect(() => {
    const checkAndShowRating = async () => {
      try {
        const hasShownRating = await AsyncStorage.getItem(RATING_SHOWN_KEY);

        if (!hasShownRating) {
          const isAvailable = await StoreReview.isAvailableAsync();
          if (isAvailable) {
            await StoreReview.requestReview();
            await AsyncStorage.setItem(RATING_SHOWN_KEY, "true");
          }
        }
      } catch (error) {
        console.error("Error showing rating:", error);
      }
    };

    checkAndShowRating();
  }, []);

  const linkRevenueCatUser = async (userId: string) => {
    try {
      const result = await linkUserToFirebase(userId);
      if (!result.success) {
        console.error("Failed to link user:", result.error);
      }
    } catch (error) {
      console.error("Error linking user:", error);
    }
  };

  // We don't need this anymore as we're directly calling the camera/gallery functions
  // const handleImagePickerPress = async () => {
  //   if (!isSubscribed) {
  //     router.push("/paywall");
  //     return;
  //   }
  //   setIsBottomSheetVisible(true);
  // };

  // Helper function to compress image
  const compressImage = async (uri: string): Promise<string> => {
    try {
      const manipulateResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1080 } }], // Resize to max width of 1080px while maintaining aspect ratio
        {
          compress: 0.7, // 70% quality
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      return manipulateResult.uri;
    } catch (error) {
      console.error("Error compressing image:", error);
      return uri; // Return original URI if compression fails
    }
  };

  const handleCameraPress = useCallback(async () => {
    try {
      setIsBottomSheetVisible(false);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        alert("Sorry, we need camera permissions to make this work!");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const compressedUri = await compressImage(result.assets[0].uri);
        router.push({
          pathname: "/analysis",
          params: { imageUri: compressedUri },
        });
      }
    } catch (error) {
      console.error("Camera error:", error);
      alert("There was an error accessing the camera. Please try again.");
    }
  }, []);

  const handleGalleryPress = useCallback(async () => {
    try {
      setIsBottomSheetVisible(false);

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        alert("Sorry, we need camera roll permissions to make this work!");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const compressedUri = await compressImage(result.assets[0].uri);
        router.push({
          pathname: "/analysis",
          params: { imageUri: compressedUri },
        });
      }
    } catch (error) {
      console.error("Gallery error:", error);
      alert("There was an error accessing the gallery. Please try again.");
    }
  }, []);

  if (purchaseLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LogoSpinner size={96} />
      </View>
    );
  }

  // if (!isSubscribed) {
  //   return null;
  // }

  return (
    <ScreenBackground hideBg>
      {/* Option A: Floating particles around the orb */}
      <FloatingParticles verticalPosition={0.50} />
      <GradientOrb />
      <View style={styles.container}>
        {/* Top Bar */}
        <Animated.View style={[styles.topBar, getAnimatedStyle(0)]}>
          <IconButton
            icon="menu"
            onPress={() => setIsSettingsVisible(true)}
            size={28}
          />

          <View style={styles.logoContainer}>
            <Logo size="small" />
          </View>

          <IconButton
            icon="time-outline"
            onPress={() => router.push("/history")}
            size={28}
          />
        </Animated.View>


        {/* Two Buttons Container */}
        <View style={styles.bottomContainer}>
          {/* Top Button - Scan a Bet (Primary solid CTA) */}
          <Animated.View style={getAnimatedStyle(2)}>
          <Pressable
            onPress={() => {
              if (!isSubscribed) {
                router.push("/paywall");
                return;
              }
              handleCameraPress();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="scan" size={22} color={colors.primaryForeground} />
              <Text style={styles.primaryButtonText}>{i18n.t("imagePickerTakePhoto")}</Text>
            </View>
          </Pressable>
          </Animated.View>

          {/* Bottom Button - Choose from Gallery (Glass style) */}
          <Animated.View style={getAnimatedStyle(3)}>
          <Pressable
            onPress={() => {
              if (!isSubscribed) {
                router.push("/paywall");
                return;
              }
              handleGalleryPress();
            }}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="images-outline" size={22} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>{i18n.t("imagePickerChooseFromLibrary")}</Text>
            </View>
          </Pressable>
          </Animated.View>
        </View>

        <ImagePickerSheet
          isVisible={isBottomSheetVisible}
          onClose={() => setIsBottomSheetVisible(false)}
          onCameraPress={handleCameraPress}
          onGalleryPress={handleGalleryPress}
        />

        <SettingsBottomSheet
          isVisible={isSettingsVisible}
          onClose={() => setIsSettingsVisible(false)}
        />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  logoContainer: {
    flex: 1,
    alignItems: "center",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 0,
    paddingBottom: 150,
  },
  mainText: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },
  subText: {
    fontSize: 28,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    marginTop: 4,
  },
  centerImage: {
    width: "100%",
    height: 400,
    alignSelf: "center",
    marginBottom: 55,
  },
  bottomContainer: {
    padding: spacing[4],
    paddingBottom: 50,
    position: "absolute",
    bottom: 30,
    width: "100%",
    gap: spacing[4],
  },
  // Primary CTA - Solid cyan with glow
  primaryButton: {
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    // Intense glow effect
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.97 }],
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    marginLeft: spacing[2],
  },
  // Secondary button - Glass style with cyan accent
  secondaryButton: {
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(22, 26, 34, 0.85)",
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
    alignItems: "center",
    justifyContent: "center",
    // Subtle glow
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 5,
  },
  secondaryButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: "rgba(22, 26, 34, 0.95)",
    borderColor: colors.rgba.primary50,
    shadowOpacity: 0.25,
  },
  secondaryButtonText: {
    color: colors.foreground,
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.medium,
    marginLeft: spacing[2],
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
