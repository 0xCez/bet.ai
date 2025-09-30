const functions = require("firebase-functions");
const axios = require("axios");
require('dotenv').config();

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const API_SPORTS_KEY = process.env.API_SPORTS_KEY;

// ====================================================================
// PRODUCT UPDATE TEST ENDPOINT - MARKET INTELLIGENCE + PLAYER STATS
// ====================================================================

exports.productUpdateTest = functions.https.onRequest(async (req, res) => {
  try {
    const { sport, team1, team2, team1_code, team2_code } = req.body;

    if (!sport || !team1 || !team2) {
      return res.status(400).json({
        error: "Missing required fields: sport, team1, team2"
      });
    }

    console.log(`Product Update Test - Processing ${sport}: ${team1} vs ${team2}`);

    // Get team IDs (reuse existing function from main file)
    const { team1Id, team2Id, sport_type_odds } = await findTeamIds(sport, team1, team1_code, team2, team2_code);

    if (!team1Id || !team2Id) {
      return res.status(400).json({
        error: "Could not find team IDs for the provided teams"
      });
    }

    // Parallel API calls for all data
    const [marketIntelligence, playerStats, teamStats] = await Promise.all([
      getMarketIntelligenceData(sport_type_odds, team1, team2),
      getPlayerStatsData(sport, team1Id, team2Id),
      getTeamStatsData(sport, team1Id, team2Id)
    ]);

    const response = {
      status: "success",
      sport,
      teams: { team1, team2 },
      teamIds: { team1Id, team2Id },
      marketIntelligence,
      playerStats,
      teamStats,
      timestamp: new Date().toISOString()
    };

    res.status(200).json(response);

  } catch (error) {
    console.error("Product Update Test Error:", error);
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
});

// ====================================================================
// MARKET INTELLIGENCE DATA FUNCTIONS
// ====================================================================

async function getMarketIntelligenceData(sport, team1, team2) {
  try {
    const BASE_URL = `https://api.the-odds-api.com/v4/sports/${sport}`;

    // Get events
    const eventsResponse = await axios.get(`${BASE_URL}/events?apiKey=${ODDS_API_KEY}`);
    const events = eventsResponse.data;

    const event = events.find(e => fuzzyMatchTeam(e, team1, team2));
    if (!event) {
      return { error: "Event not found" };
    }

    // Get odds with multiple markets including totals
    const oddsUrl = `${BASE_URL}/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&bookmakers=fanduel,draftkings,betmgm,caesars,pointsbet,pinnacle,circa,betcris,betonline`;
    const oddsResponse = await axios.get(oddsUrl);
    const bookmakers = oddsResponse.data.bookmakers || [];

    if (bookmakers.length === 0) {
      return { error: "No bookmaker data available" };
    }

    const marketData = {
      bestLines: calculateBestLines(bookmakers, event),
      lineMovement: calculateLineMovement(bookmakers, event),
      sharpMeter: calculateSharpMeter(bookmakers, event),
      marketTightness: calculateMarketTightness(bookmakers),
      oddsTable: formatOddsTable(bookmakers),
      rawData: {
        event,
        totalBookmakers: bookmakers.length
      }
    };

    return marketData;

  } catch (error) {
    console.error("Market Intelligence Error:", error);
    return { error: error.message };
  }
}

// 1. BEST LINES CALCULATION
function calculateBestLines(bookmakers, event) {
  const spreads = [];
  const moneylines = [];
  const totals = [];

  // Extract all lines from all bookmakers
  bookmakers.forEach(bookmaker => {
    bookmaker.markets.forEach(market => {
      if (market.key === 'spreads') {
        market.outcomes.forEach(outcome => {
          spreads.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            team: outcome.name,
            point: outcome.point,
            price: outcome.price,
            isHome: outcome.name === event.home_team
          });
        });
      }

      if (market.key === 'h2h') {
        market.outcomes.forEach(outcome => {
          moneylines.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            team: outcome.name,
            price: outcome.price,
            isHome: outcome.name === event.home_team
          });
        });
      }

      if (market.key === 'totals') {
        market.outcomes.forEach(outcome => {
          totals.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            type: outcome.name, // "Over" or "Under"
            point: outcome.point,
            price: outcome.price
          });
        });
      }
    });
  });

  // Calculate consensus spread point (median)
  const homeSpreadPoints = spreads.filter(s => s.isHome).map(s => s.point);
  const consensusSpreadPoint = homeSpreadPoints.length > 0 ?
    homeSpreadPoints.sort((a, b) => a - b)[Math.floor(homeSpreadPoints.length / 2)] : 0;

  // Calculate consensus total (median)
  const totalPoints = totals.filter(t => t.type === "Over").map(t => t.point);
  const consensusTotal = totalPoints.length > 0 ?
    totalPoints.sort((a, b) => a - b)[Math.floor(totalPoints.length / 2)] : 0;

  // Find best spread lines (prioritize point, then price)
  const favoriteSpread = spreads
    .filter(s => s.point < 0)
    .sort((a, b) => {
      if (Math.abs(a.point - b.point) < 0.1) return a.price - b.price; // Better juice
      return a.point - b.point; // Better number (closer to 0)
    })[0];

  const underdogSpread = spreads
    .filter(s => s.point > 0)
    .sort((a, b) => {
      if (Math.abs(a.point - b.point) < 0.1) return a.price - b.price; // Better juice
      return b.point - a.point; // Better number (closer to 0)
    })[0];

  // Find best moneylines
  const bestHomeMl = moneylines
    .filter(m => m.isHome)
    .sort((a, b) => a.price < 0 ? b.price - a.price : a.price - b.price)[0]; // Best odds

  const bestAwayMl = moneylines
    .filter(m => !m.isHome)
    .sort((a, b) => a.price < 0 ? b.price - a.price : a.price - b.price)[0]; // Best odds

  // Find best totals at consensus
  const bestOver = totals
    .filter(t => t.type === "Over" && Math.abs(t.point - consensusTotal) < 0.1)
    .sort((a, b) => a.price - b.price)[0]; // Better juice

  const bestUnder = totals
    .filter(t => t.type === "Under" && Math.abs(t.point - consensusTotal) < 0.1)
    .sort((a, b) => a.price - b.price)[0]; // Better juice

  return {
    consensusSpreadPoint,
    consensusTotal,
    bestLines: [
      favoriteSpread && {
        type: "spread",
        label: "Best Favorite",
        line: favoriteSpread.point,
        odds: favoriteSpread.price,
        bookmaker: favoriteSpread.bookmaker,
        team: favoriteSpread.team,
        isConsensus: Math.abs(favoriteSpread.point - consensusSpreadPoint) < 0.1
      },
      underdogSpread && {
        type: "spread",
        label: "Best Underdog",
        line: underdogSpread.point,
        odds: underdogSpread.price,
        bookmaker: underdogSpread.bookmaker,
        team: underdogSpread.team,
        isConsensus: Math.abs(underdogSpread.point - consensusSpreadPoint) < 0.1
      },
      bestHomeMl && {
        type: "moneyline",
        label: "Best Home",
        odds: bestHomeMl.price,
        bookmaker: bestHomeMl.bookmaker,
        team: bestHomeMl.team
      },
      bestAwayMl && {
        type: "moneyline",
        label: "Best Away",
        odds: bestAwayMl.price,
        bookmaker: bestAwayMl.bookmaker,
        team: bestAwayMl.team
      },
      bestOver && {
        type: "total",
        label: "Best Over",
        line: bestOver.point,
        odds: bestOver.price,
        bookmaker: bestOver.bookmaker,
        isConsensus: true
      },
      bestUnder && {
        type: "total",
        label: "Best Under",
        line: bestUnder.point,
        odds: bestUnder.price,
        bookmaker: bestUnder.bookmaker,
        isConsensus: true
      }
    ].filter(Boolean)
  };
}

