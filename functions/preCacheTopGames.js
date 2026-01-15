/**
 * preCacheTopGames.js
 *
 * Weekly cron job to pre-cache analysis for top upcoming NBA and Soccer games.
 * This ensures creators have market data available when making content on replays.
 *
 * Run: firebase deploy --only functions:preCacheTopGames
 * Test: curl -X POST https://us-central1-betai-f9176.cloudfunctions.net/preCacheTopGames -H "x-api-key: YOUR_KEY"
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
require('dotenv').config();

// Don't initialize Firebase here - it's initialized in index.js which imports this file
// We get the db reference lazily when needed
const getDb = () => admin.firestore();

const ODDS_API_KEY = process.env.ODDS_API_KEY;

// Big market teams that get more views/content creation
const BIG_MARKET_NBA_TEAMS = [
  'Los Angeles Lakers', 'Golden State Warriors', 'Boston Celtics', 'Miami Heat',
  'New York Knicks', 'Brooklyn Nets', 'Chicago Bulls', 'Philadelphia 76ers',
  'Dallas Mavericks', 'Phoenix Suns', 'Denver Nuggets', 'Milwaukee Bucks',
  'LA Clippers', 'Cleveland Cavaliers', 'Memphis Grizzlies', 'Minnesota Timberwolves'
];

const BIG_MARKET_SOCCER_TEAMS = [
  // Premier League
  'Manchester United', 'Manchester City', 'Liverpool', 'Arsenal', 'Chelsea', 'Tottenham',
  'Newcastle', 'Aston Villa', 'West Ham', 'Brighton', 'Burnley', 'Wolverhampton Wanderers',
  // La Liga
  'Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Real Sociedad', 'Athletic Bilbao',
  // Serie A
  'Juventus', 'AC Milan', 'Inter Milan', 'Napoli', 'Roma', 'Lazio',
  // Bundesliga
  'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'Bayer Leverkusen',
  // Ligue 1
  'Paris Saint Germain', 'Marseille', 'Monaco', 'Lyon'
];

// Soccer leagues to fetch from (prioritized order)
const SOCCER_LEAGUES = [
  { key: 'soccer_epl', name: 'EPL', limit: 5 },
  { key: 'soccer_uefa_champs_league', name: 'Champions League', limit: 3 },
  { key: 'soccer_spain_la_liga', name: 'La Liga', limit: 3 },
  { key: 'soccer_italy_serie_a', name: 'Serie A', limit: 2 },
  { key: 'soccer_germany_bundesliga', name: 'Bundesliga', limit: 2 },
  { key: 'soccer_france_ligue_one', name: 'Ligue 1', limit: 1 },
  { key: 'soccer_uefa_europa_league', name: 'Europa League', limit: 1 }
];

// Extended cache TTL for pre-cached content (10 days in milliseconds)
const PRE_CACHE_TTL_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * Recursively removes empty string keys from objects
 * Firestore doesn't allow empty string keys in map fields
 */
function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '') continue; // Skip empty string keys
      sanitized[key] = sanitizeForFirestore(value);
    }
    return sanitized;
  }
  return obj;
}

/**
 * Fetch upcoming games from The Odds API, prioritizing big market teams
 */
