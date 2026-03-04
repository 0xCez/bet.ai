#!/usr/bin/env node
/**
 * regrade-picks.js — One-time re-grading of all picksHistory documents
 * using the fixed 3PT (3PT not 3PM) and DNP (0 minutes) logic.
 *
 * Usage: node scripts/regrade-picks.js [--dry-run] [--days=30]
 */

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DAYS = parseInt((args.find(a => a.startsWith('--days=')) || '--days=30').split('=')[1]);

async function fetchGameStatsForDate(dateStr) {
  const yyyymmdd = dateStr.replace(/-/g, '');
  const sbResp = await fetch(`${ESPN_SCOREBOARD}?dates=${yyyymmdd}`, { signal: AbortSignal.timeout(15000) });
  const sbData = await sbResp.json();
  const events = sbData?.events || [];
  const finishedGames = events.filter(e => e.status?.type?.completed === true);
  if (finishedGames.length === 0) return new Map();

  const playerStats = new Map();
  for (const event of finishedGames) {
    try {
      const summaryResp = await fetch(`${ESPN_SUMMARY}?event=${event.id}`, { signal: AbortSignal.timeout(15000) });
      const summaryData = await summaryResp.json();
      const boxScore = summaryData?.boxscore;
      if (!boxScore?.players) continue;
      for (const team of boxScore.players) {
        const teamName = team.team?.displayName || '';
        const statLabels = (team.statistics || [])[0]?.labels || [];
        for (const player of (team.statistics || [])[0]?.athletes || []) {
          const name = player.athlete?.displayName || '';
          if (!name) continue;
          const stats = player.stats || [];
          const statMap = {};
          statLabels.forEach((label, idx) => { statMap[label.toUpperCase()] = stats[idx]; });
          playerStats.set(name.toLowerCase(), {
            name, teamName,
            pts: parseFloat(statMap['PTS']) || 0,
            reb: parseFloat(statMap['REB']) || 0,
            ast: parseFloat(statMap['AST']) || 0,
            stl: parseFloat(statMap['STL']) || 0,
            blk: parseFloat(statMap['BLK']) || 0,
            tov: parseFloat(statMap['TO']) || 0,
            tpm: parseFloat(statMap['3PT']) || 0,  // FIXED: was '3PM'
            min: statMap['MIN'] || '0',
          });
        }
      }
    } catch (err) {
      console.error(`  [ESPN] Error for event ${event.id}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return playerStats;
}

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
    'threepointersmade': 'tpm',
  };
  const combos = {
    'points+rebounds': ['pts', 'reb'], 'points+assists': ['pts', 'ast'],
    'rebounds+assists': ['reb', 'ast'], 'points+rebounds+assists': ['pts', 'reb', 'ast'],
    'steals+blocks': ['stl', 'blk'], 'blocks+steals': ['stl', 'blk'],
  };
  if (combos[type]) {
    let total = 0;
    for (const k of combos[type]) { if (playerEntry[k] == null) return null; total += playerEntry[k]; }
    return total;
  }
  const key = map[type];
  return key ? (playerEntry[key] ?? null) : null;
}

function findPlayerESPN(playerStats, playerName) {
  if (!playerName) return null;
  const target = playerName.toLowerCase().trim();
  if (playerStats.has(target)) return playerStats.get(target);
  const lastName = target.split(' ').pop();
  for (const [key, val] of playerStats) {
    if (key.split(' ').pop() === lastName) return val;
  }
  return null;
}

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

function resolvePick(pick, playerStats) {
  const playerEntry = findPlayerESPN(playerStats, pick.name);
  if (!playerEntry) {
    pick.actualStat = null;
    pick.result = 'dnp';
    pick.hit = null;
    return;
  }
  // DNP check: player in box score but did not play (0 minutes)
  const minStr = String(playerEntry.min || '0');
  const minVal = parseFloat(minStr.replace(':', '.')) || 0;
  if (minVal === 0) {
    pick.actualStat = null;
    pick.result = 'dnp';
    pick.hit = null;
    return;
  }
  const normalizedType = normalizeStatType(pick.statType || pick.stat);
  const actualStat = extractStatESPN(playerEntry, normalizedType);
  if (actualStat === null) { pick.result = 'unknown'; pick.hit = null; return; }
  pick.actualStat = actualStat;
  const actualDir = actualStat > pick.line ? 'over' : actualStat < pick.line ? 'under' : 'push';
  pick.result = actualDir;
  pick.hit = actualDir === 'push' ? null : (actualDir === pick.dir);
}

(async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RE-GRADING PICKS (${DRY_RUN ? 'DRY RUN' : 'LIVE'}, last ${DAYS} days)`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch all picksHistory docs
  const snapshot = await db.collection('picksHistory').get();
  const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Found ${docs.length} picksHistory documents\n`);

  // Filter to last N days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const relevantDocs = docs.filter(d => d.id >= cutoffStr).sort((a, b) => a.id.localeCompare(b.id));
  console.log(`Processing ${relevantDocs.length} docs from ${cutoffStr} onwards\n`);

  let totalBefore = { hits: 0, misses: 0, dnp: 0, total: 0 };
  let totalAfter = { hits: 0, misses: 0, dnp: 0, total: 0 };
  let threePtFixed = 0;
  let dnpFixed = 0;

  for (const doc of relevantDocs) {
    const dateStr = doc.id;
    console.log(`\n--- ${dateStr} ---`);

    // Fetch ESPN data for this date
    const playerStats = await fetchGameStatsForDate(dateStr);
    if (playerStats.size === 0) {
      console.log('  No ESPN data (no finished games). Skipping.');
      continue;
    }
    console.log(`  ESPN: ${playerStats.size} players found`);

    const allPicks = [
      ...(doc.edge || []).map(p => ({ ...p, pipeline: 'edge' })),
      ...(doc.stack || []).map(p => ({ ...p, pipeline: 'stack' })),
    ];

    // Count old grades
    for (const p of allPicks) {
      totalBefore.total++;
      if (p.hit === true) totalBefore.hits++;
      else if (p.hit === false) totalBefore.misses++;
      else if (p.result === 'dnp') totalBefore.dnp++;
    }

    // Re-grade
    for (const p of allPicks) {
      const oldResult = p.result;
      const oldHit = p.hit;
      const oldActual = p.actualStat;

      resolvePick(p, playerStats);

      // Track changes
      if (p.result !== oldResult || p.hit !== oldHit) {
        const statType = (p.statType || '').toLowerCase();
        if (statType.includes('three') || statType === '3pm' || statType === 'tpm') {
          threePtFixed++;
        }
        if (p.result === 'dnp' && oldResult !== 'dnp') {
          dnpFixed++;
        }
      }

      // Count new grades
      totalAfter.total++;
      if (p.hit === true) totalAfter.hits++;
      else if (p.hit === false) totalAfter.misses++;
      else if (p.result === 'dnp') totalAfter.dnp++;
    }

    // Split back into edge/stack
    const newEdge = allPicks.filter(p => p.pipeline === 'edge').map(p => {
      const { pipeline, ...rest } = p;
      return rest;
    });
    const newStack = allPicks.filter(p => p.pipeline === 'stack').map(p => {
      const { pipeline, ...rest } = p;
      return rest;
    });

    const edgeChanged = JSON.stringify(newEdge) !== JSON.stringify(doc.edge || []);
    const stackChanged = JSON.stringify(newStack) !== JSON.stringify(doc.stack || []);

    if (edgeChanged || stackChanged) {
      console.log(`  Changes detected — ${DRY_RUN ? 'would update' : 'updating'} Firestore`);
      if (!DRY_RUN) {
        await db.collection('picksHistory').doc(dateStr).update({
          edge: newEdge,
          stack: newStack,
          reGradedAt: new Date().toISOString(),
        });
      }
    } else {
      console.log('  No changes needed');
    }

    // Rate limit ESPN
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('  RE-GRADING SUMMARY');
  console.log(`${'='.repeat(60)}`);

  const beforeHR = totalBefore.hits + totalBefore.misses > 0
    ? ((totalBefore.hits / (totalBefore.hits + totalBefore.misses)) * 100).toFixed(1) : 'N/A';
  const afterHR = totalAfter.hits + totalAfter.misses > 0
    ? ((totalAfter.hits / (totalAfter.hits + totalAfter.misses)) * 100).toFixed(1) : 'N/A';

  console.log(`\n  BEFORE: ${totalBefore.hits} hits, ${totalBefore.misses} misses, ${totalBefore.dnp} DNP`);
  console.log(`  BEFORE HR: ${beforeHR}%`);
  console.log(`\n  AFTER:  ${totalAfter.hits} hits, ${totalAfter.misses} misses, ${totalAfter.dnp} DNP`);
  console.log(`  AFTER HR:  ${afterHR}%`);
  console.log(`\n  3PT picks re-graded: ${threePtFixed}`);
  console.log(`  DNP picks corrected: ${dnpFixed}`);
  console.log(`\n  Mode: ${DRY_RUN ? 'DRY RUN (no Firestore writes)' : 'LIVE (Firestore updated)'}`);

  console.log(`\n${'='.repeat(60)}\n`);
  process.exit(0);
})();
