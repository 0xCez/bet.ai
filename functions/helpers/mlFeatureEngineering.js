/**
 * ML Feature Engineering for NBA Props Predictions
 * Calculates all 88 features required by the Vertex AI CatBoost model
 * Based on API_DOCUMENTATION.md specification (lines 149-296)
 *
 * Feature Breakdown:
 * - 5 Categorical: prop_type, home_team, away_team, bookmaker, SEASON
 * - 3 Temporal: year, month, day_of_week
 * - 12 Last 3 Games (L3): PTS, REB, AST, MIN, FG_PCT, FG3M, FG3_PCT, STL, BLK, TOV, FGM, FGA
 * - 15 Last 10 Games (L10): Same as L3 + PTS/REB/AST standard deviations
 * - 5 Game Context: HOME_AWAY, DAYS_REST, BACK_TO_BACK, GAMES_IN_LAST_7, MINUTES_TREND
 * - 12 Advanced Metrics: Efficiency, ratios, trends, consistency
 * - 6 Interaction Features: Home/away interactions, usage/efficiency combos
 * - 8 Composite Metrics: Load intensity, shooting volume, playmaking efficiency
 * - 2 Ratio Features: L3/L10 ratios for points and rebounds
 * - 21 Betting Line: line, odds, implied probs, line-vs-stats comparisons, market features
 */

const { parseMinutes, calculateStandardDeviation, daysBetween } = require('./nbaHelpers');

/**
 * Calculate Last 3 Games statistics
 * Averages player's performance over the most recent 3 games
 *
 * @param {Array} gameLogs - Array of game log objects (sorted newest first)
 * @returns {Object} L3 feature object
 */
function calculateL3Stats(gameLogs) {
  // Take only the most recent 3 games
  const recentGames = gameLogs.slice(0, 3);

  if (recentGames.length === 0) {
    console.warn('[ML Features] No games available for L3 calculation');
    return getEmptyL3Stats();
  }

  // Sum all stats
  let totalPoints = 0;
  let totalReb = 0;
  let totalAst = 0;
  let totalMin = 0;
  let totalFgm = 0;
  let totalFga = 0;
  let totalFg3m = 0;
  let totalFg3a = 0;
  let totalFtm = 0;
  let totalFta = 0;
  let totalStl = 0;
  let totalBlk = 0;
  let totalTov = 0;

  recentGames.forEach(game => {
    totalPoints += game.points || 0;
    totalReb += game.totReb || 0;
    totalAst += game.assists || 0;
    totalMin += parseMinutes(game.min);
    totalFgm += game.fgm || 0;
    totalFga += game.fga || 0;
    totalFg3m += game.tpm || 0; // API uses 'tpm' for three-pointers made
    totalFg3a += game.tpa || 0; // API uses 'tpa' for three-pointers attempted
    totalFtm += game.ftm || 0;
    totalFta += game.fta || 0;
    totalStl += game.steals || 0;
    totalBlk += game.blocks || 0;
    totalTov += game.turnovers || 0;
  });

  const gamesCount = recentGames.length;

  return {
    L3_PTS: totalPoints / gamesCount,
    L3_REB: totalReb / gamesCount,
    L3_AST: totalAst / gamesCount,
    L3_MIN: totalMin / gamesCount,
    L3_FG_PCT: totalFga > 0 ? (totalFgm / totalFga) * 100 : 0,
    L3_FG3M: totalFg3m / gamesCount,
    L3_FG3_PCT: totalFg3a > 0 ? (totalFg3m / totalFg3a) * 100 : 0,
    L3_STL: totalStl / gamesCount,
    L3_BLK: totalBlk / gamesCount,
    L3_TOV: totalTov / gamesCount,
    L3_FGM: totalFgm / gamesCount,
    L3_FGA: totalFga / gamesCount,
    L3_FTA: totalFta / gamesCount,
    _gamesUsed: gamesCount
  };
}

/**
 * Calculate Last 10 Games statistics
 * Averages + standard deviations over the most recent 10 games
 *
 * @param {Array} gameLogs - Array of game log objects (sorted newest first)
 * @returns {Object} L10 feature object
 */
