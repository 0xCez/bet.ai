/**
 * NBA Props ML Integration Cloud Function
 * Main orchestrator for fetching player game logs, calculating 88 ML features,
 * and preparing data for Vertex AI predictions
 *
 * This function is SEPARATE from marketIntelligence to avoid coupling
 * and performance degradation of existing features
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { initialize, getPlayerGameLogs, getCurrentNBASeason } = require('./helpers/nbaHelpers');
const { calculateAllMLFeatures } = require('./helpers/mlFeatureEngineering');
const { callVertexAI, batchPredictVertexAI } = require('./helpers/vertexAI');

// Lazy initialization of Firestore (admin is initialized in index.js)
let db;
const getDb = () => {
  if (!db) {
    db = admin.firestore();
  }
  return db;
};

// Initialize helpers with API key from environment
// Note: functions.config() is called lazily when function executes
const getApiKey = () => {
  try {
    return functions.config().apisports?.key || process.env.API_SPORTS_KEY;
  } catch (e) {
    return process.env.API_SPORTS_KEY;
  }
};

// Cache TTLs
const GAME_LOGS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const ML_FEATURES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Get player game logs from cache or API
 * Caching reduces API calls and improves performance
 *
 * @param {number} playerId - API-Sports player ID
 * @param {number} season - NBA season
 * @returns {Promise<Array>} Game logs array
 */
async function getCachedGameLogs(playerId, season) {
  const cacheKey = `player_gamelogs_${playerId}_${season}`;

  try {
    // Check Firestore cache
    const cacheDoc = await getDb().collection('ml_cache').doc(cacheKey).get();

    if (cacheDoc.exists) {
      const cached = cacheDoc.data();
      const age = Date.now() - cached.timestamp;

      if (age < GAME_LOGS_CACHE_TTL_MS) {
        console.log(`[NBA Props ML] Cache HIT for player ${playerId} game logs (age: ${Math.round(age / 1000 / 60)}m)`);
        return cached.gameLogs;
      }
    }

    // Cache miss - fetch from API
    console.log(`[NBA Props ML] Cache MISS for player ${playerId} - fetching from API`);
    const gameLogs = await getPlayerGameLogs(playerId, season, 15);

    // Store in cache
    await getDb().collection('ml_cache').doc(cacheKey).set({
      playerId,
      season,
      gameLogs,
      timestamp: Date.now()
    });

    return gameLogs;

  } catch (error) {
    console.error(`[NBA Props ML] Cache error for player ${playerId}:`, error);
    // Fallback: try fetching from API directly
    return await getPlayerGameLogs(playerId, season, 15);
  }
}

/**
 * Calculate ML features and get prediction for a single player prop
 *
 * @param {Object} prop - Prop object from SGO API or props list
 * @param {string} homeTeam - Home team code
 * @param {string} awayTeam - Away team code
 * @param {string} gameDate - Game date (ISO string)
 * @param {boolean} includePrediction - Whether to call Vertex AI for prediction (default: true)
 * @returns {Promise<Object|null>} Prop with ML features and prediction, or null if error
 */
