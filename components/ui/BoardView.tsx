import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Dimensions,
  TextInput,
  Image,
  Animated,
  Keyboard,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { CachedGame } from "./CachedGameCard";
import { colors, spacing, borderRadius, typography, glass } from "../../constants/designTokens";
import { getTeamAbbreviation, formatStatType, formatOdds, formatGameTime, BOOKMAKER_LOGOS } from "../../utils/formatters";
import { getPlayerImage } from "../../utils/playerImages";
import { SPORT_LIST, type SportId } from "../../config/sports";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TILE_GAP = spacing[3]; // 12px
const TILE_PADDING = spacing[4]; // 16px
const TILE_WIDTH = (SCREEN_WIDTH - TILE_PADDING * 2 - TILE_GAP) / 2;

// ── Types ──

type ViewMode = "topPicks" | "byGame";
type TeamFilter = "all" | string;
type SportFilter = SportId;

const VIEW_MODE_OPTIONS: { id: ViewMode; label: string; icon: string }[] = [
  { id: "topPicks", label: "Players", icon: "people" },
  { id: "byGame", label: "Games", icon: "basketball" },
];

interface PickRow {
  key: string;
  playerName: string;
  team: string;
  opponent: string;
  statType: string;
  line: number;
  prediction: string;
  oddsOver?: number;
  oddsUnder?: number;
  bookmakerOver?: string;
  bookmakerUnder?: string;
  allBks?: { bk: string; odds: number }[];
  l10Avg?: number;
  hitRates?: {
    l10?: { over: number; total: number; pct: number };
    season?: { over: number; total: number; pct: number };
  };
  directionalHitRates?: { l10?: number | null; l20?: number | null; season?: number | null };
  greenScore?: number;
  betScore?: number;
  edge?: number;
  confidenceTier?: string;
  gameId: string;
  sport: string;
  gameStartTime?: string;
  team1: string;
  team2: string;
  team1Id?: string;
  team2Id?: string;
}

interface GroupedPlayer {
  key: string;
  playerName: string;
  team: string;
  opponent: string;
  gameId: string;
  sport: string;
  gameStartTime?: string;
  team1: string;
  team2: string;
  bestProp: PickRow;
  additionalCount: number;
  allProps: PickRow[];
}

interface GameCardData {
  key: string;
  gameId: string;
  team1: string;
  team2: string;
  gameTime: string | null;
  players: GroupedPlayer[];
}

// ── Helpers ──

const getScoreColor = (score: number): string => {
  if (score >= 75) return colors.success;
  if (score >= 60) return colors.primary;
  return colors.mutedForeground;
};

// ── Props ──

interface DirectoryPlayer {
  name: string;
  team: string;
  teamCode: string;
  position: string | null;
  headshotUrl: string | null;
  averages: { ppg?: number; rpg?: number; apg?: number };
  gamesPlayed: number;
}

interface BoardViewProps {
  games: CachedGame[];
  loading: boolean;
  error: string | null;
  directoryPlayers?: DirectoryPlayer[];
}

// ── Component ──

