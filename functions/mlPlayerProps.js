/**
 * ML Player Props Cloud Function
 * Fetches player props from SGO API and runs them through ML prediction pipeline
 * Returns top 3-5 high-confidence props for display on single prediction page
 *
 * Flow:
 * 1. Receive team1, team2, sport, gameDate
 * 2. Fetch all player props from SGO API
 * 3. For each prop, fetch player game logs from API-Sports
 * 4. Calculate 88 features for each prop
 * 5. Get ML predictions from Vertex AI
 * 6. Filter for high confidence only (betting_value = "high", confidence >15%)
 * 7. Sort by confidence and return top 3-5
 */

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const axios = require('axios');
const { initialize, getPlayerGameLogs, normalizePlayerName } = require('./helpers/nbaHelpers');
const { calculateAllMLFeatures } = require('./helpers/mlFeatureEngineering');
const { callVertexAI } = require('./helpers/vertexAI');
const starPlayersData = require('./data/nbaStarPlayers.json');

// Lazy initialization
let db;
const getDb = () => {
  if (!db) {
    db = admin.firestore();
  }
  return db;
};

const getApiKey = () => {
  try {
    return functions.config().apisports?.key || process.env.API_SPORTS_KEY;
  } catch (e) {
    return process.env.API_SPORTS_KEY;
  }
};

// SGO API Configuration
const SGO_API_KEY = '8e767501a24d345e14345882dd4e59f0';
const SGO_BASE_URL = 'https://api.sportsgameodds.com/v2';

/**
 * Get star players for a team with their API-Sports IDs
 * @param {string} teamName - Full team name (e.g., "Los Angeles Lakers")
 * @returns {Array} Array of star player objects with name and apiSportsId
 */
function getStarPlayersForTeam(teamName) {
  const teamData = starPlayersData.teams[teamName];
  if (!teamData) {
    console.log(`[Star Players] No data found for team: ${teamName}`);
    return [];
  }

  console.log(`[Star Players] Found ${teamData.players.length} star players for ${teamName}`);
  return teamData.players;
}

/**
 * Map team name to SGO team ID/code
 */
function mapTeamToSGOCode(teamName, sport) {
  const teamData = starPlayersData.teams[teamName];
  if (teamData) {
    return teamData.code;
  }

  // Fallback mapping
  const nbaTeamMap = {
    'los angeles lakers': 'LAL',
    'golden state warriors': 'GSW',
    'boston celtics': 'BOS',
    'miami heat': 'MIA',
    'chicago bulls': 'CHI',
    'brooklyn nets': 'BKN',
    'milwaukee bucks': 'MIL',
    'philadelphia 76ers': 'PHI',
    'phoenix suns': 'PHX',
    'dallas mavericks': 'DAL',
  };

  const normalized = teamName.toLowerCase().trim();
  return nbaTeamMap[normalized] || teamName;
}

/**
 * Fetch events from SGO API
 */
async function fetchSGOEvents(leagueID, teamName1, teamName2) {
  try {
    const url = `${SGO_BASE_URL}/events/?apiKey=${SGO_API_KEY}&leagueID=${leagueID}&oddsAvailable=true&limit=50`;

    console.log('[SGO] Fetching events for league:', leagueID);

    const response = await axios.get(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 15000
    });

    if (!response.data?.data) {
      console.log('[SGO] No events data returned');
      return null;
    }

    // Find event matching both teams
    const normalizeTeamName = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const team1Normalized = normalizeTeamName(teamName1);
    const team2Normalized = normalizeTeamName(teamName2);

    for (const event of response.data.data) {
      const homeNormalized = normalizeTeamName(event.teams.home.names.long);
      const awayNormalized = normalizeTeamName(event.teams.away.names.long);

      // Check if both teams match (in either order)
      const teamsMatch =
        (homeNormalized.includes(team1Normalized) || team1Normalized.includes(homeNormalized) ||
         homeNormalized.includes(team2Normalized) || team2Normalized.includes(homeNormalized)) &&
        (awayNormalized.includes(team1Normalized) || team1Normalized.includes(awayNormalized) ||
         awayNormalized.includes(team2Normalized) || team2Normalized.includes(awayNormalized));

      if (teamsMatch) {
        console.log('[SGO] Found matching event:', event.eventID);
        return event;
      }
    }

    console.log('[SGO] No matching event found for teams:', teamName1, teamName2);
    return null;
  } catch (error) {
    console.error('[SGO] Error fetching events:', error.message);
    throw error;
  }
}

