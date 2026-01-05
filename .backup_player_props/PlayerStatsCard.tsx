import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { GradientProgressBar } from "./GradientProgressBar";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

// Note: teamLogo prop is available for future use (player headshots, etc.)

// ============================================================================
// TYPES
// ============================================================================

export interface NFLPlayerStats {
  name: string;
  position: string;
  teamName?: string;
  stats: {
    // QB stats
    passingYardsPerGame?: number;
    passingTouchdowns?: number;
    qbRating?: number;
    longestPass?: number;
    interceptions?: number;
    completionPercentage?: number;
    // RB/rushing stats
    rushingYardsPerGame?: number;
    rushingTouchdowns?: number;
    yardsPerCarry?: number;
    // WR/receiving stats
    receivingYardsPerGame?: number;
    receivingTouchdowns?: number;
    receptions?: number;
    targets?: number;
    yardsPerReception?: number;
    // Defense stats
    sacks?: number;
    tackles?: number;
    forcedFumbles?: number;
    defensiveInterceptions?: number;
  };
}

export interface NBAPlayerStats {
  name: string;
  position: string;
  teamName?: string;
  stats: {
    pointsPerGame?: number;
    reboundsPerGame?: number;
    assistsPerGame?: number;
    stealsPerGame?: number;
    blocksPerGame?: number;
    turnoversPerGame?: number;
    fieldGoalPct?: number;
    threePointPct?: number;
    freeThrowPct?: number;
    usagePercentage?: number;
    minutesPerGame?: number;
  };
}

export interface SoccerPlayerStats {
  name: string;
  position: string;
  teamName?: string;
  stats: {
    // Offensive stats
    goals?: number;
    assists?: number;
    goalsPerGame?: number;
    minutesPerGoal?: number;
    shotsOnTarget?: number;
    shotAccuracy?: number;
    keyPasses?: number;
    passAccuracy?: number;
    // Defensive stats
    tackles?: number;
    interceptions?: number;
    // Goalkeeper stats
    cleanSheets?: number;
    saves?: number;
    // Disciplinary
    yellowCards?: number;
    redCards?: number;
    // Time
    minutesPlayed?: number;
  };
}

type PlayerStats = NFLPlayerStats | NBAPlayerStats | SoccerPlayerStats;

