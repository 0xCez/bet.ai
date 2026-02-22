/**
 * playerPropChart.js — Per-player prop detail data endpoint
 *
 * Serves all data needed for the PropsEdge-style player prop visual:
 * - Player header (name, position, team, headshot)
 * - Per-game bar chart data (last 20 games with stat value, date, opponent, hit/miss)
 * - Extended hit rates (L5, L10, L20, Season, H2H)
 * - Prop details (line, odds, bookmaker, prediction, trend, defense)
 *
 * Reads from existing Firestore caches only — zero new external API calls
 * during request handling (game logs already cached by pipeline runs).
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Shared modules
const { resolvePlayerId, getGameLogs, getTeamSchedule, getPlayerPosition } = require('./shared/playerStats');
const { getStatValue, calculateExtendedHitRates, calculateH2HHitRate, getL10Average, getTrend } = require('./shared/hitRates');
const { resolveEspnPlayer } = require('./shared/espnHeadshot');

let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

// ── Shared Mappings ──

const STAT_DISPLAY = {
  'points': 'POINTS', 'rebounds': 'REBOUNDS', 'assists': 'ASSISTS',
  'threePointersMade': '3PT MADE', 'blocks': 'BLOCKS', 'steals': 'STEALS',
  'turnovers': 'TURNOVERS',
  'points+rebounds+assists': 'PTS+REB+AST', 'points+rebounds': 'PTS+REB',
  'points+assists': 'PTS+AST', 'rebounds+assists': 'REB+AST',
};

const TEAM_CODE = {
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC', 'LA Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL', 'LA Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};
function teamCode(name) { return TEAM_CODE[name] || name?.split(' ').pop()?.substring(0, 3)?.toUpperCase() || '???'; }

const BOOK_SHORT = {
  'DraftKings': 'DK', 'FanDuel': 'FD', 'BetMGM': 'MGM',
  'Caesars': 'CAESARS', 'ESPNBet': 'ESPN', 'Bet365': 'BET365',
  'Bovada': 'BOV', 'BetRivers': 'BR', 'Unibet': 'UNI',
  'Hard Rock': 'HR', 'Fanatics': 'FAN', 'BallyBet': 'BALLY',
};
function shortBook(name) { return BOOK_SHORT[name] || name; }

/**
 * Format ISO date string to short display: "Feb 19"
 */
function formatDisplayDate(isoDate) {
  if (!isoDate) return '???';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '???';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Find the matching prop for a player in the matchAnalysisCache.
 * Searches EdgeBoard topProps and Parlay Stack legs across all upcoming games.
 * Also collects ALL parlay stack legs for this player (safe alt lines).
 *
 * @returns {{ prop, game, source, safeLines }} or null
 */
async function findPropInCache(playerName, statType, line) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  const snapshot = await getDb().collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  const upcoming = snapshot.docs.filter(doc => {
    const data = doc.data();
    return data.gameStartTime && data.gameStartTime > cutoff;
  });

  const nameNorm = playerName.toLowerCase().trim();
  let result = null;

  // Collect ALL parlay stack legs for this player across all games
  const allPlayerStackLegs = [];

  for (const doc of upcoming) {
    const data = doc.data();
    const ml = data.analysis?.mlPlayerProps || {};
    const home = data.analysis?.teams?.home;
    const away = data.analysis?.teams?.away;
    const gameTime = data.gameStartTime;

    // Collect all parlay stack legs for this player (any stat type)
    const legs = ml.parlayStack?.legs || [];
    for (const p of legs) {
      if (p.playerName?.toLowerCase().trim() === nameNorm) {
        allPlayerStackLegs.push(p);
      }
    }

    // Only search for the matching prop if we haven't found it yet
    if (result) continue;

    // Search EdgeBoard topProps
    const topProps = ml.edgeBoard?.topProps || ml.topProps || [];
    for (const p of topProps) {
      if (p.playerName?.toLowerCase().trim() === nameNorm &&
          p.statType?.toLowerCase() === statType.toLowerCase() &&
          p.line === line) {
        const isOver = p.prediction === 'Over';
        result = {
          prop: {
            stat: STAT_DISPLAY[p.statType] || p.statType,
            statType: p.statType,
            line: p.line,
            prediction: p.prediction?.toLowerCase() || 'over',
            oddsOver: p.oddsOver,
            oddsUnder: p.oddsUnder,
            bookmaker: shortBook(isOver ? p.bookmakerOver : p.bookmakerUnder),
            avg: p.l10Avg,
            trend: p.trend,
            green: p.greenScore,
            defRank: p.opponentDefense?.rank ?? null,
          },
          game: {
            home, away, gameTime,
            team: p.team,
            opponent: p.opponent,
            isHome: p.isHome,
          },
          source: 'edge',
        };
        break;
      }
    }

    if (result) continue;

    // Search Parlay Stack legs for exact match
    for (const p of legs) {
      if (p.playerName?.toLowerCase().trim() === nameNorm &&
          p.statType?.toLowerCase() === statType.toLowerCase() &&
          p.altLine === line) {
        result = {
          prop: {
            stat: STAT_DISPLAY[p.statType] || p.statType,
            statType: p.statType,
            line: p.altLine,
            prediction: p.prediction?.toLowerCase() || 'over',
            oddsOver: p.altOdds, // alt lines are directional
            oddsUnder: null,
            bookmaker: shortBook(p.bookmaker),
            avg: p.l10Avg,
            trend: p.trend,
            green: p.greenScore,
            defRank: p.opponentDefense?.rank ?? null,
            edge: p.parlayEdge,
          },
          game: {
            home, away, gameTime,
            team: p.team,
            opponent: p.opponent,
            isHome: p.isHome,
          },
          source: 'stack',
        };
        break;
      }
    }
  }

  if (!result) return null;

  // Format safe lines: all validated alt lines for this player, sorted by edge
  // Exclude the exact line currently being viewed
  const safeLines = allPlayerStackLegs
    .filter(p => !(p.statType?.toLowerCase() === statType.toLowerCase() && p.altLine === line))
    .sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0))
    .map(p => ({
      statType: p.statType,
      stat: STAT_DISPLAY[p.statType] || p.statType,
      prediction: p.prediction?.toLowerCase() || 'over',
      altLine: p.altLine,
      altOdds: p.altOdds,
      bookmaker: shortBook(p.bookmaker),
      l10HitPct: p.hitRates?.l10?.pct ?? null,
      sznHitPct: p.hitRates?.season?.pct ?? null,
      l10Avg: p.l10Avg,
      parlayEdge: p.parlayEdge,
      greenScore: p.greenScore,
    }));

  result.safeLines = safeLines;
  return result;
}