async function fetchUpcomingGamesForSport(sport, bigMarketTeams, limit) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${ODDS_API_KEY}`;
    console.log(`Fetching events from: ${url}`);

    const response = await axios.get(url);
    const events = response.data || [];

    console.log(`Found ${events.length} total upcoming events for ${sport}`);

    // Score each game by big market team involvement
    const scoredGames = events.map(event => {
      let score = 0;
      if (bigMarketTeams.some(team => event.home_team.includes(team) || team.includes(event.home_team))) score += 2;
      if (bigMarketTeams.some(team => event.away_team.includes(team) || team.includes(event.away_team))) score += 2;
      // Bonus for games between two big market teams
      if (score === 4) score += 2;
      return { ...event, bigMarketScore: score };
    });

    // Sort by big market score (descending), then by commence_time (ascending)
    scoredGames.sort((a, b) => {
      if (b.bigMarketScore !== a.bigMarketScore) return b.bigMarketScore - a.bigMarketScore;
      return new Date(a.commence_time) - new Date(b.commence_time);
    });

    // Take top N games
    const selectedGames = scoredGames.slice(0, limit);
    console.log(`Selected ${selectedGames.length} games for ${sport}:`,
      selectedGames.map(g => `${g.home_team} vs ${g.away_team} (score: ${g.bigMarketScore})`));

    return selectedGames;

  } catch (error) {
    console.error(`Error fetching games for ${sport}:`, error.message);
    return [];
  }
}

/**
 * preCacheTopGames - HTTP endpoint to pre-cache analysis for top upcoming games
 *
 * Called weekly by Cloud Scheduler to ensure creators have market data
 * available even when making content on game replays.
 *
 * Caches 20 NBA games + 10 Soccer games with 10-day TTL.
 *
 * Note: Using simple functions.https.onRequest for compatibility.
 * Timeout defaults to 60s for HTTP functions. For longer runs,
 * consider using Cloud Tasks or breaking into smaller batches.
 */
exports.preCacheTopGames = functions.https.onRequest(async (req, res) => {

    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, authorization');

    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    // Simple auth check - can be called by Cloud Scheduler or with API key
    const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
    const isScheduler = req.headers['x-cloudscheduler'] === 'true';

    // For testing, allow without auth in development
    const isDev = process.env.FUNCTIONS_EMULATOR === 'true';

    if (!isDev && !isScheduler && authHeader !== process.env.PRE_CACHE_API_KEY) {
      console.log('⚠️ Unauthorized preCacheTopGames attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🚀 Starting preCacheTopGames job...');
    const startTime = Date.now();
    const results = { nba: [], soccer: [], errors: [] };

    try {
      // Fetch NBA games
      const nbaGames = await fetchUpcomingGamesForSport('basketball_nba', BIG_MARKET_NBA_TEAMS, 20);

      // Fetch soccer games from multiple leagues in parallel
      const soccerLeaguePromises = SOCCER_LEAGUES.map(league =>
        fetchUpcomingGamesForSport(league.key, BIG_MARKET_SOCCER_TEAMS, league.limit)
          .then(games => games.map(g => ({ ...g, league: league.name, leagueKey: league.key })))
      );
      const soccerGamesByLeague = await Promise.all(soccerLeaguePromises);
      const soccerGames = soccerGamesByLeague.flat();

      console.log(`📊 Found ${nbaGames.length} NBA games, ${soccerGames.length} Soccer games to cache`);

      // Process NBA games sequentially to avoid rate limits
      for (const game of nbaGames) {
        try {
          console.log(`🏀 Caching NBA: ${game.home_team} vs ${game.away_team}`);
          await preCacheGameAnalysis('nba', game.home_team, game.away_team, 'basketball_nba');
          results.nba.push({ home: game.home_team, away: game.away_team, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache NBA game: ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'nba', game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      // Process Soccer games from all leagues
      for (const game of soccerGames) {
        try {
          console.log(`⚽ Caching Soccer (${game.league}): ${game.home_team} vs ${game.away_team}`);
          await preCacheGameAnalysis('soccer', game.home_team, game.away_team, game.leagueKey);
          results.soccer.push({ home: game.home_team, away: game.away_team, league: game.league, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache Soccer game (${game.league}): ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'soccer', league: game.league, game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ preCacheTopGames completed in ${duration}s`);
      console.log(`   NBA: ${results.nba.length} cached, Soccer: ${results.soccer.length} cached, Errors: ${results.errors.length}`);

      res.status(200).json({
        success: true,
        duration: `${duration}s`,
        summary: {
          nba: results.nba.length,
          soccer: results.soccer.length,
          errors: results.errors.length
        },
        results
      });

    } catch (error) {
      console.error('❌ preCacheTopGames fatal error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        results
      });
    }
  });

/**
 * Run the full analysis pipeline for a game and save to cache with extended TTL
 *
 * This calls the internal helper functions that are also used by analyzeImage
 */
