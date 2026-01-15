import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { createShimmerPlaceHolder } from "expo-shimmer-placeholder";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { TopBar } from "@/components/ui/TopBar";
import { TeamSelectorHeader } from "@/components/ui/TeamSelectorHeader";
import { usePageTransition } from "@/hooks/usePageTransition";
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import { usePageTracking } from "@/hooks/usePageTracking";
import { getNBATeamLogo, getNFLTeamLogo, getSoccerTeamLogo } from "@/utils/teamLogos";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius as radii, typography, shimmerColors } from "../constants/designTokens";
import { getPlayerProps as fetchPlayerPropsFromSGO } from "@/services/sgoApi";
import { getPropsFromFirestore, savePropsToFirestore } from "@/services/propsCache";

const ShimmerPlaceholder = createShimmerPlaceHolder(LinearGradient);

// Storage key prefix for persisted props
const PROPS_STORAGE_PREFIX = "@player_props_";

// In-memory cache for current session
let cachedPropsResult: PlayerPropsResult | null = null;
let cachedParams: any = null;

// Refresh cooldown tracking (10 minutes)
let lastRefreshTime: number = 0;
const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

interface PropLine {
  bookmaker: string;
  bookmakerKey: string;
  line: number;
  overOdds: number;
  underOdds: number;
}

// Single stat prop (e.g., Points O/U 19.5)
interface StatProp {
  statType: string; // e.g., "points", "rebounds", "passing_yards"
  statLabel: string; // e.g., "Points", "Rebounds", "Pass Yds"
  consensusLine: number;
  props: PropLine[];
  bestOver: { bookmaker: string; odds: number; line: number };
  bestUnder: { bookmaker: string; odds: number; line: number };
}

// Legacy single-stat format (for backward compatibility)
interface PlayerProp {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  photoUrl?: string;
  statType: string;
  statLabel: string;
  consensusLine: number;
  props: PropLine[];
  bestOver: { bookmaker: string; odds: number; line: number };
  bestUnder: { bookmaker: string; odds: number; line: number };
}

// Grouped player with all their stats
interface GroupedPlayerProps {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  stats: StatProp[];
}

interface PlayerPropsResult {
  sport: string;
  teams: {
    home: string;
    away: string;
    logos: { home: string; away: string };
  };
  playerProps: {
    team1: PlayerProp[];
    team2: PlayerProp[];
  };
  timestamp: string;
}

type PlayerPropsParams = {
  team1?: string;
  team2?: string;
  sport?: string;
  team1Logo?: string;
  team2Logo?: string;
  analysisId?: string;
  isDemo?: string;
};

// ============================================================================
// MOCK DATA
// ============================================================================

