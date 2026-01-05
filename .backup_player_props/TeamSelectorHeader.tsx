import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, borderRadius, typography } from "../../constants/designTokens";

interface TeamSelectorHeaderProps {
  team1Name: string;
  team2Name: string;
  team1Logo: any;
  team2Logo: any;
  activeTeam: "team1" | "team2";
  onTeamChange: (team: "team1" | "team2") => void;
  title?: string;
  sticky?: boolean;
}

export const TeamSelectorHeader: React.FC<TeamSelectorHeaderProps> = ({
  team1Name,
  team2Name,
  team1Logo,
  team2Logo,
  activeTeam,
  onTeamChange,
  title,
  sticky = false,
}) => {
  // Get short team name (last word, typically the nickname)
  const getShortName = (fullName: string) => {
    if (!fullName) return "Team";
    const parts = fullName.split(" ");
    return parts[parts.length - 1];
  };

  return (
    <View style={[styles.container, sticky && styles.containerSticky]}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.matchupRow}>
        <Pressable
          style={[
            styles.teamTab,
            activeTeam === "team1" && styles.teamTabActive,
          ]}
          onPress={() => onTeamChange("team1")}
        >
          <Image source={team1Logo} style={styles.teamLogo} contentFit="contain" />
          <Text
            style={[
              styles.teamTabText,
              activeTeam === "team1" && styles.teamTabTextActive,
            ]}
          >
            {getShortName(team1Name)}
          </Text>
        </Pressable>

        <Text style={styles.vsText}>vs</Text>

        <Pressable
          style={[
            styles.teamTab,
            activeTeam === "team2" && styles.teamTabActive,
          ]}
          onPress={() => onTeamChange("team2")}
        >
          <Image source={team2Logo} style={styles.teamLogo} contentFit="contain" />
          <Text
            style={[
              styles.teamTabText,
              activeTeam === "team2" && styles.teamTabTextActive,
            ]}
          >
            {getShortName(team2Name)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing[3],
  },
  containerSticky: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
  },
  title: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: spacing[2],
  },
  matchupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
  },
  teamTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2] + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.rgba.primary10,
  },
  teamLogo: {
    width: 28,
    height: 28,
  },
  teamTabText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  teamTabTextActive: {
    color: colors.foreground,
  },
  vsText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
});

export default TeamSelectorHeader;
