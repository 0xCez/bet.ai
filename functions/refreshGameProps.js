/**
 * refreshGameProps.js — Orchestrator for the 5-Layer Data Architecture
 *
 * Layer 1: Shared Data Fetch — fetches ALL raw data for a game ONCE
 * Layer 2: Pipeline Processing — runs EdgeBoard + Parlay Stack with shared data
 *
 * Both pipelines consume the same pre-fetched data: zero duplicate API calls.
 * This file is used by:
 *   - refreshProps (REFRESH button)
 *   - scheduled props refresh (3x daily)
 *   - preCacheTopGames (manual HTTP trigger)
 */

const { fetchStandardProps, fetchAltProps } = require('./shared/oddsApi');
const { resolvePlayerIdsBatch, getGameLogsBatch } = require('./shared/playerStats');
const { getOpponentDefensiveStats } = require('./shared/defense');
const { processEdgeBoard } = require('./mlPlayerPropsV2');
const { processParlayStack } = require('./parlayStack');

// ──────────────────────────────────────────────
// LAYER 1: Shared Data Fetch
// ──────────────────────────────────────────────

/**
 * Fetch ALL raw data for a game — called ONCE, shared by both pipelines.
 *
 * @param {string} eventId - The Odds API event ID
 * @returns {object} - { standardProps, altPropsMap, playerIdMap, gameLogsMap, oppStatsData, homeTeam, awayTeam, gameTime }
 */
async function fetchSharedGameData(eventId) {
  // 1. Fetch props from The Odds API (2 calls: standard + alt)
  const [standardResult, altPropsMap] = await Promise.all([
    fetchStandardProps(eventId),
    fetchAltProps(eventId),
  ]);

  const { props: standardProps, homeTeam, awayTeam, gameTime } = standardResult;

  // 2. Merge unique players from BOTH standard and alt props
  const standardPlayers = standardProps
    ? [...new Set(standardProps.map(p => p.playerName))]
    : [];
  const altPlayers = altPropsMap
    ? [...new Set([...altPropsMap.keys()].map(k => k.split('|')[0]))]
    : [];
  const allUniquePlayers = [...new Set([...standardPlayers, ...altPlayers])];

  console.log(`[Orchestrator] ${standardPlayers.length} standard players + ${altPlayers.length} alt players → ${allUniquePlayers.length} unique (merged)`);

  // 3. Single batched player ID resolution
  const playerIdMap = await resolvePlayerIdsBatch(allUniquePlayers);
  const resolvedCount = Object.values(playerIdMap).filter(id => id !== null).length;
  console.log(`[Orchestrator] Resolved ${resolvedCount}/${allUniquePlayers.length} player IDs`);

  // 4. Single batched game logs fetch (Firestore-cached 1h)
  const gameLogsMap = await getGameLogsBatch(playerIdMap);

  // 5. Single defense stats call (Firestore-cached 24h)
  const oppStatsData = await getOpponentDefensiveStats();

  // 6. Data quality health check
  const totalPlayers = allUniquePlayers.length;
  const resolvedPlayers = Object.values(playerIdMap).filter(id => id !== null).length;
  const playersWithLogs = Object.values(gameLogsMap).filter(logs => logs?.length > 0).length;

  const health = {
    overall: 'healthy',
    standardProps: (standardProps?.length || 0) > 0,
    altProps: altPropsMap.size > 0,
    playerResolution: `${resolvedPlayers}/${totalPlayers}`,
    gameLogs: `${playersWithLogs}/${resolvedPlayers || 1}`,
    defense: oppStatsData !== null,
  };

  if (resolvedPlayers === 0 && totalPlayers > 0) health.overall = 'critical';
  else if (playersWithLogs === 0 && resolvedPlayers > 0) health.overall = 'critical';
  else if (!health.standardProps && !health.altProps) health.overall = 'critical';
  else if (resolvedPlayers < totalPlayers * 0.5) health.overall = 'degraded';
  else if (!health.defense) health.overall = 'degraded';

  if (health.overall !== 'healthy') {
    console.warn(`[Orchestrator] Health: ${health.overall} — props=${health.standardProps}, alt=${health.altProps}, players=${health.playerResolution}, logs=${health.gameLogs}, def=${health.defense}`);
  }

  return {
    standardProps: standardProps || [],
    altPropsMap: altPropsMap || new Map(),
    playerIdMap,
    gameLogsMap,
    oppStatsData,
    homeTeam,
    awayTeam,
    gameTime,
    health,
  };
}