/**
 * Extract and process player props from SGO event
 */
function extractPlayerPropsFromEvent(event) {
  const props = [];

  if (!event.odds || !event.players) {
    console.log('[SGO] No odds or players data in event');
    return props;
  }

  console.log(`[SGO] Processing ${Object.keys(event.odds).length} odds entries`);

  // Group odds by player and stat
  const playerOddsMap = {};

  for (const [, odd] of Object.entries(event.odds)) {
    // Only process player props (over/under bets with player IDs)
    if (!odd.playerID || odd.betTypeID !== 'ou') continue;

    const key = `${odd.playerID}-${odd.statID}`;

    if (!playerOddsMap[key]) {
      playerOddsMap[key] = {};
    }

    if (odd.sideID === 'over') {
      playerOddsMap[key].over = odd;
    } else if (odd.sideID === 'under') {
      playerOddsMap[key].under = odd;
    }
  }

  // Process each player/stat combination
  for (const [, odds] of Object.entries(playerOddsMap)) {
    const overOdd = odds.over;
    const underOdd = odds.under;

    if (!overOdd || !underOdd) continue;

    // Get player info
    const player = event.players?.[overOdd.playerID];
    if (!player) continue;

    // Extract player name
    let playerName = player.name || '';
    if (!playerName && player.firstName && player.lastName) {
      playerName = `${player.firstName} ${player.lastName}`.trim();
    }
    if (!playerName) continue;

    // Get consensus line and odds from bookmakers
    let consensusLine = 0;
    let bestOverOdds = -Infinity;
    let bestUnderOdds = -Infinity;
    let bestOverBookmaker = '';
    let bestUnderBookmaker = '';
    let lineCount = 0;

    if (overOdd.byBookmaker) {
      for (const [bookmakerKey, bookOdd] of Object.entries(overOdd.byBookmaker)) {
        if (!bookOdd.available || !bookOdd.overUnder) continue;

        const underBookOdd = underOdd.byBookmaker?.[bookmakerKey];
        if (!underBookOdd?.available) continue;

        const lineValue = parseFloat(bookOdd.overUnder);
        const overOddsValue = parseInt(bookOdd.odds, 10);
        const underOddsValue = parseInt(underBookOdd.odds, 10);

        if (!isNaN(lineValue)) {
          consensusLine += lineValue;
          lineCount++;
        }

        // Track best odds
        if (overOddsValue > bestOverOdds) {
          bestOverOdds = overOddsValue;
          bestOverBookmaker = bookmakerKey;
        }
        if (underOddsValue > bestUnderOdds) {
          bestUnderOdds = underOddsValue;
          bestUnderBookmaker = bookmakerKey;
        }
      }
    }

    if (lineCount === 0) continue;

    consensusLine = consensusLine / lineCount;

    // Determine which team the player is on
    const playerTeamId = player.teamID || '';
    const isHomeTeam = playerTeamId === event.teams.home.teamID;
    const teamName = isHomeTeam ? event.teams.home.names.long : event.teams.away.names.long;

    props.push({
      playerId: overOdd.playerID,
      playerName,
      team: teamName,
      isHome: isHomeTeam,
      statType: overOdd.statID,
      line: Math.round(consensusLine * 10) / 10,
      oddsOver: bestOverOdds,
      oddsUnder: bestUnderOdds,
      bookmakerOver: bestOverBookmaker,
      bookmakerUnder: bestUnderBookmaker
    });
  }

  console.log(`[SGO] Extracted ${props.length} player props`);
  return props;
}

/**
 * Process a single prop through ML pipeline
 * @param {Object} prop - Prop object with playerId, playerName, etc.
 * @param {number} apiSportsId - Known API-Sports player ID (from star players mapping)
 * @param {string} homeTeam - Home team code
 * @param {string} awayTeam - Away team code
 * @param {string} gameDate - Game date
 */
