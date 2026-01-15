/**
 * SportsGameOdds (SGO) API Service
 *
 * API Documentation: https://sportsgameodds.com/docs
 * Base URL: https://api.sportsgameodds.com/v2/
 *
 * This service handles all interactions with the SportsGameOdds API
 * for fetching real-time player props and betting odds.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SGO_BASE_URL = 'https://api.sportsgameodds.com/v2';

// API Key - configured for SportsGameOdds API
let SGO_API_KEY = 'b07ce45b95064ec5b62dcbb1ca5e7cf0';

/**
 * Set the SGO API key (call this on app initialization)
 */
export const setSGOApiKey = (apiKey: string) => {
  SGO_API_KEY = apiKey;
};

/**
 * Get the current API key (for debugging)
 */
export const getSGOApiKey = () => SGO_API_KEY;

// ============================================================================
// TYPES
// ============================================================================

// League ID mappings
export const LEAGUE_IDS = {
  NBA: 'NBA',
  NFL: 'NFL',
  MLB: 'MLB',
  NHL: 'NHL',
  NCAAB: 'NCAAB',
  NCAAF: 'NCAAF',
  EPL: 'EPL',
  UEFA_CHAMPIONS_LEAGUE: 'UEFA_CHAMPIONS_LEAGUE',
  MLS: 'MLS',
} as const;

// Sport ID mappings
export const SPORT_IDS = {
  BASKETBALL: 'BASKETBALL',
  FOOTBALL: 'FOOTBALL',
  BASEBALL: 'BASEBALL',
  HOCKEY: 'HOCKEY',
  SOCCER: 'SOCCER',
} as const;

// Common bookmaker IDs
export const BOOKMAKER_IDS = {
  DRAFTKINGS: 'draftkings',
  FANDUEL: 'fanduel',
  BETMGM: 'betmgm',
  CAESARS: 'caesars',
  BET365: 'bet365',
  PINNACLE: 'pinnacle',
  BETONLINE: 'betonline',
  BOVADA: 'bovada',
} as const;

// Bet type IDs
export const BET_TYPES = {
  MONEYLINE: 'ml',
  SPREAD: 'sp',
  OVER_UNDER: 'ou',
  YES_NO: 'yn',
  PROP: 'prop',
} as const;

// Period IDs
export const PERIODS = {
  GAME: 'game',
  FIRST_HALF: '1h',
  SECOND_HALF: '2h',
  FIRST_QUARTER: '1q',
  SECOND_QUARTER: '2q',
  THIRD_QUARTER: '3q',
  FOURTH_QUARTER: '4q',
} as const;

// Common stat IDs by sport
export const STAT_IDS = {
  // Basketball
  POINTS: 'points',
  REBOUNDS: 'rebounds',
  ASSISTS: 'assists',
  BLOCKS: 'blocks',
  STEALS: 'steals',
  THREE_POINTERS: 'threePointersMade',

  // Football
  PASSING_YARDS: 'passing_yards',
  PASSING_TOUCHDOWNS: 'passing_touchdowns',
  RUSHING_YARDS: 'rushing_yards',
  RUSHING_TOUCHDOWNS: 'rushing_touchdowns',
  RECEIVING_YARDS: 'receiving_yards',
  RECEIVING_TOUCHDOWNS: 'receiving_touchdowns',
  RECEPTIONS: 'receptions',

  // Soccer
  GOALS: 'points', // In soccer, goals use 'points' statID
  SOCCER_ASSISTS: 'assists',
  SHOTS: 'shots',
} as const;

// API Response types
export interface SGOEvent {
  eventID: string;
  sportID: string;
  leagueID: string;
  type: string;
  teams: {
    home: SGOTeam;
    away: SGOTeam;
  };
  status: SGOEventStatus;
  players?: Record<string, SGOPlayer>;
  odds?: Record<string, SGOOdd>;
  results?: Record<string, any>;
}

export interface SGOTeam {
  teamID: string;
  names: {
    short: string;
    medium: string;
    long: string;
  };
  colors?: {
    primary: string;
    secondary: string;
  };
}

