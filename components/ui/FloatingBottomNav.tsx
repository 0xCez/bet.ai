import React from "react";
import { View, Text, StyleSheet, Pressable, Image, Animated } from "react-native";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";

// BotIcon component using the bot.svg path
const BotIcon: React.FC<{ size?: number; color?: string }> = ({ size = 22, color = "#ffffff" }) => (
  <Svg width={size} height={size} viewBox="0 0 59 48" fill="none">
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M29.3333 0C28.1593 5.1652e-05 27.0181 0.387473 26.0868 1.10218C25.1554 1.81689 24.4858 2.81895 24.182 3.95295C23.8781 5.08695 23.9569 6.28953 24.4062 7.37418C24.8554 8.45883 25.65 9.36494 26.6667 9.952V13.3333H18.6667C10.1333 13.3333 8 20.4453 8 24V42.6667C8 44.4453 9.06667 48 13.3333 48H16V37.3333C16 36.6261 16.281 35.9478 16.781 35.4477C17.2811 34.9476 17.9594 34.6667 18.6667 34.6667H40C40.7072 34.6667 41.3855 34.9476 41.8856 35.4477C42.3857 35.9478 42.6667 36.6261 42.6667 37.3333V48H45.3333C49.6 48 50.6667 44.4453 50.6667 42.6667V24C50.6667 15.4667 43.5547 13.3333 40 13.3333H32V9.952C33.0167 9.36494 33.8113 8.45883 34.2605 7.37418C34.7098 6.28953 34.7886 5.08695 34.4847 3.95295C34.1808 2.81895 33.5113 1.81689 32.5799 1.10218C31.6485 0.387473 30.5073 5.1652e-05 29.3333 0ZM37.3333 48V40H32V48H37.3333ZM26.6667 48V40H21.3333V48H26.6667ZM53.3333 40V26.6667C55.112 26.6667 58.6667 27.7333 58.6667 32V34.6667C58.6667 36.4453 57.6 40 53.3333 40ZM5.33333 26.6667V40C1.06667 40 0 36.4453 0 34.6667V32C0 27.7333 3.55467 26.6667 5.33333 26.6667ZM21.3333 24C20.6261 24 19.9478 24.281 19.4477 24.781C18.9476 25.2811 18.6667 25.9594 18.6667 26.6667C18.6667 27.3739 18.9476 28.0522 19.4477 28.5523C19.9478 29.0524 20.6261 29.3333 21.3333 29.3333H21.336C22.0432 29.3333 22.7215 29.0524 23.2216 28.5523C23.7217 28.0522 24.0027 27.3739 24.0027 26.6667C24.0027 25.9594 23.7217 25.2811 23.2216 24.781C22.7215 24.281 22.0432 24 21.336 24H21.3333ZM34.6667 26.6667C34.6667 25.9594 34.9476 25.2811 35.4477 24.781C35.9478 24.281 36.6261 24 37.3333 24H37.336C38.0432 24 38.7215 24.281 39.2216 24.781C39.7217 25.2811 40.0027 25.9594 40.0027 26.6667C40.0027 27.3739 39.7217 28.0522 39.2216 28.5523C38.7215 29.0524 38.0432 29.3333 37.336 29.3333H37.3333C36.6261 29.3333 35.9478 29.0524 35.4477 28.5523C34.9476 28.0522 34.6667 27.3739 34.6667 26.6667Z"
      fill={color}
    />
  </Svg>
);

interface FloatingBottomNavProps {
  activeTab: "insight" | "market" | "teams" | "players" | "expert";
  analysisData?: {
    team1?: string;
    team2?: string;
    sport?: string;
    team1Logo?: string;
    team2Logo?: string;
    analysisId?: string; // Add analysisId for proper insight navigation
  };
}

