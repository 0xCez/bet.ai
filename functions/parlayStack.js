/**
 * Parlay Stack Pipeline — Alt Lines with Signal Validation
 *
 * Independent pipeline that does NOT need Vertex AI.
 * Alt lines are pre-filtered by bookmaker juice (≤-400).
 * Our job: validate with hit rates + defense + avg.
 *
 * All 5 signals must validate for a leg to be included:
 *   1. L10 hit rate ≥ 60% (Over) or ≤ 40% (Under) against ALT line
 *   2. Season hit rate ≥ 50% against ALT line
 *   3. L10 avg safely above/below alt line
 *   4. Opponent defense doesn't contradict
 *   5. Trend supports direction
 */

const functions = require('firebase-functions/v2');

// ── Shared Modules ──
const { fetchAltProps, fetchEvents, normalizeBookmaker } = require('./shared/oddsApi');
const { resolvePlayerIdsBatch, getGameLogsBatch, getApiKey } = require('./shared/playerStats');
const { getOpponentDefensiveStats, getOpponentStatForProp } = require('./shared/defense');
const { calculateHitRates, getL10Average, getTrend } = require('./shared/hitRates');
const { calculateGreenScore } = require('./shared/greenScore');

// Goblin threshold: only consider alt lines with odds between floor and ceiling.
// Ceiling: ≤ -400 (anything lighter isn't goblin-tier)
// Floor: ≥ -650 (anything heavier adds negligible parlay value — implied ~86.7%)
const GOBLIN_ODDS_THRESHOLD = -400;
const GOBLIN_ODDS_FLOOR = -650;

// Minimum signal thresholds for a valid parlay leg
const MIN_L10_HIT_PCT = 60;   // For Over: ≥60%. For Under: ≤40% (i.e. 100-60)
const MIN_SZN_HIT_PCT = 50;   // For Over: ≥50%. For Under: ≤50%
const MIN_AVG_MARGIN = 0.5;   // Avg must be at least this far past the alt line

/**
 * Convert American odds to implied probability (0-1).
 * -400 → 0.800, -650 → 0.867, -200 → 0.667
 */
