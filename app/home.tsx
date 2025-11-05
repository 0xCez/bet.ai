import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Image, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { GradientButton } from "../components/ui/GradientButton";
import { Logo } from "../components/ui/Logo";
import { TouchableOpacity } from "react-native-gesture-handler";
import * as ImagePicker from "expo-image-picker";
import { ImagePickerSheet } from "../components/ui/ImagePickerSheet";
import { LinearGradient } from "expo-linear-gradient";
import Octicons from "@expo/vector-icons/Octicons";
import Feather from "@expo/vector-icons/Feather";
import { SettingsBottomSheet } from "../components/ui/SettingsBottomSheet";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { useRevenueCatUser } from "./hooks/useRevenueCatUser";
import { auth } from "../firebaseConfig";
import APIService from "@/services/api";
import * as ImageManipulator from "expo-image-manipulator";
import RadialGradient from "react-native-radial-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { usePostHog } from "posthog-react-native";
import i18n from "../i18n";
import { BorderButton } from "@/components/ui/BorderButton";

const RATING_SHOWN_KEY = "@rating_shown";

export default function HomeScreen() {
  const { isSubscribed, purchaseLoading } = useRevenueCatPurchases();
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const { linkUserToFirebase } = useRevenueCatUser();
  const posthog = usePostHog();

  useEffect(() => {
    if (!purchaseLoading && !isSubscribed) {
      // router.push("/paywall");
    }
  }, [isSubscribed, purchaseLoading]);

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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00C2E0" />
      </View>
    );
  }

  // if (!isSubscribed) {
  //   return null;
  // }

  return (
    <ScreenBackground
      hideBg={false}
      backgroundImage={require("../assets/images/homepagebg.png")}
      imageStyle={{
        resizeMode: "cover",
        height: "110%",
        top: -20,
      }}
    >
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setIsSettingsVisible(true)}
          >
            <Image
              source={require("../assets/images/menu2.png")}
              style={styles.menuIcon}
            />
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <Logo size="small" />
          </View>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              console.log("history pressed");
              router.push("/history");
            }}
          >
            <Image
              source={require("../assets/images/history2.png")}
              style={styles.menuIcon}
            />
          </TouchableOpacity>
        </View>


        {/* Two Buttons Container */}
        <View style={styles.bottomContainer}>
          {/* Top Button - Scan a Bet */}
          <View style={styles.scanButtonShadowInner}>
            <GradientButton
              onPress={() => {
                if (!isSubscribed) {
                  router.push("/paywall");
                  return;
                }
                handleCameraPress();
              }}
              containerStyle={styles.scanButton}
              colors={["#00C2E0", "#007B90"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            >
              <View style={styles.buttonContentRow}>
                <Text style={styles.buttonText}>{i18n.t("imagePickerTakePhoto")} 🤳</Text>
              </View>
            </GradientButton>
          </View>

          {/* Bottom Button - Choose from Gallery */}
          <View style={styles.libraryButtonShadow}>
            <BorderButton
              onPress={() => {
                if (!isSubscribed) {
                  router.push("/paywall");
                  return;
                }
                handleGalleryPress();
              }}
              containerStyle={styles.libraryButton}
              borderColor="rgba(0, 221, 255, 0.25)"
              gradientColors={["#161616", "#0D0D0D"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              opacity={1}
              borderWidth={0.75}
            >
              <View style={styles.buttonContentRow}>
                <Text style={styles.buttonText}>{i18n.t("imagePickerChooseFromLibrary")} 📚</Text>
              </View>
            </BorderButton>
          </View>
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
  menuIcon: {
    width: 48,
    height: 48,
  },
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  iconButton: {
    width: 48,
    height: 48,
    // borderRadius: 25,
    // backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
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
    padding: 16,
    paddingBottom: 50,
    position: "absolute",
    bottom: 30,
    width: "100%",
    gap: 20,
  },
  scanButtonShadowInner: {
    // Drop shadow 1: X: 0, Y: 4, Blur: 20, Spread: 0, Color: #00C2E0 at 25% opacity
    shadowColor: "#00C2E0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
    borderRadius: 32,
  },
  scanButton: {
    height: 72,
    borderRadius: 32,
    overflow: "hidden", // Ensure gradient stays within bounds
  },
  libraryButtonShadow: {
    // Drop shadow: X: 0, Y: 4, Blur: 16, Color: #00C2E0 at 18% opacity
    shadowColor: "#00C2E0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 4, // Android shadow
    borderRadius: 32,
  },
  libraryButton: {
    height: 72,
    borderRadius: 32,
    overflow: "hidden", // Ensure gradient stays within bounds
  },
  buttonContentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Aeonik-Medium",
    textAlign: "center",
  },
});
