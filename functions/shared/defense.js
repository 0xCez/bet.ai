/**
 * shared/defense.js — NBA opponent defensive rankings
 *
 * Uses API-Sports game scores to compute opponent points allowed per game,
 * then ranks all 30 teams (1 = best defense = fewest allowed).
 *
 * Cached 24h in Firestore ml_cache collection.
 */

const axios = require('axios');
const admin = require('firebase-admin');
const { withRetry } = require('./retry');

let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

const OPP_STATS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_STALE_DEFENSE = 72 * 60 * 60 * 1000; // 72 hours — stale fallback window

function getCurrentNBASeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 10 ? year : year - 1;
}

function getApiKey() {
  try {
    const functions = require('firebase-functions/v2');
    const key = functions.config().apisports?.key || process.env.API_SPORTS_KEY;
    return key?.trim() || null;
  } catch (e) {
    return process.env.API_SPORTS_KEY?.trim() || null;
  }
}

// API-Sports uses "LA Clippers"; pipelines use "Los Angeles Clippers"
const TEAM_NAME_ALIASES = {
  'la clippers': 'los angeles clippers',
};

function normalizeTeamKey(name) {
  const key = name.toLowerCase().trim();
  return TEAM_NAME_ALIASES[key] || key;
}

/**
 * Fetch opponent defensive stats from API-Sports game scores.
 * Returns { season, fetchedAt, teams, ranks } or null on error.
 */
async function getOpponentDefensiveStats() {
  const seasonYear = getCurrentNBASeason();
  const season = `${seasonYear}-${String(seasonYear + 1).slice(-2)}`;
  const cacheKey = `nba_opp_stats_${season}`;

  // Check Firestore cache — keep reference for stale fallback
  let cachedData = null;
  try {
    const doc = await getDb().collection('ml_cache').doc(cacheKey).get();
    if (doc.exists) {
      cachedData = doc.data();
      if (Date.now() - cachedData.fetchedAt < OPP_STATS_CACHE_TTL) {
        console.log('[defense] Opponent stats cache HIT');
        return cachedData;
      }
    }
  } catch (e) {
    console.warn('[defense] Cache read error:', e.message);
  }

  // Fetch from API-Sports (1 call for all games this season)
  console.log('[defense] Fetching game scores from API-Sports...');
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('[defense] API_SPORTS_KEY not configured');
    // Stale fallback if key missing but cache exists
    if (cachedData?.teams && (Date.now() - cachedData.fetchedAt) < MAX_STALE_DEFENSE) {
      console.warn('[defense] Using stale cache (no API key)');
      return cachedData;
    }
    return null;
  }

  try {
    const resp = await withRetry(
      () => axios.get(
        `https://v2.nba.api-sports.io/games?season=${seasonYear}&league=standard`,
        { headers: { 'x-apisports-key': apiKey }, timeout: 20000 }
      ),
      { maxRetries: 2, label: 'defense-games' }
    );

    const games = resp.data?.response || [];
    const finished = games.filter(g => g.scores?.home?.points && g.scores?.visitors?.points);
    console.log(`[defense] ${finished.length} finished games from ${games.length} total`);

    if (finished.length < 100) {
      console.warn('[defense] Not enough finished games for reliable rankings');
      // Stale fallback — previous rankings still useful
      if (cachedData?.teams && (Date.now() - cachedData.fetchedAt) < MAX_STALE_DEFENSE) {
        console.warn('[defense] Using stale cache (insufficient games)');
        return cachedData;
      }
      return null;
    }

    // Compute opponent points per game for each team
    const teamOppPts = {}; // key -> [opponent scores]
    for (const g of finished) {
      const homeKey = normalizeTeamKey(g.teams.home.name);
      const awayKey = normalizeTeamKey(g.teams.visitors.name);
      const homePts = g.scores.home.points;
      const awayPts = g.scores.visitors.points;

      if (!teamOppPts[homeKey]) teamOppPts[homeKey] = [];
      if (!teamOppPts[awayKey]) teamOppPts[awayKey] = [];
      teamOppPts[homeKey].push(awayPts); // home allowed awayPts
      teamOppPts[awayKey].push(homePts); // away allowed homePts
    }

    // Build teams object with per-game averages
    const teams = {};
    for (const [key, ptsList] of Object.entries(teamOppPts)) {
      teams[key] = {
        oppPts: parseFloat((ptsList.reduce((a, b) => a + b, 0) / ptsList.length).toFixed(1)),
        gamesPlayed: ptsList.length,
      };
    }

    // Rank by opponent points per game (1 = fewest = best defense)
    const ranks = {};
    const sorted = Object.entries(teams).sort((a, b) => a[1].oppPts - b[1].oppPts);
    sorted.forEach(([teamKey], i) => {
      ranks[teamKey] = { oppPtsRank: i + 1 };
    });

    const freshData = { season, fetchedAt: Date.now(), teams, ranks };
    try { await getDb().collection('ml_cache').doc(cacheKey).set(freshData); } catch (e) { /* silent */ }

    console.log(`[defense] Defensive rankings computed for ${Object.keys(teams).length} teams`);
    return freshData;
  } catch (err) {
    // STALE FALLBACK: use expired cache if within 72h
    if (cachedData?.teams && (Date.now() - cachedData.fetchedAt) < MAX_STALE_DEFENSE) {
      const ageHours = Math.round((Date.now() - cachedData.fetchedAt) / 3600000);
      console.warn(`[defense] API failed, using stale cache (${ageHours}h old): ${err.message}`);
      return cachedData;
    }
    console.error('[defense] API-Sports game fetch failed (no stale cache):', err.message);
    return null;
  }
}

/**
 * Get the opponent defensive rank for a prop.
 *
 * Returns { rank, allowed, stat } where rank is 1-30 (1 = best defense).
 * Uses overall points-allowed ranking for all stat types — a team that's
 * strong defensively against points is generally strong across the board.
 */
function getOpponentStatForProp(oppStatsData, oppTeamName, statType) {
  if (!oppStatsData || !oppTeamName) return null;

  const key = normalizeTeamKey(oppTeamName);
  const stats = oppStatsData.teams?.[key];
  const rankData = oppStatsData.ranks?.[key];
  if (!stats || !rankData) return null;

  return {
    rank: rankData.oppPtsRank,
    allowed: stats.oppPts,
    stat: 'PTS',
    gamesPlayed: stats.gamesPlayed,
  };
}

module.exports = { getOpponentDefensiveStats, getOpponentStatForProp };