// 2. LINE MOVEMENT CALCULATION
function calculateLineMovement(bookmakers, event) {
  // For now, we'll simulate opening lines since we don't have historical data
  // In production, you'd store opening lines or fetch from a different endpoint

  const currentSpreads = [];
  const currentMoneylines = [];
  const currentTotals = [];

  bookmakers.forEach(bookmaker => {
    bookmaker.markets.forEach(market => {
      if (market.key === 'spreads') {
        const homeLine = market.outcomes.find(o => o.name === event.home_team);
        if (homeLine) currentSpreads.push(homeLine.point);
      }

      if (market.key === 'h2h') {
        const homeMl = market.outcomes.find(o => o.name === event.home_team);
        if (homeMl) currentMoneylines.push(homeMl.price);
      }

      if (market.key === 'totals') {
        const overLine = market.outcomes.find(o => o.name === "Over");
        if (overLine) currentTotals.push(overLine.point);
      }
    });
  });

  const currentSpreadConsensus = currentSpreads.length > 0 ?
    currentSpreads.sort((a, b) => a - b)[Math.floor(currentSpreads.length / 2)] : 0;

  const currentMlConsensus = currentMoneylines.length > 0 ?
    currentMoneylines.sort((a, b) => a - b)[Math.floor(currentMoneylines.length / 2)] : 0;

  const currentTotalConsensus = currentTotals.length > 0 ?
    currentTotals.sort((a, b) => a - b)[Math.floor(currentTotals.length / 2)] : 0;

  // Simulate opening lines (in production, fetch real opening lines)
  const openingSpread = currentSpreadConsensus - 0.5; // Simulate movement
  const openingMl = currentMlConsensus + 10; // Simulate movement
  const openingTotal = currentTotalConsensus + 1; // Simulate movement

  const spreadMovement = currentSpreadConsensus - openingSpread;
  const mlMovement = currentMlConsensus - openingMl;
  const totalMovement = currentTotalConsensus - openingTotal;

  return {
    spread: {
      opening: openingSpread,
      current: currentSpreadConsensus,
      movement: spreadMovement,
      direction: spreadMovement > 0 ? "toward favorite" : "toward dog"
    },
    moneyline: {
      opening: openingMl,
      current: currentMlConsensus,
      movement: mlMovement,
      movementCents: Math.round(mlMovement)
    },
    total: {
      opening: openingTotal,
      current: currentTotalConsensus,
      movement: totalMovement,
      direction: totalMovement > 0 ? "higher" : "lower"
    }
  };
}

