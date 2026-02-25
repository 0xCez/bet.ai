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
const { resolvePlayerId, getGameLogs, getTeamSchedule, getPlayerPosition, API_SPORTS_TEAM_IDS, TEAM_ID_TO_NAME } = require('./shared/playerStats');
const { getStatValue, calculateExtendedHitRates, calculateH2HHitRate, getL10Average, getTrend } = require('./shared/hitRates');
const { resolveEspnPlayer } = require('./shared/espnHeadshot');
const { getOpponentDefensiveStats, getOpponentStatForProp } = require('./shared/defense');

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

// Reverse lookup: display name → raw stat key (for when display names arrive as statType)
const STAT_FROM_DISPLAY = Object.fromEntries(
  Object.entries(STAT_DISPLAY).map(([k, v]) => [v.toLowerCase(), k])
);

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
 * Label defensive quality based on rank (1-30).
 * 1-5 = Elite, 6-12 = Strong, 13-18 = Average, 19-25 = Weak, 26-30 = Poor
 */
function defenseLabel(rank) {
  if (rank <= 5) return 'Elite';
  if (rank <= 12) return 'Strong';
  if (rank <= 18) return 'Average';
  if (rank <= 25) return 'Weak';
  return 'Poor';
}

/**
 * Calculate Expected Value (EV+) percentage.
 * Blends directional L10 + Season hit rates, then regresses toward
 * market implied probability to produce realistic EV estimates.
 * Matches the formula used in PicksView.tsx.
 */
function calculateEV(dirL10Pct, dirSznPct, americanOdds) {
  if (dirL10Pct == null || americanOdds == null) return null;
  const baseP = (dirSznPct != null ? 0.4 * dirL10Pct + 0.6 * dirSznPct : dirL10Pct) / 100;
  const impliedP = americanOdds < 0
    ? Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
    : 100 / (americanOdds + 100);
  const adjP = 0.4 * baseP + 0.6 * impliedP;
  const decimal = americanOdds < 0
    ? 1 + 100 / Math.abs(americanOdds)
    : 1 + americanOdds / 100;
  return parseFloat(((adjP * (decimal - 1) - (1 - adjP)) * 100).toFixed(1));
}

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
  // Normalize statType: if a display name was passed (e.g. "3PT MADE"), resolve to raw key
  const statNorm = (STAT_FROM_DISPLAY[statType.toLowerCase()] || statType).toLowerCase();
  let result = null;

  // Collect ALL props for this player across all games (for dropdown + alt lines)
  const allPlayerStackLegs = [];
  const allPlayerEdgeProps = [];

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

    // Collect all EdgeBoard props for this player (any stat type)
    const edgeProps = ml.edgeBoard?.topProps || ml.topProps || [];
    for (const p of edgeProps) {
      if (p.playerName?.toLowerCase().trim() === nameNorm) {
        allPlayerEdgeProps.push(p);
      }
    }

    // Only search for the matching prop if we haven't found it yet
    if (result) continue;

    // Search EdgeBoard topProps
    for (const p of edgeProps) {
      if (p.playerName?.toLowerCase().trim() === nameNorm &&
          p.statType?.toLowerCase() === statNorm &&
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
            betScore: p.betScore ?? null,
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
          p.statType?.toLowerCase() === statNorm &&
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
            betScore: p.betScore ?? null,
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
    .filter(p => !(p.statType?.toLowerCase() === statNorm && p.altLine === line))
    .sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0))
    .map(p => {
      const isOver = p.prediction?.toLowerCase() === 'over';
      const rawL10 = p.hitRates?.l10?.pct ?? null;
      const rawSzn = p.hitRates?.season?.pct ?? null;
      return {
        statType: p.statType,
        stat: STAT_DISPLAY[p.statType] || p.statType,
        prediction: p.prediction?.toLowerCase() || 'over',
        altLine: p.altLine,
        altOdds: p.altOdds,
        bookmaker: shortBook(p.bookmaker),
        l10HitPct: rawL10 != null ? (isOver ? rawL10 : 100 - rawL10) : null,
        sznHitPct: rawSzn != null ? (isOver ? rawSzn : 100 - rawSzn) : null,
        l10Avg: p.l10Avg,
        parlayEdge: p.parlayEdge,
      };
    });

  result.safeLines = safeLines;

  // Format other EdgeBoard props for this player (for line selector dropdown)
  // Exclude the exact prop currently being viewed
  result.otherProps = allPlayerEdgeProps
    .filter(p => !(p.statType?.toLowerCase() === statNorm && p.line === line))
    .map(p => {
      const isOver = p.prediction === 'Over';
      return {
        statType: p.statType,
        stat: STAT_DISPLAY[p.statType] || p.statType,
        line: p.line,
        prediction: p.prediction?.toLowerCase() || 'over',
        oddsOver: p.oddsOver,
        oddsUnder: p.oddsUnder,
        bookmaker: shortBook(isOver ? p.bookmakerOver : p.bookmakerUnder),
        l10Avg: p.l10Avg,
        greenScore: p.greenScore,
      };
    });

  return result;
}