const generateMockPlayerProps = (
  team1: string,
  team2: string,
  sport: string
): PlayerPropsResult => {
  const isNFL = sport?.toLowerCase().includes("nfl");
  const isNBA = sport?.toLowerCase() === "nba";

  // NFL Mock Players
  const nflTeam1Players: PlayerProp[] = [
    {
      playerId: "jalen-hurts",
      playerName: "Jalen Hurts",
      team: team1,
      position: "QB",
      statType: "passing_yards",
      statLabel: "Pass Yds",
      consensusLine: 245.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 245.5, overOdds: -115, underOdds: -105 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 247.5, overOdds: -110, underOdds: -110 },
        { bookmaker: "BetMGM", bookmakerKey: "betmgm", line: 244.5, overOdds: -108, underOdds: -112 },
        { bookmaker: "Caesars", bookmakerKey: "caesars", line: 246.5, overOdds: -112, underOdds: -108 },
      ],
      bestOver: { bookmaker: "BetMGM", odds: -108, line: 244.5 },
      bestUnder: { bookmaker: "FanDuel", odds: -110, line: 247.5 },
    },
    {
      playerId: "jalen-hurts-rush",
      playerName: "Jalen Hurts",
      team: team1,
      position: "QB",
      statType: "rushing_yards",
      statLabel: "Rush Yds",
      consensusLine: 34.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 34.5, overOdds: -110, underOdds: -110 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 35.5, overOdds: -105, underOdds: -115 },
        { bookmaker: "BetMGM", bookmakerKey: "betmgm", line: 33.5, overOdds: -115, underOdds: -105 },
      ],
      bestOver: { bookmaker: "BetMGM", odds: -115, line: 33.5 },
      bestUnder: { bookmaker: "BetMGM", odds: -105, line: 33.5 },
    },
    {
      playerId: "saquon-barkley",
      playerName: "Saquon Barkley",
      team: team1,
      position: "RB",
      statType: "rushing_yards",
      statLabel: "Rush Yds",
      consensusLine: 89.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 89.5, overOdds: -112, underOdds: -108 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 91.5, overOdds: -105, underOdds: -115 },
        { bookmaker: "Pinnacle", bookmakerKey: "pinnacle", line: 88.5, overOdds: -107, underOdds: -107 },
      ],
      bestOver: { bookmaker: "FanDuel", odds: -105, line: 91.5 },
      bestUnder: { bookmaker: "Pinnacle", odds: -107, line: 88.5 },
    },
    {
      playerId: "aj-brown",
      playerName: "A.J. Brown",
      team: team1,
      position: "WR",
      statType: "receiving_yards",
      statLabel: "Rec Yds",
      consensusLine: 72.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 72.5, overOdds: -110, underOdds: -110 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 74.5, overOdds: -108, underOdds: -112 },
        { bookmaker: "BetMGM", bookmakerKey: "betmgm", line: 71.5, overOdds: -115, underOdds: -105 },
      ],
      bestOver: { bookmaker: "FanDuel", odds: -108, line: 74.5 },
      bestUnder: { bookmaker: "BetMGM", odds: -105, line: 71.5 },
    },
  ];

  const nflTeam2Players: PlayerProp[] = [
    {
      playerId: "dak-prescott",
      playerName: "Dak Prescott",
      team: team2,
      position: "QB",
      statType: "passing_yards",
      statLabel: "Pass Yds",
      consensusLine: 268.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 268.5, overOdds: -110, underOdds: -110 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 270.5, overOdds: -108, underOdds: -112 },
        { bookmaker: "BetMGM", bookmakerKey: "betmgm", line: 267.5, overOdds: -112, underOdds: -108 },
      ],
      bestOver: { bookmaker: "FanDuel", odds: -108, line: 270.5 },
      bestUnder: { bookmaker: "BetMGM", odds: -108, line: 267.5 },
    },
    {
      playerId: "ceedee-lamb",
      playerName: "CeeDee Lamb",
      team: team2,
      position: "WR",
      statType: "receiving_yards",
      statLabel: "Rec Yds",
      consensusLine: 84.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 84.5, overOdds: -115, underOdds: -105 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 86.5, overOdds: -110, underOdds: -110 },
        { bookmaker: "Pinnacle", bookmakerKey: "pinnacle", line: 83.5, overOdds: -108, underOdds: -108 },
      ],
      bestOver: { bookmaker: "Pinnacle", odds: -108, line: 83.5 },
      bestUnder: { bookmaker: "DraftKings", odds: -105, line: 84.5 },
    },
  ];

  // NBA Mock Players
  const nbaTeam1Players: PlayerProp[] = [
    {
      playerId: "lebron-james",
      playerName: "LeBron James",
      team: team1,
      position: "SF",
      statType: "points",
      statLabel: "Points",
      consensusLine: 25.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 25.5, overOdds: -112, underOdds: -108 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 26.5, overOdds: -105, underOdds: -115 },
        { bookmaker: "BetMGM", bookmakerKey: "betmgm", line: 25.5, overOdds: -110, underOdds: -110 },
      ],
      bestOver: { bookmaker: "FanDuel", odds: -105, line: 26.5 },
      bestUnder: { bookmaker: "DraftKings", odds: -108, line: 25.5 },
    },
    {
      playerId: "lebron-rebounds",
      playerName: "LeBron James",
      team: team1,
      position: "SF",
      statType: "rebounds",
      statLabel: "Rebounds",
      consensusLine: 7.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 7.5, overOdds: -115, underOdds: -105 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 7.5, overOdds: -110, underOdds: -110 },
      ],
      bestOver: { bookmaker: "FanDuel", odds: -110, line: 7.5 },
      bestUnder: { bookmaker: "DraftKings", odds: -105, line: 7.5 },
    },
    {
      playerId: "anthony-davis",
      playerName: "Anthony Davis",
      team: team1,
      position: "PF",
      statType: "points",
      statLabel: "Points",
      consensusLine: 27.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 27.5, overOdds: -108, underOdds: -112 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 28.5, overOdds: -110, underOdds: -110 },
        { bookmaker: "BetMGM", bookmakerKey: "betmgm", line: 27.5, overOdds: -105, underOdds: -115 },
      ],
      bestOver: { bookmaker: "BetMGM", odds: -105, line: 27.5 },
      bestUnder: { bookmaker: "DraftKings", odds: -112, line: 27.5 },
    },
  ];

  const nbaTeam2Players: PlayerProp[] = [
    {
      playerId: "kevin-durant",
      playerName: "Kevin Durant",
      team: team2,
      position: "SF",
      statType: "points",
      statLabel: "Points",
      consensusLine: 28.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 28.5, overOdds: -110, underOdds: -110 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 29.5, overOdds: -108, underOdds: -112 },
        { bookmaker: "Pinnacle", bookmakerKey: "pinnacle", line: 28.5, overOdds: -106, underOdds: -106 },
      ],
      bestOver: { bookmaker: "Pinnacle", odds: -106, line: 28.5 },
      bestUnder: { bookmaker: "Pinnacle", odds: -106, line: 28.5 },
    },
    {
      playerId: "devin-booker",
      playerName: "Devin Booker",
      team: team2,
      position: "SG",
      statType: "points",
      statLabel: "Points",
      consensusLine: 26.5,
      props: [
        { bookmaker: "DraftKings", bookmakerKey: "draftkings", line: 26.5, overOdds: -112, underOdds: -108 },
        { bookmaker: "FanDuel", bookmakerKey: "fanduel", line: 27.5, overOdds: -105, underOdds: -115 },
      ],
      bestOver: { bookmaker: "FanDuel", odds: -105, line: 27.5 },
      bestUnder: { bookmaker: "DraftKings", odds: -108, line: 26.5 },
    },
  ];

  return {
    sport: sport || "NFL",
    teams: {
      home: team1,
      away: team2,
      logos: { home: "", away: "" },
    },
    playerProps: {
      team1: isNBA ? nbaTeam1Players : nflTeam1Players,
      team2: isNBA ? nbaTeam2Players : nflTeam2Players,
    },
    timestamp: new Date().toISOString(),
  };
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getBookmakerLogo = (bookmakerName?: string) => {
  if (!bookmakerName) return require("../assets/images/logo.png");

  const logoMap: { [key: string]: any } = {
    'DraftKings': require("../assets/images/Draftkings.png"),
    'FanDuel': require("../assets/images/Fanduel.png"),
    'BetMGM': require("../assets/images/Betmgm.png"),
    'Pinnacle': require("../assets/images/Pinaccle.png"),
    'Caesars': require("../assets/images/Caesars.png"),
    'BetRivers': require("../assets/images/Betrivers.png"),
    'ESPN BET': require("../assets/images/Espnbet.png"),
  };

  return logoMap[bookmakerName] || require("../assets/images/logo.png");
};