// 3. SHARP METER CALCULATION
function calculateSharpMeter(bookmakers, event) {
  const sharpBooks = ['pinnacle', 'circa', 'betcris', 'betonline'];
  const publicBooks = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'pointsbet'];

  const sharpSpreads = [];
  const publicSpreads = [];
  const sharpJuice = [];
  const publicJuice = [];

  bookmakers.forEach(bookmaker => {
    const isSharp = sharpBooks.includes(bookmaker.key);
    const isPublic = publicBooks.includes(bookmaker.key);

    bookmaker.markets.forEach(market => {
      if (market.key === 'spreads') {
        const homeLine = market.outcomes.find(o => o.name === event.home_team);
        if (homeLine) {
          if (isSharp) {
            sharpSpreads.push(homeLine.point);
            sharpJuice.push(homeLine.price);
          }
          if (isPublic) {
            publicSpreads.push(homeLine.point);
            publicJuice.push(homeLine.price);
          }
        }
      }
    });
  });

  const avgSharpSpread = sharpSpreads.length > 0 ?
    sharpSpreads.reduce((a, b) => a + b, 0) / sharpSpreads.length : 0;

  const avgPublicSpread = publicSpreads.length > 0 ?
    publicSpreads.reduce((a, b) => a + b, 0) / publicSpreads.length : 0;

  const avgSharpJuice = sharpJuice.length > 0 ?
    sharpJuice.reduce((a, b) => a + b, 0) / sharpJuice.length : 0;

  const avgPublicJuice = publicJuice.length > 0 ?
    publicJuice.reduce((a, b) => a + b, 0) / publicJuice.length : 0;

  // Calculate signals
  const pointGap = avgSharpSpread - avgPublicSpread; // Negative = sharps favor dog
  const juiceGap = avgSharpJuice - avgPublicJuice; // Positive = sharps charging more for favorite

  // Weighted score (-1 = sharp favorite, +1 = sharp dog)
  const pointSignal = pointGap > 0 ? -1 : 1; // If sharps have bigger spread, favor favorite
  const juiceSignal = juiceGap > 0 ? -1 : 1; // If sharps charge more, favor favorite
  const moveSignal = 0; // Would need historical data

  const sharpScore = (0.6 * pointSignal) + (0.3 * juiceSignal) + (0.1 * moveSignal);

  let interpretation;
  if (sharpScore < -0.3) {
    interpretation = `Sharps lean favorite ${Math.abs(pointGap).toFixed(1)} pts — sharp avg ${avgSharpSpread.toFixed(1)} vs public ${avgPublicSpread.toFixed(1)}`;
  } else if (sharpScore > 0.3) {
    interpretation = `Sharps lean dog +${Math.abs(pointGap).toFixed(1)} pts — sharp avg ${avgSharpSpread.toFixed(1)} vs public ${avgPublicSpread.toFixed(1)}`;
  } else {
    interpretation = "Neutral — sharps and public aligned";
  }

  return {
    sharpScore: Math.round(sharpScore * 100) / 100,
    pointGap: Math.round(pointGap * 10) / 10,
    avgSharpSpread: Math.round(avgSharpSpread * 10) / 10,
    avgPublicSpread: Math.round(avgPublicSpread * 10) / 10,
    interpretation,
    sharpBooksCount: sharpSpreads.length,
    publicBooksCount: publicSpreads.length
  };
}