/**
 * Build per-game breakdown for the bar chart.
 * Enriches raw game logs with opponent info from team schedule.
 *
 * @returns {Array} [{ date, displayDate, opponent, opponentCode, value, hit }, ...]
 */
function buildGameLogEntries(gameLogs, statType, line, schedule, maxGames = 20) {
  const entries = [];

  for (const g of gameLogs) {
    const gameId = g.game?.id;
    const value = getStatValue(g, statType);
    if (value === null) continue;

    // Opponent from schedule lookup
    const schedEntry = gameId ? schedule[gameId] : null;
    const gameDate = schedEntry?.date || g.game?.date || null;

    entries.push({
      date: gameDate,
      displayDate: formatDisplayDate(gameDate),
      opponent: schedEntry?.opponent || null,
      opponentCode: schedEntry?.opponentCode || null,
      value,
      hit: value > line,
    });
  }

  // Sort by date descending (most recent first) — game IDs aren't always chronological
  entries.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });

  return entries.slice(0, maxGames);
}

// ── HTTP Endpoint ──

exports.getPlayerPropChart = onRequest({
  timeoutSeconds: 30,
  memory: '256MiB',
  cors: true,
  secrets: ['API_SPORTS_KEY'],
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  try {
    const { playerName, statType, line } = req.body || {};

    if (!playerName || !statType || line == null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: playerName, statType, line',
      });
    }

    console.log(`[playerPropChart] ${playerName} — ${statType} ${line}`);

    // 1. Find this prop in the matchAnalysisCache (get game context + prop details)
    const cached = await findPropInCache(playerName, statType, line);
    if (!cached) {
      return res.status(404).json({
        success: false,
        error: `Prop not found in cache: ${playerName} ${statType} ${line}`,
      });
    }

    const { prop, game, source, safeLines } = cached;

    // 2. Resolve player ID + get game logs (both Firestore-cached)
    const [playerId, espnData] = await Promise.all([
      resolvePlayerId(playerName),
      resolveEspnPlayer(playerName),
    ]);

    if (!playerId) {
      return res.status(404).json({
        success: false,
        error: `Could not resolve player ID for: ${playerName}`,
      });
    }

    const gameLogs = await getGameLogs(playerId);
    if (!gameLogs || gameLogs.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No game logs found for: ${playerName}`,
      });
    }

    // 3. Get team schedule (for opponent derivation per past game)
    const teamName = game.team;
    const schedule = teamName ? await getTeamSchedule(teamName) : {};

    // 4. Build per-game bar chart data
    const gameLogEntries = buildGameLogEntries(gameLogs, statType, line, schedule);

    // 5. Calculate extended hit rates
    const hitRates = calculateExtendedHitRates(gameLogs, statType, line);

    // 6. Calculate H2H hit rate (games vs today's opponent)
    let h2h = { over: 0, total: 0, pct: 0 };
    if (game.opponent) {
      // Find all game IDs where this team played the opponent
      const opponentGameIds = new Set();
      for (const [gameId, sched] of Object.entries(schedule)) {
        if (sched.opponent === game.opponent) {
          opponentGameIds.add(Number(gameId));
        }
      }
      if (opponentGameIds.size > 0) {
        h2h = calculateH2HHitRate(gameLogs, statType, line, opponentGameIds);
      }
    }

    // 7. Assemble response
    const response = {
      success: true,
      source, // 'edge' or 'stack'
      player: {
        name: playerName,
        position: espnData.position || getPlayerPosition(playerName) || null,
        team: teamName,
        teamCode: teamCode(teamName),
        headshotUrl: espnData.headshotUrl || null,
      },
      matchup: {
        opponent: game.opponent,
        opponentCode: teamCode(game.opponent),
        isHome: game.isHome,
        gameTime: game.gameTime,
        home: game.home,
        away: game.away,
      },
      prop,
      gameLogs: gameLogEntries,
      hitRates: {
        ...hitRates,
        h2h,
      },
      safeLines: safeLines || [],
    };

    console.log(`[playerPropChart] ${playerName} — ${gameLogEntries.length} games, H2H: ${h2h.total} games, safeLines: ${(safeLines || []).length}`);
    res.status(200).json(response);

  } catch (err) {
    console.error('[playerPropChart] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
