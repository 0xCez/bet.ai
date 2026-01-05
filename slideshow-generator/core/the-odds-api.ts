/**
 * TheOddsAPI Client
 *
 * Used for: Live odds, line movements, best lines across bookmakers
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

import axios from 'axios';
import { config } from './config';

// ============================================
// TYPES
// ============================================

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Bookmaker[];
}

export interface Bookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
}

export interface Market {
  key: string; // 'h2h', 'spreads', 'totals'
  outcomes: Outcome[];
}

export interface Outcome {
  name: string;
  price: number;
  point?: number; // For spreads/totals
}

export interface BestLine {
  type: 'moneyline' | 'spread' | 'total';
  label: string;
  team?: string;
  odds: number;
  point?: number;
  bookmaker: string;
}

export interface OddsComparison {
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bestLines: BestLine[];
  allBookmakers: {
    name: string;
    homeML?: number;
    awayML?: number;
    homeSpread?: { point: number; odds: number };
    awaySpread?: { point: number; odds: number };
    overTotal?: { point: number; odds: number };
    underTotal?: { point: number; odds: number };
  }[];
}

// ============================================
// SPORT KEYS MAPPING
// ============================================

export const SPORT_KEYS = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  // Soccer
  EPL: 'soccer_epl',
  LA_LIGA: 'soccer_spain_la_liga',
  SERIE_A: 'soccer_italy_serie_a',
  BUNDESLIGA: 'soccer_germany_bundesliga',
  LIGUE_1: 'soccer_france_ligue_one',
  CHAMPIONS_LEAGUE: 'soccer_uefa_champs_league',
  MLS: 'soccer_usa_mls',
};

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Get all upcoming events for a sport
 */
export async function getEvents(sportKey: string): Promise<OddsEvent[]> {
  try {
    const url = `${config.theOddsApi.baseUrl}/sports/${sportKey}/events?apiKey=${config.theOddsApi.apiKey}`;
    const response = await axios.get<OddsEvent[]>(url);
    return response.data;
  } catch (error: any) {
    console.error(`TheOddsAPI events error for ${sportKey}:`, error.message);
    return [];
  }
}

/**
 * Get odds for a specific event
 */
export async function getEventOdds(
  sportKey: string,
  eventId: string,
  markets: string[] = ['h2h', 'spreads', 'totals']
): Promise<OddsEvent | null> {
  try {
    const marketsParam = markets.join(',');
    const bookmakers = 'pinnacle,lowvig,betonlineag,draftkings,fanduel,betmgm,williamhill_us,betrivers,bovada,mybookieag';
    const url = `${config.theOddsApi.baseUrl}/sports/${sportKey}/events/${eventId}/odds?apiKey=${config.theOddsApi.apiKey}&regions=us&markets=${marketsParam}&bookmakers=${bookmakers}`;

    const response = await axios.get<OddsEvent>(url);
    return response.data;
  } catch (error: any) {
    console.error(`TheOddsAPI odds error for ${eventId}:`, error.message);
    return null;
  }
}

/**
 * Get odds for all events in a sport (batch)
 */
export async function getSportOdds(
  sportKey: string,
  markets: string[] = ['h2h', 'spreads', 'totals']
): Promise<OddsEvent[]> {
  try {
    const marketsParam = markets.join(',');
    const bookmakers = 'pinnacle,draftkings,fanduel,betmgm,bovada';
    const url = `${config.theOddsApi.baseUrl}/sports/${sportKey}/odds?apiKey=${config.theOddsApi.apiKey}&regions=us&markets=${marketsParam}&bookmakers=${bookmakers}`;

    const response = await axios.get<OddsEvent[]>(url);
    return response.data;
  } catch (error: any) {
    console.error(`TheOddsAPI sport odds error for ${sportKey}:`, error.message);
    return [];
  }
}

/**
 * Find an event by team names (fuzzy match)
 */
export async function findEvent(
  sportKey: string,
  team1: string,
  team2: string
): Promise<OddsEvent | null> {
  const events = await getEvents(sportKey);

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t1 = normalize(team1);
  const t2 = normalize(team2);

  const event = events.find((e) => {
    const home = normalize(e.home_team);
    const away = normalize(e.away_team);
    return (
      (home.includes(t1) || t1.includes(home) || away.includes(t1) || t1.includes(away)) &&
      (home.includes(t2) || t2.includes(home) || away.includes(t2) || t2.includes(away))
    );
  });

  return event || null;
}

/**
 * Calculate best lines across all bookmakers
 */
