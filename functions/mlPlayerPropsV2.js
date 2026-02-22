/**
 * ML Player Props Cloud Function v2 — EdgeBoard Pipeline
 *
 * Replaces SGO with The Odds API for props catalog.
 * Uses shared data layer for all data fetching.
 *
 * Key components:
 * - 88-feature engineering for CatBoost model on Vertex AI
 * - Temperature scaling (T=2.0) + hard cap (85%)
 * - Avg-gated sanity filter + green score (0-5)
 * - Alt lines enrichment with goblin legs
 */

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

// ── Shared Modules ──
const { fetchStandardProps, fetchAltProps, fetchEvents, findBestGoblinLine, normalizeBookmaker } = require('./shared/oddsApi');
const { resolvePlayerIdsBatch, getGameLogsBatch, getL10AvgForStat, getApiKey, getCurrentNBASeason } = require('./shared/playerStats');
const { getOpponentDefensiveStats, getOpponentStatForProp } = require('./shared/defense');
const { calculateHitRates } = require('./shared/hitRates');
const { calibrateProbability, getTrendForStat, calculateGreenScore, passesSanityCheck } = require('./shared/greenScore');

// ── Config ──
let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

const VERTEX_ENDPOINT = 'https://us-central1-aiplatform.googleapis.com/v1/projects/133991312998/locations/us-central1/endpoints/7508590194849742848:predict';

// Token cache for Vertex AI
let cachedToken = null;
let tokenExpiry = 0;

const PROB_CAP = 0.85;

// EdgeBoard odds ceiling: exclude props with predicted-side odds heavier than this.
// Heavy juice (-300 and below) belongs on Parlay Stack, not EdgeBoard.
// EdgeBoard = value territory where ML disagrees with the market.
const EDGEBOARD_ODDS_CEILING = -300;

// ── NBA Team Name → Code Mapping ──
const NBA_TEAM_CODES = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'LA Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'LA Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};

function getTeamCode(fullName) {
  return NBA_TEAM_CODES[fullName] || fullName.split(' ').pop().substring(0, 3).toUpperCase();
}

/**
 * Determine which team a player is on by checking their game logs
 * against the known home/away teams.
 */
function resolvePlayerTeam(gameLogs, homeTeam, awayTeam) {
  if (!gameLogs || gameLogs.length === 0) return { team: null, isHome: false };

  const recentTeam = gameLogs[0]?.team;
  if (!recentTeam) return { team: null, isHome: false };

  const playerTeamName = recentTeam.nickname || recentTeam.name || '';
  const playerTeamCode = recentTeam.code || '';

  const homeCode = getTeamCode(homeTeam);
  const awayCode = getTeamCode(awayTeam);
  const isHome = playerTeamCode === homeCode ||
    homeTeam.toLowerCase().includes(playerTeamName.toLowerCase().split(' ').pop());

  return {
    team: isHome ? homeTeam : awayTeam,
    isHome,
  };
}

/**
 * Find an Odds API event by team names (fallback when eventId not provided).
 */
async function findEventByTeams(team1, team2) {
  const events = await fetchEvents('basketball_nba');
  const normalize = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t1 = normalize(team1);
  const t2 = normalize(team2);

  for (const event of events) {
    const home = normalize(event.home_team || '');
    const away = normalize(event.away_team || '');
    if ((home.includes(t1) || t1.includes(home) || home.includes(t2) || t2.includes(home)) &&
        (away.includes(t1) || t1.includes(away) || away.includes(t2) || t2.includes(away))) {
      return event;
    }
  }
  return null;
}

// ──────────────────────────────────────────────
// REASONING FEATURES (model's "why")
// ──────────────────────────────────────────────

function getReasoningFeatures(features, statType) {
  const st = statType.toLowerCase();
  const r = { minutesTrend: parseFloat(features.MINUTES_TREND.toFixed(2)) };

  if (st === 'points' || st.includes('points')) {
    r.trend = parseFloat(features.TREND_PTS.toFixed(2));
    r.consistency = parseFloat(features.CONSISTENCY_PTS.toFixed(3));
    r.lineDifficulty = parseFloat(features.LINE_DIFFICULTY_PTS.toFixed(3));
    r.l3vsL10Ratio = parseFloat(features.L3_vs_L10_PTS_RATIO.toFixed(3));
  }
  if (st === 'rebounds' || st.includes('rebounds')) {
    r.trendReb = parseFloat(features.TREND_REB.toFixed(2));
    r.consistencyReb = parseFloat(features.CONSISTENCY_REB.toFixed(3));
    r.lineDifficultyReb = parseFloat(features.LINE_DIFFICULTY_REB.toFixed(3));
    r.l3vsL10RatioReb = parseFloat(features.L3_vs_L10_REB_RATIO.toFixed(3));
  }
  if (st === 'assists' || st.includes('assists')) {
    r.trendAst = parseFloat(features.TREND_AST.toFixed(2));
    r.consistencyAst = parseFloat(features.CONSISTENCY_AST.toFixed(3));
    r.lineDifficultyAst = parseFloat(features.LINE_DIFFICULTY_AST.toFixed(3));
  }

  return r;
}

