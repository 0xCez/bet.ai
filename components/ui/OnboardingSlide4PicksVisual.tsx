import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Image } from "react-native";
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

const PLAYER_IMAGES: Record<string, any> = {
  "Jayson Tatum": require("../../assets/images/nba-players/bos/jayson_tatum.png"),
  "Luka Doncic": require("../../assets/images/nba-players/lal/luka_doncic.png"),
  "Anthony Edwards": require("../../assets/images/nba-players/min/anthony_edwards.png"),
};

const BOOK_LOGOS: Record<string, any> = {
  DK: require("../../assets/images/Draftkings.png"),
  FD: require("../../assets/images/Fanduel.png"),
  ESPN: require("../../assets/images/Espnbet.png"),
};

const DEMO_PICKS = [
  {
    name: "Jayson Tatum",
    team: "BOS vs MIA",
    stat: "PTS",
    dir: "OVER",
    line: 27.5,
    odds: "-110",
    bk: "DK",
    l10: 90,
    szn: 82,
    ev: "+12.4",
    color: "#22C55E",
  },
  {
    name: "Luka Doncic",
    team: "LAL vs LAC",
    stat: "AST",
    dir: "OVER",
    line: 8.5,
    odds: "-125",
    bk: "FD",
    l10: 85,
    szn: 78,
    ev: "+9.7",
    color: "#22C55E",
  },
  {
    name: "Anthony Edwards",
    team: "MIN vs DEN",
    stat: "PTS",
    dir: "OVER",
    line: 24.5,
    odds: "-115",
    bk: "ESPN",
    l10: 95,
    szn: 85,
    ev: "+14.2",
    color: "#22C55E",
  },
];

interface AnimatedPickCardProps {
  pick: typeof DEMO_PICKS[0];
  index: number;
  isActive: boolean;
}

function AnimatedPickCard({ pick, index, isActive }: AnimatedPickCardProps) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(40);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    if (isActive) {
      opacity.value = 0;
      translateX.value = 40;
      scale.value = 0.9;

      const delay = 300 + index * 200;
      opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
      translateX.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 100 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 100 }));
    } else {
      opacity.value = 0;
      translateX.value = 40;
      scale.value = 0.9;
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
  }));

  const playerImg = PLAYER_IMAGES[pick.name];
  const bookLogo = BOOK_LOGOS[pick.bk];

  return (
    <Animated.View style={[styles.pickCard, animatedStyle]}>
      {/* Accent bar */}
      <View style={[styles.accentBar, { backgroundColor: pick.color }]} />
      <View style={styles.cardBody}>
        {/* Left: rows, Right: bookie (vertically centered) */}
        <View style={styles.cardInner}>
          <View style={styles.leftCol}>
            {/* Top: headshot + name/team */}
            <View style={styles.topRow}>
              <View style={[styles.headshotRing, { borderColor: `${pick.color}40` }]}>
                {playerImg ? (
                  <Image source={playerImg} style={styles.headshot} />
                ) : (
                  <Text style={styles.avatarText}>
                    {pick.name.split(" ").map(n => n[0]).join("")}
                  </Text>
                )}
              </View>
              <View style={styles.nameCol}>
                <Text style={styles.playerName}>{pick.name}</Text>
                <Text style={styles.teamText}>{pick.team}</Text>
              </View>
            </View>
            {/* Middle: dir + stat + line */}
            <View style={styles.midRow}>
              <View style={[styles.dirPill, { backgroundColor: `${pick.color}20` }]}>
                <Text style={[styles.dirText, { color: pick.color }]}>{pick.dir}</Text>
              </View>
              <Text style={styles.statText}>{pick.stat} {pick.line}</Text>
            </View>
            {/* Bottom: metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>L10</Text>
                <Text style={[styles.metricValue, { color: colors.success }]}>{pick.l10}%</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>SZN</Text>
                <Text style={[styles.metricValue, { color: colors.success }]}>{pick.szn}%</Text>
              </View>
              <View style={[styles.metricChip, styles.metricChipEV]}>
                <Text style={styles.metricLabel}>EV</Text>
                <Text style={[styles.metricValue, { color: colors.success }]}>{pick.ev}%</Text>
              </View>
            </View>
          </View>
          {/* Bookie: vertically centered */}
          <View style={styles.bookCol}>
            {bookLogo && (
              <Image source={bookLogo} style={styles.bookLogo} resizeMode="contain" />
            )}
            <Text style={styles.oddsText}>{pick.odds}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

interface OnboardingSlide4PicksVisualProps {
  isActive?: boolean;
}

export function OnboardingSlide4PicksVisual({ isActive = false }: OnboardingSlide4PicksVisualProps) {
  // Tab header animation
  const headerOpacity = useSharedValue(0);
  const headerY = useSharedValue(-15);

  useEffect(() => {
    if (isActive) {
      headerOpacity.value = 0;
      headerY.value = -15;
      headerOpacity.value = withDelay(100, withTiming(1, { duration: 400 }));
      headerY.value = withDelay(100, withSpring(0, { damping: 15, stiffness: 100 }));
    } else {
      headerOpacity.value = 0;
      headerY.value = -15;
    }
  }, [isActive]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Tab switcher mockup */}
      <Animated.View style={[styles.tabRow, headerStyle]}>
        <View style={[styles.tab, styles.tabActive]}>
          <Text style={[styles.tabText, styles.tabTextActive]}>Standard Lines</Text>
        </View>
        <View style={styles.tab}>
          <Text style={styles.tabText}>Alt Lines</Text>
        </View>
      </Animated.View>

      {/* Pick cards */}
      <View style={styles.cardsContainer}>
        {DEMO_PICKS.map((pick, index) => (
          <AnimatedPickCard key={index} pick={pick} index={index} isActive={isActive} />
        ))}
      </View>
    </View>
  );
}

const CARD_WIDTH = SCREEN_WIDTH * 0.94;

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.46,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: spacing[1],
  },
  // Tab switcher
  tabRow: {
    flexDirection: "row",
    width: CARD_WIDTH,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.lg,
    padding: 3,
    marginBottom: spacing[2],
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.card,
  },
  tabText: {
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.sizes.sm,
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.primary,
  },
  // Cards
  cardsContainer: {
    width: CARD_WIDTH,
    gap: 10,
  },
  pickCard: {
    flexDirection: "row",
    backgroundColor: "rgba(22, 26, 34, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  accentBar: {
    width: 3,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: spacing[2],
    paddingVertical: 7,
  },
  cardInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  leftCol: {
    flex: 1,
    gap: 4,
  },
  // Top row
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  headshotRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.secondary,
  },
  headshot: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  nameCol: {
    flex: 1,
    gap: 1,
  },
  playerName: {
    fontSize: 15,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  teamText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  bookCol: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingLeft: spacing[2],
  },
  bookLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  oddsText: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  // Middle row
  midRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  dirPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  dirText: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    letterSpacing: 0.5,
  },
  statText: {
    fontSize: 14,
    fontFamily: typography.fontFamily.semibold,
    color: colors.foreground,
  },
  // Metrics
  metricsRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  metricChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: `${colors.secondary}80`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  metricChipEV: {
    backgroundColor: "rgba(34,197,94,0.1)",
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
});

export default OnboardingSlide4PicksVisual;