/**
 * Build per-game breakdown for the bar chart.
 * Enriches raw game logs with opponent info from team schedule.
 *
 * @returns {Array} [{ date, displayDate, opponent, opponentCode, value, hit }, ...]
 */
function buildGameLogEntries(gameLogs, statType, line, schedule, prediction = 'over', maxGames = 20) {
  const isOver = prediction === 'over';
  const entries = [];

  for (const g of gameLogs) {
    const gameId = g.game?.id;
    const value = getStatValue(g, statType);
    if (value === null) continue;

    // Opponent from schedule lookup
    const schedEntry = gameId ? schedule[gameId] : null;
    const gameDate = schedEntry?.date || g.game?.date || null;

    entries.push({
      gameId: gameId || 0,
      date: gameDate,
      displayDate: formatDisplayDate(gameDate),
      opponent: schedEntry?.opponent || null,
      opponentCode: schedEntry?.opponentCode || null,
      value,
      hit: isOver ? value > line : value < line,
    });
  }

  // Sort by date descending (most recent first)
  // Fallback to game ID descending for entries without dates (IDs are roughly chronological)
  entries.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    if (a.date && !b.date) {
      // Place undated entry relative to dated entry using game ID heuristic
      return b.gameId - a.gameId || -1;
    }
    if (!a.date && b.date) {
      return b.gameId - a.gameId || 1;
    }
    // Both undated: sort by game ID descending
    return (b.gameId || 0) - (a.gameId || 0);
  });

  return entries.slice(0, maxGames);
}

// ── HTTP Endpoint ──