// 4. MARKET TIGHTNESS CALCULATION
function calculateMarketTightness(bookmakers) {
  const spreadPoints = [];
  const spreadPrices = [];

  bookmakers.forEach(bookmaker => {
    bookmaker.markets.forEach(market => {
      if (market.key === 'spreads') {
        market.outcomes.forEach(outcome => {
          if (outcome.point < 0) { // Favorite lines only
            spreadPoints.push(Math.abs(outcome.point));
            spreadPrices.push(outcome.price);
          }
        });
      }
    });
  });

  const pointRange = spreadPoints.length > 0 ?
    Math.max(...spreadPoints) - Math.min(...spreadPoints) : 0;

  const priceRange = spreadPrices.length > 0 ?
    Math.max(...spreadPrices) - Math.min(...spreadPrices) : 0;

  let tightness;
  let comment;

  if (pointRange <= 0.5 && priceRange <= 10) {
    tightness = "Tight";
    comment = "Books agree, edges harder to find.";
  } else if (pointRange <= 1.0 && priceRange <= 15) {
    tightness = "Normal";
    comment = "Some disagreement, shopping can help.";
  } else {
    tightness = "Loose";
    comment = "Big disagreement, high value in line-shopping.";
  }

  return {
    tightness,
    pointRange: Math.round(pointRange * 10) / 10,
    priceRange: Math.round(priceRange),
    comment,
    summary: `${tightness} • point range ${pointRange.toFixed(1)} • price range ${priceRange.toFixed(0)}¢`
  };
}

// 5. ODDS TABLE FORMATTING
function formatOddsTable(bookmakers) {
  const now = Date.now();
  const updateTimes = bookmakers.map(b => new Date(b.last_update).getTime());
  const medianUpdateTime = updateTimes.sort((a, b) => a - b)[Math.floor(updateTimes.length / 2)];
  const staleThreshold = medianUpdateTime + (3 * (now - medianUpdateTime));

  return bookmakers.map(bookmaker => {
    const lastUpdate = new Date(bookmaker.last_update).getTime();
    const isStale = lastUpdate < staleThreshold;

    return {
      bookmaker: bookmaker.title,
      bookmakerKey: bookmaker.key,
      lastUpdate: bookmaker.last_update,
      isStale,
      markets: bookmaker.markets.map(market => ({
        type: market.key,
        outcomes: market.outcomes
      }))
    };
  });
}

// ====================================================================
// PLAYER STATISTICS DATA FUNCTIONS
// ====================================================================