// ──────────────────────────────────────────────
// LAYER 2: Pipeline Processing
// ──────────────────────────────────────────────

/**
 * Run both pipelines in parallel using shared pre-fetched data.
 *
 * @param {string} eventId
 * @param {object} sharedData - Output from fetchSharedGameData
 * @param {object} options - { pipeline: 'edge'|'stack'|'both', gameDate }
 * @returns {object} - { edge, stack } (each is the pipeline result or null on failure)
 */
async function runPipelines(eventId, sharedData, options = {}) {
  const { pipeline = 'both', gameDate } = options;
  const runEdge = pipeline === 'edge' || pipeline === 'both';
  const runStack = pipeline === 'stack' || pipeline === 'both';

  const results = { edge: null, stack: null };
  const tasks = [];

  if (runEdge) {
    tasks.push(
      processEdgeBoard(eventId, sharedData, { gameDate })
        .then(r => { results.edge = r; })
        .catch(err => { console.error(`[Orchestrator] EdgeBoard failed: ${err.message}`); })
    );
  }

  if (runStack) {
    tasks.push(
      processParlayStack(eventId, sharedData)
        .then(r => { results.stack = r; })
        .catch(err => { console.error(`[Orchestrator] ParlayStack failed: ${err.message}`); })
    );
  }

  await Promise.all(tasks);
  return results;
}

// ──────────────────────────────────────────────
// TOP-LEVEL ORCHESTRATOR
// ──────────────────────────────────────────────

/**
 * Fetch shared data + run pipelines + return backward-compatible mlPlayerProps shape.
 *
 * @param {string} eventId - The Odds API event ID
 * @param {object} options - { pipeline: 'edge'|'stack'|'both', gameDate }
 * @returns {object} - { mlPlayerProps, teams, gameTime }
 */
async function refreshGameProps(eventId, options = {}) {
  const { pipeline = 'both', gameDate } = options;

  console.log(`[Orchestrator] Starting for event ${eventId} (pipeline: ${pipeline})`);
  const t0 = Date.now();

  // Layer 1: Shared data fetch
  const sharedData = await fetchSharedGameData(eventId);

  // Layer 2: Pipeline processing
  const { edge, stack } = await runPipelines(eventId, sharedData, { pipeline, gameDate });

  // Build backward-compatible mlPlayerProps object
  const mlPlayerProps = {};

  if (edge && edge.success) {
    mlPlayerProps.topProps = edge.topProps || [];
    mlPlayerProps.goblinLegs = edge.goblinLegs || [];
    mlPlayerProps.totalPropsAvailable = edge.totalPropsAvailable || 0;
    mlPlayerProps.highConfidenceCount = edge.highConfidenceCount || 0;
    mlPlayerProps.mediumConfidenceCount = edge.mediumConfidenceCount || 0;
    mlPlayerProps.gameTime = edge.gameTime || null;
    mlPlayerProps.edgeBoard = {
      topProps: edge.topProps || [],
      goblinLegs: edge.goblinLegs || [],
    };
  }

  if (stack && stack.success) {
    mlPlayerProps.parlayStack = { legs: stack.legs || [] };
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(1);
  const edgeCount = mlPlayerProps.topProps?.length || 0;
  const stackCount = mlPlayerProps.parlayStack?.legs?.length || 0;
  console.log(`[Orchestrator] Done in ${duration}s — EB=${edgeCount}, PS=${stackCount}`);

  return {
    mlPlayerProps,
    teams: { home: sharedData.homeTeam, away: sharedData.awayTeam },
    gameTime: sharedData.gameTime,
    health: sharedData.health,
  };
}

module.exports = { fetchSharedGameData, runPipelines, refreshGameProps };
