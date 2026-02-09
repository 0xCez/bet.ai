/**
 * ML Player Props Cloud Function v2
 * Clean rewrite that correctly integrates with Vertex AI
 *
 * Key fixes from v1:
 * - Dynamically resolves player IDs via API-Sports search (no stale ID mapping)
 * - Correct season calculation
 * - Feature engineering matches API_DOCUMENTATION.md exactly
 * - Caches player ID lookups to save API calls
 */

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

// Lazy init
let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

// Config
const SGO_API_KEY = 'b07ce45b95064ec5b62dcbb1ca5e7cf0';
const SGO_BASE_URL = 'https://api.sportsgameodds.com/v2';

const VERTEX_ENDPOINT = 'https://us-central1-aiplatform.googleapis.com/v1/projects/133991312998/locations/us-central1/endpoints/7508590194849742848:predict';

// Cache for player ID lookups (persists across invocations in same instance)
const playerIdCache = {};

// Token cache
let cachedToken = null;
let tokenExpiry = 0;

// SGO bookmaker names are lowercase ("draftkings") but model trained on capitalized ("DraftKings")
const BOOKMAKER_MAP = {
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'betmgm': 'BetMGM',
  'caesars': 'Caesars',
  'bovada': 'Bovada',
  'pointsbet': 'PointsBet',
  'bet365': 'Bet365',
  'betrivers': 'BetRivers',
  'unibet': 'Unibet',
  'wynnbet': 'WynnBet',
  'hardrock': 'Hard Rock',
};

function normalizeBookmaker(name) {
  if (!name) return null;
  return BOOKMAKER_MAP[name.toLowerCase()] || name;
}

// ──────────────────────────────────────────────
// API-SPORTS HELPERS
// ──────────────────────────────────────────────

function getApiKey() {
  try {
    return functions.config().apisports?.key || process.env.API_SPORTS_KEY;
  } catch (e) {
    return process.env.API_SPORTS_KEY;
  }
}

function getCurrentNBASeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // NBA season starts in October. If Oct-Dec, use current year. If Jan-Sep, use previous year.
  return month >= 10 ? year : year - 1;
}

/**
 * Search for a player by name and return their API-Sports ID
 * Caches results to avoid repeated lookups
 */
async function findPlayerId(playerName, apiKey) {
  // Check cache first
  const cacheKey = playerName.toLowerCase().trim();
  if (playerIdCache[cacheKey]) {
    return playerIdCache[cacheKey];
  }

  try {
    // Use last name for search (more reliable)
    const parts = playerName.trim().split(' ');
    const lastName = parts[parts.length - 1];

    const response = await axios.get(
      `https://v2.nba.api-sports.io/players?search=${encodeURIComponent(lastName)}`,
      {
        headers: { 'x-apisports-key': apiKey },
        timeout: 10000
      }
    );

    if (!response.data?.response?.length) {
      console.log(`[v2] Player not found: ${playerName}`);
      return null;
    }

    // Find best match by comparing full names
    const normalizedSearch = playerName.toLowerCase().replace(/[^a-z\s]/g, '').trim();

    for (const p of response.data.response) {
      const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase().replace(/[^a-z\s]/g, '').trim();
      if (fullName === normalizedSearch) {
        playerIdCache[cacheKey] = p.id;
        console.log(`[v2] Found ${playerName} -> ID ${p.id}`);
        return p.id;
      }
    }

    // Partial match: first + last name contains
    for (const p of response.data.response) {
      const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase();
      if (fullName.includes(normalizedSearch) || normalizedSearch.includes(fullName)) {
        playerIdCache[cacheKey] = p.id;
        console.log(`[v2] Partial match ${playerName} -> ${p.firstname} ${p.lastname} (ID ${p.id})`);
        return p.id;
      }
    }

    // Fallback: use first result with matching last name
    const first = response.data.response[0];
    playerIdCache[cacheKey] = first.id;
    console.log(`[v2] Best guess ${playerName} -> ${first.firstname} ${first.lastname} (ID ${first.id})`);
    return first.id;

  } catch (err) {
    console.error(`[v2] Error searching player ${playerName}:`, err.message);
    return null;
  }
}

/**
 * Fetch game logs for a player
 */
