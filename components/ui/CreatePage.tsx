import React, { useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { auth } from "../../firebaseConfig";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import { GradientOrb } from "./GradientOrb";
import { FloatingParticles } from "./FloatingParticles";
import i18n from "../../i18n";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface CreatePageProps {
  isSubscribed: boolean;
}

export const CreatePage: React.FC<CreatePageProps> = ({ isSubscribed }) => {
  const posthog = usePostHog();

  // Helper function to compress image
  const compressImage = async (uri: string): Promise<string> => {
    try {
      const manipulateResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1080 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      return manipulateResult.uri;
    } catch (error) {
      console.error("Error compressing image:", error);
      return uri;
    }
  };

  const handleCameraPress = useCallback(async () => {
    try {
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
        posthog?.capture("analysis_created", {
          source: "camera",
          userId: auth.currentUser?.uid || null,
          timestamp: new Date().toISOString(),
        });
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
        posthog?.capture("analysis_created", {
          source: "gallery",
          userId: auth.currentUser?.uid || null,
          timestamp: new Date().toISOString(),
        });
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

  return (
    <View style={[styles.container, { width: SCREEN_WIDTH }]}>
      {/* Background Effects */}
      <FloatingParticles verticalPosition={0.5} />
      <GradientOrb />

      {/* Content */}
      <View style={styles.content}>
        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Analyze Your Bet</Text>
          <Text style={styles.subtitle}>
            Scan a bet slip or upload from your gallery
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          {/* Primary - Scan Button */}
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
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="scan" size={22} color={colors.primaryForeground} />
              <Text style={styles.primaryButtonText}>
                {i18n.t("imagePickerTakePhoto")}
              </Text>
            </View>
          </Pressable>

          {/* Secondary - Gallery Button */}
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
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
          >
            <View style={styles.buttonContent}>
              <Ionicons name="images-outline" size={22} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>
                {i18n.t("imagePickerChooseFromLibrary")}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 100,
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: spacing[8],
    paddingHorizontal: spacing[4],
  },
  title: {
    color: colors.foreground,
    fontSize: typography.sizes["2xl"],
    fontFamily: typography.fontFamily.bold,
    marginBottom: spacing[2],
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    textAlign: "center",
  },
  buttonsContainer: {
    paddingHorizontal: spacing[4],
    gap: spacing[4],
  },
  primaryButton: {
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
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
  secondaryButton: {
    height: 72,
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(22, 26, 34, 0.85)",
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
    alignItems: "center",
    justifyContent: "center",
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
});

export default CreatePage;
