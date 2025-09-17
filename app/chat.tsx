import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ViewStyle,
  Text,
  TextStyle,
} from "react-native";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import {
  GiftedChat,
  IMessage,
  Bubble,
  InputToolbar,
  Send,
} from "react-native-gifted-chat";
import APIService from "../services/api";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { TopBar } from "../components/ui/TopBar";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import i18n from "../i18n";

// Static variable to persist messages across screen unmounts/remounts
let persistedMessages: IMessage[] = [];
let persistedOpenaiHistory: any[] = [];
let hasInitialized = false;

export default function ChatScreen() {
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const insets = useSafeAreaInsets();
  const { analysisData } = useLocalSearchParams<{ analysisData?: string }>();

  const getSystemPrompt = (data: any) => {
    // Base prompt with the new tone and style
    const basePrompt =
      'You are Bet.Ai, a ruthless but charming expert in sports betting and game analysis. Your job is to help users find insights, opportunities, and value bets using the data provided to you. You speak in a confident, sharp, no-fluff tone—like a sports-obsessed quant who\'s been winning parlays since they could count odds.\n\nYou are not a cheerleader. You are not here to hype up teams based on fan feelings. You rely on data, edge, and probability. If the odds are trash, say so. If the pick is risky, warn them—but if you see an angle, explain it like a pro handicapper breaking it down for a high-stakes table.\n\nYour typical users are:\n\nDegens who live for same-game parlays\n\nSharp bettors looking for underpriced lines\n\nCasuals who want to feel like insiders\n\nAlways explain why something is a good (or bad) bet. Use reasoning grounded in recent form, matchup history, injury reports, public betting trends, and implied probability.\n\nWhen provided data or context (injury reports, betting lines, team stats), analyze it clearly, and use that to drive your betting commentary. Assume the user has a basic understanding of moneylines, spreads, over/unders.\n\nNEVER give financial guarantees. Use words like "value," "edge," "trend," or "correlated outcome."\n\nAdd spice with lines like:\n\n"Books are sleeping on this."\n\n"This smells like a trap line."\n\n"Public\'s pounding the over—but they\'re usually late to the party."\n\n"If you\'re feeling risky, here\'s the longshot I\'d eye."';

    // If no data is passed, return just the base prompt
    if (!data) {
      return basePrompt;
    }

    // If data is provided, include it in the prompt
    return (
      basePrompt +
      "\n\nHere's the match data you're discussing with the user:\n\n" +
      JSON.stringify(data, null, 2) +
      "\n\nUse this data to provide specific insights, identify value opportunities, and help the user understand the betting landscape for this match. Reference key statistics, trends, and factors that might influence the outcome or odds."
    );
  };

  const [openaiHistory, setOpenaiHistory] = useState(() => {
    if (persistedOpenaiHistory.length > 0) {
      return persistedOpenaiHistory;
    }

    return [
      {
        role: "system",
        content: getSystemPrompt(
          analysisData ? JSON.parse(analysisData) : null
        ),
      },
    ];
  });

  useEffect(() => {
    // If we already have persisted messages, use them instead of initializing new ones
    if (persistedMessages.length > 0) {
      setMessages(persistedMessages);
      return;
    }

    // If no persisted messages, initialize with the welcome message
    if (!hasInitialized) {
      const initialMessage = {
        _id: 1,
        text: analysisData
          ? "I've reviewed the analysis for this match in detail. What aspects would you like me to explain further? I can discuss the market movements, key statistics, X-factors, or any other elements of the analysis."
          : "Hi! I'm your BetAI assistant. I can help you analyze odds, understand betting strategies, and make more informed decisions. What would you like to know?",
        createdAt: new Date(),
        user: {
          _id: 2,
          name: "BetAI",
          avatar:
            "https://ui-avatars.com/api/?name=Bet+AI&background=0366d6&color=fff",
        },
      };
      setMessages([initialMessage]);
      persistedMessages = [initialMessage];
      hasInitialized = true;
    }
  }, [analysisData]);

  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      const userMessage = newMessages[0];

      // Update local state and persisted state
      const updatedMessages = GiftedChat.append(messages, newMessages);
      setMessages(updatedMessages);
      persistedMessages = updatedMessages;

      setIsTyping(true);
      const newOpenaiHistory = [
        ...openaiHistory,
        { role: "user", content: userMessage.text },
      ];

      // Update persisted openai history
      persistedOpenaiHistory = newOpenaiHistory;

      try {
        const response = await APIService.chat(newOpenaiHistory);

        if (response.error) {
          throw new Error(response.error);
        }

        const aiReply = response.message?.content;

        if (aiReply) {
          const botMessage: IMessage = {
            _id: Math.random(),
            text: aiReply,
            createdAt: new Date(),
            user: {
              _id: 2,
              name: "BetAI",
              avatar:
                "https://ui-avatars.com/api/?name=Bet+AI&background=0366d6&color=fff",
            },
          };

          // Update both states
          const latestMessages = GiftedChat.append(updatedMessages, [
            botMessage,
          ]);
          setMessages(latestMessages);
          persistedMessages = latestMessages;

          const updatedHistory = [
            ...newOpenaiHistory,
            { role: "assistant", content: aiReply },
          ];
          setOpenaiHistory(updatedHistory);
          persistedOpenaiHistory = updatedHistory;
        }
      } catch (err) {
        console.error("Chat error:", err);
        const errorMessage: IMessage = {
          _id: Math.random(),
          text: "Sorry, I encountered an error. Please try again.",
          createdAt: new Date(),
          user: {
            _id: 2,
            name: "BetAI",
            avatar:
              "https://ui-avatars.com/api/?name=Bet+AI&background=0366d6&color=fff",
          },
        };

        // Update both states
        const errorMessages = GiftedChat.append(updatedMessages, [
          errorMessage,
        ]);
        setMessages(errorMessages);
        persistedMessages = errorMessages;
      } finally {
        setIsTyping(false);
      }
    },
    [messages, openaiHistory]
  );

  const renderBubble = (props: any) => {
    return (
      <Bubble
        {...props}
        wrapperStyle={{
          left: {
            backgroundColor: "rgba(255, 255, 255, 0.1)",
          },
          right: {
            backgroundColor: "#0366d6",
          },
        }}
        textStyle={{
          left: {
            color: "#fff",
          },
          right: {
            color: "#fff",
          },
        }}
      />
    );
  };

  const renderInputToolbar = (props: any) => {
    return (
      <View
        style={{
          paddingBottom: 0,
          borderTopWidth: 0.2,
          borderTopColor: "#777777",
        }}
      >
        <InputToolbar
          {...props}
          containerStyle={styles.inputToolbar}
          primaryStyle={styles.inputPrimary}
          textInputStyle={styles.input}
        />
      </View>
    );
  };

  const renderSend = (props: any) => {
    return (
      <Send {...props} containerStyle={styles.sendContainer}>
        <View style={styles.sendButton}>
          <Image
            source={require("../assets/images/send.png")}
            style={styles.sendIcon}
            contentFit="cover"
            transition={300}
          />
        </View>
      </Send>
    );
  };

  const renderMessage = (props: any) => {
    const { currentMessage, previousMessage, nextMessage } = props;

    // Calculate if message is first or last in sequence
    const isFirstInSequence =
      !previousMessage ||
      !previousMessage.user ||
      previousMessage.user._id !== currentMessage?.user?._id;

    const isLastInSequence =
      !nextMessage ||
      !nextMessage.user ||
      nextMessage.user._id !== currentMessage?.user?._id;

    const isUser = currentMessage?.user?._id === 1;

    // Determine container style based on message position
    const containerStyle: ViewStyle = {
      backgroundColor: isUser ? "#0083AA" : "#1C1C1C",
      borderRadius: 16,
      marginVertical: 0,
      marginHorizontal: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,

      borderTopEndRadius: 18,
      borderTopStartRadius: 18,
      borderBottomEndRadius: isUser ? 4 : 18,
      borderBottomStartRadius: isUser ? 18 : 4,
      maxWidth: "80%",
      alignSelf: isUser ? "flex-end" : "flex-start",
    };

    return (
      <View
        style={[
          styles.messageWrapper,
          { alignItems: isUser ? "flex-end" : "flex-start" },
        ]}
      >
        <View style={containerStyle}>
          <Text style={styles.messageText}>{currentMessage?.text || ""}</Text>
        </View>
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (!isTyping) return null;

    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#00C2E0" />
        <Text style={styles.loadingText}>{i18n.t("chatAiThinking")}</Text>
      </View>
    );
  };

  return (
    <ScreenBackground hideBg={true}>
      <TopBar showBack />
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <GiftedChat
          messages={messages}
          onSend={onSend}
          user={{ _id: 1 }}
          renderBubble={renderBubble}
          renderInputToolbar={renderInputToolbar}
          renderSend={renderSend}
          renderMessage={renderMessage}
          renderTypingIndicator={renderTypingIndicator}
          isTyping={isTyping}
          renderAvatar={null}
          alwaysShowSend={true}
          timeTextStyle={{
            left: styles.timeText,
            right: styles.timeText,
          }}
          minInputToolbarHeight={60}
          bottomOffset={Platform.OS === "ios" ? 0 : 10}
          keyboardShouldPersistTaps="never"
          placeholder={i18n.t("chatPlaceholder")}
        />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  sendIcon: {
    width: 28,
    height: 28,
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  inputToolbar: {
    backgroundColor: "#535353",
    borderTopWidth: 0,
    // paddingVertical: 8,
    height: 52,
    paddingHorizontal: 10,
    marginHorizontal: 20,
    marginVertical: 20,
    borderWidth: 0.2,
    borderColor: "#222222",
    // marginBottom: 5,
    borderRadius: 16,
    // alignItems: "center",
    // justifyContent: "center",
  },
  inputPrimary: {
    alignItems: "center",
  },
  input: {
    color: "#FFFFFF",
    fontFamily: "Aeonik-Regular",
    fontSize: 14,
  },
  sendContainer: {
    // justifyContent: "center",
    // alignItems: "center",
    marginRight: 5,
    marginBottom: 0,
    height: 38,
  },
  sendButton: {
    backgroundColor: "rgba(255, 255, 255)",
    borderRadius: 20,
    padding: 0,
  },
  messageWrapper: {
    flex: 1,
    paddingHorizontal: 0,
    marginVertical: 15,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
    fontFamily: "Aeonik-Regular",
    color: "white",
  },
  timeText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 4,
    fontFamily: "Aeonik-Regular",
  },
  loadingContainer: {
    padding: 12,
    borderRadius: 8,
    flexDirection: "row",
    // alignItems: "center",
    // alignSelf: "center",
    marginTop: 10,
    gap: 8,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Aeonik-Regular",
  },
});
