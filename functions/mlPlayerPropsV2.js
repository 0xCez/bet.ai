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

// Config — SGO API keys with rotation
const SGO_API_KEYS = [
  'b07ce45b95064ec5b62dcbb1ca5e7cf0',
  '8e767501a24d345e14345882dd4e59f0',
];
let sgoKeyIndex = 0;
const getSGOKey = () => SGO_API_KEYS[sgoKeyIndex % SGO_API_KEYS.length];
const rotateSGOKey = () => { sgoKeyIndex = (sgoKeyIndex + 1) % SGO_API_KEYS.length; };
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
// HIT RATE CALCULATION
// ──────────────────────────────────────────────

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
    season: { over: seasonOver, total: seasonTotal, pct: seasonTotal > 0 ? Math.round((seasonOver / seasonTotal) * 100) : 0 }
  };
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
// OPPONENT DEFENSIVE STATS (NBA.com)
// ──────────────────────────────────────────────

const OPP_STATS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getOpponentDefensiveStats() {
  const db = getDb();
  const season = `${getCurrentNBASeason()}-${String(getCurrentNBASeason() + 1).slice(-2)}`;
  const cacheKey = `nba_opp_stats_${season}`;

  // Check cache
  try {
    const doc = await db.collection('ml_cache').doc(cacheKey).get();
    if (doc.exists) {
      const data = doc.data();
      if (Date.now() - data.fetchedAt < OPP_STATS_CACHE_TTL) {
        console.log('[v2] Opponent stats cache HIT');
        return data;
      }
    }
  } catch (e) {
    console.warn('[v2] Opp stats cache read error:', e.message);
  }

  // Fetch from NBA.com
  console.log('[v2] Fetching opponent stats from NBA.com...');
  try {
    const url = `https://stats.nba.com/stats/leaguedashteamstats?` +
      `Conference=&DateFrom=&DateTo=&Division=&GameScope=&GameSegment=&Height=&` +
      `ISTRound=&LastNGames=0&LeagueID=00&Location=&MeasureType=Opponent&` +
      `Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&` +
      `PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&` +
      `PlusMinus=N&Rank=N&Season=${season}&SeasonSegment=&` +
      `SeasonType=Regular+Season&ShotClockRange=&StarterBench=&` +
      `TeamID=0&TwoWay=0&VsConference=&VsDivision=`;

    const resp = await axios.get(url, {
      headers: {
        'Referer': 'https://www.nba.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.nba.com',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true',
      },
      timeout: 15000
    });

    const headers = resp.data.resultSets[0].headers;
    const rows = resp.data.resultSets[0].rowSet;
    const idx = (name) => headers.indexOf(name);
    const iCity = idx('TEAM_CITY'), iTeamName = idx('TEAM_NAME');
    const iOppPts = idx('OPP_PTS'), iOppReb = idx('OPP_REB'), iOppAst = idx('OPP_AST');
    const iOppStl = idx('OPP_STL'), iOppBlk = idx('OPP_BLK'), iOppTov = idx('OPP_TOV');
    const iOppFg3m = idx('OPP_FG3M');

    // Build team key: try "City Name" first, fall back to just "Name"
    const teams = {};
    for (const row of rows) {
      const city = iCity >= 0 ? row[iCity] : null;
      const name = iTeamName >= 0 ? row[iTeamName] : null;
      if (!name) continue;
      const fullName = city ? `${city} ${name}` : name;
      const key = fullName.toLowerCase().trim();
      teams[key] = {
        oppPts: row[iOppPts], oppReb: row[iOppReb], oppAst: row[iOppAst],
        oppStl: row[iOppStl], oppBlk: row[iOppBlk], oppTov: row[iOppTov],
        oppFg3m: row[iOppFg3m],
      };
    }

    // Compute ranks (1 = fewest allowed = best defense, 30 = most allowed = worst)
    const ranks = {};
    for (const stat of ['oppPts', 'oppReb', 'oppAst', 'oppStl', 'oppBlk', 'oppTov', 'oppFg3m']) {
      const sorted = Object.entries(teams).sort((a, b) => a[1][stat] - b[1][stat]);
      sorted.forEach(([teamKey], i) => {
        if (!ranks[teamKey]) ranks[teamKey] = {};
        ranks[teamKey][stat + 'Rank'] = i + 1;
      });
    }

    const cacheData = { season, fetchedAt: Date.now(), teams, ranks };
    try { await db.collection('ml_cache').doc(cacheKey).set(cacheData); } catch (e) { /* silent */ }

    console.log(`[v2] Opponent stats fetched for ${Object.keys(teams).length} teams`);
    return cacheData;

  } catch (err) {
    console.error('[v2] NBA.com opponent stats failed:', err.message);
    return null;
  }
}

