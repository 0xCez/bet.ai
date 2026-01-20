/**
 * preCacheTopGames.js
 *
 * Runs every 2 days to pre-cache FULL AI analysis for top upcoming NBA and Soccer games.
 * This ensures users have complete analysis (including AI breakdown, xFactors, etc.)
 * available instantly when they tap on a game from the carousel.
 *
 * Run: firebase deploy --only functions:preCacheTopGames
 * Test: curl -X POST https://us-central1-betai-f9176.cloudfunctions.net/preCacheTopGames -H "x-api-key: YOUR_KEY"
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");
require('dotenv').config();

// Don't initialize Firebase here - it's initialized in index.js which imports this file
// We get the db reference lazily when needed
const getDb = () => admin.firestore();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

// Soccer leagues to fetch from (prioritized order) - total 10 games
const SOCCER_LEAGUES = [
  { key: 'soccer_epl', name: 'EPL', limit: 3 },
  { key: 'soccer_uefa_champs_league', name: 'Champions League', limit: 2 },
  { key: 'soccer_spain_la_liga', name: 'La Liga', limit: 2 },
  { key: 'soccer_italy_serie_a', name: 'Serie A', limit: 1 },
  { key: 'soccer_germany_bundesliga', name: 'Bundesliga', limit: 1 },
  { key: 'soccer_france_ligue_one', name: 'Ligue 1', limit: 1 }
];

// Post-game buffer: keep analysis available for 4 hours after game starts
// This allows users to still view analysis during/shortly after the game
const POST_GAME_BUFFER_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Generate cache key for a game based on team IDs
 * This matches the key format used in preCacheGameAnalysis
 */
function getCacheKey(sport, team1Id, team2Id) {
  const teams = [String(team1Id), String(team2Id)].sort().join('-');
  return `${sport.toLowerCase()}_${teams}_en`;
}

/**
 * Check if a game is already cached and still valid
 * Returns true if we should skip caching this game
 */
async function isGameAlreadyCached(cacheRef, sport, team1, team2) {
  try {
    // We need to get team IDs first - call a lightweight endpoint or check by team names
    // For now, we'll check by querying existing docs that match the teams
    const snapshot = await cacheRef
      .where('preCached', '==', true)
      .where('sport', '==', sport.toLowerCase())
      .get();

    const now = new Date().toISOString();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const analysis = data.analysis || {};
      const teams = analysis.teams || {};

      // Check if this doc matches our teams (either order)
      const isMatch =
        (teams.home === team1 && teams.away === team2) ||
        (teams.home === team2 && teams.away === team1);

      if (isMatch) {
        // Check if still valid (not expired and game hasn't started)
        const isExpired = data.expiresAt && data.expiresAt < now;
        const gameStarted = data.gameStartTime && data.gameStartTime < now;

        if (!isExpired && !gameStarted) {
          return true; // Game is cached and valid
        }
      }
    }

    return false; // Not cached or expired
  } catch (error) {
    console.error(`Error checking cache for ${team1} vs ${team2}:`, error.message);
    return false; // On error, proceed with caching
  }
}

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
 * Fetch upcoming games from The Odds API
 * For NBA: fetches ALL available games (no team filter) sorted by time
 * For Soccer: prioritizes big market teams
 */
