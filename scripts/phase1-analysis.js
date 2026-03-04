#!/usr/bin/env node
/**
 * Phase 1 — Picks & Parlay Performance Analysis
 *
 * Pulls all picksHistory + parlayHistory from Firestore,
 * resolves any ungraded picks via ESPN, then produces
 * a comprehensive hit-rate report segmented by:
 *   • Pipeline (edge vs stack)
 *   • Stat type
 *   • Green score (0-5)
 *   • Direction (over vs under)
 *   • Odds bucket
 *   • Margin analysis
 *   • Day of week
 *   • Parlay slip performance
 */

const admin = require('firebase-admin');

// ── Firebase init (uses gcloud ADC) ──
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

// ── ESPN helpers (same as trackPredictionResults.js) ──
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';

async function fetchGameStatsForDate(dateStr) {
  const yyyymmdd = dateStr.replace(/-/g, '');
  const sbResp = await fetch(`${ESPN_SCOREBOARD}?dates=${yyyymmdd}`, { signal: AbortSignal.timeout(15000) });
  const sbData = await sbResp.json();
  const events = sbData?.events || [];
  const finishedGames = events.filter(e => e.status?.type?.completed === true);
  if (finishedGames.length === 0) return { finishedGames: [], playerStats: new Map() };

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
            tpm: parseFloat(statMap['3PT']) || 0,
            min: statMap['MIN'] || '0',
          });
        }
      }
    } catch (err) {
      console.error(`  [ESPN] Error for event ${event.id}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return { finishedGames, playerStats };
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
  if (!playerEntry) { pick.actualStat = null; pick.result = 'dnp'; pick.hit = null; return; }
  // DNP check: player in box score but did not play (0 minutes)
  const minStr = String(playerEntry.min || '0');
  const minVal = parseFloat(minStr.replace(':', '.')) || 0;
  if (minVal === 0) { pick.actualStat = null; pick.result = 'dnp'; pick.hit = null; return; }
  const normalizedType = normalizeStatType(pick.statType || pick.stat);
  const actualStat = extractStatESPN(playerEntry, normalizedType);
  if (actualStat === null) { pick.result = 'unknown'; pick.hit = null; return; }
  pick.actualStat = actualStat;
  const actualDir = actualStat > pick.line ? 'over' : actualStat < pick.line ? 'under' : 'push';
  pick.result = actualDir;
  pick.hit = actualDir === 'push' ? null : (actualDir === pick.dir);
}

// ── Odds bucket helper ──
function oddsBucket(odds) {
  if (odds == null) return 'unknown';
  const o = Math.abs(odds);
  if (o <= 130) return 'tight (-100 to -130)';
  if (o <= 200) return 'moderate (-131 to -200)';
  if (o <= 400) return 'heavy (-201 to -400)';
  return 'goblin (-400+)';
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════

(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 1 — PICKS & PARLAY PERFORMANCE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Pull all picksHistory ──
  console.log('[1/5] Pulling picksHistory collection...');
  const picksSnap = await db.collection('picksHistory').orderBy(admin.firestore.FieldPath.documentId()).get();
  console.log(`  Found ${picksSnap.size} days of picks history.\n`);

  if (picksSnap.size === 0) {
    console.log('  No picksHistory data found. Exiting.');
    process.exit(0);
  }

  // ── 2. Resolve any ungraded picks ──
  console.log('[2/5] Checking for unresolved picks (will grade via ESPN)...');
  let unresolvedCount = 0;
  let resolvedNow = 0;

  for (const doc of picksSnap.docs) {
    const data = doc.data();
    const dateStr = doc.id;

    // Check if any picks lack hit/result fields
    const edge = data.edge || [];
    const stack = data.stack || [];
    const allPicks = [...edge, ...stack];
    const needsResolution = allPicks.some(p => p.hit === undefined || p.hit === null && p.result !== 'push' && p.result !== 'dnp');

    if (data.resultsRecorded && !needsResolution) continue;

    unresolvedCount++;
    console.log(`  Resolving ${dateStr}...`);

    try {
      const { finishedGames, playerStats } = await fetchGameStatsForDate(dateStr);
      if (finishedGames.length === 0) {
        console.log(`    No finished games for ${dateStr} — might be future date.`);
        continue;
      }

      for (const pick of edge) resolvePick(pick, playerStats);
      for (const pick of stack) resolvePick(pick, playerStats);

      const resolved = allPicks.filter(p => p.hit != null);
      const hits = resolved.filter(p => p.hit === true);
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
        edge, stack,
        resultsRecorded: true,
        resolvedAt: new Date().toISOString(),
        stats: statsObj,
      });

      resolvedNow++;
      console.log(`    ✓ ${dateStr}: ${hits.length}/${resolved.length} hits (${resolved.length > 0 ? ((hits.length/resolved.length)*100).toFixed(1) : 'N/A'}%)`);
    } catch (err) {
      console.error(`    ✗ Error resolving ${dateStr}: ${err.message}`);
    }
  }

  if (unresolvedCount === 0) {
    console.log('  All picks already resolved.\n');
  } else {
    console.log(`  Resolved ${resolvedNow}/${unresolvedCount} pending days.\n`);
  }

  // ── Re-read after potential updates ──
  const freshSnap = unresolvedCount > 0
    ? await db.collection('picksHistory').orderBy(admin.firestore.FieldPath.documentId()).get()
    : picksSnap;

  // ── 3. Aggregate all picks into flat array ──
  console.log('[3/5] Aggregating all picks for analysis...\n');

  const allEdge = [];
  const allStack = [];
  const dailyStats = [];

  for (const doc of freshSnap.docs) {
    const data = doc.data();
    const dateStr = doc.id;
    const edge = (data.edge || []).map(p => ({ ...p, date: dateStr, pipeline: 'edge' }));
    const stack = (data.stack || []).map(p => ({ ...p, date: dateStr, pipeline: 'stack' }));
    allEdge.push(...edge);
    allStack.push(...stack);
    if (data.stats) {
      dailyStats.push({ date: dateStr, ...data.stats });
    }
  }

  const allPicks = [...allEdge, ...allStack];
  const resolvedPicks = allPicks.filter(p => p.hit === true || p.hit === false);
  const hitPicks = resolvedPicks.filter(p => p.hit === true);
  const missPicks = resolvedPicks.filter(p => p.hit === false);

  console.log(`  Total picks across all dates:    ${allPicks.length}`);
  console.log(`  Resolved (hit or miss):          ${resolvedPicks.length}`);
  console.log(`  DNP / push / unknown:            ${allPicks.length - resolvedPicks.length}`);
  console.log(`  Hits:                            ${hitPicks.length}`);
  console.log(`  Misses:                          ${missPicks.length}`);
  console.log();

  if (resolvedPicks.length === 0) {
    console.log('  No resolved picks to analyze. Exiting.');
    process.exit(0);
  }

  // ══════════════════════════════════════════════════════════════
  // ANALYSIS
  // ══════════════════════════════════════════════════════════════

  console.log('[4/5] Running Phase 1 analysis...\n');

  // Helper: compute hit rate for a filtered set
  function hr(picks) {
    const r = picks.filter(p => p.hit === true || p.hit === false);
    const h = r.filter(p => p.hit === true);
    return { total: r.length, hits: h.length, rate: r.length > 0 ? (h.length / r.length * 100).toFixed(1) : 'N/A' };
  }

  // Helper: format table row
  function row(label, stats) {
    return `  ${label.padEnd(35)} ${String(stats.hits).padStart(5)} / ${String(stats.total).padStart(5)}    ${String(stats.rate + '%').padStart(7)}`;
  }

  // ── A. Overall hit rate by pipeline ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  A) HIT RATE BY PIPELINE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(row('EdgeBoard (ML)', hr(allEdge)));
  console.log(row('Parlay Stack (alt lines)', hr(allStack)));
  console.log(row('COMBINED', hr(allPicks)));
  console.log();

  // ── B. Hit rate by stat type ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  B) HIT RATE BY STAT TYPE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const statTypes = [...new Set(resolvedPicks.map(p => normalizeStatType(p.statType || p.stat)))].sort();
  for (const st of statTypes) {
    const picks = resolvedPicks.filter(p => normalizeStatType(p.statType || p.stat) === st);
    console.log(row(st, hr(picks)));
  }
  console.log();

  // ── C. Hit rate by stat type × pipeline ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  C) HIT RATE BY STAT TYPE × PIPELINE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const st of statTypes) {
    const edgePicks = allEdge.filter(p => normalizeStatType(p.statType || p.stat) === st);
    const stackPicks = allStack.filter(p => normalizeStatType(p.statType || p.stat) === st);
    const eHr = hr(edgePicks);
    const sHr = hr(stackPicks);
    if (eHr.total > 0) console.log(row(`${st} [edge]`, eHr));
    if (sHr.total > 0) console.log(row(`${st} [stack]`, sHr));
  }
  console.log();

  // ── D. Hit rate by direction (over vs under) ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  D) HIT RATE BY DIRECTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const overPicks = resolvedPicks.filter(p => p.dir === 'over');
  const underPicks = resolvedPicks.filter(p => p.dir === 'under');
  console.log(row('Over', hr(overPicks)));
  console.log(row('Under', hr(underPicks)));
  console.log();

  // ── E. Hit rate by green score ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  E) HIT RATE BY GREEN SCORE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (let g = 0; g <= 5; g++) {
    const picks = resolvedPicks.filter(p => (p.green ?? p.greenScore) === g);
    if (picks.length > 0) console.log(row(`Green score = ${g}`, hr(picks)));
  }
  console.log();

  // ── F. Hit rate by odds bucket ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  F) HIT RATE BY ODDS BUCKET');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const buckets = ['tight (-100 to -130)', 'moderate (-131 to -200)', 'heavy (-201 to -400)', 'goblin (-400+)', 'unknown'];
  for (const b of buckets) {
    const picks = resolvedPicks.filter(p => oddsBucket(p.odds) === b);
    if (picks.length > 0) console.log(row(b, hr(picks)));
  }
  console.log();

  // ── G. Margin analysis ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  G) MARGIN ANALYSIS (actualStat - line)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const withActual = resolvedPicks.filter(p => p.actualStat != null && p.line != null);
  if (withActual.length > 0) {
    const winMargins = withActual.filter(p => p.hit === true).map(p =>
      p.dir === 'over' ? p.actualStat - p.line : p.line - p.actualStat
    );
    const lossMargins = withActual.filter(p => p.hit === false).map(p =>
      p.dir === 'over' ? p.actualStat - p.line : p.line - p.actualStat
    );

    const avg = arr => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 'N/A';
    const median = arr => {
      if (arr.length === 0) return 'N/A';
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid].toFixed(2) : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2);
    };

    console.log(`  When we WIN:`);
    console.log(`    Avg margin:    +${avg(winMargins)} units past the line`);
    console.log(`    Median margin: +${median(winMargins)} units`);
    console.log(`    Sample size:   ${winMargins.length} picks`);
    console.log();
    console.log(`  When we LOSE:`);
    console.log(`    Avg margin:    ${avg(lossMargins)} units from the line`);
    console.log(`    Median margin: ${median(lossMargins)} units`);
    console.log(`    Sample size:   ${lossMargins.length} picks`);
    console.log();

    // Close miss analysis
    const closeMisses = withActual.filter(p => {
      if (p.hit !== false) return false;
      const m = Math.abs(p.actualStat - p.line);
      return m <= 2;
    });
    const blowoutMisses = withActual.filter(p => {
      if (p.hit !== false) return false;
      const m = Math.abs(p.actualStat - p.line);
      return m > 5;
    });
    console.log(`  Close misses (within 2 units):   ${closeMisses.length} / ${missPicks.length} misses (${missPicks.length > 0 ? ((closeMisses.length/missPicks.length)*100).toFixed(1) : 'N/A'}%)`);
    console.log(`  Blowout misses (>5 units):       ${blowoutMisses.length} / ${missPicks.length} misses (${missPicks.length > 0 ? ((blowoutMisses.length/missPicks.length)*100).toFixed(1) : 'N/A'}%)`);
  } else {
    console.log('  No picks with actual stats available.');
  }
  console.log();

  // ── H. Hit rate by day of week ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  H) HIT RATE BY DAY OF WEEK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (let d = 0; d < 7; d++) {
    const picks = resolvedPicks.filter(p => p.date && new Date(p.date + 'T12:00:00Z').getUTCDay() === d);
    if (picks.length > 0) console.log(row(dayNames[d], hr(picks)));
  }
  console.log();

  // ── I. Daily trend ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  I) DAILY HIT RATE TREND');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const dates = [...new Set(resolvedPicks.map(p => p.date))].sort();
  for (const d of dates) {
    const dayPicks = resolvedPicks.filter(p => p.date === d);
    const stats = hr(dayPicks);
    const bar = '█'.repeat(Math.round(parseFloat(stats.rate) / 5));
    console.log(`  ${d}  ${String(stats.hits).padStart(3)}/${String(stats.total).padStart(3)}  ${String(stats.rate + '%').padStart(7)}  ${bar}`);
  }
  console.log();

  // ── J. Top winners & top losers (specific picks) ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  J) BIGGEST WINS (largest margin past line)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const bigWins = withActual
    .filter(p => p.hit === true)
    .map(p => ({
      ...p,
      margin: p.dir === 'over' ? p.actualStat - p.line : p.line - p.actualStat,
    }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);
  for (const w of bigWins) {
    const stat = normalizeStatType(w.statType || w.stat);
    console.log(`  +${w.margin.toFixed(1).padStart(5)}  ${w.name.padEnd(22)} ${stat.padEnd(10)} ${w.dir.padEnd(5)} ${String(w.line).padEnd(5)} → actual ${w.actualStat}  [${w.date}]`);
  }
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  K) BIGGEST LOSSES (largest miss margin)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const bigLosses = withActual
    .filter(p => p.hit === false)
    .map(p => ({
      ...p,
      margin: p.dir === 'over' ? p.line - p.actualStat : p.actualStat - p.line,
    }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);
  for (const l of bigLosses) {
    const stat = normalizeStatType(l.statType || l.stat);
    console.log(`  -${l.margin.toFixed(1).padStart(5)}  ${l.name.padEnd(22)} ${stat.padEnd(10)} ${l.dir.padEnd(5)} ${String(l.line).padEnd(5)} → actual ${l.actualStat}  [${l.date}]`);
  }
  console.log();

  // ── L. L10 hit rate correlation ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  L) HIT RATE BY PRE-GAME L10 HIT RATE BRACKET');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const l10Brackets = [
    { label: 'L10 ≥ 80%', min: 80, max: 101 },
    { label: 'L10 70-79%', min: 70, max: 80 },
    { label: 'L10 60-69%', min: 60, max: 70 },
    { label: 'L10 50-59%', min: 50, max: 60 },
    { label: 'L10 < 50%', min: 0, max: 50 },
  ];
  for (const bracket of l10Brackets) {
    const picks = resolvedPicks.filter(p => {
      const l10 = p.l10 ?? p.hitRates?.l10?.pct;
      return l10 != null && l10 >= bracket.min && l10 < bracket.max;
    });
    if (picks.length > 0) console.log(row(bracket.label, hr(picks)));
  }
  console.log();

  // ── M. Opponent defense correlation ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  M) HIT RATE BY OPPONENT DEFENSE RANK');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const defBrackets = [
    { label: 'Top 5 defense (1-5)', min: 1, max: 6 },
    { label: 'Good defense (6-10)', min: 6, max: 11 },
    { label: 'Mid defense (11-20)', min: 11, max: 21 },
    { label: 'Weak defense (21-30)', min: 21, max: 31 },
  ];
  for (const bracket of defBrackets) {
    const picks = resolvedPicks.filter(p => {
      const rank = p.oppDef ?? p.opponentDefense?.rank;
      return rank != null && rank >= bracket.min && rank < bracket.max;
    });
    if (picks.length > 0) console.log(row(bracket.label, hr(picks)));
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // PARLAY HISTORY ANALYSIS
  // ══════════════════════════════════════════════════════════════

  console.log('[5/5] Analyzing parlay slips...\n');

  const parlaySnap = await db.collection('parlayHistory').orderBy(admin.firestore.FieldPath.documentId()).get();
  console.log(`  Found ${parlaySnap.size} days of parlay history.\n`);

  if (parlaySnap.size > 0) {
    // Resolve unresolved parlay days
    for (const doc of parlaySnap.docs) {
      const data = doc.data();
      if (data.resultsRecorded) continue;
      const dateStr = doc.id;
      console.log(`  Resolving parlay ${dateStr}...`);
      try {
        const { finishedGames, playerStats } = await fetchGameStatsForDate(dateStr);
        if (finishedGames.length === 0) { console.log(`    No finished games.`); continue; }
        const slips = data.slips || [];
        for (const slip of slips) {
          for (const leg of (slip.legs || [])) resolvePick(leg, playerStats);
          const resolvedLegs = (slip.legs || []).filter(l => l.hit != null);
          const allHit = resolvedLegs.length > 0 && resolvedLegs.every(l => l.hit === true);
          slip.hit = resolvedLegs.length === (slip.legs || []).length ? allHit : null;
          slip.legsHit = resolvedLegs.filter(l => l.hit === true).length;
          slip.legsTotal = (slip.legs || []).length;
        }
        const resolvedSlips = slips.filter(s => s.hit != null);
        await doc.ref.update({
          slips, resultsRecorded: true, resolvedAt: new Date().toISOString(),
          stats: { totalSlips: slips.length, resolvedSlips: resolvedSlips.length, slipHits: resolvedSlips.filter(s => s.hit).length },
        });
        console.log(`    ✓ Done.`);
      } catch (err) {
        console.error(`    ✗ Error: ${err.message}`);
      }
    }

    // Re-read
    const freshParlaySnap = await db.collection('parlayHistory').orderBy(admin.firestore.FieldPath.documentId()).get();

    console.log();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  N) PARLAY SLIP PERFORMANCE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    let totalSlips = 0, slipWins = 0, totalLegs = 0, legHits = 0;
    const slipsByType = {};

    for (const doc of freshParlaySnap.docs) {
      const data = doc.data();
      const slips = data.slips || [];
      for (const slip of slips) {
        if (slip.hit == null) continue;
        totalSlips++;
        if (slip.hit === true) slipWins++;
        const name = (slip.name || '').split('_')[0]; // LOCK, SAFE, VALUE
        if (!slipsByType[name]) slipsByType[name] = { total: 0, wins: 0 };
        slipsByType[name].total++;
        if (slip.hit) slipsByType[name].wins++;

        for (const leg of (slip.legs || [])) {
          if (leg.hit != null) {
            totalLegs++;
            if (leg.hit === true) legHits++;
          }
        }
      }
    }

    console.log(`  Total resolved slips:   ${totalSlips}`);
    console.log(`  Slips that hit (all 5): ${slipWins} (${totalSlips > 0 ? ((slipWins/totalSlips)*100).toFixed(1) : 'N/A'}%)`);
    console.log(`  Individual leg hits:    ${legHits}/${totalLegs} (${totalLegs > 0 ? ((legHits/totalLegs)*100).toFixed(1) : 'N/A'}%)`);
    console.log();

    for (const [type, stats] of Object.entries(slipsByType).sort()) {
      console.log(`  ${type.padEnd(10)} ${stats.wins}/${stats.total} slips hit (${((stats.wins/stats.total)*100).toFixed(1)}%)`);
    }
    console.log();

    // Parlay daily trend
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  O) PARLAY LEG HIT RATE BY DATE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    for (const doc of freshParlaySnap.docs) {
      const data = doc.data();
      const slips = data.slips || [];
      let dLegs = 0, dHits = 0;
      for (const slip of slips) {
        for (const leg of (slip.legs || [])) {
          if (leg.hit != null) { dLegs++; if (leg.hit) dHits++; }
        }
      }
      if (dLegs > 0) {
        const rate = ((dHits/dLegs)*100).toFixed(1);
        const bar = '█'.repeat(Math.round(parseFloat(rate) / 5));
        console.log(`  ${doc.id}  ${String(dHits).padStart(3)}/${String(dLegs).padStart(3)}  ${(rate+'%').padStart(7)}  ${bar}`);
      }
    }
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
})();