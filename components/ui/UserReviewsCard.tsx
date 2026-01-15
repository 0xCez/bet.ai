import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";
import i18n from "../../i18n";

interface UserReviewsCardProps {
  animate?: boolean;
}

// Review data with profile images
const REVIEWS = [
  {
    id: 1,
    name: "Jake L.",
    image: require("../../assets/images/jake.png"),
    review: "reviewJake",
  },
  {
    id: 2,
    name: "Emily S.",
    image: require("../../assets/images/emily.png"),
    review: "reviewEmily",
  },
  {
    id: 3,
    name: "Chris M.",
    image: require("../../assets/images/chris.png"),
    review: "reviewChris",
  },
];

// Star rating component
const StarRating = ({ rating = 5 }: { rating?: number }) => (
  <View style={styles.starsContainer}>
    {[1, 2, 3, 4, 5].map((star) => (
      <Ionicons
        key={star}
        name={star <= rating ? "star" : "star-outline"}
        size={17}
        color="#FFB800"
      />
    ))}
  </View>
);

export function UserReviewsCard({ animate = true }: UserReviewsCardProps) {
  // Animation values
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.8)).current;
  const cardAnimations = useRef(
    REVIEWS.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(30),
    }))
  ).current;

  useEffect(() => {
    if (!animate) {
      // Set all to final state
      headerOpacity.setValue(1);
      headerScale.setValue(1);
      cardAnimations.forEach((anim) => {
        anim.opacity.setValue(1);
        anim.translateY.setValue(0);
      });
      return;
    }

    // Small delay to ensure component is mounted before animating
    const timer = setTimeout(() => {
      // Animation sequence
      const animationSequence = Animated.sequence([
        // 1. Header (stars with laurels) appears with scale
        Animated.parallel([
          Animated.timing(headerOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.spring(headerScale, {
            toValue: 1,
            friction: 6,
            tension: 100,
            useNativeDriver: true,
          }),
        ]),
        // 2. Cards appear sequentially
        Animated.stagger(
          200,
          cardAnimations.map((anim) =>
            Animated.parallel([
              Animated.timing(anim.opacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(anim.translateY, {
                toValue: 0,
                friction: 8,
                tension: 100,
                useNativeDriver: true,
              }),
            ])
          )
        ),
      ]);

      animationSequence.start();
    }, 100);

    return () => {
      clearTimeout(timer);
      headerOpacity.stopAnimation();
      headerScale.stopAnimation();
      cardAnimations.forEach((anim) => {
        anim.opacity.stopAnimation();
        anim.translateY.stopAnimation();
      });
    };
  }, [animate]);

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Header - 5 stars with laurels */}
      <Animated.View
        style={[
          styles.headerContainer,
          {
            opacity: headerOpacity,
            transform: [{ scale: headerScale }],
          },
        ]}
      >
        <Image
          source={require("../../assets/images/welcome.png")}
          style={styles.laurelImage}
          contentFit="contain"
        />
      </Animated.View>

      {/* Review Cards */}
      <View style={styles.cardsContainer}>
        {REVIEWS.map((review, index) => (
          <Animated.View
            key={review.id}
            style={[
              styles.reviewCard,
              {
                opacity: cardAnimations[index].opacity,
                transform: [{ translateY: cardAnimations[index].translateY }],
              },
            ]}
          >
            {/* Header row: Avatar, Name, Stars */}
            <View style={styles.cardHeader}>
              <View style={styles.userInfo}>
                <Image
                  source={review.image}
                  style={styles.avatar}
                  contentFit="cover"
                />
                <Text style={styles.userName}>{review.name}</Text>
              </View>
              <StarRating rating={5} />
            </View>

            {/* Review text */}
            <Text style={styles.reviewText}>
              {i18n.t(review.review)}
            </Text>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    alignItems: "center",
    paddingHorizontal: 0,
    paddingBottom: spacing[4],
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: spacing[4],
  },
  laurelImage: {
    width: 160,
    height: 60,
  },
  cardsContainer: {
    width: "100%",
    gap: spacing[3],
  },
  reviewCard: {
    width: "100%",
    backgroundColor: "rgba(22, 26, 34, 0.85)",
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.rgba.primary30,
    padding: spacing[4],
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[3],
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.sizes.lg,
    color: colors.foreground,
  },
  starsContainer: {
    flexDirection: "row",
    gap: 2,
  },
  reviewText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
});

export default UserReviewsCard;
