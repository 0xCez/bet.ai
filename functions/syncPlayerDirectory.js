/**
 * syncPlayerDirectory.js — Daily NBA player directory sync
 *
 * Reads nbaStarPlayers.json (8 players × 30 teams = 240 players),
 * resolves API-Sports IDs + ESPN headshots using existing shared modules,
 * fetches season game logs, computes averages, and writes to Firestore
 * `nbaPlayerDirectory` collection.
 *
 * This collection is the single source of truth for player data across the app.
 * Other pipelines can read from it instead of making redundant API calls.
 *
 * Schedule: daily at 10 AM UTC (before prop pipelines run)
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const { resolvePlayerId, getGameLogs, getTeamSchedule, getApiKey, API_SPORTS_TEAM_IDS, TEAM_ID_TO_CODE, TEAM_ID_TO_NAME } = require('./shared/playerStats');
const { resolveEspnPlayer } = require('./shared/espnHeadshot');
const starPlayers = require('./data/nbaStarPlayers.json');

let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

// ── Helpers ──

function computeAverages(logs) {
  if (!logs || logs.length === 0) return null;
  let pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, tov = 0, tpm = 0;
  for (const g of logs) {
    pts += g.points || 0;
    reb += g.totReb || 0;
    ast += g.assists || 0;
    stl += g.steals || 0;
    blk += g.blocks || 0;
    tov += g.turnovers || 0;
    tpm += g.tpm || 0;
  }
  const n = logs.length;
  return {
    ppg: +(pts / n).toFixed(1),
    rpg: +(reb / n).toFixed(1),
    apg: +(ast / n).toFixed(1),
    spg: +(stl / n).toFixed(1),
    bpg: +(blk / n).toFixed(1),
    tpg: +(tov / n).toFixed(1),
    threePg: +(tpm / n).toFixed(1),
    gamesPlayed: n,
  };
}

/**
 * Find a team's next upcoming game from the schedule.
 * Returns { date, opponent, opponentCode, isHome } or null.
 */
function findNextGame(schedule) {
  if (!schedule) return null;
  const now = new Date();
  let next = null;

  for (const entry of Object.values(schedule)) {
    if (!entry.date) continue;
    const gameDate = new Date(entry.date);
    if (gameDate > now && (!next || gameDate < new Date(next.date))) {
      next = entry;
    }
  }

  return next ? {
    date: next.date,
    opponent: next.opponent,
    opponentCode: next.opponentCode,
    isHome: next.isHome,
  } : null;
}

// ── Core sync logic ──