export interface SGOEventStatus {
  started: boolean;
  completed: boolean;
  cancelled: boolean;
  ended: boolean;
  live: boolean;
  finalized: boolean;
  startsAt: string;
  oddsPresent: boolean;
  oddsAvailable: boolean;
}

export interface SGOPlayer {
  playerID: string;
  // SGO uses flat name fields, not nested names object
  name?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  jerseyNumber?: number;
  teamID?: string;
}

export interface SGOOdd {
  oddID: string;
  marketName?: string;
  statID: string;
  statEntityID: string;
  periodID: string;
  betTypeID: string;
  sideID: string;
  playerID?: string;
  bookOddsAvailable?: boolean;
  fairOdds?: string; // SGO returns odds as strings like "-110"
  fairSpread?: string;
  fairOverUnder?: string;
  bookOdds?: string;
  bookOverUnder?: string;
  byBookmaker?: Record<string, SGOBookmakerOdd>;
}

export interface SGOBookmakerOdd {
  odds: string; // SGO returns odds as strings like "-110"
  available: boolean;
  overUnder?: string; // Also a string like "19.5"
  spread?: string;
  deeplink?: string;
  lastUpdatedAt?: string;
}

export interface SGOEventsResponse {
  success: boolean;
  data: SGOEvent[];
  nextCursor?: string;
}

export interface SGOPlayersResponse {
  success: boolean;
  data: SGOPlayer[];
  nextCursor?: string;
}

// Internal types for processed data
export interface ProcessedPlayerProp {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  statType: string;
  statLabel: string;
  consensusLine: number;
  props: {
    bookmaker: string;
    bookmakerKey: string;
    line: number;
    overOdds: number;
    underOdds: number;
  }[];
  bestOver: { bookmaker: string; odds: number; line: number };
  bestUnder: { bookmaker: string; odds: number; line: number };
}

export interface PlayerPropsResult {
  sport: string;
  eventId: string;
  teams: {
    home: string;
    away: string;
    logos: { home: string; away: string };
  };
  playerProps: {
    team1: ProcessedPlayerProp[];
    team2: ProcessedPlayerProp[];
  };
  timestamp: string;
}

// ============================================================================
// API HELPERS
// ============================================================================

/**
 * Build query string from params object
 */
const buildQueryString = (params: Record<string, string | number | boolean | undefined>): string => {
  const filteredParams = Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return filteredParams.length > 0 ? `?${filteredParams.join('&')}` : '';
};

/**
 * Make authenticated request to SGO API
 */