// ──────────────────────────────────────────────
// FEATURE ENGINEERING (matches API_DOCUMENTATION.md exactly)
// ──────────────────────────────────────────────

function parseMinutes(minStr) {
  if (!minStr || typeof minStr !== 'string') return 0;
  const parts = minStr.split(':');
  return (parseInt(parts[0]) || 0) + ((parseInt(parts[1]) || 0) / 60);
}

function stddev(arr) {
  if (!arr || arr.length <= 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (arr.length - 1));
}

function americanToImpliedProb(odds) {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

function getL3StatForProp(modelPropType, f) {
  switch (modelPropType) {
    case 'points': return f.L3_PTS;
    case 'rebounds': return f.L3_REB;
    case 'assists': return f.L3_AST;
    case 'threes': return f.L3_FG3M;
    case 'blocks': return f.L3_BLK;
    case 'steals': return f.L3_STL;
    case 'turnovers': return f.L3_TOV;
    case 'points_rebounds': return f.L3_PTS + f.L3_REB;
    case 'points_assists': return f.L3_PTS + f.L3_AST;
    case 'rebounds_assists': return f.L3_REB + f.L3_AST;
    case 'points_rebounds_assists': return f.L3_PTS + f.L3_REB + f.L3_AST;
    case 'blocks_steals': return f.L3_BLK + f.L3_STL;
    default: return f.L3_PTS;
  }
}

function getMarketStat(modelPropType, f, window) {
  if (['points', 'points_rebounds', 'points_assists', 'points_rebounds_assists', 'threes'].includes(modelPropType)) {
    return f[`${window}_PTS`];
  } else if (['rebounds', 'rebounds_assists'].includes(modelPropType)) {
    return f[`${window}_REB`];
  } else if (modelPropType === 'assists') {
    return f[`${window}_AST`];
  } else if (['blocks', 'blocks_steals'].includes(modelPropType)) {
    return f[`${window}_BLK`];
  } else if (modelPropType === 'steals') {
    return f[`${window}_STL`];
  } else if (modelPropType === 'turnovers') {
    return f[`${window}_TOV`];
  }
  return f[`${window}_PTS`];
}

/**
 * Build all 88 features from game logs + prop data.
 * Matches FEATURES_88_COMPLETE.md exactly.
 */
function buildFeatures(gameLogs, prop, homeTeam, awayTeam, gameDate) {
  const l3Games = gameLogs.slice(0, 3);
  const l10Games = gameLogs.slice(0, 10);

  // ── L3 Stats ──
  const l3Count = l3Games.length || 1;
  let l3 = { pts: 0, reb: 0, ast: 0, min: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, stl: 0, blk: 0, tov: 0 };
  const l3FgPctArr = [], l3Fg3PctArr = [];
  l3Games.forEach(g => {
    l3.pts += g.points || 0;
    l3.reb += g.totReb || 0;
    l3.ast += g.assists || 0;
    l3.min += parseMinutes(g.min);
    l3.fgm += g.fgm || 0;
    l3.fga += g.fga || 0;
    l3.fg3m += g.tpm || 0;
    l3.fg3a += g.tpa || 0;
    l3.ftm += g.ftm || 0;
    l3.fta += g.fta || 0;
    l3.stl += g.steals || 0;
    l3.blk += g.blocks || 0;
    l3.tov += g.turnovers || 0;
    const gFga = g.fga || 0, gFgm = g.fgm || 0;
    l3FgPctArr.push(gFga > 0 ? gFgm / gFga : 0);
    const gTpa = g.tpa || 0, gTpm = g.tpm || 0;
    l3Fg3PctArr.push(gTpa > 0 ? gTpm / gTpa : 0);
  });

  const L3_PTS = l3.pts / l3Count;
  const L3_REB = l3.reb / l3Count;
  const L3_AST = l3.ast / l3Count;
  const L3_MIN = l3.min / l3Count;
  const L3_FG_PCT = l3FgPctArr.length > 0 ? l3FgPctArr.reduce((a, b) => a + b, 0) / l3FgPctArr.length : 0;
  const L3_FG3M = l3.fg3m / l3Count;
  const L3_FG3_PCT = l3Fg3PctArr.length > 0 ? l3Fg3PctArr.reduce((a, b) => a + b, 0) / l3Fg3PctArr.length : 0;
  const L3_STL = l3.stl / l3Count;
  const L3_BLK = l3.blk / l3Count;
  const L3_TOV = l3.tov / l3Count;
  const L3_FGM = l3.fgm / l3Count;
  const L3_FGA = l3.fga / l3Count;

  // ── L10 Stats ──
  const l10Count = l10Games.length || 1;
  let l10 = { pts: 0, reb: 0, ast: 0, min: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, stl: 0, blk: 0, tov: 0 };
  const ptsArr = [], rebArr = [], astArr = [];
  const l10FgPctArr = [], l10Fg3PctArr = [];
  l10Games.forEach(g => {
    const pts = g.points || 0;
    const reb = g.totReb || 0;
    const ast = g.assists || 0;
    ptsArr.push(pts); rebArr.push(reb); astArr.push(ast);
    l10.pts += pts;
    l10.reb += reb;
    l10.ast += ast;
    l10.min += parseMinutes(g.min);
    l10.fgm += g.fgm || 0;
    l10.fga += g.fga || 0;
    l10.fg3m += g.tpm || 0;
    l10.fg3a += g.tpa || 0;
    l10.stl += g.steals || 0;
    l10.blk += g.blocks || 0;
    l10.tov += g.turnovers || 0;
    const gFga = g.fga || 0, gFgm = g.fgm || 0;
    l10FgPctArr.push(gFga > 0 ? gFgm / gFga : 0);
    const gTpa = g.tpa || 0, gTpm = g.tpm || 0;
    l10Fg3PctArr.push(gTpa > 0 ? gTpm / gTpa : 0);
  });

  const L10_PTS = l10.pts / l10Count;
  const L10_REB = l10.reb / l10Count;
  const L10_AST = l10.ast / l10Count;
  const L10_MIN = l10.min / l10Count;
  const L10_FG_PCT = l10FgPctArr.length > 0 ? l10FgPctArr.reduce((a, b) => a + b, 0) / l10FgPctArr.length : 0;
  const L10_FG3M = l10.fg3m / l10Count;
  const L10_FG3_PCT = l10Fg3PctArr.length > 0 ? l10Fg3PctArr.reduce((a, b) => a + b, 0) / l10Fg3PctArr.length : 0;
  const L10_STL = l10.stl / l10Count;
  const L10_BLK = l10.blk / l10Count;
  const L10_TOV = l10.tov / l10Count;
  const L10_FGM = l10.fgm / l10Count;
  const L10_FGA = l10.fga / l10Count;
  const L10_PTS_STD = stddev(ptsArr);
  const L10_REB_STD = stddev(rebArr);
  const L10_AST_STD = stddev(astArr);

  // ── Game Context ──
  const HOME_AWAY = prop.isHome ? 1 : 0;

  let DAYS_REST = 3;
  let GAMES_IN_LAST_7 = 3;
  const upcomingDate = new Date(gameDate);
  if (!isNaN(upcomingDate.getTime()) && gameLogs.length > 0) {
    const mostRecentDate = gameLogs[0]?.game?.date ? new Date(gameLogs[0].game.date) : null;
    if (mostRecentDate && !isNaN(mostRecentDate.getTime())) {
      DAYS_REST = Math.max(1, Math.round((upcomingDate - mostRecentDate) / (1000 * 60 * 60 * 24)));
    }
    const sevenDaysAgo = new Date(upcomingDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let gamesIn7 = 0;
    for (const g of gameLogs) {
      const gDate = g.game?.date ? new Date(g.game.date) : null;
      if (gDate && !isNaN(gDate.getTime()) && gDate >= sevenDaysAgo && gDate < upcomingDate) {
        gamesIn7++;
      }
    }
    if (gamesIn7 > 0) GAMES_IN_LAST_7 = gamesIn7;
  }
  const BACK_TO_BACK = DAYS_REST === 1 ? 1 : 0;
  const MINUTES_TREND = L3_MIN - L10_MIN;

  // ── Advanced Metrics ──
  const SCORING_EFFICIENCY = L3_FGA > 0 ? L3_PTS / L3_FGA : 0;
  const ASSIST_TO_RATIO = L3_TOV > 0 ? L3_AST / L3_TOV : L3_AST;
  const REBOUND_RATE = L3_MIN > 0 ? L3_REB / L3_MIN : 0;
  const USAGE_RATE = L3_MIN > 0 ? L3_FGA / L3_MIN : 0;
  const TREND_PTS = L3_PTS - L10_PTS;
  const TREND_REB = L3_REB - L10_REB;
  const TREND_AST = L3_AST - L10_AST;
  const CONSISTENCY_PTS = L10_PTS > 0 ? L10_PTS_STD / L10_PTS : 0;
  const CONSISTENCY_REB = L10_REB > 0 ? L10_REB_STD / L10_REB : 0;
  const CONSISTENCY_AST = L10_AST > 0 ? L10_AST_STD / L10_AST : 0;
  const ACCELERATION_PTS = DAYS_REST > 0 ? TREND_PTS / DAYS_REST : TREND_PTS;
  const EFFICIENCY_STABLE = L3_PTS >= L10_PTS ? 1 : 0;

  // ── Interaction Features ──
  const L3_PTS_x_HOME = L3_PTS * HOME_AWAY;
  const L3_REB_x_HOME = L3_REB * HOME_AWAY;
  const L3_AST_x_HOME = L3_AST * HOME_AWAY;
  const L3_MIN_x_B2B = L3_MIN * BACK_TO_BACK;
  const L3_PTS_x_REST = L3_PTS * DAYS_REST;
  const USAGE_x_EFFICIENCY = USAGE_RATE * SCORING_EFFICIENCY;

  // ── Composite Metrics ──
  const LOAD_INTENSITY = GAMES_IN_LAST_7 * (L10_MIN / 7);
  const SHOOTING_VOLUME = L3_FGA;
  const REBOUND_INTENSITY = L3_REB * REBOUND_RATE;
  const PLAYMAKING_EFFICIENCY = L3_AST * ASSIST_TO_RATIO;
  const THREE_POINT_THREAT = L3_FG3M * L3_FG3_PCT;
  const DEFENSIVE_IMPACT = L3_STL + L3_BLK + 0.5;
  const PTS_VOLATILITY = L10_PTS > 0 ? L10_PTS_STD / L10_PTS : 0;
  const MINUTES_STABILITY = L10_MIN > 0 ? L3_MIN / L10_MIN : 1;

  // ── Ratio Features ──
  const L3_vs_L10_PTS_RATIO = L10_PTS > 0 ? L3_PTS / L10_PTS : 1;
  const L3_vs_L10_REB_RATIO = L10_REB > 0 ? L3_REB / L10_REB : 1;

  // ── Resolve model prop_type ──
  const propTypeMap = {
    'points': 'points',
    'rebounds': 'rebounds',
    'assists': 'assists',
    'threePointersMade': 'threes',
    'steals': 'steals',
    'blocks': 'blocks',
    'turnovers': 'turnovers',
    'points+rebounds': 'points_rebounds',
    'points+assists': 'points_assists',
    'rebounds+assists': 'rebounds_assists',
    'points+rebounds+assists': 'points_rebounds_assists',
    'blocks+steals': 'blocks_steals'
  };
  const modelPropType = propTypeMap[prop.statType] || prop.statType;

  // ── Betting Line Features ──
  const line = prop.line;
  const odds_over = prop.oddsOver;
  const odds_under = prop.oddsUnder;
  const implied_prob_over = americanToImpliedProb(odds_over);
  const implied_prob_under = americanToImpliedProb(odds_under);

  const rawFeats = { L3_PTS, L3_REB, L3_AST, L3_FG3M, L3_BLK, L3_STL, L3_TOV, L10_PTS, L10_REB, L10_AST, L10_FG3M, L10_BLK, L10_STL, L10_TOV };
  const l3Stat = getL3StatForProp(modelPropType, rawFeats);
  const LINE_VALUE = line !== 0 ? (l3Stat - line) / line : 0;

  const ODDS_EDGE = implied_prob_over - implied_prob_under;
  const odds_spread = odds_over - odds_under;
  const market_confidence = Math.abs(implied_prob_over - 0.5);
  const L3_PTS_vs_LINE = L3_PTS - line;
  const L3_REB_vs_LINE = L3_REB - line;
  const L3_AST_vs_LINE = L3_AST - line;
  const LINE_DIFFICULTY_PTS = L10_PTS !== 0 ? line / L10_PTS : 1;
  const LINE_DIFFICULTY_REB = L10_REB !== 0 ? line / L10_REB : 1;
  const LINE_DIFFICULTY_AST = L10_AST !== 0 ? line / L10_AST : 1;
  const LINE_vs_AVG_PTS = line - L10_PTS;
  const LINE_vs_AVG_REB = line - L10_REB;
  const l3MarketStat = getMarketStat(modelPropType, rawFeats, 'L3');
  const l10MarketStat = getMarketStat(modelPropType, rawFeats, 'L10');
  const L3_vs_market = (l3MarketStat - line) * implied_prob_over;
  const L10_vs_market = (l10MarketStat - line) * implied_prob_over;

  // ── Temporal ──
  const date = new Date(gameDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day_of_week = (date.getDay() + 6) % 7;

  // ── Season ──
  const seasonYear = getCurrentNBASeason();
  const SEASON = `${seasonYear}-${String(seasonYear + 1).slice(-2)}`;

  return {
    // Categorical (5)
    prop_type: modelPropType,
    home_team: homeTeam,
    away_team: awayTeam,
    bookmaker: normalizeBookmaker(prop.bookmakerOver) || 'DraftKings',
    SEASON,

    // Temporal (3)
    year, month, day_of_week,

    // L3 (12)
    L3_PTS, L3_REB, L3_AST, L3_MIN, L3_FG_PCT, L3_FG3M, L3_FG3_PCT,
    L3_STL, L3_BLK, L3_TOV, L3_FGM, L3_FGA,

    // L10 (15)
    L10_PTS, L10_REB, L10_AST, L10_MIN, L10_FG_PCT, L10_FG3M, L10_FG3_PCT,
    L10_STL, L10_BLK, L10_TOV, L10_FGM, L10_FGA,
    L10_PTS_STD, L10_REB_STD, L10_AST_STD,

    // Game Context (5)
    HOME_AWAY, DAYS_REST, BACK_TO_BACK, GAMES_IN_LAST_7, MINUTES_TREND,

    // Advanced (12)
    SCORING_EFFICIENCY, ASSIST_TO_RATIO, REBOUND_RATE, USAGE_RATE,
    TREND_PTS, TREND_REB, TREND_AST,
    CONSISTENCY_PTS, CONSISTENCY_REB, CONSISTENCY_AST,
    ACCELERATION_PTS, EFFICIENCY_STABLE,

    // Interactions (6)
    L3_PTS_x_HOME, L3_REB_x_HOME, L3_AST_x_HOME,
    L3_MIN_x_B2B, L3_PTS_x_REST, USAGE_x_EFFICIENCY,

    // Composites (8)
    LOAD_INTENSITY, SHOOTING_VOLUME, REBOUND_INTENSITY, PLAYMAKING_EFFICIENCY,
    THREE_POINT_THREAT, DEFENSIVE_IMPACT, PTS_VOLATILITY, MINUTES_STABILITY,

    // Ratios (2)
    L3_vs_L10_PTS_RATIO, L3_vs_L10_REB_RATIO,

    // Betting (21)
    line, odds_over, odds_under, implied_prob_over, implied_prob_under,
    LINE_VALUE, ODDS_EDGE, odds_spread, market_confidence,
    L3_PTS_vs_LINE, L3_REB_vs_LINE, L3_AST_vs_LINE,
    LINE_DIFFICULTY_PTS, LINE_DIFFICULTY_REB, LINE_DIFFICULTY_AST,
    IMPLIED_PROB_OVER: implied_prob_over,
    LINE_vs_AVG_PTS, LINE_vs_AVG_REB,
    L3_vs_market, L10_vs_market
  };
}

// ──────────────────────────────────────────────
// VERTEX AI
// ──────────────────────────────────────────────

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 300000) return cachedToken;

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  cachedToken = token.token;
  tokenExpiry = now + 3600000;
  return cachedToken;
}

async function predictBatch(featuresArray) {
  const token = await getAccessToken();
  const response = await axios.post(VERTEX_ENDPOINT, { instances: featuresArray }, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 30000
  });
  return response.data.predictions;
}