async function getGameLogs(playerId, apiKey, limit = 15) {
  try {
    const season = getCurrentNBASeason();
    const response = await axios.get(
      `https://v2.nba.api-sports.io/players/statistics?season=${season}&id=${playerId}`,
      {
        headers: { 'x-apisports-key': apiKey },
        timeout: 10000
      }
    );

    if (response.data?.errors?.length > 0 || !response.data?.response?.length) {
      // Try previous season as fallback
      const prevResponse = await axios.get(
        `https://v2.nba.api-sports.io/players/statistics?season=${season - 1}&id=${playerId}`,
        {
          headers: { 'x-apisports-key': apiKey },
          timeout: 10000
        }
      );

      if (!prevResponse.data?.response?.length) {
        return [];
      }

      let logs = prevResponse.data.response;
      // Sort by game.id DESC (higher ID = more recent). game.date is often null in API-Sports.
    logs.sort((a, b) => (b.game?.id || 0) - (a.game?.id || 0));
      return logs.slice(0, limit);
    }

    let logs = response.data.response;
    // Sort by game.id DESC (higher ID = more recent). game.date is often null in API-Sports.
    logs.sort((a, b) => (b.game?.id || 0) - (a.game?.id || 0));
    return logs.slice(0, limit);

  } catch (err) {
    console.error(`[v2] Error fetching game logs for ${playerId}:`, err.message);
    return [];
  }
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
  if (!arr || arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length);
}

