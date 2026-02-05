/**
 * NBA Helper Functions
 * Shared utilities for NBA data fetching and processing
 * Extracted from index.js to be reused across multiple Cloud Functions
 * v1.1 - Fixed API-Sports headers (2026-02-04)
 */

const axios = require('axios');

// API keys (to be imported from parent)
let API_SPORTS_KEY = null;

/**
 * Initialize the helper with API keys
 * @param {string} apiSportsKey - API-Sports API key
 */
function initialize(apiSportsKey) {
  API_SPORTS_KEY = apiSportsKey;
}

/**
 * Get the current NBA season year
 * @returns {number} Current season year (e.g., 2024)
 */
function getCurrentNBASeason() {
  // NBA season spans two calendar years (Oct 2024 - June 2025 = "2024" season)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  // If we're in Oct-Dec, use current year. If Jan-Sep, use previous year
  return month >= 10 ? year : year - 1;
}

/**
 * Fetch player's game logs (individual game statistics)
 * This is the KEY function for ML features - gets game-by-game data, not season averages
 *
 * @param {number} playerId - API-Sports player ID
 * @param {number} season - NBA season year (e.g., 2024)
 * @param {number} limit - Maximum number of games to fetch (default: 15)
 * @returns {Promise<Array>} Array of game log objects, sorted newest first
 */