async function processPropThroughML(prop, apiSportsId, homeTeam, awayTeam, gameDate) {
  try {
    // Use the provided API-Sports ID directly
    const playerId = apiSportsId;

    console.log(`[ML] Processing ${prop.playerName} (ID: ${playerId}) - ${prop.statType}`);

    // Fetch player game logs
    const gameLogs = await getPlayerGameLogs(playerId, null, 15);

    if (!gameLogs || gameLogs.length === 0) {
      console.log(`[ML] No game logs for player ${prop.playerName} (ID: ${playerId})`);
      return null;
    }

    // Calculate ML features
    const mlFeatures = calculateAllMLFeatures({
      gameLogs,
      propType: prop.statType,
      homeTeam,
      awayTeam,
      isHome: prop.isHome,
      gameDate,
      line: prop.line,
      oddsOver: prop.oddsOver,
      oddsUnder: prop.oddsUnder,
      bookmaker: prop.bookmakerOver || 'DraftKings'
    });

    // Get ML prediction
    const prediction = await callVertexAI(mlFeatures);

    return {
      ...prop,
      gamesUsed: gameLogs.length,
      prediction: prediction.prediction,
      probabilityOver: prediction.probabilityOver,
      probabilityUnder: prediction.probabilityUnder,
      confidence: prediction.confidence,
      confidencePercent: prediction.confidencePercent,
      shouldBet: prediction.shouldBet,
      bettingValue: prediction.bettingValue
    };
  } catch (error) {
    console.error(`[ML] Error processing prop for ${prop.playerName}:`, error.message);
    return null;
  }
}

/**
 * Main Cloud Function
 */
