/**
 * Track Prediction Results
 * Scheduled Cloud Function that checks finished NBA games
 * and records actual player stats to compare with ML predictions.
 *
 * Runs daily at 10:00 AM EST (after all NBA games are final).
 * Uses ESPN public API for box scores (free, no auth needed).
 * Resolves picksHistory + parlayHistory collections.
 */

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const axios = require('axios');
const { sendResultsNotification } = require('./notifications');

// ──────────────────────────────────────────────────────────────
// ESPN API helpers
// ──────────────────────────────────────────────────────────────

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';

/**
 * Fetch all finished NBA games + player box scores for a given date via ESPN.
 * Returns { finishedGames: [...], playerStats: Map<playerNameLower, { stats, teamName }> }
 */
async function fetchGameStatsForDate(dateStr) {
  const yyyymmdd = dateStr.replace(/-/g, '');

  // 1. Get scoreboard for the date
  const sbResp = await axios.get(ESPN_SCOREBOARD, {
    params: { dates: yyyymmdd },
    timeout: 15000,
  });
  const events = sbResp.data?.events || [];
  const finishedGames = events.filter(e => e.status?.type?.completed === true);

  if (finishedGames.length === 0) {
    return { finishedGames: [], playerStats: new Map() };
  }

  // 2. For each finished game, fetch box score
  const playerStats = new Map(); // playerNameLower → { pts, reb, ast, stl, blk, tov, tpm, min }

  for (const event of finishedGames) {
    try {
      const summaryResp = await axios.get(ESPN_SUMMARY, {
        params: { event: event.id },
        timeout: 15000,
      });
      const boxScore = summaryResp.data?.boxscore;
      if (!boxScore?.players) continue;

      for (const team of boxScore.players) {
        const teamName = team.team?.displayName || '';
        const statLabels = (team.statistics || [])[0]?.labels || [];

        for (const player of (team.statistics || [])[0]?.athletes || []) {
          const name = player.athlete?.displayName || '';
          if (!name) continue;

          const stats = player.stats || [];
          const statMap = {};
          statLabels.forEach((label, idx) => {
            statMap[label.toUpperCase()] = stats[idx];
          });

          playerStats.set(name.toLowerCase(), {
            name,
            teamName,
            pts: parseFloat(statMap['PTS']) || 0,
            reb: parseFloat(statMap['REB']) || 0,
            ast: parseFloat(statMap['AST']) || 0,
            stl: parseFloat(statMap['STL']) || 0,
            blk: parseFloat(statMap['BLK']) || 0,
            tov: parseFloat(statMap['TO']) || 0,
            tpm: parseFloat(statMap['3PM']) || 0,
            min: statMap['MIN'] || '0',
          });
        }
      }
    } catch (err) {
      console.error(`[ESPN] Error fetching box score for event ${event.id}:`, err.message);
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 300));
  }

  return { finishedGames, playerStats };
}

/**
 * Extract a stat value from ESPN player stats map entry.
 */
function extractStatESPN(playerEntry, propType) {
  if (!playerEntry) return null;
  const type = propType.toLowerCase().replace('player_', '');

  const map = {
    'points': 'pts', 'pts': 'pts',
    'rebounds': 'reb', 'reb': 'reb', 'totreb': 'reb',
    'assists': 'ast', 'ast': 'ast',
    'steals': 'stl', 'stl': 'stl',
    'blocks': 'blk', 'blk': 'blk',
    'turnovers': 'tov', 'tov': 'tov',
    'threes': 'tpm', 'three_pointers': 'tpm', '3pm': 'tpm', 'tpm': 'tpm',
  };

  const key = map[type];
  return key ? (playerEntry[key] ?? null) : null;
}

/**
 * Find a player in the ESPN stats map by name.
 * Tries exact match first, then last-name match.
 */
function findPlayerESPN(playerStats, playerName) {
  if (!playerName) return null;
  const target = playerName.toLowerCase().trim();

  // Exact match
  if (playerStats.has(target)) return playerStats.get(target);

  // Last name match (handles "Jalen Brunson" vs "J. Brunson" etc.)
  const lastName = target.split(' ').pop();
  for (const [key, val] of playerStats) {
    if (key.split(' ').pop() === lastName) return val;
  }

  return null;
}

/**
 * Normalize stat type from Odds API format to our internal format.
 */
function normalizeStatType(statType) {
  if (!statType) return null;
  const t = statType.toLowerCase().replace('player_', '');
  const map = {
    'points': 'points', 'rebounds': 'rebounds', 'assists': 'assists',
    'steals': 'steals', 'blocks': 'blocks', 'turnovers': 'turnovers',
    'threes': 'threes', 'three_pointers': 'threes',
    'pts': 'points', 'reb': 'rebounds', 'ast': 'assists',
    'stl': 'steals', 'blk': 'blocks', 'tov': 'turnovers',
    '3pm': 'threes', 'tpm': 'threes',
  };
  return map[t] || t;
}

/**
 * Resolve a single pick against actual stats. Mutates pick in-place.
 */
function resolvePick(pick, playerStats) {
  const playerEntry = findPlayerESPN(playerStats, pick.name);
  if (!playerEntry) {
    pick.actualStat = null;
    pick.result = 'dnp';
    pick.hit = null;
    return;
  }

  const normalizedType = normalizeStatType(pick.statType);
  const actualStat = extractStatESPN(playerEntry, normalizedType);

  if (actualStat === null) {
    pick.result = 'unknown';
    pick.hit = null;
    return;
  }

  pick.actualStat = actualStat;
  const actualDir = actualStat > pick.line ? 'over'
    : actualStat < pick.line ? 'under'
    : 'push';
  pick.result = actualDir;
  pick.hit = actualDir === 'push' ? null : (actualDir === pick.dir);
}