async function preCacheGameAnalysis(sport, team1, team2, oddsApiSport) {
  // We need to call internal functions from index.js
  // Since they're not exported, we'll make direct API calls to our own endpoints
  // This is cleaner and ensures we use the exact same logic

  const baseUrl = process.env.FUNCTIONS_EMULATOR === 'true'
    ? 'http://127.0.0.1:5001/betai-f9176/us-central1'
    : 'https://us-central1-betai-f9176.cloudfunctions.net';

  // Call marketIntelligence endpoint to get full analysis data
  // This will also populate the cache as a side effect
  const response = await axios.post(`${baseUrl}/marketIntelligence`, {
    sport: oddsApiSport,
    team1,
    team2,
    locale: 'en'
  }, {
    timeout: 60000 // 60 second timeout per game
  });

  if (response.data.marketIntelligence?.error) {
    throw new Error(response.data.marketIntelligence.error);
  }

  // Now we need to save this to cache with extended TTL
  // The marketIntelligence endpoint doesn't save to cache, so we do it here
  const data = response.data;

  // Get team IDs from the response
  const team1Id = data.teamIds?.team1Id;
  const team2Id = data.teamIds?.team2Id;

  if (!team1Id || !team2Id) {
    throw new Error('Could not determine team IDs from response');
  }

  // Build cache key
  const teams = [String(team1Id), String(team2Id)].sort().join('-');
  const cacheKey = `${sport.toLowerCase()}_${teams}_en`;

  // Build analysis object matching analyzeImage structure
  // Sanitize data to remove empty string keys (Firestore doesn't allow them)
  const analysis = sanitizeForFirestore({
    sport,
    teams: data.teams,
    marketIntelligence: data.marketIntelligence,
    teamStats: data.teamStats,
    keyInsightsNew: data.keyInsightsNew,
    preCached: true,
    preCachedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + PRE_CACHE_TTL_MS).toISOString()
  });

  console.log(`💾 Saving pre-cached analysis with key: ${cacheKey}`);

  await getDb().collection('matchAnalysisCache').doc(cacheKey).set({
    analysis,
    timestamp: new Date().toISOString(),
    sport: sport.toLowerCase(),
    team1Id: String(team1Id),
    team2Id: String(team2Id),
    language: 'en',
    preCached: true,
    expiresAt: new Date(Date.now() + PRE_CACHE_TTL_MS).toISOString()
  });

  console.log(`✅ Pre-cached: ${sport} ${team1} vs ${team2}`);
}

/**
 * Scheduled version - runs every Sunday at 6 AM UTC
 * This automatically creates a Cloud Scheduler job on deploy
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");

exports.preCacheTopGamesScheduled = onSchedule({
  schedule: '0 6 * * 0',
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB'
}, async () => {
    console.log('🚀 Starting scheduled preCacheTopGames job...');
    const startTime = Date.now();
    const results = { nba: [], soccer: [], errors: [] };

    try {
      // Fetch NBA games
      const nbaGames = await fetchUpcomingGamesForSport('basketball_nba', BIG_MARKET_NBA_TEAMS, 20);

      // Fetch soccer games from multiple leagues in parallel
      const soccerLeaguePromises = SOCCER_LEAGUES.map(league =>
        fetchUpcomingGamesForSport(league.key, BIG_MARKET_SOCCER_TEAMS, league.limit)
          .then(games => games.map(g => ({ ...g, league: league.name, leagueKey: league.key })))
      );
      const soccerGamesByLeague = await Promise.all(soccerLeaguePromises);
      const soccerGames = soccerGamesByLeague.flat();

      console.log(`📊 Found ${nbaGames.length} NBA games, ${soccerGames.length} Soccer games to cache`);

      for (const game of nbaGames) {
        try {
          console.log(`🏀 Caching NBA: ${game.home_team} vs ${game.away_team}`);
          await preCacheGameAnalysis('nba', game.home_team, game.away_team, 'basketball_nba');
          results.nba.push({ home: game.home_team, away: game.away_team, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache NBA game: ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'nba', game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      for (const game of soccerGames) {
        try {
          console.log(`⚽ Caching Soccer (${game.league}): ${game.home_team} vs ${game.away_team}`);
          await preCacheGameAnalysis('soccer', game.home_team, game.away_team, game.leagueKey);
          results.soccer.push({ home: game.home_team, away: game.away_team, league: game.league, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache Soccer game (${game.league}): ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'soccer', league: game.league, game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Scheduled preCacheTopGames completed in ${duration}s`);
      console.log(`   NBA: ${results.nba.length} cached, Soccer: ${results.soccer.length} cached, Errors: ${results.errors.length}`);

      return null;
    } catch (error) {
      console.error('❌ Scheduled preCacheTopGames fatal error:', error);
      throw error;
    }
  });
