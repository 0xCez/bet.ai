/**
 * playerSearch.js — Player profile endpoint for search feature
 *
 * Accepts just { playerName } and returns everything:
 * - Player info (name, position, team, headshot)
 * - All available standard lines (EdgeBoard)
 * - All available alt lines (Parlay Stack)
 * - Game log chart data for the default stat
 * - Hit rates, defense context, EV
 *
 * Reuses shared modules — zero new external APIs beyond what pipelines already cache.
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Shared modules
const { resolvePlayerId, getGameLogs, getTeamSchedule, getPlayerPosition, API_SPORTS_TEAM_IDS, TEAM_ID_TO_NAME } = require('./shared/playerStats');
const { getStatValue, calculateExtendedHitRates, getL10Average } = require('./shared/hitRates');
const { resolveEspnPlayer } = require('./shared/espnHeadshot');
const { getOpponentDefensiveStats, getOpponentStatForProp } = require('./shared/defense');

let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

// ── Shared Mappings (same as playerPropChart.js) ──

const STAT_DISPLAY = {
  'points': 'PTS', 'rebounds': 'REB', 'assists': 'AST',
  'threePointersMade': '3PT', 'blocks': 'BLK', 'steals': 'STL',
  'turnovers': 'TO',
  'points+rebounds+assists': 'PRA', 'points+rebounds': 'PTS+REB',
  'points+assists': 'PTS+AST', 'rebounds+assists': 'REB+AST',
  'blocks+steals': 'BLK+STL',
};

// Priority order for default stat selection
const STAT_PRIORITY = ['points', 'rebounds', 'assists', 'threePointersMade', 'steals', 'blocks', 'turnovers'];

// All 7 stat types available from game logs — always present regardless of props
const CORE_STATS = ['points', 'rebounds', 'assists', 'threePointersMade', 'steals', 'blocks', 'turnovers'];

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
  'Pinnacle': 'PIN', 'LowVig': 'LOWVIG', 'WilliamHill': 'WH',
  'BetParx': 'PARX', 'SuperBook': 'SUPER', 'BetAnySports': 'BAS',
  'MyBookie': 'MYBK', 'BetOnline': 'BOL', 'BetUS': 'BETUS',
};
function shortBook(name) { return BOOK_SHORT[name] || name; }

function defenseLabel(rank) {
  if (rank <= 5) return 'Elite';
  if (rank <= 12) return 'Strong';
  if (rank <= 18) return 'Average';
  if (rank <= 25) return 'Weak';
  return 'Poor';
}

function calculateEV(dirL10Pct, dirSznPct, americanOdds) {
  if (dirL10Pct == null || americanOdds == null) return null;
  // Player-weighted estimate: 60% L10 + 40% season (trust recent form more)
  const baseP = (dirSznPct != null ? 0.6 * dirL10Pct + 0.4 * dirSznPct : dirL10Pct) / 100;
  const impliedP = americanOdds < 0
    ? Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
    : 100 / (americanOdds + 100);
  // Blend: 55% player signals + 45% market
  const adjP = 0.55 * baseP + 0.45 * impliedP;
  const decimal = americanOdds < 0
    ? 1 + 100 / Math.abs(americanOdds)
    : 1 + americanOdds / 100;
  const rawEV = (adjP * (decimal - 1) - (1 - adjP)) * 100;
  // Clamp: recommended props always show positive EV (0.3% to 10%)
  const clampedEV = Math.min(10, Math.max(0.3, rawEV));
  return parseFloat(clampedEV.toFixed(1));
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return '???';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '???';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Find ALL props for a player across all upcoming cached games.
 * Returns { edgeProps, stackLegs, game } where game = first matching game context.
 */
async function findAllPlayerProps(playerName) {
  const snapshot = await getDb().collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  const now = new Date();
  // 3h grace period: NBA games last ~2.5h, so include in-progress games
  const cutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const nameNorm = playerName.toLowerCase().trim();

  const edgeProps = [];
  const stackLegs = [];
  let game = null;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.gameStartTime || data.gameStartTime < cutoff) continue;

    const ml = data.analysis?.mlPlayerProps || {};
    const home = data.analysis?.teams?.home;
    const away = data.analysis?.teams?.away;
    const gameTime = data.gameStartTime;

    // EdgeBoard props
    const props = ml.edgeBoard?.topProps || ml.topProps || [];
    for (const p of props) {
      if (p.playerName?.toLowerCase().trim() === nameNorm) {
        edgeProps.push(p);
        if (!game) {
          game = {
            home, away, gameTime,
            team: p.team,
            opponent: p.opponent || (p.team === home ? away : home),
            isHome: p.team === home,
          };
        }
      }
    }

    // Parlay Stack legs
    const legs = ml.parlayStack?.legs || [];
    for (const p of legs) {
      if (p.playerName?.toLowerCase().trim() === nameNorm) {
        stackLegs.push(p);
        if (!game) {
          game = {
            home, away, gameTime,
            team: p.team,
            opponent: p.opponent || (p.team === home ? away : home),
            isHome: p.team === home,
          };
        }
      }
    }
  }

  return { edgeProps, stackLegs, game };
}

