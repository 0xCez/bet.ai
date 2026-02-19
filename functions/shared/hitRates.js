/**
 * shared/hitRates.js — Hit rate calculation (pure functions)
 *
 * Reusable by both EdgeBoard and Parlay Stack pipelines.
 */

/**
 * Extract the numeric stat value from a game log entry.
 */
function getStatValue(game, statType) {
  const pts = game.points || 0;
  const reb = game.totReb || 0;
  const ast = game.assists || 0;
  const stl = game.steals || 0;
  const blk = game.blocks || 0;
  const tov = game.turnovers || 0;
  const tpm = game.tpm || 0;

  switch (statType.toLowerCase()) {
    case 'points': return pts;
    case 'rebounds': return reb;
    case 'assists': return ast;
    case 'steals': return stl;
    case 'blocks': return blk;
    case 'turnovers': return tov;
    case 'threepointersmade': return tpm;
    case 'points+rebounds': return pts + reb;
    case 'points+assists': return pts + ast;
    case 'rebounds+assists': return reb + ast;
    case 'points+rebounds+assists': return pts + reb + ast;
    case 'blocks+steals': return blk + stl;
    default: return null;
  }
}

/**
 * Calculate hit rates for L10 and full season.
 * "Hit" = value > line (for Over props).
 *
 * @param {Array} gameLogs - Raw game logs from API-Sports (sorted most recent first)
 * @param {string} statType - Internal stat type key
 * @param {number} line - The line to check against
 * @returns {{ l10: {over, total, pct}, season: {over, total, pct} }}
 */
function calculateHitRates(gameLogs, statType, line) {
  const l10 = gameLogs.slice(0, 10);

  let l10Over = 0, l10Total = 0;
  for (const g of l10) {
    const val = getStatValue(g, statType);
    if (val !== null) { l10Total++; if (val > line) l10Over++; }
  }

  let seasonOver = 0, seasonTotal = 0;
  for (const g of gameLogs) {
    const val = getStatValue(g, statType);
    if (val !== null) { seasonTotal++; if (val > line) seasonOver++; }
  }

  return {
    l10: { over: l10Over, total: l10Total, pct: l10Total > 0 ? Math.round((l10Over / l10Total) * 100) : 0 },
    season: { over: seasonOver, total: seasonTotal, pct: seasonTotal > 0 ? Math.round((seasonOver / seasonTotal) * 100) : 0 },
  };
}

/**
 * Calculate L10 average for a stat from raw game logs.
 */
function getL10Average(gameLogs, statType) {
  const l10 = gameLogs.slice(0, 10);
  let sum = 0, count = 0;
  for (const g of l10) {
    const val = getStatValue(g, statType);
    if (val !== null) { sum += val; count++; }
  }
  return count > 0 ? parseFloat((sum / count).toFixed(1)) : null;
}

/**
 * Calculate trend from raw game logs: L3 avg - L10 avg.
 * Positive = trending up, negative = trending down.
 */
function getTrend(gameLogs, statType) {
  const l3 = gameLogs.slice(0, 3);
  const l10 = gameLogs.slice(0, 10);

  let l3Sum = 0, l3Count = 0;
  for (const g of l3) {
    const val = getStatValue(g, statType);
    if (val !== null) { l3Sum += val; l3Count++; }
  }

  let l10Sum = 0, l10Count = 0;
  for (const g of l10) {
    const val = getStatValue(g, statType);
    if (val !== null) { l10Sum += val; l10Count++; }
  }

  if (l3Count === 0 || l10Count === 0) return 0;
  return parseFloat(((l3Sum / l3Count) - (l10Sum / l10Count)).toFixed(1));
}

module.exports = { getStatValue, calculateHitRates, getL10Average, getTrend };