// ──────────────────────────────────────────────
// EDGEBOARD PIPELINE
// ──────────────────────────────────────────────

/**
 * Core EdgeBoard processing — accepts pre-fetched data (no API calls except Vertex AI).
 * Used by the orchestrator (refreshGameProps.js) for shared data fetching.
 *
 * @param {string} eventId - The Odds API event ID
 * @param {object} sharedData - { standardProps, altPropsMap, playerIdMap, gameLogsMap, oppStatsData, homeTeam, awayTeam, gameTime }
 * @param {object} options - { gameDate, debug }
 * @returns {object} - { success, topProps, goblinLegs, ... }
 */
async function processEdgeBoard(eventId, sharedData, options = {}) {
  const { gameDate, debug } = options;
  const { standardProps: allProps, altPropsMap: altLinesMap, playerIdMap, gameLogsMap, oppStatsData, homeTeam, awayTeam, gameTime } = sharedData;

  if (!allProps || allProps.length === 0) {
    return {
      success: true, sport: 'NBA',
      teams: { home: homeTeam, away: awayTeam },
      gameTime, totalPropsAvailable: 0,
      topProps: [], goblinLegs: [],
      message: 'No player props available from The Odds API'
    };
  }
  console.log(`[EdgeBoard] Processing ${allProps.length} props`);

  // Team codes for ML features
  const homeTeamCode = getTeamCode(homeTeam);
  const awayTeamCode = getTeamCode(awayTeam);

  // 6. Determine player teams from game logs
  const playerTeamInfo = {};
  for (const [name, logs] of Object.entries(gameLogsMap)) {
    playerTeamInfo[name] = resolvePlayerTeam(logs, homeTeam, awayTeam);
  }

  // 7. Enrich props with team + isHome, filter to those with game logs
  const enrichedProps = allProps
    .map(p => ({
      ...p,
      team: playerTeamInfo[p.playerName]?.team || homeTeam,
      isHome: playerTeamInfo[p.playerName]?.isHome ?? false,
    }))
    .filter(p => gameLogsMap[p.playerName]?.length > 0);

  console.log(`[EdgeBoard] Processing ${enrichedProps.length} props through ML`);

  if (enrichedProps.length === 0) {
    return {
      success: true, sport: 'NBA',
      teams: { home: homeTeam, away: awayTeam },
      gameTime, totalPropsAvailable: allProps.length,
      topProps: [], goblinLegs: [],
      message: 'No player game logs available for feature engineering'
    };
  }

  // 8. Build 88-feature vectors
  const effectiveGameDate = gameDate || gameTime;
  const featuresList = enrichedProps.map(prop =>
    buildFeatures(gameLogsMap[prop.playerName], prop, homeTeamCode, awayTeamCode, effectiveGameDate)
  );

  // 9. Build per-player L10 stats lookup
  const playerStatsMap = {};
  enrichedProps.forEach((prop, idx) => {
    if (!playerStatsMap[prop.playerName]) {
      const f = featuresList[idx];
      playerStatsMap[prop.playerName] = {
        pointsPerGame: parseFloat(f.L10_PTS.toFixed(1)),
        reboundsPerGame: parseFloat(f.L10_REB.toFixed(1)),
        assistsPerGame: parseFloat(f.L10_AST.toFixed(1)),
        stealsPerGame: parseFloat(f.L10_STL.toFixed(1)),
        blocksPerGame: parseFloat(f.L10_BLK.toFixed(1)),
        fgPct: parseFloat((f.L10_FG_PCT * 100).toFixed(1)),
        fg3Pct: parseFloat((f.L10_FG3_PCT * 100).toFixed(1)),
        minutesPerGame: parseFloat(f.L10_MIN.toFixed(1)),
      };
    }
  });

  // 10. Call Vertex AI in batches of 10
  const allPredictions = [];
  for (let i = 0; i < featuresList.length; i += 10) {
    const batch = featuresList.slice(i, i + 10);
    try {
      const preds = await predictBatch(batch);
      allPredictions.push(...preds);
    } catch (err) {
      console.error(`[EdgeBoard] Vertex AI batch error:`, err.message);
      allPredictions.push(...batch.map(() => null));
    }
  }

  // 11. Combine props with predictions + sanity filter + green score
  const results = [];
  let filteredBySanity = 0;
  enrichedProps.forEach((prop, idx) => {
    const pred = allPredictions[idx];
    if (!pred) return;

    const confidence = pred.confidence;
    const shouldBet = confidence > 0.10;
    const bettingValue = confidence > 0.15 ? 'high' : confidence >= 0.10 ? 'medium' : 'low';

    if (shouldBet) {
      const hitRates = calculateHitRates(gameLogsMap[prop.playerName], prop.statType, prop.line);
      const pStats = playerStatsMap[prop.playerName];
      const opponentTeam = prop.team === homeTeam ? awayTeam : homeTeam;
      const opponentDefense = getOpponentStatForProp(oppStatsData, opponentTeam, prop.statType);

      // Sanity check
      const l10Avg = getL10AvgForStat(pStats, prop.statType, featuresList[idx]);
      const sanity = passesSanityCheck({
        prediction: pred.prediction,
        l10Avg,
        line: prop.line,
        hitRates,
        opponentDefense,
      });
      if (!sanity.pass) {
        filteredBySanity++;
        console.log(`[EdgeBoard] FILTERED: ${prop.playerName} ${pred.prediction} ${prop.line} ${prop.statType} — ${sanity.reason}`);
        return;
      }

      // Reasoning features
      const reasoning = getReasoningFeatures(featuresList[idx], prop.statType);

      // Temperature-scaled + capped probabilities
      const calOver = calibrateProbability(pred.probability_over);
      const calUnder = calibrateProbability(pred.probability_under);
      const cappedOver = Math.min(calOver, PROB_CAP);
      const cappedUnder = Math.min(calUnder, PROB_CAP);
      const displayConfidence = Math.min(
        pred.prediction === 'Over' ? calOver : calUnder,
        PROB_CAP
      );

      // Green score
      const isOver = pred.prediction === 'Over';
      const relevantOdds = isOver ? prop.oddsOver : prop.oddsUnder;
      const { score: greenScore, signals: greenSignals } = calculateGreenScore({
        prediction: pred.prediction,
        l10Avg,
        line: prop.line,
        hitRates,
        opponentDefense,
        relevantOdds,
      });

      // Trend
      const trend = parseFloat(getTrendForStat(featuresList[idx], prop.statType).toFixed(1));

      results.push({
        playerName: prop.playerName,
        playerId: playerIdMap[prop.playerName] || null,
        team: prop.team,
        statType: prop.statType,
        line: prop.line,
        prediction: pred.prediction,
        isHome: prop.isHome,
        l10Avg: l10Avg != null ? parseFloat(l10Avg.toFixed(1)) : null,
        trend,
        probabilityOver: parseFloat(cappedOver.toFixed(4)),
        probabilityUnder: parseFloat(cappedUnder.toFixed(4)),
        confidence,
        confidencePercent: (confidence * 100).toFixed(1),
        confidenceTier: bettingValue,
        oddsOver: prop.oddsOver,
        oddsUnder: prop.oddsUnder,
        gamesUsed: gameLogsMap[prop.playerName].length,
        playerStats: pStats || null,
        rawProbabilityOver: pred.probability_over,
        rawProbabilityUnder: pred.probability_under,
        displayConfidence: parseFloat(displayConfidence.toFixed(4)),
        displayConfidencePercent: (displayConfidence * 100).toFixed(1),
        bookmakerOver: normalizeBookmaker(prop.bookmakerOver),
        bookmakerUnder: normalizeBookmaker(prop.bookmakerUnder),
        hitRates,
        reasoning,
        opponent: opponentTeam,
        opponentDefense,
        greenScore,
        greenSignals,
      });
    }
  });

  // 12. Filter out goblin-tier odds, sort by display confidence, take top 10
  const edgeResults = results.filter(r => {
    const relevantOdds = r.prediction === 'Over' ? r.oddsOver : r.oddsUnder;
    return relevantOdds == null || relevantOdds >= EDGEBOARD_ODDS_CEILING;
  });
  console.log(`[EdgeBoard] ${results.length} total → ${edgeResults.length} after odds ceiling (≥${EDGEBOARD_ODDS_CEILING}), ${results.length - edgeResults.length} goblin-tier excluded`);
  edgeResults.sort((a, b) => b.displayConfidence - a.displayConfidence);
  const topProps = edgeResults.slice(0, 10);

  const highCount = topProps.filter(p => p.confidenceTier === 'high').length;
  const mediumCount = topProps.filter(p => p.confidenceTier === 'medium').length;
  const greenDist = [0,1,2,3,4,5].map(s => topProps.filter(p => p.greenScore === s).length);
  console.log(`[EdgeBoard] ${results.length} props passed (${highCount} high, ${mediumCount} medium, ${filteredBySanity} filtered by sanity)`);
  console.log(`[EdgeBoard] Green scores in top10: 5★=${greenDist[5]} 4★=${greenDist[4]} 3★=${greenDist[3]} 2★=${greenDist[2]} 1★=${greenDist[1]} 0★=${greenDist[0]}`);

  // 13. Alt Lines: Use pre-fetched alt props to enrich each prop
  const goblinLegs = [];

  for (const prop of topProps) {
    const altKey = `${prop.playerName}|${prop.statType.toLowerCase()}`;
    const altLines = altLinesMap.get(altKey) || [];

    prop.altLines = altLines;

    const goblin = findBestGoblinLine(altLines, prop.prediction, prop.l10Avg);
    if (goblin) {
      prop.goblinLine = goblin;

      const goblinHitRates = calculateHitRates(
        gameLogsMap[prop.playerName], prop.statType, goblin.line
      );
      prop.goblinHitRates = goblinHitRates;

      goblinLegs.push({
        playerName: prop.playerName,
        team: prop.team,
        statType: prop.statType,
        prediction: prop.prediction,
        standardLine: prop.line,
        goblinLine: goblin.line,
        goblinOdds: goblin.odds,
        goblinBookmaker: goblin.bookmaker,
        l10Avg: prop.l10Avg,
        greenScore: prop.greenScore,
        hitRates: prop.hitRates,
        goblinHitRates,
        opponent: prop.opponent,
        opponentDefense: prop.opponentDefense,
        isHome: prop.isHome,
        bookmakerOver: prop.bookmakerOver,
      });
    }
  }

  goblinLegs.sort((a, b) => a.goblinOdds - b.goblinOdds);
  if (goblinLegs.length > 0) {
    console.log(`[EdgeBoard] Parlay legs found: ${goblinLegs.length} (safest: ${goblinLegs[0].playerName} ${goblinLegs[0].goblinLine} ${goblinLegs[0].statType} @ ${goblinLegs[0].goblinOdds})`);
  }

  const response = {
    success: true,
    sport: 'NBA',
    eventId,
    teams: { home: homeTeam, away: awayTeam },
    gameTime,
    totalPropsAvailable: allProps.length,
    propsAnalyzed: enrichedProps.length,
    filteredBySanityCheck: filteredBySanity,
    highConfidenceCount: highCount,
    mediumConfidenceCount: mediumCount,
    topProps,
    goblinLegs,
    timestamp: new Date().toISOString()
  };

  // Debug mode
  if (debug) {
    const propToFeatIdx = new Map();
    enrichedProps.forEach((p, idx) => {
      propToFeatIdx.set(`${p.playerName}|${p.statType}|${p.line}`, idx);
    });
    response.debug = {
      homeTeamCode,
      awayTeamCode,
      effectiveGameDate,
      topPropsFeatures: topProps.map(tp => {
        const key = `${tp.playerName}|${tp.statType}|${tp.line}`;
        const fidx = propToFeatIdx.get(key);
        return {
          playerName: tp.playerName,
          statType: tp.statType,
          line: tp.line,
          features: fidx !== undefined ? featuresList[fidx] : null,
          vertexPrediction: fidx !== undefined ? allPredictions[fidx] : null
        };
      })
    };
  }

  return response;
}