const sgoFetch = async <T>(endpoint: string, params: Record<string, any> = {}): Promise<T> => {
  if (!SGO_API_KEY) {
    throw new Error('SGO API key not configured. Call setSGOApiKey() first.');
  }

  const queryString = buildQueryString({
    ...params,
    apiKey: SGO_API_KEY,
  });

  const url = `${SGO_BASE_URL}${endpoint}${queryString}`;
  console.log('[SGO API] Fetching:', url.replace(SGO_API_KEY, '***'));

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `SGO API Error: ${response.status} - ${errorData.message || response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('[SGO API] Request failed:', error);
    throw error;
  }
};

// ============================================================================
// STAT LABEL MAPPINGS
// ============================================================================

const STAT_LABELS: Record<string, string> = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  blocks: 'Blocks',
  steals: 'Steals',
  threePointersMade: '3-Pointers',
  fieldGoalsMade: 'FG Made',
  freeThrowsMade: 'FT Made',
  passing_yards: 'Pass Yds',
  passing_touchdowns: 'Pass TDs',
  rushing_yards: 'Rush Yds',
  rushing_touchdowns: 'Rush TDs',
  receiving_yards: 'Rec Yds',
  receiving_touchdowns: 'Rec TDs',
  receptions: 'Receptions',
  goals: 'Goals',
  shots: 'Shots',
};

const getStatLabel = (statId: string): string => {
  return STAT_LABELS[statId] || statId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

// ============================================================================
// BOOKMAKER NAME MAPPINGS
// ============================================================================

const BOOKMAKER_NAMES: Record<string, string> = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  betmgm: 'BetMGM',
  caesars: 'Caesars',
  bet365: 'Bet365',
  pinnacle: 'Pinnacle',
  betonline: 'BetOnline',
  bovada: 'Bovada',
  betrivers: 'BetRivers',
  espnbet: 'ESPN BET',
  pointsbet: 'PointsBet',
  circa: 'Circa',
};

const getBookmakerName = (bookmakerKey: string): string => {
  return BOOKMAKER_NAMES[bookmakerKey.toLowerCase()] || bookmakerKey;
};

// ============================================================================
// API METHODS
// ============================================================================

/**
 * Get events with player props odds
 */
export const getEvents = async (options: {
  leagueID?: string;
  sportID?: string;
  teamID?: string;
  eventID?: string;
  oddsAvailable?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<SGOEventsResponse> => {
  return sgoFetch<SGOEventsResponse>('/events/', {
    leagueID: options.leagueID,
    sportID: options.sportID,
    teamID: options.teamID,
    eventID: options.eventID,
    oddsAvailable: options.oddsAvailable,
    limit: options.limit || 10,
    cursor: options.cursor,
  });
};

/**
 * Get a specific event by ID
 */
export const getEventById = async (eventId: string): Promise<SGOEvent | null> => {
  const response = await sgoFetch<SGOEventsResponse>('/events/', {
    eventID: eventId,
    oddsAvailable: true,
  });

  return response.data?.[0] || null;
};

/**
 * Find event by team names
 */
export const findEventByTeams = async (
  team1: string,
  team2: string,
  leagueId: string
): Promise<SGOEvent | null> => {
  // Get upcoming events for the league
  const response = await getEvents({
    leagueID: leagueId,
    oddsAvailable: true,
    limit: 50,
  });

  // Find event matching both teams
  const normalizeTeamName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '');

  const team1Normalized = normalizeTeamName(team1);
  const team2Normalized = normalizeTeamName(team2);

  for (const event of response.data) {
    const homeNormalized = normalizeTeamName(event.teams.home.names.long);
    const awayNormalized = normalizeTeamName(event.teams.away.names.long);

    // Check if both teams match (in either order)
    const teamsMatch =
      (homeNormalized.includes(team1Normalized) || team1Normalized.includes(homeNormalized) ||
       homeNormalized.includes(team2Normalized) || team2Normalized.includes(homeNormalized)) &&
      (awayNormalized.includes(team1Normalized) || team1Normalized.includes(awayNormalized) ||
       awayNormalized.includes(team2Normalized) || team2Normalized.includes(awayNormalized));

    if (teamsMatch) {
      console.log('[SGO API] Found matching event:', event.eventID);
      return event;
    }
  }

  console.log('[SGO API] No matching event found for teams:', team1, team2);
  return null;
};

/**
 * Get players for an event
 */
export const getPlayersForEvent = async (eventId: string): Promise<SGOPlayer[]> => {
  const response = await sgoFetch<SGOPlayersResponse>('/players/', {
    eventID: eventId,
    limit: 100,
  });

  return response.data || [];
};

/**
 * Map league name to SGO league ID
 */
export const mapLeagueId = (sport: string): string => {
  const sportLower = sport.toLowerCase();

  if (sportLower === 'nba') return LEAGUE_IDS.NBA;
  if (sportLower === 'nfl') return LEAGUE_IDS.NFL;
  if (sportLower === 'mlb') return LEAGUE_IDS.MLB;
  if (sportLower === 'nhl') return LEAGUE_IDS.NHL;
  if (sportLower.includes('soccer') || sportLower === 'epl') return LEAGUE_IDS.EPL;
  if (sportLower.includes('ncaa') && sportLower.includes('basketball')) return LEAGUE_IDS.NCAAB;
  if (sportLower.includes('ncaa') && sportLower.includes('football')) return LEAGUE_IDS.NCAAF;

  // Default to NFL
  return LEAGUE_IDS.NFL;
};

// ============================================================================
// PLAYER PROPS PROCESSING
// ============================================================================

/**
 * Extract player props from event odds
 */
const extractPlayerProps = (
  event: SGOEvent,
  homeTeamName: string,
  awayTeamName: string
): { team1: ProcessedPlayerProp[]; team2: ProcessedPlayerProp[] } => {
  const team1Props: ProcessedPlayerProp[] = [];
  const team2Props: ProcessedPlayerProp[] = [];

  if (!event.odds) {
    console.log('[SGO API] No odds data in event');
    return { team1: team1Props, team2: team2Props };
  }

  // Log player data availability
  const playerCount = event.players ? Object.keys(event.players).length : 0;
  console.log(`[SGO API] Event has ${Object.keys(event.odds).length} odds, ${playerCount} players`);

  // Group odds by player and stat
  const playerOddsMap: Record<string, { over?: SGOOdd; under?: SGOOdd }> = {};

  for (const [, odd] of Object.entries(event.odds)) {
    // Only process player props (over/under bets with player IDs)
    if (!odd.playerID || odd.betTypeID !== 'ou') continue;

    const key = `${odd.playerID}-${odd.statID}`;

    if (!playerOddsMap[key]) {
      playerOddsMap[key] = {};
    }

    if (odd.sideID === 'over') {
      playerOddsMap[key].over = odd;
    } else if (odd.sideID === 'under') {
      playerOddsMap[key].under = odd;
    }
  }

  // Process each player/stat combination
  for (const [, odds] of Object.entries(playerOddsMap)) {
    const overOdd = odds.over;
    const underOdd = odds.under;

    if (!overOdd || !underOdd) continue;

    // Try to get player from event.players, but handle missing data gracefully
    const player = event.players?.[overOdd.playerID!];

    // Extract player name - try multiple sources
    let playerName = '';
    let playerPosition = '';
    let playerTeamId = '';

    if (player?.name) {
      // SGO uses flat 'name' field
      playerName = player.name;
      playerPosition = player.position || '';
      playerTeamId = player.teamID || '';
    } else if (player?.firstName && player?.lastName) {
      // Try firstName + lastName
      playerName = `${player.firstName} ${player.lastName}`.trim();
      playerPosition = player.position || '';
      playerTeamId = player.teamID || '';
    } else if (overOdd.marketName) {
      // Extract name from marketName (e.g., "Paul George Points+Assists Over/Under")
      const nameMatch = overOdd.marketName.match(/^([A-Za-z\s\.\-']+?)(?:\s+(?:Points|Rebounds|Assists|Blocks|Steals|Yards|Touchdowns|Receptions|Goals|Shots|To Record|3-Pointers))/i);
      if (nameMatch) {
        playerName = nameMatch[1].trim();
      }
    }

    // If we still don't have a player name, try parsing the playerID
    if (!playerName && overOdd.playerID) {
      // PlayerID format: PAUL_GEORGE_1_NBA -> Paul George
      const parts = overOdd.playerID.split('_');
      // Remove the last 2 parts (number and league like "1_NBA")
      const nameParts = parts.slice(0, -2);
      playerName = nameParts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    }

    if (!playerName) continue; // Skip if we can't determine player name

    // Determine which team the player belongs to
    // Strategy:
    // 1. Use player.teamID if available
    // 2. Try to extract team code from playerID (format: NAME_NAME_TEAMCODE_LEAGUE)
    // 3. Check if the statEntityID contains team info
    // 4. Default based on alternating to distribute evenly

    let isHomeTeam: boolean | null = null;

    // First, check player.teamID
    if (playerTeamId) {
      isHomeTeam = playerTeamId === event.teams.home.teamID;
      console.log(`[SGO API] Player ${playerName} team from teamID: ${playerTeamId} -> ${isHomeTeam ? 'home' : 'away'}`);
    }

    // If no teamID, try to extract from playerID
    // Format examples: ANDRE_DRUMMOND_PHI_NBA, TYRESE_MAXEY_PHI_NBA
    if (isHomeTeam === null && overOdd.playerID) {
      const parts = overOdd.playerID.split('_');
      if (parts.length >= 3) {
        // Team code is typically second-to-last part
        const potentialTeamCode = parts[parts.length - 2];

        // Check if this team code matches home or away team
        const homeTeamId = event.teams.home.teamID?.toUpperCase() || '';
        const awayTeamId = event.teams.away.teamID?.toUpperCase() || '';
        const homeShort = event.teams.home.names?.short?.toUpperCase() || '';
        const awayShort = event.teams.away.names?.short?.toUpperCase() || '';

        if (potentialTeamCode === homeTeamId || potentialTeamCode === homeShort ||
            homeTeamId.includes(potentialTeamCode) || potentialTeamCode.includes(homeShort)) {
          isHomeTeam = true;
          console.log(`[SGO API] Player ${playerName} matched to home via playerID: ${potentialTeamCode}`);
        } else if (potentialTeamCode === awayTeamId || potentialTeamCode === awayShort ||
                   awayTeamId.includes(potentialTeamCode) || potentialTeamCode.includes(awayShort)) {
          isHomeTeam = false;
          console.log(`[SGO API] Player ${playerName} matched to away via playerID: ${potentialTeamCode}`);
        }
      }
    }

    // If still unknown, check statEntityID which may contain player@team
    if (isHomeTeam === null && overOdd.statEntityID) {
      const entityLower = overOdd.statEntityID.toLowerCase();
      const homeTeamId = event.teams.home.teamID?.toLowerCase() || '';
      const awayTeamId = event.teams.away.teamID?.toLowerCase() || '';

      if (entityLower.includes(homeTeamId)) {
        isHomeTeam = true;
      } else if (entityLower.includes(awayTeamId)) {
        isHomeTeam = false;
      }
    }

    // Final fallback: Default to home team (most APIs list home team players first)
    if (isHomeTeam === null) {
      isHomeTeam = true;
      console.log(`[SGO API] Player ${playerName} defaulting to home (couldn't determine team)`);
    }

    // Build props array from bookmaker odds
    const propLines: ProcessedPlayerProp['props'] = [];
    let bestOver = { bookmaker: '', odds: -Infinity, line: 0 };
    let bestUnder = { bookmaker: '', odds: -Infinity, line: 0 };

    // Helper to parse odds string to number (e.g., "-110" -> -110, "+150" -> 150)
    const parseOdds = (oddsStr: string): number => {
      const num = parseInt(oddsStr, 10);
      return isNaN(num) ? 0 : num;
    };

    // Helper to parse line string to number (e.g., "19.5" -> 19.5)
    const parseLine = (lineStr: string | undefined): number => {
      if (!lineStr) return 0;
      const num = parseFloat(lineStr);
      return isNaN(num) ? 0 : num;
    };

    // Process over odds
    if (overOdd.byBookmaker) {
      for (const [bookmakerKey, bookOdd] of Object.entries(overOdd.byBookmaker)) {
        if (!bookOdd.available || !bookOdd.overUnder) continue;

        const underBookOdd = underOdd.byBookmaker?.[bookmakerKey];
        if (!underBookOdd?.available) continue;

        const lineValue = parseLine(bookOdd.overUnder);
        const overOddsValue = parseOdds(bookOdd.odds);
        const underOddsValue = parseOdds(underBookOdd.odds);

        propLines.push({
          bookmaker: getBookmakerName(bookmakerKey),
          bookmakerKey,
          line: lineValue,
          overOdds: overOddsValue,
          underOdds: underOddsValue,
        });

        // Track best over (higher/less negative odds are better)
        if (overOddsValue > bestOver.odds) {
          bestOver = {
            bookmaker: getBookmakerName(bookmakerKey),
            odds: overOddsValue,
            line: lineValue,
          };
        }

        // Track best under (higher/less negative odds are better)
        if (underOddsValue > bestUnder.odds) {
          bestUnder = {
            bookmaker: getBookmakerName(bookmakerKey),
            odds: underOddsValue,
            line: lineValue,
          };
        }
      }
    }

    if (propLines.length === 0) continue;

    // Calculate consensus line (average of all lines)
    const consensusLine = propLines.reduce((sum, p) => sum + p.line, 0) / propLines.length;

    const processedProp: ProcessedPlayerProp = {
      playerId: `${overOdd.playerID}-${overOdd.statID}`,
      playerName,
      team: isHomeTeam ? homeTeamName : awayTeamName,
      position: playerPosition,
      statType: overOdd.statID,
      statLabel: getStatLabel(overOdd.statID),
      consensusLine: Math.round(consensusLine * 10) / 10, // Round to 1 decimal
      props: propLines.sort((a, b) => a.bookmaker.localeCompare(b.bookmaker)),
      bestOver,
      bestUnder,
    };

    // Add to appropriate team array
    if (isHomeTeam) {
      team1Props.push(processedProp);
    } else {
      team2Props.push(processedProp);
    }
  }

  console.log(`[SGO API] Extracted ${team1Props.length} team1 props, ${team2Props.length} team2 props`);

  // Sort props by player name, then by stat type
  const sortProps = (props: ProcessedPlayerProp[]) =>
    props.sort((a, b) => {
      const nameCompare = a.playerName.localeCompare(b.playerName);
      if (nameCompare !== 0) return nameCompare;
      return a.statLabel.localeCompare(b.statLabel);
    });

  return {
    team1: sortProps(team1Props),
    team2: sortProps(team2Props),
  };
};

