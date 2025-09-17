import React from "react";
import { Text, StyleSheet, TextStyle, Platform, View } from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";

// Helper function to get the appropriate blur image based on card type
function getBlurImage(card?: string) {
  switch (card) {
    case "ms-1":
      return require("../../assets/images/ms-blur-1.png");
    case "ms-2":
      return require("../../assets/images/xf-blur-2.png");
    case "ms-3":
      return require("../../assets/images/ms-blur-3.png");
    case "xf-1":
      return require("../../assets/images/xf-blur-1.png");
    case "xf-2":
      return require("../../assets/images/xf-blur-2.png");
    case "xf-3":
      return require("../../assets/images/xf-blur-3.png");
    case "ai-1":
      return require("../../assets/images/ai-blur-1.png");
    case "ai-2":
      return require("../../assets/images/ai-blur-2.png");
    case "ai-3":
      return require("../../assets/images/aiblur.png");
    default:
      return require("../../assets/images/ms-blur-1.png");
  }
}

interface BlurTextProps {
  children: React.ReactNode;
  blur?: boolean;
  style?: TextStyle;
  lineHeight?: number;
  card?: string;
  invisible?: boolean;
  textColor?: string;
}

export function BlurText({
  children,
  blur = false,
  style,
  lineHeight,
  card,
  invisible = false,
  textColor = "#FFFFFF",
}: BlurTextProps) {
  const textStyles: TextStyle[] = [{ ...styles.text, color: textColor }];

  if (lineHeight !== undefined) {
    textStyles.push({ lineHeight });
  }
  if (style) {
    textStyles.push(style);
  }

  // If blur is false or we're on web (where BlurView isn't supported), render normal text
  if (!blur || Platform.OS === "web") {
    return <Text style={textStyles}>{children}</Text>;
  }

  // For native platforms with blur enabled
  return (
    <View style={styles.textContainer}>
      {!blur && (
        <Text style={[...textStyles, styles.clearText]}>{children}</Text>
      )}

      {blur &&
        !invisible &&
        (card === "ai-3" ? (
          <View style={styles.placeholderContainer}>
            <Image
              source={getBlurImage(card)}
              style={styles.aiBlurImage}
            />
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Image
              source={getBlurImage(card)}
              style={styles.placeholderImage}
            />
          </View>
        ))}

      {/* {blur && (
        <Text style={[...textStyles, styles.blurredText]}>{children}</Text>
      )} */}

      {/* <BlurView
        intensity={14}
        tint="dark"
        style={styles.blurContainer}
      ></BlurView> */}
    </View>
  );
}

const styles = StyleSheet.create({
  clearText: {
    padding: 0,
  },
  placeholderImage: {
    width: "100%",
    height: 30,
    resizeMode: "contain",
  },
  aiBlurImage: {
    width: "100%",
    height: 400,
    resizeMode: "contain",
  },
  placeholderContainer: {
    width: "100%",
    position: "absolute",
    left: -4,
    height: 24,
    paddingLeft: -30,
    alignItems: "flex-start",
  },
  placeholderText: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
  },
  textContainer: {
    position: "relative",
  },
  blurContainer: {
    borderRadius: 0,
    overflow: "hidden",
    shadowColor: "rgba(0, 0, 0, 0.5)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  text: {
    fontSize: 14,
    fontFamily: "Aeonik-Regular",
  },
  blurredText: {
    padding: 0,
    fontSize: 12,
    color: "#e0e0e0",
  },
});
