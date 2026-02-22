/**
 * shared/oddsApi.js — The Odds API data layer
 *
 * Replaces SGO entirely. Provides:
 * - fetchStandardProps(eventId) → standard player prop lines
 * - fetchAltProps(eventId) → alternate player prop lines
 * - fetchEvents(sport) → upcoming game events
 */

const axios = require('axios');
const { withRetry } = require('./retry');

const ODDS_API_KEY = process.env.ODDS_API_KEY;

// Standard player prop markets (replaces SGO)
const STANDARD_MARKETS = [
  'player_points', 'player_rebounds', 'player_assists',
  'player_threes', 'player_blocks', 'player_steals',
  'player_turnovers',
  'player_points_rebounds_assists',
  'player_points_rebounds', 'player_points_assists',
  'player_rebounds_assists',
];

// Alternate markets (for Parlay Stack)
const ALT_MARKETS = [
  'player_points_alternate', 'player_rebounds_alternate',
  'player_assists_alternate', 'player_threes_alternate',
  'player_blocks_alternate', 'player_steals_alternate',
  'player_turnovers_alternate',
  'player_points_rebounds_assists_alternate',
  'player_points_rebounds_alternate', 'player_points_assists_alternate',
  'player_rebounds_assists_alternate',
];

// Map The Odds API market keys → our internal statType
const MARKET_TO_STAT = {
  'player_points': 'points',
  'player_rebounds': 'rebounds',
  'player_assists': 'assists',
  'player_threes': 'threePointersMade',
  'player_blocks': 'blocks',
  'player_steals': 'steals',
  'player_turnovers': 'turnovers',
  'player_points_rebounds_assists': 'points+rebounds+assists',
  'player_points_rebounds': 'points+rebounds',
  'player_points_assists': 'points+assists',
  'player_rebounds_assists': 'rebounds+assists',
  // Alt versions map to same stat types
  'player_points_alternate': 'points',
  'player_rebounds_alternate': 'rebounds',
  'player_assists_alternate': 'assists',
  'player_threes_alternate': 'threePointersMade',
  'player_blocks_alternate': 'blocks',
  'player_steals_alternate': 'steals',
  'player_turnovers_alternate': 'turnovers',
  'player_points_rebounds_assists_alternate': 'points+rebounds+assists',
  'player_points_rebounds_alternate': 'points+rebounds',
  'player_points_assists_alternate': 'points+assists',
  'player_rebounds_assists_alternate': 'rebounds+assists',
};

// Bookmaker name normalization (for ML model compatibility)
const BOOKMAKER_MAP = {
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'betmgm': 'BetMGM',
  'caesars': 'Caesars',
  'bovada': 'Bovada',
  'pointsbetus': 'PointsBet',
  'betrivers': 'BetRivers',
  'bet365': 'Bet365',
  'unibet_us': 'Unibet',
  'wynnbet': 'WynnBet',
  'espnbet': 'ESPNBet',
  'hardrockbet': 'Hard Rock',
  'fanatics': 'Fanatics',
  'ballybet': 'BallyBet',
};

function normalizeBookmaker(key) {
  if (!key) return null;
  return BOOKMAKER_MAP[key.toLowerCase()] || key;
}

const BOOKMAKERS = 'draftkings,fanduel,betmgm,caesars,espnbet';

/**
 * Parse The Odds API response into a normalized props structure.
 * Works for both standard and alternate markets.
 *
 * Returns Map keyed by "PlayerName|statType" → array of { line, oddsOver, oddsUnder, bookmakerOver, bookmakerUnder }
 */
function parseOddsResponse(data) {
  const propsMap = new Map();

  for (const bk of (data?.bookmakers || [])) {
    const bookmaker = normalizeBookmaker(bk.key) || bk.key;

    for (const market of (bk.markets || [])) {
      const statType = MARKET_TO_STAT[market.key];
      if (!statType) continue;

      // Group outcomes by player + line
      const byPlayerLine = {};
      for (const o of (market.outcomes || [])) {
        const player = o.description;
        if (!player || o.point == null) continue;
        const plKey = `${player}|${o.point}`;
        if (!byPlayerLine[plKey]) byPlayerLine[plKey] = { player, line: o.point, statType };
        if (o.name === 'Over') { byPlayerLine[plKey].oddsOver = o.price; byPlayerLine[plKey].bookmakerOver = bookmaker; }
        if (o.name === 'Under') { byPlayerLine[plKey].oddsUnder = o.price; byPlayerLine[plKey].bookmakerUnder = bookmaker; }
      }

      // Store in map
      for (const entry of Object.values(byPlayerLine)) {
        if (entry.oddsOver == null && entry.oddsUnder == null) continue;
        const mapKey = `${entry.player}|${entry.statType}`;
        if (!propsMap.has(mapKey)) propsMap.set(mapKey, []);

        const existing = propsMap.get(mapKey);
        const dup = existing.find(e => e.line === entry.line);
        if (dup) {
          // Keep best odds per bookmaker
          if (entry.oddsOver != null && (dup.oddsOver == null || entry.oddsOver > dup.oddsOver)) {
            dup.oddsOver = entry.oddsOver;
            dup.bookmakerOver = entry.bookmakerOver;
          }
          if (entry.oddsUnder != null && (dup.oddsUnder == null || entry.oddsUnder > dup.oddsUnder)) {
            dup.oddsUnder = entry.oddsUnder;
            dup.bookmakerUnder = entry.bookmakerUnder;
          }
        } else {
          existing.push({
            line: entry.line,
            oddsOver: entry.oddsOver ?? null,
            oddsUnder: entry.oddsUnder ?? null,
            bookmakerOver: entry.oddsOver != null ? entry.bookmakerOver : null,
            bookmakerUnder: entry.oddsUnder != null ? entry.bookmakerUnder : null,
          });
        }
      }
    }
  }

  // Sort each player's lines by line value ascending
  for (const [, lines] of propsMap) {
    lines.sort((a, b) => a.line - b.line);
  }

  return propsMap;
}