async function runSync() {
  const db = getDb();
  const startTime = Date.now();

  // 1. Flatten all players from JSON
  const allPlayers = [];
  for (const [teamName, teamData] of Object.entries(starPlayers.teams)) {
    for (const player of teamData.players) {
      allPlayers.push({
        name: player.name,
        team: teamName,
        teamCode: teamData.code,
        apiSportsId: player.apiSportsId || null,
      });
    }
  }
  console.log(`[syncDir] Starting sync for ${allPlayers.length} players`);

  // 2. Resolve API-Sports IDs for players without one
  const needResolve = allPlayers.filter(p => !p.apiSportsId);
  if (needResolve.length > 0) {
    console.log(`[syncDir] Resolving ${needResolve.length} player IDs...`);
    const apiKey = getApiKey();
    for (let i = 0; i < needResolve.length; i += 5) {
      const batch = needResolve.slice(i, i + 5);
      const ids = await Promise.all(batch.map(p => resolvePlayerId(p.name, apiKey)));
      batch.forEach((p, idx) => { p.apiSportsId = ids[idx]; });
    }
  }

  // 3. Build playerIdMap for batch game log fetch
  const playerIdMap = {};
  for (const p of allPlayers) {
    if (p.apiSportsId) playerIdMap[p.name] = p.apiSportsId;
  }

  // 4. Fetch game logs in batches (reuses Firestore cache in shared module)
  console.log(`[syncDir] Fetching game logs for ${Object.keys(playerIdMap).length} players...`);
  const apiKey = getApiKey();
  const gameLogsMap = {};
  const entries = Object.entries(playerIdMap);
  for (let i = 0; i < entries.length; i += 4) {
    const batch = entries.slice(i, i + 4);
    const logs = await Promise.all(batch.map(([, id]) => getGameLogs(id, apiKey)));
    batch.forEach(([name], idx) => { gameLogsMap[name] = logs[idx]; });
    if (i % 20 === 0 && i > 0) console.log(`[syncDir] Processed ${i}/${entries.length} game logs`);
  }

  // 4b. Re-resolve IDs for players whose hardcoded ID returned 0 game logs
  //     (nbaStarPlayers.json may have stale/wrong IDs)
  const needReResolve = allPlayers.filter(p => {
    return p.apiSportsId && (!gameLogsMap[p.name] || gameLogsMap[p.name].length === 0);
  });
  if (needReResolve.length > 0) {
    console.log(`[syncDir] Re-resolving ${needReResolve.length} players with 0 game logs...`);
    for (let i = 0; i < needReResolve.length; i += 5) {
      const batch = needReResolve.slice(i, i + 5);
      const ids = await Promise.all(batch.map(p => resolvePlayerId(p.name, apiKey)));
      for (let j = 0; j < batch.length; j++) {
        const newId = ids[j];
        const p = batch[j];
        if (newId && newId !== p.apiSportsId) {
          console.log(`[syncDir] ID fix: ${p.name} ${p.apiSportsId} → ${newId}`);
          p.apiSportsId = newId;
          playerIdMap[p.name] = newId;
          // Fetch game logs with corrected ID
          const logs = await getGameLogs(newId, apiKey);
          gameLogsMap[p.name] = logs || [];
        }
      }
    }
  }

  // 5. Resolve ESPN headshots in batches (permanently cached — most will be instant)
  console.log(`[syncDir] Resolving ESPN headshots...`);
  const espnMap = {};
  for (let i = 0; i < allPlayers.length; i += 10) {
    const batch = allPlayers.slice(i, i + 10);
    const results = await Promise.all(batch.map(p => resolveEspnPlayer(p.name)));
    batch.forEach((p, idx) => { espnMap[p.name] = results[idx]; });
  }

  // 6. Fetch team schedules (for next game) — deduplicate by team
  console.log(`[syncDir] Fetching team schedules...`);
  const uniqueTeams = [...new Set(allPlayers.map(p => p.team))];
  const scheduleMap = {};
  for (let i = 0; i < uniqueTeams.length; i += 5) {
    const batch = uniqueTeams.slice(i, i + 5);
    const schedules = await Promise.all(batch.map(t => getTeamSchedule(t)));
    batch.forEach((t, idx) => { scheduleMap[t] = schedules[idx]; });
  }

  // 7. Write to Firestore in batches (max 500 per batch)
  //    Store condensed game logs so getPlayerSearch can read directly
  //    without hitting API-Sports live. ~200 bytes per game × 82 games ≈ 16KB per player.
  console.log(`[syncDir] Writing to Firestore...`);
  let writeBatch = db.batch();
  let batchCount = 0;
  let successCount = 0;

  for (const p of allPlayers) {
    const logs = gameLogsMap[p.name] || [];
    const espn = espnMap[p.name] || {};
    const averages = computeAverages(logs);
    const nextGame = findNextGame(scheduleMap[p.team]);

    // Condense game logs to only the fields needed by getStatValue + buildGameLogEntries
    const condensedLogs = logs.map(g => ({
      points: g.points || 0,
      totReb: g.totReb || 0,
      assists: g.assists || 0,
      steals: g.steals || 0,
      blocks: g.blocks || 0,
      turnovers: g.turnovers || 0,
      tpm: g.tpm || 0,
      game: { id: g.game?.id || 0, date: g.game?.date || null },
      team: { id: g.team?.id || null },
    }));

    const docId = p.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const docRef = db.collection('nbaPlayerDirectory').doc(docId);

    writeBatch.set(docRef, {
      name: p.name,
      team: p.team,
      teamCode: p.teamCode,
      position: espn.position || null,
      headshotUrl: espn.headshotUrl || null,
      apiSportsId: p.apiSportsId || null,
      averages: averages || {},
      gamesPlayed: logs.length,
      gameLogs: condensedLogs,
      nextGame: nextGame || null,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });

    batchCount++;
    successCount++;

    if (batchCount >= 450) {
      await writeBatch.commit();
      writeBatch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await writeBatch.commit();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[syncDir] Done. ${successCount}/${allPlayers.length} players synced in ${elapsed}s`);
  return { playersUpdated: successCount, elapsedSeconds: parseFloat(elapsed) };
}

// ── Scheduled: daily at 10 AM UTC ──

exports.syncPlayerDirectoryScheduled = onSchedule({
  schedule: '0 10 * * *',
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: ['API_SPORTS_KEY'],
}, async () => {
  await runSync();
});

// ── HTTP trigger for manual runs ──

exports.syncPlayerDirectory = onRequest({
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: ['API_SPORTS_KEY'],
  cors: true,
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const result = await runSync();
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[syncDir] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── App endpoint: get the full directory for search ──

exports.getPlayerDirectory = onRequest({
  timeoutSeconds: 10,
  memory: '256MiB',
  cors: true,
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const snapshot = await getDb().collection('nbaPlayerDirectory').get();
    const players = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      players.push({
        name: data.name,
        team: data.team,
        teamCode: data.teamCode,
        position: data.position,
        headshotUrl: data.headshotUrl,
        averages: data.averages || {},
        gamesPlayed: data.gamesPlayed || 0,
        nextGame: data.nextGame || null,
      });
    });

    // Sort by name
    players.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({ success: true, players, count: players.length });
  } catch (err) {
    console.error('[getPlayerDirectory] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
