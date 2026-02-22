/**
 * shared/playerStats.js — API-Sports player data layer
 *
 * Provides:
 * - resolvePlayerId(name) → API-Sports player ID (in-memory + Firestore cached)
 * - getGameLogs(playerId) → per-game stat lines (Firestore cached, 1h TTL)
 * - getL10AvgForStat(playerStats, statType, features) → L10 average for a stat type
 * - buildPlayerStatsMap(gameLogs) → summary stats from features (PPG, RPG, etc.)
 */

const axios = require('axios');
const admin = require('firebase-admin');
const functions = require('firebase-functions/v2');
const { withRetry } = require('./retry');

let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

// In-memory caches (persist across warm invocations)
const playerIdCache = {};
const playerPositionCache = {};

const GAME_LOGS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_STALE_GAME_LOGS = 24 * 60 * 60 * 1000; // 24 hours — stale fallback window

function getApiKey() {
  try {
    const key = functions.config().apisports?.key || process.env.API_SPORTS_KEY;
    return key?.trim() || null;
  } catch (e) {
    return process.env.API_SPORTS_KEY?.trim() || null;
  }
}

function getCurrentNBASeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 10 ? year : year - 1;
}

/**
 * Resolve a player name to an API-Sports ID.
 * Uses in-memory cache first, then API-Sports search.
 */