export function calculateBestLines(event: OddsEvent): BestLine[] {
  if (!event.bookmakers?.length) return [];

  const bestLines: BestLine[] = [];

  let bestHomeML = { odds: -Infinity, bookmaker: '' };
  let bestAwayML = { odds: -Infinity, bookmaker: '' };
  let bestHomeSpread = { odds: -Infinity, point: 0, bookmaker: '' };
  let bestAwaySpread = { odds: -Infinity, point: 0, bookmaker: '' };
  let bestOver = { odds: -Infinity, point: 0, bookmaker: '' };
  let bestUnder = { odds: -Infinity, point: 0, bookmaker: '' };

  for (const bookmaker of event.bookmakers) {
    for (const market of bookmaker.markets) {
      if (market.key === 'h2h') {
        for (const outcome of market.outcomes) {
          if (outcome.name === event.home_team && outcome.price > bestHomeML.odds) {
            bestHomeML = { odds: outcome.price, bookmaker: bookmaker.title };
          }
          if (outcome.name === event.away_team && outcome.price > bestAwayML.odds) {
            bestAwayML = { odds: outcome.price, bookmaker: bookmaker.title };
          }
        }
      }

      if (market.key === 'spreads') {
        for (const outcome of market.outcomes) {
          if (outcome.name === event.home_team && outcome.price > bestHomeSpread.odds) {
            bestHomeSpread = {
              odds: outcome.price,
              point: outcome.point || 0,
              bookmaker: bookmaker.title,
            };
          }
          if (outcome.name === event.away_team && outcome.price > bestAwaySpread.odds) {
            bestAwaySpread = {
              odds: outcome.price,
              point: outcome.point || 0,
              bookmaker: bookmaker.title,
            };
          }
        }
      }

      if (market.key === 'totals') {
        for (const outcome of market.outcomes) {
          if (outcome.name === 'Over' && outcome.price > bestOver.odds) {
            bestOver = {
              odds: outcome.price,
              point: outcome.point || 0,
              bookmaker: bookmaker.title,
            };
          }
          if (outcome.name === 'Under' && outcome.price > bestUnder.odds) {
            bestUnder = {
              odds: outcome.price,
              point: outcome.point || 0,
              bookmaker: bookmaker.title,
            };
          }
        }
      }
    }
  }

  // Build result
  if (bestHomeML.odds > -Infinity) {
    bestLines.push({
      type: 'moneyline',
      label: 'Best Home ML',
      team: event.home_team,
      odds: bestHomeML.odds,
      bookmaker: bestHomeML.bookmaker,
    });
  }

  if (bestAwayML.odds > -Infinity) {
    bestLines.push({
      type: 'moneyline',
      label: 'Best Away ML',
      team: event.away_team,
      odds: bestAwayML.odds,
      bookmaker: bestAwayML.bookmaker,
    });
  }

  if (bestHomeSpread.odds > -Infinity) {
    bestLines.push({
      type: 'spread',
      label: `Best Home Spread (${bestHomeSpread.point > 0 ? '+' : ''}${bestHomeSpread.point})`,
      team: event.home_team,
      odds: bestHomeSpread.odds,
      point: bestHomeSpread.point,
      bookmaker: bestHomeSpread.bookmaker,
    });
  }

  if (bestAwaySpread.odds > -Infinity) {
    bestLines.push({
      type: 'spread',
      label: `Best Away Spread (${bestAwaySpread.point > 0 ? '+' : ''}${bestAwaySpread.point})`,
      team: event.away_team,
      odds: bestAwaySpread.odds,
      point: bestAwaySpread.point,
      bookmaker: bestAwaySpread.bookmaker,
    });
  }

  if (bestOver.odds > -Infinity) {
    bestLines.push({
      type: 'total',
      label: `Best Over ${bestOver.point}`,
      odds: bestOver.odds,
      point: bestOver.point,
      bookmaker: bestOver.bookmaker,
    });
  }

  if (bestUnder.odds > -Infinity) {
    bestLines.push({
      type: 'total',
      label: `Best Under ${bestUnder.point}`,
      odds: bestUnder.odds,
      point: bestUnder.point,
      bookmaker: bestUnder.bookmaker,
    });
  }

  return bestLines;
}

/**
 * Get full odds comparison for an event
 */
export async function getOddsComparison(
  sportKey: string,
  team1: string,
  team2: string
): Promise<OddsComparison | null> {
  // Find the event
  const event = await findEvent(sportKey, team1, team2);
  if (!event) {
    console.error(`Event not found: ${team1} vs ${team2}`);
    return null;
  }

  // Get odds for this event
  const eventWithOdds = await getEventOdds(sportKey, event.id);
  if (!eventWithOdds?.bookmakers?.length) {
    console.error(`No odds found for event ${event.id}`);
    return null;
  }

  // Calculate best lines
  const bestLines = calculateBestLines(eventWithOdds);

  // Build bookmaker comparison
  const allBookmakers = eventWithOdds.bookmakers.map((bm) => {
    const result: OddsComparison['allBookmakers'][0] = { name: bm.title };

    for (const market of bm.markets) {
      if (market.key === 'h2h') {
        for (const outcome of market.outcomes) {
          if (outcome.name === event.home_team) result.homeML = outcome.price;
          if (outcome.name === event.away_team) result.awayML = outcome.price;
        }
      }
      if (market.key === 'spreads') {
        for (const outcome of market.outcomes) {
          if (outcome.name === event.home_team) {
            result.homeSpread = { point: outcome.point || 0, odds: outcome.price };
          }
          if (outcome.name === event.away_team) {
            result.awaySpread = { point: outcome.point || 0, odds: outcome.price };
          }
        }
      }
      if (market.key === 'totals') {
        for (const outcome of market.outcomes) {
          if (outcome.name === 'Over') {
            result.overTotal = { point: outcome.point || 0, odds: outcome.price };
          }
          if (outcome.name === 'Under') {
            result.underTotal = { point: outcome.point || 0, odds: outcome.price };
          }
        }
      }
    }

    return result;
  });

  return {
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commenceTime: event.commence_time,
    bestLines,
    allBookmakers,
  };
}

/**
 * Get all available sports
 */
export async function getAvailableSports(): Promise<{ key: string; title: string; active: boolean }[]> {
  try {
    const url = `${config.theOddsApi.baseUrl}/sports?apiKey=${config.theOddsApi.apiKey}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error: any) {
    console.error('TheOddsAPI sports error:', error.message);
    return [];
  }
}