function calculateL10Stats(gameLogs) {
  // Take only the most recent 10 games
  const recentGames = gameLogs.slice(0, 10);

  if (recentGames.length === 0) {
    console.warn('[ML Features] No games available for L10 calculation');
    return getEmptyL10Stats();
  }

  // Arrays to track individual game values (for std dev)
  const ptsArray = [];
  const rebArray = [];
  const astArray = [];
  const minArray = [];
  const fgPctArray = [];
  const fg3PctArray = [];
  const ftPctArray = [];

  // Sum all stats
  let totalPoints = 0;
  let totalReb = 0;
  let totalAst = 0;
  let totalMin = 0;
  let totalFgm = 0;
  let totalFga = 0;
  let totalFg3m = 0;
  let totalFg3a = 0;
  let totalFtm = 0;
  let totalFta = 0;
  let totalStl = 0;
  let totalBlk = 0;
  let totalTov = 0;

  recentGames.forEach(game => {
    const pts = game.points || 0;
    const reb = game.totReb || 0;
    const ast = game.assists || 0;
    const min = parseMinutes(game.min);
    const fgm = game.fgm || 0;
    const fga = game.fga || 0;
    const fg3m = game.tpm || 0;
    const fg3a = game.tpa || 0;
    const ftm = game.ftm || 0;
    const fta = game.fta || 0;

    ptsArray.push(pts);
    rebArray.push(reb);
    astArray.push(ast);
    minArray.push(min);
    fgPctArray.push(fga > 0 ? (fgm / fga) * 100 : 0);
    fg3PctArray.push(fg3a > 0 ? (fg3m / fg3a) * 100 : 0);
    ftPctArray.push(fta > 0 ? (ftm / fta) * 100 : 0);

    totalPoints += pts;
    totalReb += reb;
    totalAst += ast;
    totalMin += min;
    totalFgm += fgm;
    totalFga += fga;
    totalFg3m += fg3m;
    totalFg3a += fg3a;
    totalFtm += ftm;
    totalFta += fta;
    totalStl += game.steals || 0;
    totalBlk += game.blocks || 0;
    totalTov += game.turnovers || 0;
  });

  const gamesCount = recentGames.length;

  return {
    L10_PTS: totalPoints / gamesCount,
    L10_REB: totalReb / gamesCount,
    L10_AST: totalAst / gamesCount,
    L10_MIN: totalMin / gamesCount,
    L10_FG_PCT: totalFga > 0 ? (totalFgm / totalFga) * 100 : 0,
    L10_FG3M: totalFg3m / gamesCount,
    L10_FG3_PCT: totalFg3a > 0 ? (totalFg3m / totalFg3a) * 100 : 0,
    L10_STL: totalStl / gamesCount,
    L10_BLK: totalBlk / gamesCount,
    L10_TOV: totalTov / gamesCount,
    L10_FGM: totalFgm / gamesCount,
    L10_FGA: totalFga / gamesCount,
    L10_PTS_STD: calculateStandardDeviation(ptsArray),
    L10_REB_STD: calculateStandardDeviation(rebArray),
    L10_AST_STD: calculateStandardDeviation(astArray),

    _gamesUsed: gamesCount
  };
}

/**
 * Calculate game context features
 * DAYS_REST, BACK_TO_BACK, GAMES_IN_LAST_7, MINUTES_TREND
 *
 * @param {Array} gameLogs - Array of game log objects (sorted newest first)
 * @param {string} gameDate - Upcoming game date (ISO string)
 * @param {boolean} isHome - Is player on home team?
 * @param {Object} l3Stats - L3 stats object
 * @param {Object} l10Stats - L10 stats object
 * @returns {Object} Context feature object
 */