const formatOdds = (odds: number): string => {
  if (odds >= 0) return `+${odds}`;
  return `${odds}`;
};

const getTeamLogo = (teamName: string, sport?: string) => {
  if (!sport || !teamName) return require("../assets/images/logo.png");

  switch (sport.toLowerCase()) {
    case 'nba':
      return getNBATeamLogo(teamName);
    case 'nfl':
      return getNFLTeamLogo(teamName);
    case 'soccer':
    case 'football':
      return getSoccerTeamLogo(teamName);
    default:
      return require("../assets/images/logo.png");
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Group PlayerProps by player name into GroupedPlayerProps
const groupPropsByPlayer = (props: PlayerProp[]): GroupedPlayerProps[] => {
  const grouped: { [key: string]: GroupedPlayerProps } = {};

  for (const prop of props) {
    if (!grouped[prop.playerName]) {
      grouped[prop.playerName] = {
        playerId: prop.playerName.replace(/\s+/g, '_').toLowerCase(),
        playerName: prop.playerName,
        team: prop.team,
        position: prop.position,
        stats: [],
      };
    }

    grouped[prop.playerName].stats.push({
      statType: prop.statType,
      statLabel: prop.statLabel,
      consensusLine: prop.consensusLine,
      props: prop.props,
      bestOver: prop.bestOver,
      bestUnder: prop.bestUnder,
    });
  }

  return Object.values(grouped);
};

// ============================================================================
// COMPONENTS
// ============================================================================

// Single stat row within a player card
const StatRow: React.FC<{
  stat: StatProp;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ stat, isExpanded, onToggle }) => {
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(rotateAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(expandAnim, {
        toValue: isExpanded ? 1 : 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [isExpanded]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const expandedMaxHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 300],
  });

  const expandedOpacity = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={styles.statRowContainer}>
      <Pressable onPress={onToggle} style={styles.statRowHeader}>
        <View style={styles.statRowLeft}>
          <Text style={styles.statLabel}>{stat.statLabel}</Text>
          <Text style={styles.statConsensusBadge}>{stat.consensusLine}</Text>
        </View>
        <View style={styles.statRowRight}>
          <View style={styles.bestOddsCompact}>
            <View style={styles.bestOddItem}>
              <Text style={styles.bestOddLabel}>O</Text>
              <Image source={getBookmakerLogo(stat.bestOver.bookmaker)} style={styles.tinyBookLogo} />
              <Text style={styles.bestOddValue}>{formatOdds(stat.bestOver.odds)}</Text>
            </View>
            <View style={styles.bestOddItem}>
              <Text style={styles.bestOddLabel}>U</Text>
              <Image source={getBookmakerLogo(stat.bestUnder.bookmaker)} style={styles.tinyBookLogo} />
              <Text style={styles.bestOddValue}>{formatOdds(stat.bestUnder.odds)}</Text>
            </View>
          </View>
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
          </Animated.View>
        </View>
      </Pressable>

      {/* Expanded bookmaker lines - only render when expanded to avoid padding taking space */}
      {isExpanded && (
        <Animated.View
          style={[
            styles.statExpandedContent,
            { maxHeight: expandedMaxHeight, opacity: expandedOpacity, overflow: 'hidden', marginTop: spacing[2] }
          ]}
        >
          {stat.props.map((line, idx) => (
          <View key={idx} style={styles.bookmakerRow}>
            <View style={styles.bookmakerInfo}>
              <Image source={getBookmakerLogo(line.bookmaker)} style={styles.bookLogo} />
              <Text style={styles.bookmakerName}>{line.bookmaker}</Text>
            </View>
            <View style={styles.lineValues}>
              <Text style={styles.lineNumber}>{line.line}</Text>
              <View style={styles.oddsContainer}>
                <View style={styles.oddsPill}>
                  <Text style={styles.oddsLabel}>O</Text>
                  <Text style={styles.oddsValue}>{formatOdds(line.overOdds)}</Text>
                </View>
                <View style={[styles.oddsPill, styles.oddsPillUnder]}>
                  <Text style={styles.oddsLabel}>U</Text>
                  <Text style={styles.oddsValue}>{formatOdds(line.underOdds)}</Text>
                </View>
              </View>
            </View>
          </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
};

// Player card containing all their stats
const PlayerPropsCard: React.FC<{
  player: GroupedPlayerProps;
}> = ({ player }) => {
  const [expandedStats, setExpandedStats] = useState<{ [key: string]: boolean }>({});

  const toggleStat = (statType: string) => {
    setExpandedStats(prev => ({ ...prev, [statType]: !prev[statType] }));
  };

  return (
    <Card style={styles.propCard}>
      {/* Player Header */}
      <View style={styles.playerHeader}>
        <View style={styles.playerInfo}>
          <View style={styles.playerAvatar}>
            <Text style={styles.playerInitials}>
              {player.playerName.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </Text>
          </View>
          <View style={styles.playerDetails}>
            <Text style={styles.playerName}>{player.playerName}</Text>
            <Text style={styles.playerPosition}>
              {player.position ? `${player.position} • ` : ''}{player.stats.length} prop{player.stats.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats List */}
      <View style={styles.statsContainer}>
        {player.stats.map((stat, idx) => (
          <React.Fragment key={stat.statType}>
            {idx > 0 && <View style={styles.statDivider} />}
            <StatRow
              stat={stat}
              isExpanded={expandedStats[stat.statType] || false}
              onToggle={() => toggleStat(stat.statType)}
            />
          </React.Fragment>
        ))}
      </View>
    </Card>
  );
};

// Team section with all player props grouped by player
const TeamPropsSection: React.FC<{
  props: PlayerProp[];
  sport?: string;
}> = ({ props }) => {
  // Group props by player
  const groupedPlayers = groupPropsByPlayer(props);

  return (
    <View style={styles.teamSection}>
      {groupedPlayers.map((player) => (
        <PlayerPropsCard key={player.playerId} player={player} />
      ))}
    </View>
  );
};

// Loading skeleton
const LoadingSkeleton: React.FC = () => (
  <View style={styles.skeletonContainer}>
    {[1, 2, 3, 4].map((i) => (
      <View key={i} style={styles.skeletonCard}>
        <ShimmerPlaceholder
          style={styles.skeletonAvatar}
          shimmerColors={shimmerColors}
        />
        <View style={styles.skeletonContent}>
          <ShimmerPlaceholder
            style={styles.skeletonTitle}
            shimmerColors={shimmerColors}
          />
          <ShimmerPlaceholder
            style={styles.skeletonSubtitle}
            shimmerColors={shimmerColors}
          />
        </View>
      </View>
    ))}
  </View>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Helper to generate storage key from params
const getStorageKey = (team1: string, team2: string, sport: string, analysisId?: string): string => {
  // If we have an analysisId, use that for unique identification
  if (analysisId) {
    return `${PROPS_STORAGE_PREFIX}${analysisId}`;
  }
  // Otherwise, create a key from team names and sport
  const sanitize = (s: string) => s.toLowerCase().replace(/\s+/g, '_');
  return `${PROPS_STORAGE_PREFIX}${sanitize(team1)}_${sanitize(team2)}_${sanitize(sport)}`;
};

export default function PlayerPropsScreen() {
  const params = useLocalSearchParams<PlayerPropsParams>();
  const { animatedStyle } = usePageTransition(false);
  const { isSubscribed } = useRevenueCatPurchases();

  usePageTracking({
    pageName: 'player_props',
    metadata: {
      team1: params.team1,
      team2: params.team2,
      sport: params.sport,
      analysisId: params.analysisId,
      isDemo: params.isDemo === 'true',
    },
  });

  // Check in-memory cache
  const isSameAnalysis =
    cachedParams?.team1 === params.team1 &&
    cachedParams?.team2 === params.team2 &&
    cachedParams?.sport === params.sport;

  if (!isSameAnalysis) {
    cachedParams = { ...params };
  }

  const [isLoading, setIsLoading] = useState(!isSameAnalysis || !cachedPropsResult);
  const [propsData, setPropsData] = useState<PlayerPropsResult | null>(
    isSameAnalysis ? cachedPropsResult : null
  );
  const [activeTeam, setActiveTeam] = useState<"team1" | "team2">("team1");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldownMessage, setCooldownMessage] = useState<string | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const hasInitializedRef = useRef(false);

  // Staggered animation
  const cardAnimations = useRef(
    Array.from({ length: 6 }, () => new Animated.Value(0))
  ).current;

  const animateIn = useCallback(() => {
    cardAnimations.forEach((anim) => anim.setValue(0));
    const animations = cardAnimations.map((anim, index) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        delay: index * 80,
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();
  }, [cardAnimations]);

  const getAnimatedStyle = (index: number) => ({
    opacity: cardAnimations[Math.min(index, cardAnimations.length - 1)],
    transform: [
      {
        translateY: cardAnimations[Math.min(index, cardAnimations.length - 1)].interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  });

  // Shake animation for cooldown feedback
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Save props to persistent storage
  const savePropsToStorage = async (data: PlayerPropsResult) => {
    try {
      const key = getStorageKey(
        params.team1 || "",
        params.team2 || "",
        params.sport || "",
        params.analysisId
      );
      await AsyncStorage.setItem(key, JSON.stringify(data));
      console.log('[PlayerProps] Saved to AsyncStorage:', key);
    } catch (error) {
      console.error('[PlayerProps] Error saving to storage:', error);
    }
  };

  // Load props from persistent storage
  const loadPropsFromStorage = async (): Promise<PlayerPropsResult | null> => {
    try {
      const key = getStorageKey(
        params.team1 || "",
        params.team2 || "",
        params.sport || "",
        params.analysisId
      );
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        console.log('[PlayerProps] Loaded from AsyncStorage:', key);
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[PlayerProps] Error loading from storage:', error);
    }
    return null;
  };

  // Fetch fresh data from API
  const fetchFromAPI = async (): Promise<PlayerPropsResult | null> => {
    try {
      const sgoData = await fetchPlayerPropsFromSGO(
        params.team1 || "",
        params.team2 || "",
        params.sport || "NFL"
      );

      if (sgoData && (sgoData.playerProps.team1.length > 0 || sgoData.playerProps.team2.length > 0)) {
        const propsResult: PlayerPropsResult = {
          sport: sgoData.sport,
          teams: {
            home: sgoData.teams.home,
            away: sgoData.teams.away,
            logos: sgoData.teams.logos,
          },
          playerProps: {
            team1: sgoData.playerProps.team1,
            team2: sgoData.playerProps.team2,
          },
          timestamp: sgoData.timestamp,
        };
        return propsResult;
      }
    } catch (error) {
      console.error('[PlayerProps] API fetch error:', error);
    }
    return null;
  };

  // Refresh handler with cooldown
  const handleRefresh = async () => {
    // Disable refresh in demo mode
    if (params.isDemo === 'true') {
      triggerShake();
      setCooldownMessage('Unavailable in demo mode');
      setTimeout(() => setCooldownMessage(null), 3000);
      return;
    }

    // Check cooldown
    const now = Date.now();
    const timeElapsed = now - lastRefreshTime;
    const remainingTime = Math.ceil((REFRESH_COOLDOWN_MS - timeElapsed) / 1000 / 60);

    if (lastRefreshTime > 0 && timeElapsed < REFRESH_COOLDOWN_MS) {
      triggerShake();
      setCooldownMessage(`Try again in ${remainingTime} min${remainingTime > 1 ? 's' : ''}`);
      setTimeout(() => setCooldownMessage(null), 3000);
      return;
    }

    setIsRefreshing(true);
    console.log('[PlayerProps] Refreshing from API...');

    const freshData = await fetchFromAPI();

    if (freshData) {
      // Update state, cache, and storage (both local and Firestore)
      setPropsData(freshData);
      cachedPropsResult = freshData;
      await Promise.all([
        savePropsToStorage(freshData),
        savePropsToFirestore(
          params.team1 || "",
          params.team2 || "",
          params.sport || "NFL",
          freshData
        ),
      ]);
      lastRefreshTime = Date.now();
      console.log('[PlayerProps] Refreshed with fresh API data and cached');
    } else {
      // API returned no data (game probably over)
      setCooldownMessage('No live data available');
      setTimeout(() => setCooldownMessage(null), 3000);
    }

    setIsRefreshing(false);
    animateIn();
  };

  // Load data: try local storage → Firestore → API
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const loadPlayerProps = async () => {
      // If already have in-memory cache for this analysis, use it
      if (isSameAnalysis && cachedPropsResult) {
        animateIn();
        return;
      }

      setIsLoading(true);

      // 1. Try to load from local AsyncStorage first (fastest)
      const storedData = await loadPropsFromStorage();
      if (storedData) {
        setPropsData(storedData);
        cachedPropsResult = storedData;
        setIsLoading(false);
        animateIn();
        console.log('[PlayerProps] Using persisted data from local storage');
        return;
      }

      // 2. Try Firestore shared cache (other users may have fetched this game)
      const firestoreData = await getPropsFromFirestore(
        params.team1 || "",
        params.team2 || "",
        params.sport || "NFL"
      );
      if (firestoreData) {
        setPropsData(firestoreData);
        cachedPropsResult = firestoreData;
        await savePropsToStorage(firestoreData); // Save locally too
        setIsLoading(false);
        animateIn();
        console.log('[PlayerProps] Using shared Firestore cache');
        return;
      }

      // 3. No cached data anywhere, fetch from API
      const apiData = await fetchFromAPI();
      if (apiData) {
        setPropsData(apiData);
        cachedPropsResult = apiData;
        // Save to both local storage AND Firestore for other users
        await Promise.all([
          savePropsToStorage(apiData),
          savePropsToFirestore(
            params.team1 || "",
            params.team2 || "",
            params.sport || "NFL",
            apiData
          ),
        ]);
        console.log('[PlayerProps] Loaded fresh data from API and cached');
      } else {
        // 4. API also returned nothing, use mock as last resort
        console.log('[PlayerProps] No data available, using mock');
        const mockData = generateMockPlayerProps(
          params.team1 || "Team 1",
          params.team2 || "Team 2",
          params.sport || "NFL"
        );
        setPropsData(mockData);
        cachedPropsResult = mockData;
      }

      setIsLoading(false);
      animateIn();
    };

    loadPlayerProps();
  }, [params.team1, params.team2, params.sport, params.analysisId]);

  const team1Logo = getTeamLogo(params.team1 || "", params.sport);
  const team2Logo = getTeamLogo(params.team2 || "", params.sport);

  return (
    <ScreenBackground hideBg>
      <TopBar
        title="Player Props"
        showBack={true}
      />

      {/* Sticky Team Selector Header */}
      <TeamSelectorHeader
        team1Name={params.team1 || ""}
        team2Name={params.team2 || ""}
        team1Logo={team1Logo}
        team2Logo={team2Logo}
        activeTeam={activeTeam}
        onTeamChange={setActiveTeam}
        sticky
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : propsData ? (
          <Animated.View style={getAnimatedStyle(0)}>
            <TeamPropsSection
              props={activeTeam === "team1" ? propsData.playerProps.team1 : propsData.playerProps.team2}
              sport={params.sport}
            />
          </Animated.View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="analytics-outline" size={48} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No player props available</Text>
          </View>
        )}

        {/* Refresh Button */}
        {!isLoading && (
          <View style={styles.refreshContainer}>
            <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
              <Pressable
                style={[styles.refreshButton, isRefreshing && styles.refreshButtonDisabled]}
                onPress={handleRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Text style={styles.refreshButtonText}>Refreshing...</Text>
                ) : (
                  <>
                    <Ionicons name="refresh" size={16} color={colors.primaryForeground} />
                    <Text style={styles.refreshButtonText}>Refresh Props</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>
            {cooldownMessage && (
              <Text style={styles.cooldownMessage}>{cooldownMessage}</Text>
            )}
          </View>
        )}

        {/* Bottom spacing for nav */}
        <View style={{ height: 150 }} />
      </ScrollView>

      <FloatingBottomNav
        activeTab="props"
        analysisData={{
          team1: params.team1,
          team2: params.team2,
          sport: params.sport,
          team1Logo: params.team1Logo,
          team2Logo: params.team2Logo,
          analysisId: params.analysisId,
          isDemo: params.isDemo === "true",
        }}
        isSubscribed={isSubscribed}
      />
    </ScreenBackground>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing[4],
  },
  teamSection: {
    gap: spacing[3],
  },
  propCard: {
    paddingTop: spacing[3],
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[2],
  },
  propCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
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
    gap: 2,
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
  consensusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  consensusLine: {
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  bestLinesRow: {
    flexDirection: "row",
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bestLineItem: {
    flex: 1,
    alignItems: "center",
    gap: spacing[1],
  },
  bestLineDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing[2],
  },
  bestLineLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  bestLineValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  miniBookLogo: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  bestLineOdds: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  expandedContent: {
    marginTop: spacing[3],
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing[3],
  },
  allLinesTitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    marginBottom: spacing[2],
  },
  bookmakerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.rgba.white10,
  },
  bookmakerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  bookLogo: {
    width: 24,
    height: 24,
    borderRadius: 4,
  },
  bookmakerName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.foreground,
  },
  lineValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  lineNumber: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    minWidth: 45,
    textAlign: "right",
  },
  oddsContainer: {
    flexDirection: "row",
    gap: spacing[1],
  },
  oddsPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.rgba.primary15,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.sm,
    gap: 4,
  },
  oddsPillUnder: {
    backgroundColor: colors.rgba.white10,
  },
  oddsLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  oddsValue: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[12],
    gap: spacing[3],
  },
  emptyText: {
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },
  skeletonContainer: {
    gap: spacing[3],
  },
  skeletonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: spacing[4],
    borderRadius: radii.lg,
    gap: spacing[3],
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  skeletonContent: {
    flex: 1,
    gap: spacing[2],
  },
  skeletonTitle: {
    width: "60%",
    height: 16,
    borderRadius: radii.sm,
  },
  skeletonSubtitle: {
    width: "40%",
    height: 12,
    borderRadius: radii.sm,
  },
  // New grouped player card styles
  playerHeader: {
    marginBottom: spacing[2],
  },
  statsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  statDivider: {
    height: 1,
    backgroundColor: colors.rgba.white10,
    marginVertical: 6,
  },
  statRowContainer: {
    // No extra padding - divider handles spacing
  },
  statRowHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  statRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing[2],
  },
  statRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  statLabel: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
    flex: 1,
  },
  statConsensusBadge: {
    fontSize: typography.sizes.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
    marginLeft: spacing[2],
  },
  bestOddsCompact: {
    flexDirection: "row",
    gap: spacing[2],
  },
  bestOddItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.rgba.white10,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.sm,
  },
  bestOddLabel: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  bestOddValue: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
  },
  tinyBookLogo: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  statExpandedContent: {
    backgroundColor: colors.rgba.glassLight,
    borderRadius: radii.md,
    padding: spacing[3],
  },
  // Refresh button styles
  refreshContainer: {
    alignItems: "center",
    marginTop: spacing[6],
    marginBottom: spacing[4],
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.primary,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    borderRadius: radii.full,
    minWidth: 160,
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
  refreshButtonText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.primaryForeground,
  },
  cooldownMessage: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
    marginTop: spacing[2],
    textAlign: "center",
  },
});