function daysBetween(d1, d2) {
  return Math.ceil(Math.abs(new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function americanToImpliedProb(odds) {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

/**
 * Build all 88 features from game logs + prop data
 * Matches API_DOCUMENTATION.md exactly
 */
function buildFeatures(gameLogs, prop, homeTeam, awayTeam, gameDate) {
  const l3Games = gameLogs.slice(0, 3);
  const l10Games = gameLogs.slice(0, 10);

  // ── L3 Stats ──
  const l3Count = l3Games.length || 1;
  let l3 = { pts: 0, reb: 0, ast: 0, min: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, stl: 0, blk: 0, tov: 0 };
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
  });

  const L3_PTS = l3.pts / l3Count;
  const L3_REB = l3.reb / l3Count;
  const L3_AST = l3.ast / l3Count;
  const L3_MIN = l3.min / l3Count;
  const L3_FG_PCT = l3.fga > 0 ? l3.fgm / l3.fga : 0;       // 0-1 decimal
  const L3_FG3M = l3.fg3m / l3Count;
  const L3_FG3_PCT = l3.fg3a > 0 ? l3.fg3m / l3.fg3a : 0;    // 0-1 decimal
  const L3_STL = l3.stl / l3Count;
  const L3_BLK = l3.blk / l3Count;
  const L3_TOV = l3.tov / l3Count;
  const L3_FGM = l3.fgm / l3Count;
  const L3_FGA = l3.fga / l3Count;

  // ── L10 Stats ──
  const l10Count = l10Games.length || 1;
  let l10 = { pts: 0, reb: 0, ast: 0, min: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, stl: 0, blk: 0, tov: 0 };
  const ptsArr = [], rebArr = [], astArr = [];
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
  });

  const L10_PTS = l10.pts / l10Count;
  const L10_REB = l10.reb / l10Count;
  const L10_AST = l10.ast / l10Count;
  const L10_MIN = l10.min / l10Count;
  const L10_FG_PCT = l10.fga > 0 ? l10.fgm / l10.fga : 0;
  const L10_FG3M = l10.fg3m / l10Count;
  const L10_FG3_PCT = l10.fg3a > 0 ? l10.fg3m / l10.fg3a : 0;
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
  // API-Sports game.date is often null; use reasonable defaults
  const DAYS_REST = 2;        // Typical NBA rest
  const BACK_TO_BACK = 0;     // Default: not B2B
  const GAMES_IN_LAST_7 = 3;  // Typical NBA schedule
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
  const EFFICIENCY_STABLE = Math.abs(L3_FG_PCT - L10_FG_PCT) < 0.05 ? 1 : 0;

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

  // ── Betting Line Features ──
  const line = prop.line;
  const odds_over = prop.oddsOver;
  const odds_under = prop.oddsUnder;
  const implied_prob_over = americanToImpliedProb(odds_over);
  const implied_prob_under = americanToImpliedProb(odds_under);
  const LINE_VALUE = line !== 0 ? (L3_PTS - line) / line : 0;
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
  const L3_vs_market = (L3_PTS - line) * implied_prob_over;
  const L10_vs_market = (L10_PTS - line) * implied_prob_over;

  // ── Temporal ──
  const date = new Date(gameDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day_of_week = date.getDay();

  // ── Season ──
  const SEASON = `${getCurrentNBASeason()}-${(getCurrentNBASeason() + 1) % 100}`;

  // Map SGO stat types to model prop types
  const propTypeMap = {
    'points': 'points',
    'rebounds': 'rebounds',
    'assists': 'assists',
    'threePointersMade': 'threePointersMade',
    'steals': 'steals',
    'blocks': 'blocks',
    'turnovers': 'turnovers',
    'points+rebounds': 'points_rebounds',
    'points+assists': 'points_assists',
    'rebounds+assists': 'rebounds_assists',
    'points+rebounds+assists': 'points_rebounds_assists'
  };

  return {
    // Categorical (5)
    prop_type: propTypeMap[prop.statType] || prop.statType,
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
// SGO API
// ──────────────────────────────────────────────

async function fetchSGOEvent(team1, team2) {
  const url = `${SGO_BASE_URL}/events/?apiKey=${SGO_API_KEY}&leagueID=NBA&oddsAvailable=true&limit=50`;
  const response = await axios.get(url, { headers: { 'Accept': 'application/json' }, timeout: 15000 });

  if (!response.data?.data) return null;

  const normalize = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t1 = normalize(team1);
  const t2 = normalize(team2);

  for (const event of response.data.data) {
    const home = normalize(event.teams.home.names.long);
    const away = normalize(event.teams.away.names.long);
    if ((home.includes(t1) || t1.includes(home) || home.includes(t2) || t2.includes(home)) &&
        (away.includes(t1) || t1.includes(away) || away.includes(t2) || t2.includes(away))) {
      return event;
    }
  }
  return null;
}

function extractProps(event) {
  const props = [];
  if (!event.odds || !event.players) return props;

  const playerOddsMap = {};
  for (const odd of Object.values(event.odds)) {
    if (!odd.playerID || odd.betTypeID !== 'ou') continue;
    const key = `${odd.playerID}-${odd.statID}`;
    if (!playerOddsMap[key]) playerOddsMap[key] = {};
    if (odd.sideID === 'over') playerOddsMap[key].over = odd;
    else if (odd.sideID === 'under') playerOddsMap[key].under = odd;
  }

  for (const odds of Object.values(playerOddsMap)) {
    const { over, under } = odds;
    if (!over || !under) continue;

    const player = event.players?.[over.playerID];
    if (!player) continue;

    let playerName = player.name || '';
    if (!playerName && player.firstName && player.lastName) {
      playerName = `${player.firstName} ${player.lastName}`.trim();
    }
    if (!playerName) continue;

    // Get consensus line and best odds
    let lineSum = 0, lineCount = 0;
    let bestOverOdds = -Infinity, bestUnderOdds = -Infinity;
    let bestOverBook = '', bestUnderBook = '';

    if (over.byBookmaker) {
      for (const [bk, bo] of Object.entries(over.byBookmaker)) {
        if (!bo.available || !bo.overUnder) continue;
        const ub = under.byBookmaker?.[bk];
        if (!ub?.available) continue;

        const lv = parseFloat(bo.overUnder);
        if (!isNaN(lv)) { lineSum += lv; lineCount++; }

        const oo = parseInt(bo.odds, 10);
        const uo = parseInt(ub.odds, 10);
        if (oo > bestOverOdds) { bestOverOdds = oo; bestOverBook = bk; }
        if (uo > bestUnderOdds) { bestUnderOdds = uo; bestUnderBook = bk; }
      }
    }

    if (lineCount === 0) continue;

    const playerTeamId = player.teamID || '';
    const isHome = playerTeamId === event.teams.home.teamID;

    props.push({
      playerName,
      team: isHome ? event.teams.home.names.long : event.teams.away.names.long,
      isHome,
      statType: over.statID,
      line: Math.round((lineSum / lineCount) * 10) / 10,
      oddsOver: bestOverOdds,
      oddsUnder: bestUnderOdds,
      bookmakerOver: bestOverBook,
      bookmakerUnder: bestUnderBook
    });
  }

  return props;
}

// ──────────────────────────────────────────────
// MAIN CLOUD FUNCTION
// ──────────────────────────────────────────────

exports.getMLPlayerPropsV2 = functions.https.onRequest(
  { timeoutSeconds: 300, memory: '1GiB', cors: true },
  async (req, res) => {
    try {
      const { team1, team2, sport, gameDate } = req.body;
      if (!team1 || !team2 || !sport) {
        return res.status(400).json({ error: 'Missing required fields: team1, team2, sport' });
      }
      if (sport.toLowerCase() !== 'nba') {
        return res.status(400).json({ error: 'Only NBA is supported' });
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        return res.status(500).json({ error: 'API_SPORTS_KEY not configured' });
      }

      console.log(`[v2] Processing: ${team1} vs ${team2}`);

      // 1. Fetch SGO event
      const event = await fetchSGOEvent(team1, team2);
      if (!event) {
        return res.status(404).json({ error: 'No matching game found' });
      }

      // 2. Extract props
      const allProps = extractProps(event);
      if (allProps.length === 0) {
        return res.status(404).json({ error: 'No player props available' });
      }
      console.log(`[v2] Found ${allProps.length} props from SGO`);

      // 3. Get unique players and resolve their API-Sports IDs
      const uniquePlayers = [...new Set(allProps.map(p => p.playerName))];
      console.log(`[v2] Resolving IDs for ${uniquePlayers.length} unique players`);

      // Resolve player IDs in parallel (batches of 5 to avoid rate limits)
      const playerIdMap = {};
      for (let i = 0; i < uniquePlayers.length; i += 5) {
        const batch = uniquePlayers.slice(i, i + 5);
        const results = await Promise.all(batch.map(name => findPlayerId(name, apiKey)));
        batch.forEach((name, idx) => { playerIdMap[name] = results[idx]; });
      }

      const resolvedCount = Object.values(playerIdMap).filter(id => id !== null).length;
      console.log(`[v2] Resolved ${resolvedCount}/${uniquePlayers.length} player IDs`);

      // 4. Fetch game logs for resolved players (deduplicate)
      const gameLogsMap = {};
      const validPlayerIds = Object.entries(playerIdMap).filter(([, id]) => id !== null);

      for (let i = 0; i < validPlayerIds.length; i += 4) {
        const batch = validPlayerIds.slice(i, i + 4);
        const results = await Promise.all(batch.map(([, id]) => getGameLogs(id, apiKey)));
        batch.forEach(([name], idx) => { gameLogsMap[name] = results[idx]; });
      }

      const withLogs = Object.entries(gameLogsMap).filter(([, logs]) => logs.length > 0);
      console.log(`[v2] Got game logs for ${withLogs.length}/${validPlayerIds.length} players`);

      // 5. Build features and get predictions
      const homeTeamCode = event.teams.home.names.short || event.teams.home.names.long.split(' ').pop().substring(0, 3).toUpperCase();
      const awayTeamCode = event.teams.away.names.short || event.teams.away.names.long.split(' ').pop().substring(0, 3).toUpperCase();
      const effectiveGameDate = gameDate || event.status.startsAt;

      // Filter props to only those with game logs
      const processableProps = allProps.filter(p => gameLogsMap[p.playerName]?.length > 0);
      console.log(`[v2] Processing ${processableProps.length} props through ML`);

      if (processableProps.length === 0) {
        return res.status(200).json({
          success: true, sport: 'NBA',
          teams: { home: event.teams.home.names.long, away: event.teams.away.names.long },
          gameTime: event.status.startsAt,
          totalPropsAvailable: allProps.length,
          topProps: [],
          message: 'No player game logs available for feature engineering'
        });
      }

      // Build features for all processable props
      const featuresList = processableProps.map(prop =>
        buildFeatures(gameLogsMap[prop.playerName], prop, homeTeamCode, awayTeamCode, effectiveGameDate)
      );

      // Build per-player L10 stats lookup (for UI display)
      const playerStatsMap = {};
      processableProps.forEach((prop, idx) => {
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

      // Call Vertex AI in batches of 10
      const allPredictions = [];
      for (let i = 0; i < featuresList.length; i += 10) {
        const batch = featuresList.slice(i, i + 10);
        try {
          const preds = await predictBatch(batch);
          allPredictions.push(...preds);
        } catch (err) {
          console.error(`[v2] Vertex AI batch error:`, err.message);
          // Fill with nulls for failed batch
          allPredictions.push(...batch.map(() => null));
        }
      }

      // 6. Combine props with predictions
      const results = [];
      processableProps.forEach((prop, idx) => {
        const pred = allPredictions[idx];
        if (!pred) return;

        const confidence = pred.confidence;
        const shouldBet = confidence > 0.10;
        const bettingValue = confidence > 0.15 ? 'high' : confidence >= 0.10 ? 'medium' : 'low';

        if (shouldBet) {
          results.push({
            playerName: prop.playerName,
            team: prop.team,
            statType: prop.statType,
            line: prop.line,
            prediction: pred.prediction,
            probabilityOver: pred.probability_over,
            probabilityUnder: pred.probability_under,
            confidence,
            confidencePercent: (confidence * 100).toFixed(1),
            confidenceTier: bettingValue,
            oddsOver: prop.oddsOver,
            oddsUnder: prop.oddsUnder,
            gamesUsed: gameLogsMap[prop.playerName].length,
            playerStats: playerStatsMap[prop.playerName] || null
          });
        }
      });

      // Sort by confidence (descending) and take top 10
      results.sort((a, b) => b.confidence - a.confidence);
      const topProps = results.slice(0, 10);

      const highCount = topProps.filter(p => p.confidenceTier === 'high').length;
      const mediumCount = topProps.filter(p => p.confidenceTier === 'medium').length;

      console.log(`[v2] ${results.length} recommended props (${highCount} high, ${mediumCount} medium)`);

      return res.status(200).json({
        success: true,
        sport: 'NBA',
        eventId: event.eventID,
        teams: { home: event.teams.home.names.long, away: event.teams.away.names.long },
        gameTime: event.status.startsAt,
        totalPropsAvailable: allProps.length,
        propsAnalyzed: processableProps.length,
        highConfidenceCount: highCount,
        mediumConfidenceCount: mediumCount,
        topProps,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[v2] Error:', error);
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
);