// ──────────────────────────────────────────────
// STANDALONE WRAPPER (fetches own data, for HTTP & backward compat)
// ──────────────────────────────────────────────

/**
 * Standalone EdgeBoard — fetches data internally then delegates to processEdgeBoard.
 * Used by the HTTP endpoint and legacy callers.
 */
async function getEdgeBoardProps(eventId, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('API_SPORTS_KEY not configured');

  // Fetch all data
  console.log(`[EdgeBoard] Fetching standard props for event ${eventId}...`);
  const { props: standardProps, homeTeam, awayTeam, gameTime } = await fetchStandardProps(eventId);

  if (!standardProps || standardProps.length === 0) {
    return {
      success: true, sport: 'NBA',
      teams: { home: homeTeam, away: awayTeam },
      gameTime, totalPropsAvailable: 0,
      topProps: [], goblinLegs: [],
      message: 'No player props available from The Odds API'
    };
  }

  const oppStatsData = await getOpponentDefensiveStats();

  const uniquePlayers = [...new Set(standardProps.map(p => p.playerName))];
  console.log(`[EdgeBoard] Resolving IDs for ${uniquePlayers.length} unique players`);
  const playerIdMap = await resolvePlayerIdsBatch(uniquePlayers);
  const gameLogsMap = await getGameLogsBatch(playerIdMap);

  const altPropsMap = await fetchAltProps(eventId);

  // Delegate to core processing
  return processEdgeBoard(eventId, {
    standardProps, altPropsMap, playerIdMap, gameLogsMap, oppStatsData,
    homeTeam, awayTeam, gameTime,
  }, options);
}