function calculateGameContext(gameLogs, gameDate, isHome, l3Stats, l10Stats) {
  if (gameLogs.length === 0) {
    return {
      HOME_AWAY: isHome ? 1 : 0,
      DAYS_REST: 3, // Default assumption
      BACK_TO_BACK: 0,
      GAMES_IN_LAST_7: 0,
      MINUTES_TREND: 0
    };
  }

  // Get most recent game
  const lastGame = gameLogs[0];
  const lastGameDate = lastGame.game?.date?.start || lastGame.game?.date;

  // Calculate days rest
  const daysRest = lastGameDate ? daysBetween(lastGameDate, gameDate) : 3;
  const backToBack = daysRest === 1 ? 1 : 0;

  // Count games in last 7 days from upcoming game
  const upcomingDate = new Date(gameDate);
  const gamesInLast7 = gameLogs.filter(game => {
    const gDate = new Date(game.game?.date?.start || game.game?.date);
    const daysAgo = daysBetween(gDate, upcomingDate);
    return daysAgo <= 7;
  }).length;

  // Minutes trend: positive if L3 minutes > L10 minutes (getting more playing time)
  const minutesTrend = l3Stats.L3_MIN - l10Stats.L10_MIN;

  return {
    HOME_AWAY: isHome ? 1 : 0,
    DAYS_REST: daysRest,
    BACK_TO_BACK: backToBack,
    GAMES_IN_LAST_7: gamesInLast7,
    MINUTES_TREND: minutesTrend
  };
}

/**
 * Calculate advanced performance metrics
 * Efficiency, ratios, trends, consistency, acceleration
 *
 * @param {Object} l3Stats - L3 stats object
 * @param {Object} l10Stats - L10 stats object
 * @param {Object} context - Game context object
 * @returns {Object} Advanced metrics object
 */
function calculateAdvancedMetrics(l3Stats, l10Stats, context) {
  // Scoring efficiency: Points per field goal attempt
  const SCORING_EFFICIENCY = l3Stats.L3_FGA > 0 ? l3Stats.L3_PTS / l3Stats.L3_FGA : 0;

  // Assist to turnover ratio
  const ASSIST_TO_RATIO = l3Stats.L3_TOV > 0 ? l3Stats.L3_AST / l3Stats.L3_TOV : l3Stats.L3_AST;

  // Rebound rate: Rebounds per minute
  const REBOUND_RATE = l3Stats.L3_MIN > 0 ? l3Stats.L3_REB / l3Stats.L3_MIN : 0;

  // Usage rate: Field goal attempts per minute (proxy for offensive load)
  const USAGE_RATE = l3Stats.L3_MIN > 0 ? l3Stats.L3_FGA / l3Stats.L3_MIN : 0;

  // Trends: L3 vs L10 (positive = hot streak, negative = cooling off)
  const TREND_PTS = l3Stats.L3_PTS - l10Stats.L10_PTS;
  const TREND_REB = l3Stats.L3_REB - l10Stats.L10_REB;
  const TREND_AST = l3Stats.L3_AST - l10Stats.L10_AST;

  // Consistency: Lower is more consistent (coefficient of variation)
  const CONSISTENCY_PTS = l10Stats.L10_PTS > 0 ? l10Stats.L10_PTS_STD / l10Stats.L10_PTS : 0;
  const CONSISTENCY_REB = l10Stats.L10_REB > 0 ? l10Stats.L10_REB_STD / l10Stats.L10_REB : 0;
  const CONSISTENCY_AST = l10Stats.L10_AST > 0 ? l10Stats.L10_AST_STD / l10Stats.L10_AST : 0;

  // Acceleration: Trend normalized by days rest
  const ACCELERATION_PTS = context.DAYS_REST > 0 ? TREND_PTS / context.DAYS_REST : TREND_PTS;

  // Efficiency stability: 1 if FG% difference between L3 and L10 is small (<5%)
  const EFFICIENCY_STABLE = Math.abs(l3Stats.L3_FG_PCT - l10Stats.L10_FG_PCT) < 5 ? 1 : 0;

  return {
    SCORING_EFFICIENCY,
    ASSIST_TO_RATIO,
    REBOUND_RATE,
    USAGE_RATE,
    TREND_PTS,
    TREND_REB,
    TREND_AST,
    CONSISTENCY_PTS,
    CONSISTENCY_REB,
    CONSISTENCY_AST,
    ACCELERATION_PTS,
    EFFICIENCY_STABLE
  };
}

/**
 * Calculate interaction features
 * Combines base features to capture relationships
 *
 * @param {Object} l3Stats - L3 stats object
 * @param {Object} context - Game context object
 * @param {Object} advanced - Advanced metrics object
 * @returns {Object} Interaction features object
 */
