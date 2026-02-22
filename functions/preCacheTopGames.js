/**
 * preCacheTopGames.js — 5-Layer Data Architecture
 *
 * Layer 0: Game Discovery     — discoverGames() creates shell docs daily
 * Layer 1: Shared Data Fetch  — refreshGameProps.js fetches all data once per game
 * Layer 2: Pipeline Processing — refreshAllCachedGames() runs EdgeBoard + Parlay Stack
 * Layer 3: AI Enrichment      — enrichWithAIAnalysis() adds GPT-4 analysis independently
 * Layer 4: Archive on Expiry  — archiveExpiredGames() → propsHistory collection
 *
 * Schedulers:
 *   discoverGamesDaily       — 6 AM ET: discover + archive + props
 *   enrichAIDaily             — 7 AM ET: GPT-4 analysis (separate to avoid timeout)
 *   refreshPropsScheduled    — 12 PM ET: fresh odds for content creators
 *   refreshPropsScheduled2   — 5 PM ET: pre-tipoff refresh
 *   refreshPropsScheduled3   — 8 PM ET: late-breaking west coast lines
 *   archiveExpiredGames      — every 2h: move expired → propsHistory
 *
 * HTTP endpoints:
 *   preCacheTopGames  — manual trigger (all layers)
 *   refreshProps      — REFRESH button (Layer 2 only)
 *   getCheatsheetData — read-only (Firestore → JSON)
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");
require('dotenv').config();

// Orchestrator: shared data fetch + both pipelines as library calls (no HTTP round-trips)
const { refreshGameProps } = require('./refreshGameProps');

// Don't initialize Firebase here - it's initialized in index.js which imports this file
// We get the db reference lazily when needed
const getDb = () => admin.firestore();

const { withRetry } = require('./shared/retry');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const ODDS_API_KEY = process.env.ODDS_API_KEY;

const BIG_MARKET_SOCCER_TEAMS = [
  // Premier League
  'Manchester United', 'Manchester City', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham',
  'Newcastle', 'Aston Villa', 'West Ham', 'Brighton', 'Burnley', 'Wolverhampton Wanderers',
  // La Liga
  'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Athletic Bilbao',
  // Serie A
  'Juventus', 'AC Milan', 'Inter Milan', 'Napoli', 'Roma', 'Lazio',
  // Bundesliga
  'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen',
  // Ligue 1
  'Paris Saint Germain', 'Marseille', 'Monaco', 'Lyon'
];

// Soccer leagues to fetch from (prioritized order) - total 10 games
const SOCCER_LEAGUES = [
  { key: 'soccer_epl', name: 'EPL', limit: 3 },
  { key: 'soccer_uefa_champs_league', name: 'Champions League', limit: 2 },
  { key: 'soccer_spain_la_liga', name: 'La Liga', limit: 2 },
  { key: 'soccer_italy_serie_a', name: 'Serie A', limit: 1 },
  { key: 'soccer_germany_bundesliga', name: 'Bundesliga', limit: 1 },
  { key: 'soccer_france_ligue_one', name: 'Ligue 1', limit: 1 }
];

// Post-game buffer: keep analysis available for 4 hours after game starts
// This allows users to still view analysis during/shortly after the game
const POST_GAME_BUFFER_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Check if a game is already cached and still valid
 * Returns true if we should skip caching this game
 */