/**
 * Fetch standard player props from The Odds API.
 * Returns flat array of { playerName, statType, line, oddsOver, oddsUnder, bookmakerOver, bookmakerUnder }
 */
async function fetchStandardProps(eventId) {
  if (!ODDS_API_KEY || !eventId) {
    console.warn('[oddsApi] Missing ODDS_API_KEY or eventId for fetchStandardProps');
    return { props: [], homeTeam: null, awayTeam: null, gameTime: null };
  }

  const markets = STANDARD_MARKETS.join(',');
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds`
    + `?apiKey=${ODDS_API_KEY}&regions=us&oddsFormat=american`
    + `&markets=${markets}&bookmakers=${BOOKMAKERS}`;

  try {
    console.log(`[oddsApi] Fetching standard props for event ${eventId}...`);
    const resp = await withRetry(
      () => axios.get(url, { timeout: 15000 }),
      { maxRetries: 2, label: `stdProps-${eventId}` }
    );

    const propsMap = parseOddsResponse(resp.data);

    // Flatten to array with one entry per player-stat (using the single standard line)
    const props = [];
    for (const [mapKey, lines] of propsMap) {
      const [playerName, statType] = mapKey.split('|');
      // Standard markets should have exactly 1 line per player-stat
      const line = lines[0];
      if (!line) continue;

      props.push({
        playerName,
        statType,
        line: line.line,
        oddsOver: line.oddsOver,
        oddsUnder: line.oddsUnder,
        bookmakerOver: line.bookmakerOver,
        bookmakerUnder: line.bookmakerUnder,
      });
    }

    // Determine home/away from the event response
    const homeTeam = resp.data.home_team;
    const awayTeam = resp.data.away_team;
    const gameTime = resp.data.commence_time;

    console.log(`[oddsApi] Standard props: ${props.length} props for ${homeTeam} vs ${awayTeam}`);
    return { props, homeTeam, awayTeam, gameTime };
  } catch (err) {
    console.error(`[oddsApi] Standard props fetch failed: ${err.message}`);
    return { props: [], homeTeam: null, awayTeam: null, gameTime: null };
  }
}

/**
 * Fetch alternate player prop lines from The Odds API.
 * Returns a Map keyed by "PlayerName|statType" → array of { line, oddsOver, oddsUnder, bookmakerOver, bookmakerUnder }
 */
async function fetchAltProps(eventId) {
  if (!ODDS_API_KEY || !eventId) {
    console.warn('[oddsApi] Missing ODDS_API_KEY or eventId for fetchAltProps');
    return new Map();
  }

  const markets = ALT_MARKETS.join(',');
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds`
    + `?apiKey=${ODDS_API_KEY}&regions=us&oddsFormat=american`
    + `&markets=${markets}&bookmakers=${BOOKMAKERS}`;

  try {
    console.log(`[oddsApi] Fetching alt props for event ${eventId}...`);
    const resp = await withRetry(
      () => axios.get(url, { timeout: 15000 }),
      { maxRetries: 2, label: `altProps-${eventId}` }
    );

    const altMap = parseOddsResponse(resp.data);
    const totalLines = [...altMap.values()].reduce((s, a) => s + a.length, 0);
    console.log(`[oddsApi] Alt props: ${totalLines} lines across ${altMap.size} player-stats`);
    return altMap;
  } catch (err) {
    console.warn(`[oddsApi] Alt props fetch failed (non-blocking): ${err.message}`);
    return new Map();
  }
}

/**
 * Fetch upcoming events for a sport from The Odds API.
 * Returns array of { id, home_team, away_team, commence_time }
 */
async function fetchEvents(sport = 'basketball_nba') {
  if (!ODDS_API_KEY) return [];

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${ODDS_API_KEY}`;
  try {
    const resp = await withRetry(
      () => axios.get(url, { timeout: 15000 }),
      { maxRetries: 2, label: 'events' }
    );
    return resp.data || [];
  } catch (err) {
    console.error(`[oddsApi] Events fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Find the best goblin line: alt line with odds ≤ threshold closest to player avg.
 */
function findBestGoblinLine(altLines, prediction, playerAvg, goblinThreshold = -400) {
  if (!altLines || altLines.length === 0) return null;
  const isOver = prediction.toLowerCase() === 'over';

  const candidates = altLines
    .map(al => {
      const odds = isOver ? al.oddsOver : al.oddsUnder;
      const bookmaker = isOver ? al.bookmakerOver : al.bookmakerUnder;
      if (odds == null || odds > goblinThreshold) return null;
      return { line: al.line, odds, bookmaker };
    })
    .filter(Boolean);

  if (candidates.length === 0) return null;

  // For Over: highest line still below avg. For Under: lowest line still above avg.
  let best = null;
  for (const c of candidates) {
    if (isOver && playerAvg != null && c.line < playerAvg) {
      if (!best || c.line > best.line) best = c;
    } else if (!isOver && playerAvg != null && c.line > playerAvg) {
      if (!best || c.line < best.line) best = c;
    }
  }

  // Fallback: safest (most negative odds)
  if (!best) {
    candidates.sort((a, b) => a.odds - b.odds);
    best = candidates[0];
  }

  return best;
}

module.exports = {
  fetchStandardProps,
  fetchAltProps,
  fetchEvents,
  findBestGoblinLine,
  normalizeBookmaker,
  MARKET_TO_STAT,
};