function calculateInteractionFeatures(l3Stats, context, advanced) {
  return {
    L3_PTS_x_HOME: l3Stats.L3_PTS * context.HOME_AWAY,
    L3_REB_x_HOME: l3Stats.L3_REB * context.HOME_AWAY,
    L3_AST_x_HOME: l3Stats.L3_AST * context.HOME_AWAY,
    L3_MIN_x_B2B: l3Stats.L3_MIN * context.BACK_TO_BACK,
    L3_PTS_x_REST: l3Stats.L3_PTS * context.DAYS_REST,
    USAGE_x_EFFICIENCY: advanced.USAGE_RATE * advanced.SCORING_EFFICIENCY
  };
}

/**
 * Calculate composite metrics
 * Complex derived features combining multiple stats
 *
 * @param {Object} l3Stats - L3 stats object
 * @param {Object} l10Stats - L10 stats object
 * @param {Object} context - Game context object
 * @param {Object} advanced - Advanced metrics object
 * @returns {Object} Composite features object
 */
function calculateCompositeMetrics(l3Stats, l10Stats, context, advanced) {
  // Load intensity: Games played recently * average minutes per game
  const LOAD_INTENSITY = context.GAMES_IN_LAST_7 * (l10Stats.L10_MIN / 7);

  // Shooting volume
  const SHOOTING_VOLUME = l3Stats.L3_FGA;

  // Rebound intensity: Rebounds weighted by rebound rate
  const REBOUND_INTENSITY = l3Stats.L3_REB * advanced.REBOUND_RATE;

  // Playmaking efficiency: Assists weighted by assist-to-turnover ratio
  const PLAYMAKING_EFFICIENCY = l3Stats.L3_AST * advanced.ASSIST_TO_RATIO;

  // Three-point threat: Makes * percentage (higher = more dangerous)
  const THREE_POINT_THREAT = l3Stats.L3_FG3M * (l3Stats.L3_FG3_PCT / 100);

  // Defensive impact: Steals + blocks + small bonus for being positive
  const DEFENSIVE_IMPACT = l3Stats.L3_STL + l3Stats.L3_BLK + 0.5;

  // Points volatility (same as consistency but different name for model)
  const PTS_VOLATILITY = l10Stats.L10_PTS > 0 ? l10Stats.L10_PTS_STD / l10Stats.L10_PTS : 0;

  // Minutes stability: L3 minutes relative to L10 (1.0 = stable, >1 = increasing)
  const MINUTES_STABILITY = l10Stats.L10_MIN > 0 ? l3Stats.L3_MIN / l10Stats.L10_MIN : 1;

  return {
    LOAD_INTENSITY,
    SHOOTING_VOLUME,
    REBOUND_INTENSITY,
    PLAYMAKING_EFFICIENCY,
    THREE_POINT_THREAT,
    DEFENSIVE_IMPACT,
    PTS_VOLATILITY,
    MINUTES_STABILITY
  };
}

/**
 * Calculate ratio features
 * Simple L3/L10 ratios to capture recent form
 *
 * @param {Object} l3Stats - L3 stats object
 * @param {Object} l10Stats - L10 stats object
 * @returns {Object} Ratio features object
 */
function calculateRatioFeatures(l3Stats, l10Stats) {
  return {
    L3_vs_L10_PTS_RATIO: l10Stats.L10_PTS > 0 ? l3Stats.L3_PTS / l10Stats.L10_PTS : 1,
    L3_vs_L10_REB_RATIO: l10Stats.L10_REB > 0 ? l3Stats.L3_REB / l10Stats.L10_REB : 1
  };
}

/**
 * Calculate betting line features
 * Based on API_DOCUMENTATION.md specification (lines 274-295)
 *
 * @param {number} line - Prop line (e.g., 28.5 points)
 * @param {number} oddsOver - American odds for Over (e.g., -110)
 * @param {number} oddsUnder - American odds for Under (e.g., -110)
 * @param {Object} l3Stats - L3 stats object
 * @param {Object} l10Stats - L10 stats object
 * @param {string} propType - Prop type (points, rebounds, assists)
 * @returns {Object} Betting line features object (21 features)
 */