exports.getPlayerPropChart = onRequest({
  timeoutSeconds: 30,
  memory: '256MiB',
  secrets: ['API_SPORTS_KEY'],
  cors: true,
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

    // Normalize statType: resolve display names (e.g. "3PT MADE") to raw keys (e.g. "threePointersMade")
    const resolvedStatType = STAT_FROM_DISPLAY[statType.toLowerCase()] || statType;
    console.log(`[playerPropChart] ${playerName} — ${resolvedStatType} ${line}`);

    // 1. Find this prop in the matchAnalysisCache (get game context + prop details)
    const cached = await findPropInCache(playerName, resolvedStatType, line);
    if (!cached) {
      return res.status(404).json({
        success: false,
        error: `Prop not found in cache: ${playerName} ${resolvedStatType} ${line}`,
      });
    }

    const { prop, game, source, safeLines, otherProps } = cached;

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

    // 3. Get team schedule(s) for opponent derivation per past game
    //    Handle mid-season trades: player's game logs may span multiple teams
    const teamName = game.team;
    let schedule = teamName ? await getTeamSchedule(teamName) : {};

    // Detect additional teams from game logs (e.g., player was traded mid-season)
    const mainTeamId = API_SPORTS_TEAM_IDS[teamName];
    const otherTeamIds = new Set();
    for (const g of gameLogs) {
      const tid = g.team?.id;
      if (tid && tid !== mainTeamId) otherTeamIds.add(tid);
    }
    if (otherTeamIds.size > 0) {
      const extraSchedules = await Promise.all(
        [...otherTeamIds].map(tid => {
          const name = TEAM_ID_TO_NAME[tid];
          return name ? getTeamSchedule(name) : Promise.resolve({});
        })
      );
      for (const extra of extraSchedules) {
        schedule = { ...schedule, ...extra };
      }
      console.log(`[playerPropChart] Fetched ${otherTeamIds.size} extra schedule(s) for traded player`);
    }

    // 4. Build per-game bar chart data (sorted by date, most recent first)
    const prediction = prop.prediction || 'over';
    const isOver = prediction === 'over';
    const gameLogEntries = buildGameLogEntries(gameLogs, resolvedStatType, line, schedule, prediction);

    // 5. Calculate hit rates FROM the sorted entries (consistent with chart display)
    //    L5/L10/L20 use the chart entries; Season uses ALL raw game logs
    const pct = (over, total) => total > 0 ? Math.round((over / total) * 100) : 0;
    let l5Over = 0, l5Total = 0, l10Over = 0, l10Total = 0;
    let l20Over = 0, l20Total = 0;
    for (let i = 0; i < gameLogEntries.length; i++) {
      const hit = gameLogEntries[i].hit;
      if (i < 20) { l20Total++; if (hit) l20Over++; }
      if (i < 10) { l10Total++; if (hit) l10Over++; }
      if (i < 5)  { l5Total++;  if (hit) l5Over++;  }
    }

    // Season: iterate ALL raw game logs (not just chart's 20)
    let seasonHit = 0, seasonTotal = 0;
    for (const g of gameLogs) {
      const val = getStatValue(g, resolvedStatType);
      if (val === null) continue;
      seasonTotal++;
      if (isOver ? val > line : val < line) seasonHit++;
    }

    const hitRates = {
      l5:     { over: l5Over,     total: l5Total,     pct: pct(l5Over, l5Total) },
      l10:    { over: l10Over,    total: l10Total,    pct: pct(l10Over, l10Total) },
      l20:    { over: l20Over,    total: l20Total,    pct: pct(l20Over, l20Total) },
      season: { over: seasonHit,  total: seasonTotal, pct: pct(seasonHit, seasonTotal) },
    };

    // 6. Calculate H2H hit rate (games vs today's opponent)
    let h2h = { over: 0, total: 0, pct: 0 };
    if (game.opponent) {
      // Match H2H from sorted entries (consistent with chart)
      let h2hOver = 0, h2hTotal = 0;
      for (const entry of gameLogEntries) {
        if (entry.opponent === game.opponent) {
          h2hTotal++;
          if (entry.hit) h2hOver++;
        }
      }
      h2h = { over: h2hOver, total: h2hTotal, pct: pct(h2hOver, h2hTotal) };
    }

    // 7. Opponent defense context
    let defense = null;
    if (game.opponent) {
      try {
        const oppStats = await getOpponentDefensiveStats();
        const oppDef = getOpponentStatForProp(oppStats, game.opponent, resolvedStatType);
        if (oppDef) {
          const label = defenseLabel(oppDef.rank);
          // Does this defense context support or contradict the prediction?
          // Good defense (low rank) supports Under, contradicts Over; bad defense supports Over
          const supportsOver = oppDef.rank >= 19; // Weak/Poor defense → supports Over
          const supports = isOver ? supportsOver : !supportsOver;
          defense = {
            rank: oppDef.rank,
            totalTeams: 30,
            label,
            allowed: oppDef.allowed,
            stat: oppDef.stat,
            opponentCode: teamCode(game.opponent),
            supports,
            narrative: supports ? 'Supports' : 'Contradicts',
          };
        }
      } catch (e) {
        console.warn('[playerPropChart] Defense fetch failed:', e.message);
      }
    }

    // 8. EV+ calculation — hitRates are already directional (computed with isOver check)
    const relevantOdds = isOver ? prop.oddsOver : prop.oddsUnder;
    const ev = calculateEV(hitRates.l10?.pct, hitRates.season?.pct, relevantOdds);

    // 9. Assemble response
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
      defense,
      ev,
      safeLines: safeLines || [],
      otherProps: otherProps || [],
    };

    console.log(`[playerPropChart] ${playerName} — ${gameLogEntries.length} games, H2H: ${h2h.total} games, DEF: ${defense ? `#${defense.rank} ${defense.label}` : 'N/A'}, EV: ${ev != null ? `${ev}%` : 'N/A'}, safeLines: ${(safeLines || []).length}`);
    res.status(200).json(response);

  } catch (err) {
    console.error('[playerPropChart] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