/**
 * Get player props for a specific matchup
 * This is the main function to call from the UI
 */
export const getPlayerProps = async (
  team1: string,
  team2: string,
  sport: string
): Promise<PlayerPropsResult | null> => {
  try {
    const leagueId = mapLeagueId(sport);
    console.log('[SGO API] Getting player props for:', { team1, team2, sport, leagueId });

    // Find the event
    const event = await findEventByTeams(team1, team2, leagueId);

    if (!event) {
      console.log('[SGO API] No event found for matchup');
      return null;
    }

    // Extract player props
    const homeTeamName = event.teams.home.names.long;
    const awayTeamName = event.teams.away.names.long;

    // Log event details for debugging
    console.log('[SGO API] Event details:', {
      eventId: event.eventID,
      homeTeam: { id: event.teams.home.teamID, name: homeTeamName },
      awayTeam: { id: event.teams.away.teamID, name: awayTeamName },
      playerCount: event.players ? Object.keys(event.players).length : 0,
      oddsCount: event.odds ? Object.keys(event.odds).length : 0,
    });

    // Log sample player data for debugging
    if (event.players) {
      const samplePlayers = Object.entries(event.players).slice(0, 3);
      console.log('[SGO API] Sample players:', samplePlayers.map(([id, p]) => ({
        id,
        name: p.name,
        teamID: p.teamID,
        position: p.position,
      })));
    }

    // Log sample odds data for debugging
    if (event.odds) {
      const playerOdds = Object.values(event.odds).filter(o => o.playerID).slice(0, 3);
      console.log('[SGO API] Sample player odds:', playerOdds.map(o => ({
        playerID: o.playerID,
        statEntityID: o.statEntityID,
        statID: o.statID,
        marketName: o.marketName,
      })));
    }

    const { team1: team1Props, team2: team2Props } = extractPlayerProps(
      event,
      homeTeamName,
      awayTeamName
    );

    return {
      sport: sport.toUpperCase(),
      eventId: event.eventID,
      teams: {
        home: homeTeamName,
        away: awayTeamName,
        logos: { home: '', away: '' },
      },
      playerProps: {
        team1: team1Props,
        team2: team2Props,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[SGO API] Error getting player props:', error);
    throw error;
  }
};

/**
 * Check API usage/quota
 */
export const getApiUsage = async (): Promise<any> => {
  return sgoFetch('/account/usage/');
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  setSGOApiKey,
  getSGOApiKey,
  getEvents,
  getEventById,
  findEventByTeams,
  getPlayersForEvent,
  getPlayerProps,
  getApiUsage,
  mapLeagueId,
  LEAGUE_IDS,
  SPORT_IDS,
  BOOKMAKER_IDS,
  BET_TYPES,
  PERIODS,
  STAT_IDS,
};