async function isGameAlreadyCached(cacheRef, sport, team1, team2, oddsApiEventId = null) {
  try {
    const now = new Date().toISOString();

    // Fast path: check by event ID doc key (new format)
    if (oddsApiEventId) {
      const docKey = `${sport.toLowerCase()}_${oddsApiEventId}`;
      const doc = await cacheRef.doc(docKey).get();
      if (doc.exists) {
        const data = doc.data();
        const isExpired = data.expiresAt && data.expiresAt < now;
        const gameStarted = data.gameStartTime && data.gameStartTime < now;
        if (!isExpired && !gameStarted) return true;
      }
    }

    // Fallback: query by team names (for legacy docs without event ID keys)
    const snapshot = await cacheRef
      .where('preCached', '==', true)
      .where('sport', '==', sport.toLowerCase())
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const analysis = data.analysis || {};
      const teams = analysis.teams || {};

      const isMatch =
        (teams.home === team1 && teams.away === team2) ||
        (teams.home === team2 && teams.away === team1);

      if (isMatch) {
        const isExpired = data.expiresAt && data.expiresAt < now;
        const gameStarted = data.gameStartTime && data.gameStartTime < now;
        if (!isExpired && !gameStarted) return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error checking cache for ${team1} vs ${team2}:`, error.message);
    return false;
  }
}

/**
 * Recursively removes empty string keys from objects
 * Firestore doesn't allow empty string keys in map fields
 */
function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '') continue; // Skip empty string keys
      sanitized[key] = sanitizeForFirestore(value);
    }
    return sanitized;
  }
  return obj;
}

/**
 * Fetch upcoming games from The Odds API
 * For NBA: fetches ALL available games (no team filter) sorted by time
 * For Soccer: prioritizes big market teams
 */
async function fetchUpcomingGamesForSport(sport, bigMarketTeams, limit, skipTeamFilter = false) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${ODDS_API_KEY}`;
    console.log(`[discovery] Fetching events for ${sport}...`);

    const response = await withRetry(
      () => axios.get(url, { timeout: 15000 }),
      { maxRetries: 2, label: `discover-${sport}` }
    );
    const events = response.data || [];

    console.log(`Found ${events.length} total upcoming events for ${sport}`);

    // If skipTeamFilter is true (for NBA), just sort by time and take first N
    if (skipTeamFilter) {
      const sortedByTime = events.sort((a, b) =>
        new Date(a.commence_time) - new Date(b.commence_time)
      );
      const selectedGames = sortedByTime.slice(0, limit);
      console.log(`Selected ${selectedGames.length} games for ${sport} (no team filter):`,
        selectedGames.map(g => `${g.home_team} vs ${g.away_team} (${g.commence_time})`));
      return selectedGames;
    }

    // For soccer: Score each game by big market team involvement
    const scoredGames = events.map(event => {
      let score = 0;
      if (bigMarketTeams.some(team => event.home_team.includes(team) || team.includes(event.home_team))) score += 2;
      if (bigMarketTeams.some(team => event.away_team.includes(team) || team.includes(event.away_team))) score += 2;
      // Bonus for games between two big market teams
      if (score === 4) score += 2;
      return { ...event, bigMarketScore: score };
    });

    // Sort by big market score (descending), then by commence_time (ascending)
    scoredGames.sort((a, b) => {
      if (b.bigMarketScore !== a.bigMarketScore) return b.bigMarketScore - a.bigMarketScore;
      return new Date(a.commence_time) - new Date(b.commence_time);
    });

    // Take top N games
    const selectedGames = scoredGames.slice(0, limit);
    console.log(`Selected ${selectedGames.length} games for ${sport}:`,
      selectedGames.map(g => `${g.home_team} vs ${g.away_team} (score: ${g.bigMarketScore})`));

    return selectedGames;

  } catch (error) {
    console.error(`Error fetching games for ${sport}:`, error.message);
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// LAYER 0: Game Discovery
// Creates shell docs in matchAnalysisCache for upcoming games.
// Does NOT run pipelines or GPT-4 — just discovers games and
// creates lightweight Firestore docs so other layers can populate.
// ──────────────────────────────────────────────────────────────

/**
 * Discover upcoming NBA + Soccer games and create shell docs in Firestore.
 * Uses { merge: true } so existing props/analysis are preserved if re-discovering.
 *
 * @returns {{ nba: number, soccer: number, skipped: number }}
 */
async function discoverGames() {
  const cacheRef = getDb().collection('matchAnalysisCache');
  const results = { nba: 0, soccer: 0, skipped: 0 };

  // ── NBA: all upcoming games (no team filter) ──
  console.log('[discoverGames] Fetching NBA games...');
  const nbaGames = await fetchUpcomingGamesForSport('basketball_nba', null, 15, true);
  console.log(`[discoverGames] Found ${nbaGames.length} NBA games`);

  for (const game of nbaGames) {
    const cacheKey = `nba_${game.id}`;
    const gameStart = new Date(game.commence_time);
    const expiresAt = new Date(gameStart.getTime() + POST_GAME_BUFFER_MS).toISOString();

    // Check if already cached and valid
    const existing = await cacheRef.doc(cacheKey).get();
    if (existing.exists) {
      const data = existing.data();
      if (data.gameStartTime && data.gameStartTime > new Date().toISOString()) {
        results.skipped++;
        continue;
      }
    }

    // Create shell doc (merge preserves existing data if re-discovering)
    await cacheRef.doc(cacheKey).set({
      analysis: {
        sport: 'nba',
        teams: { home: game.home_team, away: game.away_team },
        preCached: true,
        preCachedAt: new Date().toISOString(),
        gameStartTime: game.commence_time,
      },
      timestamp: new Date().toISOString(),
      sport: 'nba',
      language: 'en',
      preCached: true,
      gameStartTime: game.commence_time,
      expiresAt,
      oddsApiEventId: game.id,
    }, { merge: true });

    console.log(`[discoverGames] NBA shell: ${game.home_team} vs ${game.away_team} (${cacheKey})`);
    results.nba++;
  }

  // ── Soccer: big market teams across leagues ──
  console.log('[discoverGames] Fetching Soccer games...');
  const soccerLeaguePromises = SOCCER_LEAGUES.map(league =>
    fetchUpcomingGamesForSport(league.key, BIG_MARKET_SOCCER_TEAMS, league.limit, false)
      .then(games => games.map(g => ({ ...g, league: league.name, leagueKey: league.key })))
  );
  const soccerGames = (await Promise.all(soccerLeaguePromises)).flat();
  console.log(`[discoverGames] Found ${soccerGames.length} Soccer games`);

  for (const game of soccerGames) {
    // Soccer doesn't have a stable event ID for alt lines, use team-based key
    const alreadyCached = await isGameAlreadyCached(cacheRef, 'soccer', game.home_team, game.away_team, game.id);
    if (alreadyCached) {
      results.skipped++;
      continue;
    }

    const cacheKey = game.id
      ? `soccer_${game.id}`
      : `soccer_${[game.home_team, game.away_team].sort().join('_').replace(/\s+/g, '_').toLowerCase()}`;
    const gameStart = new Date(game.commence_time);
    const expiresAt = new Date(gameStart.getTime() + POST_GAME_BUFFER_MS).toISOString();

    await cacheRef.doc(cacheKey).set({
      analysis: {
        sport: 'soccer',
        teams: { home: game.home_team, away: game.away_team },
        preCached: true,
        preCachedAt: new Date().toISOString(),
        gameStartTime: game.commence_time,
      },
      timestamp: new Date().toISOString(),
      sport: 'soccer',
      oddsApiSport: game.leagueKey, // e.g. 'soccer_spain_la_liga' — used by AI enrichment
      language: 'en',
      preCached: true,
      gameStartTime: game.commence_time,
      expiresAt,
      ...(game.id && { oddsApiEventId: game.id }),
    }, { merge: true });

    console.log(`[discoverGames] Soccer shell: ${game.home_team} vs ${game.away_team} [${game.league}]`);
    results.soccer++;
  }

  console.log(`[discoverGames] Done — NBA: ${results.nba}, Soccer: ${results.soccer}, Skipped: ${results.skipped}`);
  return results;
}

// ──────────────────────────────────────────────────────────────
// LAYER 2: Refresh All Cached Games (props only)
// Queries all upcoming NBA games in cache and runs both pipelines
// via the orchestrator (shared data, zero duplicate API calls).
// ──────────────────────────────────────────────────────────────

/**
 * Refresh mlPlayerProps for all upcoming cached NBA games.
 * @param {object} options - { pipeline: 'edge'|'stack'|'both' }
 * @returns {{ updated: number, failed: number, games: Array }}
 */
async function refreshAllCachedGames(options = {}) {
  const { pipeline = 'both' } = options;
  const db = getDb();
  const now = new Date().toISOString();

  const snapshot = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  const upcoming = snapshot.docs.filter(doc => {
    const data = doc.data();
    return data.gameStartTime && data.gameStartTime > now;
  });

  console.log(`[refreshAllCachedGames] ${upcoming.length} upcoming NBA games (pipeline: ${pipeline})`);

  let updated = 0, failed = 0;
  const gameResults = [];
  let consecutiveCritical = 0;
  const CIRCUIT_THRESHOLD = 3;
  let circuitBroken = false;
  let circuitReason = null;

  for (const doc of upcoming) {
    const data = doc.data();
    const team1 = data.analysis?.teams?.home;
    const team2 = data.analysis?.teams?.away;
    const eventId = data.oddsApiEventId || null;
    if (!team1 || !team2 || !eventId) continue;

    // Skip remaining games if circuit broken
    if (circuitBroken) {
      console.warn(`[CIRCUIT OPEN] Skipping ${team1} vs ${team2}: ${circuitReason}`);
      const existing = data.analysis?.mlPlayerProps || {};
      const edgeCount = existing.topProps?.length || existing.edgeBoard?.topProps?.length || 0;
      const stackCount = existing.parlayStack?.legs?.length || 0;
      gameResults.push({ teams: `${team2} @ ${team1}`, edge: edgeCount, stack: stackCount, status: 'skipped', eventId });
      continue;
    }

    try {
      const { mlPlayerProps, health } = await refreshGameProps(eventId, {
        pipeline,
        gameDate: data.gameStartTime,
      });

      const existing = data.analysis?.mlPlayerProps || {};
      const merged = { ...existing };

      // Only overwrite edge data if new data has content (don't wipe good data with empty results)
      const newEdgeCount = mlPlayerProps.topProps?.length || mlPlayerProps.edgeBoard?.topProps?.length || 0;
      if (newEdgeCount > 0) {
        merged.topProps = mlPlayerProps.topProps;
        merged.edgeBoard = mlPlayerProps.edgeBoard;
        merged.goblinLegs = mlPlayerProps.goblinLegs;
        merged.totalPropsAvailable = mlPlayerProps.totalPropsAvailable;
        merged.highConfidenceCount = mlPlayerProps.highConfidenceCount;
        merged.mediumConfidenceCount = mlPlayerProps.mediumConfidenceCount;
        merged.gameTime = mlPlayerProps.gameTime;
      }

      // Only overwrite stack data if new data has content
      const newStackCount = mlPlayerProps.parlayStack?.legs?.length || 0;
      if (newStackCount > 0) {
        merged.parlayStack = mlPlayerProps.parlayStack;
      }

      const edgeCount = merged.topProps?.length || merged.edgeBoard?.topProps?.length || 0;
      const stackCount = merged.parlayStack?.legs?.length || 0;
      const edgeSource = newEdgeCount > 0 ? 'fresh' : 'preserved';
      const stackSource = newStackCount > 0 ? 'fresh' : 'preserved';

      // Firestore update with diagnostic stamp
      await doc.ref.update({
        'analysis.mlPlayerProps': merged,
        'analysis.lastRefresh': {
          at: new Date().toISOString(),
          health: health?.overall || 'unknown',
          edgeCount,
          stackCount,
          edgeSource,
          stackSource,
        },
      });

      console.log(`[refreshAllCachedGames] ${team1} vs ${team2}: EB=${edgeCount}(${edgeSource}), PS=${stackCount}(${stackSource}), health=${health?.overall || 'unknown'}`);
      gameResults.push({ teams: `${team2} @ ${team1}`, edge: edgeCount, stack: stackCount, eventId });
      updated++;

      // Circuit breaker: track consecutive critical health with empty results
      if (health?.overall === 'critical' && newEdgeCount === 0 && newStackCount === 0) {
        consecutiveCritical++;
        if (consecutiveCritical >= CIRCUIT_THRESHOLD) {
          circuitBroken = true;
          circuitReason = `${consecutiveCritical} consecutive critical failures`;
          console.error(`[CIRCUIT BREAKER] ${circuitReason} — skipping remaining games`);
        }
      } else {
        consecutiveCritical = 0;
      }
    } catch (err) {
      console.error(`[refreshAllCachedGames] ${team1} vs ${team2}: ${err.message}`);
      gameResults.push({ teams: `${team2} @ ${team1}`, edge: 0, stack: 0, status: 'error', eventId });
      failed++;
      consecutiveCritical++;
      if (consecutiveCritical >= CIRCUIT_THRESHOLD) {
        circuitBroken = true;
        circuitReason = `${consecutiveCritical} consecutive exceptions`;
        console.error(`[CIRCUIT BREAKER] ${circuitReason} — skipping remaining games`);
      }
    }
  }

  return { updated, failed, games: gameResults, circuitBroken, circuitReason };
}

/**
 * Self-heal: retry games that ended up empty after a refresh.
 * Runs with remaining timeout budget after the main refresh.
 *
 * @param {object} refreshResult - Output from refreshAllCachedGames
 * @param {object} options - { pipeline, timeoutBudgetMs }
 * @returns {{ healed: number, stillEmpty: number }}
 */
async function selfHeal(refreshResult, options = {}) {
  const { pipeline = 'both', timeoutBudgetMs = 120000 } = options;

  const emptyGames = refreshResult.games.filter(g =>
    (g.edge === 0 && g.stack === 0) || g.status === 'skipped' || g.status === 'error'
  );

  if (emptyGames.length === 0) return { healed: 0, stillEmpty: 0 };

  console.log(`[selfHeal] ${emptyGames.length} games need healing (budget: ${Math.round(timeoutBudgetMs / 1000)}s)`);

  // If circuit broke, wait 30s for transient issues to clear, then probe
  if (refreshResult.circuitBroken) {
    console.log('[selfHeal] Circuit was broken — waiting 30s before probe...');
    await new Promise(r => setTimeout(r, 30000));
  }

  const db = getDb();
  let healed = 0, stillEmpty = 0;
  const startTime = Date.now();

  for (const game of emptyGames) {
    if (Date.now() - startTime > timeoutBudgetMs) {
      console.warn(`[selfHeal] Time budget exhausted — ${emptyGames.length - healed - stillEmpty} games left unhealed`);
      break;
    }

    if (!game.eventId) { stillEmpty++; continue; }

    try {
      const { mlPlayerProps, health } = await refreshGameProps(game.eventId, { pipeline });
      const newEdgeCount = mlPlayerProps.topProps?.length || mlPlayerProps.edgeBoard?.topProps?.length || 0;
      const newStackCount = mlPlayerProps.parlayStack?.legs?.length || 0;

      if (newEdgeCount === 0 && newStackCount === 0) {
        console.warn(`[selfHeal] ${game.teams}: still empty (health: ${health?.overall})`);
        stillEmpty++;
        // If first probe after circuit break still fails, API is still down — stop
        if (refreshResult.circuitBroken && healed === 0 && stillEmpty === 1) {
          console.warn('[selfHeal] Probe failed after circuit break — API still down, stopping');
          stillEmpty += emptyGames.length - 1;
          break;
        }
        continue;
      }

      // Merge into Firestore (same logic as refreshAllCachedGames)
      const cacheKey = `nba_${game.eventId}`;
      const docRef = db.collection('matchAnalysisCache').doc(cacheKey);
      const doc = await docRef.get();
      if (!doc.exists) { stillEmpty++; continue; }

      const existing = doc.data().analysis?.mlPlayerProps || {};
      const merged = { ...existing };

      if (newEdgeCount > 0) {
        merged.topProps = mlPlayerProps.topProps;
        merged.edgeBoard = mlPlayerProps.edgeBoard;
        merged.goblinLegs = mlPlayerProps.goblinLegs;
        merged.totalPropsAvailable = mlPlayerProps.totalPropsAvailable;
        merged.highConfidenceCount = mlPlayerProps.highConfidenceCount;
        merged.mediumConfidenceCount = mlPlayerProps.mediumConfidenceCount;
        merged.gameTime = mlPlayerProps.gameTime;
      }
      if (newStackCount > 0) {
        merged.parlayStack = mlPlayerProps.parlayStack;
      }

      await docRef.update({
        'analysis.mlPlayerProps': merged,
        'analysis.lastRefresh': {
          at: new Date().toISOString(),
          health: health?.overall || 'unknown',
          edgeCount: newEdgeCount,
          stackCount: newStackCount,
          edgeSource: 'healed',
          stackSource: 'healed',
        },
      });

      console.log(`[selfHeal] HEALED ${game.teams}: EB=${newEdgeCount}, PS=${newStackCount}`);
      healed++;
    } catch (err) {
      console.error(`[selfHeal] ${game.teams}: ${err.message}`);
      stillEmpty++;
    }
  }

  console.log(`[selfHeal] Done — healed: ${healed}, stillEmpty: ${stillEmpty}`);
  return { healed, stillEmpty };
}

/**
 * ensureGamesExist — Safety net for refresh schedulers.
 * If no upcoming NBA games exist in cache, run discovery first.
 * Prevents the scenario where discoverGamesDaily fails and all
 * subsequent schedulers find 0 games to refresh.
 */
async function ensureGamesExist() {
  const db = getDb();
  const now = new Date().toISOString();

  const snapshot = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  const upcoming = snapshot.docs.filter(doc => {
    const data = doc.data();
    return data.gameStartTime && data.gameStartTime > now;
  });

  if (upcoming.length === 0) {
    console.warn('[ensureGamesExist] 0 upcoming NBA games in cache — running emergency discovery');
    const discovered = await discoverGames();
    console.log(`[ensureGamesExist] Discovered: NBA=${discovered.nba}, Soccer=${discovered.soccer}`);
    return discovered;
  }

  console.log(`[ensureGamesExist] ${upcoming.length} upcoming games already in cache — skipping discovery`);
  return null;
}

/**
 * healWithBudget — Multi-pass self-heal within remaining Cloud Function timeout.
 * Pass 1: retry all empty/failed games.
 * Pass 2: if still empties and time remains, retry AGAIN.
 * Pass 3: if STILL empties and time remains, one more shot.
 *
 * @param {object} refreshResult - Output from refreshAllCachedGames
 * @param {number} startTime - Date.now() when the scheduler started
 * @param {string} pipeline - 'edge' | 'stack' | 'both'
 * @returns {object|null} - { totalHealed, totalStillEmpty, passes } or null if no healing needed
 */
async function healWithBudget(refreshResult, startTime, pipeline = 'both') {
  const MAX_PASSES = 3;
  const FUNCTION_TIMEOUT_MS = 540 * 1000;
  const SAFETY_MARGIN_MS = 15000;

  const needsHealing = refreshResult.circuitBroken ||
    refreshResult.games.some(g => g.edge === 0 && g.stack === 0);

  if (!needsHealing) return null;

  let totalHealed = 0;
  let totalStillEmpty = 0;
  let currentResult = refreshResult;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const elapsed = Date.now() - startTime;
    const remaining = FUNCTION_TIMEOUT_MS - elapsed - SAFETY_MARGIN_MS;

    if (remaining < 30000) {
      console.warn(`[healWithBudget] Pass ${pass}: only ${Math.round(remaining / 1000)}s left — stopping`);
      break;
    }

    console.log(`[healWithBudget] Pass ${pass}/${MAX_PASSES} — budget: ${Math.round(remaining / 1000)}s`);
    const healResult = await selfHeal(currentResult, { pipeline, timeoutBudgetMs: remaining });
    totalHealed += healResult.healed;
    totalStillEmpty = healResult.stillEmpty;

    if (healResult.stillEmpty === 0) {
      console.log(`[healWithBudget] All games healed after pass ${pass}`);
      break;
    }

    // Build a synthetic refreshResult for the next pass using only the still-empty games
    // Preserve circuit state so selfHeal's probe logic works on subsequent passes
    currentResult = {
      circuitBroken: refreshResult.circuitBroken,
      circuitReason: refreshResult.circuitReason,
      games: currentResult.games.filter(g =>
        (g.edge === 0 && g.stack === 0) || g.status === 'skipped' || g.status === 'error'
      ),
    };
  }

  console.log(`[healWithBudget] Final — totalHealed: ${totalHealed}, totalStillEmpty: ${totalStillEmpty}`);
  return { totalHealed, totalStillEmpty };
}

/**
 * preCacheTopGames - HTTP endpoint (manual trigger)
 *
 * Uses the new layered architecture:
 *   Layer 4: Archive expired games → propsHistory
 *   Layer 0: Discover upcoming games (create shell docs)
 *   Layer 2: Refresh props for all cached NBA games
 *   Layer 3: Enrich unenriched games with AI analysis
 */
exports.preCacheTopGames = onRequest({
  timeoutSeconds: 540,
  memory: '512MiB',
  cors: true,
  secrets: ['API_SPORTS_KEY'],
}, async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, authorization');
    if (req.method === 'OPTIONS') return res.status(204).send('');

    console.log('[preCacheTopGames] Starting...');
    const startTime = Date.now();
    const forceRefresh = req.body?.forceRefresh === true;

    try {
      // Force refresh: delete all NBA docs so discovery re-creates them
      if (forceRefresh) {
        console.log('[preCacheTopGames] FORCE REFRESH — deleting all NBA cache docs');
        const cacheRef = getDb().collection('matchAnalysisCache');
        const snapshot = await cacheRef.where('sport', '==', 'nba').where('preCached', '==', true).get();
        if (!snapshot.empty) {
          const batch = getDb().batch();
          snapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
          console.log(`[preCacheTopGames] Deleted ${snapshot.size} NBA docs`);
        }
      }

      // Layer 4: Archive expired games
      const archived = await archiveExpiredGames();

      // Layer 0: Discover games (create shell docs)
      const discovered = await discoverGames();

      // Layer 2: Refresh props for all upcoming NBA games
      const refreshed = await refreshAllCachedGames({ pipeline: 'both' });

      // Multi-pass self-heal with remaining time budget
      const healing = await healWithBudget(refreshed, startTime, 'both');

      // Layer 3: AI enrichment — runs by default for complete data
      // Skip with { skipAI: true } if you only want props
      let enriched = { enriched: 0, failed: 0 };
      if (req.body?.skipAI !== true) {
        enriched = await enrichAllUnenrichedGames();
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[preCacheTopGames] Done in ${duration}s`);
      if (healing) console.log(`[preCacheTopGames] Healed: ${healing.totalHealed}, stillEmpty: ${healing.totalStillEmpty}`);

      res.status(200).json({
        success: true,
        duration: `${duration}s`,
        summary: {
          archived: archived.archived,
          discovered: { nba: discovered.nba, soccer: discovered.soccer, skipped: discovered.skipped },
          props: { updated: refreshed.updated, failed: refreshed.failed },
          aiEnriched: enriched.enriched,
        },
        games: refreshed.games,
        healing,
      });

    } catch (error) {
      console.error('[preCacheTopGames] Fatal:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

/**
 * Generate AI analysis using GPT-4 (simplified version of analyzeImage prompt)
 * This creates matchSnapshot, xFactors, and aiAnalysis breakdown
 */
async function generateAIAnalysis(sport, team1, team2, marketIntelligence, teamStats, keyInsightsNew, gameData) {
  const locale = 'en';

  // Build the AI prompt with available data
  const prompt = `
  Task: You are an expert sports betting analyst. Generate betting analysis for this ${sport.toUpperCase()} game.

  ## Teams
  Home: ${team1}
  Away: ${team2}

  ## Market Intelligence
  ${JSON.stringify(marketIntelligence || {})}

  ## Team Statistics
  ${JSON.stringify(teamStats || {})}

  ## Key Insights
  ${JSON.stringify(keyInsightsNew || {})}

  ## Game Data (Last 10 games, H2H, Injuries)
  ${JSON.stringify(gameData || {})}

  Your tone should be sharp, real, and degen — like a bettor who's been in the trenches.

  Return JSON with this exact structure:
  {
    "keyInsights": {
      "confidence": "Low" | "Medium" | "High",
      "marketActivity": "Low" | "Moderate" | "High",
      "lineShift": "Low" | "Moderate" | "High",
      "publicVsSharps": { "public": 65, "sharps": 35 }
    },
    "matchSnapshot": {
      "recentPerformance": {
        "home": "e.g., 7-3 (W-W-L-W-W)",
        "away": "e.g., 5-5 (L-W-L-W-L)"
      },
      "headToHead": "e.g., 2-1 in last 3 matchups",
      "momentum": {
        "home": "e.g., On a 3-game win streak",
        "away": "e.g., Struggling on the road"
      }
    },
    "xFactors": [
      { "title": "Health & Availability", "detail": "Key injury impact", "type": 1 },
      { "title": "Location & Weather", "detail": "Venue/weather factors", "type": 2 },
      { "title": "Officiating & Rules", "detail": "Referee trends", "type": 3 },
      { "title": "Travel & Fatigue", "detail": "Rest and travel effect", "type": 4 }
    ],
    "aiAnalysis": {
      "confidenceScore": "5.8",
      "bettingSignal": "Value Bet" | "Public Trap" | "Sharp Trap" | "Market Conflicted",
      "breakdown": "3 paragraphs (~60-80 words each) with Market Read, On-Court Context, and Betting Interpretation"
    }
  }

  Make sure xFactors are specific based on the data. The breakdown should be 3 paragraphs covering:
  1. Market Read vs Reality (sharp/public split, line movement)
  2. On-Court Context (matchup analysis, form, injuries)
  3. Betting Interpretation (clear recommendation or angle)

  Return only the JSON object.`;

  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: prompt
      }],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" }
    }, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 45000
    });

    const aiResponse = response.data.choices[0]?.message?.content;
    const parsed = JSON.parse(aiResponse);

    console.log(`✅ AI analysis generated successfully`);
    return parsed;

  } catch (error) {
    console.error(`❌ AI analysis failed: ${error.message}`);
    // Return fallback analysis if AI fails
    return generateFallbackAnalysis(team1, team2, keyInsightsNew, teamStats, gameData);
  }
}

/**
 * Generate fallback analysis from data if GPT-4 fails
 */
function generateFallbackAnalysis(team1, team2, keyInsightsNew, teamStats, gameData) {
  const t1Stats = teamStats?.team1?.stats || {};
  const t2Stats = teamStats?.team2?.stats || {};
  const t1WL = gameData?.team1_last10games?.winLossRecord || { wins: 0, losses: 0 };
  const t2WL = gameData?.team2_last10games?.winLossRecord || { wins: 0, losses: 0 };

  return {
    keyInsights: {
      confidence: keyInsightsNew?.confidenceScore >= 70 ? "High" : keyInsightsNew?.confidenceScore >= 50 ? "Medium" : "Low",
      marketActivity: "Moderate",
      lineShift: "Low",
      publicVsSharps: { public: 60, sharps: 40 }
    },
    matchSnapshot: {
      recentPerformance: {
        home: `${t1WL.wins}-${t1WL.losses}`,
        away: `${t2WL.wins}-${t2WL.losses}`
      },
      headToHead: gameData?.h2h_games?.h2hRecord
        ? `${gameData.h2h_games.h2hRecord.team1Wins || 0}-${gameData.h2h_games.h2hRecord.team2Wins || 0} recent matchups`
        : "No recent H2H data",
      momentum: {
        home: t1WL.wins > t1WL.losses ? "Trending up" : "Struggling",
        away: t2WL.wins > t2WL.losses ? "Trending up" : "Struggling"
      }
    },
    xFactors: [
      { title: "Health & Availability", detail: "Check injury reports before betting", type: 1 },
      { title: "Location & Weather", detail: "Standard conditions expected", type: 2 },
      { title: "Officiating & Rules", detail: "Standard officiating expected", type: 3 },
      { title: "Travel & Fatigue", detail: "Normal rest for both teams", type: 4 }
    ],
    aiAnalysis: {
      confidenceScore: String(keyInsightsNew?.confidenceScore || 55),
      bettingSignal: keyInsightsNew?.bestValue ? "Value Bet" : "Market Conflicted",
      breakdown: `Market analysis for ${team1} vs ${team2}. ${keyInsightsNew?.marketConsensus?.display || 'Market efficiently priced.'}. ${keyInsightsNew?.bestValue?.label || 'Shop around for the best lines.'}. Check the key insights above for specific betting opportunities.`
    }
  };
}

// ──────────────────────────────────────────────────────────────
// LAYER 3: Independent AI Analysis Enrichment
// Enriches existing cache docs with GPT-4 analysis + market data.
// Runs AFTER discovery + props — never blocks props.
// ──────────────────────────────────────────────────────────────

/**
 * Enrich a single cache doc with AI analysis (GPT-4 + marketIntelligence).
 * Skips if aiAnalysis already exists.
 *
 * @param {string} docId - Firestore doc ID in matchAnalysisCache
 */
async function enrichWithAIAnalysis(docId) {
  const db = getDb();
  const docRef = db.collection('matchAnalysisCache').doc(docId);
  const doc = await docRef.get();
  if (!doc.exists) {
    console.log(`[enrichAI] Doc ${docId} not found, skipping`);
    return;
  }

  const data = doc.data();
  const analysis = data.analysis || {};

  // Skip if already enriched
  if (analysis.aiAnalysis) {
    console.log(`[enrichAI] ${docId} already has AI analysis, skipping`);
    return;
  }

  const team1 = analysis.teams?.home;
  const team2 = analysis.teams?.away;
  const sport = data.sport || 'nba';
  if (!team1 || !team2) {
    console.log(`[enrichAI] ${docId} missing teams, skipping`);
    return;
  }

  const baseUrl = process.env.FUNCTIONS_EMULATOR === 'true'
    ? 'http://127.0.0.1:5001/betai-f9176/us-central1'
    : 'https://us-central1-betai-f9176.cloudfunctions.net';

  // Determine the Odds API sport key for marketIntelligence
  // NBA is always 'basketball_nba'. Soccer uses the stored league key (e.g. 'soccer_spain_la_liga')
  const oddsApiSport = sport === 'nba'
    ? 'basketball_nba'
    : data.oddsApiSport || 'soccer_epl';

  console.log(`[enrichAI] Enriching ${team1} vs ${team2} (${docId})...`);

  try {
    // Fetch market intelligence data (separate Cloud Function)
    const miResponse = await axios.post(`${baseUrl}/marketIntelligence`, {
      sport: oddsApiSport,
      team1,
      team2,
      locale: 'en'
    }, { timeout: 60000 });

    if (miResponse.data.marketIntelligence?.error) {
      console.error(`[enrichAI] Market intelligence error: ${miResponse.data.marketIntelligence.error}`);
      return;
    }

    const miData = miResponse.data;

    // Generate AI analysis via GPT-4
    const aiResult = await generateAIAnalysis(
      sport, team1, team2,
      miData.marketIntelligence,
      miData.teamStats,
      miData.keyInsightsNew,
      miData.gameData
    );

    // Merge AI fields into existing doc (doesn't touch mlPlayerProps)
    const enrichment = sanitizeForFirestore({
      'analysis.keyInsights': aiResult.keyInsights,
      'analysis.matchSnapshot': aiResult.matchSnapshot,
      'analysis.xFactors': aiResult.xFactors,
      'analysis.aiAnalysis': aiResult.aiAnalysis,
      'analysis.marketIntelligence': miData.marketIntelligence,
      'analysis.teamStats': miData.teamStats,
      'analysis.keyInsightsNew': miData.keyInsightsNew,
      'analysis.teams.logos': miData.teams?.logos || {},
    });

    await docRef.update(enrichment);
    console.log(`[enrichAI] ${team1} vs ${team2} enriched successfully`);

  } catch (err) {
    console.error(`[enrichAI] Failed for ${docId}: ${err.message}`);
  }
}

/**
 * Enrich all unenriched cache docs with AI analysis.
 * Queries for NBA docs missing aiAnalysis field.
 */
async function enrichAllUnenrichedGames() {
  const db = getDb();
  const now = new Date().toISOString();

  const snapshot = await db.collection('matchAnalysisCache')
    .where('preCached', '==', true)
    .get();

  const unenriched = snapshot.docs.filter(doc => {
    const data = doc.data();
    // Only upcoming games without AI analysis
    return data.gameStartTime && data.gameStartTime > now && !data.analysis?.aiAnalysis;
  });

  console.log(`[enrichAI] ${unenriched.length} games need AI enrichment`);

  let enriched = 0, failed = 0;
  for (const doc of unenriched) {
    try {
      await enrichWithAIAnalysis(doc.id);
      enriched++;
    } catch (err) {
      console.error(`[enrichAI] Error enriching ${doc.id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`[enrichAI] Done — enriched: ${enriched}, failed: ${failed}`);
  return { enriched, failed };
}

// ──────────────────────────────────────────────────────────────
// LAYER 4: Archive on Expiry
// Copies expired game data to propsHistory for tracking, then
// deletes from matchAnalysisCache.
// ──────────────────────────────────────────────────────────────

/**
 * Archive expired games to propsHistory, then delete from cache.
 * @returns {{ archived: number, deleted: number }}
 */
async function archiveExpiredGames() {
  const db = getDb();
  const now = new Date().toISOString();

  const snapshot = await db.collection('matchAnalysisCache')
    .where('preCached', '==', true)
    .get();

  const expired = snapshot.docs.filter(doc => {
    const data = doc.data();
    return data.expiresAt && data.expiresAt < now;
  });

  if (expired.length === 0) {
    console.log('[archiveExpiredGames] No expired games to archive');
    return { archived: 0, deleted: 0 };
  }

  console.log(`[archiveExpiredGames] ${expired.length} expired games to archive`);

  let archived = 0, deleted = 0;
  const batch = db.batch();

  for (const doc of expired) {
    const data = doc.data();
    const analysis = data.analysis || {};

    // Archive: copy key fields to propsHistory
    const archiveDoc = {
      sport: data.sport,
      teams: analysis.teams || {},
      gameStartTime: data.gameStartTime,
      oddsApiEventId: data.oddsApiEventId || null,
      mlPlayerProps: analysis.mlPlayerProps || null,
      archivedAt: new Date().toISOString(),
    };

    const historyRef = db.collection('propsHistory').doc(doc.id);
    batch.set(historyRef, archiveDoc);
    archived++;

    // Delete from cache
    batch.delete(doc.ref);
    deleted++;
  }

  await batch.commit();
  console.log(`[archiveExpiredGames] Done — archived: ${archived}, deleted: ${deleted}`);
  return { archived, deleted };
}

// ──────────────────────────────────────────────────────────────
// NEW SCHEDULERS
// ──────────────────────────────────────────────────────────────

/**
 * discoverGamesDaily — 6 AM ET (11 AM UTC)
 * Layer 0 + 4 + 2: Discover games, archive expired, refresh props.
 * AI enrichment runs separately (enrichAIDaily) to avoid timeout.
 */
exports.discoverGamesDaily = onSchedule({
  schedule: '0 11 * * *', // 11 AM UTC = 6 AM ET
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: ['API_SPORTS_KEY'],
}, async () => {
  console.log('[discoverGamesDaily] Starting...');
  const startTime = Date.now();
  try {
    // Layer 4: archive expired games first (fast, ~3s)
    const archived = await archiveExpiredGames();

    // Layer 0: discover games — create shell docs (fast, ~15s)
    const discovered = await discoverGames();

    // Safety net: if discovery returned 0, ensure cache isn't empty
    if (discovered.nba === 0) {
      console.warn('[discoverGamesDaily] Discovery returned 0 NBA games — running ensureGamesExist fallback');
      await ensureGamesExist();
    }

    // Layer 2: refresh props for all upcoming NBA games (~20-30s per game)
    const refreshed = await refreshAllCachedGames({ pipeline: 'both' });

    // Self-heal with remaining time budget (multi-pass)
    const healResult = await healWithBudget(refreshed, startTime, 'both');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[discoverGamesDaily] Done in ${duration}s`);
    console.log(`  Archived: ${archived.archived}`);
    console.log(`  Discovered: NBA=${discovered.nba}, Soccer=${discovered.soccer}`);
    console.log(`  Props: ${refreshed.updated} updated, ${refreshed.failed} failed`);
    if (healResult) console.log(`  Healed: ${healResult.totalHealed}, stillEmpty: ${healResult.totalStillEmpty}`);
  } catch (error) {
    console.error('[discoverGamesDaily] Fatal:', error);
    throw error;
  }
});

/**
 * enrichAIDaily — 7 AM ET (12 PM UTC)
 * Layer 3: Enrich unenriched games with GPT-4 analysis.
 * Runs 1 hour after discoverGamesDaily so shell docs + props exist.
 * Separate scheduler because marketIntelligence + GPT-4 is slow (~20-30s per game).
 */
exports.enrichAIDaily = onSchedule({
  schedule: '0 12 * * *', // 12 PM UTC = 7 AM ET
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB'
}, async () => {
  console.log('[enrichAIDaily] Starting...');
  const startTime = Date.now();
  try {
    const enriched = await enrichAllUnenrichedGames();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[enrichAIDaily] Done in ${duration}s — enriched: ${enriched.enriched}, failed: ${enriched.failed}`);
  } catch (error) {
    console.error('[enrichAIDaily] Fatal:', error);
    throw error;
  }
});

/**
 * refreshPropsScheduled — 12 PM ET (5 PM UTC)
 * Layer 2: Fresh odds for content creators (midday).
 */
exports.refreshPropsScheduled = onSchedule({
  schedule: '0 17 * * *', // 5 PM UTC = 12 PM ET
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: ['API_SPORTS_KEY'],
}, async () => {
  console.log('[refreshPropsScheduled] Starting midday refresh...');
  const startTime = Date.now();
  try {
    // Auto-discover if no upcoming games in cache (safety net if discoverGamesDaily failed)
    await ensureGamesExist();

    const result = await refreshAllCachedGames({ pipeline: 'both' });
    const healResult = await healWithBudget(result, startTime, 'both');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[refreshPropsScheduled] Done in ${duration}s — ${result.updated} updated, ${result.failed} failed`);
    if (healResult) console.log(`[refreshPropsScheduled] Healed: ${healResult.totalHealed}, stillEmpty: ${healResult.totalStillEmpty}`);
  } catch (error) {
    console.error('[refreshPropsScheduled] Fatal:', error);
    throw error;
  }
});

/**
 * refreshPropsScheduled2 — 5 PM ET (10 PM UTC)
 * Layer 2: Pre-tipoff refresh (most NBA games start 7 PM ET).
 */
exports.refreshPropsScheduled2 = onSchedule({
  schedule: '0 22 * * *', // 10 PM UTC = 5 PM ET
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: ['API_SPORTS_KEY'],
}, async () => {
  console.log('[refreshPropsScheduled2] Starting pre-tipoff refresh...');
  const startTime = Date.now();
  try {
    await ensureGamesExist();

    const result = await refreshAllCachedGames({ pipeline: 'both' });
    const healResult = await healWithBudget(result, startTime, 'both');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[refreshPropsScheduled2] Done in ${duration}s — ${result.updated} updated, ${result.failed} failed`);
    if (healResult) console.log(`[refreshPropsScheduled2] Healed: ${healResult.totalHealed}, stillEmpty: ${healResult.totalStillEmpty}`);
  } catch (error) {
    console.error('[refreshPropsScheduled2] Fatal:', error);
    throw error;
  }
});

/**
 * refreshPropsScheduled3 — 8 PM ET (1 AM UTC next day)
 * Layer 2: Late-breaking lines (west coast games).
 */
exports.refreshPropsScheduled3 = onSchedule({
  schedule: '0 1 * * *', // 1 AM UTC = 8 PM ET
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: ['API_SPORTS_KEY'],
}, async () => {
  console.log('[refreshPropsScheduled3] Starting late refresh...');
  const startTime = Date.now();
  try {
    await ensureGamesExist();

    const result = await refreshAllCachedGames({ pipeline: 'both' });
    const healResult = await healWithBudget(result, startTime, 'both');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[refreshPropsScheduled3] Done in ${duration}s — ${result.updated} updated, ${result.failed} failed`);
    if (healResult) console.log(`[refreshPropsScheduled3] Healed: ${healResult.totalHealed}, stillEmpty: ${healResult.totalStillEmpty}`);
  } catch (error) {
    console.error('[refreshPropsScheduled3] Fatal:', error);
    throw error;
  }
});

/**
 * archiveExpiredGamesScheduled — Every 2 hours
 * Layer 4: Move expired games to propsHistory, delete from cache.
 */
exports.archiveExpiredGamesScheduled = onSchedule({
  schedule: '0 */2 * * *', // every 2 hours
  timeZone: 'UTC',
  timeoutSeconds: 60,
  memory: '256MiB'
}, async () => {
  console.log('[archiveExpiredGamesScheduled] Starting...');
  try {
    const result = await archiveExpiredGames();
    console.log(`[archiveExpiredGamesScheduled] Done — archived: ${result.archived}, deleted: ${result.deleted}`);
  } catch (error) {
    console.error('[archiveExpiredGamesScheduled] Fatal:', error);
    throw error;
  }
});

/**
 * refreshProps — Lightweight HTTP endpoint for cheatsheet tool.
 *
 * Only refreshes mlPlayerProps for existing cached NBA games.
 * Skips market intelligence + GPT-4 (those are expensive and only needed for full cache).
 *
 * Body params:
 *   pipeline: 'edge' | 'stack' | 'both' (default: 'both')
 */
exports.refreshProps = onRequest({
  timeoutSeconds: 540,
  memory: '1GiB',
  cors: true,
  secrets: ['API_SPORTS_KEY'],
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const pipeline = req.body?.pipeline || 'both';
  console.log(`[refreshProps] Starting (pipeline: ${pipeline})...`);
  const startTime = Date.now();

  try {
    const db = getDb();
    const now = new Date().toISOString();

    // Check if we have any upcoming NBA games in cache
    const snapshot = await db.collection('matchAnalysisCache')
      .where('sport', '==', 'nba')
      .where('preCached', '==', true)
      .get();

    const upcomingCount = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.gameStartTime && data.gameStartTime > now;
    }).length;

    // Auto-fetch fallback: if cache is empty, discover games first
    if (upcomingCount === 0) {
      console.log('[refreshProps] Cache empty — running discoverGames first...');
      const freshEvents = await fetchUpcomingGamesForSport('basketball_nba', null, 10, true);

      if (freshEvents.length === 0) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        return res.status(200).json({ success: true, pipeline, duration: `${duration}s`, updated: 0, failed: 0, games: [], message: 'No upcoming NBA games found on The Odds API' });
      }

      // Create shell docs for discovered games
      for (const event of freshEvents) {
        const cacheKey = `nba_${event.id}`;
        const gameStart = new Date(event.commence_time);
        const expiresAt = new Date(gameStart.getTime() + POST_GAME_BUFFER_MS).toISOString();
        try {
          await db.collection('matchAnalysisCache').doc(cacheKey).set({
            analysis: {
              sport: 'nba',
              teams: { home: event.home_team, away: event.away_team },
              preCached: true,
              preCachedAt: new Date().toISOString(),
              gameStartTime: event.commence_time,
            },
            timestamp: new Date().toISOString(),
            sport: 'nba',
            language: 'en',
            preCached: true,
            gameStartTime: event.commence_time,
            expiresAt,
            oddsApiEventId: event.id,
          });
        } catch (err) {
          console.error(`[refreshProps] Failed to create cache entry: ${err.message}`);
        }
      }
      console.log(`[refreshProps] Created ${freshEvents.length} shell docs`);
    }

    // Delegate to shared refresh logic (Layer 2: props only — fast)
    const result = await refreshAllCachedGames({ pipeline });

    // Multi-pass self-heal with remaining time budget
    const healing = await healWithBudget(result, startTime, pipeline);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[refreshProps] Done in ${duration}s — ${result.updated} updated, ${result.failed} failed`);
    if (healing) console.log(`[refreshProps] Healed: ${healing.totalHealed}, stillEmpty: ${healing.totalStillEmpty}`);

    res.status(200).json({ success: true, pipeline, duration: `${duration}s`, ...result, healing });
  } catch (err) {
    console.error('[refreshProps] Fatal:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// getCheatsheetData — Serves pre-cached props in cheatsheet format.
// Reads from Firestore cache (no pipeline execution), returns instantly.
// ──────────────────────────────────────────────────────────────

// Pipeline statType → cheatsheet display stat
const STAT_DISPLAY = {
  'points': 'POINTS', 'rebounds': 'REBOUNDS', 'assists': 'ASSISTS',
  'threePointersMade': '3PT MADE', 'blocks': 'BLOCKS', 'steals': 'STEALS',
  'turnovers': 'TURNOVERS',
  'points+rebounds+assists': 'PTS+REB+AST', 'points+rebounds': 'PTS+REB',
  'points+assists': 'PTS+AST', 'rebounds+assists': 'REB+AST',
};

// Pipeline statType → defStat abbreviation (for alt props)
const STAT_TO_DEF_STAT = {
  'points': 'PTS', 'rebounds': 'REB', 'assists': 'AST',
  'threePointersMade': '3PM', 'blocks': 'BLK', 'steals': 'STL',
  'turnovers': 'TOV',
  'points+rebounds+assists': 'PTS', 'points+rebounds': 'PTS',
  'points+assists': 'PTS', 'rebounds+assists': 'REB',
};

// Full bookmaker name → short code
const BOOK_SHORT = {
  'DraftKings': 'DK', 'FanDuel': 'FD', 'BetMGM': 'MGM',
  'Caesars': 'CAESARS', 'ESPNBet': 'ESPN', 'Bet365': 'BET365',
  'Bovada': 'BOV', 'BetRivers': 'BR', 'Unibet': 'UNI',
  'Hard Rock': 'HR', 'Fanatics': 'FAN', 'BallyBet': 'BALLY',
};

function shortBook(name) { return BOOK_SHORT[name] || name; }

// Team full name → 3-letter code (for accent colors)
const TEAM_CODE = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
};
function teamCode(name) { return TEAM_CODE[name] || name?.split(' ').pop()?.substring(0,3)?.toUpperCase() || '???'; }

// ── ESPN Headshot Resolution (shared module) ──
const { resolveEspnHeadshot, resolveHeadshotsBatch } = require('./shared/espnHeadshot');

function mapEdgeProp(p) {
  const isOver = p.prediction === 'Over';
  return {
    name: p.playerName,
    playerId: p.playerId || null,
    teamCode: teamCode(p.team),
    stat: STAT_DISPLAY[p.statType] || p.statType,
    dir: p.prediction?.toLowerCase() || 'over',
    line: p.line,
    avg: p.l10Avg,
    odds: isOver ? p.oddsOver : p.oddsUnder,
    bk: shortBook(isOver ? p.bookmakerOver : p.bookmakerUnder),
    l10: p.hitRates?.l10?.pct ?? null,
    szn: p.hitRates?.season?.pct ?? null,
    trend: p.trend,
    defRank: p.opponentDefense?.rank ?? null,
    defTeam: teamCode(p.opponent),
    isHome: p.isHome,
    green: p.greenScore,
  };
}

// ── Parlay Slip Builder ──
// Builds 3 pre-made parlay slips from the cross-game leg pool.
// Each slip has 5+ legs, no duplicate players within a slip.

function oddsToImplied(odds) {
  if (odds <= -100) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

function combinedAmericanOdds(legs) {
  let prob = 1;
  for (const l of legs) prob *= oddsToImplied(l.odds);
  if (prob >= 0.5) return Math.round(-100 * prob / (1 - prob));
  return '+' + Math.round(100 * (1 - prob) / prob);
}

/** Directional hit rate: for Over=l10 as-is, for Under=100-l10 */
function dirHitRate(leg) {
  if (leg.l10 == null) return 0;
  return leg.dir === 'under' ? (100 - leg.l10) : leg.l10;
}

/**
 * Greedy leg picker: takes from pool, skips duplicate players.
 * If preferDiversity=true, also tries to spread across games first.
 */
function pickLegs(pool, count, preferDiversity) {
  const picked = [];
  const usedPlayers = new Set();
  const usedGames = new Set();
  const deferred = []; // legs skipped for game diversity

  for (const leg of pool) {
    if (usedPlayers.has(leg.name)) continue;
    const gameKey = [leg.teamCode, leg.defTeam].sort().join('-');

    if (preferDiversity && usedGames.has(gameKey)) {
      deferred.push(leg);
      continue;
    }

    usedPlayers.add(leg.name);
    usedGames.add(gameKey);
    picked.push(leg);
    if (picked.length >= count) return picked;
  }

  // Fill from deferred (same game, different player)
  for (const leg of deferred) {
    if (usedPlayers.has(leg.name)) continue;
    usedPlayers.add(leg.name);
    picked.push(leg);
    if (picked.length >= count) return picked;
  }

  return picked;
}

function buildParlaySlips(legs) {
  if (legs.length < 5) return [];
  const slips = [];

  // Slip 1: LOCK — Top 5 by edge, max game diversity
  const lockLegs = pickLegs(legs, 5, true);
  if (lockLegs.length >= 5) {
    slips.push({
      name: 'LOCK',
      subtitle: 'Highest edge across games',
      legs: lockLegs,
      combinedOdds: combinedAmericanOdds(lockLegs),
    });
  }

  // Slip 2: SAFE — Only legs with 80%+ directional hit rate
  const safePool = legs.filter(l => dirHitRate(l) >= 80);
  if (safePool.length >= 5) {
    const safeLegs = pickLegs(safePool, 5, true);
    if (safeLegs.length >= 5) {
      slips.push({
        name: 'SAFE',
        subtitle: '80%+ hit rate, maximum safety',
        legs: safeLegs,
        combinedOdds: combinedAmericanOdds(safeLegs),
      });
    }
  }

  // Slip 3: VALUE — Lightest juice legs with positive edge (best parlay payout)
  const valuePool = legs
    .filter(l => (l.edge ?? 0) > 0)
    .sort((a, b) => Math.abs(a.odds) - Math.abs(b.odds)); // lightest juice first
  if (valuePool.length >= 5) {
    const valueLegs = pickLegs(valuePool, 5, true);
    if (valueLegs.length >= 5) {
      slips.push({
        name: 'VALUE',
        subtitle: 'Best payout-to-safety ratio',
        legs: valueLegs,
        combinedOdds: combinedAmericanOdds(valueLegs),
      });
    }
  }

  return slips;
}

function mapStackLeg(p) {
  return {
    name: p.playerName,
    playerId: p.playerId || null,
    teamCode: teamCode(p.team),
    stat: STAT_DISPLAY[p.statType] || p.statType,
    dir: p.prediction?.toLowerCase() || 'over',
    line: p.altLine,
    avg: p.l10Avg,
    trend: p.trend,
    odds: p.altOdds,
    bk: shortBook(p.bookmaker),
    l10: p.hitRates?.l10?.pct ?? null,
    szn: p.hitRates?.season?.pct ?? null,
    defRank: p.opponentDefense?.rank ?? null,
    defTeam: teamCode(p.opponent),
    defStat: STAT_TO_DEF_STAT[p.statType] || null,
    isHome: p.isHome,
    green: p.greenScore,
    edge: p.parlayEdge ?? null,
  };
}

exports.getCheatsheetData = onRequest({
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const db = getDb();
    const now = new Date();
    const nowISO = now.toISOString();
    // Only include upcoming games (not yet started, with 30-min buffer for tip-off)
    const cutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const snapshot = await db.collection('matchAnalysisCache')
      .where('sport', '==', 'nba')
      .where('preCached', '==', true)
      .get();

    const games = snapshot.docs.filter(doc => {
      const data = doc.data();
      return data.gameStartTime && data.gameStartTime > cutoff;
    });

    const edgeProps = [];
    const stackLegs = [];
    const gamesList = [];

    for (const doc of games) {
      const data = doc.data();
      const ml = data.analysis?.mlPlayerProps || {};
      const home = data.analysis?.teams?.home;
      const away = data.analysis?.teams?.away;
      gamesList.push({ home, away, time: data.gameStartTime });

      // EdgeBoard
      const topProps = ml.edgeBoard?.topProps || ml.topProps || [];
      for (const p of topProps) edgeProps.push(mapEdgeProp(p));

      // Parlay Stack
      const legs = ml.parlayStack?.legs || [];
      for (const p of legs) stackLegs.push(mapStackLeg(p));
    }

    // Sort edge by green score desc, stack by parlay edge desc (best value first)
    edgeProps.sort((a, b) => b.green - a.green);
    stackLegs.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));

    // Build pre-made parlay slips from cross-game leg pool
    const parlaySlips = buildParlaySlips(stackLegs);

    // Resolve ESPN headshots for all unique players (cached permanently)
    const uniqueNames = [...new Set([...edgeProps.map(p => p.name), ...stackLegs.map(p => p.name)])];
    const headshotMap = await resolveHeadshotsBatch(uniqueNames);
    for (const p of edgeProps) p.headshotUrl = headshotMap[p.name] || null;
    for (const p of stackLegs) p.headshotUrl = headshotMap[p.name] || null;
    for (const slip of parlaySlips) {
      for (const l of slip.legs) l.headshotUrl = headshotMap[l.name] || null;
    }

    res.status(200).json({
      success: true,
      timestamp: now,
      games: gamesList,
      edge: edgeProps,
      stack: stackLegs,
      parlaySlips,
    });
  } catch (err) {
    console.error('[getCheatsheetData] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