async function fetchUpcomingGamesForSport(sport, bigMarketTeams, limit, skipTeamFilter = false) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/events?apiKey=${ODDS_API_KEY}`;
    console.log(`Fetching events from: ${url}`);

    const response = await axios.get(url);
    const events = response.data || [];

    console.log(`Found ${events.length} total upcoming events for ${sport}`);

    // If skipTeamFilter is true (for NBA), just sort by time and take first N
    if (skipTeamFilter) {
      const sortedByTime = events.sort((a, b) =>
        new Date(a.commence_time) - new Date(b.commence_time)
      );
      const selectedGames = sortedByTime.slice(0, limit);
      console.log(`Selected ${selectedGames.length} games for ${sport} (no team filter):`,
        selectedGames.map(g => `${g.home_team} vs ${g.away_team} (${g.commence_time})`));
      return selectedGames;
    }

    // For soccer: Score each game by big market team involvement
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
exports.preCacheTopGames = onRequest({
  timeoutSeconds: 540,
  memory: '512MiB',
  cors: true
}, async (req, res) => {

    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, authorization');

    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    // Auth temporarily disabled for testing

    console.log('🚀 Starting preCacheTopGames job...');
    const startTime = Date.now();
    const results = { nba: [], soccer: [], errors: [], cleaned: 0, skipped: 0 };

    try {
      // Step 0: Clean up only EXPIRED pre-cached games (smart cleanup)
      console.log('🧹 Cleaning up expired pre-cached games...');
      const cacheRef = getDb().collection('matchAnalysisCache');
      const now = new Date().toISOString();

      // Query for all pre-cached games, filter expired ones in code (avoids composite index)
      const allPreCachedSnapshot = await cacheRef
        .where('preCached', '==', true)
        .get();

      if (!allPreCachedSnapshot.empty) {
        const batch = getDb().batch();
        allPreCachedSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          // Only delete if expired
          if (data.expiresAt && data.expiresAt < now) {
            batch.delete(doc.ref);
            results.cleaned++;
          }
        });
        if (results.cleaned > 0) {
          await batch.commit();
          console.log(`🗑️ Deleted ${results.cleaned} expired pre-cached games`);
        } else {
          console.log('📭 No expired pre-cached games to clean');
        }
      } else {
        console.log('📭 No pre-cached games found');
      }

      // ===== STEP 1: NBA GAMES (10 games, no team filter) =====
      console.log('\n🏀 ========== FETCHING NBA GAMES ==========');
      const nbaGames = await fetchUpcomingGamesForSport('basketball_nba', null, 10, true); // skipTeamFilter = true
      console.log(`🏀 Found ${nbaGames.length} NBA games from API`);

      // Process NBA games sequentially (skip already cached)
      for (const game of nbaGames) {
        try {
          // Check if game is already cached and valid
          const alreadyCached = await isGameAlreadyCached(cacheRef, 'nba', game.home_team, game.away_team);
          if (alreadyCached) {
            console.log(`⏭️ Skipping already cached NBA: ${game.home_team} vs ${game.away_team}`);
            results.skipped++;
            continue;
          }

          console.log(`🏀 Caching NBA: ${game.home_team} vs ${game.away_team} (${game.commence_time})`);
          await preCacheGameAnalysis('nba', game.home_team, game.away_team, 'basketball_nba', game.commence_time);
          results.nba.push({ home: game.home_team, away: game.away_team, gameStartTime: game.commence_time, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache NBA game: ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'nba', game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      // Log NBA results
      console.log('\n🏀 ========== NBA RESULTS ==========');
      console.log(`🏀 NBA: ${results.nba.length} cached, ${results.errors.filter(e => e.sport === 'nba').length} errors`);
      results.nba.forEach((g, i) => console.log(`   ${i + 1}. ${g.home} vs ${g.away} (${g.gameStartTime})`));

      // ===== STEP 2: SOCCER GAMES (10 games from multiple leagues) =====
      console.log('\n⚽ ========== FETCHING SOCCER GAMES ==========');
      const soccerLeaguePromises = SOCCER_LEAGUES.map(league =>
        fetchUpcomingGamesForSport(league.key, BIG_MARKET_SOCCER_TEAMS, league.limit, false)
          .then(games => games.map(g => ({ ...g, league: league.name, leagueKey: league.key })))
      );
      const soccerGamesByLeague = await Promise.all(soccerLeaguePromises);
      const soccerGames = soccerGamesByLeague.flat();
      console.log(`⚽ Found ${soccerGames.length} Soccer games from API`);

      // Process Soccer games from all leagues (skip already cached)
      for (const game of soccerGames) {
        try {
          // Check if game is already cached and valid
          const alreadyCached = await isGameAlreadyCached(cacheRef, 'soccer', game.home_team, game.away_team);
          if (alreadyCached) {
            console.log(`⏭️ Skipping already cached Soccer: ${game.home_team} vs ${game.away_team}`);
            results.skipped++;
            continue;
          }

          console.log(`⚽ Caching Soccer (${game.league}): ${game.home_team} vs ${game.away_team} (${game.commence_time})`);
          await preCacheGameAnalysis('soccer', game.home_team, game.away_team, game.leagueKey, game.commence_time);
          results.soccer.push({ home: game.home_team, away: game.away_team, league: game.league, gameStartTime: game.commence_time, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache Soccer game (${game.league}): ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'soccer', league: game.league, game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      // Log Soccer results
      console.log('\n⚽ ========== SOCCER RESULTS ==========');
      console.log(`⚽ Soccer: ${results.soccer.length} cached, ${results.errors.filter(e => e.sport === 'soccer').length} errors`);
      results.soccer.forEach((g, i) => console.log(`   ${i + 1}. ${g.home} vs ${g.away} [${g.league}] (${g.gameStartTime})`));

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ preCacheTopGames completed in ${duration}s`);
      console.log(`   NBA: ${results.nba.length} cached, Soccer: ${results.soccer.length} cached, Skipped: ${results.skipped}, Errors: ${results.errors.length}`);

      res.status(200).json({
        success: true,
        duration: `${duration}s`,
        summary: {
          cleaned: results.cleaned,
          skipped: results.skipped,
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
 * Run the FULL analysis pipeline for a game and save to cache
 *
 * This calls marketIntelligence to get data, then generates AI analysis via GPT-4
 * to create the complete analysis matching what analyzeImage produces.
 *
 * @param {string} gameStartTime - ISO 8601 commence_time from The Odds API
 */
async function preCacheGameAnalysis(sport, team1, team2, oddsApiSport, gameStartTime) {
  const baseUrl = process.env.FUNCTIONS_EMULATOR === 'true'
    ? 'http://127.0.0.1:5001/betai-f9176/us-central1'
    : 'https://us-central1-betai-f9176.cloudfunctions.net';

  // Step 1: Get market intelligence data
  console.log(`📊 Fetching market data for ${team1} vs ${team2}...`);
  const response = await axios.post(`${baseUrl}/marketIntelligence`, {
    sport: oddsApiSport,
    team1,
    team2,
    locale: 'en'
  }, {
    timeout: 60000
  });

  if (response.data.marketIntelligence?.error) {
    throw new Error(response.data.marketIntelligence.error);
  }

  const data = response.data;
  const team1Id = data.teamIds?.team1Id;
  const team2Id = data.teamIds?.team2Id;

  if (!team1Id || !team2Id) {
    throw new Error('Could not determine team IDs from response');
  }

  // Step 2: Generate AI analysis using GPT-4 (same as analyzeImage)
  console.log(`🤖 Generating AI analysis for ${team1} vs ${team2}...`);
  const aiAnalysis = await generateAIAnalysis(
    sport,
    team1,
    team2,
    data.marketIntelligence,
    data.teamStats,
    data.keyInsightsNew,
    data.gameData
  );

  // Step 3: Build the full analysis object matching analyzeImage structure
  const teams = [String(team1Id), String(team2Id)].sort().join('-');
  const cacheKey = `${sport.toLowerCase()}_${teams}_en`;

  // Calculate expiration: 4 hours after game starts (not from cache time)
  const gameStart = new Date(gameStartTime);
  const expiresAt = new Date(gameStart.getTime() + POST_GAME_BUFFER_MS).toISOString();

  const fullAnalysis = sanitizeForFirestore({
    sport,
    teams: {
      home: team1,
      away: team2,
      logos: data.teams?.logos || {}
    },
    // AI-generated fields (from GPT-4)
    keyInsights: aiAnalysis.keyInsights,
    matchSnapshot: aiAnalysis.matchSnapshot,
    xFactors: aiAnalysis.xFactors,
    aiAnalysis: aiAnalysis.aiAnalysis,
    // Data fields
    marketIntelligence: data.marketIntelligence,
    teamStats: data.teamStats,
    keyInsightsNew: data.keyInsightsNew,
    // Pre-cache metadata
    preCached: true,
    preCachedAt: new Date().toISOString(),
    gameStartTime: gameStartTime, // When the game actually starts
    expiresAt: expiresAt // 4 hours after game start
  });

  console.log(`💾 Saving pre-cached analysis: ${cacheKey} (game: ${gameStartTime}, expires: ${expiresAt})`);

  await getDb().collection('matchAnalysisCache').doc(cacheKey).set({
    analysis: fullAnalysis,
    timestamp: new Date().toISOString(),
    sport: sport.toLowerCase(),
    team1Id: String(team1Id),
    team2Id: String(team2Id),
    language: 'en',
    preCached: true,
    gameStartTime: gameStartTime, // When the game actually starts
    expiresAt: expiresAt // 4 hours after game start
  });

  console.log(`✅ Pre-cached FULL analysis: ${sport} ${team1} vs ${team2}`);
}

/**
 * Generate AI analysis using GPT-4 (simplified version of analyzeImage prompt)
 * This creates matchSnapshot, xFactors, and aiAnalysis breakdown
 */
async function generateAIAnalysis(sport, team1, team2, marketIntelligence, teamStats, keyInsightsNew, gameData) {
  const locale = 'en';

  // Build the AI prompt with available data
  const prompt = `
  Task: You are an expert sports betting analyst. Generate betting analysis for this ${sport.toUpperCase()} game.

  ## Teams
  Home: ${team1}
  Away: ${team2}

  ## Market Intelligence
  ${JSON.stringify(marketIntelligence || {})}

  ## Team Statistics
  ${JSON.stringify(teamStats || {})}

  ## Key Insights
  ${JSON.stringify(keyInsightsNew || {})}

  ## Game Data (Last 10 games, H2H, Injuries)
  ${JSON.stringify(gameData || {})}

  Your tone should be sharp, real, and degen — like a bettor who's been in the trenches.

  Return JSON with this exact structure:
  {
    "keyInsights": {
      "confidence": "Low" | "Medium" | "High",
      "marketActivity": "Low" | "Moderate" | "High",
      "lineShift": "Low" | "Moderate" | "High",
      "publicVsSharps": { "public": 65, "sharps": 35 }
    },
    "matchSnapshot": {
      "recentPerformance": {
        "home": "e.g., 7-3 (W-W-L-W-W)",
        "away": "e.g., 5-5 (L-W-L-W-L)"
      },
      "headToHead": "e.g., 2-1 in last 3 matchups",
      "momentum": {
        "home": "e.g., On a 3-game win streak",
        "away": "e.g., Struggling on the road"
      }
    },
    "xFactors": [
      { "title": "Health & Availability", "detail": "Key injury impact", "type": 1 },
      { "title": "Location & Weather", "detail": "Venue/weather factors", "type": 2 },
      { "title": "Officiating & Rules", "detail": "Referee trends", "type": 3 },
      { "title": "Travel & Fatigue", "detail": "Rest and travel effect", "type": 4 }
    ],
    "aiAnalysis": {
      "confidenceScore": "5.8",
      "bettingSignal": "Value Bet" | "Public Trap" | "Sharp Trap" | "Market Conflicted",
      "breakdown": "3 paragraphs (~60-80 words each) with Market Read, On-Court Context, and Betting Interpretation"
    }
  }

  Make sure xFactors are specific based on the data. The breakdown should be 3 paragraphs covering:
  1. Market Read vs Reality (sharp/public split, line movement)
  2. On-Court Context (matchup analysis, form, injuries)
  3. Betting Interpretation (clear recommendation or angle)

  Return only the JSON object.`;

  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: prompt
      }],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" }
    }, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 45000
    });

    const aiResponse = response.data.choices[0]?.message?.content;
    const parsed = JSON.parse(aiResponse);

    console.log(`✅ AI analysis generated successfully`);
    return parsed;

  } catch (error) {
    console.error(`❌ AI analysis failed: ${error.message}`);
    // Return fallback analysis if AI fails
    return generateFallbackAnalysis(team1, team2, keyInsightsNew, teamStats, gameData);
  }
}

