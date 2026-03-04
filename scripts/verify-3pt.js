#!/usr/bin/env node
/**
 * verify-3pt.js — Deep verification of 3PT picks in picksHistory
 *
 * For BOTH pipelines (stack and edge), shows:
 *   1. Total count of 3PT picks
 *   2. Count by direction (over vs under)
 *   3. Hit rate by direction
 *   4. Count where actualStat === 0
 *   5. 10 sample picks per direction
 *   6. All distinct line values used
 */

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'betai-f9176' });
const db = admin.firestore();

// ── Helpers ──
function is3PT(statType) {
  if (!statType) return false;
  const t = statType.toLowerCase();
  return t.includes('3') || t.includes('three') || t.includes('3pt');
}

function hr(picks) {
  const r = picks.filter(p => p.hit === true || p.hit === false);
  const h = r.filter(p => p.hit === true);
  return {
    total: r.length,
    hits: h.length,
    rate: r.length > 0 ? (h.length / r.length * 100).toFixed(1) : 'N/A',
  };
}

function showSamples(picks, label, n = 10) {
  const samples = picks.slice(0, n);
  if (samples.length === 0) {
    console.log(`  No samples for ${label}`);
    return;
  }
  console.log(`  ${label} — ${n} samples (of ${picks.length} total):`);
  console.log(`  ${'NAME'.padEnd(24)} ${'STAT'.padEnd(22)} ${'DIR'.padEnd(6)} ${'LINE'.padEnd(8)} ${'ACTUAL'.padEnd(8)} ${'HIT'.padEnd(6)} ${'RESULT'.padEnd(10)} DATE`);
  console.log(`  ${'-'.repeat(110)}`);
  for (const p of samples) {
    const stat = (p.statType || p.stat || '???');
    const name = (p.name || '???').padEnd(24);
    const dir = (p.dir || '???').padEnd(6);
    const line = String(p.line ?? '???').padEnd(8);
    const actual = String(p.actualStat ?? '???').padEnd(8);
    const hit = String(p.hit ?? '???').padEnd(6);
    const result = String(p.result ?? '???').padEnd(10);
    const date = p.date || '???';
    console.log(`  ${name} ${stat.padEnd(22)} ${dir} ${line} ${actual} ${hit} ${result} ${date}`);
  }
  console.log();
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  3PT PICK VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Load all picksHistory docs
  const picksSnap = await db.collection('picksHistory')
    .orderBy(admin.firestore.FieldPath.documentId()).get();

  const allEdge = [];
  const allStack = [];

  for (const doc of picksSnap.docs) {
    const data = doc.data();
    const dateStr = doc.id;
    // Include ALL docs, not just resultsRecorded (so we can see unresolved too)
    const edge = (data.edge || []).map(p => ({ ...p, date: dateStr, pipeline: 'edge', resultsRecorded: !!data.resultsRecorded }));
    const stack = (data.stack || []).map(p => ({ ...p, date: dateStr, pipeline: 'stack', resultsRecorded: !!data.resultsRecorded }));
    allEdge.push(...edge);
    allStack.push(...stack);
  }

  const allPicks = [...allEdge, ...allStack];
  console.log(`  Total picks loaded: ${allPicks.length} (edge: ${allEdge.length}, stack: ${allStack.length})\n`);

  // ── Filter for 3PT picks ──
  const threeEdge = allEdge.filter(p => is3PT(p.statType || p.stat));
  const threeStack = allStack.filter(p => is3PT(p.statType || p.stat));
  const allThree = [...threeEdge, ...threeStack];

  console.log(`  Total 3PT picks (any pipeline): ${allThree.length}`);
  console.log(`    Edge 3PT: ${threeEdge.length}`);
  console.log(`    Stack 3PT: ${threeStack.length}`);
  console.log();

  // Show all unique statType values for 3PT picks
  const statTypes3PT = [...new Set(allThree.map(p => p.statType || p.stat))].sort();
  console.log(`  Unique statType values matched as 3PT: ${JSON.stringify(statTypes3PT)}`);
  console.log();

  // ══════════════════════════════════════════════════════════════
  // STACK 3PT BREAKDOWN
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  STACK PIPELINE — 3PT PICKS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1) Total count
  console.log(`\n  1) Total 3PT stack picks: ${threeStack.length}`);

  // 2) Count by direction
  const stackOver = threeStack.filter(p => p.dir === 'over');
  const stackUnder = threeStack.filter(p => p.dir === 'under');
  const stackOther = threeStack.filter(p => p.dir !== 'over' && p.dir !== 'under');
  console.log(`\n  2) By direction:`);
  console.log(`     Over:  ${stackOver.length}`);
  console.log(`     Under: ${stackUnder.length}`);
  if (stackOther.length > 0) console.log(`     Other: ${stackOther.length} — dirs: ${[...new Set(stackOther.map(p => p.dir))]}`);

  // 3) Hit rate by direction
  const stackOverHR = hr(stackOver);
  const stackUnderHR = hr(stackUnder);
  console.log(`\n  3) Hit rate by direction:`);
  console.log(`     Over:  ${stackOverHR.hits}/${stackOverHR.total} = ${stackOverHR.rate}%`);
  console.log(`     Under: ${stackUnderHR.hits}/${stackUnderHR.total} = ${stackUnderHR.rate}%`);
  console.log(`     All:   ${hr(threeStack).hits}/${hr(threeStack).total} = ${hr(threeStack).rate}%`);

  // 4) Count where actualStat === 0
  const stackZero = threeStack.filter(p => p.actualStat === 0);
  const stackNull = threeStack.filter(p => p.actualStat == null);
  console.log(`\n  4) actualStat === 0:  ${stackZero.length} picks`);
  console.log(`     actualStat null/undefined: ${stackNull.length} picks`);

  // breakdown of zero by direction
  const stackZeroOver = stackZero.filter(p => p.dir === 'over');
  const stackZeroUnder = stackZero.filter(p => p.dir === 'under');
  console.log(`     Zero + Over:  ${stackZeroOver.length}`);
  console.log(`     Zero + Under: ${stackZeroUnder.length}`);

  // 5) 10 sample picks per direction
  console.log(`\n  5) Sample picks:`);
  showSamples(stackOver, 'Stack 3PT OVER', 10);
  showSamples(stackUnder, 'Stack 3PT UNDER', 10);

  // 6) Line values used
  const stackLines = [...new Set(threeStack.map(p => p.line))].sort((a, b) => a - b);
  console.log(`  6) Line values used in Stack 3PT: ${JSON.stringify(stackLines)}`);
  console.log(`     Line distribution:`);
  for (const line of stackLines) {
    const count = threeStack.filter(p => p.line === line).length;
    const lineHR = hr(threeStack.filter(p => p.line === line));
    console.log(`       line=${String(line).padEnd(6)} count=${String(count).padEnd(5)} HR=${lineHR.hits}/${lineHR.total}=${lineHR.rate}%`);
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // EDGE 3PT BREAKDOWN
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  EDGE PIPELINE — 3PT PICKS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1) Total count
  console.log(`\n  1) Total 3PT edge picks: ${threeEdge.length}`);

  // 2) Count by direction
  const edgeOver = threeEdge.filter(p => p.dir === 'over');
  const edgeUnder = threeEdge.filter(p => p.dir === 'under');
  const edgeOther = threeEdge.filter(p => p.dir !== 'over' && p.dir !== 'under');
  console.log(`\n  2) By direction:`);
  console.log(`     Over:  ${edgeOver.length}`);
  console.log(`     Under: ${edgeUnder.length}`);
  if (edgeOther.length > 0) console.log(`     Other: ${edgeOther.length} — dirs: ${[...new Set(edgeOther.map(p => p.dir))]}`);

  // 3) Hit rate by direction
  const edgeOverHR = hr(edgeOver);
  const edgeUnderHR = hr(edgeUnder);
  console.log(`\n  3) Hit rate by direction:`);
  console.log(`     Over:  ${edgeOverHR.hits}/${edgeOverHR.total} = ${edgeOverHR.rate}%`);
  console.log(`     Under: ${edgeUnderHR.hits}/${edgeUnderHR.total} = ${edgeUnderHR.rate}%`);
  console.log(`     All:   ${hr(threeEdge).hits}/${hr(threeEdge).total} = ${hr(threeEdge).rate}%`);

  // 4) Count where actualStat === 0
  const edgeZero = threeEdge.filter(p => p.actualStat === 0);
  const edgeNull = threeEdge.filter(p => p.actualStat == null);
  console.log(`\n  4) actualStat === 0:  ${edgeZero.length} picks`);
  console.log(`     actualStat null/undefined: ${edgeNull.length} picks`);

  const edgeZeroOver = edgeZero.filter(p => p.dir === 'over');
  const edgeZeroUnder = edgeZero.filter(p => p.dir === 'under');
  console.log(`     Zero + Over:  ${edgeZeroOver.length}`);
  console.log(`     Zero + Under: ${edgeZeroUnder.length}`);

  // 5) 10 sample picks per direction
  console.log(`\n  5) Sample picks:`);
  showSamples(edgeOver, 'Edge 3PT OVER', 10);
  showSamples(edgeUnder, 'Edge 3PT UNDER', 10);

  // 6) Line values used
  const edgeLines = [...new Set(threeEdge.map(p => p.line))].sort((a, b) => a - b);
  console.log(`  6) Line values used in Edge 3PT: ${JSON.stringify(edgeLines)}`);
  console.log(`     Line distribution:`);
  for (const line of edgeLines) {
    const count = threeEdge.filter(p => p.line === line).length;
    const lineHR = hr(threeEdge.filter(p => p.line === line));
    console.log(`       line=${String(line).padEnd(6)} count=${String(count).padEnd(5)} HR=${lineHR.hits}/${lineHR.total}=${lineHR.rate}%`);
  }
  console.log();

  // ══════════════════════════════════════════════════════════════
  // EXTRA: Show all distinct statType/stat field values across ALL picks
  // ══════════════════════════════════════════════════════════════
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  BONUS: All distinct statType values in entire picksHistory');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const allStatTypes = {};
  for (const p of allPicks) {
    const st = p.statType || p.stat || '(missing)';
    allStatTypes[st] = (allStatTypes[st] || 0) + 1;
  }
  for (const [st, count] of Object.entries(allStatTypes).sort((a, b) => b[1] - a[1])) {
    const marker = is3PT(st) ? ' ← 3PT' : '';
    console.log(`    ${st.padEnd(35)} ${String(count).padStart(5)} picks${marker}`);
  }
  console.log();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');

  process.exit(0);
})();
