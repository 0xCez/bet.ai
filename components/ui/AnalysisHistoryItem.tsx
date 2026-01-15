import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { colors, borderRadius } from "../../constants/designTokens";

export interface AnalysisHistoryItemProps {
  teams: string;
  confidence: number;
  onPress: () => void;
  onDelete?: () => void;
  imageUrl?: string;
  isDeleting?: boolean;
}

export function AnalysisHistoryItem({
  teams,
  confidence,
  onPress,
  onDelete,
  imageUrl,
  isDeleting,
}: AnalysisHistoryItemProps) {
  return (
    <Pressable style={styles.container} onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }}>
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[styles.image, styles.placeholderImage]} />
        )}

        {onDelete && (
          <Pressable
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.deleteButtonPressed,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDelete();
            }}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={colors.primary} />
            )}
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return "#4CAF50";
  if (confidence >= 60) return "#FFC107";
  return "#F44336";
}

const styles = StyleSheet.create({
  container: {
    width: "48%",
    margin: 8,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    backgroundColor: colors.secondary,
  },
  deleteButton: {
    position: "absolute",
    bottom: 10,
    left: "50%",
    marginLeft: -20,
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(22, 26, 34, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.2)",
    zIndex: 1,
  },
  deleteButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
    backgroundColor: "rgba(22, 26, 34, 0.95)",
    borderColor: "rgba(0, 215, 215, 0.4)",
  },
});