/**
 * Generate fallback analysis from data if GPT-4 fails
 */
function generateFallbackAnalysis(team1, team2, keyInsightsNew, teamStats, gameData) {
  const t1Stats = teamStats?.team1?.stats || {};
  const t2Stats = teamStats?.team2?.stats || {};
  const t1WL = gameData?.team1_last10games?.winLossRecord || { wins: 0, losses: 0 };
  const t2WL = gameData?.team2_last10games?.winLossRecord || { wins: 0, losses: 0 };

  return {
    keyInsights: {
      confidence: keyInsightsNew?.confidenceScore >= 70 ? "High" : keyInsightsNew?.confidenceScore >= 50 ? "Medium" : "Low",
      marketActivity: "Moderate",
      lineShift: "Low",
      publicVsSharps: { public: 60, sharps: 40 }
    },
    matchSnapshot: {
      recentPerformance: {
        home: `${t1WL.wins}-${t1WL.losses}`,
        away: `${t2WL.wins}-${t2WL.losses}`
      },
      headToHead: gameData?.h2h_games?.h2hRecord
        ? `${gameData.h2h_games.h2hRecord.team1Wins || 0}-${gameData.h2h_games.h2hRecord.team2Wins || 0} recent matchups`
        : "No recent H2H data",
      momentum: {
        home: t1WL.wins > t1WL.losses ? "Trending up" : "Struggling",
        away: t2WL.wins > t2WL.losses ? "Trending up" : "Struggling"
      }
    },
    xFactors: [
      { title: "Health & Availability", detail: "Check injury reports before betting", type: 1 },
      { title: "Location & Weather", detail: "Standard conditions expected", type: 2 },
      { title: "Officiating & Rules", detail: "Standard officiating expected", type: 3 },
      { title: "Travel & Fatigue", detail: "Normal rest for both teams", type: 4 }
    ],
    aiAnalysis: {
      confidenceScore: String(keyInsightsNew?.confidenceScore || 55),
      bettingSignal: keyInsightsNew?.bestValue ? "Value Bet" : "Market Conflicted",
      breakdown: `Market analysis for ${team1} vs ${team2}. ${keyInsightsNew?.marketConsensus?.display || 'Market efficiently priced.'}. ${keyInsightsNew?.bestValue?.label || 'Shop around for the best lines.'}. Check the key insights above for specific betting opportunities.`
    }
  };
}