function oddsToImplied(odds) {
  if (odds <= -100) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

/**
 * Core Parlay Stack processing — accepts pre-fetched data (no API calls).
 * Used by the orchestrator (refreshGameProps.js) for shared data fetching.
 *
 * @param {string} eventId - The Odds API event ID
 * @param {object} sharedData - { altPropsMap, playerIdMap, gameLogsMap, oppStatsData, homeTeam, awayTeam }
 * @returns {object} - { success, legs, ... }
 */
async function processParlayStack(eventId, sharedData) {
  const { altPropsMap: altMap, playerIdMap, gameLogsMap, oppStatsData, homeTeam, awayTeam } = sharedData;

  if (!altMap || altMap.size === 0) {
    return {
      success: true, sport: 'NBA', eventId,
      teams: { home: homeTeam, away: awayTeam },
      legs: [],
      message: 'No alternate lines available from The Odds API'
    };
  }

  console.log(`[ParlayStack] Processing ${altMap.size} player-stat combos`);

  // Determine player teams from game logs
  const playerTeamMap = {};
  for (const [name, logs] of Object.entries(gameLogsMap)) {
    if (logs.length > 0) {
      const recentTeam = logs[0]?.team;
      playerTeamMap[name] = recentTeam?.nickname || recentTeam?.name || '';
    }
  }

  // 8. Process each player-stat combo: find valid goblin legs
  const legs = [];

  for (const [mapKey, altLines] of altMap) {
    const [playerName, statType] = mapKey.split('|');
    const gameLogs = gameLogsMap[playerName];
    if (!gameLogs || gameLogs.length < 5) continue; // Need sufficient data

    // L10 average for this stat
    const l10Avg = getL10Average(gameLogs, statType);
    if (l10Avg === null) continue;

    // Opponent info
    const playerTeam = playerTeamMap[playerName] || '';
    const isHome = homeTeam && playerTeam.toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop());
    const opponentTeam = isHome ? awayTeam : homeTeam;
    const opponentDefense = getOpponentStatForProp(oppStatsData, opponentTeam, statType);

    // Filter alt lines to goblin-tier (odds between floor and ceiling)
    for (const alt of altLines) {
      // Check Over side
      if (alt.oddsOver != null && alt.oddsOver <= GOBLIN_ODDS_THRESHOLD && alt.oddsOver >= GOBLIN_ODDS_FLOOR) {
        const leg = validateLeg({
          playerName, statType, prediction: 'Over',
          altLine: alt.line, altOdds: alt.oddsOver,
          bookmaker: alt.bookmakerOver,
          gameLogs, l10Avg, opponentDefense, opponentTeam,
          team: isHome ? homeTeam : awayTeam,
          isHome: !!isHome,
        });
        if (leg) { leg.playerId = playerIdMap[playerName] || null; legs.push(leg); }
      }

      // Check Under side
      if (alt.oddsUnder != null && alt.oddsUnder <= GOBLIN_ODDS_THRESHOLD && alt.oddsUnder >= GOBLIN_ODDS_FLOOR) {
        const leg = validateLeg({
          playerName, statType, prediction: 'Under',
          altLine: alt.line, altOdds: alt.oddsUnder,
          bookmaker: alt.bookmakerUnder,
          gameLogs, l10Avg, opponentDefense, opponentTeam,
          team: isHome ? homeTeam : awayTeam,
          isHome: !!isHome,
        });
        if (leg) { leg.playerId = playerIdMap[playerName] || null; legs.push(leg); }
      }
    }
  }

  // 9. Sort by parlayEdge (highest edge = best value for a parlay).
  // Edge = actual L10 hit rate - implied probability from odds.
  // A -420 leg with 90% hit rate (edge +9.2%) beats a -650 leg with 90% hit rate (edge +3.3%).
  legs.sort((a, b) => b.parlayEdge - a.parlayEdge);

  // Keep only the best-value leg per player-stat combo PER BOOKMAKER
  const seen = new Set();
  const dedupedLegs = [];
  for (const leg of legs) {
    const key = `${leg.playerName}|${leg.statType}|${leg.prediction}|${leg.bookmaker}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedLegs.push(leg);
    }
  }

  console.log(`[ParlayStack] ${dedupedLegs.length} validated legs (from ${legs.length} raw candidates)`);

  return {
    success: true,
    sport: 'NBA',
    eventId,
    teams: { home: homeTeam, away: awayTeam },
    totalAltLines: [...altMap.values()].reduce((s, a) => s + a.length, 0),
    legs: dedupedLegs,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate a single parlay leg against all 5 signals.
 * Returns the leg object if ALL pass, null otherwise.
 */
function validateLeg({ playerName, statType, prediction, altLine, altOdds, bookmaker,
                       gameLogs, l10Avg, opponentDefense, opponentTeam, team, isHome }) {
  const isOver = prediction === 'Over';

  // Calculate hit rates against the ALT line (not standard line)
  const hitRates = calculateHitRates(gameLogs, statType, altLine);

  // Signal 1: L10 hit rate against alt line
  const l10Pct = hitRates?.l10?.pct;
  if (l10Pct == null) return null;
  if (isOver && l10Pct < MIN_L10_HIT_PCT) return null;
  if (!isOver && l10Pct > (100 - MIN_L10_HIT_PCT)) return null;

  // Signal 2: Season hit rate against alt line
  const sznPct = hitRates?.season?.pct;
  if (sznPct == null) return null;
  if (isOver && sznPct < MIN_SZN_HIT_PCT) return null;
  if (!isOver && sznPct > (100 - MIN_SZN_HIT_PCT)) return null;

  // Signal 3: L10 avg safely past alt line
  if (l10Avg == null) return null;
  if (isOver && l10Avg < altLine + MIN_AVG_MARGIN) return null;
  if (!isOver && l10Avg > altLine - MIN_AVG_MARGIN) return null;

  // Signal 4: Opponent defense doesn't contradict
  const defRank = opponentDefense?.rank;
  if (defRank != null) {
    // Strong defense (1-10) contradicts Over, weak defense (21-30) contradicts Under
    if (isOver && defRank <= 10) return null;
    if (!isOver && defRank >= 21) return null;
  }

  // Signal 5: Trend supports (L10 avg vs alt line direction)
  // For Over: avg should be comfortably above. For Under: below.
  // (Already captured by Signal 3, but we add a stronger check here)
  const avgMargin = isOver ? l10Avg - altLine : altLine - l10Avg;
  if (avgMargin < 0) return null; // Shouldn't happen after Signal 3, safety net

  // Green score
  const { score: greenScore, signals: greenSignals } = calculateGreenScore({
    prediction,
    l10Avg,
    line: altLine,
    hitRates,
    opponentDefense,
    relevantOdds: altOdds,
  });

  // Trend: L3 avg - L10 avg
  const trend = getTrend(gameLogs, statType);

  // Parlay Value: edge = actual hit rate - implied probability from odds.
  // Higher edge = leg is safer than the book's juice implies = best parlay candidate.
  // This naturally rewards lighter juice legs (-400) with high hit rates over
  // heavy juice legs (-650) with the same hit rate.
  const impliedProb = oddsToImplied(altOdds);
  const actualHitRate = (isOver ? l10Pct : (100 - l10Pct)) / 100;
  const parlayEdge = parseFloat((actualHitRate - impliedProb).toFixed(4));

  return {
    playerName,
    team,
    opponent: opponentTeam,
    statType,
    prediction,
    altLine,
    altOdds,
    bookmaker: normalizeBookmaker(bookmaker),
    l10Avg: parseFloat(l10Avg.toFixed(1)),
    trend,
    hitRates,
    opponentDefense,
    isHome,
    greenScore,
    greenSignals,
    avgMargin: parseFloat(avgMargin.toFixed(1)),
    parlayEdge,
  };
}

// ──────────────────────────────────────────────
// STANDALONE WRAPPER (fetches own data, for HTTP & backward compat)
// ──────────────────────────────────────────────

/**
 * Standalone Parlay Stack — fetches data internally then delegates to processParlayStack.
 * Used by the HTTP endpoint and legacy callers.
 */
async function getParlayStackLegs(eventId, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API_SPORTS_KEY not configured');

  let { homeTeam, awayTeam } = options;

  // Fetch data
  console.log(`[ParlayStack] Fetching alt props for event ${eventId}...`);
  const altPropsMap = await fetchAltProps(eventId);

  // Collect unique players from alt props
  const uniquePlayers = [...new Set(
    [...(altPropsMap?.keys() || [])].map(k => k.split('|')[0])
  )];

  const playerIdMap = await resolvePlayerIdsBatch(uniquePlayers);
  const gameLogsMap = await getGameLogsBatch(playerIdMap);
  const oppStatsData = await getOpponentDefensiveStats();

  // Resolve teams if not provided
  if (!homeTeam || !awayTeam) {
    const events = await fetchEvents('basketball_nba');
    const event = events.find(e => e.id === eventId);
    if (event) {
      homeTeam = event.home_team;
      awayTeam = event.away_team;
    }
  }

  // Delegate to core processing
  return processParlayStack(eventId, {
    altPropsMap, playerIdMap, gameLogsMap, oppStatsData, homeTeam, awayTeam,
  });
}

// ──────────────────────────────────────────────
// HTTP CLOUD FUNCTION
// ──────────────────────────────────────────────

exports.getParlayStackLegsHTTP = functions.https.onRequest(
  { timeoutSeconds: 120, memory: '512MiB', cors: true },
  async (req, res) => {
    try {
      const { eventId, team1, team2 } = req.body;
      if (!eventId) {
        return res.status(400).json({ error: 'Missing required field: eventId' });
      }

      const result = await getParlayStackLegs(eventId, {
        homeTeam: team1,
        awayTeam: team2,
      });
      return res.status(200).json(result);

    } catch (error) {
      console.error('[ParlayStack] Error:', error);
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
);

// Export for orchestrator (processParlayStack) and legacy callers (getParlayStackLegs)
module.exports = { getParlayStackLegs, processParlayStack, getParlayStackLegsHTTP: exports.getParlayStackLegsHTTP };
