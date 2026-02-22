import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { openBookmakerLink, getBookmakerConfig, BookmakerLinkConfig } from '@/utils/bookmakerLinks';
import { colors, spacing } from '@/constants/designTokens';

interface BookmakerTappableProps {
  /** bookmakerKey (e.g. "draftkings") or display name (e.g. "DraftKings") */
  bookmaker?: string;
  /** Sport for sport-specific URL (e.g. "nba", "nfl", "soccer") */
  sport?: string;
  /** Fired after the link is opened; use for analytics */
  onLinkOpened?: (bookmaker: string, config: BookmakerLinkConfig) => void;
  children: React.ReactNode;
  style?: ViewStyle;
  /** Show a small external-link icon indicator (default: true) */
  showLinkIcon?: boolean;
}

export function BookmakerTappable({
  bookmaker,
  sport,
  onLinkOpened,
  children,
  style,
  showLinkIcon = true,
}: BookmakerTappableProps) {
  const config = getBookmakerConfig(bookmaker);

  const handlePress = useCallback(async () => {
    if (!bookmaker) return;
    const opened = await openBookmakerLink(bookmaker, sport);
    if (opened && onLinkOpened && config) {
      onLinkOpened(bookmaker, config);
    }
  }, [bookmaker, sport, onLinkOpened, config]);

  // If no bookmaker config found, render children without interactivity
  if (!config) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        style,
        pressed && styles.pressed,
      ]}
      accessibilityRole="link"
      accessibilityLabel={`Open ${config.displayName} sportsbook`}
    >
      {children}
      {showLinkIcon && (
        <View style={styles.linkIconContainer}>
          <Ionicons
            name="open-outline"
            size={10}
            color={colors.mutedForeground}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  linkIconContainer: {
    position: 'absolute',
    top: spacing[1],
    right: spacing[1],
  },
});