/**
 * Scheduled version - runs every 2 days at 6 AM UTC
 * This automatically creates a Cloud Scheduler job on deploy
 */
exports.preCacheTopGamesScheduled = onSchedule({
  schedule: '0 6 */2 * *',
  timeZone: 'UTC',
  timeoutSeconds: 540,
  memory: '512MiB'
}, async () => {
    console.log('🚀 Starting scheduled preCacheTopGames job...');
    const startTime = Date.now();
    const results = { nba: [], soccer: [], errors: [], cleaned: 0, skipped: 0 };

    try {
      // Step 0: Clean up only EXPIRED pre-cached games (smart cleanup)
      console.log('🧹 Cleaning up expired pre-cached games...');
      const cacheRef = getDb().collection('matchAnalysisCache');
      const now = new Date().toISOString();

      // Query for all pre-cached games, filter expired ones in code (avoids composite index)
      const allPreCachedSnapshot = await cacheRef
        .where('preCached', '==', true)
        .get();

      if (!allPreCachedSnapshot.empty) {
        const batch = getDb().batch();
        allPreCachedSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          // Only delete if expired
          if (data.expiresAt && data.expiresAt < now) {
            batch.delete(doc.ref);
            results.cleaned++;
          }
        });
        if (results.cleaned > 0) {
          await batch.commit();
          console.log(`🗑️ Deleted ${results.cleaned} expired pre-cached games`);
        } else {
          console.log('📭 No expired pre-cached games to clean');
        }
      } else {
        console.log('📭 No pre-cached games found');
      }

      // ===== STEP 1: NBA GAMES (10 games, no team filter) =====
      console.log('\n🏀 ========== FETCHING NBA GAMES ==========');
      const nbaGames = await fetchUpcomingGamesForSport('basketball_nba', null, 10, true); // skipTeamFilter = true
      console.log(`🏀 Found ${nbaGames.length} NBA games from API`);

      for (const game of nbaGames) {
        try {
          // Check if game is already cached and valid
          const alreadyCached = await isGameAlreadyCached(cacheRef, 'nba', game.home_team, game.away_team);
          if (alreadyCached) {
            console.log(`⏭️ Skipping already cached NBA: ${game.home_team} vs ${game.away_team}`);
            results.skipped++;
            continue;
          }

          console.log(`🏀 Caching NBA: ${game.home_team} vs ${game.away_team} (${game.commence_time})`);
          await preCacheGameAnalysis('nba', game.home_team, game.away_team, 'basketball_nba', game.commence_time);
          results.nba.push({ home: game.home_team, away: game.away_team, gameStartTime: game.commence_time, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache NBA game: ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'nba', game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      // Log NBA results
      console.log('\n🏀 ========== NBA RESULTS ==========');
      console.log(`🏀 NBA: ${results.nba.length} cached, ${results.errors.filter(e => e.sport === 'nba').length} errors`);
      results.nba.forEach((g, i) => console.log(`   ${i + 1}. ${g.home} vs ${g.away} (${g.gameStartTime})`));

      // ===== STEP 2: SOCCER GAMES (10 games from multiple leagues) =====
      console.log('\n⚽ ========== FETCHING SOCCER GAMES ==========');
      const soccerLeaguePromises = SOCCER_LEAGUES.map(league =>
        fetchUpcomingGamesForSport(league.key, BIG_MARKET_SOCCER_TEAMS, league.limit, false)
          .then(games => games.map(g => ({ ...g, league: league.name, leagueKey: league.key })))
      );
      const soccerGamesByLeague = await Promise.all(soccerLeaguePromises);
      const soccerGames = soccerGamesByLeague.flat();
      console.log(`⚽ Found ${soccerGames.length} Soccer games from API`);

      for (const game of soccerGames) {
        try {
          // Check if game is already cached and valid
          const alreadyCached = await isGameAlreadyCached(cacheRef, 'soccer', game.home_team, game.away_team);
          if (alreadyCached) {
            console.log(`⏭️ Skipping already cached Soccer: ${game.home_team} vs ${game.away_team}`);
            results.skipped++;
            continue;
          }

          console.log(`⚽ Caching Soccer (${game.league}): ${game.home_team} vs ${game.away_team} (${game.commence_time})`);
          await preCacheGameAnalysis('soccer', game.home_team, game.away_team, game.leagueKey, game.commence_time);
          results.soccer.push({ home: game.home_team, away: game.away_team, league: game.league, gameStartTime: game.commence_time, status: 'success' });
        } catch (error) {
          console.error(`❌ Failed to cache Soccer game (${game.league}): ${game.home_team} vs ${game.away_team}`, error.message);
          results.errors.push({ sport: 'soccer', league: game.league, game: `${game.home_team} vs ${game.away_team}`, error: error.message });
        }
      }

      // Log Soccer results
      console.log('\n⚽ ========== SOCCER RESULTS ==========');
      console.log(`⚽ Soccer: ${results.soccer.length} cached, ${results.errors.filter(e => e.sport === 'soccer').length} errors`);
      results.soccer.forEach((g, i) => console.log(`   ${i + 1}. ${g.home} vs ${g.away} [${g.league}] (${g.gameStartTime})`));

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Scheduled preCacheTopGames completed in ${duration}s`);
      console.log(`   NBA: ${results.nba.length} cached, Soccer: ${results.soccer.length} cached, Skipped: ${results.skipped}, Errors: ${results.errors.length}`);

      return null;
    } catch (error) {
      console.error('❌ Scheduled preCacheTopGames fatal error:', error);
      throw error;
    }
  });