export const BoardView: React.FC<BoardViewProps> = ({ games, loading, error, directoryPlayers = [] }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("byGame");
  const [sportFilter, setSportFilter] = useState<SportFilter>("nba");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [showSportDropdown, setShowSportDropdown] = useState(false);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [showBookDropdown, setShowBookDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const contentFade = useRef(new Animated.Value(1)).current;
  const searchResultsAnim = useRef(new Animated.Value(0)).current;

  // ── Extract, filter, and group picks ──
  const { groupedPlayers, uniqueTeams, uniqueBooks } = useMemo(() => {
    const picks: PickRow[] = [];
    const teamsSet = new Set<string>();
    const booksSet = new Set<string>();

    games.forEach((game) => {
      // Sport filter
      if (game.sport !== sportFilter) return;

      const mlProps = game.analysis?.mlPlayerProps;
      const topProps = mlProps?.edgeBoard?.topProps || mlProps?.topProps || [];

      topProps.forEach((prop: any) => {
        if (!prop.playerName || !prop.statType) return;

        const isHomeTeam = prop.team === game.team1;
        const opponent = isHomeTeam ? game.team2 : game.team1;
        const gs = prop.greenScore || 0;

        picks.push({
          key: `${game.id}-${prop.playerName}-${prop.statType}-${prop.line}`,
          playerName: prop.playerName,
          team: prop.team || "",
          opponent,
          statType: prop.statType,
          line: prop.line,
          prediction: prop.prediction?.toLowerCase() || "over",
          oddsOver: prop.oddsOver,
          oddsUnder: prop.oddsUnder,
          bookmakerOver: prop.bookmakerOver,
          bookmakerUnder: prop.bookmakerUnder,
          allBks: prop.allBks,
          l10Avg: prop.l10Avg,
          hitRates: prop.hitRates,
          directionalHitRates: prop.directionalHitRates,
          greenScore: gs,
          betScore: prop.betScore,
          edge: prop.edge,
          confidenceTier: prop.confidenceTier || prop.bettingValue || "medium",
          gameId: game.id,
          sport: game.sport,
          gameStartTime: game.gameStartTime,
          team1: game.team1,
          team2: game.team2,
          team1Id: game.team1Id,
          team2Id: game.team2Id,
        });

        if (prop.team) teamsSet.add(prop.team);
        // Collect all bookmakers from allBks array
        if (prop.allBks) {
          for (const b of prop.allBks) booksSet.add(b.bk);
        }
        // Fallback for old cached data without allBks
        if (!prop.allBks || prop.allBks.length === 0) {
          if (prop.bookmakerOver) booksSet.add(prop.bookmakerOver);
          if (prop.bookmakerUnder) booksSet.add(prop.bookmakerUnder);
        }
      });
    });

    // Group by player + game
    const playerMap = new Map<string, GroupedPlayer>();
    picks.forEach((pick) => {
      const groupKey = `${pick.playerName}-${pick.gameId}`;
      if (!playerMap.has(groupKey)) {
        playerMap.set(groupKey, {
          key: groupKey,
          playerName: pick.playerName,
          team: pick.team,
          opponent: pick.opponent,
          gameId: pick.gameId,
          sport: pick.sport,
          gameStartTime: pick.gameStartTime,
          team1: pick.team1,
          team2: pick.team2,
          bestProp: pick,
          additionalCount: 0,
          allProps: [pick],
        });
      } else {
        const group = playerMap.get(groupKey)!;
        group.allProps.push(pick);
        group.additionalCount++;
        if ((pick.greenScore || 0) > (group.bestProp.greenScore || 0)) {
          group.bestProp = pick;
        }
      }
    });

    // Sort by betScore (primary), then greenScore, then directional L10 hit rate
    const dirL10 = (p: PickRow): number => {
      if (p.directionalHitRates?.l10 != null) return p.directionalHitRates.l10;
      const raw = p.hitRates?.l10?.pct;
      if (raw == null) return 0;
      return p.prediction === "over" ? raw : 100 - raw;
    };
    const grouped = Array.from(playerMap.values()).sort((a, b) => {
      const scoreDiff = (b.bestProp.betScore || 0) - (a.bestProp.betScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const greenDiff = (b.bestProp.greenScore || 0) - (a.bestProp.greenScore || 0);
      if (greenDiff !== 0) return greenDiff;
      return dirL10(b.bestProp) - dirL10(a.bestProp);
    });

    return { groupedPlayers: grouped, uniqueTeams: Array.from(teamsSet).sort(), uniqueBooks: Array.from(booksSet).sort() };
  }, [games, sportFilter]);

  // ── Team + bookmaker filter ──
  const filteredPlayers = useMemo(() => {
    let result = groupedPlayers;
    if (teamFilter !== "all") {
      result = result.filter((p) => p.team === teamFilter);
    }
    if (bookFilter !== "all") {
      result = result.filter((p) => {
        // Check allBks on any of the player's props
        for (const prop of p.allProps) {
          if (prop.allBks?.some(b => b.bk === bookFilter)) return true;
        }
        // Fallback for old cached data
        const best = p.bestProp;
        return best.bookmakerOver === bookFilter || best.bookmakerUnder === bookFilter;
      });
    }
    return result;
  }, [groupedPlayers, teamFilter, bookFilter]);

  // ── Searchable player list ──
  // Uses the full 240-player directory when available, falls back to cached games
  const searchablePlayers = useMemo(() => {
    if (directoryPlayers.length > 0) {
      // Count active props per player from cached games
      const propsMap = new Map<string, number>();
      for (const p of groupedPlayers) {
        const key = p.playerName.toLowerCase();
        propsMap.set(key, (propsMap.get(key) || 0) + p.allProps.length);
      }
      return directoryPlayers.map((dp) => ({
        playerName: dp.name,
        team: dp.team,
        teamCode: dp.teamCode,
        headshotUrl: dp.headshotUrl,
        ppg: dp.averages?.ppg,
        propsCount: propsMap.get(dp.name.toLowerCase()) || 0,
      }));
    }
    // Fallback: extract from cached games
    const seen = new Map<string, { playerName: string; team: string; teamCode: string; headshotUrl: string | null; ppg: number | undefined; propsCount: number }>();
    for (const p of groupedPlayers) {
      const key = p.playerName.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, { playerName: p.playerName, team: p.team, teamCode: getTeamAbbreviation(p.team), headshotUrl: null, ppg: undefined, propsCount: p.allProps.length });
      } else {
        seen.get(key)!.propsCount += p.allProps.length;
      }
    }
    return Array.from(seen.values());
  }, [directoryPlayers, groupedPlayers]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return searchablePlayers
      .filter((p) => p.playerName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchQuery, searchablePlayers]);

  // Animate content fade when search is active
  const isSearchActive = searchFocused || searchQuery.length > 0;
  useEffect(() => {
    Animated.timing(contentFade, {
      toValue: isSearchActive ? 0.15 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isSearchActive]);

  // Animate search results dropdown
  useEffect(() => {
    const showResults = searchFocused && searchResults.length > 0;
    Animated.spring(searchResultsAnim, {
      toValue: showResults ? 1 : 0,
      damping: 20,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  }, [searchFocused, searchResults.length]);

  const handleSearchSelect = useCallback((playerName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Keyboard.dismiss();
    setSearchQuery("");
    setSearchFocused(false);

    // Always go to unified player profile — defaults to Props view if player has props
    const playerGroup = groupedPlayers.find(
      (p) => p.playerName.toLowerCase() === playerName.toLowerCase()
    );
    router.push({
      pathname: "/player-profile" as any,
      params: {
        playerName,
        from: "board",
        ...(playerGroup ? {
          initialView: "props",
          statType: playerGroup.bestProp.statType,
          line: String(playerGroup.bestProp.line),
        } : {
          initialView: "stats",
        }),
      },
    });
  }, [groupedPlayers]);

  // ── Game cards data (for Games mode) ──
  const gameCards = useMemo((): GameCardData[] => {
    const byGame = new Map<string, GameCardData>();
    filteredPlayers.forEach((player) => {
      if (!byGame.has(player.gameId)) {
        byGame.set(player.gameId, {
          key: player.gameId,
          gameId: player.gameId,
          team1: player.team1,
          team2: player.team2,
          gameTime: formatGameTime(player.gameStartTime),
          players: [],
        });
      }
      byGame.get(player.gameId)!.players.push(player);
    });
    const cards = Array.from(byGame.values());
    cards.sort((a, b) => {
      if (!a.gameTime && !b.gameTime) return 0;
      if (!a.gameTime) return 1;
      if (!b.gameTime) return -1;
      return 0;
    });
    return cards;
  }, [filteredPlayers]);

  // ── Ensure even count for 2-col grid (pad with null) ──
  const tilesData = useMemo(() => {
    const data: (GroupedPlayer | null)[] = [...filteredPlayers];
    if (data.length % 2 !== 0) data.push(null);
    return data;
  }, [filteredPlayers]);

  // ── Team options ──
  const teamOptions = useMemo(() => {
    const opts: { id: TeamFilter; label: string }[] = [{ id: "all", label: "All Teams" }];
    uniqueTeams.forEach((team) => {
      const parts = team.split(" ");
      opts.push({ id: team, label: parts[parts.length - 1] });
    });
    return opts;
  }, [uniqueTeams]);

  const currentTeamLabel = teamOptions.find((o) => o.id === teamFilter)?.label || "All Teams";
  const currentSportLabel = SPORT_LIST.find((s) => s.id === sportFilter)?.label || "NBA";
  const currentViewLabel = VIEW_MODE_OPTIONS.find((v) => v.id === viewMode)?.label || "Players";

  // ── Navigation ──
  const handlePlayerPress = useCallback((player: GroupedPlayer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const best = player.bestProp;
    const otherProps = player.allProps
      .filter((p) => p.key !== best.key)
      .map((p) => JSON.stringify({
        statType: p.statType,
        line: p.line,
        prediction: p.prediction,
        oddsOver: p.oddsOver,
        oddsUnder: p.oddsUnder,
        bookmakerOver: p.bookmakerOver,
        bookmakerUnder: p.bookmakerUnder,
        l10Avg: p.l10Avg,
        greenScore: p.greenScore,
      }));

    router.push({
      pathname: "/player-profile" as any,
      params: {
        playerName: best.playerName,
        statType: best.statType,
        line: String(best.line),
        initialView: "props",
        from: "board",
      },
    });
  }, []);

  // ═══════════════════════════════════════════════
  // TOP MODE — 2-Column Player Tiles
  // ═══════════════════════════════════════════════

  const renderPlayerTile = useCallback(({ item }: { item: GroupedPlayer | null }) => {
    if (!item) return <View style={{ width: TILE_WIDTH }} />;

    const best = item.bestProp;
    const isOver = best.prediction === "over";
    // If filtering by bookmaker, show that book's odds; otherwise best odds
    let odds = isOver ? best.oddsOver : best.oddsUnder;
    let bookmaker = isOver ? best.bookmakerOver : best.bookmakerUnder;
    if (bookFilter !== "all" && best.allBks) {
      const match = best.allBks.find(b => b.bk === bookFilter);
      if (match) { odds = match.odds; bookmaker = match.bk; }
    }
    const bookLogo = bookmaker ? BOOKMAKER_LOGOS[bookmaker] : null;
    // Directional L10: shows hit rate matching the prediction direction
    const l10Pct = best.directionalHitRates?.l10
      ?? (best.hitRates?.l10?.pct != null
        ? (isOver ? best.hitRates.l10.pct : 100 - best.hitRates.l10.pct)
        : null);
    const score = best.betScore ?? 0;
    const scoreColor = getScoreColor(score);
    const playerImage = getPlayerImage(item.playerName);

    return (
      <Pressable
        onPress={() => handlePlayerPress(item)}
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
      >
        {/* Headshot */}
        <View style={styles.tileHeadshotWrap}>
          {playerImage ? (
            <ExpoImage source={playerImage} style={styles.tileHeadshot} contentFit="cover" />
          ) : (
            <View style={styles.tileHeadshotPlaceholder}>
              <Text style={styles.tileInitials}>
                {item.playerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </Text>
            </View>
          )}
        </View>

        {/* Name + Team */}
        <Text style={styles.tileName} numberOfLines={1}>{item.playerName}</Text>
        <Text style={styles.tileMatchup} numberOfLines={1}>
          {getTeamAbbreviation(item.team)} · vs {getTeamAbbreviation(item.opponent)}
        </Text>

        {/* Stat + Line + Odds + Book — all on one line */}
        <View style={styles.tilePropRow}>
          <Text style={styles.tileStatType}>{formatStatType(best.statType)}</Text>
          <Text style={[styles.tileDirection, isOver ? styles.tileOver : styles.tileUnder]}>
            {isOver ? "O" : "U"} {best.line}
          </Text>
          {odds != null && <Text style={styles.tileOdds}>{formatOdds(odds)}</Text>}
          {bookLogo && <ExpoImage source={bookLogo} style={styles.tileBookLogo} contentFit="contain" />}
        </View>

        {/* Bottom: L10 + Bet Score */}
        <View style={styles.tileBottomRow}>
          {l10Pct != null && (
            <Text style={styles.tileHitRate}>L10: {Math.round(l10Pct)}%</Text>
          )}
          {score > 0 && (
            <View style={[styles.confidenceBadge, { backgroundColor: `${scoreColor}20` }]}>
              <Text style={[styles.confidenceBadgeText, { color: scoreColor }]}>
                {score}%
              </Text>
            </View>
          )}
        </View>

        {/* +N more */}
        {item.additionalCount > 0 && (
          <View style={styles.tileMoreBadge}>
            <Text style={styles.tileMoreText}>+{item.additionalCount} more</Text>
          </View>
        )}
      </Pressable>
    );
  }, [handlePlayerPress]);

  // ═══════════════════════════════════════════════
  // GAMES MODE — Game Cards with Player Rows
  // ═══════════════════════════════════════════════

  const renderGameCard = useCallback(({ item: game }: { item: GameCardData }) => (
    <View style={styles.gameCard}>
      {/* Game Header */}
      <View style={styles.gameHeader}>
        <View style={styles.gameHeaderLeft}>
          <Ionicons name="basketball" size={16} color={colors.primary} />
          <Text style={styles.gameHeaderTitle}>
            {getTeamAbbreviation(game.team1)} vs {getTeamAbbreviation(game.team2)}
          </Text>
        </View>
        {game.gameTime && (
          <Text style={styles.gameHeaderTime}>{game.gameTime}</Text>
        )}
      </View>

      {/* Player Rows Inside Card */}
      {game.players.map((player, idx) => {
        const best = player.bestProp;
        const isOver = best.prediction === "over";
        let odds = isOver ? best.oddsOver : best.oddsUnder;
        let bookmaker = isOver ? best.bookmakerOver : best.bookmakerUnder;
        if (bookFilter !== "all" && best.allBks) {
          const match = best.allBks.find(b => b.bk === bookFilter);
          if (match) { odds = match.odds; bookmaker = match.bk; }
        }
        const bookLogo = bookmaker ? BOOKMAKER_LOGOS[bookmaker] : null;
        // Directional L10: shows hit rate matching the prediction direction
        const l10Pct = best.directionalHitRates?.l10
          ?? (best.hitRates?.l10?.pct != null
            ? (isOver ? best.hitRates.l10.pct : 100 - best.hitRates.l10.pct)
            : null);
        const score = best.betScore ?? 0;
        const scoreColor = getScoreColor(score);
        const playerImage = getPlayerImage(player.playerName);

        return (
          <Pressable
            key={player.key}
            onPress={() => handlePlayerPress(player)}
            style={({ pressed }) => [
              styles.gamePlayerRow,
              pressed && styles.gamePlayerRowPressed,
              idx < game.players.length - 1 && styles.gamePlayerRowDivider,
            ]}
          >
            {/* Headshot */}
            <View style={styles.gameHeadshotWrap}>
              {playerImage ? (
                <ExpoImage source={playerImage} style={styles.gameHeadshot} contentFit="cover" />
              ) : (
                <View style={styles.gameHeadshotPlaceholder}>
                  <Text style={styles.gameInitials}>
                    {player.playerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Info */}
            <View style={styles.gamePlayerInfo}>
              <View style={styles.gamePlayerNameRow}>
                <Text style={styles.gamePlayerName} numberOfLines={1}>{player.playerName}</Text>
                <Text style={styles.gamePlayerTeam}>{getTeamAbbreviation(player.team)}</Text>
                {player.additionalCount > 0 && (
                  <View style={styles.moreBadge}>
                    <Text style={styles.moreBadgeText}>+{player.additionalCount}</Text>
                  </View>
                )}
              </View>
              <View style={styles.gamePlayerPropRow}>
                <Text style={styles.gameStatType}>{formatStatType(best.statType)}</Text>
                <Text style={[styles.gameDirection, isOver ? styles.pickOver : styles.pickUnder]}>
                  {isOver ? "O" : "U"} {best.line}
                </Text>
                {odds != null && <Text style={styles.gameOdds}>{formatOdds(odds)}</Text>}
                {bookLogo && <ExpoImage source={bookLogo} style={styles.gameBookLogo} contentFit="contain" />}
              </View>
            </View>

            {/* Right: Signals */}
            <View style={styles.gameSignals}>
              {l10Pct != null && (
                <Text style={styles.gameHitRate}>L10: {Math.round(l10Pct)}%</Text>
              )}
              {score > 0 && (
                <View style={[styles.confidenceBadge, { backgroundColor: `${scoreColor}20` }]}>
                  <Text style={[styles.confidenceBadgeText, { color: scoreColor }]}>
                    {score}%
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  ), [handlePlayerPress]);

  // ═══════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════

  const dismissSearch = useCallback(() => {
    Keyboard.dismiss();
    setSearchQuery("");
    setSearchFocused(false);
    searchInputRef.current?.blur();
  }, []);

  const renderSearchBar = () => (
    <View style={styles.searchContainer}>
      <View style={[styles.searchInputWrapper, isSearchActive && styles.searchInputWrapperActive]}>
        <Ionicons name="search" size={16} color={isSearchActive ? colors.primary : colors.mutedForeground} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search player..."
          placeholderTextColor={colors.mutedForeground}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setSearchFocused(true)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
        />
        {isSearchActive && (
          <Pressable onPress={dismissSearch} hitSlop={8}>
            <Text style={styles.searchCancelText}>Cancel</Text>
          </Pressable>
        )}
      </View>
      {searchFocused && searchResults.length > 0 && (
        <Animated.View style={[styles.searchResults, {
          opacity: searchResultsAnim,
          transform: [{ translateY: searchResultsAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        }]}>
          {searchResults.map((result, index) => {
            const abbrev = result.teamCode || getTeamAbbreviation(result.team);
            const localImage = getPlayerImage(result.playerName, abbrev);
            const hasRemoteHeadshot = !!result.headshotUrl;
            return (
              <Pressable
                key={`${result.playerName}-${index}`}
                style={({ pressed }) => [styles.searchResultRow, pressed && styles.searchResultRowPressed]}
                onPress={() => handleSearchSelect(result.playerName)}
              >
                {hasRemoteHeadshot ? (
                  <ExpoImage source={{ uri: result.headshotUrl! }} style={styles.searchResultAvatar} contentFit="cover" />
                ) : localImage ? (
                  <Image source={localImage} style={styles.searchResultAvatar} />
                ) : (
                  <View style={styles.searchResultAvatarPlaceholder}>
                    <Ionicons name="person" size={14} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={styles.searchResultInfo}>
                  <Text style={styles.searchResultName} numberOfLines={1}>{result.playerName}</Text>
                  <Text style={styles.searchResultTeam}>
                    {abbrev}{result.ppg != null ? ` · ${result.ppg} PPG` : ""}{result.propsCount > 0 ? ` · ${result.propsCount} prop${result.propsCount !== 1 ? "s" : ""}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
            );
          })}
        </Animated.View>
      )}
      {isSearchActive && searchQuery.length >= 2 && searchResults.length === 0 && (
        <View style={styles.searchNoResults}>
          <Text style={styles.searchNoResultsText}>No players found</Text>
        </View>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <Animated.View style={[styles.titleRow, { opacity: contentFade }]}>
        <Text style={styles.title}>Today's Picks</Text>
      </Animated.View>
      {renderSearchBar()}
      {!isSearchActive && <View style={styles.headerFilters}>
        {/* Sport dropdown chip */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSportDropdown(true);
          }}
          style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
        >
          <Ionicons
            name={SPORT_LIST.find((s) => s.id === sportFilter)?.icon as any || "basketball"}
            size={12}
            color={colors.primary}
          />
          <Text style={styles.filterChipText}>{currentSportLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
        </Pressable>

        {/* View mode dropdown chip */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowViewDropdown(true);
          }}
          style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
        >
          <Ionicons
            name={VIEW_MODE_OPTIONS.find((v) => v.id === viewMode)?.icon as any || "people"}
            size={12}
            color={colors.primary}
          />
          <Text style={styles.filterChipText}>{currentViewLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
        </Pressable>

        {/* Team dropdown chip */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowTeamDropdown(true);
          }}
          style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
        >
          <Text style={styles.filterChipText}>{currentTeamLabel}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
        </Pressable>

        {/* Bookmaker dropdown chip */}
        {uniqueBooks.length > 0 && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowBookDropdown(true);
            }}
            style={({ pressed }) => [styles.filterChip, pressed && styles.filterChipPressed]}
          >
            <Text style={styles.filterChipText}>{bookFilter === "all" ? "All Books" : bookFilter}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>}
    </View>
  );

  // ═══════════════════════════════════════════════
  // SPORT DROPDOWN
  // ═══════════════════════════════════════════════

  const renderSportDropdown = () => (
    <Modal visible={showSportDropdown} transparent animationType="fade" onRequestClose={() => setShowSportDropdown(false)}>
      <Pressable style={styles.dropdownOverlay} onPress={() => setShowSportDropdown(false)}>
        <View style={styles.dropdownContainer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Select Sport</Text>
            {SPORT_LIST.map((sport) => (
              <Pressable
                key={sport.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSportFilter(sport.id);
                  setTeamFilter("all");
                  setShowSportDropdown(false);
                }}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  sportFilter === sport.id && styles.dropdownOptionActive,
                  pressed && styles.dropdownOptionPressed,
                ]}
              >
                <Ionicons
                  name={sport.icon as any}
                  size={18}
                  color={sportFilter === sport.id ? colors.primary : colors.mutedForeground}
                />
                <Text style={[styles.dropdownOptionText, sportFilter === sport.id && styles.dropdownOptionTextActive]}>
                  {sport.label}
                </Text>
                {!sport.available && (
                  <Text style={styles.dropdownSoonBadge}>Soon</Text>
                )}
                {sportFilter === sport.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // ═══════════════════════════════════════════════
  // VIEW MODE DROPDOWN
  // ═══════════════════════════════════════════════

  const renderViewDropdown = () => (
    <Modal visible={showViewDropdown} transparent animationType="fade" onRequestClose={() => setShowViewDropdown(false)}>
      <Pressable style={styles.dropdownOverlay} onPress={() => setShowViewDropdown(false)}>
        <View style={styles.dropdownContainer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>View Mode</Text>
            {VIEW_MODE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setViewMode(opt.id);
                  setShowViewDropdown(false);
                }}
                style={({ pressed }) => [
                  styles.dropdownOption,
                  viewMode === opt.id && styles.dropdownOptionActive,
                  pressed && styles.dropdownOptionPressed,
                ]}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={18}
                  color={viewMode === opt.id ? colors.primary : colors.mutedForeground}
                />
                <Text style={[styles.dropdownOptionText, viewMode === opt.id && styles.dropdownOptionTextActive]}>
                  {opt.label}
                </Text>
                {viewMode === opt.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // ═══════════════════════════════════════════════
  // TEAM DROPDOWN
  // ═══════════════════════════════════════════════

  const renderTeamDropdown = () => (
    <Modal visible={showTeamDropdown} transparent animationType="fade" onRequestClose={() => setShowTeamDropdown(false)}>
      <Pressable style={styles.dropdownOverlay} onPress={() => setShowTeamDropdown(false)}>
        <View style={styles.dropdownContainer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Select Team</Text>
            <FlatList
              data={teamOptions}
              keyExtractor={(item) => item.id}
              style={styles.dropdownScroll}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: option }) => (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTeamFilter(option.id);
                    setShowTeamDropdown(false);
                  }}
                  style={({ pressed }) => [
                    styles.dropdownOption,
                    teamFilter === option.id && styles.dropdownOptionActive,
                    pressed && styles.dropdownOptionPressed,
                  ]}
                >
                  <Ionicons
                    name={option.id === "all" ? "people" : "basketball"}
                    size={18}
                    color={teamFilter === option.id ? colors.primary : colors.mutedForeground}
                  />
                  <Text style={[styles.dropdownOptionText, teamFilter === option.id && styles.dropdownOptionTextActive]}>
                    {option.label}
                  </Text>
                  {teamFilter === option.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  const bookOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [{ id: "all", label: "All Books" }];
    uniqueBooks.forEach((bk) => opts.push({ id: bk, label: bk }));
    return opts;
  }, [uniqueBooks]);

  const renderBookDropdown = () => (
    <Modal visible={showBookDropdown} transparent animationType="fade" onRequestClose={() => setShowBookDropdown(false)}>
      <Pressable style={styles.dropdownOverlay} onPress={() => setShowBookDropdown(false)}>
        <View style={styles.dropdownContainer}>
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.dropdownContent}>
            <Text style={styles.dropdownTitle}>Select Bookmaker</Text>
            <FlatList
              data={bookOptions}
              keyExtractor={(item) => item.id}
              style={styles.dropdownScroll}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: option }) => {
                const logo = option.id !== "all" ? BOOKMAKER_LOGOS[option.id] : null;
                return (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setBookFilter(option.id);
                      setShowBookDropdown(false);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      bookFilter === option.id && styles.dropdownOptionActive,
                      pressed && styles.dropdownOptionPressed,
                    ]}
                  >
                    {logo ? (
                      <ExpoImage source={logo} style={{ width: 18, height: 18 }} contentFit="contain" />
                    ) : (
                      <Ionicons name="book" size={18} color={bookFilter === option.id ? colors.primary : colors.mutedForeground} />
                    )}
                    <Text style={[styles.dropdownOptionText, bookFilter === option.id && styles.dropdownOptionTextActive]}>
                      {option.label}
                    </Text>
                    {bookFilter === option.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );

  // ═══════════════════════════════════════════════
  // STATES: Loading / Error / Empty
  // ═══════════════════════════════════════════════

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Loading picks...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Couldn't load picks right now</Text>
        </View>
      </View>
    );
  }

  // Check if selected sport is unavailable
  const selectedSport = SPORT_LIST.find((s) => s.id === sportFilter);
  if (selectedSport && !selectedSport.available) {
    return (
      <View style={styles.container}>
        {renderSportDropdown()}
        {renderViewDropdown()}
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Ionicons name={selectedSport.icon as any} size={40} color={colors.mutedForeground} style={{ marginBottom: spacing[2] }} />
          <Text style={styles.emptyText}>{selectedSport.label} Coming Soon</Text>
          <Text style={styles.emptySubtext}>Player props for {selectedSport.label.toLowerCase()} are in development</Text>
        </View>
      </View>
    );
  }

  if (filteredPlayers.length === 0) {
    return (
      <View style={styles.container}>
        {renderSportDropdown()}
        {renderViewDropdown()}
        {renderHeader()}
        {renderTeamDropdown()}
        {renderBookDropdown()}
        <View style={styles.emptyContainer}>
          <Ionicons name="analytics-outline" size={40} color={colors.mutedForeground} style={{ marginBottom: spacing[2] }} />
          <Text style={styles.emptyText}>
            {teamFilter === "all" ? "No picks available" : `No picks for ${currentTeamLabel}`}
          </Text>
          <Text style={styles.emptySubtext}>Check back closer to game time</Text>
        </View>
      </View>
    );
  }

  // ═══════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════

  return (
    <View style={styles.container}>
      {renderSportDropdown()}
      {renderViewDropdown()}
      {renderTeamDropdown()}
        {renderBookDropdown()}

      {viewMode === "topPicks" ? (
        <Animated.FlatList
          key="tiles-grid"
          data={isSearchActive ? [] : tilesData}
          keyExtractor={(item: any, index: number) => item?.key || `pad-${index}`}
          renderItem={renderPlayerTile as any}
          numColumns={2}
          columnWrapperStyle={styles.tileRow}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      ) : (
        <Animated.FlatList
          key="games-list"
          data={isSearchActive ? [] : gameCards}
          keyExtractor={(item: any) => item.key}
          renderItem={renderGameCard}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
};

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing[10],
  },

  // ── Header ──
  header: {
    paddingHorizontal: TILE_PADDING,
    paddingBottom: spacing[3],
  },
  headerFilters: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[2],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.foreground,
    fontSize: typography.sizes.xl,
    fontFamily: typography.fontFamily.bold,
  },
  // ── Search Bar ──
  searchContainer: {
    marginTop: spacing[2],
    marginBottom: spacing[1],
    zIndex: 10,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    height: 40,
    paddingHorizontal: spacing[3],
    backgroundColor: "rgba(22, 26, 34, 0.85)",
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
  },
  searchInputWrapperActive: {
    borderColor: "rgba(0, 215, 215, 0.35)",
    backgroundColor: "rgba(22, 26, 34, 0.95)",
  },
  searchCancelText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.foreground,
    paddingVertical: 0,
  },
  searchResults: {
    marginTop: spacing[1],
    backgroundColor: "rgba(22, 26, 34, 0.95)",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    overflow: "hidden",
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[2] + 2,
    paddingHorizontal: spacing[3],
    gap: spacing[2] + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  searchResultRowPressed: {
    backgroundColor: "rgba(0, 215, 215, 0.06)",
  },
  searchNoResults: {
    marginTop: spacing[1],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    backgroundColor: "rgba(22, 26, 34, 0.95)",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.15)",
    alignItems: "center",
  },
  searchNoResultsText: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  searchResultAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
  },
  searchResultAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchResultInfo: {
    flex: 1,
    gap: 1,
  },
  searchResultName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.semibold,
    color: colors.foreground,
  },
  searchResultTeam: {
    fontSize: 11,
    fontFamily: typography.fontFamily.regular,
    color: colors.mutedForeground,
  },

  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2] + 2,
    backgroundColor: colors.rgba.primary15,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  filterChipPressed: { opacity: 0.7 },
  filterChipText: {
    color: colors.foreground,
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
  },

  // ══════════════════════════════════════
  // TOP MODE — Player Tiles (2-col grid)
  // ══════════════════════════════════════

  tileRow: {
    paddingHorizontal: TILE_PADDING,
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  tile: {
    width: TILE_WIDTH,
    backgroundColor: glass.card.backgroundColor,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.08)",
    padding: spacing[3],
    alignItems: "center",
  },
  tilePressed: {
    backgroundColor: "rgba(22, 26, 34, 0.95)",
  },
  tileHeadshotWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    marginBottom: spacing[2],
  },
  tileHeadshot: {
    width: 48,
    height: 48,
  },
  tileHeadshotPlaceholder: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  tileInitials: {
    fontSize: 16,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  tileName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    textAlign: "center",
    marginBottom: 2,
  },
  tileMatchup: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: spacing[2],
  },
  tilePropRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
    marginBottom: spacing[2],
  },
  tileStatType: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  tileDirection: {
    fontSize: 13,
    fontFamily: typography.fontFamily.semibold,
  },
  tileOver: { color: colors.success },
  tileUnder: { color: "#FF6B6B" },
  // tileOddsRow removed — merged into tilePropRow
  tileOdds: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  tileBookLogo: {
    width: 18,
    height: 18,
  },
  tileBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  tileHitRate: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
  },
  tileMoreBadge: {
    marginTop: spacing[1],
  },
  tileMoreText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },

  // ══════════════════════════════════════
  // GAMES MODE — Game Cards
  // ══════════════════════════════════════

  gameCard: {
    marginHorizontal: TILE_PADDING,
    marginBottom: TILE_GAP,
    backgroundColor: glass.card.backgroundColor,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(0, 215, 215, 0.08)",
    overflow: "hidden",
  },
  gameHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
  },
  gameHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  gameHeaderTitle: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  gameHeaderTime: {
    fontSize: 12,
    fontFamily: typography.fontFamily.medium,
    color: colors.primary,
  },

  // Player rows inside game card
  gamePlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2] + 2,
    gap: spacing[2],
  },
  gamePlayerRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  gamePlayerRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.04)",
  },
  gameHeadshotWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  gameHeadshot: { width: 36, height: 36 },
  gameHeadshotPlaceholder: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  gameInitials: {
    fontSize: 13,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  gamePlayerInfo: {
    flex: 1,
    gap: 2,
  },
  gamePlayerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  gamePlayerName: {
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
    flexShrink: 1,
  },
  gamePlayerTeam: {
    fontSize: 11,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
  },
  gamePlayerPropRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  gameStatType: {
    fontSize: 12,
    fontFamily: typography.fontFamily.bold,
    color: colors.foreground,
  },
  gameDirection: {
    fontSize: 12,
    fontFamily: typography.fontFamily.semibold,
  },
  pickOver: { color: colors.success },
  pickUnder: { color: "#FF6B6B" },
  gameOdds: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  gameBookLogo: { width: 18, height: 18 },
  gameSignals: {
    alignItems: "flex-end",
    gap: spacing[1],
  },
  gameHitRate: {
    fontSize: 11,
    fontFamily: typography.fontFamily.bold,
    color: colors.success,
  },

  // ── Shared ──
  moreBadge: {
    backgroundColor: colors.rgba.primary15,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  moreBadgeText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
    color: colors.primary,
  },
  confidenceBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  confidenceBadgeText: {
    fontSize: 10,
    fontFamily: typography.fontFamily.bold,
  },

  // ── Dropdown ──
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownContainer: {
    width: SCREEN_WIDTH * 0.8,
    maxWidth: 300,
    maxHeight: 400,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.rgba.primary30,
  },
  dropdownContent: { padding: spacing[4] },
  dropdownTitle: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.medium,
    marginBottom: spacing[3],
    textAlign: "center",
  },
  dropdownScroll: { maxHeight: 300 },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.lg,
  },
  dropdownOptionActive: { backgroundColor: colors.rgba.primary15 },
  dropdownOptionPressed: { opacity: 0.7 },
  dropdownSoonBadge: {
    fontSize: 9,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    opacity: 0.6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  dropdownOptionText: {
    flex: 1,
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  dropdownOptionTextActive: { color: colors.foreground },

  // ── Empty ──
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[12],
  },
  emptyText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
  },
  emptySubtext: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fontFamily.regular,
    marginTop: spacing[1],
    opacity: 0.7,
  },
});

export default BoardView;