async function calculatePropFeatures(prop, homeTeam, awayTeam, gameDate, includePrediction = true) {
  try {
    // Initialize NBA helpers with API key (lazy initialization)
    const apiKey = getApiKey();
    if (apiKey) {
      initialize(apiKey);
    }

    const {
      playerId,
      playerName,
      team,
      statType,
      consensusLine,
      bestOver,
      bestUnder
    } = prop;

    // Validate required fields
    if (!playerId || !statType || consensusLine === undefined) {
      console.warn(`[NBA Props ML] Missing required prop fields for ${playerName}`);
      return null;
    }

    // Determine if player is on home team
    const isHome = team === homeTeam;

    // Get current season
    const currentSeason = getCurrentNBASeason();

    // Fetch player's game logs (cached)
    const gameLogs = await getCachedGameLogs(playerId, currentSeason);

    if (gameLogs.length === 0) {
      console.warn(`[NBA Props ML] No game logs found for ${playerName} (ID: ${playerId})`);
      return null;
    }

    // Calculate all 88 ML features
    const mlFeatures = calculateAllMLFeatures({
      gameLogs,
      propType: statType,
      homeTeam,
      awayTeam,
      isHome,
      gameDate,
      line: consensusLine,
      oddsOver: bestOver?.odds || -110,
      oddsUnder: bestUnder?.odds || -110,
      bookmaker: bestOver?.bookmaker || 'DraftKings'
    });

    // Build base result
    const result = {
      playerId,
      playerName,
      team,
      statType,
      line: consensusLine,
      bestOver,
      bestUnder,
      gamesUsed: gameLogs.length,
      mlFeatures: includePrediction ? undefined : mlFeatures // Only include raw features if not predicting
    };

    // Get ML prediction from Vertex AI
    if (includePrediction) {
      try {
        const prediction = await callVertexAI(mlFeatures);

        result.mlPrediction = {
          prediction: prediction.prediction, // "Over" or "Under"
          probabilityOver: prediction.probabilityOver,
          probabilityUnder: prediction.probabilityUnder,
          probabilityOverPercent: prediction.probabilityOverPercent,
          probabilityUnderPercent: prediction.probabilityUnderPercent,
          confidence: prediction.confidence,
          confidencePercent: prediction.confidencePercent,
          confidenceTier: prediction.confidenceTier,
          shouldBet: prediction.shouldBet,
          bettingValue: prediction.bettingValue
        };

        console.log(`[NBA Props ML] ✅ ${playerName} ${statType}: ${prediction.prediction} (${prediction.confidencePercent}% confidence)`);

      } catch (predictionError) {
        console.error(`[NBA Props ML] Prediction failed for ${playerName}:`, predictionError.message);
        result.mlPrediction = {
          error: 'Prediction unavailable',
          errorMessage: predictionError.message
        };
      }
    }

    return result;

  } catch (error) {
    console.error(`[NBA Props ML] Error processing prop for ${prop.playerName}:`, error);
    return null;
  }
}

/**
 * Main Cloud Function: Get NBA Props with ML Features
 * Entry point for client to fetch props with 88-feature data ready for ML predictions
 *
 * Request body:
 * {
 *   team1: "Los Angeles Lakers",
 *   team2: "Golden State Warriors",
 *   team1_code: "LAL",
 *   team2_code: "GSW",
 *   gameDate: "2026-02-05T02:00:00Z",
 *   props: [
 *     {
 *       playerId: 265,
 *       playerName: "LeBron James",
 *       team: "Los Angeles Lakers",
 *       statType: "points",
 *       consensusLine: 28.5,
 *       bestOver: { bookmaker: "DraftKings", odds: -110, line: 28.5 },
 *       bestUnder: { bookmaker: "FanDuel", odds: -110, line: 28.5 }
 *     },
 *     // ... more props
 *   ]
 * }
 *
 * Response:
 * {
 *   sport: "nba",
 *   teams: { home: "LAL", away: "GSW", logos: {...} },
 *   gameDate: "2026-02-05T02:00:00Z",
 *   propsWithFeatures: [
 *     {
 *       playerId: 265,
 *       playerName: "LeBron James",
 *       statType: "points",
 *       line: 28.5,
 *       mlFeatures: { ... 88 features ... },
 *       gamesUsed: 15
 *     },
 *     // ... more props
 *   ],
 *   timestamp: "2026-02-04T...",
 *   featuresCalculated: 15
 * }
 */
