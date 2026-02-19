/**
 * shared/greenScore.js — Green Score + Sanity Filter + Trend
 *
 * Pure functions, reusable by EdgeBoard and Parlay Stack pipelines.
 */

/**
 * Temperature scaling: prob → logit → divide by T → re-sigmoid.
 * T > 1 softens extreme probabilities toward 50%.
 * T = 2.0: 95% → ~82%, 5% → ~18%, 60% → ~55%.
 */
function calibrateProbability(prob, T = 2.0) {
  const p = Math.max(0.001, Math.min(0.999, prob));
  const logit = Math.log(p / (1 - p));
  return 1 / (1 + Math.exp(-logit / T));
}

/**
 * Unified trend: L3 avg minus L10 avg for a stat type.
 * Positive = trending up, negative = trending down.
 */
function getTrendForStat(features, statType) {
  const st = statType.toLowerCase();
  const t = {
    pts: features.TREND_PTS || 0,
    reb: features.TREND_REB || 0,
    ast: features.TREND_AST || 0,
  };
  switch (st) {
    case 'points': return t.pts;
    case 'rebounds': return t.reb;
    case 'assists': return t.ast;
    case 'steals': return (features.L3_STL || 0) - (features.L10_STL || 0);
    case 'blocks': return (features.L3_BLK || 0) - (features.L10_BLK || 0);
    case 'turnovers': return (features.L3_TOV || 0) - (features.L10_TOV || 0);
    case 'threepointersmade': return (features.L3_FG3M || 0) - (features.L10_FG3M || 0);
    case 'points+rebounds': return t.pts + t.reb;
    case 'points+assists': return t.pts + t.ast;
    case 'rebounds+assists': return t.reb + t.ast;
    case 'points+rebounds+assists': return t.pts + t.reb + t.ast;
    case 'blocks+steals': return ((features.L3_BLK || 0) - (features.L10_BLK || 0)) + ((features.L3_STL || 0) - (features.L10_STL || 0));
    default: return 0;
  }
}

/**
 * Green Score: count how many of 5 signals support the prediction (0-5).
 *
 * Signals:
 *   1. Avg on right side of line
 *   2. L10 hit rate supports direction (≥60% for Over, ≤40% for Under)
 *   3. Season hit rate supports direction
 *   4. Opponent defense rank supports direction (>15 for Over, ≤15 for Under)
 *   5. Odds favor predicted side (negative odds = market agrees)
 *
 * @returns {{ score: number, signals: string[] }}
 */
function calculateGreenScore({ prediction, l10Avg, line, hitRates, opponentDefense, relevantOdds }) {
  const isOver = prediction === 'Over';
  let score = 0;
  const signals = [];

  // 1. Avg on right side of line
  if (l10Avg !== null && l10Avg !== undefined) {
    if ((isOver && l10Avg >= line) || (!isOver && l10Avg <= line)) {
      score++; signals.push('avg');
    }
  }

  // 2. L10 hit rate
  const l10Pct = hitRates?.l10?.pct;
  if (l10Pct != null) {
    if ((isOver && l10Pct >= 60) || (!isOver && l10Pct <= 40)) {
      score++; signals.push('l10');
    }
  }

  // 3. Season hit rate
  const seasonPct = hitRates?.season?.pct;
  if (seasonPct != null) {
    if ((isOver && seasonPct >= 60) || (!isOver && seasonPct <= 40)) {
      score++; signals.push('season');
    }
  }

  // 4. Opponent defense rank
  const defRank = opponentDefense?.rank;
  if (defRank != null) {
    if ((isOver && defRank > 15) || (!isOver && defRank <= 15)) {
      score++; signals.push('defense');
    }
  }

  // 5. Odds favor predicted side
  if (relevantOdds != null && relevantOdds < 0) {
    score++; signals.push('odds');
  }

  return { score, signals };
}

/**
 * Avg-gated sanity check:
 *
 *   • Avg on RIGHT side of line → PASS
 *   • Avg on WRONG side → need 2+ supporting signals to survive
 *
 * Supporting signals (when avg is wrong-side):
 *   1. Opponent defense rank — weak DEF (21-30) supports Over, strong (1-10) supports Under
 *   2. L10 hit rate — ≥60% over-rate supports Over, ≤40% supports Under
 *   3. Season hit rate — same thresholds
 *
 * @returns {{ pass: boolean, reason: string }}
 */
function passesSanityCheck({ prediction, l10Avg, line, hitRates, opponentDefense }) {
  if (l10Avg === null || l10Avg === undefined || line === 0) {
    return { pass: true, reason: 'insufficient_data' };
  }

  const isOver = prediction === 'Over';
  const avgOnRightSide = isOver ? l10Avg >= line : l10Avg <= line;

  if (avgOnRightSide) {
    return { pass: true, reason: 'avg_supports' };
  }

  // Avg on WRONG side → need 2+ supporting signals to override
  let supporting = 0;
  const details = [`avg ${l10Avg.toFixed(1)} on wrong side of line ${line}`];

  // Signal 1: Opponent defense rank
  const defRank = opponentDefense?.rank ?? null;
  if (defRank != null) {
    const defSupports = isOver ? defRank >= 21 : defRank <= 10;
    if (defSupports) {
      supporting++;
    } else {
      details.push(`DEF rank ${defRank} does not support`);
    }
  }

  // Signal 2: L10 hit rate
  const l10HitPct = hitRates?.l10?.pct ?? null;
  if (l10HitPct != null) {
    const l10Supports = isOver ? l10HitPct >= 60 : l10HitPct <= 40;
    if (l10Supports) {
      supporting++;
    } else {
      details.push(`L10 hit ${l10HitPct}% does not support`);
    }
  }

  // Signal 3: Season hit rate
  const seasonHitPct = hitRates?.season?.pct ?? null;
  if (seasonHitPct != null) {
    const seasonSupports = isOver ? seasonHitPct >= 60 : seasonHitPct <= 40;
    if (seasonSupports) {
      supporting++;
    } else {
      details.push(`Season hit ${seasonHitPct}% does not support`);
    }
  }

  if (supporting >= 2) {
    return { pass: true, reason: `avg wrong side but ${supporting}/3 signals support — override` };
  }

  return { pass: false, reason: `avg wrong side, only ${supporting}/3 support: ${details.join('; ')}` };
}

module.exports = {
  calibrateProbability,
  getTrendForStat,
  calculateGreenScore,
  passesSanityCheck,
};
