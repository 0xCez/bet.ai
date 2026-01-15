import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Image } from "expo-image";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { GradientProgressBar } from "@/components/ui/GradientProgressBar";
import { GaugeProgressBar } from "@/components/ui/GaugeProgressBar";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";

export default function TeamStatsNew() {
  return (
    <ScreenBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Top Card - Team Header */}
        <Card style={styles.topCard}>
          <View style={styles.teamHeader}>
            <View style={styles.nameLogoRow}>
              <Text style={styles.teamName}>Philadelphia Eagles</Text>
              <Image
                source={require("../assets/images/Philadelphia_Eagles.svg")}
                style={styles.teamLogo}
                contentFit="contain"
              />
            </View>
          </View>
        </Card>

        {/* Stats Row - Recent Form and Momentum */}
        <View style={styles.statsRow}>
          {/* Recent Form Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>RECENT FORM</Text>
              <Text style={styles.statValue}>3-2</Text>
              <Text style={styles.statDescription}>60% Win Rate</Text>
              <GradientProgressBar value={60} maxValue={100} />
            </View>
          </Card>

          {/* Momentum Card */}
          <Card style={styles.statCard}>
            <View style={styles.momentumContent}>
              <Text style={styles.momentumLabel}>MOMENTUM</Text>
              <GaugeProgressBar 
                value={2}
                maxValue={5}
                primaryText="2W"
                secondaryText="2-game win streak"
              />
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
                  <Text style={styles.kpiValue}>24.5</Text>
                  <Text style={styles.kpiLabel}>Points per game</Text>
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
                  <Text style={styles.kpiValue}>18.3</Text>
                  <Text style={styles.kpiLabel}>Opponent PPG</Text>
                </View>
              </View>
            </View>

            {/* Second Row of KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/shield.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>207</Text>
                  <Text style={styles.kpiLabel}>Passing Yards/Game</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/bars.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>320</Text>
                  <Text style={styles.kpiLabel}>Total Yards/Game</Text>
                </View>
              </View>
            </View>

            {/* Third Row of KPIs */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/steps.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>108</Text>
                  <Text style={styles.kpiLabel}>Rushing Yards/Game</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/double-sided-arrow.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>+1.5</Text>
                  <Text style={styles.kpiLabel}>Turnover Differential</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Stats Row - 3rd DOWN and 4th DOWN */}
        <View style={styles.statsRow}>
          {/* 3rd DOWN Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>3rd DOWN</Text>
              <Text style={styles.statValue}>41.46%</Text>
              <Text style={styles.statDescription}>Per Game</Text>
              <GradientProgressBar value={41.46} maxValue={100} />
            </View>
          </Card>

          {/* 4th DOWN Card */}
          <Card style={styles.statCard}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>4th DOWN</Text>
              <Text style={styles.statValue}>83.33%</Text>
              <Text style={styles.statDescription}>Per Game</Text>
              <GradientProgressBar value={83.33} maxValue={100} />
            </View>
          </Card>
        </View>

        {/* Stats Row - HOME AVG and AWAY AVG */}
        <View style={styles.statsRow}>
          {/* HOME AVG Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>HOME AVG</Text>
              <Text style={styles.statValue}>29.4</Text>
              <Text style={styles.statDescription}>Points per Game</Text>
            </View>
          </Card>

          {/* AWAY AVG Card */}
          <Card style={styles.statCardSmall}>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>AWAY AVG</Text>
              <Text style={styles.statValue}>23.8</Text>
              <Text style={styles.statDescription}>Points per Game</Text>
            </View>
          </Card>
        </View>

        {/* Defensive Stats Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>Defensive Stats 🚀</Text>
              <Text style={styles.coreKPIsInfo}>ⓘ</Text>
            </View>

            {/* First Row of Defensive Stats */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/shield.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>183 yards</Text>
                  <Text style={styles.kpiLabel}>Pass Def/game</Text>
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
                  <Text style={styles.kpiValue}>114 yards</Text>
                  <Text style={styles.kpiLabel}>Rush Def/game</Text>
                </View>
              </View>
            </View>

            {/* Second Row of Defensive Stats */}
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
                  <Text style={styles.kpiValue}>7</Text>
                  <Text style={styles.kpiLabel}>Sacks</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/interceptions.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>2</Text>
                  <Text style={styles.kpiLabel}>Interceptions</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Advanced Metrics Card */}
        <Card style={styles.coreKPIsCard}>
          <View style={styles.coreKPIsContent}>
            {/* Header */}
            <View style={styles.coreKPIsHeader}>
              <Text style={styles.coreKPIsTitle}>Advanced Metrics 🚀</Text>
              <Text style={styles.coreKPIsInfo}>ⓘ</Text>
            </View>

            {/* First Row of Advanced Metrics */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/torch.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>3 pg</Text>
                  <Text style={styles.kpiLabel}>Passing TDs</Text>
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
                  <Text style={styles.kpiValue}>3 pg</Text>
                  <Text style={styles.kpiLabel}>Rushing TDs</Text>
                </View>
              </View>
            </View>

            {/* Second Row of Advanced Metrics */}
            <View style={[styles.kpiRow, styles.kpiRowLast]}>
              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/flag.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>67 pg</Text>
                  <Text style={styles.kpiLabel}>Penalty Yards</Text>
                </View>
              </View>

              <View style={styles.kpiItem}>
                <View style={styles.iconContainer}>
                  <Image
                    source={require("../assets/images/icons/geo-tag.svg")}
                    style={styles.kpiIcon}
                    contentFit="contain"
                  />
                </View>
                <View style={styles.kpiTextContainer}>
                  <Text style={styles.kpiValue}>4 pg</Text>
                  <Text style={styles.kpiLabel}>Yards per Rush</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* Floating Bottom Nav */}
      <FloatingBottomNav
        activeTab="teams"
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
  teamHeader: {
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
  teamName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#FFFFFF",
  },
  teamLogo: {
    width: 58.11,
    height: 38.28,
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
  momentumContent: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 21.83,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  statLabel: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.6,
  },
  momentumLabel: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.44,
    color: "#FFFFFF",
    opacity: 0.6,
    alignSelf: "flex-start",
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

