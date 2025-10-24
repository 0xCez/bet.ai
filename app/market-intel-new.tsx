import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { ScreenBackground } from "@/components/ui/ScreenBackground";
import { Card } from "@/components/ui/Card";
import { FloatingBottomNav } from "@/components/ui/FloatingBottomNav";
import { GaugeProgressBar } from "@/components/ui/GaugeProgressBar";
import { GradientProgressBar } from "@/components/ui/GradientProgressBar";

export default function MarketIntelNew() {
  return (
    <ScreenBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Top Card - Market Intelligence Header */}
        <Card style={styles.topCard}>
          <View style={styles.marketHeader}>
            <Text style={styles.marketTitle}>Market Intelligence 📊</Text>
          </View>
        </Card>

        {/* Best Lines Section */}
        <Card style={styles.bestLinesCard}>
          <View style={styles.bestLinesContent}>
            {/* Header */}
            <View style={styles.bestLinesHeader}>
              <Text style={styles.bestLinesTitle}>Best Lines 💰</Text>
              <Text style={styles.bestLinesInfo}>ⓘ</Text>
            </View>

            {/* Line Items */}
            <View style={styles.linesList}>
              {/* Pinaccle - Over */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Pinaccle.png")}
                  style={styles.bookmakerLogo}
                  contentFit="contain"
                />
                <View style={styles.lineTextContainer}>
                  <Text style={styles.lineBigText}>Over 225.5 -102</Text>
                  <Text style={styles.lineSmallText}>Best available Over with lowest juice</Text>
                </View>
              </View>

              {/* Draftkings - Under */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Draftkings.png")}
                  style={styles.bookmakerLogo}
                  contentFit="contain"
                />
                <View style={styles.lineTextContainer}>
                  <Text style={styles.lineBigText}>Under 226.5 -106</Text>
                  <Text style={styles.lineSmallText}>Best available Under with lowest juice</Text>
                </View>
              </View>

              {/* Betmgm - 76ers Spread */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Betmgm.png")}
                  style={styles.bookmakerLogo}
                  contentFit="contain"
                />
                <View style={styles.lineTextContainer}>
                  <Text style={styles.lineBigText}>76ers +14.5 at -105</Text>
                  <Text style={styles.lineSmallText}>Best available Spread on 76ers</Text>
                </View>
              </View>

              {/* Betrivers - WAS Spread */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Betrivers.png")}
                  style={styles.bookmakerLogo}
                  contentFit="contain"
                />
                <View style={styles.lineTextContainer}>
                  <Text style={styles.lineBigText}>WAS +14.5 at -105</Text>
                  <Text style={styles.lineSmallText}>Best available Spread on Was</Text>
                </View>
              </View>

              {/* Caesars - 76ers ML */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Caesars.png")}
                  style={styles.bookmakerLogo}
                  contentFit="contain"
                />
                <View style={styles.lineTextContainer}>
                  <Text style={styles.lineBigText}>76ers ML at +795</Text>
                  <Text style={styles.lineSmallText}>Best available ML on 76ers</Text>
                </View>
              </View>

              {/* Fanduel - WAS ML */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Fanduel.png")}
                  style={styles.bookmakerLogo}
                  contentFit="contain"
                />
                <View style={styles.lineTextContainer}>
                  <Text style={styles.lineBigText}>WAS ML at -900</Text>
                  <Text style={styles.lineSmallText}>Best available ML on WAS</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Consensus Lines Section */}
        <Card style={styles.consensusLinesCard}>
          <View style={styles.consensusLinesContent}>
            {/* Header */}
            <View style={styles.consensusLinesHeader}>
              <Text style={styles.consensusLinesTitle}>Consensus Lines 📊</Text>
              <Text style={styles.consensusLinesInfo}>ⓘ</Text>
            </View>

            {/* Table */}
            <View style={styles.consensusTable}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <View style={styles.teamColumn} />
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Spread</Text>
                </View>
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Moneyline</Text>
                </View>
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Total</Text>
                </View>
              </View>

              {/* WAS Wizards Row */}
              <View style={styles.tableRow}>
                <View style={styles.teamColumn}>
                  <Image
                    source={require("../assets/images/Was_Wizards.png")}
                    style={styles.teamLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.teamName}>WAS Wizards</Text>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>-5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>-190</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>O225.5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
              </View>

              {/* 76ers Row */}
              <View style={styles.tableRow}>
                <View style={styles.teamColumn}>
                  <Image
                    source={require("../assets/images/76ers.png")}
                    style={styles.teamLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.teamName}>76ers</Text>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>+5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>+165</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>U226.5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Public vs Sharp Meter Card */}
        <Card style={styles.publicSharpCard}>
          {/* Header */}
          <View style={styles.publicSharpHeader}>
            <Text style={styles.publicSharpTitle}>Public vs Sharp Meter 🌡️</Text>
            <Text style={styles.publicSharpInfo}>ⓘ</Text>
          </View>

          {/* Content */}
          <View style={styles.publicSharpContent}>
            {/* Left Side - Text Content */}
            <View style={styles.publicSharpLeft}>
              {/* Row 1 */}
              <View style={styles.publicSharpRow}>
                <Text style={styles.publicSharpText}>Sharps Lean Dog</Text>
                <Text style={styles.publicSharpText}>+0.5</Text>
              </View>

              {/* Row 2 with borders */}
              <View style={[styles.publicSharpRow, styles.publicSharpRowBordered]}>
                <Text style={styles.publicSharpText}>(RLM suspected)</Text>
                <Text style={styles.publicSharpText}>-3.5</Text>
              </View>

              {/* Row 3 */}
              <View style={styles.publicSharpRow}>
                <Text style={styles.publicSharpText}>Sharp avg −3.0 vs public −3.5</Text>
              </View>
            </View>

            {/* Right Side - Gauge */}
            <View style={styles.publicSharpRight}>
              <GaugeProgressBar
                value={3}
                maxValue={10}
                primaryText=""
                secondaryText="3-game win streak"
              />
            </View>
          </View>
        </Card>

        {/* Market Efficiency Card */}
        <Card style={styles.marketEfficiencyCard}>
          {/* Header */}
          <View style={styles.marketEfficiencyHeader}>
            <Text style={styles.marketEfficiencyTitle}>Market Efficiency 🦾</Text>
            <Text style={styles.marketEfficiencyInfo}>ⓘ</Text>
          </View>

          {/* Content */}
          <View style={styles.marketEfficiencyContent}>
            {/* Progress Bar with Labels */}
            <View style={styles.progressBarContainer}>
              <GradientProgressBar value={80} maxValue={100} />
              <View style={styles.progressBarLabels}>
                <Text style={styles.progressBarLabel}>Loose</Text>
                <Text style={styles.progressBarLabel}>Tight</Text>
              </View>
            </View>

            {/* Description */}
            <Text style={styles.marketEfficiencyDescription}>
              Tight: point range 0.5 • price range 8¢
            </Text>
          </View>
        </Card>

        {/* Odds Table Card */}
        <Card style={styles.oddsTableCard}>
          {/* Header */}
          <View style={styles.oddsTableHeader}>
            <Text style={styles.oddsTableTitle}>Odds Table 🔎</Text>
            <Text style={styles.oddsTableInfo}>ⓘ</Text>
          </View>

          {/* Table */}
          <View style={styles.oddsTableContainer}>
            {/* Column Headers */}
            <View style={styles.oddsTableHeaderRow}>
              <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>MONEYLINE</Text>
              <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCell]}>SPREAD</Text>
              <Text style={[styles.oddsTableColumnHeader, styles.oddsTableColumnHeaderCellLast]}>TOTALS</Text>
            </View>

            {/* WAS Wizards Section */}
            <Text style={styles.oddsTableTeamName}>WAS Wizards</Text>
            
            {/* WAS Wizards Row 1 */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Caesars.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <Text style={styles.oddsTableValue}>-118</Text>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Pinaccle.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>+1.5</Text>
                  <Text style={styles.oddsTableValue}>-110</Text>
                </View>
              </View>
              <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                <Image
                  source={require("../assets/images/Betrivers.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>O 43</Text>
                  <Text style={styles.oddsTableValue}>-120</Text>
                </View>
              </View>
            </View>

            {/* WAS Wizards Row 2 */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Draftkings.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <Text style={styles.oddsTableValue}>-110</Text>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Betmgm.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>-1.5</Text>
                  <Text style={styles.oddsTableValue}>+110</Text>
                </View>
              </View>
              <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                <Image
                  source={require("../assets/images/Betrivers.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>U 53.4</Text>
                  <Text style={styles.oddsTableValue}>-116</Text>
                </View>
              </View>
            </View>

            {/* WAS Wizards Row 3 */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Draftkings.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <Text style={styles.oddsTableValue}>-110</Text>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Betmgm.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>-1.5</Text>
                  <Text style={styles.oddsTableValue}>+110</Text>
                </View>
              </View>
              <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                <Image
                  source={require("../assets/images/Betrivers.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>U 53.4</Text>
                  <Text style={styles.oddsTableValue}>-116</Text>
                </View>
              </View>
            </View>

            {/* 76ers Section */}
            <Text style={styles.oddsTableTeamName}>76ers</Text>
            
            {/* 76ers Row 1 */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Caesars.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <Text style={styles.oddsTableValue}>-118</Text>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Pinaccle.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>+1.5</Text>
                  <Text style={styles.oddsTableValue}>-110</Text>
                </View>
              </View>
              <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                <Image
                  source={require("../assets/images/Betrivers.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>O 43</Text>
                  <Text style={styles.oddsTableValue}>-120</Text>
                </View>
              </View>
            </View>

            {/* 76ers Row 2 */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Draftkings.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <Text style={styles.oddsTableValue}>-110</Text>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Betmgm.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>-1.5</Text>
                  <Text style={styles.oddsTableValue}>+110</Text>
                </View>
              </View>
              <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                <Image
                  source={require("../assets/images/Betrivers.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>U 53.4</Text>
                  <Text style={styles.oddsTableValue}>-116</Text>
                </View>
              </View>
            </View>

            {/* 76ers Row 3 */}
            <View style={styles.oddsTableRow}>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Draftkings.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <Text style={styles.oddsTableValue}>-110</Text>
              </View>
              <View style={styles.oddsTableCell}>
                <Image
                  source={require("../assets/images/Betmgm.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>-1.5</Text>
                  <Text style={styles.oddsTableValue}>+110</Text>
                </View>
              </View>
              <View style={[styles.oddsTableCell, styles.oddsTableCellLast]}>
                <Image
                  source={require("../assets/images/Betrivers.png")}
                  style={styles.oddsTableLogo}
                  contentFit="contain"
                />
                <View style={styles.oddsTableMultiValue}>
                  <Text style={styles.oddsTableValue}>U 53.4</Text>
                  <Text style={styles.oddsTableValue}>-116</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Vig Analysis Card */}
        <Card style={styles.consensusLinesCard}>
          <View style={styles.consensusLinesContent}>
            {/* Header */}
            <View style={styles.consensusLinesHeader}>
              <Text style={styles.consensusLinesTitle}>Vig Analysis 🧃</Text>
              <Text style={styles.consensusLinesInfo}>ⓘ</Text>
            </View>

            {/* Table */}
            <View style={styles.consensusTable}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <View style={styles.teamColumn} />
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Spread</Text>
                </View>
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Moneyline</Text>
                </View>
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Total</Text>
                </View>
              </View>

              {/* Sharp Books Row */}
              <View style={styles.tableRow}>
                <View style={styles.teamColumn}>
                  <Text style={styles.teamName}>Sharp Books 🎯</Text>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>3.1%</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>3.1%</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>3.7%</Text>
                  </View>
                </View>
              </View>

              {/* All books Row */}
              <View style={styles.tableRow}>
                <View style={styles.teamColumn}>
                  <Text style={styles.teamName}>All books 👥</Text>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>4.5%</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>4.1%</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>4.6%</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Fair Value Card */}
        <Card style={styles.consensusLinesCard}>
          <View style={styles.consensusLinesContent}>
            {/* Header */}
            <View style={styles.consensusLinesHeader}>
              <Text style={styles.consensusLinesTitle}>Fair Value ⚖️</Text>
              <Text style={styles.consensusLinesInfo}>ⓘ</Text>
            </View>

            {/* Table */}
            <View style={styles.consensusTable}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <View style={styles.teamColumn} />
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Spread</Text>
                </View>
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Moneyline</Text>
                </View>
                <View style={styles.dataColumn}>
                  <Text style={styles.columnHeaderText}>Total</Text>
                </View>
              </View>

              {/* WAS Wizards Row */}
              <View style={styles.tableRow}>
                <View style={styles.teamColumn}>
                  <Image
                    source={require("../assets/images/Was_Wizards.png")}
                    style={styles.teamLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.teamName}>WAS Wizards</Text>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>-5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>-190</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>0225.5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
              </View>

              {/* 76ers Row */}
              <View style={styles.tableRow}>
                <View style={styles.teamColumn}>
                  <Image
                    source={require("../assets/images/76ers.png")}
                    style={styles.teamLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.teamName}>76ers</Text>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>+5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>+165</Text>
                  </View>
                </View>
                <View style={styles.dataColumn}>
                  <View style={styles.dataCell}>
                    <Text style={styles.dataValue}>U226.5</Text>
                    <Text style={styles.dataSecondary}>-105</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* EV+ & Arb Opportunities Card 1 */}
        <Card style={styles.bestLinesCard}>
          <View style={styles.bestLinesContent}>
            {/* Header */}
            <View style={styles.bestLinesHeader}>
              <Text style={styles.bestLinesTitle}>EV+ & Arb Opportunities 💸</Text>
              <Text style={styles.bestLinesInfo}>ⓘ</Text>
            </View>

            {/* Line Items */}
            <View style={styles.linesList}>
              {/* Item 1 - Arb Detected */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Pinacle_DraftKing.png")}
                  style={styles.opportunityLogo}
                  contentFit="contain"
                />
                <View style={styles.opportunityTextContainer}>
                  <Text style={styles.opportunityBigText}>Arb Detected - 2.3% guaranteed</Text>
                  <Text style={styles.opportunitySmallText}>60.87% on Chiefs ML 1.65 39.13% on Jaguars ML 2.85</Text>
                </View>
              </View>

              {/* Item 2 - MyBookie */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/mybookie.png")}
                  style={styles.opportunityLogo}
                  contentFit="contain"
                />
                <View style={styles.opportunityTextContainer}>
                  <Text style={styles.opportunityBigText}>+EV 3.1% at DraftKings</Text>
                  <Text style={styles.opportunitySmallText}>Jaguars ML 2.85</Text>
                </View>
              </View>

              {/* Item 3 - Fanatics */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/fanatics.png")}
                  style={styles.opportunityLogo}
                  contentFit="contain"
                />
                <View style={styles.opportunityTextContainer}>
                  <Text style={styles.opportunityBigText}>+EV 3.1% at DraftKings</Text>
                  <Text style={styles.opportunitySmallText}>Jaguars ML 2.85</Text>
                </View>
              </View>

              {/* Item 4 - Ballybet */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Ballybet.png")}
                  style={styles.opportunityLogo}
                  contentFit="contain"
                />
                <View style={styles.opportunityTextContainer}>
                  <Text style={styles.opportunityBigText}>+EV 3.1% at DraftKings</Text>
                  <Text style={styles.opportunitySmallText}>Jaguars ML 2.85</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* EV+ & Arb Opportunities Card 2 */}
        <Card style={styles.bestLinesCard}>
          <View style={styles.bestLinesContent}>
            {/* Header */}
            <View style={styles.bestLinesHeader}>
              <Text style={styles.bestLinesTitle}>EV+ & Arb Opportunities 💸</Text>
              <Text style={styles.bestLinesInfo}>ⓘ</Text>
            </View>

            {/* Line Items */}
            <View style={styles.linesList}>
              {/* Item 1 - Market efficiently priced */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/icons/cross-circle.svg")}
                  style={styles.opportunityLogo}
                  contentFit="contain"
                />
                <View style={styles.opportunityTextContainer}>
                  <Text style={styles.opportunityBigText}>Market is efficiently priced</Text>
                  <Text style={styles.opportunitySmallText}>No +EV or Arb opportunities found</Text>
                </View>
              </View>

              {/* Item 2 - Lowest Vig */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Pinaccle.png")}
                  style={styles.opportunityLogo}
                  contentFit="contain"
                />
                <View style={styles.opportunityTextContainer}>
                  <Text style={styles.opportunityBigText}>Lowest Vig at 2.5%</Text>
                  <Text style={styles.opportunitySmallText}>ML on Wizards -210 at Pinnacle</Text>
                </View>
              </View>

              {/* Item 3 - Lowest Vig Spread */}
              <View style={styles.lineItem}>
                <Image
                  source={require("../assets/images/Lowvig.png")}
                  style={styles.opportunityLogo}
                  contentFit="contain"
                />
                <View style={styles.opportunityTextContainer}>
                  <Text style={styles.opportunityBigText}>Lowest Vig Spread at 2.6%</Text>
                  <Text style={styles.opportunitySmallText}>ML on 76ers +190 at LowVig.AG</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Get Fresh Odds Button */}
        <View style={styles.buttonContainer}>
          <Pressable style={styles.freshOddsButton}>
            <Text style={styles.freshOddsButtonText}>Get fresh odds 🎲</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Floating Bottom Nav */}
      <FloatingBottomNav
        activeTab="market"
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
  marketHeader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13.44,
    paddingHorizontal: 22,
  },
  marketTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20,
    color: "#FFFFFF",
  },
  bestLinesCard: {
    marginTop: 16,
  },
  bestLinesContent: {
    paddingVertical: 22,
    paddingHorizontal: 0,
  },
  bestLinesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    marginBottom: 20,
  },
  bestLinesTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  bestLinesInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  linesList: {
    gap: 16,
  },
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20.15,
    gap: 16,
  },
  bookmakerLogo: {
    width: 40.31,
    height: 40.31,
    borderRadius: 20.155,
  },
  lineTextContainer: {
    flex: 1,
    gap: 4,
  },
  lineBigText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 15,
    color: "#FFFFFF",
  },
  lineSmallText: {
    fontFamily: "Aeonik-Light",
    fontSize: 13,
    color: "#FFFFFF",
    opacity: 0.7,
  },
  consensusLinesCard: {
    marginTop: 16,
  },
  consensusLinesContent: {
    paddingVertical: 22,
    paddingHorizontal: 0,
  },
  consensusLinesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    marginBottom: 20,
  },
  consensusLinesTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  consensusLinesInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  consensusTable: {
    paddingHorizontal: 20.15,
    gap: 12,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  teamColumn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dataColumn: {
    flex: 1,
    alignItems: "center",
  },
  dataCell: {
    width: 44.34,
    height: 44.34,
    borderRadius: 12.65,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#212121",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  columnHeaderText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 11,
    color: "#FFFFFF",
  },
  teamLogo: {
    width: 40.31,
    height: 40.31,
  },
  teamName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
  },
  dataValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 10,
    color: "#FFFFFF",
  },
  dataSecondary: {
    fontFamily: "Aeonik-Medium",
    fontSize: 10,
    color: "#FFFFFF",
    opacity: 0.5,
  },
  publicSharpCard: {
    marginTop: 16,
  },
  publicSharpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    paddingTop: 22,
    paddingBottom: 16,
  },
  publicSharpTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  publicSharpInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  publicSharpContent: {
    flexDirection: "row",
    paddingHorizontal: 31.91,
    paddingBottom: 22,
    justifyContent: "space-between",
    alignItems: "center",
  },
  publicSharpLeft: {
    flex: 1,
    gap: 12,
  },
  publicSharpRight: {
    marginLeft: 20,
  },
  publicSharpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  publicSharpRowBordered: {
    borderTopWidth: 0.2,
    borderBottomWidth: 0.2,
    borderColor: "#686868",
    paddingVertical: 12,
  },
  publicSharpText: {
    fontFamily: "Aeonik-Light",
    fontSize: 12,
    color: "#FFFFFF",
  },
  marketEfficiencyCard: {
    marginTop: 16,
  },
  marketEfficiencyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    paddingTop: 22,
    paddingBottom: 16,
  },
  marketEfficiencyTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  marketEfficiencyInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  marketEfficiencyContent: {
    paddingHorizontal: 31.91,
    paddingBottom: 22,
    gap: 12,
  },
  progressBarContainer: {
    gap: 8,
  },
  progressBarLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressBarLabel: {
    fontFamily: "Aeonik-Regular",
    fontSize: 10,
    color: "#FFFFFF",
    opacity: 0.6,
  },
  marketEfficiencyDescription: {
    fontFamily: "Aeonik-Regular",
    fontSize: 12,
    color: "#FFFFFF",
    opacity: 0.8,
  },
  oddsTableCard: {
    marginTop: 16,
  },
  oddsTableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 31.91,
    paddingTop: 22,
    paddingBottom: 16,
  },
  oddsTableTitle: {
    fontFamily: "Aeonik-Medium",
    fontSize: 20.15,
    color: "#FFFFFF",
  },
  oddsTableInfo: {
    fontFamily: "Aeonik-Medium",
    fontSize: 16.79,
    color: "#00C2E0",
  },
  oddsTableContainer: {
    paddingHorizontal: 20.15,
    paddingBottom: 22,
  },
  oddsTableHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  oddsTableColumnHeader: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
    paddingVertical: 12,
  },
  oddsTableColumnHeaderCell: {
    borderRightWidth: 0.5,
    borderRightColor: "#2A2A2A",
  },
  oddsTableColumnHeaderCellLast: {
    borderRightWidth: 0,
  },
  oddsTableTeamName: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
    paddingVertical: 12,
    textAlign: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  oddsTableRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderBottomWidth: 0.5,
    borderBottomColor: "#2A2A2A",
  },
  oddsTableCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRightWidth: 0.5,
    borderRightColor: "#2A2A2A",
  },
  oddsTableLogo: {
    width: 30.23,
    height: 30.23,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  oddsTableValue: {
    fontFamily: "Aeonik-Medium",
    fontSize: 13.5,
    color: "#FFFFFF",
  },
  oddsTableMultiValue: {
    gap: 4,
    alignItems: "center",
  },
  oddsTableCellLast: {
    borderRightWidth: 0,
  },
  opportunityLogo: {
    width: 40.31,
    height: 40.31,
  },
  opportunityTextContainer: {
    flex: 1,
    gap: 4,
  },
  opportunityBigText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#0BFF13",
  },
  opportunitySmallText: {
    fontFamily: "Aeonik-Regular",
    fontSize: 12.5,
    color: "#FFFFFF",
  },
  buttonContainer: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  freshOddsButton: {
    width: 176.35,
    height: 43.67,
    backgroundColor: "#00C2E0",
    borderRadius: 33.59,
    justifyContent: "center",
    alignItems: "center",
  },
  freshOddsButtonText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 14,
    color: "#FFFFFF",
  },
});

