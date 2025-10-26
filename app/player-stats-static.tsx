import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { GradientProgressBar } from "@/components/ui/GradientProgressBar";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";

export default function PlayerStatsNew() {
  return (
    <ScreenBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Top Card - Player Header */}
        <Card style={styles.topCard}>
          <View style={styles.playerHeader}>
            <View style={styles.nameLogoRow}>
              <Text style={styles.playerName}>Jalen Hurts</Text>
              <Image
                source={require("../assets/images/Philadelphia_Eagles.svg")}
                style={styles.teamLogo}
                contentFit="contain"
              />
            </View>
            <Text style={styles.position}>Quarterback</Text>
          </View>
        </Card>

        {/* Stats Row - QB Rating and Total TDs */}
        <View style={styles.statsRow}>
          {/* QB Rating Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>QB Rating</Text>
              <Text style={styles.statValue}>103.7</Text>
              <Text style={styles.statDescription}>Ranked on 158.3 points</Text>
              <GradientProgressBar value={103.7} maxValue={158.3} />
            </View>
          </Card>

          {/* Total TDs Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>TOTAL TD's</Text>
              <Text style={styles.statValue}>32</Text>
              <Text style={styles.statDescription}>68.7% across all attempts</Text>
              <GradientProgressBar value={68.7} maxValue={100} />
            </View>
          </Card>
        </View>

        {/* Core KPIs Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
            <Text style={styles.coreKPIsTitle}>Core KPIs 🦾</Text>
            <Text style={styles.coreKPIsInfo}>ⓘ</Text>
          </View>

          {/* First Row of KPIs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Image
                  source={require("../assets/images/icons/meter.svg")}
                  style={styles.kpiIcon}
                  contentFit="contain"
                />
              </View>
              <View style={styles.kpiTextContainer}>
                <Text style={styles.kpiValue}>193.5</Text>
                <Text style={styles.kpiLabel}>Pass Yards per game</Text>
              </View>
            </View>

            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Image
                  source={require("../assets/images/icons/target.svg")}
                  style={styles.kpiIcon}
                  contentFit="contain"
                />
              </View>
              <View style={styles.kpiTextContainer}>
                <Text style={styles.kpiValue}>18</Text>
                <Text style={styles.kpiLabel}>Pass TDs</Text>
              </View>
            </View>
          </View>

          {/* Second Row of KPIs */}
          <View style={[styles.kpiRow, styles.kpiRowLast]}>
            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Image
                  source={require("../assets/images/icons/bolt.svg")}
                  style={styles.kpiIcon}
                  contentFit="contain"
                />
              </View>
              <View style={styles.kpiTextContainer}>
                <Text style={styles.kpiValue}>42.0</Text>
                <Text style={styles.kpiLabel}>Rush Yards per game</Text>
              </View>
            </View>

            <View style={styles.kpiItem}>
              <View style={styles.iconContainer}>
                <Image
                  source={require("../assets/images/icons/steps.svg")}
                  style={styles.kpiIcon}
                  contentFit="contain"
                />
              </View>
              <View style={styles.kpiTextContainer}>
                <Text style={styles.kpiValue}>14</Text>
                <Text style={styles.kpiLabel}>Rush TDs</Text>
              </View>
            </View>
          </View>
          </View>
        </Card>

        {/* Stats Row - Longest Pass and Sacks Taken */}
        <View style={styles.statsRow}>
          {/* Longest Pass Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Longest Pass</Text>
              <Text style={styles.statValue}>67</Text>
              <Text style={styles.statDescription}>Yards</Text>
            </View>
          </Card>

          {/* Sacks Taken Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Sacks Taken</Text>
              <Text style={styles.statValue}>38</Text>
              <Text style={styles.statDescription}>On all season</Text>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* Floating Bottom Nav */}
      <FloatingBottomNav
        activeTab="players"
        analysisData={{
          team1: "Philadelphia Eagles",
          team2: "",
          sport: "NFL",
        }}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  topCard: {
    height: 85.87,
  },
  playerHeader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13.44,
    paddingHorizontal: 22,
    gap: 4,
  },
  nameLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playerName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#FFFFFF",
  },
  teamLogo: {
    width: 58.11,
    height: 38.28,
  },
  position: {
    fontFamily: "Aeonik-Light",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    height: 132.55,
  },
  statCardSmall: {
    flex: 1,
    height: 117.1,
  },
  statContent: {
    flex: 1,
    paddingVertical: 20.15,
    paddingHorizontal: 21.83,
    gap: 8,
  },
  statLabel: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.6,
  },
  statValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 26.87,
    color: "#FFFFFF",
  },
  statDescription: {
    fontFamily: "Aeonik-Light",
    fontSize: 11.42,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  coreKPIsCard: {
    marginTop: 16,
  },
  coreKPIsContent: {
    paddingVertical: 22,
    paddingHorizontal: 0,
  },
  coreKPIsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    marginBottom: 20,
  },
  coreKPIsTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  coreKPIsInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  kpiRow: {
    flexDirection: "row",
    paddingHorizontal: 20.15,
    gap: 20,
    marginBottom: 16,
  },
  kpiRowLast: {
    marginBottom: 0,
  },
  kpiItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  kpiTextContainer: {
    flex: 1,
    gap: 4,
  },
  iconContainer: {
    width: 45.11,
    height: 44.17,
    borderRadius: 12.62,
    backgroundColor: "#161616",
    justifyContent: "center",
    alignItems: "center",
  },
  kpiIcon: {
    width: 24,
    height: 24,
  },
  kpiValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  kpiLabel: {
    fontFamily: "Aeonik-Light",
    fontSize: 11.42,
    color: "#FFFFFF",
  },
});