function calculateBettingLineFeatures(line, oddsOver, oddsUnder, l3Stats, l10Stats, propType) {
  // Convert American odds to implied probability
  const impliedProbOver = americanOddsToImpliedProb(oddsOver);
  const impliedProbUnder = americanOddsToImpliedProb(oddsUnder);

  // Get relevant L3 and L10 stats based on prop type
  let l3Stat, l10Stat;
  if (propType === 'points') {
    l3Stat = l3Stats.L3_PTS;
    l10Stat = l10Stats.L10_PTS;
  } else if (propType === 'rebounds') {
    l3Stat = l3Stats.L3_REB;
    l10Stat = l10Stats.L10_REB;
  } else if (propType === 'assists') {
    l3Stat = l3Stats.L3_AST;
    l10Stat = l10Stats.L10_AST;
  } else {
    // Default to points for combo props
    l3Stat = l3Stats.L3_PTS;
    l10Stat = l10Stats.L10_PTS;
  }

  // Calculate line-vs-stats features
  const LINE_VALUE = line !== 0 ? (l3Stat - line) / line : 0;
  const ODDS_EDGE = impliedProbOver - impliedProbUnder;
  const odds_spread = oddsOver - oddsUnder;
  const market_confidence = Math.abs(impliedProbOver - 0.5);

  const L3_PTS_vs_LINE = l3Stats.L3_PTS - line;
  const L3_REB_vs_LINE = l3Stats.L3_REB - line;
  const L3_AST_vs_LINE = l3Stats.L3_AST - line;

  const LINE_DIFFICULTY_PTS = l10Stats.L10_PTS !== 0 ? line / l10Stats.L10_PTS : 1;
  const LINE_DIFFICULTY_REB = l10Stats.L10_REB !== 0 ? line / l10Stats.L10_REB : 1;
  const LINE_DIFFICULTY_AST = l10Stats.L10_AST !== 0 ? line / l10Stats.L10_AST : 1;

  const IMPLIED_PROB_OVER = impliedProbOver; // Duplicate as per API docs
  const LINE_vs_AVG_PTS = line - l10Stats.L10_PTS;
  const LINE_vs_AVG_REB = line - l10Stats.L10_REB;

  const L3_vs_market = (l3Stats.L3_PTS - line) * impliedProbOver;
  const L10_vs_market = (l10Stats.L10_PTS - line) * impliedProbOver;

  return {
    line,
    odds_over: oddsOver,
    odds_under: oddsUnder,
    implied_prob_over: impliedProbOver,
    implied_prob_under: impliedProbUnder,
    LINE_VALUE,
    ODDS_EDGE,
    odds_spread,
    market_confidence,
    L3_PTS_vs_LINE,
    L3_REB_vs_LINE,
    L3_AST_vs_LINE,
    LINE_DIFFICULTY_PTS,
    LINE_DIFFICULTY_REB,
    LINE_DIFFICULTY_AST,
    IMPLIED_PROB_OVER,
    LINE_vs_AVG_PTS,
    LINE_vs_AVG_REB,
    L3_vs_market,
    L10_vs_market
  };
}

/**
 * Convert American odds to implied probability
 * @param {number} americanOdds - American odds (e.g., -110, +120)
 * @returns {number} Implied probability (0-1)
 */
function americanOddsToImpliedProb(americanOdds) {
  if (americanOdds < 0) {
    // Favorite: -110 -> 110 / (110 + 100) = 0.5238
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  } else {
    // Underdog: +120 -> 100 / (120 + 100) = 0.4545
    return 100 / (americanOdds + 100);
  }
}


/**
 * Main function: Calculate all 88 ML features for a single prop
 *
 * @param {Object} params - Input parameters
 * @param {Array} params.gameLogs - Player's game logs (sorted newest first)
 * @param {string} params.propType - Prop type (e.g., "points", "rebounds")
 * @param {string} params.homeTeam - Home team code (e.g., "LAL")
 * @param {string} params.awayTeam - Away team code (e.g., "GSW")
 * @param {boolean} params.isHome - Is player on home team?
 * @param {string} params.gameDate - Game date (ISO string)
 * @param {number} params.line - Prop line
 * @param {number} params.oddsOver - American odds over
 * @param {number} params.oddsUnder - American odds under
 * @param {string} params.bookmaker - Bookmaker name
 * @returns {Object} Complete 88-feature object ready for ML model
 */
