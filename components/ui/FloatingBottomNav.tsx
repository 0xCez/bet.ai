import React from "react";
import { View, Text, StyleSheet, Pressable, Image, Animated } from "react-native";
import { router } from "expo-router";

interface FloatingBottomNavProps {
  activeTab: "insight" | "market" | "teams" | "players";
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
    };

    // Add slight delay for animation to be visible
    setTimeout(() => {
      switch (tab) {
        case "insight":
          // Navigate back to the SAME analysis page
          if (analysisData?.analysisId) {
            router.push({
              pathname: "/analysis",
              params: {
                analysisId: analysisData.analysisId
              }
            });
          } else {
            // If no analysisId, just go back
            router.back();
          }
          break;
        case "market":
          // Route to sport-specific market intel page
          console.log("FloatingBottomNav Market - Sport:", analysisData?.sport);
          const marketIntelPath = analysisData?.sport === "soccer" ? "/market-intel-soccer" :
                                 "/market-intel"; // NFL, NBA, MLB use main page
          console.log("FloatingBottomNav Market - Path:", marketIntelPath);
          router.push({
            pathname: marketIntelPath,
            params: baseParams,
          });
          break;
        case "teams":
          // Route to sport-specific team stats page
          const teamStatsPath = analysisData?.sport === "soccer" ? "/team-stats-soccer" :
                               analysisData?.sport === "nfl" ? "/team-stats-nfl" :
                               "/team-stats-nfl"; // Default to NFL for now
          router.push({
            pathname: teamStatsPath,
            params: baseParams,
          });
          break;
        case "players":
          // Route to sport-specific player stats page
          const playerStatsPath = analysisData?.sport === "soccer" ? "/player-stats-soccer" :
                                 analysisData?.sport === "nfl" ? "/player-stats-nfl" :
                                 "/player-stats-nfl"; // Default to NFL for now
          router.push({
            pathname: playerStatsPath,
            params: baseParams,
          });
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
              <Image
                source={getIconSource(tab.key, isActive)}
                style={styles.tabIcon}
              />
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
    padding: 16, // Balanced padding
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
    paddingVertical: 8, // Balanced padding
    paddingHorizontal: 12,
    minWidth: 65,
  },
  tabItemDisabled: {
    opacity: 0.6,
  },
  tabIcon: {
    width: 24, // Slightly bigger icons
    height: 24,
    marginBottom: 4, // More space between icon and text
  },
  tabLabel: {
    fontSize: 15, // Back to proper size
    fontFamily: "Aeonik-Medium",
    fontWeight: "400",
  },
});