export const FloatingBottomNav: React.FC<FloatingBottomNavProps> = ({
  activeTab,
  analysisData,
}) => {
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const navigateToTab = (tab: string) => {
    if (tab === activeTab || isTransitioning) return; // Don't navigate if already on the tab or transitioning

    // Start transition animation
    setIsTransitioning(true);

    // Scale down animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsTransitioning(false);
    });

    const baseParams = {
      team1: analysisData?.team1 || "",
      team2: analysisData?.team2 || "",
      sport: analysisData?.sport || "nfl",
      team1Logo: analysisData?.team1Logo || "",
      team2Logo: analysisData?.team2Logo || "",
      analysisId: analysisData?.analysisId || "", // Include analysisId for navigation back to insight
    };

    // Add slight delay for animation to be visible
    setTimeout(() => {
      const sportLower = (analysisData?.sport || "").toLowerCase();
      const isSoccer = sportLower.startsWith("soccer");
      const isNFL = sportLower.includes("nfl");
      switch (tab) {
        case "insight":
          // Navigate back to analysis page with analysisId if available
          if (analysisData?.analysisId) {
            router.push({
              pathname: "/analysis",
              params: {
                analysisId: analysisData.analysisId
              }
            });
          } else {
            // Fallback: Navigate back (for when there's no analysisId)
            router.back();
          }
          break;
        case "market":
          // Route to sport-specific market intel page
          console.log("FloatingBottomNav Market - Sport:", analysisData?.sport);
          const marketIntelPath = isSoccer ? "/market-intel-soccer" :
                                 "/market-intel"; // NFL, NBA, MLB use main page
          console.log("FloatingBottomNav Market - Path:", marketIntelPath);
          router.push({
            pathname: marketIntelPath,
            params: baseParams,
          });
          break;
        case "teams":
          // Route to sport-specific team stats page
          const isNBA = sportLower === "nba";
          const teamStatsPath = isSoccer ? "/team-stats-soccer-new" :
                               isNBA ? "/team-stats-nba-new" :
                               "/team-stats-nfl-new"; // Default to NFL
          router.push({
            pathname: teamStatsPath,
            params: baseParams,
          });
          break;
        case "players":
          // Route to sport-specific player stats page
          const isNBAPlayers = sportLower === "nba";
          const playerStatsPath = isSoccer ? "/player-stats-soccer-new" :
                                 isNBAPlayers ? "/player-stats-nba-new" :
                                 "/player-stats-nfl-new"; // Default to NFL
          router.push({
            pathname: playerStatsPath,
            params: baseParams,
          });
          break;
        case "expert":
          // Expert tab - do nothing for now
          break;
      }
    }, 100); // Small delay for animation
  };

  // Helper function to get icon source - using your PNG icons with hover states
  const getIconSource = (tabKey: string, isActive: boolean) => {
    switch (tabKey) {
      case "insight":
        return isActive
          ? require("../../assets/images/insight_hov.png")
          : require("../../assets/images/insight.png");
      case "market":
        return isActive
          ? require("../../assets/images/market_hov.png")
          : require("../../assets/images/market.png");
      case "teams":
        return isActive
          ? require("../../assets/images/teams_hov.png")
          : require("../../assets/images/teams.png");
      case "players":
        return isActive
          ? require("../../assets/images/players_hov.png")
          : require("../../assets/images/players.png");
      default:
        return require("../../assets/images/logo.png");
    }
  };

  const tabs = [
    { key: "insight", label: "Insight" },
    { key: "market", label: "Market" },
    { key: "teams", label: "Teams" },
    { key: "players", label: "Players" },
    { key: "expert", label: "Expert" },
  ];

  return (
    <Animated.View style={[styles.floatingContainer, { transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.navContainer}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const color = isActive ? "#00DDFF" : "#ffffff";

          return (
            <Pressable
              key={tab.key}
              style={[styles.tabItem, isTransitioning && styles.tabItemDisabled]}
              onPress={() => navigateToTab(tab.key)}
              disabled={isTransitioning}
            >
              {tab.key === "expert" ? (
                <BotIcon size={22} color={isActive ? "#00DDFF" : "#ffffff"} />
              ) : (
                <Image
                  source={getIconSource(tab.key, isActive)}
                  style={styles.tabIcon}
                />
              )}
              <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    position: "absolute",
    bottom: 30, // Floating with bottom padding
    left: 20,
    right: 20,
    zIndex: 1000, // On top of other elements
  },
  navContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(12, 12, 12, 0.98)",
    borderRadius: 100,
    padding: 12, // Reduced padding for more compact design
    justifyContent: "space-around",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10, // Android shadow
  },
  tabItem: {
    alignItems: "center",
    paddingVertical: 6, // Reduced padding for more compact design
    paddingHorizontal: 12,
    minWidth: 65,
  },
  tabItemDisabled: {
    opacity: 0.6,
  },
  tabIcon: {
    width: 22, // Reduced icon size for more compact design
    height: 22,
    marginBottom: 2, // Reduced margin for tighter spacing
  },
  tabLabel: {
    fontSize: 15, // Back to proper size
    fontFamily: "Aeonik-Medium",
    fontWeight: "400",
  },
});