async function getPlayerStatsData(sport, team1Id, team2Id) {
  try {
    console.log(`Fetching player stats for ${sport} - Team1: ${team1Id}, Team2: ${team2Id}`);

    const [team1Players, team2Players] = await Promise.all([
      getTeamPlayerStats(sport, team1Id),
      getTeamPlayerStats(sport, team2Id)
    ]);

    return {
      team1: {
        teamId: team1Id,
        players: team1Players.players || [],
        topPlayers: getTop3Players(team1Players.players || [], sport),
        error: team1Players.error
      },
      team2: {
        teamId: team2Id,
        players: team2Players.players || [],
        topPlayers: getTop3Players(team2Players.players || [], sport),
        error: team2Players.error
      }
    };

  } catch (error) {
    console.error("Player Stats Error:", error);
    return { error: error.message };
  }
}

async function getTeamPlayerStats(sport, teamId) {
  try {
    const currentSeason = new Date().getFullYear();
    let apiUrl;

    switch (sport.toLowerCase()) {
      case 'nba':
        apiUrl = `https://v2.nba.api-sports.io/players/statistics?season=${currentSeason}&team=${teamId}`;
        break;
      case 'nfl':
      case 'ncaaf':
        apiUrl = `https://v1.american-football.api-sports.io/players/statistics?season=${currentSeason}&team=${teamId}`;
        break;
      case 'mlb':
        apiUrl = `https://v1.baseball.api-sports.io/players/statistics?season=${currentSeason}&team=${teamId}`;
        break;
      case 'soccer':
        // For soccer, we need league ID - using EPL as default
        apiUrl = `https://v3.football.api-sports.io/players/statistics?season=${currentSeason}&team=${teamId}&league=39`;
        break;
      default:
        return { players: [], error: `Player stats not supported for ${sport}` };
    }

    console.log(`Fetching player stats from: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-apisports-key": API_SPORTS_KEY
      }
    });

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`Player stats API error:`, response.data.errors);
      return { players: [], error: JSON.stringify(response.data.errors) };
    }

    if (!response.data.response || response.data.response.length === 0) {
      console.log(`No player stats found for team ${teamId}`);
      return { players: [], error: null };
    }

    const players = response.data.response;
    console.log(`Found ${players.length} players for team ${teamId}`);

    return { players, error: null };

  } catch (error) {
    console.error(`Error fetching player stats for team ${teamId}:`, error);
    return { players: [], error: error.message };
  }
}

function getTop3Players(players, sport) {
  if (!players || players.length === 0) return [];

  switch (sport.toLowerCase()) {
    case 'nba':
      return players
        .sort((a, b) => (b.statistics?.points?.average || 0) - (a.statistics?.points?.average || 0))
        .slice(0, 3);

    case 'nfl':
    case 'ncaaf':
      // Get top player from each key position
      const qb = players
        .filter(p => p.player?.position === 'QB')
        .sort((a, b) => (b.statistics?.passing?.yards || 0) - (a.statistics?.passing?.yards || 0))[0];

      const rb = players
        .filter(p => p.player?.position === 'RB')
        .sort((a, b) => (b.statistics?.rushing?.yards || 0) - (a.statistics?.rushing?.yards || 0))[0];

      const wr = players
        .filter(p => p.player?.position === 'WR')
        .sort((a, b) => (b.statistics?.receiving?.yards || 0) - (a.statistics?.receiving?.yards || 0))[0];

      return [qb, rb, wr].filter(Boolean);

    case 'mlb':
      return players
        .filter(p => (p.statistics?.batting?.at_bats || 0) > 50) // Minimum AB threshold
        .sort((a, b) => {
          const aOPS = (a.statistics?.batting?.on_base_percentage || 0) + (a.statistics?.batting?.slugging_percentage || 0);
          const bOPS = (b.statistics?.batting?.on_base_percentage || 0) + (b.statistics?.batting?.slugging_percentage || 0);
          return bOPS - aOPS;
        })
        .slice(0, 3);

    case 'soccer':
      return players
        .filter(p => (p.statistics?.[0]?.games?.appearences || 0) > 5) // Minimum games threshold
        .sort((a, b) => {
          const aContrib = (a.statistics?.[0]?.goals?.total || 0) + (a.statistics?.[0]?.goals?.assists || 0);
          const bContrib = (b.statistics?.[0]?.goals?.total || 0) + (b.statistics?.[0]?.goals?.assists || 0);
          return bContrib - aContrib;
        })
        .slice(0, 3);

    default:
      return players.slice(0, 3);
  }
}

// ====================================================================
// TEAM STATISTICS DATA FUNCTIONS
// ====================================================================

async function getTeamStatsData(sport, team1Id, team2Id) {
  try {
    console.log(`Fetching team stats for ${sport} - Team1: ${team1Id}, Team2: ${team2Id}`);

    const [team1Stats, team2Stats] = await Promise.all([
      getSingleTeamStats(sport, team1Id),
      getSingleTeamStats(sport, team2Id)
    ]);

    return {
      team1: {
        teamId: team1Id,
        stats: team1Stats.stats,
        error: team1Stats.error
      },
      team2: {
        teamId: team2Id,
        stats: team2Stats.stats,
        error: team2Stats.error
      }
    };

  } catch (error) {
    console.error("Team Stats Error:", error);
    return { error: error.message };
  }
}

async function getSingleTeamStats(sport, teamId) {
  try {
    const currentSeason = new Date().getFullYear();
    let apiUrl;

    switch (sport.toLowerCase()) {
      case 'nba':
        apiUrl = `https://v2.nba.api-sports.io/teams/statistics?season=${currentSeason}&team=${teamId}`;
        break;
      case 'nfl':
      case 'ncaaf':
        apiUrl = `https://v1.american-football.api-sports.io/teams/statistics?season=${currentSeason}&team=${teamId}`;
        break;
      case 'mlb':
        apiUrl = `https://v1.baseball.api-sports.io/teams/statistics?season=${currentSeason}&team=${teamId}`;
        break;
      case 'soccer':
        // For soccer, we need league ID - using EPL as default
        apiUrl = `https://v3.football.api-sports.io/teams/statistics?season=${currentSeason}&team=${teamId}&league=39`;
        break;
      default:
        return { stats: null, error: `Team stats not supported for ${sport}` };
    }

    console.log(`Fetching team stats from: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-apisports-key": API_SPORTS_KEY
      }
    });

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`Team stats API error:`, response.data.errors);
      return { stats: null, error: JSON.stringify(response.data.errors) };
    }

    if (!response.data.response) {
      console.log(`No team stats found for team ${teamId}`);
      return { stats: null, error: "No data found" };
    }

    const stats = response.data.response[0] || response.data.response;
    console.log(`Found team stats for team ${teamId}`);

    return { stats, error: null };

  } catch (error) {
    console.error(`Error fetching team stats for team ${teamId}:`, error);
    return { stats: null, error: error.message };
  }
}

// ====================================================================
// HELPER FUNCTIONS (REUSE FROM MAIN FILE)
// ====================================================================

// Reuse the findTeamIds function from the main file
async function findTeamIds(sport, team1Name, team1Code, team2Name, team2Code, soccer_odds_type = null) {
  // This would be the same function from your main index.js file
  // For brevity, I'm not copying the entire function here
  // In production, you'd either import it or copy the full implementation

  // Placeholder implementation
  return {
    team1Id: "145", // Lakers example
    team2Id: "146", // Warriors example
    team1StatpalCode: "LAL",
    team2StatpalCode: "GSW",
    sport_type_odds: sport === 'nba' ? 'basketball_nba' : sport
  };
}

// Reuse the fuzzyMatchTeam function
function fuzzyMatchTeam(event, team1, team2) {
  // Simplified version - in production, use the full implementation from main file
  const homeMatch = event.home_team.toLowerCase().includes(team1.toLowerCase()) ||
                   event.home_team.toLowerCase().includes(team2.toLowerCase());
  const awayMatch = event.away_team.toLowerCase().includes(team1.toLowerCase()) ||
                   event.away_team.toLowerCase().includes(team2.toLowerCase());

  return homeMatch && awayMatch;
}