// ──────────────────────────────────────────────
// HTTP CLOUD FUNCTION (backward compatible)
// ──────────────────────────────────────────────

exports.getMLPlayerPropsV2 = functions.https.onRequest(
  { timeoutSeconds: 300, memory: '1GiB', cors: true },
  async (req, res) => {
    try {
      const { team1, team2, sport, gameDate, debug, oddsApiEventId } = req.body;
      if (!team1 || !team2 || !sport) {
        return res.status(400).json({ error: 'Missing required fields: team1, team2, sport' });
      }
      if (sport.toLowerCase() !== 'nba') {
        return res.status(400).json({ error: 'Only NBA is supported' });
      }

      console.log(`[v2] Processing: ${team1} vs ${team2}`);

      // Resolve event ID: use provided or look up from The Odds API
      let eventId = oddsApiEventId;
      if (!eventId) {
        const event = await findEventByTeams(team1, team2);
        if (!event) {
          return res.status(404).json({ error: 'No matching game found on The Odds API' });
        }
        eventId = event.id;
      }

      const result = await getEdgeBoardProps(eventId, { gameDate, debug });
      return res.status(200).json(result);

    } catch (error) {
      console.error('[v2] Error:', error);
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
);

// Export for direct use by orchestrator (processEdgeBoard) and legacy callers (getEdgeBoardProps)
module.exports = { getEdgeBoardProps, processEdgeBoard, getMLPlayerPropsV2: exports.getMLPlayerPropsV2 };