interface PlayerStatsCardProps {
  player: PlayerStats;
  sport: "nfl" | "nba" | "soccer";
  teamLogo?: any;
  isExpanded: boolean;
  onToggle: () => void;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const StatGridItem: React.FC<{
  icon: string;
  label: string;
  value: string | number;
}> = ({ icon, label, value }) => (
  <View style={styles.statGridItem}>
    <View style={styles.statGridIconContainer}>
      <Ionicons name={icon as any} size={20} color={colors.primary} />
    </View>
    <View style={styles.statGridTextContainer}>
      <Text style={styles.statGridValue}>{value}</Text>
      <Text style={styles.statGridLabel}>{label}</Text>
    </View>
  </View>
);

const StatWithProgress: React.FC<{
  label: string;
  value: number;
  maxValue: number;
  suffix?: string;
  description?: string;
  animationKey?: string | number;
}> = ({ label, value, maxValue, suffix = "%", description, animationKey }) => (
  <View style={styles.statWithProgress}>
    <View style={styles.statWithProgressHeader}>
      <Text style={styles.statWithProgressLabel}>{label}</Text>
      <Text style={styles.statWithProgressValue}>{value.toFixed(1)}{suffix}</Text>
    </View>
    {description && <Text style={styles.statWithProgressDesc}>{description}</Text>}
    <GradientProgressBar value={value} maxValue={maxValue} animationKey={animationKey} />
  </View>
);

const StatPill: React.FC<{
  label: string;
  value: string | number;
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <View style={[styles.statPill, highlight && styles.statPillHighlight]}>
    <Text style={styles.statPillValue}>{value}</Text>
    <Text style={styles.statPillLabel}>{label}</Text>
  </View>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const PlayerStatsCard: React.FC<PlayerStatsCardProps> = ({
  player,
  sport,
  teamLogo: _teamLogo, // Reserved for future use
  isExpanded,
  onToggle,
}) => {
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rotateAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(expandAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // height/maxHeight can't use native driver
      }),
    ]).start();
  }, [isExpanded]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const expandedOpacity = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const expandedMaxHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 600], // max height for expanded content
  });

  // Get key stats based on sport and position
  const getKeyStats = () => {
    const stats = player.stats as any;

    if (sport === "nfl") {
      const isQB = player.position === "QB";
      const isRB = player.position === "RB";
      const isWR = player.position === "WR" || player.position === "TE";
      const isDefense = ["LB", "CB", "S", "DL", "DE", "DT"].includes(player.position);

      if (isQB) {
        return {
          primary: { label: "Pass YPG", value: (stats.passingYardsPerGame || 0).toFixed(1) },
          secondary: { label: "Pass TD", value: stats.passingTouchdowns || 0 },
          tertiary: { label: "Rating", value: (stats.qbRating || 0).toFixed(1) },
        };
      } else if (isRB) {
        return {
          primary: { label: "Rush YPG", value: (stats.rushingYardsPerGame || 0).toFixed(1) },
          secondary: { label: "Rush TD", value: stats.rushingTouchdowns || 0 },
          tertiary: { label: "Rec", value: stats.receptions || 0 },
        };
      } else if (isWR) {
        return {
          primary: { label: "Rec YPG", value: (stats.receivingYardsPerGame || 0).toFixed(1) },
          secondary: { label: "Rec TD", value: stats.receivingTouchdowns || 0 },
          tertiary: { label: "Rec", value: stats.receptions || 0 },
        };
      } else if (isDefense) {
        return {
          primary: { label: "Tackles", value: stats.tackles || 0 },
          secondary: { label: "INT", value: stats.defensiveInterceptions || 0 },
          tertiary: { label: "FF", value: stats.forcedFumbles || 0 },
        };
      }
    } else if (sport === "nba") {
      return {
        primary: { label: "PPG", value: (stats.pointsPerGame || 0).toFixed(1) },
        secondary: { label: "RPG", value: (stats.reboundsPerGame || 0).toFixed(1) },
        tertiary: { label: "APG", value: (stats.assistsPerGame || 0).toFixed(1) },
      };
    } else if (sport === "soccer") {
      const isGoalkeeper = player.position === "GK";
      if (isGoalkeeper) {
        return {
          primary: { label: "Saves", value: stats.saves || 0 },
          secondary: { label: "CS", value: stats.cleanSheets || 0 },
          tertiary: { label: "Min", value: stats.minutesPlayed || 0 },
        };
      }
      return {
        primary: { label: "Goals", value: stats.goals || 0 },
        secondary: { label: "Assists", value: stats.assists || 0 },
        tertiary: { label: "Min", value: stats.minutesPlayed || 0 },
      };
    }

    return {
      primary: { label: "-", value: "-" },
      secondary: { label: "-", value: "-" },
      tertiary: { label: "-", value: "-" },
    };
  };

  const keyStats = getKeyStats();

  // Render expanded stats based on sport
  const renderExpandedStats = () => {
    const stats = player.stats as any;

    if (sport === "nfl") {
      const isQB = player.position === "QB";
      const isRB = player.position === "RB";
      const isWR = player.position === "WR" || player.position === "TE";

      if (isQB) {
        return (
          <View style={styles.expandedContainer}>
            {/* QB Rating Progress */}
            <StatWithProgress
              label="QB Rating"
              value={stats.qbRating || 0}
              maxValue={158.3}
              suffix=""
              description="Out of 158.3 max rating"
              animationKey={isExpanded ? 'expanded' : 'collapsed'}
            />

            {/* Completion % Progress */}
            {stats.completionPercentage > 0 && (
              <StatWithProgress
                label="Completion %"
                value={stats.completionPercentage || 0}
                maxValue={100}
                description="Passes completed"
                animationKey={isExpanded ? 'expanded' : 'collapsed'}
              />
            )}

            {/* Core KPIs Grid */}
            <Text style={styles.sectionTitle}>Core Stats</Text>
            <View style={styles.statGrid}>
              <StatGridItem
                icon="american-football-outline"
                label="Pass YPG"
                value={(stats.passingYardsPerGame || 0).toFixed(1)}
              />
              <StatGridItem
                icon="locate-outline"
                label="Pass TD"
                value={stats.passingTouchdowns || 0}
              />
              <StatGridItem
                icon="flash-outline"
                label="Rush YPG"
                value={(stats.rushingYardsPerGame || 0).toFixed(1)}
              />
              <StatGridItem
                icon="footsteps-outline"
                label="Rush TD"
                value={stats.rushingTouchdowns || 0}
              />
              <StatGridItem
                icon="arrow-up-outline"
                label="Longest"
                value={`${stats.longestPass || 0} yds`}
              />
              <StatGridItem
                icon="warning-outline"
                label="Sacks"
                value={stats.sacks || 0}
              />
            </View>
          </View>
        );
      } else if (isRB) {
        return (
          <View style={styles.expandedContainer}>
            <Text style={styles.sectionTitle}>Rushing Stats</Text>
            <View style={styles.statGrid}>
              <StatGridItem
                icon="footsteps-outline"
                label="Rush YPG"
                value={(stats.rushingYardsPerGame || 0).toFixed(1)}
              />
              <StatGridItem
                icon="flash-outline"
                label="Rush TD"
                value={stats.rushingTouchdowns || 0}
              />
              <StatGridItem
                icon="speedometer-outline"
                label="Yds/Carry"
                value={(stats.yardsPerCarry || 0).toFixed(1)}
              />
              <StatGridItem
                icon="hand-left-outline"
                label="Receptions"
                value={stats.receptions || 0}
              />
              <StatGridItem
                icon="analytics-outline"
                label="Rec YPG"
                value={(stats.receivingYardsPerGame || 0).toFixed(1)}
              />
              <StatGridItem
                icon="american-football-outline"
                label="Rec TD"
                value={stats.receivingTouchdowns || 0}
              />
            </View>
          </View>
        );
      } else if (isWR) {
        return (
          <View style={styles.expandedContainer}>
            <Text style={styles.sectionTitle}>Receiving Stats</Text>
            <View style={styles.statGrid}>
              <StatGridItem
                icon="analytics-outline"
                label="Rec YPG"
                value={(stats.receivingYardsPerGame || 0).toFixed(1)}
              />
              <StatGridItem
                icon="american-football-outline"
                label="Rec TD"
                value={stats.receivingTouchdowns || 0}
              />
              <StatGridItem
                icon="hand-left-outline"
                label="Receptions"
                value={stats.receptions || 0}
              />
              <StatGridItem
                icon="radio-outline"
                label="Targets"
                value={stats.targets || 0}
              />
              <StatGridItem
                icon="speedometer-outline"
                label="Yds/Rec"
                value={(stats.yardsPerReception || 0).toFixed(1)}
              />
            </View>
          </View>
        );
      } else {
        // Defense
        return (
          <View style={styles.expandedContainer}>
            <Text style={styles.sectionTitle}>Defensive Stats</Text>
            <View style={styles.statGrid}>
              <StatGridItem
                icon="shield-outline"
                label="Tackles"
                value={stats.tackles || 0}
              />
              <StatGridItem
                icon="hand-right-outline"
                label="INT"
                value={stats.defensiveInterceptions || 0}
              />
              <StatGridItem
                icon="alert-outline"
                label="Forced Fum"
                value={stats.forcedFumbles || 0}
              />
              <StatGridItem
                icon="warning-outline"
                label="Sacks"
                value={stats.sacks || 0}
              />
            </View>
          </View>
        );
      }
    } else if (sport === "nba") {
      return (
        <View style={styles.expandedContainer}>
          {/* Shooting Progress Bars */}
          <StatWithProgress
            label="Field Goal %"
            value={stats.fieldGoalPct || 0}
            maxValue={100}
            description="Shots scored"
            animationKey={isExpanded ? 'expanded' : 'collapsed'}
          />
          <StatWithProgress
            label="3-Point %"
            value={stats.threePointPct || 0}
            maxValue={100}
            description="3PT shots made"
            animationKey={isExpanded ? 'expanded' : 'collapsed'}
          />
          <StatWithProgress
            label="Free Throw %"
            value={stats.freeThrowPct || 0}
            maxValue={100}
            description="Free throws made"
            animationKey={isExpanded ? 'expanded' : 'collapsed'}
          />
          {stats.usagePercentage > 0 && (
            <StatWithProgress
              label="Usage Rate"
              value={stats.usagePercentage || 0}
              maxValue={100}
              description="Ball possession"
              animationKey={isExpanded ? 'expanded' : 'collapsed'}
            />
          )}

          {/* Core KPIs Grid */}
          <Text style={styles.sectionTitle}>Core Stats</Text>
          <View style={styles.statGrid}>
            <StatGridItem
              icon="basketball-outline"
              label="PPG"
              value={(stats.pointsPerGame || 0).toFixed(1)}
            />
            <StatGridItem
              icon="resize-outline"
              label="RPG"
              value={(stats.reboundsPerGame || 0).toFixed(1)}
            />
            <StatGridItem
              icon="swap-horizontal-outline"
              label="APG"
              value={(stats.assistsPerGame || 0).toFixed(1)}
            />
            <StatGridItem
              icon="hand-left-outline"
              label="SPG"
              value={(stats.stealsPerGame || 0).toFixed(1)}
            />
            <StatGridItem
              icon="stop-outline"
              label="BPG"
              value={(stats.blocksPerGame || 0).toFixed(1)}
            />
            <StatGridItem
              icon="alert-circle-outline"
              label="TOV"
              value={(stats.turnoversPerGame || 0).toFixed(1)}
            />
          </View>

          {/* Minutes */}
          {stats.minutesPerGame > 0 && (
            <View style={styles.minutesContainer}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.minutesText}>{(stats.minutesPerGame || 0).toFixed(1)} min/game</Text>
            </View>
          )}
        </View>
      );
    } else if (sport === "soccer") {
      const isGoalkeeper = player.position === "GK";

      if (isGoalkeeper) {
        return (
          <View style={styles.expandedContainer}>
            <Text style={styles.sectionTitle}>Goalkeeper Stats</Text>
            <View style={styles.statGrid}>
              <StatGridItem
                icon="save-outline"
                label="Saves"
                value={stats.saves || 0}
              />
              <StatGridItem
                icon="shield-checkmark-outline"
                label="Clean Sheets"
                value={stats.cleanSheets || 0}
              />
              <StatGridItem
                icon="time-outline"
                label="Minutes"
                value={stats.minutesPlayed || 0}
              />
            </View>
          </View>
        );
      }

      return (
        <View style={styles.expandedContainer}>
          {/* Accuracy Progress Bars */}
          {stats.shotAccuracy > 0 && (
            <StatWithProgress
              label="Shot Accuracy"
              value={stats.shotAccuracy || 0}
              maxValue={100}
              description="Shots on target"
              animationKey={isExpanded ? 'expanded' : 'collapsed'}
            />
          )}
          {stats.passAccuracy > 0 && (
            <StatWithProgress
              label="Pass Accuracy"
              value={stats.passAccuracy || 0}
              maxValue={100}
              description="Passes completed"
              animationKey={isExpanded ? 'expanded' : 'collapsed'}
            />
          )}

          {/* Core Stats Grid */}
          <Text style={styles.sectionTitle}>Offensive Stats</Text>
          <View style={styles.statGrid}>
            <StatGridItem
              icon="football-outline"
              label="Goals"
              value={stats.goals || 0}
            />
            <StatGridItem
              icon="git-branch-outline"
              label="Assists"
              value={stats.assists || 0}
            />
            <StatGridItem
              icon="stats-chart-outline"
              label="Goals/Game"
              value={(stats.goalsPerGame || 0).toFixed(2)}
            />
            <StatGridItem
              icon="time-outline"
              label="Min/Goal"
              value={stats.minutesPerGoal || 0}
            />
            <StatGridItem
              icon="locate-outline"
              label="Shots OT"
              value={stats.shotsOnTarget || 0}
            />
            <StatGridItem
              icon="swap-horizontal-outline"
              label="Key Passes"
              value={stats.keyPasses || 0}
            />
          </View>

          <Text style={styles.sectionTitle}>Defensive Stats</Text>
          <View style={styles.statGrid}>
            <StatGridItem
              icon="shield-outline"
              label="Tackles"
              value={stats.tackles || 0}
            />
            <StatGridItem
              icon="hand-right-outline"
              label="INT"
              value={stats.interceptions || 0}
            />
          </View>

          {/* Cards & Minutes */}
          <View style={styles.footerStats}>
            <View style={styles.cardsContainer}>
              <View style={[styles.cardBadge, styles.yellowCard]} />
              <Text style={styles.cardCount}>{stats.yellowCards || 0}</Text>
              <View style={[styles.cardBadge, styles.redCard]} />
              <Text style={styles.cardCount}>{stats.redCards || 0}</Text>
            </View>
            <View style={styles.minutesContainer}>
              <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
              <Text style={styles.minutesText}>{stats.minutesPlayed || 0} min</Text>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <Card style={styles.card}>
      <Pressable onPress={onToggle} style={styles.cardHeader}>
        {/* Player Info */}
        <View style={styles.playerInfo}>
          <View style={styles.playerAvatar}>
            <Text style={styles.playerInitials}>
              {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </Text>
          </View>
          <View style={styles.playerDetails}>
            <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
            <Text style={styles.playerPosition}>{player.position}</Text>
          </View>
        </View>

        {/* Chevron */}
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <Ionicons name="chevron-down" size={20} color={colors.mutedForeground} />
        </Animated.View>
      </Pressable>

      {/* Key Stats Pills (always visible) */}
      <View style={styles.keyStatsRow}>
        <StatPill label={keyStats.primary.label} value={keyStats.primary.value} highlight />
        <StatPill label={keyStats.secondary.label} value={keyStats.secondary.value} />
        <StatPill label={keyStats.tertiary.label} value={keyStats.tertiary.value} />
      </View>

      {/* Expanded Stats with smooth animation */}
      <Animated.View
        style={[
          styles.expandedWrapper,
          {
            maxHeight: expandedMaxHeight,
            opacity: expandedOpacity,
            overflow: 'hidden',
          }
        ]}
      >
        <View style={styles.divider} />
        {renderExpandedStats()}
      </Animated.View>
    </Card>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing[3],
    padding: spacing[3],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    flex: 1,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  playerInitials: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  playerPosition: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  keyStatsRow: {
    flexDirection: "row",
    marginTop: spacing[3],
    gap: spacing[2],
  },
  statPill: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    alignItems: "center",
  },
  statPillHighlight: {
    backgroundColor: colors.rgba.primary15,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  statPillValue: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statPillLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  expandedWrapper: {
    marginTop: spacing[3],
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing[3],
  },
  expandedContainer: {
    gap: spacing[3],
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  // Stat Grid
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing[2],
  },
  statGridItem: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing[2],
  },
  statGridIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.rgba.primary10,
    alignItems: "center",
    justifyContent: "center",
  },
  statGridTextContainer: {
    flex: 1,
  },
  statGridValue: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statGridLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  // Stat with Progress Bar
  statWithProgress: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    gap: spacing[1],
  },
  statWithProgressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statWithProgressLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
  },
  statWithProgressValue: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  statWithProgressDesc: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginBottom: spacing[1],
  },
  // Footer stats (cards, minutes)
  footerStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.rgba.white10,
  },
  cardsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  cardBadge: {
    width: 14,
    height: 18,
    borderRadius: 2,
  },
  yellowCard: {
    backgroundColor: "#FBBF24",
  },
  redCard: {
    backgroundColor: "#EF4444",
  },
  cardCount: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
    marginRight: spacing[2],
  },
  minutesContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  minutesText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
});

export default PlayerStatsCard;