function getOpponentStatForProp(oppStatsData, oppTeamName, statType) {
  if (!oppStatsData || !oppTeamName) return null;

  const key = oppTeamName.toLowerCase().trim();
  const stats = oppStatsData.teams?.[key];
  const rankData = oppStatsData.ranks?.[key];
  if (!stats || !rankData) {
    return null;
  }

  const st = statType.toLowerCase();
  const result = {};

  if (st === 'points' || st.includes('points'))     { result.allowed = stats.oppPts; result.rank = rankData.oppPtsRank; result.stat = 'PTS'; }
  if (st === 'rebounds' || st.includes('rebounds'))   { result.allowedReb = stats.oppReb; result.rankReb = rankData.oppRebRank; result.statReb = 'REB'; }
  if (st === 'assists' || st.includes('assists'))     { result.allowedAst = stats.oppAst; result.rankAst = rankData.oppAstRank; result.statAst = 'AST'; }
  if (st === 'steals')              { result.allowed = stats.oppStl; result.rank = rankData.oppStlRank; result.stat = 'STL'; }
  if (st === 'blocks')              { result.allowed = stats.oppBlk; result.rank = rankData.oppBlkRank; result.stat = 'BLK'; }
  if (st === 'turnovers')           { result.allowed = stats.oppTov; result.rank = rankData.oppTovRank; result.stat = 'TOV'; }
  if (st === 'threepointersmade')   { result.allowed = stats.oppFg3m; result.rank = rankData.oppFg3mRank; result.stat = '3PM'; }

  return Object.keys(result).length > 0 ? result : null;
}

// ──────────────────────────────────────────────
// TEMPERATURE SCALING & SANITY FILTER
// ──────────────────────────────────────────────

/**
 * Temperature scaling: prob → logit → divide by T → re-sigmoid.
 * T > 1 softens extreme probabilities toward 50% (more honest for a 65%-accurate model).
 * T = 2.0 empirically tested: 95% → 82%, 5% → 18%, 60% stays ~55%.
 */
function calibrateProbability(prob, T = 2.0) {
  const p = Math.max(0.001, Math.min(0.999, prob));
  const logit = Math.log(p / (1 - p));
  return 1 / (1 + Math.exp(-logit / T));
}

/**
 * Get the L10 average for a specific stat type (matches SGO stat IDs).
 * Returns null if we can't compute it.
 */
function getL10AvgForStat(playerStats, statType, features) {
  const st = statType.toLowerCase();
  switch (st) {
    case 'points': return playerStats?.pointsPerGame ?? null;
    case 'rebounds': return playerStats?.reboundsPerGame ?? null;
    case 'assists': return playerStats?.assistsPerGame ?? null;
    case 'steals': return playerStats?.stealsPerGame ?? null;
    case 'blocks': return playerStats?.blocksPerGame ?? null;
    case 'turnovers': return features?.L10_TOV ?? null;
    case 'threepointersmade': return features?.L10_FG3M ?? null;
    case 'points+rebounds':
      return (playerStats?.pointsPerGame ?? 0) + (playerStats?.reboundsPerGame ?? 0);
    case 'points+assists':
      return (playerStats?.pointsPerGame ?? 0) + (playerStats?.assistsPerGame ?? 0);
    case 'rebounds+assists':
      return (playerStats?.reboundsPerGame ?? 0) + (playerStats?.assistsPerGame ?? 0);
    case 'points+rebounds+assists':
      return (playerStats?.pointsPerGame ?? 0) + (playerStats?.reboundsPerGame ?? 0) + (playerStats?.assistsPerGame ?? 0);
    case 'blocks+steals':
      return (playerStats?.blocksPerGame ?? 0) + (playerStats?.stealsPerGame ?? 0);
    default: return null;
  }
}