function calculateAllMLFeatures(params) {
  const {
    gameLogs,
    propType,
    homeTeam,
    awayTeam,
    isHome,
    gameDate,
    line,
    oddsOver,
    oddsUnder,
    bookmaker
  } = params;

  console.log(`[ML Features] Calculating features for ${propType} prop, ${gameLogs.length} games available`);

  // 1. Calculate base stats
  const l3Stats = calculateL3Stats(gameLogs);
  const l10Stats = calculateL10Stats(gameLogs);

  // 2. Calculate context features
  const context = calculateGameContext(gameLogs, gameDate, isHome, l3Stats, l10Stats);

  // 3. Calculate advanced metrics
  const advanced = calculateAdvancedMetrics(l3Stats, l10Stats, context);

  // 4. Calculate interaction features
  const interactions = calculateInteractionFeatures(l3Stats, context, advanced);

  // 5. Calculate composite metrics
  const composites = calculateCompositeMetrics(l3Stats, l10Stats, context, advanced);

  // 6. Calculate ratio features
  const ratios = calculateRatioFeatures(l3Stats, l10Stats);

  // 7. Calculate betting line features
  const bettingFeatures = calculateBettingLineFeatures(line, oddsOver, oddsUnder, l3Stats, l10Stats, propType);

  // 8. Temporal features
  const date = new Date(gameDate);
  const temporal = {
    year: date.getFullYear(),
    month: date.getMonth() + 1, // 1-12
    day_of_week: date.getDay() // 0-6 (Sunday = 0)
  };

  // 9. Get current season
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const season = currentMonth >= 10 ? `${currentYear}-${(currentYear + 1) % 100}` : `${currentYear - 1}-${currentYear % 100}`;

  // Combine all features into single object (88 total)
  const allFeatures = {
    // Categorical (5)
    prop_type: propType,
    home_team: homeTeam,
    away_team: awayTeam,
    bookmaker: bookmaker,
    SEASON: season,

    // Temporal (3)
    ...temporal,

    // Last 3 Games (12)
    L3_PTS: l3Stats.L3_PTS,
    L3_REB: l3Stats.L3_REB,
    L3_AST: l3Stats.L3_AST,
    L3_MIN: l3Stats.L3_MIN,
    L3_FG_PCT: l3Stats.L3_FG_PCT,
    L3_FG3M: l3Stats.L3_FG3M,
    L3_FG3_PCT: l3Stats.L3_FG3_PCT,
    L3_STL: l3Stats.L3_STL,
    L3_BLK: l3Stats.L3_BLK,
    L3_TOV: l3Stats.L3_TOV,
    L3_FGM: l3Stats.L3_FGM,
    L3_FGA: l3Stats.L3_FGA,

    // Last 10 Games (15 - includes std devs)
    L10_PTS: l10Stats.L10_PTS,
    L10_REB: l10Stats.L10_REB,
    L10_AST: l10Stats.L10_AST,
    L10_MIN: l10Stats.L10_MIN,
    L10_FG_PCT: l10Stats.L10_FG_PCT,
    L10_FG3M: l10Stats.L10_FG3M,
    L10_FG3_PCT: l10Stats.L10_FG3_PCT,
    L10_STL: l10Stats.L10_STL,
    L10_BLK: l10Stats.L10_BLK,
    L10_TOV: l10Stats.L10_TOV,
    L10_FGM: l10Stats.L10_FGM,
    L10_FGA: l10Stats.L10_FGA,
    L10_PTS_STD: l10Stats.L10_PTS_STD,
    L10_REB_STD: l10Stats.L10_REB_STD,
    L10_AST_STD: l10Stats.L10_AST_STD,

    // Game Context (5)
    HOME_AWAY: context.HOME_AWAY,
    DAYS_REST: context.DAYS_REST,
    BACK_TO_BACK: context.BACK_TO_BACK,
    GAMES_IN_LAST_7: context.GAMES_IN_LAST_7,
    MINUTES_TREND: context.MINUTES_TREND,

    // Advanced Metrics (12)
    SCORING_EFFICIENCY: advanced.SCORING_EFFICIENCY,
    ASSIST_TO_RATIO: advanced.ASSIST_TO_RATIO,
    REBOUND_RATE: advanced.REBOUND_RATE,
    USAGE_RATE: advanced.USAGE_RATE,
    TREND_PTS: advanced.TREND_PTS,
    TREND_REB: advanced.TREND_REB,
    TREND_AST: advanced.TREND_AST,
    CONSISTENCY_PTS: advanced.CONSISTENCY_PTS,
    CONSISTENCY_REB: advanced.CONSISTENCY_REB,
    CONSISTENCY_AST: advanced.CONSISTENCY_AST,
    ACCELERATION_PTS: advanced.ACCELERATION_PTS,
    EFFICIENCY_STABLE: advanced.EFFICIENCY_STABLE,

    // Interaction Features (6)
    L3_PTS_x_HOME: interactions.L3_PTS_x_HOME,
    L3_REB_x_HOME: interactions.L3_REB_x_HOME,
    L3_AST_x_HOME: interactions.L3_AST_x_HOME,
    L3_MIN_x_B2B: interactions.L3_MIN_x_B2B,
    L3_PTS_x_REST: interactions.L3_PTS_x_REST,
    USAGE_x_EFFICIENCY: interactions.USAGE_x_EFFICIENCY,

    // Composite Metrics (8)
    LOAD_INTENSITY: composites.LOAD_INTENSITY,
    SHOOTING_VOLUME: composites.SHOOTING_VOLUME,
    REBOUND_INTENSITY: composites.REBOUND_INTENSITY,
    PLAYMAKING_EFFICIENCY: composites.PLAYMAKING_EFFICIENCY,
    THREE_POINT_THREAT: composites.THREE_POINT_THREAT,
    DEFENSIVE_IMPACT: composites.DEFENSIVE_IMPACT,
    PTS_VOLATILITY: composites.PTS_VOLATILITY,
    MINUTES_STABILITY: composites.MINUTES_STABILITY,

    // Ratio Features (2)
    L3_vs_L10_PTS_RATIO: ratios.L3_vs_L10_PTS_RATIO,
    L3_vs_L10_REB_RATIO: ratios.L3_vs_L10_REB_RATIO,

    // Betting Line Features (21)
    ...bettingFeatures
  };

  console.log(`[ML Features] ✅ Calculated 88 features successfully`);
  console.log(`[ML Features] L3: ${l3Stats._gamesUsed} games, L10: ${l10Stats._gamesUsed} games`);

  return allFeatures;
}

