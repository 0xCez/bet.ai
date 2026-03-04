#!/usr/bin/env node
/**
 * Phase 2 — Failure Pattern Deep Dive
 *
 * Uses already-resolved picksHistory + parlayHistory data.
 * Does NOT re-fetch ESPN (reads pre-graded data from Phase 1).
 *
 * Analyses:
 *   A) DNP / zero-stat deep dive
 *   B) Three-pointer anomaly investigation
 *   C) Duplicate player-line inflation
 *   D) Failure clustering by feature combinations
 *   E) L10 hit rate paradox (low L10 = high actual HR?)
 *   F) Defense rank vs actual outcomes
 *   G) Close misses pattern (within 2 units)
 *   H) Edge betScore effectiveness
 *   I) Stack parlayEdge effectiveness
 *   J) Parlay slip failure anatomy
 *   K) Trend signal effectiveness
 *   L) Home/away split
 *   M) Bookmaker performance
 *   N) Time-of-day patterns
 */

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

// ── Helpers ──
function normalizeStatType(statType) {
  if (!statType) return null;
  const t = statType.toLowerCase().replace('player_', '');
  const map = {
    'points': 'points', 'rebounds': 'rebounds', 'assists': 'assists',
    'steals': 'steals', 'blocks': 'blocks', 'turnovers': 'turnovers',
    'threes': 'threes', 'three_pointers': 'threes',
    'pts': 'points', 'reb': 'rebounds', 'ast': 'assists',
    'stl': 'steals', 'blk': 'blocks', 'tov': 'turnovers',
    '3pm': 'threes', 'tpm': 'threes', 'threepointersmade': 'threes',
  };
  return map[t] || t;
}

function hr(picks) {
  const r = picks.filter(p => p.hit === true || p.hit === false);
  const h = r.filter(p => p.hit === true);
  return { total: r.length, hits: h.length, rate: r.length > 0 ? (h.length / r.length * 100).toFixed(1) : 'N/A' };
}

function row(label, stats, extra = '') {
  return `  ${label.padEnd(40)} ${String(stats.hits).padStart(4)} / ${String(stats.total).padStart(4)}    ${String(stats.rate + '%').padStart(7)}  ${extra}`;
}

