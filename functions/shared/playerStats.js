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

let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

// In-memory cache for player IDs (persists across warm invocations)
const playerIdCache = {};

const GAME_LOGS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getApiKey() {
  try {
    return functions.config().apisports?.key || process.env.API_SPORTS_KEY;
  } catch (e) {
    return process.env.API_SPORTS_KEY;
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

    // Exact match
    for (const p of response.data.response) {
      const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase().replace(/[^a-z\s]/g, '').trim();
      if (fullName === normalizedSearch) {
        playerIdCache[cacheKey] = p.id;
        return p.id;
      }
    }

    // Partial match
    for (const p of response.data.response) {
      const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase();
      if (fullName.includes(normalizedSearch) || normalizedSearch.includes(fullName)) {
        playerIdCache[cacheKey] = p.id;
        return p.id;
      }
    }

    // Fallback: first result
    const first = response.data.response[0];
    playerIdCache[cacheKey] = first.id;
    return first.id;
  } catch (err) {
    console.error(`[playerStats] Error searching player ${playerName}:`, err.message);
    return null;
  }
}

/**
 * Fetch game logs for a player. Checks Firestore cache first (1h TTL).
 */
async function getGameLogs(playerId, apiKey, limit = 82) {
  if (!apiKey) apiKey = getApiKey();
  const season = getCurrentNBASeason();
  const firestoreKey = `player_gamelogs_${playerId}_${season}`;

  // Check Firestore cache
  try {
    const doc = await getDb().collection('ml_cache').doc(firestoreKey).get();
    if (doc.exists) {
      const data = doc.data();
      if (Date.now() - data.fetchedAt < GAME_LOGS_CACHE_TTL) {
        return data.logs.slice(0, limit);
      }
    }
  } catch (e) { /* cache miss, proceed */ }

  // Fetch from API-Sports
  try {
    const response = await axios.get(
      `https://v2.nba.api-sports.io/players/statistics?season=${season}&id=${playerId}`,
      { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
    );

    let logs = response.data?.response || [];

    if (logs.length === 0) {
      // Try previous season
      const prevResponse = await axios.get(
        `https://v2.nba.api-sports.io/players/statistics?season=${season - 1}&id=${playerId}`,
        { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
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
    console.error(`[playerStats] Error fetching game logs for ${playerId}:`, err.message);
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

module.exports = {
  resolvePlayerId,
  getGameLogs,
  resolvePlayerIdsBatch,
  getGameLogsBatch,
  getL10AvgForStat,
  getApiKey,
  getCurrentNBASeason,
};
