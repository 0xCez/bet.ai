import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
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
import { PageIndicator } from "../components/ui/PageIndicator";
import { BoardView } from "../components/ui/BoardView";
import { BuilderView } from "../components/ui/BuilderView";
import { PicksView } from "../components/ui/PicksView";
import { useCachedGames } from "./hooks/useCachedGames";
import { usePlayerDirectory } from "./hooks/usePlayerDirectory";
import i18n from "../i18n";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const RATING_SHOWN_KEY = "@rating_shown";

type HomeParams = {
  page?: "board" | "picks" | "scan" | "builder" | "parlay";
};

export default function HomeScreen() {
  const params = useLocalSearchParams<HomeParams>();
  const { isSubscribed, purchaseLoading } = useRevenueCatPurchases();

  // Determine initial page based on params (0 = Board, 1 = Picks, 2 = Scan, 3 = Parlay)
  const initialPage = params.page === "board" ? 0 : params.page === "picks" ? 1 : (params.page === "builder" || params.page === "parlay") ? 3 : 2;

  // Page state for tab switching
  const [activePage, setActivePage] = useState(initialPage);

  // Sync activePage when navigating back with page param (e.g., from player chart)
  useEffect(() => {
    if (params.page) {
      setActivePage(initialPage);
    }
  }, [params.page]);

  // Single shared data fetch for Board + Builder tabs
  const { games: allGames, loading: gamesLoading, error: gamesError } = useCachedGames();
  const { players: directoryPlayers } = usePlayerDirectory();

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
      router.replace("/paywall");
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

  // Handle tab change
  const handlePageChange = (page: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePage(page);
  };

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
        // Track analysis creation
        posthog?.capture('analysis_created', {
          source: 'camera',
          userId: auth.currentUser?.uid || null,
          timestamp: new Date().toISOString(),
        });
        // Replace to avoid flash back to home
        router.replace({
          pathname: "/premium-loader",
          params: { imageUri: compressedUri, from: "scan" },
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
        // Track analysis creation
        posthog?.capture('analysis_created', {
          source: 'gallery',
          userId: auth.currentUser?.uid || null,
          timestamp: new Date().toISOString(),
        });
        // Replace to avoid flash back to home
        router.replace({
          pathname: "/premium-loader",
          params: { imageUri: compressedUri, from: "scan" },
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

  // Prevent any flash of home content for unsubscribed users
  if (!isSubscribed) {
    return (
      <View style={styles.loadingContainer}>
        <LogoSpinner size={96} />
      </View>
    );
  }

  return (
    <ScreenBackground hideBg>
      {/* Background Effects - Fixed at root level */}
      <FloatingParticles verticalPosition={0.52} />
      <GradientOrb verticalPosition={0.475} />

      <View style={styles.container}>
        {/* Top Bar - Fixed position */}
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

        {/* Page Indicator - Below header */}
        <View style={styles.pageIndicatorContainer}>
          <PageIndicator
            activePage={activePage}
            onPageChange={handlePageChange}
          />
        </View>

        {/* Tab Content — all tabs stay mounted, hidden via display */}
        <View style={[styles.tabContent, activePage !== 0 && styles.hidden]}>
          <BoardView games={allGames} loading={gamesLoading} error={gamesError} directoryPlayers={directoryPlayers} />
        </View>

        <View style={[styles.tabContent, activePage !== 1 && styles.hidden]}>
          <PicksView />
        </View>

        <View style={[styles.tabContent, activePage !== 2 && styles.hidden]}>
          {/* Scan page — Camera + Gallery */}
          <View style={styles.bottomContainer}>
            {/* Scan a Slip — primary card */}
            <Animated.View style={getAnimatedStyle(2)}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (!isSubscribed) {
                  router.push("/paywall");
                  return;
                }
                handleCameraPress();
              }}
              style={({ pressed }) => [
                styles.actionCard,
                styles.actionCardPrimary,
                pressed && styles.actionCardPressed,
              ]}
            >
              <View style={styles.actionCardLeft}>
                <View style={[styles.actionIconWrap, styles.actionIconPrimary]}>
                  <Ionicons name="scan" size={22} color={colors.primaryForeground} />
                </View>
                <View>
                  <Text style={[styles.actionCardTitle, styles.actionCardTitlePrimary]}>{i18n.t("imagePickerTakePhoto")}</Text>
                  <Text style={styles.actionCardSub}>Scan your bet slip or a live game</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primaryForeground} />
            </Pressable>
            </Animated.View>

            {/* Choose from Library — glass card */}
            <Animated.View style={getAnimatedStyle(3)}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (!isSubscribed) {
                  router.push("/paywall");
                  return;
                }
                handleGalleryPress();
              }}
              style={({ pressed }) => [
                styles.actionCard,
                styles.actionCardGlass,
                pressed && styles.actionCardGlassPressed,
              ]}
            >
              <View style={styles.actionCardLeft}>
                <View style={styles.actionIconWrap}>
                  <Ionicons name="images-outline" size={22} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.actionCardTitle}>{i18n.t("imagePickerChooseFromLibrary")}</Text>
                  <Text style={styles.actionCardSub}>Upload from your photo library</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
            </Animated.View>

          </View>
        </View>

        <View style={[styles.tabContent, activePage !== 3 && styles.hidden]}>
          <BuilderView games={allGames} />
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
    paddingTop: spacing[4],
    paddingBottom: spacing[1],
  },
  logoContainer: {
    flex: 1,
    alignItems: "center",
  },
  tabContent: {
    flex: 1,
  },
  hidden: {
    display: "none",
  },
  bottomContainer: {
    padding: spacing[4],
    paddingBottom: 50,
    position: "absolute",
    bottom: 30,
    width: "100%",
    gap: spacing[3],
  },
  // Shared card base
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 80,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
  },
  actionCardPrimary: {
    backgroundColor: colors.primary,
  },
  actionCardGlass: {
    backgroundColor: "rgba(22, 26, 34, 0.85)",
    borderWidth: 1,
    borderColor: colors.rgba.primary20,
  },
  actionCardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  actionCardGlassPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: "rgba(22, 26, 34, 0.95)",
    borderColor: colors.rgba.primary30,
  },
  actionCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    flex: 1,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: "rgba(0, 215, 215, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconPrimary: {
    backgroundColor: "rgba(0, 0, 0, 0.15)",
  },
  actionCardTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
  },
  actionCardTitlePrimary: {
    color: colors.primaryForeground,
  },
  actionCardSub: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontFamily: typography.fontFamily.regular,
    marginTop: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  pageIndicatorContainer: {
    alignItems: "center",
    paddingTop: spacing[1],
    paddingBottom: spacing[3],
  },
});
