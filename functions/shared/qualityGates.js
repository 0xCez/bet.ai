/**
 * shared/qualityGates.js — Data-driven kill rules from Phase 2 analysis.
 *
 * Stat-type-aware thresholds — lowered in Phase 2.1 to increase pick volume
 * while maintaining quality through green score + ML model validation.
 * Books set lines near a player's actual average, so requiring large margins
 * above the line filters out most legitimate picks.
 */

const AVG_GAP_THRESHOLDS = {
  'points': 1.0,
  'rebounds': 1.0,
  'assists': 1.0,
  'threePointersMade': 0.5,
  'turnovers': 0.5,
  'steals': 0.3,
  'blocks': 0.3,
  'points+rebounds+assists': 2.0,
  'points+rebounds': 1.5,
  'points+assists': 1.5,
  'rebounds+assists': 1.0,
  'blocks+steals': 0.5,
  'steals+blocks': 0.5,
};

/**
 * Green score floor gate.
 * Phase 2 finding: green 3 → ~63% HR, green 4+ → 69-71% HR.
 * Lowered edge floor to 3 in Phase 2.1 — 63% still beats coin flip
 * and the ML model + other filters provide additional quality control.
 */
function passesGreenScoreFloor(greenScore, pipeline) {
  const floor = pipeline === 'edge' ? 3 : 3;
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
