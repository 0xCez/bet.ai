/**
 * shared/qualityGates.js — Data-driven kill rules from Phase 2 analysis.
 *
 * Stat-type-aware thresholds based on empirical hit rate analysis:
 *   - Points: 2.0   (line ~25.5, so 2 units is small)
 *   - Rebounds: 1.5  (line ~8.5)
 *   - Assists: 1.5   (line ~6.5)
 *   - 3PT: 0.5       (line ~1.5, so 1 unit is a LOT)
 *   - Combos: 2.0-3.0
 *   - Low-volume (STL/BLK): 0.3
 */

const AVG_GAP_THRESHOLDS = {
  'points': 2.0,
  'rebounds': 1.5,
  'assists': 1.5,
  'threePointersMade': 0.5,
  'turnovers': 0.5,
  'steals': 0.3,
  'blocks': 0.3,
  'points+rebounds+assists': 3.0,
  'points+rebounds': 2.0,
  'points+assists': 2.0,
  'rebounds+assists': 1.5,
  'blocks+steals': 0.5,
  'steals+blocks': 0.5,
};

/**
 * Green score floor gate.
 * Phase 2 finding: green ≤ 3 → 55-63% HR; green 4+ → 69-71% HR.
 */
function passesGreenScoreFloor(greenScore, pipeline) {
  const floor = pipeline === 'edge' ? 4 : 3;
  return {
    pass: greenScore >= floor,
    reason: greenScore >= floor
      ? 'green_ok'
      : `green_${greenScore}_below_floor_${floor}`,
  };
}

/**
 * Avg gap filter — stat-type-aware.
 * Phase 2 finding: avg supports by ≥5 units → 79.2% HR.
 * We use lower thresholds scaled per stat type granularity.
 */
function passesAvgGapFilter(l10Avg, line, prediction, statType) {
  if (l10Avg == null || line == null) return { pass: true, reason: 'no_avg_data' };
  const threshold = AVG_GAP_THRESHOLDS[statType] || 1.0;
  const isOver = (prediction || '').toLowerCase() === 'over';
  const gap = isOver ? l10Avg - line : line - l10Avg;

  return {
    pass: gap >= threshold,
    reason: gap >= threshold
      ? `avg_gap_${gap.toFixed(1)}_ok`
      : `avg_gap_${gap.toFixed(1)}_below_${threshold}`,
  };
}

module.exports = {
  AVG_GAP_THRESHOLDS,
  passesGreenScoreFloor,
  passesAvgGapFilter,
};