exports.getMLPlayerPropsForGame = functions.https.onRequest(
  {
    timeoutSeconds: 300, // 5 minutes for processing multiple props
    memory: '1GiB',
    cors: true,
    secrets: ['API_SPORTS_KEY']
  },
  async (req, res) => {
    try {
      // Initialize helpers
      const apiKey = getApiKey();
      if (apiKey) {
        initialize(apiKey);
      }

      // Parse request
      const { team1, team2, sport, gameDate } = req.body;

      if (!team1 || !team2 || !sport) {
        return res.status(400).json({
          error: 'Missing required fields: team1, team2, sport'
        });
      }

      if (sport.toLowerCase() !== 'nba') {
        return res.status(400).json({
          error: 'Only NBA is supported currently'
        });
      }

      console.log('[ML Props] Processing request:', { team1, team2, sport, gameDate });

      // Step 1: Fetch event from SGO
      const event = await fetchSGOEvents('NBA', team1, team2);

      if (!event) {
        return res.status(404).json({
          error: 'No matching game found',
          message: 'Could not find an upcoming game between these teams with available odds'
        });
      }

      // Step 2: Extract player props
      const allProps = extractPlayerPropsFromEvent(event);

      if (allProps.length === 0) {
        return res.status(404).json({
          error: 'No player props available',
          message: 'No player props found for this game'
        });
      }

      console.log(`[ML Props] Found ${allProps.length} total props from SGO`);

      // Step 3: Get star players for both teams
      const homeStarPlayers = getStarPlayersForTeam(event.teams.home.names.long);
      const awayStarPlayers = getStarPlayersForTeam(event.teams.away.names.long);
      const allStarPlayers = [...homeStarPlayers, ...awayStarPlayers];

      console.log(`[ML Props] Filtering to ${allStarPlayers.length} star players`);

      // Step 4: Match props with star players
      const starPlayerProps = [];
      for (const prop of allProps) {
        // Normalize prop player name for matching
        const normalizedPropName = normalizePlayerName(prop.playerName);

        // Find matching star player
        const starPlayer = allStarPlayers.find(sp =>
          normalizePlayerName(sp.name) === normalizedPropName
        );

        if (starPlayer) {
          starPlayerProps.push({
            ...prop,
            apiSportsId: starPlayer.apiSportsId
          });
        }
      }

      console.log(`[ML Props] Matched ${starPlayerProps.length} props with star players`);

      if (starPlayerProps.length === 0) {
        return res.status(404).json({
          error: 'No star player props available',
          message: 'No props found for tracked star players in this game'
        });
      }

      // Step 5: Process star player props through ML
      const homeTeamCode = mapTeamToSGOCode(team1, sport);
      const awayTeamCode = mapTeamToSGOCode(team2, sport);
      const processedProps = [];

      // Process in batches of 4 to avoid overwhelming the system
      const batchSize = 4;
      for (let i = 0; i < starPlayerProps.length; i += batchSize) {
        const batch = starPlayerProps.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(prop => processPropThroughML(
            prop,
            prop.apiSportsId,
            homeTeamCode,
            awayTeamCode,
            gameDate || event.status.startsAt
          ))
        );
        processedProps.push(...batchResults.filter(p => p !== null));
      }

      console.log(`[ML Props] Successfully processed ${processedProps.length} props`);

      // Debug: Log all processed props with their confidence
      if (processedProps.length > 0) {
        console.log('[ML Props] Sample processed props:', JSON.stringify(processedProps.slice(0, 2).map(p => ({
          player: p.playerName,
          stat: p.statType,
          prediction: p.prediction,
          confidence: p.confidence,
          shouldBet: p.shouldBet,
          bettingValue: p.bettingValue
        }))));
      }

      // Step 6: Filter for high confidence only
      // Confidence = abs(probability - 0.5), so:
      // - confidence >= 0.05 means probability is >= 55% OR <= 45% (at least 5% edge)
      // - confidence >= 0.10 means probability is >= 60% OR <= 40% (at least 10% edge)
      // - confidence >= 0.15 means probability is >= 65% OR <= 35% (at least 15% edge)
      // Per API_DOCUMENTATION.md: Include both HIGH and MEDIUM confidence props
      const recommendedProps = processedProps.filter(prop => {
        // Get the actual confidence value (0-1 scale)
        const confidenceValue = typeof prop.confidence === 'number'
          ? prop.confidence
          : parseFloat(prop.confidencePercent?.replace('%', '') || '0') / 100;

        // Include both high and medium (shouldBet = true means confidence > 0.10)
        return prop.shouldBet &&
               (prop.bettingValue === 'high' || prop.bettingValue === 'medium') &&
               confidenceValue >= 0.10; // At least 10% edge (60%+ or 40%- probability)
      });

      // Count by tier for logging
      const highCount = recommendedProps.filter(p => p.bettingValue === 'high').length;
      const mediumCount = recommendedProps.filter(p => p.bettingValue === 'medium').length;
      console.log(`[ML Props] ${recommendedProps.length} recommended props found: ${highCount} high, ${mediumCount} medium`);

      // Step 7: Sort by confidence and take top 10 (increased from 5 to show more props)
      const topProps = recommendedProps
        .sort((a, b) => {
          const aConf = parseFloat(a.confidencePercent?.replace('%', '') || a.confidence || '0');
          const bConf = parseFloat(b.confidencePercent?.replace('%', '') || b.confidence || '0');
          return bConf - aConf;
        })
        .slice(0, 10); // Increased from 5 to 10

      // Step 8: Return results
      return res.status(200).json({
        success: true,
        sport: 'NBA',
        eventId: event.eventID,
        teams: {
          home: event.teams.home.names.long,
          away: event.teams.away.names.long
        },
        gameTime: event.status.startsAt,
        totalPropsAvailable: allProps.length,
        starPlayerPropsAnalyzed: starPlayerProps.length,
        highConfidenceCount: highCount, // Number of high confidence props
        mediumConfidenceCount: mediumCount, // Number of medium confidence props
        topProps: topProps.map(prop => ({
          playerName: prop.playerName,
          team: prop.team,
          statType: prop.statType,
          line: prop.line,
          prediction: prop.prediction,
          probabilityOver: prop.probabilityOver,
          probabilityUnder: prop.probabilityUnder,
          confidence: prop.confidence,
          confidencePercent: prop.confidencePercent,
          confidenceTier: prop.bettingValue, // 'high' or 'medium'
          oddsOver: prop.oddsOver,
          oddsUnder: prop.oddsUnder,
          gamesUsed: prop.gamesUsed
        })),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[ML Props] Error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);
