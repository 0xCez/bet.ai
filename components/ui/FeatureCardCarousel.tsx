import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CONTAINER_PADDING = spacing[4];
const PAGE_GAP = spacing[4]; // Gap between pages
const PAGE_WIDTH = SCREEN_WIDTH - CONTAINER_PADDING * 2;

// Map icon types to Ionicons names (ai-analysis uses custom BrainIcon)
const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  "market-intel": "trending-up",
  "x-factors": "flash",
  "team-stats": "shield",
  "player-stats": "person",
  "expert-chat": "chatbubble-ellipses",
};

interface FeatureCard {
  title: string;
  description: string;
  icon: "ai-analysis" | "market-intel" | "x-factors" | "team-stats" | "player-stats" | "expert-chat";
}

interface FeatureCardCarouselProps {
  features: FeatureCard[];
}

export const FeatureCardCarousel: React.FC<FeatureCardCarouselProps> = ({ features }) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = Math.ceil(features.length / 3);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(contentOffsetX / (PAGE_WIDTH + PAGE_GAP));
    setCurrentPage(page);
  };

  // Split features into pages of 3
  const pages: FeatureCard[][] = [];
  for (let i = 0; i < features.length; i += 3) {
    pages.push(features.slice(i, i + 3));
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToOffsets={pages.map((_, i) => i * (PAGE_WIDTH + PAGE_GAP))}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
      >
        {pages.map((pageFeatures, pageIndex) => (
          <View key={pageIndex} style={styles.page}>
            {pageFeatures.map((feature, index) => (
              <View style={styles.featureCard} key={`${pageIndex}-${index}`}>
                <View style={styles.featureItem}>
                  <View style={styles.iconContainer}>
                    {feature.icon === "ai-analysis" ? (
                      <MaterialCommunityIcons
                        name="robot-outline"
                        size={19}
                        color={colors.primaryForeground}
                      />
                    ) : (
                      <Ionicons
                        name={iconMap[feature.icon] || "sparkles"}
                        size={19}
                        color={colors.primaryForeground}
                      />
                    )}
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{feature.title}</Text>
                    <Text style={styles.featureDescription}>
                      {feature.description}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Pagination dots */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          {Array.from({ length: totalPages }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentPage === index && styles.activeDot,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: spacing[4],
    marginBottom: spacing[2],
  },
  scrollContent: {
    gap: PAGE_GAP,
  },
  page: {
    width: PAGE_WIDTH,
    gap: spacing[3],
  },
  featureCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    paddingHorizontal: spacing[3],
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[4],
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    marginBottom: 4,
    fontFamily: typography.fontFamily.medium,
  },
  featureDescription: {
    color: colors.mutedForeground,
    lineHeight: 18,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.light,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing[4],
    gap: spacing[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  activeDot: {
    backgroundColor: colors.primary,
    width: 20,
  },
});

export default FeatureCardCarousel;