function isCombo(statType) {
  const n = normalizeStatType(statType);
  return n && n.includes('+');
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 2 — FAILURE PATTERN DEEP DIVE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Load all picks ──
  const picksSnap = await db.collection('picksHistory')
    .orderBy(admin.firestore.FieldPath.documentId()).get();

  const allEdge = [];
  const allStack = [];

  for (const doc of picksSnap.docs) {
    const data = doc.data();
    const dateStr = doc.id;
    if (!data.resultsRecorded) continue; // skip unresolved days
    const edge = (data.edge || []).map(p => ({ ...p, date: dateStr, pipeline: 'edge' }));
    const stack = (data.stack || []).map(p => ({ ...p, date: dateStr, pipeline: 'stack' }));
    allEdge.push(...edge);
    allStack.push(...stack);
  }

  const allPicks = [...allEdge, ...allStack];
  const resolved = allPicks.filter(p => p.hit === true || p.hit === false);
  const hits = resolved.filter(p => p.hit === true);
  const misses = resolved.filter(p => p.hit === false);

  console.log(`  Loaded: ${allPicks.length} total picks (${allEdge.length} edge, ${allStack.length} stack)`);
  console.log(`  Resolved: ${resolved.length} | Hits: ${hits.length} | Misses: ${misses.length}`);
  console.log(`  Unresolved/DNP/push/unknown: ${allPicks.length - resolved.length}\n`);

  // ══════════════════════════════════════════════════════════════
  // A) DNP / ZERO-STAT DEEP DIVE
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  A) DNP / ZERO-STAT DEEP DIVE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const dnpPicks = allPicks.filter(p => p.result === 'dnp');
  const zeroStatPicks = allPicks.filter(p => p.actualStat === 0 && p.result !== 'dnp');
  const unknownPicks = allPicks.filter(p => p.result === 'unknown');

  console.log(`  Tagged as DNP:               ${dnpPicks.length}`);
  console.log(`  Zero stat but NOT tagged DNP: ${zeroStatPicks.length}`);
  console.log(`  Tagged as unknown:            ${unknownPicks.length}`);
  console.log();

  // Zero-stat picks that hit or missed (these are suspicious)
  const zeroStatResolved = zeroStatPicks.filter(p => p.hit != null);
  if (zeroStatResolved.length > 0) {
    console.log(`  Zero-stat picks that were graded as hit/miss: ${zeroStatResolved.length}`);
    console.log(`    → These are likely FALSE GRADES (player didn't play but matched another player)`);
    console.log();
    console.log('  Samples of zero-stat graded picks:');
    for (const p of zeroStatResolved.slice(0, 15)) {
      const stat = normalizeStatType(p.statType || p.stat);
      console.log(`    ${p.name.padEnd(22)} ${stat.padEnd(12)} ${p.dir.padEnd(5)} line=${String(p.line).padEnd(5)} actual=0  hit=${p.hit}  [${p.date}] [${p.pipeline}]`);
    }
    console.log();

    // Which players appear most often with 0 stats?
    const zeroPlayers = {};
    for (const p of zeroStatPicks) {
      const key = p.name;
      if (!zeroPlayers[key]) zeroPlayers[key] = { count: 0, dates: new Set() };
      zeroPlayers[key].count++;
      zeroPlayers[key].dates.add(p.date);
    }
    const topZero = Object.entries(zeroPlayers).sort((a, b) => b[1].count - a[1].count).slice(0, 15);
    console.log('  Players most frequently appearing with 0 actual stat:');
    for (const [name, info] of topZero) {
      console.log(`    ${name.padEnd(25)} ${String(info.count).padStart(3)} times  dates: ${[...info.dates].join(', ')}`);
    }
  }
  console.log();

  // Impact: what if we excluded all zero-stat picks?
  const nonZeroPicks = resolved.filter(p => p.actualStat !== 0);
  const nonZeroHr = hr(nonZeroPicks);
  console.log(`  If we exclude all zero-stat picks from grading:`);
  console.log(`    Current HR:  ${hr(resolved).rate}% (${resolved.length} picks)`);
  console.log(`    Cleaned HR:  ${nonZeroHr.rate}% (${nonZeroPicks.length} picks)`);
  console.log();

  // ══════════════════════════════════════════════════════════════
  // B) THREE-POINTER ANOMALY INVESTIGATION
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  B) THREE-POINTER ANOMALY INVESTIGATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const threesPicks = allPicks.filter(p => {
    const st = normalizeStatType(p.statType || p.stat);
    return st === 'threes' || st === 'threepointersmade';
  });
  const threesEdge = threesPicks.filter(p => p.pipeline === 'edge');
  const threesStack = threesPicks.filter(p => p.pipeline === 'stack');

  console.log(`  Total 3PT picks: ${threesPicks.length} (edge: ${threesEdge.length}, stack: ${threesStack.length})`);
  console.log(row('3PT Edge', hr(threesEdge)));
  console.log(row('3PT Stack', hr(threesStack)));
  console.log();

  // Stack 3PT: over vs under
  const threesStackOver = threesStack.filter(p => p.dir === 'over');
  const threesStackUnder = threesStack.filter(p => p.dir === 'under');
  console.log(row('3PT Stack — Over', hr(threesStackOver)));
  console.log(row('3PT Stack — Under', hr(threesStackUnder)));
  console.log();

  // 3PT Stack by line value
  console.log('  3PT Stack by line value:');
  const threesLines = [...new Set(threesStack.map(p => p.line))].sort((a, b) => a - b);
  for (const line of threesLines) {
    const picks = threesStack.filter(p => p.line === line);
    const stats = hr(picks);
    if (stats.total >= 3) {
      console.log(row(`  line = ${line}`, stats));
    }
  }
  console.log();

  // 3PT Stack: how many are zero-stat?
  const threesStackZero = threesStack.filter(p => p.actualStat === 0);
  console.log(`  3PT Stack picks with actualStat = 0: ${threesStackZero.length} / ${threesStack.length} (${threesStack.length > 0 ? ((threesStackZero.length/threesStack.length)*100).toFixed(1) : 'N/A'}%)`);
  console.log();

  // Edge 3PT: over vs under
  const threesEdgeOver = threesEdge.filter(p => p.dir === 'over');
  const threesEdgeUnder = threesEdge.filter(p => p.dir === 'under');
  console.log(row('3PT Edge — Over', hr(threesEdgeOver)));
  console.log(row('3PT Edge — Under', hr(threesEdgeUnder)));
  console.log();

  // ══════════════════════════════════════════════════════════════
  // C) DUPLICATE PLAYER-LINE INFLATION
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  C) DUPLICATE PLAYER-LINE INFLATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Count same player+stat+date combos with different lines
  const playerDateCombos = {};
  for (const p of allPicks) {
    const key = `${p.name}|${normalizeStatType(p.statType || p.stat)}|${p.date}`;
    if (!playerDateCombos[key]) playerDateCombos[key] = [];
    playerDateCombos[key].push(p);
  }

  const duplicates = Object.entries(playerDateCombos).filter(([_, picks]) => picks.length > 1);
  const uniqueCombos = Object.keys(playerDateCombos).length;
  const totalWithDupes = duplicates.reduce((sum, [_, picks]) => sum + picks.length, 0);

  console.log(`  Unique player+stat+date combos:   ${uniqueCombos}`);
  console.log(`  Combos with multiple lines:       ${duplicates.length}`);
  console.log(`  Total picks in duplicated combos:  ${totalWithDupes}`);
  console.log(`  % of all picks that are dupes:     ${((totalWithDupes / allPicks.length) * 100).toFixed(1)}%`);
  console.log();

  // Show examples
  if (duplicates.length > 0) {
    console.log('  Example: same player, same stat, same day, different lines:');
    for (const [key, picks] of duplicates.slice(0, 5)) {
      const [name, stat] = key.split('|');
      const lines = picks.map(p => `${p.line}@${p.odds}(${p.hit === true ? 'HIT' : p.hit === false ? 'MISS' : p.result || '?'})`).join(', ');
      console.log(`    ${name.padEnd(22)} ${stat.padEnd(12)} → ${lines}`);
    }
    console.log();

    // If we deduplicate (keep best line per combo), what's the HR?
    const deduped = [];
    for (const [_, picks] of Object.entries(playerDateCombos)) {
      if (picks.length === 1) {
        deduped.push(picks[0]);
      } else {
        // Keep the pick with highest green score, then best odds
        const best = picks.sort((a, b) => (b.green || 0) - (a.green || 0) || (a.odds || 0) - (b.odds || 0))[0];
        deduped.push(best);
      }
    }
    console.log(`  Deduped hit rate (best line per player+stat+date):`);
    console.log(row('Deduped', hr(deduped)));
    console.log(row('Original', hr(resolved)));
    console.log();
  }

  // ══════════════════════════════════════════════════════════════
  // D) FAILURE CLUSTERING
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  D) FAILURE ARCHETYPES (common patterns in misses)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Define failure archetypes
  const archetypes = [
    {
      name: 'Over pick, player scored 0',
      filter: p => p.dir === 'over' && p.actualStat === 0 && p.hit === false,
    },
    {
      name: 'Over pick vs top-10 defense',
      filter: p => p.dir === 'over' && p.defRank && p.defRank <= 10 && p.hit === false,
    },
    {
      name: 'Under pick, player exploded (>2x line)',
      filter: p => p.dir === 'under' && p.actualStat != null && p.actualStat > p.line * 2 && p.hit === false,
    },
    {
      name: 'High green (4-5) but missed',
      filter: p => (p.green >= 4) && p.hit === false,
    },
    {
      name: 'High L10% (≥80) but missed',
      filter: p => p.l10 >= 80 && p.hit === false,
    },
    {
      name: 'Combo stat miss (inflated variance)',
      filter: p => isCombo(p.statType || p.stat) && p.hit === false,
    },
    {
      name: 'Tight odds (-100 to -130) miss',
      filter: p => p.odds != null && Math.abs(p.odds) <= 130 && p.hit === false,
    },
    {
      name: 'Low avg (avg < line) but picked Over',
      filter: p => p.dir === 'over' && p.avg != null && p.avg < p.line && p.hit === false,
    },
    {
      name: 'High avg (avg > line) but picked Under',
      filter: p => p.dir === 'under' && p.avg != null && p.avg > p.line && p.hit === false,
    },
    {
      name: 'Goblin odds miss (-400+)',
      filter: p => p.odds != null && Math.abs(p.odds) >= 400 && p.hit === false,
    },
  ];

  for (const arch of archetypes) {
    const matching = allPicks.filter(arch.filter);
    const pct = misses.length > 0 ? ((matching.length / misses.length) * 100).toFixed(1) : '0';
    console.log(`  ${arch.name.padEnd(45)} ${String(matching.length).padStart(4)} picks  (${pct}% of all misses)`);
  }
  console.log();

  // Now test: what if we had KILLED picks matching these patterns?
  console.log('  Impact analysis — if we had filtered these patterns pre-game:');
  console.log();
  const killRules = [
    {
      name: 'Kill: avg < line on Over picks',
      filter: p => p.dir === 'over' && p.avg != null && p.avg < p.line,
    },
    {
      name: 'Kill: Over vs top-5 defense',
      filter: p => p.dir === 'over' && p.defRank && p.defRank <= 5,
    },
    {
      name: 'Kill: green ≤ 3',
      filter: p => (p.green ?? 99) <= 3,
    },
    {
      name: 'Kill: tight odds (-100 to -130)',
      filter: p => p.odds != null && Math.abs(p.odds) >= 100 && Math.abs(p.odds) <= 130,
    },
    {
      name: 'Kill: 3PT from stack',
      filter: p => p.pipeline === 'stack' && ['threes', 'threepointersmade'].includes(normalizeStatType(p.statType || p.stat)),
    },
  ];

  for (const rule of killRules) {
    const killed = resolved.filter(rule.filter);
    const remaining = resolved.filter(p => !rule.filter(p));
    const killedHr = hr(killed);
    const remainingHr = hr(remaining);
    console.log(`  ${rule.name}`);
    console.log(`    Would remove: ${killed.length} picks (HR of removed: ${killedHr.rate}%)`);
    console.log(`    Remaining:    ${remaining.length} picks (HR: ${remainingHr.rate}%)`);
    console.log(`    Net effect:   ${(parseFloat(remainingHr.rate) - parseFloat(hr(resolved).rate)).toFixed(1)}pp improvement`);
    console.log();
  }

  // Stacked kill rules (cumulative)
  console.log('  Cumulative filter impact (applying rules in order):');
  let filteredSet = [...resolved];
  const cumulativeRules = [
    { name: '+ Kill green ≤ 3', filter: p => (p.green ?? 99) <= 3 },
    { name: '+ Kill 3PT stack', filter: p => p.pipeline === 'stack' && ['threes', 'threepointersmade'].includes(normalizeStatType(p.statType || p.stat)) },
    { name: '+ Kill avg < line on Over', filter: p => p.dir === 'over' && p.avg != null && p.avg < p.line },
  ];

  console.log(row('  Baseline', hr(filteredSet)));
  for (const rule of cumulativeRules) {
    filteredSet = filteredSet.filter(p => !rule.filter(p));
    console.log(row(`  ${rule.name}`, hr(filteredSet)));
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // E) L10 HIT RATE PARADOX
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  E) L10 HIT RATE PARADOX (L10 < 50% = 71.2% actual HR?)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const lowL10 = resolved.filter(p => p.l10 != null && p.l10 < 50);
  console.log(`  L10 < 50% picks: ${lowL10.length}`);
  console.log(`  Direction breakdown:`);
  const lowL10Over = lowL10.filter(p => p.dir === 'over');
  const lowL10Under = lowL10.filter(p => p.dir === 'under');
  console.log(row('  L10 < 50% + Over', hr(lowL10Over)));
  console.log(row('  L10 < 50% + Under', hr(lowL10Under)));
  console.log();

  // What does L10 actually represent?
  console.log('  Interpretation check — what does L10 mean per direction?');
  console.log('  (l10 = % of L10 games that hit the OVER on the line)');
  console.log();

  // When L10 < 50 and dir=under, it means player goes UNDER the line >50% of time → makes sense
  // When L10 < 50 and dir=over, it means player rarely hits over → questionable pick!
  console.log('  L10 < 50% + Over direction picks (picking Over when player rarely goes over):');
  console.log(`    Count: ${lowL10Over.length}`);
  if (lowL10Over.length > 0) {
    console.log(`    These are CONTRADICTORY picks. HR: ${hr(lowL10Over).rate}%`);
    console.log('    Samples:');
    for (const p of lowL10Over.filter(p => p.hit != null).slice(0, 5)) {
      console.log(`      ${p.name.padEnd(22)} ${normalizeStatType(p.statType || p.stat).padEnd(10)} over ${p.line} (L10=${p.l10}%) actual=${p.actualStat} ${p.hit ? 'HIT' : 'MISS'}`);
    }
  }
  console.log();

  // Verify: L10 is directional hit rate (% of L10 hitting OVER the line)
  // So for Under picks, low L10 = player rarely goes Over = good signal for Under
  console.log('  L10 < 50% + Under direction (player rarely goes over → pick under):');
  console.log(`    Count: ${lowL10Under.length}`);
  console.log(`    HR: ${hr(lowL10Under).rate}% — this makes sense (low over rate supports under)`);
  console.log();

  // ══════════════════════════════════════════════════════════════
  // F) DEFENSE RANK CORRELATION
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  F) DEFENSE RANK CORRELATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const withDef = resolved.filter(p => p.defRank != null);
  console.log(`  Picks with defense rank data: ${withDef.length}`);
  console.log();

  if (withDef.length > 0) {
    const defBrackets = [
      { label: 'Top 5 defense (1-5)', min: 1, max: 6 },
      { label: 'Good defense (6-10)', min: 6, max: 11 },
      { label: 'Mid defense (11-20)', min: 11, max: 21 },
      { label: 'Weak defense (21-30)', min: 21, max: 31 },
    ];

    for (const bracket of defBrackets) {
      const picks = withDef.filter(p => p.defRank >= bracket.min && p.defRank < bracket.max);
      if (picks.length === 0) continue;
      console.log(row(bracket.label, hr(picks)));
      // Break by direction
      const over = picks.filter(p => p.dir === 'over');
      const under = picks.filter(p => p.dir === 'under');
      if (over.length > 0) console.log(row(`  → Over`, hr(over)));
      if (under.length > 0) console.log(row(`  → Under`, hr(under)));
    }
    console.log();

    // Special: Over picks against top-10 defense
    const overTopDef = withDef.filter(p => p.dir === 'over' && p.defRank <= 10);
    const underTopDef = withDef.filter(p => p.dir === 'under' && p.defRank <= 10);
    console.log('  Against top-10 defense:');
    console.log(row('  Over (risky)', hr(overTopDef)));
    console.log(row('  Under (aligned)', hr(underTopDef)));
    console.log();
  }

  // ══════════════════════════════════════════════════════════════
  // G) CLOSE MISSES PATTERNS
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  G) CLOSE MISSES — WHERE WE ALMOST GOT IT RIGHT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const closeMisses = misses.filter(p => p.actualStat != null && Math.abs(p.actualStat - p.line) <= 2);
  console.log(`  Close misses (within 2 units): ${closeMisses.length} / ${misses.length} (${((closeMisses.length/misses.length)*100).toFixed(1)}%)`);
  console.log();

  // By stat type
  console.log('  Close misses by stat type:');
  const closeByType = {};
  for (const p of closeMisses) {
    const st = normalizeStatType(p.statType || p.stat);
    if (!closeByType[st]) closeByType[st] = 0;
    closeByType[st]++;
  }
  const missByType = {};
  for (const p of misses) {
    const st = normalizeStatType(p.statType || p.stat);
    if (!missByType[st]) missByType[st] = 0;
    missByType[st]++;
  }
  for (const [type, count] of Object.entries(closeByType).sort((a, b) => b[1] - a[1])) {
    const total = missByType[type] || 1;
    console.log(`    ${type.padEnd(25)} ${String(count).padStart(4)} / ${String(total).padStart(4)} misses are close (${((count/total)*100).toFixed(1)}%)`);
  }
  console.log();

  // By pipeline
  console.log('  Close miss rate by pipeline:');
  const closeMissEdge = closeMisses.filter(p => p.pipeline === 'edge');
  const closeMissStack = closeMisses.filter(p => p.pipeline === 'stack');
  const missEdge = misses.filter(p => p.pipeline === 'edge');
  const missStack = misses.filter(p => p.pipeline === 'stack');
  console.log(`    Edge:  ${closeMissEdge.length}/${missEdge.length} misses are close (${missEdge.length > 0 ? ((closeMissEdge.length/missEdge.length)*100).toFixed(1) : 'N/A'}%)`);
  console.log(`    Stack: ${closeMissStack.length}/${missStack.length} misses are close (${missStack.length > 0 ? ((closeMissStack.length/missStack.length)*100).toFixed(1) : 'N/A'}%)`);
  console.log();

  // ══════════════════════════════════════════════════════════════
  // H) EDGE betScore EFFECTIVENESS
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  H) EDGE betScore EFFECTIVENESS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const edgeWithScore = allEdge.filter(p => p.betScore != null);
  if (edgeWithScore.length > 0) {
    const scoreBrackets = [
      { label: 'betScore ≥ 80', min: 80, max: Infinity },
      { label: 'betScore 60-79', min: 60, max: 80 },
      { label: 'betScore 40-59', min: 40, max: 60 },
      { label: 'betScore 20-39', min: 20, max: 40 },
      { label: 'betScore < 20', min: -Infinity, max: 20 },
    ];
    for (const bracket of scoreBrackets) {
      const picks = edgeWithScore.filter(p => p.betScore >= bracket.min && p.betScore < bracket.max);
      if (picks.length > 0) console.log(row(bracket.label, hr(picks)));
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // I) STACK parlayEdge EFFECTIVENESS
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  I) STACK parlayEdge EFFECTIVENESS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const stackWithEdge = allStack.filter(p => p.edge != null);
  if (stackWithEdge.length > 0) {
    const edgeBrackets = [
      { label: 'parlayEdge ≥ 0.25', min: 0.25, max: Infinity },
      { label: 'parlayEdge 0.15-0.24', min: 0.15, max: 0.25 },
      { label: 'parlayEdge 0.10-0.14', min: 0.10, max: 0.15 },
      { label: 'parlayEdge 0.05-0.09', min: 0.05, max: 0.10 },
      { label: 'parlayEdge < 0.05', min: -Infinity, max: 0.05 },
    ];
    for (const bracket of edgeBrackets) {
      const picks = stackWithEdge.filter(p => p.edge >= bracket.min && p.edge < bracket.max);
      if (picks.length > 0) console.log(row(bracket.label, hr(picks)));
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // J) PARLAY SLIP FAILURE ANATOMY
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  J) PARLAY SLIP FAILURE ANATOMY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const parlaySnap = await db.collection('parlayHistory')
    .orderBy(admin.firestore.FieldPath.documentId()).get();

  const allSlips = [];
  for (const doc of parlaySnap.docs) {
    const data = doc.data();
    if (!data.resultsRecorded) continue;
    for (const slip of (data.slips || [])) {
      allSlips.push({ ...slip, date: doc.id });
    }
  }

  const resolvedSlips = allSlips.filter(s => s.hit != null);
  const failedSlips = resolvedSlips.filter(s => s.hit === false);
  const hitSlips = resolvedSlips.filter(s => s.hit === true);

  console.log(`  Total resolved slips: ${resolvedSlips.length}`);
  console.log(`  Hit: ${hitSlips.length} | Failed: ${failedSlips.length}`);
  console.log();

  // How many legs fail per failed slip?
  if (failedSlips.length > 0) {
    const failedLegCounts = {};
    for (const slip of failedSlips) {
      const legs = slip.legs || [];
      const missed = legs.filter(l => l.hit === false).length;
      failedLegCounts[missed] = (failedLegCounts[missed] || 0) + 1;
    }
    console.log('  In failed slips, how many legs missed?');
    for (const [count, freq] of Object.entries(failedLegCounts).sort((a, b) => a[0] - b[0])) {
      console.log(`    ${count} leg(s) missed: ${freq} slips (${((freq/failedSlips.length)*100).toFixed(1)}%)`);
    }
    console.log();

    // What stat types cause slip failures?
    const slipFailStats = {};
    for (const slip of failedSlips) {
      for (const leg of (slip.legs || [])) {
        if (leg.hit === false) {
          const st = normalizeStatType(leg.statType || leg.stat);
          slipFailStats[st] = (slipFailStats[st] || 0) + 1;
        }
      }
    }
    console.log('  Stat types causing slip failures:');
    for (const [type, count] of Object.entries(slipFailStats).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(25)} ${count} failed legs`);
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // K) TREND SIGNAL EFFECTIVENESS
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  K) TREND SIGNAL EFFECTIVENESS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const withTrend = resolved.filter(p => p.trend != null);
  if (withTrend.length > 0) {
    // Trend aligned = positive trend + Over, or negative trend + Under
    const aligned = withTrend.filter(p =>
      (p.trend > 0 && p.dir === 'over') || (p.trend < 0 && p.dir === 'under')
    );
    const misaligned = withTrend.filter(p =>
      (p.trend > 0 && p.dir === 'under') || (p.trend < 0 && p.dir === 'over')
    );
    const neutral = withTrend.filter(p => p.trend === 0);

    console.log(row('Trend aligned with pick', hr(aligned)));
    console.log(row('Trend contradicts pick', hr(misaligned)));
    if (neutral.length > 0) console.log(row('Neutral trend (0)', hr(neutral)));
    console.log();

    // Trend magnitude
    const trendBrackets = [
      { label: 'Strong positive trend (>3)', filter: p => p.trend > 3 },
      { label: 'Moderate positive (1-3)', filter: p => p.trend >= 1 && p.trend <= 3 },
      { label: 'Flat (-1 to 1)', filter: p => p.trend > -1 && p.trend < 1 },
      { label: 'Moderate negative (-3 to -1)', filter: p => p.trend <= -1 && p.trend >= -3 },
      { label: 'Strong negative trend (<-3)', filter: p => p.trend < -3 },
    ];
    for (const bracket of trendBrackets) {
      const picks = withTrend.filter(bracket.filter);
      if (picks.length > 0) console.log(row(bracket.label, hr(picks)));
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // L) HOME / AWAY SPLIT
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  L) HOME / AWAY SPLIT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const homePicks = resolved.filter(p => p.isHome === true);
  const awayPicks = resolved.filter(p => p.isHome === false);
  console.log(row('Home', hr(homePicks)));
  console.log(row('Away', hr(awayPicks)));
  console.log();

  // Home + Over vs Home + Under
  console.log(row('Home + Over', hr(homePicks.filter(p => p.dir === 'over'))));
  console.log(row('Home + Under', hr(homePicks.filter(p => p.dir === 'under'))));
  console.log(row('Away + Over', hr(awayPicks.filter(p => p.dir === 'over'))));
  console.log(row('Away + Under', hr(awayPicks.filter(p => p.dir === 'under'))));
  console.log();

  // ══════════════════════════════════════════════════════════════
  // M) BOOKMAKER PERFORMANCE
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  M) HIT RATE BY BOOKMAKER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const bookmakers = [...new Set(resolved.map(p => p.bk).filter(Boolean))].sort();
  for (const bk of bookmakers) {
    const picks = resolved.filter(p => p.bk === bk);
    if (picks.length >= 10) console.log(row(bk, hr(picks)));
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // N) SEASON HIT RATE vs ACTUAL
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  N) SEASON HIT RATE (szn) vs ACTUAL OUTCOME');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const withSzn = resolved.filter(p => p.szn != null);
  const sznBrackets = [
    { label: 'Season ≥ 80%', min: 80, max: 101 },
    { label: 'Season 70-79%', min: 70, max: 80 },
    { label: 'Season 60-69%', min: 60, max: 70 },
    { label: 'Season 50-59%', min: 50, max: 60 },
    { label: 'Season < 50%', min: 0, max: 50 },
  ];
  for (const bracket of sznBrackets) {
    const picks = withSzn.filter(p => p.szn >= bracket.min && p.szn < bracket.max);
    if (picks.length > 0) console.log(row(bracket.label, hr(picks)));
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // O) AVG vs LINE GAP ANALYSIS
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  O) AVG vs LINE GAP (how far is the avg from the line?)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const withAvgLine = resolved.filter(p => p.avg != null && p.line != null);
  if (withAvgLine.length > 0) {
    // Directional gap: positive = avg supports the pick direction
    const overPicks = withAvgLine.filter(p => p.dir === 'over');
    const underPicks = withAvgLine.filter(p => p.dir === 'under');

    const gapBrackets = [
      { label: 'Avg supports pick by ≥ 5 units', filter: p => {
        const gap = p.dir === 'over' ? p.avg - p.line : p.line - p.avg;
        return gap >= 5;
      }},
      { label: 'Avg supports pick by 2-4.9', filter: p => {
        const gap = p.dir === 'over' ? p.avg - p.line : p.line - p.avg;
        return gap >= 2 && gap < 5;
      }},
      { label: 'Avg supports pick by 0.5-1.9', filter: p => {
        const gap = p.dir === 'over' ? p.avg - p.line : p.line - p.avg;
        return gap >= 0.5 && gap < 2;
      }},
      { label: 'Avg barely supports (0 to 0.5)', filter: p => {
        const gap = p.dir === 'over' ? p.avg - p.line : p.line - p.avg;
        return gap >= 0 && gap < 0.5;
      }},
      { label: 'Avg CONTRADICTS pick (wrong side)', filter: p => {
        const gap = p.dir === 'over' ? p.avg - p.line : p.line - p.avg;
        return gap < 0;
      }},
    ];

    for (const bracket of gapBrackets) {
      const picks = withAvgLine.filter(bracket.filter);
      if (picks.length > 0) console.log(row(bracket.label, hr(picks)));
    }
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE 2 ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
})();