/**
 * Build per-game breakdown for the bar chart (same as playerPropChart.js).
 */
function buildGameLogEntries(gameLogs, statType, line, schedule, prediction = 'over', maxGames = 20) {
  const isOver = prediction === 'over';
  const entries = [];

  for (const g of gameLogs) {
    const gameId = g.game?.id;
    const value = getStatValue(g, statType);
    if (value === null) continue;

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

  entries.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    return (b.gameId || 0) - (a.gameId || 0);
  });

  return entries.slice(0, maxGames);
}

// ── HTTP Endpoint ──

exports.getPlayerSearch = onRequest({
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
    const { playerName } = req.body || {};

    if (!playerName) {
      return res.status(400).json({ success: false, error: 'Missing required field: playerName' });
    }

    console.log(`[playerSearch] Looking up: ${playerName}`);

    // 1. Find all props for this player in the cache
    const { edgeProps, stackLegs, game } = await findAllPlayerProps(playerName);

    // 2. Get player info from directory (always, not just when no props)
    let dirEntry = null;
    const docId = playerName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    try {
      const doc = await getDb().collection('nbaPlayerDirectory').doc(docId).get();
      if (doc.exists) dirEntry = doc.data();
    } catch (e) { /* miss */ }

    // Resolve headshot (ESPN gives us live data, directory is fallback)
    const espnData = await resolveEspnPlayer(playerName);

    // 3. Get game logs — always try live API first (directory may be stale/incomplete)
    let gameLogs = [];
    const playerId = edgeProps[0]?.playerId || dirEntry?.apiSportsId || await resolvePlayerId(playerName);
    if (playerId) {
      gameLogs = await getGameLogs(playerId) || [];
    }
    // Fallback to directory if API returned nothing
    if (gameLogs.length === 0 && dirEntry?.gameLogs?.length > 0) {
      gameLogs = dirEntry.gameLogs;
    }

    const hasGameLogs = gameLogs.length > 0;

    // If no game logs AND no directory AND no props, player doesn't exist
    if (!hasGameLogs && !dirEntry && edgeProps.length === 0 && stackLegs.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Player not found: ${playerName}`,
      });
    }

    // Determine team — from props game context, or from directory, or from most recent game log
    const teamName = game?.team || dirEntry?.team || (() => {
      const tid = gameLogs[0]?.team?.id;
      return tid ? TEAM_ID_TO_NAME[tid] : null;
    })();
    let schedule = teamName ? await getTeamSchedule(teamName) : {};

    // Handle mid-season trades
    const mainTeamId = teamName ? API_SPORTS_TEAM_IDS[teamName] : null;
    const otherTeamIds = new Set();
    for (const g of gameLogs) {
      const tid = g.team?.id;
      if (tid && mainTeamId && tid !== mainTeamId) otherTeamIds.add(tid);
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
    }

    // Build next game info — prefer directory (already computed), fall back to schedule
    let nextGame = null;
    if (!game) {
      nextGame = dirEntry?.nextGame || null;
      if (!nextGame && schedule) {
        const now = new Date();
        for (const entry of Object.values(schedule)) {
          if (!entry.date) continue;
          const gameDate = new Date(entry.date);
          if (gameDate > now && (!nextGame || gameDate < new Date(nextGame.date))) {
            nextGame = entry;
          }
        }
      }
    }

    // 4. Build availableStats from game logs + prop-derived stats
    const statSet = new Set();

    // Core stats from game logs — include any with non-zero L10 average
    if (hasGameLogs) {
      for (const stat of CORE_STATS) {
        const avg = getL10Average(gameLogs, stat);
        if (avg != null && avg > 0) statSet.add(stat);
      }
    }

    // Merge in prop-derived stats (combo stats like PRA only appear when a prop exists)
    for (const p of edgeProps) { if (p.statType) statSet.add(p.statType); }
    for (const p of stackLegs) { if (p.statType) statSet.add(p.statType); }

    // Sort by priority
    const availableStats = [...statSet].sort((a, b) => {
      const ai = STAT_PRIORITY.indexOf(a);
      const bi = STAT_PRIORITY.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // 5. Fetch defense data ONCE (reused across all stat charts)
    const opponentName = game?.opponent || nextGame?.opponent;
    let oppStats = null;
    if (opponentName) {
      try {
        oppStats = await getOpponentDefensiveStats();
      } catch (e) {
        console.warn('[playerSearch] Defense fetch failed:', e.message);
      }
    }

    // 6. Build chart data for ALL available stats
    const pct = (over, total) => total > 0 ? Math.round((over / total) * 100) : 0;
    const charts = {};

    for (const stat of availableStats) {
      // Find the best line: prefer EdgeBoard, then Stack, then synthetic L10 avg
      const edgeProp = edgeProps.find(p => p.statType === stat);
      const stackLeg = stackLegs.find(p => p.statType === stat);
      const hasProp = !!(edgeProp || stackLeg);

      const avg = hasGameLogs ? getL10Average(gameLogs, stat) : (edgeProp?.l10Avg ?? stackLeg?.l10Avg ?? null);
      const syntheticLine = avg != null ? Math.round(avg * 2) / 2 : 0;
      const line = edgeProp?.line ?? stackLeg?.altLine ?? syntheticLine;
      const prediction = (edgeProp?.prediction || stackLeg?.prediction || 'Over').toLowerCase();
      const isOver = prediction === 'over';

      let gameLogEntries, hitRates;

      if (hasGameLogs) {
        // Normal path: build from raw game logs
        gameLogEntries = buildGameLogEntries(gameLogs, stat, line, schedule, prediction);

        let l5Over = 0, l5Total = 0, l10Over = 0, l10Total = 0, l20Over = 0, l20Total = 0;
        for (let i = 0; i < gameLogEntries.length; i++) {
          const hit = gameLogEntries[i].hit;
          if (i < 20) { l20Total++; if (hit) l20Over++; }
          if (i < 10) { l10Total++; if (hit) l10Over++; }
          if (i < 5)  { l5Total++;  if (hit) l5Over++;  }
        }
        let seasonHit = 0, seasonTotal = 0;
        for (const g of gameLogs) {
          const val = getStatValue(g, stat);
          if (val === null) continue;
          seasonTotal++;
          if (isOver ? val > line : val < line) seasonHit++;
        }

        hitRates = {
          l5:     { over: l5Over,     total: l5Total,     pct: pct(l5Over, l5Total) },
          l10:    { over: l10Over,    total: l10Total,    pct: pct(l10Over, l10Total) },
          l20:    { over: l20Over,    total: l20Total,    pct: pct(l20Over, l20Total) },
          season: { over: seasonHit,  total: seasonTotal, pct: pct(seasonHit, seasonTotal) },
        };
      } else {
        // Fallback: use pipeline's pre-computed hit rates
        console.log(`[playerSearch] No game logs for ${playerName}, using pipeline data for ${stat}`);
        gameLogEntries = [];
        const rawHR = edgeProp?.hitRates || stackLeg?.hitRates || {};
        hitRates = {
          l5:     { over: rawHR.l5?.over || 0,     total: rawHR.l5?.total || 0,     pct: rawHR.l5?.pct || 0 },
          l10:    { over: rawHR.l10?.over || 0,    total: rawHR.l10?.total || 0,    pct: rawHR.l10?.pct || 0 },
          l20:    { over: rawHR.l20?.over || 0,    total: rawHR.l20?.total || 0,    pct: rawHR.l20?.pct || 0 },
          season: { over: rawHR.season?.over || 0, total: rawHR.season?.total || 0, pct: rawHR.season?.pct || 0 },
        };
      }

      // Defense context (reuses single oppStats fetch, or fall back to pipeline data)
      let defense = null;
      if (opponentName && oppStats) {
        const oppDef = getOpponentStatForProp(oppStats, opponentName, stat);
        if (oppDef) {
          const label = defenseLabel(oppDef.rank);
          const supportsOver = oppDef.rank >= 19;
          const supports = isOver ? supportsOver : !supportsOver;
          defense = {
            rank: oppDef.rank,
            totalTeams: 30,
            label,
            allowed: oppDef.allowed,
            stat: oppDef.stat,
            opponentCode: teamCode(opponentName),
            supports,
            narrative: supports ? 'Supports' : 'Contradicts',
          };
        }
      }
      if (!defense && (edgeProp?.opponentDefense || stackLeg?.opponentDefense)) {
        const rawDef = edgeProp?.opponentDefense || stackLeg?.opponentDefense;
        const label = defenseLabel(rawDef.rank);
        const supportsOver = rawDef.rank >= 19;
        const supports = isOver ? supportsOver : !supportsOver;
        defense = {
          rank: rawDef.rank,
          totalTeams: 30,
          label,
          allowed: rawDef.allowed,
          stat: rawDef.stat,
          opponentCode: teamCode(opponentName),
          supports,
          narrative: supports ? 'Supports' : 'Contradicts',
        };
      }

      // EV (only meaningful when real odds exist from props)
      const odds = isOver ? (edgeProp?.oddsOver ?? null) : (edgeProp?.oddsUnder ?? null);
      const ev = calculateEV(hitRates.l10?.pct, hitRates.season?.pct, odds);

      charts[stat] = {
        statType: stat,
        stat: STAT_DISPLAY[stat] || stat,
        line,
        prediction,
        syntheticLine: !hasProp,
        l10Avg: avg,
        gameLogs: gameLogEntries,
        hitRates,
        defense,
        ev,
        fromPipelineCache: !hasGameLogs,
      };
    }

    const defaultStat = availableStats[0] || 'points';

    // 7. Format standard lines (EdgeBoard)
    const standardLines = edgeProps.map(p => {
      const pIsOver = p.prediction === 'Over';
      return {
        statType: p.statType,
        stat: STAT_DISPLAY[p.statType] || p.statType,
        line: p.line,
        prediction: p.prediction?.toLowerCase() || 'over',
        oddsOver: p.oddsOver,
        oddsUnder: p.oddsUnder,
        bookmaker: shortBook(pIsOver ? p.bookmakerOver : p.bookmakerUnder),
        l10Avg: p.l10Avg,
        greenScore: p.greenScore,
        betScore: p.betScore,
        edge: p.edge,
      };
    }).sort((a, b) => (b.betScore || 0) - (a.betScore || 0));

    // 8. Format alt lines (Parlay Stack)
    const altLines = stackLegs.map(p => {
      const pIsOver = p.prediction?.toLowerCase() === 'over';
      const rawL10 = p.hitRates?.l10?.pct ?? null;
      return {
        statType: p.statType,
        stat: STAT_DISPLAY[p.statType] || p.statType,
        altLine: p.altLine,
        prediction: p.prediction?.toLowerCase() || 'over',
        altOdds: p.altOdds,
        bookmaker: shortBook(p.bookmaker),
        l10Avg: p.l10Avg,
        parlayEdge: p.parlayEdge,
        l10HitPct: rawL10 != null ? (pIsOver ? rawL10 : 100 - rawL10) : null,
      };
    }).sort((a, b) => (b.parlayEdge || 0) - (a.parlayEdge || 0));

    // 9. Assemble response
    const matchupSource = game || nextGame;
    const matchupOpponent = matchupSource?.opponent || null;
    const matchupOpponentCode = matchupOpponent ? teamCode(matchupOpponent) : null;

    const response = {
      success: true,
      hasProps: !!game,
      player: {
        name: playerName,
        position: espnData.position || dirEntry?.position || getPlayerPosition(playerName) || null,
        team: teamName,
        teamCode: teamCode(teamName),
        headshotUrl: espnData.headshotUrl || dirEntry?.headshotUrl || null,
      },
      matchup: matchupSource ? {
        opponent: matchupOpponent,
        opponentCode: matchupOpponentCode,
        isHome: matchupSource.isHome ?? null,
        gameTime: matchupSource.gameTime || matchupSource.date || null,
        home: matchupSource.home || (matchupSource.isHome ? teamName : matchupOpponent) || null,
        away: matchupSource.away || (matchupSource.isHome ? matchupOpponent : teamName) || null,
      } : null,
      availableStats: availableStats.map(s => ({
        key: s,
        label: STAT_DISPLAY[s] || s,
        hasProp: !!(edgeProps.find(p => p.statType === s) || stackLegs.find(p => p.statType === s)),
      })),
      standardLines,
      altLines,
      charts,
      chart: charts[defaultStat] || null,
    };

    console.log(`[playerSearch] ${playerName} — hasProps:${!!game}, ${availableStats.length} stats, ${standardLines.length} std, ${altLines.length} alt, ${Object.keys(charts).length} charts`);
    res.status(200).json(response);

  } catch (err) {
    console.error('[playerSearch] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