/**
 * Avg-gated sanity check:
 *
 *   • Avg on RIGHT side of line → PASS (tags on card show quality signals)
 *   • Avg on WRONG side of line → need 2+ supporting signals to survive
 *
 * Supporting signals (when avg is wrong-side):
 *   1. Opponent defense rank — weak DEF (21-30) supports Over, strong DEF (1-10) supports Under
 *   2. L10 hit rate — ≥60% over-rate supports Over, ≤40% supports Under
 *   3. Season hit rate — same thresholds as L10
 *
 * This catches "Under 19.5, avg 19.8, vs 29th DEF" while allowing edge cases
 * like "Over 25.5, avg 24.0, vs 28th DEF, 8/10 hit" to survive.
 */
function passesSanityCheck(prediction, statType, line, playerStats, hitRates, features, opponentDefense) {
  const l10Avg = getL10AvgForStat(playerStats, statType, features);
  if (l10Avg === null || line === 0) return { pass: true, reason: 'insufficient_data' };

  const isOver = prediction === 'Over';
  const avgOnRightSide = isOver ? l10Avg >= line : l10Avg <= line;

  // ── Avg on RIGHT side → PASS ──
  // Other signals (defense, hit rate) show as color-coded tags on the card
  if (avgOnRightSide) {
    return { pass: true, reason: 'avg_supports' };
  }

  // ── Avg on WRONG side → need 2+ supporting signals to override ──
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

  // Signal 2: L10 hit rate (pct = over-rate)
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

  // Need 2+ supporting signals to override wrong-side avg
  if (supporting >= 2) {
    return { pass: true, reason: `avg wrong side but ${supporting}/3 signals support — override` };
  }

  return { pass: false, reason: `avg wrong side, only ${supporting}/3 support: ${details.join('; ')}` };
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
async function getGameLogs(playerId, apiKey, limit = 82) {
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
  if (!arr || arr.length <= 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (arr.length - 1));
}

function daysBetween(d1, d2) {
  return Math.ceil(Math.abs(new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function americanToImpliedProb(odds) {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

/**
 * Get the L3 stat matching the prop_type (uses SUM for combos).
 * Used for LINE_VALUE computation per FEATURES_88_COMPLETE.md Section 13.
 */
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

/**
 * Get the relevant stat for market comparison (uses PRIMARY stat, not combo sum).
 * Used for L3_vs_market and L10_vs_market per FEATURES_88_COMPLETE.md Section 13.
 */
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
 * Build all 88 features from game logs + prop data
 * Matches FEATURES_88_COMPLETE.md exactly
 */
function buildFeatures(gameLogs, prop, homeTeam, awayTeam, gameDate) {
  const l3Games = gameLogs.slice(0, 3);
  const l10Games = gameLogs.slice(0, 10);

  // ── L3 Stats (simple mean of per-game values per spec) ──
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
    // Per-game FG_PCT for simple mean (spec: mean of per-game values, not weighted)
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

  // ── L10 Stats (simple mean of per-game values per spec) ──
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
    // Per-game FG_PCT for simple mean
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

  // Compute rest/schedule from game log dates when available (spec default: 3)
  let DAYS_REST = 3;
  let GAMES_IN_LAST_7 = 3;
  const upcomingDate = new Date(gameDate);
  if (!isNaN(upcomingDate.getTime()) && gameLogs.length > 0) {
    // Try to get date of most recent game for DAYS_REST
    const mostRecentDate = gameLogs[0]?.game?.date ? new Date(gameLogs[0].game.date) : null;
    if (mostRecentDate && !isNaN(mostRecentDate.getTime())) {
      DAYS_REST = Math.max(1, Math.round((upcomingDate - mostRecentDate) / (1000 * 60 * 60 * 24)));
    }
    // Count games in last 7 days (exclusive of game day)
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
  const EFFICIENCY_STABLE = L3_PTS >= L10_PTS ? 1 : 0; // Hot streak flag per spec

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

  // ── Resolve model prop_type BEFORE betting features (needed for prop-dependent calcs) ──
  const propTypeMap = {
    'points': 'points',
    'rebounds': 'rebounds',
    'assists': 'assists',
    'threePointersMade': 'threes',   // Bug fix: was 'threePointersMade', model expects 'threes'
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

  // Prop-type-dependent: LINE_VALUE uses stat sum (combos add up), market uses primary stat
  const rawFeats = { L3_PTS, L3_REB, L3_AST, L3_FG3M, L3_BLK, L3_STL, L3_TOV, L10_PTS, L10_REB, L10_AST, L10_FG3M, L10_BLK, L10_STL, L10_TOV };
  const l3Stat = getL3StatForProp(modelPropType, rawFeats);
  const LINE_VALUE = line !== 0 ? (l3Stat - line) / line : 0;

  const ODDS_EDGE = implied_prob_over - implied_prob_under;
  const odds_spread = odds_over - odds_under;
  const market_confidence = Math.abs(implied_prob_over - 0.5);
  // These ALWAYS compare specific stats vs line regardless of prop_type (cross-stat context)
  const L3_PTS_vs_LINE = L3_PTS - line;
  const L3_REB_vs_LINE = L3_REB - line;
  const L3_AST_vs_LINE = L3_AST - line;
  const LINE_DIFFICULTY_PTS = L10_PTS !== 0 ? line / L10_PTS : 1;
  const LINE_DIFFICULTY_REB = L10_REB !== 0 ? line / L10_REB : 1;
  const LINE_DIFFICULTY_AST = L10_AST !== 0 ? line / L10_AST : 1;
  const LINE_vs_AVG_PTS = line - L10_PTS;
  const LINE_vs_AVG_REB = line - L10_REB;
  // Market features use PRIMARY stat per prop type (not combo sum)
  const l3MarketStat = getMarketStat(modelPropType, rawFeats, 'L3');
  const l10MarketStat = getMarketStat(modelPropType, rawFeats, 'L10');
  const L3_vs_market = (l3MarketStat - line) * implied_prob_over;
  const L10_vs_market = (l10MarketStat - line) * implied_prob_over;

  // ── Temporal ──
  const date = new Date(gameDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day_of_week = (date.getDay() + 6) % 7; // Python weekday convention: Mon=0, Sun=6

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
// SGO API
// ──────────────────────────────────────────────

async function fetchSGOEvent(team1, team2) {
  let response;
  for (let attempt = 0; attempt < SGO_API_KEYS.length; attempt++) {
    const url = `${SGO_BASE_URL}/events/?apiKey=${getSGOKey()}&leagueID=NBA&oddsAvailable=true&limit=50`;
    try {
      response = await axios.get(url, { headers: { 'Accept': 'application/json' }, timeout: 15000 });
      break;
    } catch (err) {
      if (err.response?.status === 429 && attempt < SGO_API_KEYS.length - 1) {
        console.warn(`[v2] SGO key ${sgoKeyIndex + 1} rate-limited, rotating...`);
        rotateSGOKey();
        continue;
      }
      throw err;
    }
  }

  if (!response?.data?.data) return null;

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
      const { team1, team2, sport, gameDate, debug } = req.body;
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

      // 2.5: Fetch opponent defensive stats (ONE call, cached 24h)
      const oppStatsData = await getOpponentDefensiveStats();

      const homeTeamLong = event.teams.home.names.long;
      const awayTeamLong = event.teams.away.names.long;

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

      // 6. Combine props with predictions + enhanced data
      const results = [];
      let filteredBySanity = 0;
      processableProps.forEach((prop, idx) => {
        const pred = allPredictions[idx];
        if (!pred) return;

        const confidence = pred.confidence;
        const shouldBet = confidence > 0.10;
        const bettingValue = confidence > 0.15 ? 'high' : confidence >= 0.10 ? 'medium' : 'low';

        if (shouldBet) {
          // Hit rates from raw game logs
          const hitRates = calculateHitRates(gameLogsMap[prop.playerName], prop.statType, prop.line);
          const pStats = playerStatsMap[prop.playerName];

          // Compute opponent defense BEFORE sanity check (needed for multi-signal filter)
          const opponentTeam = prop.team === homeTeamLong ? awayTeamLong : homeTeamLong;
          const opponentDefense = getOpponentStatForProp(oppStatsData, opponentTeam, prop.statType);

          // Multi-signal sanity check: filters props where 2+ data points contradict
          const sanity = passesSanityCheck(pred.prediction, prop.statType, prop.line, pStats, hitRates, featuresList[idx], opponentDefense);
          if (!sanity.pass) {
            filteredBySanity++;
            console.log(`[v2] FILTERED: ${prop.playerName} ${pred.prediction} ${prop.line} ${prop.statType} — ${sanity.reason}`);
            return;
          }

          // Key reasoning features (model's "why")
          const reasoning = getReasoningFeatures(featuresList[idx], prop.statType);

          // Temperature-scaled probabilities for display (T=2.0)
          const calOver = calibrateProbability(pred.probability_over);
          const calUnder = calibrateProbability(pred.probability_under);

          // Hard cap: model is ~65% accurate, never display probability > 85%
          const PROB_CAP = 0.85;
          const cappedOver = Math.min(calOver, PROB_CAP);
          const cappedUnder = Math.min(calUnder, PROB_CAP);
          const displayConfidence = Math.min(
            pred.prediction === 'Over' ? calOver : calUnder,
            PROB_CAP
          );

          results.push({
            // Core fields — probabilities are CALIBRATED (T=2.0) and CAPPED at 85%
            playerName: prop.playerName,
            team: prop.team,
            statType: prop.statType,
            line: prop.line,
            prediction: pred.prediction,
            probabilityOver: parseFloat(cappedOver.toFixed(4)),
            probabilityUnder: parseFloat(cappedUnder.toFixed(4)),
            confidence,
            confidencePercent: (confidence * 100).toFixed(1),
            confidenceTier: bettingValue,
            oddsOver: prop.oddsOver,
            oddsUnder: prop.oddsUnder,
            gamesUsed: gameLogsMap[prop.playerName].length,
            playerStats: pStats || null,

            // Raw model probabilities (before calibration, for debugging)
            rawProbabilityOver: pred.probability_over,
            rawProbabilityUnder: pred.probability_under,

            // Convenience fields (also capped)
            displayConfidence: parseFloat(displayConfidence.toFixed(4)),
            displayConfidencePercent: (displayConfidence * 100).toFixed(1),

            // Bookmaker names
            bookmakerOver: normalizeBookmaker(prop.bookmakerOver),
            bookmakerUnder: normalizeBookmaker(prop.bookmakerUnder),

            // Hit rates
            hitRates,

            // Model reasoning
            reasoning,

            // Opponent defense
            opponent: opponentTeam,
            opponentDefense,
          });
        }
      });

      // Sort by calibrated display confidence (descending) and take top 10
      results.sort((a, b) => b.displayConfidence - a.displayConfidence);
      const topProps = results.slice(0, 10);

      const highCount = topProps.filter(p => p.confidenceTier === 'high').length;
      const mediumCount = topProps.filter(p => p.confidenceTier === 'medium').length;

      console.log(`[v2] ${results.length} props passed (${highCount} high, ${mediumCount} medium, ${filteredBySanity} filtered by sanity check)`);

      const response = {
        success: true,
        sport: 'NBA',
        eventId: event.eventID,
        teams: { home: event.teams.home.names.long, away: event.teams.away.names.long },
        gameTime: event.status.startsAt,
        totalPropsAvailable: allProps.length,
        propsAnalyzed: processableProps.length,
        filteredBySanityCheck: filteredBySanity,
        highConfidenceCount: highCount,
        mediumConfidenceCount: mediumCount,
        topProps,
        timestamp: new Date().toISOString()
      };

      // Debug mode: include raw features for top props (sorted by confidence)
      if (debug) {
        const propToFeatIdx = new Map();
        processableProps.forEach((p, idx) => {
          propToFeatIdx.set(`${p.playerName}|${p.statType}|${p.line}`, idx);
        });
        response.debug = {
          homeTeamCode,
          awayTeamCode,
          effectiveGameDate,
          topPropsFeatures: topProps.map(tp => {
            const key = `${tp.playerName}|${tp.statType}|${tp.line}`;
            const idx = propToFeatIdx.get(key);
            return {
              playerName: tp.playerName,
              statType: tp.statType,
              line: tp.line,
              features: idx !== undefined ? featuresList[idx] : null,
              vertexPrediction: idx !== undefined ? allPredictions[idx] : null
            };
          })
        };
      }

      return res.status(200).json(response);

    } catch (error) {
      console.error('[v2] Error:', error);
      return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
);
