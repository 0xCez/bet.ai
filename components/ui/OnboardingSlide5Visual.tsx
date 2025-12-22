import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Message data
const messages = [
  {
    id: 1,
    type: "user",
    text: "Quick question on Lakers vs Warriors",
  },
  {
    id: 2,
    type: "ai",
    text: "Of course! Just a heads up - LeBron is listed as questionable with a knee issue. Do you have any bets placed on this game?",
  },
  {
    id: 3,
    type: "user",
    text: "Not feeling super confident on it anymore.",
  },
  {
    id: 4,
    type: "user",
    text: "Already placed it earlier when they were at -2.5",
  },
  {
    id: 5,
    type: "user",
    text: "Now the line moved to -1....",
  },
  {
    id: 6,
    type: "ai",
    text: "Totally get it. The line moving from -2.5 to -1 suggests sharp money or injury news hitting the market. Want me to run some hedge scenarios for you?",
  },
];

interface AnimatedMessageProps {
  message: typeof messages[0];
  index: number;
  isActive: boolean;
}

function AnimatedMessage({ message, index, isActive }: AnimatedMessageProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const scale = useSharedValue(0.9);

  const isUser = message.type === "user";

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      translateY.value = 20;
      scale.value = 0.9;

      const delay = 300 + index * 150;

      opacity.value = withDelay(delay, withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 120 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
    } else {
      opacity.value = 0;
      translateY.value = 20;
      scale.value = 0.9;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.messageWrapper,
        isUser ? styles.userMessageWrapper : styles.aiMessageWrapper,
        animatedStyle,
      ]}
    >
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
          {message.text}
        </Text>
      </View>
    </Animated.View>
  );
}

interface OnboardingSlide5VisualProps {
  isActive?: boolean;
}

export function OnboardingSlide5Visual({ isActive = false }: OnboardingSlide5VisualProps) {
  // Header animation
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(-20);

  // Input animation
  const inputOpacity = useSharedValue(0);
  const inputTranslateY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      headerOpacity.value = 0;
      headerTranslateY.value = -20;
      inputOpacity.value = 0;
      inputTranslateY.value = 20;

      // Header animates first
      headerOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
      headerTranslateY.value = withDelay(100, withSpring(0, { damping: 15, stiffness: 100 }));

      // Input animates last
      inputOpacity.value = withDelay(1200, withTiming(1, { duration: 400 }));
      inputTranslateY.value = withDelay(1200, withSpring(0, { damping: 15, stiffness: 100 }));
    } else {
      headerOpacity.value = 0;
      headerTranslateY.value = -20;
      inputOpacity.value = 0;
      inputTranslateY.value = 20;
    }
  }, [isActive]);

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const inputAnimatedStyle = useAnimatedStyle(() => ({
    opacity: inputOpacity.value,
    transform: [{ translateY: inputTranslateY.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Phone mockup frame */}
      <View style={styles.phoneFrame}>
        {/* Header */}
        <Animated.View style={[styles.header, headerAnimatedStyle]}>
          <View style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.foreground} />
          </View>
          <Text style={styles.headerTitle}>Bet.AI</Text>
          <View style={styles.headerSpacer} />
        </Animated.View>

        {/* Messages container */}
        <View style={styles.messagesContainer}>
          {messages.map((message, index) => (
            <AnimatedMessage
              key={message.id}
              message={message}
              index={index}
              isActive={isActive}
            />
          ))}
        </View>

        {/* Chat input */}
        <Animated.View style={[styles.inputContainer, inputAnimatedStyle]}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputPlaceholder}>How can I help you?</Text>
            <View style={styles.sendButton}>
              <Ionicons name="arrow-up" size={18} color={colors.background} />
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.50,
    alignItems: "center",
    justifyContent: "center",
  },
  phoneFrame: {
    width: SCREEN_WIDTH * 0.88,
    height: SCREEN_HEIGHT * 0.48,
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 18,
    color: colors.foreground,
  },
  headerSpacer: {
    width: 32,
  },
  // Messages
  messagesContainer: {
    flex: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[10],
  },
  messageWrapper: {
    marginBottom: spacing[2],
    maxWidth: "85%",
  },
  userMessageWrapper: {
    alignSelf: "flex-end",
  },
  aiMessageWrapper: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.xl,
  },
  userBubble: {
    backgroundColor: "#0EA5E9",
    borderBottomRightRadius: borderRadius.sm,
  },
  aiBubble: {
    backgroundColor: colors.muted,
    borderBottomLeftRadius: borderRadius.sm,
  },
  messageText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  userText: {
    color: "#FFFFFF",
  },
  aiText: {
    color: colors.foreground,
  },
  // Input
  inputContainer: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[1],
    paddingTop: spacing[1],
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: borderRadius.full,
    paddingLeft: spacing[4],
    paddingRight: spacing[1],
    paddingVertical: spacing[1],
  },
  inputPlaceholder: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default OnboardingSlide5Visual;