exports.getNBAPropsWithML = functions.https.onRequest(
  {
    timeoutSeconds: 120, // 2 minutes max (fetching game logs can be slow)
    memory: '512MiB'
  },
  async (req, res) => {
    // CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      console.log('🎯 NBA PROPS ML FUNCTION CALLED');

      const {
        team1,
        team2,
        team1_code,
        team2_code,
        gameDate,
        props
      } = req.body;

      // Validate required fields
      if (!team1 || !team2 || !props || !Array.isArray(props)) {
        return res.status(400).json({
          error: "Missing required fields: team1, team2, props (array)"
        });
      }

      console.log(`[NBA Props ML] Processing ${props.length} props for ${team1} vs ${team2}`);

      // Use team codes if provided, otherwise use team names
      const homeTeam = team1_code || team1;
      const awayTeam = team2_code || team2;

      // Use provided game date or default to today + 1 day
      const defaultGameDate = new Date();
      defaultGameDate.setDate(defaultGameDate.getDate() + 1);
      const gameDateStr = gameDate || defaultGameDate.toISOString();

      // Calculate ML features for each prop (parallel processing)
      const featurePromises = props.map(prop =>
        calculatePropFeatures(prop, homeTeam, awayTeam, gameDateStr)
      );

      const propsWithPredictions = (await Promise.all(featurePromises)).filter(p => p !== null);

      console.log(`[NBA Props ML] ✅ Processed ${propsWithPredictions.length}/${props.length} props with ML predictions`);

      // Filter to only HIGH confidence props (optional - can be done on client)
      const highConfidenceProps = propsWithPredictions.filter(p =>
        p.mlPrediction && p.mlPrediction.confidenceTier === 'high' && p.mlPrediction.shouldBet
      );

      console.log(`[NBA Props ML] 📊 High confidence props: ${highConfidenceProps.length}`);

      // Build response
      const response = {
        sport: 'nba',
        teams: {
          home: homeTeam,
          away: awayTeam,
          logos: {
            home: '', // TODO: Add team logos if needed
            away: ''
          }
        },
        gameDate: gameDateStr,
        props: propsWithPredictions, // All props with predictions
        highConfidenceProps: highConfidenceProps, // Filtered to high confidence only
        summary: {
          totalPropsRequested: props.length,
          propsProcessed: propsWithPredictions.length,
          highConfidenceCount: highConfidenceProps.length,
          mediumConfidenceCount: propsWithPredictions.filter(p =>
            p.mlPrediction && p.mlPrediction.confidenceTier === 'medium' && p.mlPrediction.shouldBet
          ).length,
          lowConfidenceCount: propsWithPredictions.filter(p =>
            p.mlPrediction && p.mlPrediction.confidenceTier === 'low'
          ).length,
          predictionErrors: propsWithPredictions.filter(p =>
            p.mlPrediction && p.mlPrediction.error
          ).length
        },
        timestamp: new Date().toISOString()
      };

      return res.status(200).json(response);

    } catch (error) {
      console.error('[NBA Props ML] Fatal error:', error);
      return res.status(500).json({
        error: 'Internal server error calculating ML features',
        message: error.message
      });
    }
  }
);

/**
 * Utility endpoint: Get player game logs directly
 * Useful for debugging and testing
 *
 * GET /getPlayerGameLogs?playerId=265&season=2024&limit=15
 */
exports.getPlayerGameLogs = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const { playerId, season, limit } = req.query;

    if (!playerId) {
      return res.status(400).json({ error: 'Missing playerId parameter' });
    }

    const gameLogs = await getPlayerGameLogs(
      parseInt(playerId),
      season ? parseInt(season) : null,
      limit ? parseInt(limit) : 15
    );

    return res.status(200).json({
      playerId: parseInt(playerId),
      season: season || getCurrentNBASeason(),
      gamesFound: gameLogs.length,
      gameLogs
    });

  } catch (error) {
    console.error('[Get Game Logs] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Test endpoint: Check Vertex AI connectivity
 * Useful for verifying service account authentication and endpoint accessibility
 *
 * GET /testVertexAI
 */
exports.testVertexAI = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const { testVertexAIConnection } = require('./helpers/vertexAI');

    console.log('[Test Vertex AI] Running connection test...');

    const result = await testVertexAIConnection();

    return res.status(result.status === 'success' ? 200 : 500).json(result);

  } catch (error) {
    console.error('[Test Vertex AI] Error:', error);
    return res.status(500).json({
      status: 'failed',
      error: error.message,
      message: 'Vertex AI test failed - check service account setup'
    });
  }
});
