import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

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
    <TouchableOpacity style={styles.container} onPress={onPress}>
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
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Image
                source={require("../../assets/images/delete.png")}
                style={styles.deleteIcon}
                contentFit="contain"
              />
            )}
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
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
    backgroundColor: "#1A1A1A",
    borderRadius: 20,
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
    backgroundColor: "#333",
  },
  deleteButton: {
    position: "absolute",
    bottom: 6,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  deleteIcon: {
    width: 40,
    height: 40,
  },
  contentBelow: {
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 40,
  },
  teams: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    marginRight: 4,
  },
  rightContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  confidenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 12,
  },
  confidenceText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  loadingIcon: {
    opacity: 0.5,
  },
});