async function getPlayerGameLogs(playerId, season = null, limit = 15) {
  try {
    const currentSeason = season || getCurrentNBASeason();

    // CRITICAL: Use id=<playerId> parameter to get individual game logs
    // NOT team=<teamId> which returns season aggregates
    const apiUrl = `https://v2.nba.api-sports.io/players/statistics?season=${currentSeason}&id=${playerId}`;

    console.log(`[NBA Helper] Fetching game logs for player ${playerId}, season ${currentSeason}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-apisports-key": API_SPORTS_KEY
      },
      timeout: 10000 // 10 second timeout
    });

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`[NBA Helper] API error for player ${playerId}:`, response.data.errors);
      return [];
    }

    if (!response.data.response || response.data.response.length === 0) {
      console.log(`[NBA Helper] No game logs found for player ${playerId}`);
      return [];
    }

    let gameLogs = response.data.response;

    // Sort by game date (newest first)
    gameLogs.sort((a, b) => {
      const dateA = new Date(a.game?.date?.start || a.game?.date || 0);
      const dateB = new Date(b.game?.date?.start || b.game?.date || 0);
      return dateB - dateA; // Descending order (newest first)
    });

    // Limit to most recent N games
    if (limit && gameLogs.length > limit) {
      gameLogs = gameLogs.slice(0, limit);
    }

    console.log(`[NBA Helper] Found ${gameLogs.length} game logs for player ${playerId}`);

    return gameLogs;

  } catch (error) {
    console.error(`[NBA Helper] Error fetching game logs for player ${playerId}:`, error.message);
    return [];
  }
}

/**
 * Fetch season-long player stats for a team (existing functionality)
 * Returns aggregated season averages
 *
 * @param {number} teamId - API-Sports team ID
 * @param {number} season - NBA season year
 * @returns {Promise<Object>} { players: Array, error: string|null }
 */
async function getTeamPlayerStats(teamId, season = null) {
  try {
    const currentSeason = season || getCurrentNBASeason();
    const apiUrl = `https://v2.nba.api-sports.io/players/statistics?season=${currentSeason}&team=${teamId}`;

    console.log(`[NBA Helper] Fetching team player stats from: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-apisports-key": API_SPORTS_KEY
      }
    });

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`[NBA Helper] API error:`, response.data.errors);
      return { players: [], error: JSON.stringify(response.data.errors) };
    }

    if (!response.data.response || response.data.response.length === 0) {
      console.log(`[NBA Helper] No player stats found for team ${teamId}`);
      return { players: [], error: null };
    }

    const players = response.data.response;
    console.log(`[NBA Helper] Found ${players.length} players for team ${teamId}`);

    return { players, error: null };

  } catch (error) {
    console.error(`[NBA Helper] Error fetching team player stats for ${teamId}:`, error);
    return { players: [], error: error.message };
  }
}

/**
 * Parse minutes string to decimal hours
 * API returns minutes as "36:24" (36 minutes 24 seconds)
 *
 * @param {string} minString - Minutes in "MM:SS" format
 * @returns {number} Minutes as decimal (e.g., "36:24" -> 36.4)
 */
function parseMinutes(minString) {
  if (!minString || typeof minString !== 'string') return 0;

  const parts = minString.split(':');
  const minutes = parseInt(parts[0]) || 0;
  const seconds = parseInt(parts[1]) || 0;

  return minutes + (seconds / 60);
}

/**
 * Safely parse a numeric string to float
 * @param {string|number} value - Value to parse
 * @param {number} defaultValue - Default if parsing fails
 * @returns {number}
 */
function parseFloat(value, defaultValue = 0) {
  const parsed = Number.parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Calculate standard deviation of an array of numbers
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} Standard deviation
 */
function calculateStandardDeviation(values) {
  if (!values || values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate days between two dates
 * @param {string|Date} date1 - Earlier date
 * @param {string|Date} date2 - Later date
 * @returns {number} Days between dates
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Normalize player name for matching between APIs
 * SGO format: "JALEN_PICKETT_1_NBA" -> "jalen pickett"
 * API-Sports format: "Jalen Pickett" -> "jalen pickett"
 *
 * @param {string} name - Player name in any format
 * @returns {string} Normalized lowercase name
 */
function normalizePlayerName(name) {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/_\d+_nba$/i, '') // Remove "_1_NBA" suffix from SGO
    .replace(/_/g, ' ')         // Replace underscores with spaces
    .replace(/[^a-z\s]/g, '')   // Remove non-letter characters except spaces
    .replace(/\s+/g, ' ')       // Normalize multiple spaces to single
    .trim();
}

/**
 * Search for a player by name in API-Sports and return their numeric ID
 * Uses simple name matching approach (no API search needed)
 *
 * @param {string} playerName - Player name (any format)
 * @param {string} teamName - Team name (for context, optional)
 * @param {number} season - NBA season year (optional, defaults to current)
 * @returns {Promise<number|null>} API-Sports player ID or null if not found
 */
async function searchPlayerByName(playerName, teamName = null, season = null) {
  try {
    const currentSeason = season || getCurrentNBASeason();
    const normalizedSearchName = normalizePlayerName(playerName);

    console.log(`[NBA Helper] Searching for player: "${playerName}" (normalized: "${normalizedSearchName}")`);

    // Strategy: Just use the name directly and let API-Sports do fuzzy matching
    // API-Sports search requires only alphanumeric and spaces, no hyphens
    const cleanName = playerName.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();

    const apiUrl = `https://v2.nba.api-sports.io/players?name=${encodeURIComponent(cleanName)}&season=${currentSeason}`;

    const response = await axios.get(apiUrl, {
      headers: {
        "x-apisports-key": API_SPORTS_KEY
      },
      timeout: 10000
    });

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`[NBA Helper] API error searching for "${playerName}":`, response.data.errors);
      return null;
    }

    if (!response.data.response || response.data.response.length === 0) {
      console.log(`[NBA Helper] No player found for "${playerName}"`);
      return null;
    }

    // Find best match by normalizing names
    for (const player of response.data.response) {
      const apiPlayerName = `${player.firstname || ''} ${player.lastname || ''}`.trim();
      const normalizedApiName = normalizePlayerName(apiPlayerName);

      if (normalizedApiName === normalizedSearchName) {
        console.log(`[NBA Helper] Found exact match: ${apiPlayerName} (ID: ${player.id})`);
        return player.id;
      }
    }

    // If no exact match, return first result (best guess)
    const firstPlayer = response.data.response[0];
    const firstName = `${firstPlayer.firstname || ''} ${firstPlayer.lastname || ''}`.trim();
    console.log(`[NBA Helper] No exact match, using first result: ${firstName} (ID: ${firstPlayer.id})`);
    return firstPlayer.id;

  } catch (error) {
    console.error(`[NBA Helper] Error searching for player "${playerName}":`, error.message);
    return null;
  }
}

module.exports = {
  initialize,
  getCurrentNBASeason,
  getPlayerGameLogs,
  getTeamPlayerStats,
  searchPlayerByName,
  normalizePlayerName,
  parseMinutes,
  parseFloat,
  calculateStandardDeviation,
  daysBetween
};