// ──────────────────────────────────────────────────────────────
// Scheduled function
// ──────────────────────────────────────────────────────────────

exports.trackPredictionResults = functions.scheduler.onSchedule(
  {
    schedule: 'every day 10:00',
    timeZone: 'America/New_York',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (event) => {
    console.log('=== TRACKING PREDICTION RESULTS ===');

    const db = admin.firestore();

    // ── Resolve picksHistory + parlayHistory ──
    const resolvedPicks = await resolvePicksHistory(db);
    await resolveParlayHistory(db);

    // Send results recap notification
    if (resolvedPicks) {
      try {
        await sendResultsNotification(resolvedPicks);
      } catch (notifErr) {
        console.error('[trackPredictionResults] Notification error (non-fatal):', notifErr.message);
      }
    }
  }
);

// ──────────────────────────────────────────────────────────────
// Resolve picksHistory
// ──────────────────────────────────────────────────────────────

async function resolvePicksHistory(db) {
  console.log('[PicksHistory] Resolving picks history...');

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().slice(0, 10);

  const snapshot = await db.collection('picksHistory')
    .where('resultsRecorded', '==', false)
    .get();

  const docs = snapshot.docs.filter(doc => doc.id >= cutoffDate);

  if (docs.length === 0) {
    console.log('[PicksHistory] No pending picks to resolve.');
    return null;
  }

  console.log(`[PicksHistory] ${docs.length} days to resolve.`);
  let latestResolved = null;

  for (const doc of docs) {
    const data = doc.data();
    const dateStr = doc.id; // "2026-02-24"

    try {
      const { finishedGames, playerStats } = await fetchGameStatsForDate(dateStr);

      if (finishedGames.length === 0) {
        console.log(`[PicksHistory] No finished games for ${dateStr}, skipping.`);
        continue;
      }

      const edge = data.edge || [];
      const stack = data.stack || [];

      for (const pick of edge) resolvePick(pick, playerStats);
      for (const pick of stack) resolvePick(pick, playerStats);

      const allPicks = [...edge, ...stack];
      const resolved = allPicks.filter(p => p.hit != null);
      const hits = resolved.filter(p => p.hit === true);
      const hitRate = resolved.length > 0 ? ((hits.length / resolved.length) * 100).toFixed(1) : 'N/A';

      const statsObj = {
        total: allPicks.length,
        resolved: resolved.length,
        hits: hits.length,
        hitRate: resolved.length > 0 ? hits.length / resolved.length : null,
        edgeHits: edge.filter(p => p.hit === true).length,
        edgeTotal: edge.filter(p => p.hit != null).length,
        stackHits: stack.filter(p => p.hit === true).length,
        stackTotal: stack.filter(p => p.hit != null).length,
        gamesChecked: finishedGames.length,
      };

      await doc.ref.update({
        edge,
        stack,
        resultsRecorded: true,
        resolvedAt: new Date().toISOString(),
        stats: statsObj,
      });

      latestResolved = { edge, stack, stats: statsObj, date: dateStr };
      console.log(`[PicksHistory] ${dateStr}: ${hits.length}/${resolved.length} hits (${hitRate}%)`);
    } catch (err) {
      console.error(`[PicksHistory] Error resolving ${dateStr}:`, err.message);
    }
  }

  return latestResolved;
}

// ──────────────────────────────────────────────────────────────
// Resolve parlayHistory
// ──────────────────────────────────────────────────────────────

async function resolveParlayHistory(db) {
  console.log('[ParlayHistory] Resolving parlay history...');

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toISOString().slice(0, 10);

  const snapshot = await db.collection('parlayHistory')
    .where('resultsRecorded', '==', false)
    .get();

  const docs = snapshot.docs.filter(doc => doc.id >= cutoffDate);

  if (docs.length === 0) {
    console.log('[ParlayHistory] No pending parlays to resolve.');
    return;
  }

  console.log(`[ParlayHistory] ${docs.length} days to resolve.`);

  for (const doc of docs) {
    const data = doc.data();
    const dateStr = doc.id;

    try {
      const { finishedGames, playerStats } = await fetchGameStatsForDate(dateStr);

      if (finishedGames.length === 0) {
        console.log(`[ParlayHistory] No finished games for ${dateStr}, skipping.`);
        continue;
      }

      const slips = data.slips || [];

      for (const slip of slips) {
        const legs = slip.legs || [];
        for (const leg of legs) resolvePick(leg, playerStats);

        const resolvedLegs = legs.filter(l => l.hit != null);
        const allHit = resolvedLegs.length > 0 && resolvedLegs.every(l => l.hit === true);
        slip.hit = resolvedLegs.length === legs.length ? allHit : null;
        slip.legsHit = resolvedLegs.filter(l => l.hit === true).length;
        slip.legsTotal = legs.length;
      }

      const resolvedSlips = slips.filter(s => s.hit != null);
      const slipHits = resolvedSlips.filter(s => s.hit === true).length;

      await doc.ref.update({
        slips,
        resultsRecorded: true,
        resolvedAt: new Date().toISOString(),
        stats: {
          totalSlips: slips.length,
          resolvedSlips: resolvedSlips.length,
          slipHits,
        },
      });

      console.log(`[ParlayHistory] ${dateStr}: ${slipHits}/${resolvedSlips.length} slips hit`);
    } catch (err) {
      console.error(`[ParlayHistory] Error resolving ${dateStr}:`, err.message);
    }
  }
}