async function resolvePlayerId(playerName, apiKey) {
  if (!apiKey) apiKey = getApiKey();
  const cacheKey = playerName.toLowerCase().trim();
  if (playerIdCache[cacheKey]) return playerIdCache[cacheKey];

  try {
    const parts = playerName.trim().split(' ');
    const lastName = parts[parts.length - 1];

    const response = await axios.get(
      `https://v2.nba.api-sports.io/players?search=${encodeURIComponent(lastName)}`,
      { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
    );

    if (!response.data?.response?.length) {
      console.log(`[playerStats] Player not found: ${playerName}`);
      return null;
    }

    const normalizedSearch = playerName.toLowerCase().replace(/[^a-z\s]/g, '').trim();

    function cachePlayer(p) {
      playerIdCache[cacheKey] = p.id;
      const pos = p.leagues?.standard?.pos || null;
      if (pos) playerPositionCache[cacheKey] = pos;
      return p.id;
    }

    // Exact match
    for (const p of response.data.response) {
      const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase().replace(/[^a-z\s]/g, '').trim();
      if (fullName === normalizedSearch) return cachePlayer(p);
    }

    // Partial match
    for (const p of response.data.response) {
      const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase();
      if (fullName.includes(normalizedSearch) || normalizedSearch.includes(fullName)) return cachePlayer(p);
    }

    // Fallback: first result
    return cachePlayer(response.data.response[0]);
  } catch (err) {
    console.error(`[playerStats] Error searching player ${playerName}:`, err.message);
    return null;
  }
}

/**
 * Fetch game logs for a player. Checks Firestore cache first (1h TTL).
 * If API fails, falls back to stale cache (up to 24h old).
 */
async function getGameLogs(playerId, apiKey, limit = 82) {
  if (!apiKey) apiKey = getApiKey();
  const season = getCurrentNBASeason();
  const firestoreKey = `player_gamelogs_${playerId}_${season}`;

  // Check Firestore cache — keep reference for stale fallback
  let cachedData = null;
  try {
    const doc = await getDb().collection('ml_cache').doc(firestoreKey).get();
    if (doc.exists) {
      cachedData = doc.data();
      if (Date.now() - cachedData.fetchedAt < GAME_LOGS_CACHE_TTL) {
        return cachedData.logs.slice(0, limit);
      }
    }
  } catch (e) { /* cache miss, proceed */ }

  // Fetch from API-Sports with retry
  try {
    const response = await withRetry(
      () => axios.get(
        `https://v2.nba.api-sports.io/players/statistics?season=${season}&id=${playerId}`,
        { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
      ),
      { maxRetries: 1, label: `gameLogs-${playerId}` }
    );

    let logs = response.data?.response || [];

    if (logs.length === 0) {
      // Try previous season
      const prevResponse = await withRetry(
        () => axios.get(
          `https://v2.nba.api-sports.io/players/statistics?season=${season - 1}&id=${playerId}`,
          { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
        ),
        { maxRetries: 1, label: `gameLogs-prev-${playerId}` }
      );
      logs = prevResponse.data?.response || [];
    }

    if (logs.length === 0) return [];

    // Sort by game.id DESC (higher = more recent)
    logs.sort((a, b) => (b.game?.id || 0) - (a.game?.id || 0));
    logs = logs.slice(0, limit);

    // Cache in Firestore
    try {
      await getDb().collection('ml_cache').doc(firestoreKey).set({
        fetchedAt: Date.now(),
        season,
        playerId,
        logs,
      });
    } catch (e) { /* silent cache write failure */ }

    return logs;
  } catch (err) {
    // STALE FALLBACK: use expired cache if within 24h
    if (cachedData?.logs?.length > 0 && (Date.now() - cachedData.fetchedAt) < MAX_STALE_GAME_LOGS) {
      const ageMinutes = Math.round((Date.now() - cachedData.fetchedAt) / 60000);
      console.warn(`[playerStats] API failed for ${playerId}, using stale cache (${ageMinutes}m old): ${err.message}`);
      return cachedData.logs.slice(0, limit);
    }
    console.error(`[playerStats] Error fetching game logs for ${playerId} (no stale cache): ${err.message}`);
    return [];
  }
}

/**
 * Resolve player IDs in batches to avoid rate limits.
 * Returns { playerName: playerId | null }
 */
async function resolvePlayerIdsBatch(playerNames, batchSize = 5) {
  const apiKey = getApiKey();
  const result = {};

  for (let i = 0; i < playerNames.length; i += batchSize) {
    const batch = playerNames.slice(i, i + batchSize);
    const ids = await Promise.all(batch.map(name => resolvePlayerId(name, apiKey)));
    batch.forEach((name, idx) => { result[name] = ids[idx]; });
  }

  return result;
}

/**
 * Fetch game logs for multiple players in batches.
 * Returns { playerName: gameLogs[] }
 */
async function getGameLogsBatch(playerIdMap, batchSize = 4) {
  const apiKey = getApiKey();
  const result = {};
  const entries = Object.entries(playerIdMap).filter(([, id]) => id !== null);

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const logs = await Promise.all(batch.map(([, id]) => getGameLogs(id, apiKey)));
    batch.forEach(([name], idx) => { result[name] = logs[idx]; });
  }

  return result;
}

/**
 * Get L10 average for a specific stat type.
 */
function getL10AvgForStat(playerStats, statType, features) {
  const st = statType.toLowerCase();
  switch (st) {
    case 'points': return playerStats?.pointsPerGame ?? null;
    case 'rebounds': return playerStats?.reboundsPerGame ?? null;
    case 'assists': return playerStats?.assistsPerGame ?? null;
    case 'steals': return playerStats?.stealsPerGame ?? null;
    case 'blocks': return playerStats?.blocksPerGame ?? null;
    case 'turnovers': return features?.L10_TOV ?? null;
    case 'threepointersmade': return features?.L10_FG3M ?? null;
    case 'points+rebounds':
      return (playerStats?.pointsPerGame ?? 0) + (playerStats?.reboundsPerGame ?? 0);
    case 'points+assists':
      return (playerStats?.pointsPerGame ?? 0) + (playerStats?.assistsPerGame ?? 0);
    case 'rebounds+assists':
      return (playerStats?.reboundsPerGame ?? 0) + (playerStats?.assistsPerGame ?? 0);
    case 'points+rebounds+assists':
      return (playerStats?.pointsPerGame ?? 0) + (playerStats?.reboundsPerGame ?? 0) + (playerStats?.assistsPerGame ?? 0);
    case 'blocks+steals':
      return (playerStats?.blocksPerGame ?? 0) + (playerStats?.stealsPerGame ?? 0);
    default: return null;
  }
}

/**
 * Get cached position for a player (populated during resolvePlayerId).
 * Returns null if player hasn't been resolved yet.
 */
function getPlayerPosition(playerName) {
  const key = playerName.toLowerCase().trim();
  return playerPositionCache[key] || null;
}

// ── Team Schedule (for deriving opponents per past game) ──

const SCHEDULE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// API-Sports team ID lookup — maps team names to their API-Sports IDs
// Used to query team schedule endpoint
const API_SPORTS_TEAM_IDS = {
  'Atlanta Hawks': 1, 'Boston Celtics': 2, 'Brooklyn Nets': 4, 'Charlotte Hornets': 5,
  'Chicago Bulls': 6, 'Cleveland Cavaliers': 7, 'Dallas Mavericks': 8, 'Denver Nuggets': 9,
  'Detroit Pistons': 10, 'Golden State Warriors': 11, 'Houston Rockets': 14, 'Indiana Pacers': 15,
  'Los Angeles Clippers': 16, 'LA Clippers': 16, 'Los Angeles Lakers': 17, 'LA Lakers': 17,
  'Memphis Grizzlies': 19, 'Miami Heat': 20, 'Milwaukee Bucks': 21, 'Minnesota Timberwolves': 22,
  'New Orleans Pelicans': 23, 'New York Knicks': 24, 'Oklahoma City Thunder': 25,
  'Orlando Magic': 26, 'Philadelphia 76ers': 27, 'Phoenix Suns': 28, 'Portland Trail Blazers': 29,
  'Sacramento Kings': 30, 'San Antonio Spurs': 31, 'Toronto Raptors': 38, 'Utah Jazz': 40,
  'Washington Wizards': 41,
};

// Reverse map: API-Sports team ID → short code
const TEAM_ID_TO_CODE = {
  1: 'ATL', 2: 'BOS', 4: 'BKN', 5: 'CHA', 6: 'CHI', 7: 'CLE', 8: 'DAL', 9: 'DEN',
  10: 'DET', 11: 'GSW', 14: 'HOU', 15: 'IND', 16: 'LAC', 17: 'LAL', 19: 'MEM',
  20: 'MIA', 21: 'MIL', 22: 'MIN', 23: 'NOP', 24: 'NYK', 25: 'OKC', 26: 'ORL',
  27: 'PHI', 28: 'PHX', 29: 'POR', 30: 'SAC', 31: 'SAS', 38: 'TOR', 40: 'UTA', 41: 'WAS',
};

const TEAM_ID_TO_NAME = {};
for (const [name, id] of Object.entries(API_SPORTS_TEAM_IDS)) {
  if (!name.startsWith('LA ')) TEAM_ID_TO_NAME[id] = name; // Skip "LA" aliases
}

/**
 * Get a team's full season schedule with opponent info per game.
 * Cached in Firestore (24h TTL).
 *
 * @param {string} teamName - Full team name (e.g., "Houston Rockets")
 * @returns {Object} Map of gameId → { date, opponent, opponentCode, opponentId, isHome }
 */
async function getTeamSchedule(teamName) {
  const apiKey = getApiKey();
  const season = getCurrentNBASeason();
  const teamId = API_SPORTS_TEAM_IDS[teamName];
  if (!teamId) {
    console.warn(`[playerStats] Unknown team for schedule lookup: ${teamName}`);
    return {};
  }

  const firestoreKey = `team_schedule_${teamId}_${season}`;

  // Check Firestore cache
  try {
    const doc = await getDb().collection('ml_cache').doc(firestoreKey).get();
    if (doc.exists) {
      const data = doc.data();
      if (Date.now() - data.fetchedAt < SCHEDULE_CACHE_TTL) {
        return data.schedule;
      }
    }
  } catch (e) { /* cache miss */ }

  // Fetch from API-Sports
  try {
    const response = await withRetry(
      () => axios.get(
        `https://v2.nba.api-sports.io/games?season=${season}&team=${teamId}`,
        { headers: { 'x-apisports-key': apiKey }, timeout: 15000 }
      ),
      { maxRetries: 1, label: `schedule-${teamId}` }
    );

    const games = response.data?.response || [];
    const schedule = {};

    for (const g of games) {
      const gameId = g.id;
      if (!gameId) continue;

      const homeId = g.teams?.home?.id;
      const awayId = g.teams?.visitors?.id;
      const isHome = homeId === teamId;
      const oppId = isHome ? awayId : homeId;
      const oppName = isHome
        ? (g.teams?.visitors?.name || TEAM_ID_TO_NAME[oppId] || 'Unknown')
        : (g.teams?.home?.name || TEAM_ID_TO_NAME[oppId] || 'Unknown');
      const oppCode = TEAM_ID_TO_CODE[oppId] || oppName.split(' ').pop()?.substring(0, 3)?.toUpperCase() || '???';

      schedule[gameId] = {
        date: g.date?.start || null,
        opponent: oppName,
        opponentCode: oppCode,
        opponentId: oppId,
        isHome,
      };
    }

    // Cache in Firestore
    try {
      await getDb().collection('ml_cache').doc(firestoreKey).set({
        fetchedAt: Date.now(), season, teamId, teamName, schedule,
      });
    } catch (e) { /* silent */ }

    console.log(`[playerStats] Fetched schedule for ${teamName}: ${Object.keys(schedule).length} games`);
    return schedule;
  } catch (err) {
    console.error(`[playerStats] Error fetching schedule for ${teamName}: ${err.message}`);
    return {};
  }
}

module.exports = {
  resolvePlayerId,
  getGameLogs,
  resolvePlayerIdsBatch,
  getGameLogsBatch,
  getL10AvgForStat,
  getApiKey,
  getCurrentNBASeason,
  getPlayerPosition,
  getTeamSchedule,
  API_SPORTS_TEAM_IDS,
  TEAM_ID_TO_CODE,
  TEAM_ID_TO_NAME,
};
