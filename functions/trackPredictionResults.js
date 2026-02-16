/**
 * Track Prediction Results
 * Scheduled Cloud Function that checks finished NBA games
 * and records actual player stats to compare with ML predictions.
 *
 * Runs daily at 10:00 AM EST (after all NBA games are final).
 * Updates ml_predictions collection with actual results.
 */

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const axios = require('axios');

const getApiKey = () => {
  try {
    return functions.config().apisports?.key || process.env.API_SPORTS_KEY;
  } catch (e) {
    return process.env.API_SPORTS_KEY;
  }
};

/**
 * Map prop type to the correct stat field from API-Sports
 */
function extractStat(playerStats, propType) {
  if (!playerStats) return null;

  const type = propType.toLowerCase();

  // API-Sports player statistics structure
  if (type === 'points' || type === 'pts') {
    return playerStats.points?.total ?? null;
  }
  if (type === 'rebounds' || type === 'reb' || type === 'totReb') {
    return playerStats.rebounds?.total ?? null;
  }
  if (type === 'assists' || type === 'ast') {
    return playerStats.assists?.total ?? null;
  }
  if (type === 'steals' || type === 'stl') {
    return playerStats.steals?.total ?? null;
  }
  if (type === 'blocks' || type === 'blk') {
    return playerStats.blocks?.total ?? null;
  }
  if (type === 'turnovers' || type === 'tov') {
    return playerStats.turnovers?.total ?? null;
  }
  if (type === 'threes' || type === '3pm' || type === 'tpm') {
    return playerStats.fieldGoals?.threePointers?.made ?? null;
  }

  return null;
}

/**
 * Find player stats in a game by matching player name
 */
function findPlayerInGameStats(allPlayerStats, playerName) {
  if (!allPlayerStats || !playerName) return null;

  const normalizedTarget = playerName.toLowerCase().trim();
  const lastName = normalizedTarget.split(' ').pop();

  for (const entry of allPlayerStats) {
    const name = (entry.player?.name || entry.player?.firstname + ' ' + entry.player?.lastname || '').toLowerCase().trim();

    // Exact match or last name match
    if (name === normalizedTarget || name.includes(lastName)) {
      return entry;
    }
  }

  return null;
}

/**
 * Scheduled function: track prediction results daily
 */
exports.trackPredictionResults = functions.scheduler.onSchedule(
  {
    schedule: 'every day 10:00',
    timeZone: 'America/New_York',
    timeoutSeconds: 300,
    memory: '512MiB'
  },
  async (event) => {
    console.log('=== TRACKING PREDICTION RESULTS ===');

    const db = admin.firestore();
    const apiKey = getApiKey();

    if (!apiKey) {
      console.error('API_SPORTS_KEY not configured');
      return;
    }

    // Get predictions from the last 7 days that haven't been resolved
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const snapshot = await db.collection('ml_predictions')
      .where('resultRecorded', '==', false)
      .where('createdAt', '>=', sevenDaysAgo)
      .get();

    if (snapshot.empty) {
      console.log('No pending predictions to resolve.');
      return;
    }

    console.log(`${snapshot.size} predictions to resolve.`);

    // Group predictions by gameDate to minimize API calls
    const byDate = {};
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const date = data.gameDate?.split('T')[0] || data.gameDate;
      if (!date) continue;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({ doc, data });
    }

    let resolved = 0;
    let correct = 0;
    let errors = 0;

    for (const [gameDate, predictions] of Object.entries(byDate)) {
      try {
        // Fetch all games for this date
        const gamesResponse = await axios.get(
          'https://v1.basketball.api-sports.io/games',
          {
            headers: { 'x-apisports-key': apiKey },
            params: { date: gameDate, league: 12, season: '2025-2026' },
            timeout: 15000
          }
        );

        const games = gamesResponse.data?.response || [];
        const finishedGames = games.filter(g =>
          g.status?.short === 'FT' || g.status?.long === 'Game Finished'
        );

        if (finishedGames.length === 0) {
          console.log(`No finished games for ${gameDate}, skipping.`);
          continue;
        }

        // For each finished game, get player stats
        for (const game of finishedGames) {
          // Find predictions for this game
          const gamePredictions = predictions.filter(p => {
            const homeMatch = game.teams?.home?.name?.toLowerCase().includes(
              (p.data.homeTeam || '').toLowerCase().substring(0, 5)
            );
            const awayMatch = game.teams?.away?.name?.toLowerCase().includes(
              (p.data.awayTeam || '').toLowerCase().substring(0, 5)
            );
            return homeMatch || awayMatch;
          });

          if (gamePredictions.length === 0) continue;

          // Fetch player statistics for this game
          let allPlayerStats = [];
          try {
            const statsResponse = await axios.get(
              'https://v1.basketball.api-sports.io/players/statistics',
              {
                headers: { 'x-apisports-key': apiKey },
                params: { game: game.id },
                timeout: 15000
              }
            );
            allPlayerStats = statsResponse.data?.response || [];
          } catch (statsErr) {
            console.error(`Error fetching stats for game ${game.id}:`, statsErr.message);
            continue;
          }

          // Match each prediction with player stats
          for (const { doc, data } of gamePredictions) {
            try {
              const playerStats = findPlayerInGameStats(allPlayerStats, data.playerName);

              if (!playerStats) {
                // Player did not play (DNP)
                await doc.ref.update({
                  resultRecorded: true,
                  actualStat: 0,
                  actualResult: 'dnp',
                  wasCorrect: null,
                  resultRecordedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                resolved++;
                continue;
              }

              const actualStat = extractStat(playerStats, data.propType);

              if (actualStat === null) {
                continue; // Can't determine stat
              }

              const actualResult = actualStat > data.line ? 'over'
                : actualStat < data.line ? 'under'
                : 'push';

              const predictedSide = (data.prediction?.prediction || '').toLowerCase();
              const wasCorrect = actualResult === 'push'
                ? null
                : (actualResult === predictedSide);

              await doc.ref.update({
                resultRecorded: true,
                actualStat,
                actualResult,
                wasCorrect,
                resultRecordedAt: admin.firestore.FieldValue.serverTimestamp()
              });

              resolved++;
              if (wasCorrect) correct++;

            } catch (predErr) {
              console.error(`Error resolving prediction for ${data.playerName}:`, predErr.message);
              errors++;
            }
          }

          // Rate limiting between game stat fetches
          await new Promise(r => setTimeout(r, 500));
        }

      } catch (dateErr) {
        console.error(`Error processing date ${gameDate}:`, dateErr.message);
        errors++;
      }
    }

    const winRate = resolved > 0 ? ((correct / resolved) * 100).toFixed(1) : 'N/A';
    console.log('=== RESULTS ===');
    console.log(`  Resolved: ${resolved}/${snapshot.size}`);
    console.log(`  Correct: ${correct} (${winRate}%)`);
    console.log(`  Errors: ${errors}`);
  }
);