// Empty stats objects for edge cases
function getEmptyL3Stats() {
  return {
    L3_PTS: 0, L3_REB: 0, L3_AST: 0, L3_MIN: 0,
    L3_FG_PCT: 0, L3_FG3M: 0, L3_FG3_PCT: 0,
    L3_STL: 0, L3_BLK: 0, L3_TOV: 0,
    L3_FGM: 0, L3_FGA: 0, L3_FTA: 0,
    _gamesUsed: 0
  };
}

function getEmptyL10Stats() {
  return {
    L10_PTS: 0, L10_REB: 0, L10_AST: 0, L10_MIN: 0,
    L10_FG_PCT: 0, L10_FG3M: 0, L10_FG3_PCT: 0,
    L10_STL: 0, L10_BLK: 0, L10_TOV: 0,
    L10_FGM: 0, L10_FGA: 0,
    L10_PTS_STD: 0, L10_REB_STD: 0, L10_AST_STD: 0,
    _gamesUsed: 0
  };
}

module.exports = {
  calculateAllMLFeatures,
  calculateL3Stats,
  calculateL10Stats,
  calculateGameContext,
  calculateAdvancedMetrics,
  calculateInteractionFeatures,
  calculateCompositeMetrics,
  calculateRatioFeatures,
  calculateBettingLineFeatures
};
