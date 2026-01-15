const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const stringSimilarity = require("string-similarity");
const { parse } = require("path");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

// Re-export preCacheTopGames functions from separate file
const { preCacheTopGames, preCacheTopGamesScheduled } = require('./preCacheTopGames');
exports.preCacheTopGames = preCacheTopGames;
exports.preCacheTopGamesScheduled = preCacheTopGamesScheduled;


const ODDS_API_KEY = process.env.ODDS_API_KEY;
const API_SPORTS_KEY = process.env.API_SPORTS_KEY;
const STATPAL_API_KEY = process.env.STATPAL_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const TENNIS_API_KEY = process.env.TENNIS_API_KEY || '2cf2f7d9e8e9d7ea2ab285677a6a0e7f45d05b4275bbd0b741343a9277586e26';



admin.initializeApp();
const db = admin.firestore();
const CACHE_EXPIRY_TIME = 0; // DISABLED TEMPORARILY - fixing broken data issue

// ====================================================================
// TRANSLATION MAP FOR MARKET INTELLIGENCE OUTPUT
// ====================================================================
const phrases = {
  en: {
    marketEfficient: "Market efficiently priced",
    noProfitable: "No profitable opportunities found",
    lowestVigHomeWin: "Lowest Vig Home Win at",
    lowestVigDraw: "Lowest Vig Draw at",
    lowestVigAwayWin: "Lowest Vig Away Win at",
    bestHomeWin: "Best Home to Win",
    bestDraw: "Best Draw",
    bestAwayWin: "Best Away to Win",
    sharpsFade: "Sharps fade",
    sharpsFavor: "Sharps favor",
    noClearLean: "No clear sharp lean",
    impliedEdge: "implied probability edge",
    tightMarket: "Tight market",
    marketUncertainty: "Market uncertainty",
    sharpConfidence: "Sharp confidence",
    pointEdge: "point edge",
    sharp: "Sharp",
    vsPublic: "vs public",
    soccerMarketAnalysis: "Soccer market analysis",
    soccerMarket3Way: "Soccer market • 3-way betting",
    normal: "Normal"
  },
  fr: {
    marketEfficient: "Marché efficacement évalué",
    noProfitable: "Aucune opportunité rentable trouvée",
    lowestVigHomeWin: "Vig le plus bas Domicile à",
    lowestVigDraw: "Vig le plus bas Match Nul à",
    lowestVigAwayWin: "Vig le plus bas Extérieur à",
    bestHomeWin: "Meilleure Cote Domicile",
    bestDraw: "Meilleur Match Nul",
    bestAwayWin: "Meilleure Cote Extérieur",
    sharpsFade: "Les pros évitent",
    sharpsFavor: "Les pros favorisent",
    noClearLean: "Pas de tendance claire",
    impliedEdge: "avantage de probabilité implicite",
    tightMarket: "Marché serré",
    marketUncertainty: "Incertitude du marché",
    sharpConfidence: "Confiance des pros",
    pointEdge: "avantage de point",
    sharp: "Pro",
    vsPublic: "vs public",
    soccerMarketAnalysis: "Analyse marché football",
    soccerMarket3Way: "Marché football • 3 issues",
    normal: "Normal"
  },
  es: {
    marketEfficient: "Mercado eficientemente valorado",
    noProfitable: "No se encontraron oportunidades rentables",
    lowestVigHomeWin: "Vig más bajo Local en",
    lowestVigDraw: "Vig más bajo Empate en",
    lowestVigAwayWin: "Vig más bajo Visitante en",
    bestHomeWin: "Mejor Cuota Local",
    bestDraw: "Mejor Empate",
    bestAwayWin: "Mejor Cuota Visitante",
    sharpsFade: "Los expertos evitan",
    sharpsFavor: "Los expertos favorecen",
    noClearLean: "Sin tendencia clara",
    impliedEdge: "ventaja de probabilidad implícita",
    tightMarket: "Mercado ajustado",
    marketUncertainty: "Incertidumbre del mercado",
    sharpConfidence: "Confianza de expertos",
    pointEdge: "ventaja de punto",
    sharp: "Experto",
    vsPublic: "vs público",
    soccerMarketAnalysis: "Análisis mercado fútbol",
    soccerMarket3Way: "Mercado fútbol • 3 resultados",
    normal: "Normal"
  }
};

// Simple translation helper
const translate = (key, locale = 'en') => phrases[locale]?.[key] || phrases.en[key];

/**
 * Converts JSON data to a more token-efficient markdown format
 * @param {Object} json - The JSON object to convert
 * @param {number} maxDepth - Maximum nesting depth (default: 3)
 * @param {number} currentDepth - Current depth (used internally)
 * @param {boolean} isArrayItem - Whether the current item is part of an array (used internally)
 * @returns {string} Markdown formatted string
 */


exports.analyzeImage = functions.https.onRequest(async (req, res) => {
  console.log("🔥 ANALYZE IMAGE v2.0 - NO CACHE VERIFICATION");
  try {
      // Extract locale from both request body and query params for redundancy
      let { imageUrl, locale } = req.body;

      // If locale is not in body, try query params, then default to 'en'
      if (!locale && req.query && req.query.locale) {
        locale = req.query.locale;
      }

      // Default to 'en' if still not found
      locale = locale || 'en';

      if (!imageUrl) {
          return res.status(400).json({ error: "Image URL is required" });
      }

      // const apiKey =  functions.config().openai.apikey;
      const apiKey = OPENAI_API_KEY;

      const visionprompt = "You are an expert in analyzing sports visuals—analyze the image to detect two team names or fighter names or tennis player names (from logos, text, jerseys, banners, scoreboards, etc.); if found, return exact JSON format: {\"sport\":\"sport_name_from_list\",\"team1\":\"team1_full_name\",\"team2\":\"team2_full_name\",\"team1_code\":\"3_letter_code1\",\"team2_code\":\"3_letter_code2\"} using english names for team names and fighter names and tennis player names, using the closest matching sport from this list (nba, mlb, nfl, ncaaf, soccer, mma, tennis); if mma and tennis then always return first name + last name of fighter/player. If fewer than two valid teams or more than 2 teams are found or unclear, return only this exact text in plain text: error_no_team. Normalize any detected team or fighter names to their most commonly known English versions. For example, convert local or native-language club names into their widely recognized English equivalents (e.g., \"Internazionale Milano\" → \"Inter Milan\"). Avoid local spellings or native-language variants. If the sport is soccer, also include one additional key in the JSON output: \"soccer_odds_type\": a value selected from the list below that best matches the teams detected or the competition likely represented in the image. Valid values for \"soccer_odds_type\" are: soccer_argentina_primera_division, soccer_australia_aleague, soccer_austria_bundesliga, soccer_belgium_first_div, soccer_brazil_campeonato, soccer_brazil_serie_b, soccer_china_superleague, soccer_conmebol_copa_libertadores, soccer_conmebol_copa_sudamericana, soccer_denmark_superliga, soccer_efl_champ, soccer_england_league1, soccer_england_league2, soccer_epl, soccer_fa_cup, soccer_fifa_world_cup_winner, soccer_finland_veikkausliiga, soccer_france_ligue_one, soccer_france_ligue_two, soccer_germany_bundesliga, soccer_germany_bundesliga2, soccer_germany_liga3, soccer_greece_super_league, soccer_italy_serie_a, soccer_italy_serie_b, soccer_japan_j_league, soccer_korea_kleague1, soccer_league_of_ireland, soccer_mexico_ligamx, soccer_netherlands_eredivisie, soccer_norway_eliteserien, soccer_poland_ekstraklasa, soccer_portugal_primeira_liga, soccer_spain_la_liga, soccer_spain_segunda_division, soccer_spl, soccer_sweden_allsvenskan, soccer_sweden_superettan, soccer_switzerland_superleague, soccer_turkey_super_league, soccer_uefa_champs_league, soccer_uefa_champs_league_women, soccer_uefa_europa_conference_league, soccer_uefa_europa_league, soccer_uefa_nations_league, soccer_usa_mls. Only include \"soccer_odds_type\" if the sport is soccer. For all other sports, do not include this field.";

      const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: visionprompt },
                    { type: "image_url", image_url: { url: imageUrl } }
                ]
            }
        ],
        max_tokens: 120,
        response_format: { type: "json_object" }
    }, {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        }
    });



      // Extracting the response message correctly
      const aiResponse = response.data.choices[0]?.message?.content;
      console.log("aiResponse", aiResponse);

      // res.status(200).json({ status: "true", aiResponse: aiResponse });
      // return;

      try {
          // If the response is exactly "error_no_team", handle it directly
          if (aiResponse === "error_no_team") {
              return res.status(200).json({
                  status: "false",
                  message: "We couldn't find 2 teams in the image. Try uploading image of an upcoming game between two teams"
              });
          }

          // Check if aiResponse is null or undefined
          if (!aiResponse) {
              return res.status(200).json({
                  status: "false",
                  message: "We couldn't find any teams in the image. Try uploading image of an upcoming game between two teams"
              });
          }

          // Try to parse the JSON response
          const jsonResponse = JSON.parse(aiResponse);



          // Start: Add logic to find team IDs
          const { sport, team1, team2, team1_code, team2_code, soccer_odds_type } = jsonResponse;


          // Call the helper function to get team IDs
          const { team1Id, team2Id, team1StatpalCode, team2StatpalCode, sport_type_odds } = await findTeamIds(sport, team1, team1_code, team2, team2_code, soccer_odds_type);




          if (team1Id === null || team2Id === null) {
              return res.status(200).json({
                  status: "false",
                  message: "We couldn't find 2 teams in our records."
              });
          }

          // Add the found IDs (or null if not found) to the result object
          jsonResponse.as_team1_id = team1Id;
          jsonResponse.as_team2_id = team2Id;
          jsonResponse.sport_type_odds = sport_type_odds;
          // End: Add logic to find team IDs

          console.log("Vision API Response with IDs:", jsonResponse);
          console.log(`Starting cache check for ${sport} match between team ${team1Id} and team ${team2Id}`);


      //      res.status(200).json({ status: "true", matchData: jsonResponse });
      // return;


          // Check if we have cached data for this match
          const cachedAnalysis = await checkCacheForMatch(sport, team1Id, team2Id, locale);

          if (cachedAnalysis) {
            // Check if the cached analysis language matches the requested locale
            if (!cachedAnalysis.language || cachedAnalysis.language === locale) {
              console.log("Returning cached analysis data");
              return res.status(200).json(cachedAnalysis);
            } else {
              console.log(`Cache language (${cachedAnalysis.language}) doesn't match requested (${locale}). Generating new analysis.`);
            }
          }

          // console.log("No cache hit found, proceeding with API calls and analysis");

          // If no cache hit, proceed with API calls and analysis
          const [oddsData, gameData, marketIntelligence, teamStats, playerStats] = await Promise.all([
            sport === 'tennis' ?
              getTennisOddsData(team1Id, team2Id, team1, team2) :
              getOddsData(sport_type_odds, team1, team2, team1_code, team2_code, locale),
            getGameData(sport, team1Id, team2Id, team1_code, team2_code, team1StatpalCode, team2StatpalCode),
            // NEW: Add Market Intelligence data
            sport === 'tennis' ?
              null :
              getMarketIntelligenceDataTest(sport_type_odds, team1, team2),
            // NEW: Add Team Statistics data
            getTeamStatsDataTest(sport, team1Id, team2Id),
            // NEW: Add Player Statistics data
            getPlayerStatsForSport(sport, team1Id, team2Id)
          ]);

          let weatherData = null;
          if (gameData.upcomingGame !== null) {
              if (sport === 'tennis') {
                  // Hard-code Paris, France for tennis matches at Roland Garros
                  const upcomingDate = gameData.upcomingGame.event_date || new Date().toISOString().split('T')[0];
                  weatherData = await getWeatherForecast('Paris, France', upcomingDate);
              } else if (sport === 'soccer' && gameData.upcomingGame.fixture && gameData.upcomingGame.fixture.venue && gameData.upcomingGame.fixture.venue.city) {
                  weatherData = await getWeatherForecast(gameData.upcomingGame.fixture.venue.city, gameData.upcomingGame.fixture.date);
              } else if (gameData.upcomingGame.arena && gameData.upcomingGame.arena.city) {
                  weatherData = await getWeatherForecast(gameData.upcomingGame.arena.city, gameData.upcomingGame.date.start);
              }
            }

          // res.status(200).json({ status: "true", weatherData: weatherData, matchData: jsonResponse, oddsData: oddsData, last10games: gameData.team1_last10games, last10games2: gameData.team2_last10games, h2h_games: gameData.h2h_games, team1_injuries: gameData.team1_injuries, team2_injuries: gameData.team2_injuries, upcomingGame: gameData.upcomingGame });
          // return;

          console.log("INJURY DEBUG - Team1:", JSON.stringify(gameData.team1_injuries, null, 2));
          console.log("INJURY DEBUG - Team2:", JSON.stringify(gameData.team2_injuries, null, 2));

          console.log("WEATHER DEBUG:", JSON.stringify(weatherData, null, 2));
          console.log("UPCOMING GAME DEBUG:", JSON.stringify(gameData.upcomingGame, null, 2));
          console.log("MARKET INTELLIGENCE DEBUG:", JSON.stringify(marketIntelligence, null, 2));
          console.log("TEAM STATS DEBUG:", JSON.stringify(teamStats, null, 2));
          console.log("PLAYER STATS DEBUG:", JSON.stringify(playerStats, null, 2));

          console.log("=== AI PROMPT DATA BEING SENT ===");
          console.log("Key Insights:", JSON.stringify(oddsData.keyInsights || {}, null, 2));
          console.log("Match Data:", JSON.stringify(jsonResponse, null, 2));
          console.log("Team1 Last10:", JSON.stringify(gameData.team1_last10games, null, 2));
          console.log("Team2 Last10:", JSON.stringify(gameData.team2_last10games, null, 2));
          console.log("H2H Record:", JSON.stringify(gameData.h2h_games.h2hRecord, null, 2));
          console.log("Team1 Injuries FINAL:", JSON.stringify(gameData.team1_injuries, null, 2));
          console.log("Team2 Injuries FINAL:", JSON.stringify(gameData.team2_injuries, null, 2));
          console.log("Upcoming Game FINAL:", JSON.stringify(gameData.upcomingGame, null, 2));
          console.log("Weather FINAL:", JSON.stringify(weatherData, null, 2));
          console.log("Market Intelligence FINAL:", JSON.stringify(marketIntelligence, null, 2));
          console.log("Team Stats FINAL:", JSON.stringify(teamStats, null, 2));
          console.log("Player Stats FINAL:", JSON.stringify(playerStats, null, 2));
          console.log("=== END AI PROMPT DATA ===");

          const prompt = `
          Task Overview:
          You are an expert sports betting analyst.
          Your job is to generate a final AI Betting Insight for a specific sports event, using structured data collected from multiple sources.
          Like market intelligence (best lines, EV opportunities, sharp vs public money), team statistics (PPG, shooting %, rebounds), player statistics (top 10 players with all key metrics), odds data, key insights, match data, last 10 matches, h2h games, injuries, upcoming game, weather forecast. Use ALL available data to provide the most comprehensive analysis.

          Your tone should be sharp, real, and degen — like a bettor who's been in the trenches. Avoid corporate or generic phrasing. Speak like someone explaining edge to a fellow bettor over Discord or in a sharp betting groupchat. Inject urgency when there's mispricing, and confidence when everything lines up. If the public is lost, say it. If the sharps are sniping, flag it. If it's a trap, expose it.

          IMPORTANT: Please provide your entire analysis in ${locale} language. Maintain the exact JSON structure, but translate all text content.
          LANGUAGE INSTRUCTION: YOU MUST RESPOND IN ${locale.toUpperCase()} LANGUAGE ONLY. This is critical.

          ### Input Data:
          You'll be provided with structured information from the app, including:


          ## Key Insights
          ${JSON.stringify(oddsData.keyInsights || {})}

          ## Match Data
          ${JSON.stringify(jsonResponse)}

          ## Team1 win loss record
          ${JSON.stringify(gameData.team1_last10games)}

          ## Team2 win loss record
          ${JSON.stringify(gameData.team2_last10games)}

          ## H2h Record
          ${JSON.stringify(gameData.h2h_games.h2hRecord)}

          ## Team1 Injuries
          ${JSON.stringify(gameData.team1_injuries)}

          ## Team2 Injuries
          ${JSON.stringify(gameData.team2_injuries)}

          ## Upcoming Game
          ${JSON.stringify(gameData.upcomingGame)}

          ## Weather Forecast
          ${JSON.stringify(weatherData)}

          ## Market Intelligence
          ${JSON.stringify(marketIntelligence)}

          ## Team Statistics
          ${JSON.stringify(teamStats)}

          ## Player Statistics
          ${JSON.stringify({
            team1: {
              teamId: playerStats?.team1?.teamId,
              topPlayers: playerStats?.team1?.topPlayers
            },
            team2: {
              teamId: playerStats?.team2?.teamId,
              topPlayers: playerStats?.team2?.topPlayers
            }
          })}
          ###

          Rules:
          You must return:
          1. A **Confidence Score** — simple label: Low, Medium, or High
          2. A **Betting Signal** — label from the defined categories below
          3. A **3-part expert-style breakdown**, written in a natural, human tone, as if a sharp bettor was explaining their read on the event.

          ### 1. Key Insights
          - Public vs. Sharp betting % (e.g., 78% Public, 22% Sharps)
          - Market Activity (e.g., Heavy, Moderate, Quiet)
          - Line Shift (e.g., Opened -1.5, now -3)

          ### 2. Match Snapshot based on
          - Show win loss record (W-L-W-L-W-W)
          - Head-to-head record (eg 3-1)
          - Momentum indicator (home and away)

          ### 3. X-Factors - be specific but keep each under 15 words:
          - Health & Availability: If injuries exist, name 1-2 key players affected, otherwise "No major injuries"
          - Location & Weather: Only mention weather if it impacts gameplay (wind 15+ mph, rain, extreme temps) and mention actual temp/wind/precipitation affecting play
          - Officiating & Rules: Referee name and tendencies if notable, otherwise "Standard officiating expected"
          - Travel & Fatigue: Distance, time zones, rest days between games, otherwise "Normal rest"

          IMPORTANT: For each X-Factor, you MUST include a 'type' field with these exact values:
          - type: 1 for Health & Availability
          - type: 2 for Location & Weather
          - type: 3 for Officiating & Rules
          - type: 4 for Travel & Fatigue

          This type field is required for proper icon display regardless of language.

          ### Confidence Score
          Choose from:
          - 3.5 Low
          - 5.8 Medium
          - 8.7 High
          (*Assess based on how clean or conflicted the data is. If everything aligns: High. If market is chaotic or data conflicts: Low.*)

          ${locale === 'fr' ? `
          IMPORTANT TERMINOLOGY TRANSLATIONS FOR FRENCH LOCALE:
          When responding in French, translate the following key terms:
          - Low -> Faible
          - Medium -> Moyen
          - High -> Élevé
          - Public -> Public
          - Sharps -> Pros
          - Heavy -> Élevée
          - Moderate -> Modérée
          - Quiet -> Calme
          - Value Bet -> Pari Valeur
          - Public Trap -> Piège du Public
          - Sharp Trap -> Piège des Pros
          - Conflicted -> Conflictuel

          ` : locale === 'es' ? `
          IMPORTANT TERMINOLOGY TRANSLATIONS FOR SPANISH LOCALE:
          When responding in Spanish, translate the following key terms:
          - Low -> Bajo
          - Medium -> Medio
          - High -> Alto
          - Public -> Público
          - Sharps -> Expertos
          - Heavy -> Elevada
          - Moderate -> Moderada
          - Quiet -> Tranquila
          - Value Bet -> Apuesta de Valor
          - Public Trap -> Trampa del Público
          - Sharp Trap -> Trampa de Expertos
          - Conflicted -> Contradictorio
          ` : ''}

          ### Betting Signal
          Choose one from:
          - Value Bet (Sharps align with game data)
          - Public Trap (Heavy public money against key trends)
          - Sharp Trap (Sharps early, then market shifts weirdly)
          - Conflicted (Data is mixed, no clear direction)

         ### Expert Breakdown Format:
You must return the "breakdown" in **exactly 3 paragraphs**, separated by single line breaks (\\n), each ~60-80 words.
Each paragraph must follow this structure:

Paragraph 1: Market Read vs. Reality
Explain what the betting market is doing — sharp/public split, line movement, implied traps. If the public is blindly hammering a side and the line is frozen, call that out.

Paragraph 2: On-Court Context
Break down the matchup clearly. Who's hot, who's fake hot. Mention injuries, form, fatigue, and head-to-head honestly. Don't play it safe — expose weaknesses and hype killers.

Paragraph 3: Betting Interpretation
Give a real read. Not "monitor," not "maybe." Say what sharp bettors might do. Pre-game lean, live angle, trap warning, prop setup — whatever applies. Be direct and tactical, like someone trying to make a bet with edge.

          if not data is compilable, for a field use your best judgement to return the best answer in short
          **Return JSON in this structure:**
          {
            sport: '${sport}',
            teams: {
              home: event.home_team,
              away: event.away_team,
            },
            keyInsights: {
              confidence: 'Low' | 'Medium' | 'High',
              marketActivity: 'Low' | 'Moderate' | 'High',
              lineShift: 'Low' | 'Moderate' | 'High',
              publicVsSharps: {
                public: %, sharps: %
              }
            },
            matchSnapshot: {
              recentPerformance: {
                home: '<team code> X-Y (W-L-W-L-W)',
                away: '<team code> X-Y (W-L-W-W-L)'
              },
              headToHead: 'e.g., 2-1 in last 3 matchups',
              momentum: {
                home: 'e.g.,<team code> 3-game win streak',
                away: 'e.g.,<team code> Just lost at home'
              }
            },
            xFactors: [
              { title: 'Health & Availability', detail: 'Impact of injuries on both teams', type: 1 },
              { title: 'Location & Weather', detail: 'Venue/weather factors', type: 2 },
              { title: 'Officiating & Rules', detail: 'Referee trends or rule impact', type: 3 },
              { title: 'Travel & Fatigue', detail: 'Rest and travel effect based on the last 10 games', type: 4 }
            ],
            aiAnalysis: {
              confidenceScore: 'Low' | 'Medium' | 'High',
              bettingSignal: 'Value Bet' | 'Public Trap' | 'Sharp Trap' | 'Market Conflicted',
              breakdown: 'Expert breakdown paragraph (~80-120 words)'
            }
          }`;

          const sanitizedPrompt = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

          console.log("=== FINAL AI PROMPT (first 2000 chars) ===");
          console.log(sanitizedPrompt.substring(0, 2000));
          console.log("=== END PROMPT PREVIEW ===");

          // res.status(200).json({ status: "true", prompt: sanitizedPrompt });
          // return;

          const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o",
            messages: [{
              role: "user",
              content: sanitizedPrompt + "\nNote: Return only the JSON object without any markdown formatting or code block markers."
            }],
            temperature: 0.2,
            max_tokens: 1000,
            response_format: { type: "json_object" }
          }, {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"

            }
          });

          const finalResponse = response.data.choices[0]?.message?.content;
          console.log("AI Response:", finalResponse);


          try {
            let cleanResponse = finalResponse
              .replace(/```json\s*/g, '')
              .replace(/```\s*$/g, '')
              .trim();

            console.log("Cleaned Response:", cleanResponse);

            // Parse the JSON string to an object
            const jsonResponse = JSON.parse(cleanResponse);

            jsonResponse.image_url = imageUrl;
            jsonResponse.sport = sport;

            // Add lightweight data for chatbot context (~4k chars total)
            jsonResponse.marketIntelligence = marketIntelligence;  // ~2 chars (null) or small

            // NEW: Calculate Key Insights V2 from existing data (LIGHTWEIGHT - only 4 metrics)
            // First enhance teamStats with game data to add pointsPerGame fields
            const enhancedTeamStats = enhanceTeamStatsWithGameData(teamStats, gameData);
            jsonResponse.teamStats = enhancedTeamStats;  // Use ENHANCED version with pointsPerGame/opponentPointsPerGame

            // If marketIntelligence has an error, retry with broader search for soccer
            let finalMarketIntelligence = marketIntelligence;
            if (marketIntelligence?.error && sport.toLowerCase().includes('soccer')) {
              console.log('⚠️ Market Intelligence failed, retrying with broader soccer search...');
              // Retry by trying multiple soccer leagues
              const soccerLeagues = ['soccer_epl', 'soccer_efl_champ', 'soccer_spain_la_liga', 'soccer_germany_bundesliga', 'soccer_italy_serie_a'];
              for (const league of soccerLeagues) {
                const retryResult = await getMarketIntelligenceDataTest(league, team1, team2);
                if (!retryResult.error) {
                  console.log(`✅ Found event in ${league} on retry!`);
                  finalMarketIntelligence = retryResult;
                  break;
                }
              }
            }

            jsonResponse.keyInsightsNew = calculateKeyInsightsNew(
              finalMarketIntelligence,
              enhancedTeamStats,
              jsonResponse.teams?.home || team1,
              jsonResponse.teams?.away || team2,
              sport
            );

            // NOTE: We do NOT include playerStats here because it's massive (55k+ chars).
            // PlayerStats contains game-by-game data for 20+ players and bloats the response to 80k lines.
            // The specific Player Stats page fetches this data separately when needed.

            // Return the JSON object immediately without waiting for cache save
            res.status(200).json(jsonResponse);

            // Save the analysis to cache asynchronously after sending response
            console.log(`Saving analysis to cache for ${sport} match between team ${team1Id} and team ${team2Id} with locale ${locale}`);
            saveAnalysisToCache(sport, team1Id, team2Id, jsonResponse, locale)
              .catch(error => console.error("Error saving to cache:", error));

            // We already sent the response, so we're done
            return;

          } catch (error) {
            console.error("Error parsing AI response:", error);
            console.error("Failed response:", finalResponse);
            return res.status(200).json({
              matchSnapshot: {
                recentPerformance: {
                  home: { pattern: "No recent data available", games: [] },
                  away: { pattern: "No recent data available", games: [] }
                },
                headToHead: "No head-to-head data available",
                momentum: { home: "No momentum data available", away: "No momentum data available" }
              },
              xFactors: []
            });
          }

          //final return



          res.status(200).json({ status: "false ", "Error": "No response from AI" });

          // res.status(200).json({ status: "true", matchData: jsonResponse, oddsData: oddsData, last10games: gameData.team1_last10games, last10games2: gameData.team2_last10games, h2h_games: gameData.h2h_games, team1_injuries: gameData.team1_injuries, team2_injuries: gameData.team2_injuries, upcomingGame: gameData.upcomingGame });




      } catch (error) {
          console.error("Error parsing AI response:", error);
          res.status(200).json({
              status: "false",
              message: 'Failed to analyze image. Please try again.'
          });
      }
  } catch (error) {
      console.error("Error analyzing image:", error);
      res.status(200).json({
          status: "false",
          message: "Failed to analyze image"
      });
  }
});


exports.chatWithGPT = functions.https.onRequest(async (req, res) => {
  try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({ error: "Messages array is required" });
      }

      const apiKey = OPENAI_API_KEY;

      const response = await axios.post("https://api.openai.com/v1/chat/completions", {
          model: "gpt-4",
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000
      }, {
          headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
          }
      });

      const message = response.data.choices[0]?.message;

      if (!message) {
          throw new Error("No response from AI");
      }

      res.status(200).json({ message });
  } catch (error) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Helper function to find team IDs based on sport and team info
async function findTeamIds(sport, team1Name, team1Code, team2Name, team2Code, soccer_odds_type=null) {
    let teamFilePath = '';
    let sport_type_odds = '';

    // Normalize sport name to lowercase for consistent comparison
    const normalizedSport = sport.toLowerCase();

    // Determine the correct JSON file path based on the sport (use startsWith for variants)
    if (normalizedSport === 'nba') {
            teamFilePath = path.join(__dirname, 'nba_teams.json');
            sport_type_odds = 'basketball_nba';
    } else if (normalizedSport === 'mlb') {
            teamFilePath = path.join(__dirname, 'mlb_teams.json');
            sport_type_odds = 'baseball_mlb';
    } else if (normalizedSport.includes('nfl')) {
            teamFilePath = path.join(__dirname, 'nfl_teams.json');
            sport_type_odds = 'americanfootball_nfl';
    } else if (normalizedSport === 'ncaaf') {
            teamFilePath = path.join(__dirname, 'ncaaf_teams.json');
            sport_type_odds = 'americanfootball_ncaaf';
    } else if (normalizedSport.startsWith('soccer') || normalizedSport.includes('football')) {
            teamFilePath = path.join(__dirname, 'soccer_teams.json');
        // If soccer_epl or other variant is passed, use it; otherwise use provided or default
        sport_type_odds = normalizedSport.startsWith('soccer_') ? normalizedSport : (soccer_odds_type || 'soccer_epl');
    } else if (normalizedSport === 'mma') {
            teamFilePath = path.join(__dirname, 'mma_fighters.json');
            sport_type_odds = 'mma_mixed_martial_arts';
    } else if (normalizedSport === 'tennis') {
            teamFilePath = path.join(__dirname, 'tennis_players.json');
            sport_type_odds = 'tennis';
    } else {
            throw new Error(`Unsupported sport: ${sport}. Supported sports are: nba, mlb, nfl, ncaaf, soccer, mma, tennis`);
    }

    let team1Id = null;
    let team2Id = null;
    let team1StatpalCode = null;
    let team2StatpalCode = null;

    try {
        if (!fs.existsSync(teamFilePath)) {
            throw new Error(`Team data file not found for sport: ${sport}`);
        }

        const teamDataRaw = fs.readFileSync(teamFilePath, 'utf8');
        const teams = JSON.parse(teamDataRaw);

        // Helper function to normalize strings for comparison
        const normalize = (str) => {
            if (!str) return "";
            return str
                .toLowerCase()
                // Replace special characters with their basic form
                .replace(/[üů]/g, 'u')
                .replace(/[é]/g, 'e')
                .replace(/[á]/g, 'a')
                .replace(/[í]/g, 'i')
                .replace(/[ó]/g, 'o')
                .replace(/[ñ]/g, 'n')
                // Remove all other special characters
                .replace(/[^a-z0-9\s]/g, "")
                // Replace multiple spaces with single space
                .replace(/\s+/g, ' ')
                .trim();
        };

        // Helper function to calculate match score based on multiple criteria
        const calculateMatchScore = (team, searchName, searchCode) => {
            let score = 0;
            const maxScore = 100;

            if (!team || (!searchName && !searchCode)) return 0;

            // 1. Exact code match (highest priority)
            if (searchCode && team.code) {
                if (team.code.toUpperCase() === searchCode.toUpperCase()) {
                    score += 40;
                }
            }

            // 2. Name similarity checks
            if (searchName && team.name) {
                const normalizedTeamName = normalize(team.name);
                const normalizedSearchName = normalize(searchName);
                let normalizedTeamNickname = null;

                if (normalizedSport === 'tennis' && team.nickname) {
                    normalizedTeamNickname = normalize(team.nickname);
                }

                // Direct string similarity with name
                const nameSimilarity = stringSimilarity.compareTwoStrings(normalizedSearchName, normalizedTeamName);
                score += nameSimilarity * 40;

                // Exact normalized name match
                if (normalizedTeamName === normalizedSearchName) {
                    score += 30;
                }

                // Partial name containment (both ways)
                if (normalizedTeamName.includes(normalizedSearchName) ||
                    normalizedSearchName.includes(normalizedTeamName)) {
                    score += 15;
                }

                // Word-by-word matching with name
                const teamWords = normalizedTeamName.split(' ');
                const searchWords = normalizedSearchName.split(' ');
                const matchingNameWords = teamWords.filter(word =>
                    searchWords.some(searchWord =>
                        word.includes(searchWord) || searchWord.includes(word)
                    )
                );
                if (matchingNameWords.length > 0) {
                    score += (matchingNameWords.length / Math.max(teamWords.length, searchWords.length)) * 15;
                }


                // Tennis specific: Nickname matching
                if (normalizedSport === 'tennis' && normalizedTeamNickname) {
                    // Direct string similarity with nickname
                    const nicknameSimilarity = stringSimilarity.compareTwoStrings(normalizedSearchName, normalizedTeamNickname);
                    score += nicknameSimilarity * 30; // Slightly lower weight than full name, can be adjusted

                    // Exact normalized nickname match
                    if (normalizedTeamNickname === normalizedSearchName) {
                        score += 20; // Bonus for exact nickname match
                    }

                    // Partial nickname containment
                    if (normalizedTeamNickname.includes(normalizedSearchName) ||
                        normalizedSearchName.includes(normalizedTeamNickname)) {
                        score += 10;
                    }

                    // Word-by-word matching with nickname
                    const nicknameWords = normalizedTeamNickname.split(' ');
                    const matchingNicknameWords = nicknameWords.filter(word =>
                        searchWords.some(searchWord =>
                            word.includes(searchWord) || searchWord.includes(word)
                        )
                    );
                    if (matchingNicknameWords.length > 0) {
                        score += (matchingNicknameWords.length / Math.max(nicknameWords.length, searchWords.length)) * 10;
                    }
                }


                // Alias matching (for teams with alternate names like Wolves/Wolverhampton Wanderers)
                if (team.aliases && Array.isArray(team.aliases)) {
                    for (const alias of team.aliases) {
                        const normalizedAlias = normalize(alias);
                        // Exact alias match gets high score
                        if (normalizedAlias === normalizedSearchName) {
                            score += 50; // Strong bonus for exact alias match
                        }
                        // Partial alias containment
                        if (normalizedAlias.includes(normalizedSearchName) ||
                            normalizedSearchName.includes(normalizedAlias)) {
                            score += 20;
                        }
                        // String similarity with alias
                        const aliasSimilarity = stringSimilarity.compareTwoStrings(normalizedSearchName, normalizedAlias);
                        if (aliasSimilarity > 0.7) {
                            score += aliasSimilarity * 30;
                        }
                    }
                }

                // 3. City matching (only for soccer teams)
                if (normalizedSport === 'soccer' && team.city) {
                    const normalizedCity = normalize(team.city);

                    // Check if any part of the search name matches the city
                    const cityWords = normalizedCity.split(' ');
                    const cityMatchingWords = searchWords.filter(word =>
                        cityWords.some(cityWord =>
                            cityWord.includes(word) || word.includes(cityWord)
                        )
                    );

                    // Add points for city matches
                    if (cityMatchingWords.length > 0) {
                        // Calculate city match score based on how many words match
                        const cityMatchScore = (cityMatchingWords.length / searchWords.length) * 20;
                        score += cityMatchScore;

                        // Bonus points if the city is an exact match
                        if (normalizedCity === normalizedSearchName) {
                            score += 10;
                        }
                    }
                }
            }

            return Math.min(Math.round(score), maxScore);
        };

        // Internal helper to find a single team ID with confidence score
        const findSingleTeamId = (searchTeamName, searchCode) => {
            if (!searchTeamName && !searchCode) return { match: null, score: 0 };

            let bestMatch = null;
            let highestScore = 0;

            teams.forEach(team => {
                const score = calculateMatchScore(team, searchTeamName, searchCode);

                // Log match attempts for debugging
                if (score > 20) { // Lower threshold for logging to see more potential matches
                    console.log(`Match attempt for "${searchTeamName}" (${searchCode}):`, {
                        teamName: team.name,
                        normalizedTeamName: normalize(team.name),
                        normalizedSearchName: normalize(searchTeamName),
                        teamCode: team.code,
                        score: score
                    });
                }

                if (score > highestScore) {
                    highestScore = score;
                    bestMatch = team;
                }
            });

            // Lower the minimum score threshold
            const minimumScore = 25; // Reduced from 30 to 25
            return {
                match: highestScore >= minimumScore ? [bestMatch.id, bestMatch.statpal_code] : null,
                score: highestScore
            };
        };

        // Find matches for both teams
        const team1Result = findSingleTeamId(team1Name, team1Code);
        const team2Result = findSingleTeamId(team2Name, team2Code);

        // Log match results
        console.log('Team 1 match result:', {
            name: team1Name,
            code: team1Code,
            score: team1Result.score,
            matched: !!team1Result.match
        });
        console.log('Team 2 match result:', {
            name: team2Name,
            code: team2Code,
            score: team2Result.score,
            matched: !!team2Result.match
        });

        // Only assign IDs if matches were found
        if (team1Result.match) {
            [team1Id, team1StatpalCode] = team1Result.match;
        }
        if (team2Result.match) {
            [team2Id, team2StatpalCode] = team2Result.match;
        }

        // Additional validation: Ensure we don't have the same team matched twice
        if (team1Id && team2Id && team1Id === team2Id) {
            throw new Error('Invalid match: Same team matched for both teams');
        }

        // If either team wasn't found, throw a detailed error
        if (!team1Id || !team2Id) {
            const notFoundTeams = [];
            if (!team1Id) notFoundTeams.push(team1Name);
            if (!team2Id) notFoundTeams.push(team2Name);

            throw new Error(JSON.stringify({
                type: 'TEAMS_NOT_FOUND',
                message: `Could not find teams in ${sport}: ${notFoundTeams.join(', ')}`,
                details: {
                    sport: sport,
                    notFoundTeams: notFoundTeams,
                    team1Score: team1Result.score,
                    team2Score: team2Result.score
                }
            }));
        }

        console.log(`Found IDs - Team1 (${team1Name}/${team1Code}): ${team1Id}, Team2 (${team2Name}/${team2Code}): ${team2Id}`);
        return { team1Id, team2Id, team1StatpalCode, team2StatpalCode, sport_type_odds };

    } catch (error) {
        // Parse error if it's our structured error
        try {
            const parsedError = JSON.parse(error.message);
            if (parsedError.type === 'TEAMS_NOT_FOUND') {
                throw new Error(`Sport/Team mismatch: ${parsedError.message}`);
            }
        } catch (e) {
            // If parsing fails, it's not our structured error, so just throw the original
            if (error.message.includes('team1StatpalCode is not defined')) {
                throw new Error(`Sport/Team mismatch: Could not find teams in ${sport}. Please verify team names and sport match.`);
            }
        }
        throw error;
    }
}

// Helper function to calculate win-loss record and form pattern
function getWinLossRecord(games, teamId, sport) {


  if (!games || !games.length) return { record: "0-0", pattern: "No recent games" };

  const results = games
    .slice(0, 6) // Take only the 6 most recent games
    .map(game => {
      let isWin = false;
      let teamScore, opponentScore;

      if (sport === 'soccer') {
        const isHome = game.teams?.home?.id === parseInt(teamId);
        teamScore = isHome ? game.score?.fulltime?.home : game.score?.fulltime?.away;
        opponentScore = isHome ? game.score?.fulltime?.away : game.score?.fulltime?.home;
      } else if (sport === 'nfl' || sport === 'ncaaf') {
        const isHome = game.teams?.home?.id === parseInt(teamId);
        teamScore = isHome ? game.scores?.home?.total : game.scores?.away?.total;
        opponentScore = isHome ? game.scores?.away?.total : game.scores?.home?.total;
      } else if (sport === 'mlb') {
        const isHome = game.teams?.home?.id === parseInt(teamId);
        teamScore = isHome ? game.scores?.home?.total : game.scores?.away?.total;
        opponentScore = isHome ? game.scores?.away?.total : game.scores?.home?.total;
      } else if (sport === 'mma') {
        // For MMA, check if our fighter is the winner
        const isFirstFighter = game.fighters?.first?.id === parseInt(teamId);
        const isSecondFighter = game.fighters?.second?.id === parseInt(teamId);

        if (isFirstFighter) {
          isWin = game.fighters?.first?.winner === true;
          return isWin ? 'W' : 'L';
        } else if (isSecondFighter) {
          isWin = game.fighters?.second?.winner === true;
          return isWin ? 'W' : 'L';
        }

        return null; // Fighter not found in this fight
      } else { // NBA and others
        const isHome = game.teams?.home?.id === parseInt(teamId);
        const isVisitor = game.teams?.visitors?.id === parseInt(teamId);
        teamScore = isHome ? game.scores?.home?.points : game.scores?.visitors?.points;
        opponentScore = isHome ? game.scores?.visitors?.points : game.scores?.home?.points;
      }

      if (sport !== 'mma') {
        if (teamScore == null || opponentScore == null) return null;
        return teamScore > opponentScore ? 'W' : 'L';
      }

      return null; // Should not reach here for MMA
    })
    .filter(Boolean); // Remove nulls

  const wins = results.filter(r => r === 'W').length;
  const losses = results.filter(r => r === 'L').length;

  return {
    record: `${wins}-${losses}`,
    pattern: `(${results.join('-')})`
  };
}

// Refactored generic function to get latest games for a given sport and team
async function getLatest10Games(sport, teamId, team2Id = null) {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const API_KEY = API_SPORTS_KEY;

    // Configuration for different sports APIs
    const sportApiConfig = {
        nba: {
            baseUrl: "https://v2.nba.api-sports.io/games",
        },
        mlb: {
            baseUrl: "https://v1.baseball.api-sports.io/games",
        },
        nfl: {
            baseUrl: "https://v1.american-football.api-sports.io/games",
        },
        ncaaf: {
            baseUrl: "https://v1.american-football.api-sports.io/games",
        },
        soccer: {
            baseUrl: "https://v3.football.api-sports.io/fixtures",
        },
        mma: {
            baseUrl: "https://v1.mma.api-sports.io/fights",
        }
    };

    const config = sportApiConfig[sport.toLowerCase()];

    if (!config) {
        console.error(`Unsupported sport: ${sport}. Cannot fetch game data.`);
        return { last10Games: [], winLossRecord: { record: "0-0", pattern: "No data" }, error: `Unsupported sport: ${sport}` };
    }

    if (!teamId) {
        console.warn(`Team ID is required to fetch ${sport} game data.`);
        return { last10Games: [], winLossRecord: { record: "0-0", pattern: "No data" }, error: `Team ID is missing for ${sport}.` };
    }

    // --- Helper function to fetch games for a specific season ---
    async function fetchGamesForSeason(seasonToFetch, includeScheduled = false, minGamesNeeded = 4) {
        let apiUrl ='';

        if(sport === 'mma'){
            apiUrl = `${config.baseUrl}?season=${seasonToFetch}&fighter=${teamId}`;
        }else{
            const url = new URL(config.baseUrl);
            url.searchParams.set("season", seasonToFetch);
            url.searchParams.set("team", String(Number(teamId)));  // ensures bare digits
            apiUrl = url.toString();
        }
        console.log("Final URL →", apiUrl);
        console.log(`Attempting to fetch ${sport} games from: ${apiUrl} for team ID: ${teamId}, season: ${seasonToFetch}`);

        try {
            const response = await axios.get(apiUrl, {
                headers: {
                    "x-apisports-key": API_KEY
                }
            });

            if (response.data.errors && (Object.keys(response.data.errors).length > 0 || (Array.isArray(response.data.errors) && response.data.errors.length > 0))) {
                console.error(`${sport} API Sports Error Response (Season ${seasonToFetch}):`, response.data.errors);
                const errorMsg = Array.isArray(response.data.errors) ? response.data.errors.join(', ') : JSON.stringify(response.data.errors);
                // Return error but indicate season for context
                return { finishedGames: [], upcomingGame: null, error: `API Error (Season ${seasonToFetch}): ${errorMsg}` };
            }

            if (!response.data.response || response.data.results === 0 || response.data.response.length === 0) {
                console.log(`No ${sport} games found for team ID ${teamId} in season ${seasonToFetch}.`);
                // Indicate no games found for this season, but not an error yet
                return { finishedGames: [], upcomingGame: null, error: null };
            }

            const games = response.data.response;


            // If team2Id is provided, find the upcoming scheduled game between team1 and team2
            let upcomingGame = null;
            if (team2Id && includeScheduled) {
                const now = new Date();
                const scheduledGames = games.filter(game => {
                    let isScheduled = false;
                    let isVsTeam2 = false;
                    let gameDate = null;

                    if (sport === 'soccer') {
                        isScheduled = game?.fixture?.status?.long === "Scheduled" || game?.fixture?.status?.short === "NS";
                        isVsTeam2 = (game?.teams?.home?.id === parseInt(teamId) && game?.teams?.away?.id === parseInt(team2Id)) ||
                                   (game?.teams?.away?.id === parseInt(teamId) && game?.teams?.home?.id === parseInt(team2Id));
                        gameDate = new Date(game?.fixture?.date);
                    }
                    else if (sport === 'mma') {
                        isScheduled = game?.status?.long === "Scheduled" || game?.status?.short === "NS";
                        isVsTeam2 = (game?.fighters?.first?.id === parseInt(teamId) && game?.fighters?.second?.id === parseInt(team2Id)) ||
                                   (game?.fighters?.second?.id === parseInt(teamId) && game?.fighters?.first?.id === parseInt(team2Id));
                        gameDate = new Date(game?.date);
                    }
                    else {
                        isScheduled = game?.status?.long === "Scheduled";
                        isVsTeam2 = (game?.teams?.home?.id === parseInt(teamId) && game?.teams?.visitors?.id === parseInt(team2Id)) ||
                                   (game?.teams?.visitors?.id === parseInt(teamId) && game?.teams?.home?.id === parseInt(team2Id));
                        gameDate = new Date(game?.date?.start);
                    }

                    const isFutureGame = gameDate > now;
                    return isScheduled && isVsTeam2 && isFutureGame;
                });

                if (scheduledGames.length > 0) {
                    // Sort by date (nearest first)
                    scheduledGames.sort((a, b) => {
                        let dateA, dateB;

                        if (sport === 'soccer') {
                            dateA = new Date(a?.fixture?.date);
                            dateB = new Date(b?.fixture?.date);
                        }
                        else if (sport === 'mma') {
                            dateA = new Date(a?.date);
                            dateB = new Date(b?.date);
                        }
                        else {
                            dateA = new Date(a?.date?.start);
                            dateB = new Date(b?.date?.start);
                        }

                        return dateA - dateB; // sort ascending for future games
                    });

                    upcomingGame = scheduledGames[0];
                    console.log(`Found upcoming game between teams ${teamId} and ${team2Id}`);
                }
            }

            // Filter for finished games only
            const finishedGames = games.filter(game => {
                if (sport === 'soccer') {
                    return game?.fixture?.status?.long === "Finished" || game?.fixture?.status?.long === "Match Finished";
                }
                else if (sport === 'mma') {
                    return game?.status?.long === "Finished" || game?.status?.short === "FT";
                }
                else if (sport === 'nfl' || sport === 'ncaaf') {
                    return game?.game?.status?.long === "Finished" || game?.game?.status?.short === "FT";
                }
                else {
                    return game?.status?.long === "Finished" || game?.status?.long === "Match Finished";
                }
            });

            // Sort the finished games by date (most recent first)
            const sortedGames = finishedGames.sort((a, b) => {
                let dateA, dateB;

                if (sport === 'soccer') {
                    dateA = new Date(a?.fixture?.date);
                    dateB = new Date(b?.fixture?.date);
                    if (!a?.fixture?.date || isNaN(dateA)) return 1;
                    if (!b?.fixture?.date || isNaN(dateB)) return -1;
                }
                else if (sport === 'mma') {
                    dateA = new Date(a?.date);
                    dateB = new Date(b?.date);
                    if (!a?.date || isNaN(dateA)) return 1;
                    if (!b?.date || isNaN(dateB)) return -1;
                }
                else if (sport === 'nfl' || sport === 'ncaaf') {
                    dateA = new Date(a?.game?.date?.date);
                    dateB = new Date(b?.game?.date?.date);
                    if (!a?.game?.date?.date || isNaN(dateA)) return 1;
                    if (!b?.game?.date?.date || isNaN(dateB)) return -1;
                }
                else {
                    dateA = new Date(a?.date?.start);
                    dateB = new Date(b?.date?.start);
                    if (!a?.date?.start || isNaN(dateA)) return 1;
                    if (!b?.date?.start || isNaN(dateB)) return -1;
                }

                return dateB - dateA; // sort descending by date
            });

            return {
                finishedGames: sortedGames,
                upcomingGame,
                error: null
            };

        } catch (error) {
            console.error(`Error fetching ${sport} game data for team ID ${teamId}, season ${seasonToFetch}:`);
            let errorMessage = `Failed to fetch ${sport} data (Season ${seasonToFetch})`;
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Headers:', error.response.headers);
                console.error('Data:', error.response.data);
                errorMessage = `API Request Failed (Season ${seasonToFetch}): Status ${error.response.status} - ${JSON.stringify(error.response.data)}`;
            } else if (error.request) {
                console.error('Request Error:', error.request);
                errorMessage = `API Request Error (Season ${seasonToFetch}): No response received.`;
            } else {
                console.error('Error Message:', error.message);
                errorMessage = `Configuration/Network Error (Season ${seasonToFetch}): ${error.message}`;
            }
            // Return error encountered during fetch
            return { finishedGames: [], upcomingGame: null, error: errorMessage };
        }
    }
    // --- End Helper function ---

    // 1. First try fetching current season games
    let currentSeasonResult = await fetchGamesForSeason(currentYear, team2Id !== null);

    if (currentSeasonResult.error) {
        return {
            last10Games: [],
            winLossRecord: { record: "0-0", pattern: "Error" },
            upcomingGame: null,
            error: currentSeasonResult.error
        };
    }

    let allFinishedGames = [...currentSeasonResult.finishedGames];
    let upcomingGame = currentSeasonResult.upcomingGame;

    // 2. If we have less than 4 finished games in current season, fetch previous season
    if (allFinishedGames.length < 4) {
        console.log(`Only ${allFinishedGames.length} finished games found in current season (${currentYear}), fetching previous season (${previousYear})...`);
        const previousSeasonResult = await fetchGamesForSeason(previousYear, false);

        if (!previousSeasonResult.error) {
            // Combine games from both seasons
            allFinishedGames = [...allFinishedGames, ...previousSeasonResult.finishedGames];
        }
    }

    // Get the latest 10 finished games across both seasons
    const latest10FinishedGames = allFinishedGames.slice(0, 10);

    if (latest10FinishedGames.length === 0) {
        return {
            last10Games: [],
            winLossRecord: { record: "0-0", pattern: "No recent games" },
            upcomingGame,
            error: null
        };
    }

    // Calculate win-loss record using combined games
    const winLossRecord = getWinLossRecord(latest10FinishedGames, teamId, sport);

    console.log(`Total finished games found: ${latest10FinishedGames.length}. Record: ${winLossRecord.record} ${winLossRecord.pattern}`);

    return {
        winLossRecord,
        last10Games: latest10FinishedGames, // Return all available games for proper averages
        upcomingGame,
        error: null
    };
}

// Helper function to calculate head-to-head record between two teams
function getHeadToHeadRecord(games, team1Id, sport) {
  if (!games || !games.length) return { record: "0-0", pattern: "No H2H games" };

  const results = games
    .slice(0, 6) // Take only the 6 most recent games
    .map(game => {
      let isTeam1Win = false;

      if (sport === 'soccer') {
        const isTeam1Home = game.teams?.home?.id === parseInt(team1Id);
        const homeScore = game.score?.fulltime?.home;
        const awayScore = game.score?.fulltime?.away;

        if (homeScore == null || awayScore == null) return null;

        if (isTeam1Home) {
          isTeam1Win = homeScore > awayScore;
        } else {
          isTeam1Win = awayScore > homeScore;
        }
      } else if (sport === 'nfl' || sport === 'ncaaf') {
        const isTeam1Home = game.teams?.home?.id === parseInt(team1Id);
        const homeScore = game.scores?.home?.total;
        const awayScore = game.scores?.away?.total;

        if (homeScore == null || awayScore == null) return null;

        if (isTeam1Home) {
          isTeam1Win = homeScore > awayScore;
        } else {
          isTeam1Win = awayScore > homeScore;
        }
      } else if (sport === 'mlb') {
        const isTeam1Home = game.teams?.home?.id === parseInt(team1Id);
        const homeScore = game.scores?.home?.total;
        const awayScore = game.scores?.away?.total;

        if (homeScore == null || awayScore == null) return null;

        if (isTeam1Home) {
          isTeam1Win = homeScore > awayScore;
        } else {
          isTeam1Win = awayScore > homeScore;
        }
      } else { // NBA and others
        const isTeam1Home = game.teams?.home?.id === parseInt(team1Id);
        const homeScore = game.scores?.home?.points;
        const awayScore = game.scores?.visitors?.points;

        if (homeScore == null || awayScore == null) return null;

        if (isTeam1Home) {
          isTeam1Win = homeScore > awayScore;
        } else {
          isTeam1Win = awayScore > homeScore;
        }
      }

      return isTeam1Win ? 'W' : 'L';
    })
    .filter(Boolean); // Remove nulls

  const wins = results.filter(r => r === 'W').length;
  const losses = results.filter(r => r === 'L').length;

  return {
    record: `${wins}-${losses}`,
    pattern: `(${results.join('-')})`
  };
}

// Function to get the latest 10 head-to-head games between two teams for a given sport
async function getHeadToHeadGames(sport, team1Id, team2Id) {
    if (!team1Id || !team2Id) {
        console.warn(`Both Team IDs are required to fetch H2H ${sport} game data.`);
        return { h2hGames: [], h2hRecord: { record: "0-0", pattern: "No data" }, error: `Team IDs are missing for ${sport} H2H.` };
    }

    const API_KEY = API_SPORTS_KEY; // Use the same API key

    // Configuration for different sports APIs (ensure NBA is configured)
    const sportApiConfig = {
        nba: {
            baseUrl: "https://v2.nba.api-sports.io/games",
        },
        mlb: {
            baseUrl: "https://v1.baseball.api-sports.io/games/h2h",
        },
        nfl: {
            baseUrl: "https://v1.american-football.api-sports.io/games",
        },
        ncaaf: {
            baseUrl: "https://v1.american-football.api-sports.io/games",
        },
        soccer: {
            baseUrl: "https://v3.football.api-sports.io/fixtures/headtohead",
        }
    };

    const config = sportApiConfig[sport.toLowerCase()];

    if (!config) {
        console.error(`Unsupported sport for H2H: ${sport}.`);
        return { h2hGames: [], h2hRecord: { record: "0-0", pattern: "No data" }, error: `Unsupported sport for H2H: ${sport}` };
    }

    const apiUrl = `${config.baseUrl}?h2h=${team1Id}-${team2Id}`;
    console.log(`Attempting to fetch ${sport} H2H games from: ${apiUrl}`);

    try {
        const response = await axios.get(apiUrl, {
            headers: {
                "x-apisports-key": API_KEY
            }
        });

        if (response.data.errors && (Object.keys(response.data.errors).length > 0 || (Array.isArray(response.data.errors) && response.data.errors.length > 0))) {
            console.error(`${sport} API Sports H2H Error Response:`, response.data.errors);
            const errorMsg = Array.isArray(response.data.errors) ? response.data.errors.join(', ') : JSON.stringify(response.data.errors);
            // Check for specific token error from the example
            if (errorMsg.includes("Error/Missing application key")) {
                 return { h2hGames: [], h2hRecord: { record: "0-0", pattern: "Error" }, error: `API Error (H2H): Missing or invalid API key. Check configuration.` };
            }
            return { h2hGames: [], h2hRecord: { record: "0-0", pattern: "Error" }, error: `API Error (H2H): ${errorMsg}` };
        }

        if (!response.data.response || response.data.results === 0 || response.data.response.length === 0) {
            console.log(`No ${sport} H2H games found between team IDs ${team1Id} and ${team2Id}.`);
            return { h2hGames: [], h2hRecord: { record: "0-0", pattern: "No H2H games" }, error: null }; // No games found is not an error
        }

        const games = response.data.response;

        // Remove image URLs from the response data
        games.forEach(game => {
            // Handle soccer specific structure
            if (sport.toLowerCase() === 'soccer') {
                if (game.league) {
                    delete game.league.logo;
                    delete game.league.flag;
                }
                if (game.teams && game.teams.home) {
                    delete game.teams.home.logo;
                }
                if (game.teams && game.teams.away) {
                    delete game.teams.away.logo;
                }
            }
            // Handle NBA/MLB/NFL structure
            else {
                if (game.teams && game.teams.visitors) {
                    delete game.teams.visitors.logo;
                }
                if (game.teams && game.teams.home) {
                    delete game.teams.home.logo;
                }
            }
        });

        const finishedGames = games.filter(game => {
          if (sport.toLowerCase() === 'soccer') {
              return game.fixture?.status?.long === "Match Finished" ||
                     game.fixture?.status?.short === "FT";
          } else if (sport.toLowerCase() === 'nfl' || sport.toLowerCase() === 'ncaaf') {
              return game?.game?.status?.long === "Finished" || game?.game?.status?.short === "FT";
          } else {
              return game?.status?.long === "Finished" || game?.status?.long === "Match Finished";
          }
      });

        if (finishedGames.length === 0) {
            console.log(`No *finished* ${sport} H2H games found between team IDs ${team1Id} and ${team2Id}.`);
            return { h2hGames: [], h2hRecord: { record: "0-0", pattern: "No finished H2H games" }, error: null };
        }

        // Sort the finished games by date (most recent first)
        const sortedGames = finishedGames.sort((a, b) => {
            const dateA = sport.toLowerCase() === 'soccer'
                ? new Date(a.fixture?.date)
                : new Date(a?.date?.start);
            const dateB = sport.toLowerCase() === 'soccer'
                ? new Date(b.fixture?.date)
                : new Date(b?.date?.start);

            if ((sport.toLowerCase() === 'soccer' && !a.fixture?.date) ||
                (sport.toLowerCase() !== 'soccer' && !a?.date?.start) ||
                isNaN(dateA)) return 1;

            if ((sport.toLowerCase() === 'soccer' && !b.fixture?.date) ||
                (sport.toLowerCase() !== 'soccer' && !b?.date?.start) ||
                isNaN(dateB)) return -1;

            return dateB - dateA; // sort descending
        });

        // Get the latest 10 finished H2H games
        const latest10FinishedGames = sortedGames.slice(0, 10);

        // Calculate head-to-head record from the perspective of team1Id
        const h2hRecord = getHeadToHeadRecord(latest10FinishedGames, team1Id, sport.toLowerCase());

        console.log(`Successfully fetched ${latest10FinishedGames.length} latest *finished* ${sport} H2H games between ${team1Id} and ${team2Id}. H2H Record: ${h2hRecord.record} ${h2hRecord.pattern}`);

        return {
            h2hGames: latest10FinishedGames, // Return all H2H games for complete analysis
            h2hRecord,
            error: null
        };

    } catch (error) {
        console.error(`Error fetching ${sport} H2H game data between ${team1Id} and ${team2Id}:`);
        let errorMessage = `Failed to fetch ${sport} H2H data`;
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
            console.error('Data:', error.response.data);
            errorMessage = `API Request Failed (H2H): Status ${error.response.status} - ${JSON.stringify(error.response.data)}`;
             // Check for specific token error from the example response in the request
             if (error.response.data?.errors?.token?.includes("Missing application key")) {
                errorMessage = `API Error (H2H): Missing or invalid API key. Check configuration.`;
            }
        } else if (error.request) {
            console.error('Request Error:', error.request);
            errorMessage = `API Request Error (H2H): No response received.`;
        } else {
            console.error('Error Message:', error.message);
            errorMessage = `Configuration/Network Error (H2H): ${error.message}`;
        }
        return { h2hGames: [], h2hRecord: { record: "0-0", pattern: "Error" }, error: errorMessage };
    }
}

async function getGameData(sport, team1Id, team2Id, team1_code, team2_code, team1StatpalCode, team2StatpalCode) {

  let data = {};
  if(sport === 'nba'){
    // Run API calls in parallel
    const [team1_last10games, team2_last10games, h2h_games, team1_injuries, team2_injuries] = await Promise.all([
      getLatest10Games(sport, team1Id, team2Id),
      getLatest10Games(sport, team2Id),
      getHeadToHeadGames(sport, team1Id, team2Id),
      getTeamInjuries(sport, team1StatpalCode),
      getTeamInjuries(sport, team2StatpalCode)
    ]);

    data = {
      team1_last10games,
      team2_last10games,
      h2h_games,
      team1_injuries,
      team2_injuries,
      upcomingGame: team1_last10games.upcomingGame || null
    }
  }else if(sport === 'mlb'){
    // Run API calls in parallel
    const [team1_last10games, team2_last10games, h2h_games, team1_injuries, team2_injuries] = await Promise.all([
      getLatest10Games(sport, team1Id, team2Id),
      getLatest10Games(sport, team2Id),
      getHeadToHeadGames(sport, team1Id, team2Id),
      getTeamInjuries(sport, team1StatpalCode),
      getTeamInjuries(sport, team2StatpalCode)
    ]);

    data = {
      team1_last10games,
      team2_last10games,
      h2h_games,
      team1_injuries,
      team2_injuries,
      upcomingGame: team1_last10games.upcomingGame || null
    }
  }else if(sport === 'soccer'){
    // Run API calls in parallel
    const [team1_last10games, team2_last10games, h2h_games, team1_injuries, team2_injuries] = await Promise.all([
      getLatest10Games(sport, team1Id, team2Id),
      getLatest10Games(sport, team2Id),
      getHeadToHeadGames(sport, team1Id, team2Id),
      soccerInjuries(team1Id),
      soccerInjuries(team2Id)
    ]);

    data = {
      team1_last10games,
      team2_last10games,
      team1_injuries,
      team2_injuries,
      h2h_games,
      upcomingGame: team1_last10games.upcomingGame || null
    }
  }else if(sport === 'nfl' || sport === 'ncaaf'){
    // Run API calls in parallel
    const [team1_last10games, team2_last10games, h2h_games, team1_injuries, team2_injuries] = await Promise.all([
      getLatest10Games(sport, team1Id, team2Id),
      getLatest10Games(sport, team2Id),
      getHeadToHeadGames(sport, team1Id, team2Id),
      nflInjuries(team1Id),
      nflInjuries(team2Id)
    ]);

    data = {
      team1_last10games,
      team2_last10games,
      h2h_games,
      team1_injuries,
      team2_injuries,
      upcomingGame: team1_last10games.upcomingGame || null
    }
  }else if(sport === 'mma'){
    // Run API calls in parallel
    const [team1_last10games, team2_last10games] = await Promise.all([
      getLatest10Games(sport, team1Id, team2Id),
      getLatest10Games(sport, team2Id)
    ]);

    data = {
      team1_last10games,
      team2_last10games,
      h2h_games: { h2hRecord:  "No MMA H2H data"  },
      team1_injuries: { injuries: [] },
      team2_injuries: { injuries: [] },
      upcomingGame: team1_last10games.upcomingGame || null
    };
  }else if(sport === 'tennis'){
    // For tennis, we use a single API call to get H2H and last games for both players
    const tennisData = await getTennisHeadToHead(team1Id, team2Id);

    data = {
      team1_last10games: tennisData.player1LastGames,
      team2_last10games: tennisData.player2LastGames,
      h2h_games: tennisData.h2h,
      team1_injuries: { injuries: [] }, // Tennis injuries not available
      team2_injuries: { injuries: [] },
      upcomingGame: tennisData.upcomingGame || null
    };
  }

  return data;
}

// Function to get injuries for a team from the StatPal API
async function getTeamInjuries(sport, teamCode) {
  if (!teamCode) {
    console.warn('Team code is required to fetch injury data');
    return { team: { report: [] } };
  }

  const API_KEY = STATPAL_API_KEY;

  const lowerSport = sport.toLowerCase();
  const lowerTeamCode = teamCode.toLowerCase();
  const url = `https://statpal.io/api/v1/${lowerSport}/injuries/${lowerTeamCode}?access_key=${API_KEY}`;

  try {
    console.log(`Fetching injuries for ${lowerSport} team ${lowerTeamCode} from: ${url}`);
    const response = await axios.get(url);

    if (response.status === 200) {
      return response.data;
    } else {
      console.warn(`Failed to fetch injury data for ${teamCode}: Status ${response.status}`);
      return { team: { report: [] } };
    }
  } catch (error) {
    console.error(`Error fetching injury data for ${teamCode}:`, error.message);
    // Check if it's a specific error like rate limit or auth issue
    if (error.response && error.response.status === 403) {
      console.warn('API returned 403: Possibly rate limited or requires authentication');
    }
    return { team: { report: [] } };
  }
}

/**
 * Gets soccer team injuries for the last 15 days using the API-Sports football API
 * @param {string} teamId - The ID of the team to get injuries for
 * @returns {Object} Object containing injury data or error
 */
async function soccerInjuries(teamId) {
    if (!teamId) {
        console.warn("Team ID is required to fetch soccer injury data.");
        return { injuries: [], error: "Team ID is missing." };
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const API_KEY = API_SPORTS_KEY;

    // --- Helper function to fetch injuries for a specific season ---
    async function fetchInjuriesForSeason(seasonToFetch) {
        const apiUrl = `https://v3.football.api-sports.io/injuries?season=${seasonToFetch}&team=${teamId}`;
        console.log(`Attempting to fetch soccer injuries from: ${apiUrl} for team ID: ${teamId}, season: ${seasonToFetch}`);

        try {
            const response = await axios.get(apiUrl, {
                headers: {
                    "x-apisports-key": API_KEY
                }
            });

            if (response.data.errors && Object.keys(response.data.errors).length > 0) {
                console.error(`Soccer API Sports Error Response (Season ${seasonToFetch}):`, response.data.errors);
                const errorMsg = JSON.stringify(response.data.errors);
                return { injuries: [], error: `API Error (Season ${seasonToFetch}): ${errorMsg}` };
            }

            if (!response.data.response || response.data.results === 0) {
                console.log(`No injuries found for team ID ${teamId} in season ${seasonToFetch}.`);
                return { injuries: [], error: null, seasonTried: seasonToFetch, foundInjuries: false };
            }

            const injuriesData = response.data.response;

            // Filter injuries from last 15 days
            const fifteenDaysAgo = new Date();
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

            const recentInjuries = injuriesData.filter(injury => {
                if (!injury.fixture || !injury.fixture.date) return false;
                const injuryDate = new Date(injury.fixture.date);
                return injuryDate >= fifteenDaysAgo;
            });

            if (recentInjuries.length === 0) {
                console.log(`No injuries in the last 15 days found for team ID ${teamId} in season ${seasonToFetch}.`);
                return { injuries: [], error: null, seasonTried: seasonToFetch, foundInjuries: false };
            }

            // Format the injury data to include only necessary information
            const formattedInjuries = recentInjuries.map(injury => {
                return {
                    player: injury.player.name,
                    injury: injury.player.type,
                    reason: injury.player.reason,
                    date: injury.fixture.date
                };
            });

            console.log(`RAW SOCCER API RESPONSE for team ${teamId}:`, JSON.stringify(injuriesData, null, 2));
            console.log(`Successfully fetched ${formattedInjuries.length} injuries from the last 15 days for team ID ${teamId} (Season ${seasonToFetch}).`);
            console.log(`Formatted soccer injuries:`, JSON.stringify(formattedInjuries, null, 2));
            return {
                injuries: formattedInjuries,
                error: null,
                seasonTried: seasonToFetch,
                foundInjuries: true
            };

        } catch (error) {
            console.error(`Error fetching soccer injury data for team ID ${teamId}, season ${seasonToFetch}:`);
            let errorMessage = `Failed to fetch soccer injury data (Season ${seasonToFetch})`;
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
                errorMessage = `API Request Failed (Season ${seasonToFetch}): Status ${error.response.status} - ${JSON.stringify(error.response.data)}`;
            } else if (error.request) {
                console.error('Request Error:', error.request);
                errorMessage = `API Request Error (Season ${seasonToFetch}): No response received.`;
            } else {
                console.error('Error Message:', error.message);
                errorMessage = `Configuration/Network Error (Season ${seasonToFetch}): ${error.message}`;
            }
            return { injuries: [], error: errorMessage, seasonTried: seasonToFetch, foundInjuries: false };
        }
    }
    // --- End Helper function ---

    // 1. Try fetching for the current season
    let result = await fetchInjuriesForSeason(currentYear);

    // 2. If no injuries found in current season AND no error occurred, try previous season
    if (!result.foundInjuries && !result.error) {
        console.log(`No injuries found for current season (${currentYear}), trying previous season (${previousYear})...`);
        result = await fetchInjuriesForSeason(previousYear);
    }

    // Return the final result (either injuries or the last error encountered)
    if (result.error) {
        return { injuries: [], error: result.error };
    } else {
        return { injuries: result.injuries };
    }
}

/**
 * Gets NFL team injuries using the API-Sports football API
 * @param {string} teamId - The ID of the team to get injuries for
 * @returns {Object} Object containing injury data or error
 */
async function nflInjuries(teamId) {
    if (!teamId) {
        console.warn("Team ID is required to fetch NFL injury data.");
        return { injuries: [], error: "Team ID is missing." };
    }

    const API_KEY = API_SPORTS_KEY;

    try {
        const url = new URL("https://v1.american-football.api-sports.io/injuries");
        url.searchParams.set("team", String(Number(teamId)));  // ensures bare digits
        const apiUrl = url.toString();
        console.log("Final Injuries URL →", apiUrl);
        console.log(`Attempting to fetch NFL injuries from: ${apiUrl} for team ID: ${teamId}`);

        const response = await axios.get(apiUrl, {
            headers: {
                "x-apisports-key": API_KEY
            }
        });

        if (response.data.errors && Object.keys(response.data.errors).length > 0) {
            console.error('NFL API Sports Error Response:', response.data.errors);
            const errorMsg = JSON.stringify(response.data.errors);
            return { injuries: [], error: `API Error: ${errorMsg}` };
        }

        if (!response.data.response || response.data.results === 0) {
            console.log(`No injuries found for NFL team ID ${teamId}.`);
            return { injuries: [], error: null };
        }

        console.log(`RAW NFL API RESPONSE for team ${teamId}:`, JSON.stringify(response.data.response, null, 2));
        console.log(`Number of injuries returned: ${response.data.response.length}`);
        console.log(`Full API response structure:`, JSON.stringify(response.data, null, 2));

        // Format the injury data to match soccer format for AI consistency
        const formattedInjuries = response.data.response.map(injury => ({
            player: injury.player.name,
            injury: injury.status,        // Map status to injury (e.g., "Questionable")
            reason: injury.description,   // Map description to reason (e.g., "Back - Questionable for Week 1")
            date: injury.date
        }));

        console.log(`Successfully fetched ${formattedInjuries.length} injuries for NFL team ID ${teamId}`);
        return { injuries: formattedInjuries, error: null };

    } catch (error) {
        console.error(`Error fetching NFL injury data for team ID ${teamId}:`, error.message);
        let errorMessage = 'Failed to fetch NFL injury data';
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
            errorMessage = `API Request Failed: Status ${error.response.status} - ${JSON.stringify(error.response.data)}`;
        } else if (error.request) {
            console.error('Request Error:', error.request);
            errorMessage = 'API Request Error: No response received.';
        } else {
            console.error('Error Message:', error.message);
            errorMessage = `Configuration/Network Error: ${error.message}`;
        }
        return { injuries: [], error: errorMessage };
    }
}

// Function to get weather forecast for a specific city and date
async function getWeatherForecast(city, matchDateStr) {
    if (!city || !matchDateStr) {
        console.warn("City and match date are required to fetch weather forecast.");
        return null;
    }

    const API_KEY = WEATHER_API_KEY;
    const BASE_URL = 'http://api.weatherapi.com/v1/forecast.json';

    try {
        const matchDate = new Date(matchDateStr);
        // Adjust matchDate to start of the day for comparison
        matchDate.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set today to start of the day

        const sevenDaysFromNow = new Date(today);
        sevenDaysFromNow.setDate(today.getDate() + 7); // Date 7 days from today

        // Check if the match date is within the next 7 days (inclusive of today)
        if (matchDate < today || matchDate > sevenDaysFromNow) {
            console.log(`Match date ${matchDate.toISOString().split('T')[0]} is outside the 7-day forecast range.`);
            return null;
        }

        // Calculate the number of days between today and the match date
        const timeDiff = matchDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        // API requires at least 1 day. Add 1 to include today in the count.
        // Cap at 7 days as that's the max reliable forecast.
        const daysToRequest = Math.min(Math.max(1, daysDiff + 1), 7);

        const apiUrl = `${BASE_URL}?key=${API_KEY}&q=${encodeURIComponent(city)}&days=${daysToRequest}&aqi=no&alerts=yes`;

        console.log(`Fetching weather forecast from: ${apiUrl}`);
        const response = await axios.get(apiUrl);

        if (response.status === 200 && response.data && response.data.forecast && response.data.forecast.forecastday) {
            const forecastDays = response.data.forecast.forecastday;

            // Format matchDate to 'YYYY-MM-DD' for comparison
            const targetDateStr = matchDate.toISOString().split('T')[0];

            // Remove hour data from all forecast days
            forecastDays.forEach(day => delete day.hour);

            const specificDayForecast = forecastDays.find(day => day.date === targetDateStr);

            if (specificDayForecast) {
                console.log(`Found weather forecast for ${city} on ${targetDateStr}`);
                return specificDayForecast;
            } else {
                console.log(`No specific forecast found for ${targetDateStr} in the response.`);
                return null;
            }
        } else {
            console.warn(`Failed to fetch weather data for ${city}: Status ${response.status}`);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching weather data for ${city} on ${matchDateStr}:`, error.message);
        if (error.response) {
            console.error('Weather API Error Response:', error.response.data);
        }
        return null;
    }
}


function normalizeString(str) {
  // Remove special characters but keep numbers and letters
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fuzzyMatchTeam(event, team1, team2) {
  // Helper function to normalize and clean team names
  function normalizeTeamName(team) {
    return normalizeString(team)
      .replace(/^the /, '') // Remove leading "the"
      .trim();
  }

  // Helper function to check if a search term is part of a full team name
  function isPartialMatch(searchTerm, fullTeam) {
    const normalizedSearch = normalizeTeamName(searchTerm);
    const normalizedFull = normalizeTeamName(fullTeam);

    // Direct similarity check
    const directSimilarity = stringSimilarity.compareTwoStrings(normalizedSearch, normalizedFull);
    console.log(`Direct similarity between '${searchTerm}' and '${fullTeam}': ${directSimilarity}`);

    // Check if search term is contained within full team name
    const isContained = normalizedFull.includes(normalizedSearch);
    console.log(`Is '${searchTerm}' contained in '${fullTeam}'?: ${isContained}`);

    // Return true if either condition is met
    return directSimilarity > 0.4 || isContained;
  }

  // Helper function to try matching with specific team order
  function tryMatch(searchTeam1, searchTeam2) {
    // Check if teams match in either position (home/away)
    const team1MatchesHome = isPartialMatch(searchTeam1, event.home_team);
    const team1MatchesAway = isPartialMatch(searchTeam1, event.away_team);
    const team2MatchesHome = isPartialMatch(searchTeam2, event.home_team);
    const team2MatchesAway = isPartialMatch(searchTeam2, event.away_team);

    // Valid match combinations:
    // 1. team1 matches home AND team2 matches away
    // 2. team1 matches away AND team2 matches home
    const isMatch = (team1MatchesHome && team2MatchesAway) || (team1MatchesAway && team2MatchesHome);

    // Debug logging to help track matching process
    console.log('Trying match with order:', {
      searchTeam1, searchTeam2,
      event_home: event.home_team,
      event_away: event.away_team,
      matches: {
        team1_home: team1MatchesHome,
        team1_away: team1MatchesAway,
        team2_home: team2MatchesHome,
        team2_away: team2MatchesAway
      },
      isMatch
    });

    return isMatch;
  }

  // Try first with original order
  let matched = tryMatch(team1, team2);

  // If no match found, try with swapped positions
  if (!matched) {
    console.log('No match found with original order, trying swapped positions...');
    matched = tryMatch(team2, team1);
  }

  return matched;
}

async function getOddsData(sport, team1, team2, team1_code, team2_code, locale = 'en') {
  const BASE_URL = `https://api.the-odds-api.com/v4/sports/${sport}`;
  const eventsResponse = await axios.get(`${BASE_URL}/events?apiKey=${ODDS_API_KEY}`);
  const events = eventsResponse.data;

  const event = events.find(e => fuzzyMatchTeam(e, team1, team2));
  if (!event){
    return {
      oddsData: [],
      keyInsights: {
        confidence: "",
        marketActivity: "",
        lineShift: "",
        publicVsSharps: {
          public: 0,
          sharps: 0
        },
        bettingSignal: ""
      }
    };
  };

  const oddsUrl = `${BASE_URL}/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads`;
  const oddsResponse = await axios.get(oddsUrl);
  const oddsData = oddsResponse.data.bookmakers || [];

  let bestHomeOdds = Number.MAX_VALUE;
  let bestAwayOdds = Number.MAX_VALUE;
  let allSpreads = [];

  oddsData.forEach(bookmaker => {
    bookmaker.markets.forEach(market => {
      if (market.key === 'h2h') {
        market.outcomes.forEach(outcome => {
          if (outcome.name.toLowerCase() === event.home_team.toLowerCase()) {
            if (outcome.price < bestHomeOdds) bestHomeOdds = outcome.price;
          } else if (outcome.name.toLowerCase() === event.away_team.toLowerCase()) {
            if (outcome.price < bestAwayOdds) bestAwayOdds = outcome.price;
          }
        });
      }

      if (market.key === 'spreads') {
        market.outcomes.forEach(o => {
          if (o.point !== undefined) allSpreads.push(o.point);
        });
      }
    });
  });

  // --- Key Insight Metrics ---
  const oddsGap = Math.abs(bestHomeOdds - bestAwayOdds);
  const confidence = oddsGap > 2 ? "High" : oddsGap > 1 ? "Medium" : "Low";
  const marketActivity = oddsData.length > 5 ? "High" : oddsData.length > 2 ? "Moderate" : "Low";

  const spreadVariance = allSpreads.length > 0
    ? Math.max(...allSpreads) - Math.min(...allSpreads)
    : 0;

  const lineShift = spreadVariance >= 2 ? "High" : spreadVariance > 0.5 ? "Medium" : "Low";

  const bettingSignal =
    confidence === "Medium" && lineShift === "High"
      ? "Sharp Trap"
      : confidence === "High" && lineShift === "Low"
      ? "Public Favorite"
      : "None";

  const publicVsSharps = {
    public: 63,  // dummy values
    sharps: 37
  };

  // return{
  //   keyInsights: {
  //     confidence,
  //     marketActivity,
  //     lineShift,
  //     publicVsSharps,
  //     bettingSignal
  //   }
  // }

  return {
    // event,
    oddsData,
    keyInsights: {
      confidence,
      marketActivity,
      lineShift,
      publicVsSharps,
      bettingSignal
    }
  };
}

// Function to check cache for existing match analysis
async function checkCacheForMatch(sport, team1Id, team2Id, locale = 'en') {
  try {
    // Ensure consistent data types for IDs (convert to strings)
    const team1IdStr = String(team1Id);
    const team2IdStr = String(team2Id);

    // Create a consistent cache key
    const teams = [team1IdStr, team2IdStr].sort().join('-');
    const cacheKey = `${sport.toLowerCase()}_${teams}_${locale}`;

    console.log(`Checking cache with key: ${cacheKey}, team1Id: ${team1IdStr}, team2Id: ${team2IdStr}, locale: ${locale}`);

    const cacheRef = db.collection('matchAnalysisCache').doc(cacheKey);
    const cacheDoc = await cacheRef.get();

    console.log(`Cache check result - exists: ${cacheDoc.exists}`);

    if (cacheDoc.exists) {
      const cachedData = cacheDoc.data();
      console.log('Retrieved cached data:', JSON.stringify({
        sport: cachedData.sport,
        team1Id: cachedData.team1Id,
        team2Id: cachedData.team2Id,
        hasAnalysis: !!cachedData.analysis,
        timestamp: cachedData.timestamp
      }));

      // Handle different timestamp formats
      let timestamp;
      if (cachedData.timestamp instanceof Date) {
        timestamp = cachedData.timestamp.getTime();
      } else if (cachedData.timestamp && cachedData.timestamp._seconds) {
        // Handle Firestore Timestamp object
        timestamp = cachedData.timestamp._seconds * 1000;
      } else {
        // Handle string or number timestamp
        timestamp = new Date(cachedData.timestamp).getTime();
      }

      const now = Date.now();

      console.log(`Cache timestamp: ${new Date(timestamp).toISOString()}, now: ${new Date(now).toISOString()}`);
      console.log(`Cache age: ${(now - timestamp) / 1000 / 60} minutes, expiry: ${CACHE_EXPIRY_TIME / 1000 / 60} minutes`);

      // Force re-generation for all cache entries without proper language field
      if (!cachedData.language) {
        console.log(`Cache has no language field for ${cacheKey}, treating as cache miss`);
        return null;
      }

      // Check if this is a pre-cached entry (has expiresAt field)
      if (cachedData.preCached && cachedData.expiresAt) {
        const expiresAt = new Date(cachedData.expiresAt).getTime();
        if (now < expiresAt && cachedData.language === locale) {
          console.log(`✅ Pre-cache HIT for ${cacheKey}, expires: ${cachedData.expiresAt}`);
          const analysisData = cachedData.analysis;
          analysisData.language = cachedData.language;
          return analysisData;
        } else {
          console.log(`Pre-cache expired for ${cacheKey}, expiresAt: ${cachedData.expiresAt}`);
          return null;
        }
      }

      // Check if cache is still valid (not expired) and language matches (regular cache)
      if (now - timestamp < CACHE_EXPIRY_TIME && cachedData.language === locale) {
        console.log(`Cache hit for ${cacheKey}, language match, returning cached data`);
        // Attach the language to the analysis object for later checking
        const analysisData = cachedData.analysis;
        analysisData.language = cachedData.language;
        return analysisData;
      } else {
        console.log(`Cache expired for ${cacheKey}, will update cache`);
        return null;
      }
    }
    console.log(`Cache miss for ${cacheKey}`);
    return null;
  } catch (error) {
    console.error("Error checking cache:", error);
    console.error(error.stack);
    return null;
  }
}

// Function to save analysis to cache
async function saveAnalysisToCache(sport, team1Id, team2Id, analysis, locale = 'en') {
  try {
    // Ensure consistent data types for IDs (convert to strings)
    const team1IdStr = String(team1Id);
    const team2IdStr = String(team2Id);

    // Create a consistent cache key
    const teams = [team1IdStr, team2IdStr].sort().join('-');
    const cacheKey = `${sport.toLowerCase()}_${teams}_${locale}`;

    console.log(`Saving to cache with key: ${cacheKey}, team1Id: ${team1IdStr}, team2Id: ${team2IdStr}`);

    // Prepare data for cache including timestamp and language
    const cacheData = {
      analysis,
      timestamp: new Date().toISOString(), // Store as ISO string for consistent parsing
      sport: sport.toLowerCase(), // Normalize sport name
      team1Id: team1IdStr,
      team2Id: team2IdStr,
      language: locale // Track the language of this analysis
    };

    console.log('Saving cache data:', JSON.stringify({
      sport: cacheData.sport,
      team1Id: cacheData.team1Id,
      team2Id: cacheData.team2Id,
      timestamp: cacheData.timestamp,
      hasAnalysis: !!cacheData.analysis
    }));

    await db.collection('matchAnalysisCache').doc(cacheKey).set(cacheData);
    console.log(`Saved analysis to cache for ${cacheKey}`);

    // Verify the data was saved correctly by reading it back
    const savedDoc = await db.collection('matchAnalysisCache').doc(cacheKey).get();
    if (savedDoc.exists) {
      console.log(`Cache verification - data saved successfully for ${cacheKey}`);
      console.log('Saved cache data:', JSON.stringify({
        sport: savedDoc.data().sport,
        team1Id: savedDoc.data().team1Id,
        team2Id: savedDoc.data().team2Id,
        hasAnalysis: !!savedDoc.data().analysis,
        timestamp: savedDoc.data().timestamp
      }));
    } else {
      console.error(`Cache verification failed - data not found for ${cacheKey} after saving`);
    }
  } catch (error) {
    console.error("Error saving to cache:", error);
    console.error(error.stack);
  }
}

// Helper function to try to retrieve from cache immediately after saving
async function verifyCacheRetrieval(sport, team1Id, team2Id, locale = 'en') {
  try {
    console.log(`Verifying cache retrieval for ${sport}, team1Id: ${team1Id}, team2Id: ${team2Id}`);
    const cachedAnalysis = await checkCacheForMatch(sport, team1Id, team2Id, locale);
    if (cachedAnalysis) {
      console.log('Cache retrieval verification succeeded');
      return true;
    } else {
      console.error('Cache retrieval verification failed - data could not be retrieved');
      return false;
    }
  } catch (error) {
    console.error('Error verifying cache retrieval:', error);
    return false;
  }
}

// Function to get odds data for tennis matches
async function getTennisOddsData(player1Id, player2Id, player1Name, player2Name) {
  try {
    const API_KEY = TENNIS_API_KEY;

    // Get fixture data using the shared helper function
    const fixtureData = await getTennisFixtures(player1Id, player2Id);

    if (!fixtureData.fixture) {
      console.log('No tennis fixture found for the players');
      return {
        oddsData: [],
        keyInsights: {
          confidence: "",
          marketActivity: "",
          lineShift: "",
          publicVsSharps: {
            public: 0,
            sharps: 0
          },
          bettingSignal: ""
        }
      };
    }

    const eventKey = fixtureData.fixture.event_key;
    console.log(`Found tennis fixture with event_key: ${eventKey}`);

    // Get odds data for the fixture
    const oddsResponse = await axios.get(`https://api.api-tennis.com/tennis/`, {
      params: {
        method: 'get_odds',
        APIkey: API_KEY,
        match_key: eventKey
      }
    });

    if (!oddsResponse.data.success || !oddsResponse.data.result) {
      console.log('Failed to fetch odds data for tennis fixture');
      return {
        oddsData: [],
        keyInsights: {
          confidence: "",
          marketActivity: "",
          lineShift: "",
          publicVsSharps: {
            public: 0,
            sharps: 0
          },
          bettingSignal: ""
        }
      };
    }

    const rawOddsData = oddsResponse.data.result[eventKey];

    // Get the Home/Away odds
    const homeAwayOdds = rawOddsData["Home/Away"];
    if (!homeAwayOdds) {
      console.log('No Home/Away odds data found');
      return {
        oddsData: rawOddsData,
        keyInsights: {
          confidence: "Low",
          marketActivity: "Low",
          lineShift: "Low",
          publicVsSharps: {
            public: 50,
            sharps: 50
          },
          bettingSignal: "Conflicted"
        }
      };
    }

    // Calculate key insights
    const keyInsights = getKeyInsightsFromTennisOdds(homeAwayOdds);

    return {
      oddsData: rawOddsData,
      keyInsights: keyInsights,
      fixtureData: fixtureData.fixture
    };
  } catch (error) {
    console.error('Error fetching tennis odds data:', error);
    return {
      oddsData: [],
      keyInsights: {
        confidence: "",
        marketActivity: "",
        lineShift: "",
        publicVsSharps: {
          public: 0,
          sharps: 0
        },
        bettingSignal: ""
      },
      error: error.message
    };
  }
}

// Helper function to calculate key insights from tennis odds
function getKeyInsightsFromTennisOdds(odds) {
  if (!odds || !odds.Home || !odds.Away) {
    return {
      confidence: "Low",
      marketActivity: "Low",
      lineShift: "Low",
      publicVsSharps: {
        public: 50,
        sharps: 50
      },
      bettingSignal: "Conflicted"
    };
  }

  const parseOdds = obj => Object.values(obj).map(val => parseFloat(val)).filter(Boolean);
  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const range = arr => Math.max(...arr) - Math.min(...arr);

  const homeOddsArr = parseOdds(odds.Home);
  const awayOddsArr = parseOdds(odds.Away);

  const avgHome = avg(homeOddsArr);
  const avgAway = avg(awayOddsArr);

  const impliedHome = 1 / avgHome;
  const impliedAway = 1 / avgAway;

  const total = impliedHome + impliedAway;

  const publicPercent = Math.round((impliedHome / total) * 100);
  const sharpsPercent = 100 - publicPercent;

  const volatility = Math.max(range(homeOddsArr), range(awayOddsArr));
  const oddsGap = Math.abs(avgHome - avgAway);

  // Determine confidence based on odds gap and volatility
  let confidence;
  if (volatility < 0.2) {
    confidence = "High";
  } else if (volatility < 0.4) {
    confidence = "Medium";
  } else {
    confidence = "Low";
  }

  // Determine market activity based on number of bookmakers
  const marketActivity = homeOddsArr.length >= 10 ? "High" : homeOddsArr.length >= 5 ? "Moderate" : "Low";

  // Determine line shift based on volatility
  const lineShift = volatility < 0.15 ? "Low" : volatility < 0.3 ? "Medium" : "High";

  // Determine betting signal
  let bettingSignal;
  if (confidence === "High" && lineShift === "Low") {
    bettingSignal = "Value Bet";
  } else if (confidence === "Medium" && lineShift === "High") {
    bettingSignal = "Sharp Trap";
  } else if (confidence === "Low" && marketActivity === "High") {
    bettingSignal = "Public Trap";
  } else {
    bettingSignal = "Conflicted";
  }

  return {
    confidence,
    marketActivity,
    lineShift,
    publicVsSharps: {
      public: publicPercent,
      sharps: sharpsPercent
    },
    bettingSignal
  };
}

// Function to get head-to-head data and last games for tennis players
async function getTennisHeadToHead(player1Id, player2Id) {
  try {
    const API_KEY = TENNIS_API_KEY;
    console.log(`Fetching tennis H2H data for players ${player1Id} and ${player2Id}`);

    // First try with player1 as first player
    let response = await axios.get(`https://api.api-tennis.com/tennis/`, {
      params: {
        method: 'get_H2H',
        APIkey: API_KEY,
        first_player_key: player1Id,
        second_player_key: player2Id
      }
    });

    // If the first request doesn't return both player results, try reversed order
    if (!response.data.success ||
        !response.data.result ||
        !response.data.result.firstPlayerResults ||
        !response.data.result.secondPlayerResults) {

      console.log('First H2H attempt failed or incomplete, trying reversed player order');
      response = await axios.get(`https://api.api-tennis.com/tennis/`, {
        params: {
          method: 'get_H2H',
          APIkey: API_KEY,
          first_player_key: player2Id,
          second_player_key: player1Id
        }
      });

      // If still no data, return empty results
      if (!response.data.success ||
          !response.data.result ||
          !response.data.result.firstPlayerResults ||
          !response.data.result.secondPlayerResults) {
        console.log('Both H2H attempts failed, returning empty results');
        return {
          player1LastGames: { winLossRecord: { record: "0-0", pattern: "No recent games" }, last10Games: [] },
          player2LastGames: { winLossRecord: { record: "0-0", pattern: "No recent games" }, last10Games: [] },
          h2h: { h2hGames: [], h2hRecord: { record: "0-0", pattern: "No H2H games" } },
          upcomingGame: null
        };
      }

      // Swap player IDs since we've reversed the order in the API call
      [player1Id, player2Id] = [player2Id, player1Id];
    }

    const h2hData = response.data.result;

    // 1. Process direct H2H games
    const h2hGames = h2hData.H2H || [];

    // Calculate H2H record from player1's perspective
    let player1Wins = 0;
    let player2Wins = 0;

    // Create an array to store the results (W/L) from player1's perspective
    const h2hResults = h2hGames
      .filter(game => game.event_status === "Finished")
      .map(game => {
        let isPlayer1Win = false;

        // Check if player1 is the winner
        if ((game.first_player_key == player1Id && game.event_winner === "First Player") ||
            (game.second_player_key == player1Id && game.event_winner === "Second Player")) {
          isPlayer1Win = true;
          player1Wins++;
        } else {
          player2Wins++;
        }

        return isPlayer1Win ? 'W' : 'L';
      });

    // 2. Process player1's last games
    const player1Games = (h2hData.firstPlayerResults || [])
      .filter(game => game.event_status === "Finished")
      .slice(0, 10);

    // Get upcoming game using the fixtures API
    const fixtureData = await getTennisFixtures(player1Id, player2Id);
    const upcomingGame = fixtureData.fixture;

    // Calculate player1's wins and losses
    const player1Results = player1Games.map(game => {
      // Check if player1 is first or second player
      const isFirstPlayer = game.first_player_key == player1Id;
      const isWinner = (isFirstPlayer && game.event_winner === "First Player") ||
                       (!isFirstPlayer && game.event_winner === "Second Player");

      return isWinner ? 'W' : 'L';
    }).slice(0, 6); // Take only last 6 for pattern

    const player1Wins10 = player1Results.filter(result => result === 'W').length;
    const player1Losses10 = player1Results.filter(result => result === 'L').length;

    // 3. Process player2's last games
    const player2Games = (h2hData.secondPlayerResults || [])
      .filter(game => game.event_status === "Finished")
      .slice(0, 10);

    // Calculate player2's wins and losses
    const player2Results = player2Games.map(game => {
      // Check if player2 is first or second player
      const isFirstPlayer = game.first_player_key == player2Id;
      const isWinner = (isFirstPlayer && game.event_winner === "First Player") ||
                       (!isFirstPlayer && game.event_winner === "Second Player");

      return isWinner ? 'W' : 'L';
    }).slice(0, 6); // Take only last 6 for pattern

    const player2Wins10 = player2Results.filter(result => result === 'W').length;
    const player2Losses10 = player2Results.filter(result => result === 'L').length;

    // Create the return object in the expected format
    return {
      player1LastGames: {
        winLossRecord: {
          record: `${player1Wins10}-${player1Losses10}`,
          pattern: `(${player1Results.join('-')})`
        },
        last10Games: player1Games
      },
      player2LastGames: {
        winLossRecord: {
          record: `${player2Wins10}-${player2Losses10}`,
          pattern: `(${player2Results.join('-')})`
        },
        last10Games: player2Games
      },
      h2h: {
        h2hGames: h2hGames,
        h2hRecord: {
          record: `${player1Wins}-${player2Wins}`,
          pattern: h2hResults.length > 0 ? `(${h2hResults.join('-')})` : "No H2H games"
        }
      },
      upcomingGame: upcomingGame
    };

  } catch (error) {
    console.error('Error fetching tennis H2H data:', error);
    // Return a default structure in case of error
    return {
      player1LastGames: { winLossRecord: { record: "0-0", pattern: "Error" }, last10Games: [] },
      player2LastGames: { winLossRecord: { record: "0-0", pattern: "Error" }, last10Games: [] },
      h2h: { h2hGames: [], h2hRecord: { record: "0-0", pattern: "Error" } },
      upcomingGame: null,
      error: error.message
    };
  }
}

// Helper function to get tennis fixtures for players
async function getTennisFixtures(player1Id, player2Id) {
  try {
    const API_KEY = TENNIS_API_KEY;

    // Get current date and date 10 days ahead for search window
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 10);

    const dateStart = today.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    const dateStop = futureDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD

    console.log(`Searching for tennis fixtures between ${dateStart} and ${dateStop} for players ${player1Id} and ${player2Id}`);

    // Try to find fixtures for player1
    let fixtureResponse = await axios.get(`https://api.api-tennis.com/tennis/`, {
      params: {
        method: 'get_fixtures',
        APIkey: API_KEY,
        date_start: dateStart,
        date_stop: dateStop,
        player_key: player1Id
      }
    });

    let fixtures = fixtureResponse.data.result || [];

    // If no fixtures found for player1 or we don't find a match with both players, try player2
    let fixtures2 = [];
    if ((!fixtures || fixtures.length === 0 || !fixtures.some(f =>
        (f.first_player_key == player1Id && f.second_player_key == player2Id) ||
        (f.first_player_key == player2Id && f.second_player_key == player1Id))) && player2Id) {

      console.log(`No fixtures with both players found for player1 (ID: ${player1Id}), trying player2 (ID: ${player2Id})`);
      const response2 = await axios.get(`https://api.api-tennis.com/tennis/`, {
        params: {
          method: 'get_fixtures',
          APIkey: API_KEY,
          date_start: dateStart,
          date_stop: dateStop,
          player_key: player2Id
        }
      });

      fixtures2 = response2.data.result || [];
    }

    // Combine fixtures from both API calls and deduplicate by event_key
    const allFixtures = [...fixtures, ...fixtures2];
    const uniqueFixtures = Array.from(
      new Map(allFixtures.map(item => [item.event_key, item])).values()
    );

    // Find a fixture that contains both players
    const targetFixture = uniqueFixtures.find(fixture =>
      (fixture.first_player_key == player1Id && fixture.second_player_key == player2Id) ||
      (fixture.first_player_key == player2Id && fixture.second_player_key == player1Id)
    );

    if (targetFixture) {
      console.log(`Found tennis fixture with event_key: ${targetFixture.event_key}`);
      return {
        fixture: targetFixture,
        error: null
      };
    }

    console.log('No fixture with both players found');
    return {
      fixture: null,
      fixtures: uniqueFixtures, // Return all fixtures just in case we need them
      error: null
    };

  } catch (error) {
    console.error('Error fetching tennis fixtures:', error);
    return {
      fixture: null,
      fixtures: [],
      error: error.message
    };
  }
}



// Replace pubsub scheduled function with HTTP endpoint
exports.cleanupCache = functions.https.onRequest(async (req, res) => {
  try {
    // Check for API key in headers
    const apiKey = req.headers['x-api-key'];
    const EXTERNAL_API_KEY = process.env.BET_AI_API_KEY;

    if (!apiKey || apiKey !== EXTERNAL_API_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    const now = Date.now();
    const expiredCacheRef = db.collection('matchAnalysisCache');

    // Get all cache entries
    let query = expiredCacheRef;

    // If forceAll parameter is true, delete all entries regardless of expiry
    const forceAll = req.query.forceAll === 'true';
    if (!forceAll) {
      query = query.where('timestamp', '<', new Date(now - CACHE_EXPIRY_TIME));
    }

    const expiredCacheDocs = await query.get();

    if (expiredCacheDocs.empty) {
      console.log('No cache entries to clean up');
      return res.status(200).json({
        success: true,
        message: 'No cache entries to clean up',
        forceAll: forceAll
      });
    }

    // Delete cache entries
    const batch = db.batch();
    let deleteCount = 0;
    const deletedEntries = [];

    expiredCacheDocs.forEach(doc => {
      const data = doc.data();
      deletedEntries.push({
        sport: data.sport,
        team1Id: data.team1Id,
        team2Id: data.team2Id,
        timestamp: data.timestamp
      });
      batch.delete(doc.ref);
      deleteCount++;
    });

    await batch.commit();
    console.log(`Deleted ${deleteCount} cache entries`);

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${deleteCount} cache entries`,
      forceAll: forceAll,
      deletedCount: deleteCount,
      deletedEntries: deletedEntries
    });
  } catch (error) {
    console.error('Error cleaning up cache:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to clean up cache',
      details: error.message
    });
  }
});

//For populating MMA fighters data and soccer teams data

exports.populateMmaFighters = functions.https.onRequest(async (req, res) => {
  try {
    const API_KEY = API_SPORTS_KEY;
    const categories = [
      "Bantamweight",
      "Catch Weight",
      "Catchweight",
      "Featherweight",
      "Flyweight",
      "Heavyweight",
      "Light Heavyweight",
      "Lightweight",
      "Middleweight",
      "Open Weight",
      "Strawweight",
      "Super Heavyweight",
      "Welterweight",
      "Women's Bantamweight",
      "Women's Catch Weight",
      "Women's Featherweight",
      "Women's Flyweight",
      "Women's Lightweight",
      "Women's Strawweight"
    ];

    console.log("Starting to fetch MMA fighter data for all categories");
    let allFighters = [];

    // Process each category sequentially to avoid rate limiting
    for (const category of categories) {
      console.log(`Fetching fighters for category: ${category}`);

      try {
        const response = await axios.get(`https://v1.mma.api-sports.io/fighters`, {
          params: { category: category },
          headers: {
            "x-apisports-key": API_KEY
          }
        });

        if (response.data.errors && Object.keys(response.data.errors).length > 0) {
          console.error(`Error fetching fighters for category ${category}:`, response.data.errors);
          continue; // Skip to next category on error
        }

        const fighters = response.data.response || [];
        console.log(`Found ${fighters.length} fighters in category ${category}`);

        // Extract only the required fields
        const filteredFighters = fighters.map(fighter => ({
          id: fighter.id,
          name: fighter.name,
          nickname: fighter.nickname,
          birth_date: fighter.birth_date,
          age: fighter.age,
          height: fighter.height,
          weight: fighter.weight,
          reach: fighter.reach,
          stance: fighter.stance,
          category: fighter.category
        }));

        allFighters = [...allFighters, ...filteredFighters];

        // Add a small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing category ${category}:`, error.message);
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', error.response.data);
        }
      }
    }

    console.log(`Total fighters collected: ${allFighters.length}`);

    // Write to the JSON file
    const filePath = path.join(__dirname, 'mma_fighters.json');
    fs.writeFileSync(filePath, JSON.stringify(allFighters, null, 2));

    res.status(200).json({
      success: true,
      message: `Successfully collected data for ${allFighters.length} fighters across ${categories.length} categories`,
      fightersPerCategory: categories.map(category => ({
        category,
        count: allFighters.filter(f => f.category === category).length
      }))
    });
  } catch (error) {
    console.error("Error populating MMA fighters data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to populate MMA fighters data",
      error: error.message
    });
  }
});

exports.populateSoccerTeams = functions.https.onRequest(async (req, res) => {
  try {
    const API_KEY = API_SPORTS_KEY;
    const leagues = [61, 140, 71, 135, 78, 94, 88, 5, 15];
    const season = "2024";

    console.log("Starting to fetch soccer team data for all leagues");
    let allTeams = [];

    // Process each league sequentially to avoid rate limiting
    for (const league of leagues) {
      console.log(`Fetching teams for league: ${league}`);

      try {
        const response = await axios.get(`https://v3.football.api-sports.io/teams`, {
          params: {
            league: league.toString(),
            season: season
          },
          headers: {
            "x-apisports-key": API_KEY
          }
        });

        if (response.data.errors && Object.keys(response.data.errors).length > 0) {
          console.error(`Error fetching teams for league ${league}:`, response.data.errors);
          continue; // Skip to next league on error
        }

        const teams = response.data.response || [];
        console.log(`Found ${teams.length} teams in league ${league}`);

        // Extract only the required fields
        const filteredTeams = teams.map(item => ({
          id: item.team.id,
          name: item.team.name,
          code: item.team.code,
          country: item.team.country,
          logo: item.team.logo,
          venue_name: item.venue.name,
          city: item.venue.city,
          address: item.venue.address
        }));

        allTeams = [...allTeams, ...filteredTeams];

        // Add a small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing league ${league}:`, error.message);
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', error.response.data);
        }
      }
    }

    console.log(`Total teams collected: ${allTeams.length}`);

    // Read existing teams file if it exists
    let existingTeams = [];
    const filePath = path.join(__dirname, 'soccer_teams.json');

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        existingTeams = JSON.parse(fileContent);
        console.log(`Read ${existingTeams.length} existing teams from file`);
      } catch (readError) {
        console.error('Error reading existing teams file:', readError);
        // Continue with empty existing teams array
      }
    }

    // Merge new teams with existing ones, avoiding duplicates by ID
    const existingIds = new Set(existingTeams.map(team => team.id));
    const newTeams = allTeams.filter(team => !existingIds.has(team.id));
    const mergedTeams = [...existingTeams, ...newTeams];

    // Write to the JSON file
    fs.writeFileSync(filePath, JSON.stringify(mergedTeams, null, 2));

    res.status(200).json({
      success: true,
      message: `Successfully collected data for ${allTeams.length} teams across ${leagues.length} leagues`,
      newTeamsAdded: newTeams.length,
      totalTeams: mergedTeams.length,
      teamsPerLeague: leagues.map(league => ({
        league,
        count: allTeams.filter(t => t.league === league).length || 'N/A'
      }))
    });
  } catch (error) {
    console.error("Error populating soccer teams data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to populate soccer teams data",
      error: error.message
    });
  }
});

exports.populateTennisPlayers = functions.https.onRequest(async (req, res) => {
  try {
    const API_KEY = TENNIS_API_KEY; // Using the TENNIS_API_KEY defined at the top
    // const tournamentKeys = [2155, 2156, 2157, 2281, 2283, 2159, 2282, 2284, 2158]; // Tournament keys to fetch players from

    const tournamentKeys = [2157, 2281]; // Tournament keys to fetch players from
    const tennisApiBaseUrl = "https://api.api-tennis.com/tennis/";

    console.log("Starting to fetch tennis player data for specified tournaments");
    let allPlayersFetchedThisRun = [];
    let playersPerTournamentData = [];

    for (const tournamentKey of tournamentKeys) {
      console.log(`Fetching players for tournament key: ${tournamentKey}`);
      let playersFromThisTournament = [];
      try {
        const response = await axios.get(tennisApiBaseUrl, {
          params: {
            method: 'get_players',
            APIkey: API_KEY,
            tournament_key: tournamentKey
          }
        });

        if (response.data.success === 1 && response.data.result) {
          const fetchedPlayers = response.data.result;
          console.log(`Found ${fetchedPlayers.length} players in tournament ${tournamentKey}`);

          const mappedPlayers = fetchedPlayers.map(player => ({
            id: player.player_key,
            name: player.player_full_name,
            nickname: player.player_name, // player_name seems to be the shorter/nickname
            country: player.player_country
          }));
          playersFromThisTournament = mappedPlayers;
          allPlayersFetchedThisRun.push(...mappedPlayers);
        } else {
          console.error(`Error or no data fetching players for tournament ${tournamentKey}:`, response.data.error || 'No result array or success not 1');
        }
      } catch (error) {
        console.error(`Error processing tournament ${tournamentKey}:`, error.message);
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', error.response.data);
        }
      }
      playersPerTournamentData.push({ tournamentKey: tournamentKey, playersFetched: playersFromThisTournament.length });
      // Add a small delay to avoid hitting rate limits if more tournaments were added
      if (tournamentKeys.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`Total players fetched across all tournaments this run: ${allPlayersFetchedThisRun.length}`);

    let existingPlayers = [];
    const filePath = path.join(__dirname, 'tennis_players.json');

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        existingPlayers = JSON.parse(fileContent);
        console.log(`Read ${existingPlayers.length} existing players from tennis_players.json`);
      } catch (readError) {
        console.error('Error reading tennis_players.json:', readError);
        // Continue with empty existingPlayers array, or could return error
      }
    }

    const existingPlayerIds = new Set(existingPlayers.map(player => player.id));
    const newUniquePlayers = allPlayersFetchedThisRun.filter(player => !existingPlayerIds.has(player.id));

    // Ensure all newUniquePlayers also don't have duplicate IDs amongst themselves from different tournament pulls if any
    const uniqueNewPlayerIds = new Set();
    const trulyNewPlayers = [];
    for (const player of newUniquePlayers) {
        if (!uniqueNewPlayerIds.has(player.id)) {
            trulyNewPlayers.push(player);
            uniqueNewPlayerIds.add(player.id);
        }
    }

    const mergedPlayers = [...existingPlayers, ...trulyNewPlayers];

    fs.writeFileSync(filePath, JSON.stringify(mergedPlayers, null, 2));
    console.log(`Wrote ${mergedPlayers.length} players to tennis_players.json. Added ${trulyNewPlayers.length} new players.`);

    res.status(200).json({
      success: true,
      message: `Successfully processed tennis players for ${tournamentKeys.length} tournaments. Fetched ${allPlayersFetchedThisRun.length} players in total (before de-duplication with existing file). Added ${trulyNewPlayers.length} new players to the file.`,
      newPlayersAddedToFile: trulyNewPlayers.length,
      totalPlayersInFile: mergedPlayers.length,
      playersFetchedThisRunCount: allPlayersFetchedThisRun.length,
      details: playersPerTournamentData
    });

  } catch (error) {
    console.error("Error in populateTennisPlayers function:", error);
    res.status(500).json({
      success: false,
      message: "Failed to populate tennis players data",
      error: error.message
    });
  }
});

// API endpoint for saving external analysis data
exports.saveExternalAnalysis = functions.https.onRequest(async (req, res) => {
  try {
    // Check for API key in headers
    const apiKey = req.headers['x-api-key'];
    const EXTERNAL_API_KEY = process.env.BET_AI_API_KEY;

    if (!apiKey || apiKey !== EXTERNAL_API_KEY) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - Invalid API key'
      });
    }

    const analysisData = req.body;

    // Validate required fields
    if (!analysisData.sport || !analysisData.teams || !analysisData.teams.home || !analysisData.teams.away) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sport, teams.home, teams.away'
      });
    }

    // Validate sport is one of the supported types
    const supportedSports = ['nba', 'mlb', 'nfl', 'ncaaf', 'soccer', 'mma', 'tennis'];
    if (!supportedSports.includes(analysisData.sport.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid sport. Must be one of: ${supportedSports.join(', ')}`
      });
    }

    // Get team IDs and sport type using the existing findTeamIds function
    const teamInfo = await findTeamIds(
      analysisData.sport,
      analysisData.teams.home,
      '', // team1Code - not provided in this case
      analysisData.teams.away,
      ''  // team2Code - not provided in this case
    );

    // Handle case where teams weren't found
    if (!teamInfo.team1Id || !teamInfo.team2Id) {
      return res.status(400).json({
        success: false,
        error: `Could not find team IDs for the provided teams in ${analysisData.sport}. Please verify team names and sport.`,
        details: {
          sport: analysisData.sport,
          team1: analysisData.teams.home,
          team2: analysisData.teams.away
        }
      });
    }

    // Check if analysis already exists in cache - with 'en' locale to match app's cache key
    const existingAnalysisEn = await checkCacheForMatch(analysisData.sport, teamInfo.team1Id, teamInfo.team2Id, 'en');

    // Use language from payload or fallback to English
    await saveAnalysisToCache(analysisData.sport, teamInfo.team1Id, teamInfo.team2Id, analysisData, analysisData.language || 'en');

    // Only verify the English cache save to keep things simple
    const verified = await verifyCacheRetrieval(analysisData.sport, teamInfo.team1Id, teamInfo.team2Id, 'en');

    if (!verified) {
      return res.status(500).json({
        success: false,
        error: 'Failed to verify cache save'
      });
    }

    res.status(200).json({
      success: true,
      message: existingAnalysisEn ? 'Analysis data updated successfully' : 'Analysis data saved successfully',
      replaced: !!existingAnalysisEn,
      team1Id: teamInfo.team1Id,
      team2Id: teamInfo.team2Id,
      sport: analysisData.sport
    });

  } catch (error) {
    console.error('Error saving external analysis:', error);

    // Handle specific error cases
    if (error.message && error.message.includes('team1StatpalCode is not defined')) {
      return res.status(400).json({
        success: false,
        error: 'Sport mismatch or invalid teams',
        details: 'The provided teams were not found in the specified sport. Please verify the sport and team names match.',
        providedData: {
          sport: req.body.sport,
          team1: req.body.teams?.home,
          team2: req.body.teams?.away
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});


// ====================================================================
// MARKET INTELLIGENCE & TEAM STATS ENDPOINT - PRODUCTION READY
// ====================================================================

exports.marketIntelligence = functions.https.onRequest(async (req, res) => {
  // Add CORS headers for testing
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    console.log('📊 MARKET INTELLIGENCE FUNCTION CALLED');
    const { sport, team1, team2, team1_code, team2_code, locale } = req.body;

    // Default to 'en' if locale not provided
    const userLocale = locale || 'en';

    if (!sport || !team1 || !team2) {
      return res.status(400).json({
        error: "Missing required fields: sport, team1, team2"
      });
    }

    console.log(`Product Update Test - Processing ${sport}: ${team1} vs ${team2}`);

    // Normalize sport name for internal functions (they expect 'nfl' not 'americanfootball_nfl')
    const normalizedSport = sport.replace('americanfootball_', '').replace('basketball_', '').replace('baseball_', '');
    console.log(`SPORT NORMALIZATION: '${sport}' → '${normalizedSport}'`);

    // Get team IDs (reuse existing function) - use normalized sport
    const { team1Id, team2Id, team1StatpalCode, team2StatpalCode, sport_type_odds } = await findTeamIds(normalizedSport, team1, team1_code, team2, team2_code);

    if (!team1Id || !team2Id) {
      return res.status(400).json({
        error: "Could not find team IDs for the provided teams"
      });
    }

    // Check if we have pre-cached analysis for this match (for replay content)
    const cachedAnalysis = await checkCacheForMatch(normalizedSport, team1Id, team2Id, userLocale);

    if (cachedAnalysis && cachedAnalysis.marketIntelligence) {
      console.log(`📦 Cache HIT for marketIntelligence: ${normalizedSport} ${team1Id} vs ${team2Id}`);

      // Fetch fresh team stats, player stats, and game data (these don't go stale like odds)
      const [teamStats, playerStats, gameData] = await Promise.all([
        getTeamStatsDataTest(normalizedSport, team1Id, team2Id),
        getPlayerStatsForSport(normalizedSport, team1Id, team2Id),
        getGameData(normalizedSport, team1Id, team2Id, team1_code, team2_code, team1StatpalCode, team2StatpalCode)
      ]);

      // Use cached market intelligence but fresh stats
      // IMPORTANT: Reformat cached marketIntelligence to match expected structure
      const cachedMI = cachedAnalysis.marketIntelligence || {};
      const response = {
        sport,
        teams: {
          home: team1,
          away: team2,
          logos: { home: "", away: "" }
        },
        // Reformat to match the structure the frontend expects (flatten evAnalysis)
        marketIntelligence: {
          bestLines: cachedMI.bestLines || null,
          sharpMeter: cachedMI.sharpMeter || null,
          vigAnalysis: cachedMI.vigAnalysis || cachedMI.evAnalysis?.vigAnalysis || null,
          evOpportunities: cachedMI.evOpportunities || cachedMI.evAnalysis?.uiOpportunities || null,
          fairValue: cachedMI.fairValue || cachedMI.evAnalysis?.fairValue || null,
          sharpConsensus: cachedMI.sharpConsensus || cachedMI.evAnalysis?.sharpConsensus || null,
          marketTightness: cachedMI.marketTightness || null,
          oddsTable: cachedMI.oddsTable || null,
          error: cachedMI.error || null,
          availableEvents: cachedMI.availableEvents || null
        },
        teamStats: enhanceTeamStatsWithGameData(teamStats, gameData),
        playerStats,
        gameData,
        keyInsightsNew: cachedAnalysis.keyInsightsNew || calculateKeyInsightsNew(
          cachedMI,
          enhanceTeamStatsWithGameData(teamStats, gameData),
          team1,
          team2,
          sport
        ),
        timestamp: new Date().toISOString(),
        teamIds: { team1Id, team2Id },
        fromCache: true // Flag to indicate this used cached market data
      };

      return res.status(200).json(response);
    }

    console.log(`📡 Cache MISS for marketIntelligence: ${normalizedSport} ${team1Id} vs ${team2Id} - fetching live`);

    // No cache hit - fetch everything fresh from APIs
    const [marketIntelligence, teamStats, playerStats, gameData] = await Promise.all([
      getMarketIntelligenceDataTest(sport_type_odds, team1, team2, userLocale),
      getTeamStatsDataTest(normalizedSport, team1Id, team2Id),
      getPlayerStatsForSport(normalizedSport, team1Id, team2Id),
      getGameData(normalizedSport, team1Id, team2Id, team1_code, team2_code, team1StatpalCode, team2StatpalCode) // Use normalized sport name
    ]);

    // CRITICAL: Match analyzeImage structure EXACTLY
    const response = {
      sport,
      teams: {
        home: team1,
        away: team2,
        logos: {
          home: "", // TODO: Add team logos if available
          away: ""
        }
      },
      // Market Intelligence data (same nesting level as keyInsights, matchSnapshot in analyzeImage)
      marketIntelligence: {
        bestLines: marketIntelligence.bestLines || null,
        sharpMeter: marketIntelligence.sharpMeter || null,
        // Handle both flattened (soccer) and nested (NFL) structures
        vigAnalysis: marketIntelligence.vigAnalysis || marketIntelligence.evAnalysis?.vigAnalysis || null,
        evOpportunities: marketIntelligence.evOpportunities || marketIntelligence.evAnalysis?.uiOpportunities || null,
        fairValue: marketIntelligence.fairValue || marketIntelligence.evAnalysis?.fairValue || null,
        sharpConsensus: marketIntelligence.sharpConsensus || marketIntelligence.evAnalysis?.sharpConsensus || null,
        marketTightness: marketIntelligence.marketTightness || null,
        oddsTable: marketIntelligence.oddsTable || null,
        error: marketIntelligence.error || null,
        availableEvents: marketIntelligence.availableEvents || null
      },
      // Team Stats data with calculated metrics from game data
      teamStats: enhanceTeamStatsWithGameData(teamStats, gameData),
      // Player Stats data
      playerStats,
      // Game Data (last10Games for PPG, home/away, recent form)
      gameData,
      // NEW: Key Insights V2
      keyInsightsNew: calculateKeyInsightsNew(
        {
          bestLines: marketIntelligence.bestLines,
          evOpportunities: marketIntelligence.evOpportunities || marketIntelligence.evAnalysis?.uiOpportunities,
        },
        enhanceTeamStatsWithGameData(teamStats, gameData),
        team1,
        team2,
        sport
      ),
      // Metadata (same as analyzeImage)
      timestamp: new Date().toISOString(),
      teamIds: { team1Id, team2Id }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error("Product Update Test Error:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
      stack: error.stack
    });
  }
});

// Market Intelligence Test Function - Route to sport-specific functions
async function getMarketIntelligenceDataTest(sport, team1, team2, locale = 'en') {
  try {
    // Route to sport-specific market intelligence functions
    if (sport.includes('soccer')) {
      return await getSoccerMarketIntelligenceTest(sport, team1, team2, locale);
    } else {
      // Use existing 2-way betting logic for NFL, NBA, MLB, etc.
      return await getTwoWayMarketIntelligenceTest(sport, team1, team2);
    }
  } catch (error) {
    console.error("Market Intelligence Error:", error);
    return {
      error: error.message,
      stack: error.stack
    };
  }
}

// Original 2-way betting market intelligence (NFL, NBA, MLB)
async function getTwoWayMarketIntelligenceTest(sport, team1, team2) {
  try {
    const BASE_URL = `https://api.the-odds-api.com/v4/sports/${sport}`;

    console.log(`Fetching 2-way events from: ${BASE_URL}/events`);
    console.log(`Searching for: "${team1}" vs "${team2}"`);

    // Get events
    const eventsResponse = await axios.get(`${BASE_URL}/events?apiKey=${ODDS_API_KEY}`);
    const events = eventsResponse.data;

    console.log(`Found ${events.length} events for ${sport}`);
    console.log('Available events:', events.slice(0, 5).map(e => `${e.home_team} vs ${e.away_team}`));

    const event = events.find(e => fuzzyMatchTeam(e, team1, team2));
    if (!event) {
      console.error(`❌ EVENT NOT FOUND for "${team1}" vs "${team2}"`);
      return {
        error: "Event not found",
        availableEvents: events.slice(0, 3).map(e => ({ home: e.home_team, away: e.away_team }))
      };
    }

    console.log(`Found matching event: ${event.home_team} vs ${event.away_team}`);

    // Get odds with multiple markets
    const oddsUrl = `${BASE_URL}/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&bookmakers=pinnacle,lowvig,betonlineag,draftkings,fanduel,betmgm,williamhill_us,betrivers,bovada,betus,mybookieag,fanatics,ballybet,espnbet,hardrockbet`;

    console.log(`Fetching odds from: ${oddsUrl}`);

    const oddsResponse = await axios.get(oddsUrl);
    const bookmakers = oddsResponse.data.bookmakers || [];

    console.log(`Found ${bookmakers.length} bookmakers with odds`);

    if (bookmakers.length === 0) {
      return { error: "No bookmaker data available" };
    }

    // Calculate all the market intelligence metrics
    const [bestLines, lineMovement, sharpMeter, marketTightness] = await Promise.all([
      Promise.resolve(calculateBestLinesTest(bookmakers, event)),
      calculateLineMovementTest(sport, event.id, event),
      Promise.resolve(calculateSharpMeterTest(bookmakers, event)),
      Promise.resolve(calculateMarketTightnessTest(bookmakers))
    ]);

    const marketData = {
      bestLines,
      lineMovement,
      sharpMeter,
      marketTightness,
      evAnalysis: calculateEVOpportunities(bookmakers, event),
      oddsTable: formatOddsTableTest(bookmakers, event),
      rawBookmakerCount: bookmakers.length,
      event: {
        id: event.id,
        home_team: event.home_team,
        away_team: event.away_team,
        commence_time: event.commence_time
      }
    };

    return marketData;

  } catch (error) {
    console.error("2-Way Market Intelligence Error:", error);
    return {
      error: error.message,
      stack: error.stack
    };
  }
}

// Soccer-specific market intelligence (3-way betting)
async function getSoccerMarketIntelligenceTest(sport, team1, team2, locale = 'en') {
  try {
    const BASE_URL = `https://api.the-odds-api.com/v4/sports/${sport}`;

    console.log(`Fetching soccer events from: ${BASE_URL}/events`);

    // Get events
    const eventsResponse = await axios.get(`${BASE_URL}/events?apiKey=${ODDS_API_KEY}`);
    const events = eventsResponse.data;

    console.log(`Found ${events.length} soccer events`);

    const event = events.find(e => fuzzyMatchTeam(e, team1, team2));
    if (!event) {
      // If not found in current league, try Champions League
      if (!sport.includes('uefa_champs_league')) {
        console.log('Event not found in current league, trying Champions League...');
        return await getSoccerMarketIntelligenceTest('soccer_uefa_champs_league', team1, team2, locale);
      }

      return {
        error: "Soccer event not found",
        availableEvents: events.slice(0, 3).map(e => ({ home: e.home_team, away: e.away_team }))
      };
    }

    console.log(`Found matching soccer event: ${event.home_team} vs ${event.away_team}`);

    // Get odds - soccer uses different markets
    const oddsUrl = `${BASE_URL}/events/${event.id}/odds?apiKey=${ODDS_API_KEY}&regions=us,uk&markets=h2h&bookmakers=pinnacle,draftkings,fanduel,betmgm,williamhill_us,betrivers,bovada,betus,mybookieag,fanatics,ballybet,espnbet,hardrockbet`;

    console.log(`Fetching soccer odds from: ${oddsUrl}`);

    const oddsResponse = await axios.get(oddsUrl);
    const bookmakers = oddsResponse.data.bookmakers || [];

    console.log(`Found ${bookmakers.length} soccer bookmakers with odds`);

    if (bookmakers.length === 0) {
      return { error: "No soccer bookmaker data available" };
    }

    // Use soccer-specific calculations
    const bestLines = calculateSoccerBestLines(bookmakers, event, locale);
    const evAnalysis = calculateSoccerEVOpportunities(bookmakers, event, locale);

    console.log("Soccer EV Analysis Result:", JSON.stringify(evAnalysis, null, 2));

    const marketData = {
      bestLines,
      sharpMeter: calculateSoccerSharpMeter(bookmakers, event, locale),
      // Flatten the EV analysis to match NFL structure
      ...evAnalysis,
      marketTightness: {
        tightness: translate('normal', locale),
        pointRange: 0,
        priceRange: 0.2,
        comment: translate('soccerMarketAnalysis', locale),
        summary: `${translate('normal', locale)} • ${translate('soccerMarket3Way', locale)}`
      },
      oddsTable: formatSoccerOddsTable(bookmakers, event),
      rawBookmakerCount: bookmakers.length,
      event: {
        id: event.id,
        home_team: event.home_team,
        away_team: event.away_team,
        commence_time: event.commence_time
      }
    };

    console.log("Final Soccer Market Data Keys:", Object.keys(marketData));
    console.log("Final Soccer Market Data vigAnalysis:", marketData.vigAnalysis);
    console.log("Final Soccer Market Data fairValue:", marketData.fairValue);

    return marketData;

  } catch (error) {
    console.error("Soccer Market Intelligence Error:", error);
    return {
      error: error.message,
      stack: error.stack
    };
  }
}

// ACTUAL FORMULAS IMPLEMENTATION
function calculateBestLinesTest(bookmakers, event) {
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

  // FORMULA 1: Calculate consensus spread point (median)
  const homeSpreadPoints = spreads.filter(s => s.isHome).map(s => s.point);
  const consensusSpreadPoint = homeSpreadPoints.length > 0 ?
    homeSpreadPoints.sort((a, b) => a - b)[Math.floor(homeSpreadPoints.length / 2)] : 0;

  // FORMULA 2: Calculate consensus total (median)
  const totalPoints = totals.filter(t => t.type === "Over").map(t => t.point);
  const consensusTotal = totalPoints.length > 0 ?
    totalPoints.sort((a, b) => a - b)[Math.floor(totalPoints.length / 2)] : 0;

  // FORMULA 3: Calculate consensus moneylines (median)
  const homeMoneylineOdds = moneylines.filter(m => m.isHome).map(m => m.price);
  const awayMoneylineOdds = moneylines.filter(m => !m.isHome).map(m => m.price);
  const consensusHomeML = homeMoneylineOdds.length > 0 ?
    homeMoneylineOdds.sort((a, b) => a - b)[Math.floor(homeMoneylineOdds.length / 2)] : 0;
  const consensusAwayML = awayMoneylineOdds.length > 0 ?
    awayMoneylineOdds.sort((a, b) => a - b)[Math.floor(awayMoneylineOdds.length / 2)] : 0;

  // FORMULA 4: Find best spread lines (prioritize point first, then price)
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

  // FORMULA 4: Find best moneylines
  const bestHomeMl = moneylines
    .filter(m => m.isHome)
    .sort((a, b) => a.price < 0 ? b.price - a.price : a.price - b.price)[0];

  const bestAwayMl = moneylines
    .filter(m => !m.isHome)
    .sort((a, b) => a.price < 0 ? b.price - a.price : a.price - b.price)[0];

  // FORMULA 5: Find best totals (Over/Under with best odds)
  const bestOver = totals
    .filter(t => t.type === "Over")
    .sort((a, b) => b.price - a.price)[0]; // Higher odds = better

  const bestUnder = totals
    .filter(t => t.type === "Under")
    .sort((a, b) => b.price - a.price)[0]; // Higher odds = better

  return {
    consensusSpreadPoint,
    consensusTotal,
    consensusHomeML,
    consensusAwayML,
    bestLines: [
      bestHomeMl && {
        type: "moneyline",
        label: "Best Home ML",
        odds: bestHomeMl.price,
        bookmaker: bestHomeMl.bookmaker,
        team: bestHomeMl.team
      },
      bestAwayMl && {
        type: "moneyline",
        label: "Best Away ML",
        odds: bestAwayMl.price,
        bookmaker: bestAwayMl.bookmaker,
        team: bestAwayMl.team
      },
      favoriteSpread && {
        type: "spread",
        label: "Best Favorite Spread",
        line: favoriteSpread.point,
        odds: favoriteSpread.price,
        bookmaker: favoriteSpread.bookmaker,
        team: favoriteSpread.team
      },
      underdogSpread && {
        type: "spread",
        label: "Best Underdog Spread",
        line: underdogSpread.point,
        odds: underdogSpread.price,
        bookmaker: underdogSpread.bookmaker,
        team: underdogSpread.team
      },
      bestOver && {
        type: "total",
        label: "Best Over",
        line: bestOver.point,
        odds: bestOver.price,
        bookmaker: bestOver.bookmaker,
        team: `Over ${bestOver.point}`
      },
      bestUnder && {
        type: "total",
        label: "Best Under",
        line: bestUnder.point,
        odds: bestUnder.price,
        bookmaker: bestUnder.bookmaker,
        team: `Under ${bestUnder.point}`
      }
    ].filter(Boolean),
    rawData: {
      totalSpreads: spreads.length,
      totalMoneylines: moneylines.length,
      totalTotals: totals.length
    }
  };
}

async function calculateLineMovementTest(sport, eventId, event) {
  let historicalUrl = ""; // Define at function scope

  try {
    // Calculate historical date based on game date, not current date
    const gameDate = new Date(event.commence_time);
    const now = new Date();

    // If game is in future, we can't get historical data from before it was posted
    if (gameDate > now) {
      return {
        error: "Cannot get historical data for future games",
        note: "Game hasn't started yet, odds history not available",
        gameDate: event.commence_time,
        currentDate: now.toISOString()
      };
    }

    // For past games, get data from 1 day before game date
    const historicalDate = new Date(gameDate);
    historicalDate.setDate(historicalDate.getDate() - 1);
    const historicalDateStr = historicalDate.toISOString();

    console.log(`Fetching historical odds for ${eventId} from ${historicalDateStr}`);

    historicalUrl = `https://api.the-odds-api.com/v4/historical/sports/${sport}/events/${eventId}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&date=${historicalDateStr}`;

    console.log(`Historical URL: ${historicalUrl}`);

    const historicalResponse = await axios.get(historicalUrl);
    const historicalData = historicalResponse.data;

    console.log("Historical API response structure:", JSON.stringify(historicalData, null, 2));

    // Historical endpoint returns single event data, not array
    if (!historicalData || !historicalData.data || !historicalData.data.bookmakers) {
      return {
        error: "No historical data available for this event",
        note: "Event may be too recent or not available 7 days ago",
        apiResponse: historicalData
      };
    }

    const historicalBookmakers = historicalData.data.bookmakers;

    // Calculate historical consensus
    const historicalSpreads = [];
    const historicalMoneylines = [];
    const historicalTotals = [];

    historicalBookmakers.forEach(bookmaker => {
      bookmaker.markets.forEach(market => {
        if (market.key === 'spreads') {
          const homeLine = market.outcomes.find(o => o.name === event.home_team);
          if (homeLine) historicalSpreads.push(homeLine.point);
        }
        if (market.key === 'h2h') {
          const homeLine = market.outcomes.find(o => o.name === event.home_team);
          if (homeLine) historicalMoneylines.push(homeLine.price);
        }
        if (market.key === 'totals') {
          const overLine = market.outcomes.find(o => o.name === "Over");
          if (overLine) historicalTotals.push(overLine.point);
        }
      });
    });

    // Calculate opening consensus (median of historical lines)
    const openingSpread = historicalSpreads.length > 0 ?
      historicalSpreads.sort((a, b) => a - b)[Math.floor(historicalSpreads.length / 2)] : null;

    const openingMl = historicalMoneylines.length > 0 ?
      historicalMoneylines.sort((a, b) => a - b)[Math.floor(historicalMoneylines.length / 2)] : null;

    const openingTotal = historicalTotals.length > 0 ?
      historicalTotals.sort((a, b) => a - b)[Math.floor(historicalTotals.length / 2)] : null;

    // Get current consensus (would be calculated in main function)
    // For now, return the historical vs current structure
    return {
      historical: {
        spread: openingSpread,
        moneyline: openingMl,
        total: openingTotal,
        date: historicalDateStr,
        bookmakerCount: historicalBookmakers.length
      },
      note: "Historical data successfully retrieved - can calculate real movement",
      success: true
    };

  } catch (error) {
    console.error("Historical odds error:", error);

    let errorDetails = error.message;
    if (error.response) {
      console.error("Error response status:", error.response.status);
      console.error("Error response data:", error.response.data);
      errorDetails = `Status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
    }

    return {
      error: "Failed to fetch historical odds",
      details: errorDetails,
      endpoint: historicalUrl,
      eventId: eventId,
      sport: sport
    };
  }
}

function calculateSharpMeterTest(bookmakers, event) {
  const sharpBooks = ['pinnacle', 'lowvig', 'betonlineag']; // Updated to actual available books
  const publicBooks = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'betrivers', 'bovada', 'betus', 'mybookieag', 'fanatics', 'ballybet', 'espnbet', 'hardrockbet'];

  const sharpSpreads = [];
  const publicSpreads = [];
  const sharpVigs = [];
  const publicVigs = [];

  bookmakers.forEach(bookmaker => {
    const isSharp = sharpBooks.includes(bookmaker.key);
    const isPublic = publicBooks.includes(bookmaker.key);

    // Get spread data
    const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
    const moneylineMarket = bookmaker.markets.find(m => m.key === 'h2h');

    if (spreadMarket) {
      const homeLine = spreadMarket.outcomes.find(o => o.name === event.home_team);
      if (homeLine) {
        if (isSharp) sharpSpreads.push(homeLine.point);
        if (isPublic) publicSpreads.push(homeLine.point);
      }
    }

    // Calculate vig for this bookmaker
    if (moneylineMarket && moneylineMarket.outcomes.length === 2) {
      const homeOdds = moneylineMarket.outcomes.find(o => o.name === event.home_team)?.price;
      const awayOdds = moneylineMarket.outcomes.find(o => o.name === event.away_team)?.price;

      if (homeOdds && awayOdds) {
        const vig = calculateMarketVig(homeOdds, awayOdds);
        if (isSharp) sharpVigs.push(vig);
        if (isPublic) publicVigs.push(vig);
      }
    }
  });

  // Signal 1: Point Gap Analysis (Primary)
  const avgSharpSpread = sharpSpreads.length > 0 ?
    sharpSpreads.reduce((a, b) => a + b, 0) / sharpSpreads.length : 0;

  const avgPublicSpread = publicSpreads.length > 0 ?
    publicSpreads.reduce((a, b) => a + b, 0) / publicSpreads.length : 0;

  const pointGap = avgSharpSpread - avgPublicSpread;

  // Signal 2: Vig Confidence Analysis
  const avgSharpVig = sharpVigs.length > 0 ?
    sharpVigs.reduce((a, b) => a + b, 0) / sharpVigs.length : 0;

  const avgPublicVig = publicVigs.length > 0 ?
    publicVigs.reduce((a, b) => a + b, 0) / publicVigs.length : 0;

  const vigGap = avgPublicVig - avgSharpVig;

  // Step 5: Generate display text (NEW FORMAT - 3 sentences)
  let line1 = "No clear sharp lean";
  let line2 = "Limited data";
  let line3 = "No comparison available";

  if (pointGap !== 0) { // Use pointGap instead of null check since we have defaults
    // Line 1: Primary signal
    if (Math.abs(pointGap) < 0.3) {
      line1 = "No clear sharp lean";
    } else if (pointGap > 0) {
      line1 = "Sharps Lean Dog";
  } else {
      line1 = "Sharps Lean Favorite";
  }

    // Line 2: Secondary signal (vig confidence) - Remove brackets as requested
  if (vigGap > 1.0) {
      line2 = "Market uncertainty";
    } else if (vigGap < -1.0) {
      line2 = "Sharp confidence";
  } else {
      line2 = `${Math.abs(pointGap).toFixed(1)} point edge`;
    }

    // Line 3: Detail line
    line3 = `Sharp avg ${avgSharpSpread.toFixed(1)} vs public ${avgPublicSpread.toFixed(1)}`;
  }

  // Step 6: Calculate gauge value (0-100)
  let gaugeValue = 50; // Default neutral
  if (pointGap !== 0) {
    // Scale: 1 point gap = 20 gauge points
    gaugeValue = 50 + (pointGap * 20);
    gaugeValue = Math.max(0, Math.min(100, gaugeValue));
  }

  // Step 7: Determine confidence level and gauge label
  let confidenceLevel = "low";
  let gaugeLabel = "LOW";

  if (sharpSpreads.length >= 2 && publicSpreads.length >= 2) {
    confidenceLevel = "high";
    gaugeLabel = "HIGH";
  } else if (sharpSpreads.length >= 1 && publicSpreads.length >= 1) {
    confidenceLevel = "medium";
    gaugeLabel = "MED";
  }

  return {
    // Display text (3 sentences) - NEW FORMAT
    line1,
    line2,
    line3,

    // Gauge data
    gaugeValue: Math.round(gaugeValue),
    gaugeLabel,

    // Backend calculation data
    pointGap: Math.round(pointGap * 10) / 10,
    avgSharpSpread: Math.round(avgSharpSpread * 10) / 10,
    avgPublicSpread: Math.round(avgPublicSpread * 10) / 10,
    avgSharpVig: Math.round(avgSharpVig * 10) / 10,
    avgPublicVig: Math.round(avgPublicVig * 10) / 10,
    vigGap: Math.round(vigGap * 10) / 10,
    confidenceLevel,
    dataQuality: confidenceLevel === "high" ? "excellent" :
                 confidenceLevel === "medium" ? "good" : "limited",

    // Metadata
    sharpBookCount: sharpSpreads.length,
    publicBookCount: publicSpreads.length
  };
}

function calculateMarketTightnessTest(bookmakers) {
  // Analyze all 3 markets separately, then take the loosest
  const markets = {
    spread: { points: [], prices: [] },
    moneyline: { homeOdds: [], awayOdds: [] },
    total: { points: [], prices: [] }
  };

  bookmakers.forEach(bookmaker => {
    bookmaker.markets.forEach(market => {
      if (market.key === 'spreads') {
        market.outcomes.forEach(outcome => {
          if (outcome.point < 0) { // Favorite lines only
            markets.spread.points.push(Math.abs(outcome.point));
            markets.spread.prices.push(outcome.price);
          }
        });
      }

      if (market.key === 'h2h') {
        market.outcomes.forEach(outcome => {
          if (outcome.name === bookmaker.markets.find(m => m.key === 'spreads')?.outcomes?.find(o => o.point < 0)?.name) {
            markets.moneyline.homeOdds.push(outcome.price); // Favorite ML
          }
        });
      }

      if (market.key === 'totals') {
        const overOutcome = market.outcomes.find(o => o.name === "Over");
        if (overOutcome) {
          markets.total.points.push(overOutcome.point);
          markets.total.prices.push(overOutcome.price);
        }
      }
    });
  });

  // Calculate tightness for each market
  const spreadTightness = calculateSingleMarketTightness(markets.spread.points, markets.spread.prices, "Spread");
  const moneylineTightness = calculateSingleMarketTightness([], markets.moneyline.homeOdds, "Moneyline");
  const totalTightness = calculateSingleMarketTightness(markets.total.points, markets.total.prices, "Total");

  // Take the LOOSEST market as overall tightness
  const allTightness = [spreadTightness, moneylineTightness, totalTightness]
    .filter(t => t.valid)
    .sort((a, b) => getTightnessScore(b.tightness) - getTightnessScore(a.tightness));

  const overall = allTightness[0] || spreadTightness;

  return {
    tightness: overall.tightness,
    pointRange: overall.pointRange,
    priceRange: overall.priceRange,
    comment: overall.comment,
    summary: `${overall.tightness} • ${overall.market} market • point range ${overall.pointRange.toFixed(1)} • price range ${overall.priceRange.toFixed(0)}¢`,
    marketBreakdown: {
      spread: spreadTightness,
      moneyline: moneylineTightness,
      total: totalTightness
    }
  };
}

function calculateSingleMarketTightness(points, prices, marketName) {
  const pointRange = points.length > 0 ?
    Math.max(...points) - Math.min(...points) : 0;

  const priceRange = prices.length > 0 ?
    Math.max(...prices) - Math.min(...prices) : 0;

  let tightness;
  let comment;

  // MUCH STRICTER rules - Tight should be REALLY tight so we always have something to show
  if (pointRange <= 0.25 && priceRange <= 5) {
    tightness = "Tight";
    comment = "Books agree, edges harder to find.";
  } else if (pointRange <= 0.75 && priceRange <= 12) {
    tightness = "Normal";
    comment = "Some disagreement, shopping can help.";
  } else {
    tightness = "Loose";
    comment = "Big disagreement, high value in line-shopping.";
  }

  return {
    market: marketName,
    tightness,
    pointRange: Math.round(pointRange * 10) / 10,
    priceRange: Math.round(priceRange),
    comment,
    valid: points.length > 0 || prices.length > 0
  };
}

function getTightnessScore(tightness) {
  const scores = { "Tight": 1, "Normal": 2, "Loose": 3 };
  return scores[tightness] || 1;
}

function formatOddsTableTest(bookmakers, event) {
  // Define sharp and public bookmakers (same as other functions)
  const sharpBooks = ['pinnacle', 'lowvig', 'betonlineag'];
  const publicBooks = ['draftkings', 'fanduel', 'betmgm', 'betrivers', 'williamhill_us', 'bovada', 'betus'];

  // Separate and select bookmakers: 1-3 sharps + 2-3 public (max 5 total)
  const sharpBookmakers = bookmakers.filter(b => sharpBooks.includes(b.key));
  const publicBookmakers = bookmakers.filter(b => publicBooks.includes(b.key));

  const selectedBookmakers = [
    ...sharpBookmakers.slice(0, 2), // Max 2 sharp books
    ...publicBookmakers.slice(0, 3)  // Max 3 public books
  ];

  console.log(`ODDS TABLE: Selected ${selectedBookmakers.length} bookmakers:`,
    selectedBookmakers.map(b => `${b.title} (${sharpBooks.includes(b.key) ? 'Sharp' : 'Public'})`));

  // Extract odds using EXACT same pattern as calculateBestLinesTest
  return selectedBookmakers.map(bookmaker => {
    const oddsData = {
    bookmaker: bookmaker.title,
    bookmakerKey: bookmaker.key,
      isSharp: sharpBooks.includes(bookmaker.key),
      odds: {}
    };

    // Extract odds (same logic as other functions)
    bookmaker.markets.forEach(market => {
      if (market.key === 'h2h') {
        const homeOutcome = market.outcomes.find(o => o.name === event.home_team);
        const awayOutcome = market.outcomes.find(o => o.name === event.away_team);

        if (homeOutcome && awayOutcome) {
          oddsData.odds.moneyline = {
            home: homeOutcome.price,
            away: awayOutcome.price
          };
        }
      }

      if (market.key === 'spreads') {
        const homeOutcome = market.outcomes.find(o => o.name === event.home_team);
        const awayOutcome = market.outcomes.find(o => o.name === event.away_team);

        if (homeOutcome && awayOutcome) {
          oddsData.odds.spread = {
            home: { point: homeOutcome.point, price: homeOutcome.price },
            away: { point: awayOutcome.point, price: awayOutcome.price }
          };
        }
      }

      if (market.key === 'totals') {
        const overOutcome = market.outcomes.find(o => o.name === "Over");
        const underOutcome = market.outcomes.find(o => o.name === "Under");

        if (overOutcome && underOutcome) {
          oddsData.odds.total = {
            over: { point: overOutcome.point, price: overOutcome.price },
            under: { point: underOutcome.point, price: underOutcome.price }
          };
        }
      }
    });

    return oddsData;
  }).filter(bookmaker =>
    // Only include bookmakers with complete data
    bookmaker.odds.moneyline && bookmaker.odds.moneyline.home && bookmaker.odds.moneyline.away
  );
}

// ====================================================================
// PLAYER STATISTICS TEST FUNCTIONS
// ====================================================================

async function getPlayerStatsDataTest(sport, team1Id, team2Id) {
  try {
    console.log(`Fetching player stats for ${sport} - Team1: ${team1Id}, Team2: ${team2Id}`);

    const [team1Players, team2Players] = await Promise.all([
      getTeamPlayerStatsTest(sport, team1Id),
      getTeamPlayerStatsTest(sport, team2Id)
    ]);

    return {
      team1: {
        teamId: team1Id,
        allPlayers: team1Players.players || [],
        topPlayers: getTop3PlayersTest(team1Players.players || [], sport),
        playerCount: (team1Players.players || []).length,
        error: team1Players.error
      },
      team2: {
        teamId: team2Id,
        allPlayers: team2Players.players || [],
        topPlayers: getTop3PlayersTest(team2Players.players || [], sport),
        playerCount: (team2Players.players || []).length,
        error: team2Players.error
      }
    };

  } catch (error) {
    console.error("Player Stats Error:", error);
    return { error: error.message };
  }
}

async function getTeamPlayerStatsTest(sport, teamId) {
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
        // Dynamically determine the league based on team's country
        const leagueId = getSoccerLeagueForTeam(teamId);
        apiUrl = `https://v3.football.api-sports.io/players/statistics?season=${currentSeason}&team=${teamId}&league=${leagueId}`;
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

function getTop3PlayersTest(players, sport) {
  if (!players || players.length === 0) return [];

  switch (sport.toLowerCase()) {
    case 'nba':
      return players
        .filter(p => p.statistics && p.statistics.points && p.statistics.points.average > 5) // Minimum threshold
        .sort((a, b) => (b.statistics.points.average || 0) - (a.statistics.points.average || 0))
        .slice(0, 10);

    case 'nfl':
    case 'ncaaf':
      // Get top player from each key position
      const qb = players
        .filter(p => p.player && p.player.position === 'QB')
        .sort((a, b) => (b.statistics?.passing?.yards || 0) - (a.statistics?.passing?.yards || 0))[0];

      const rb = players
        .filter(p => p.player && p.player.position === 'RB')
        .sort((a, b) => (b.statistics?.rushing?.yards || 0) - (a.statistics?.rushing?.yards || 0))[0];

      const wr = players
        .filter(p => p.player && p.player.position === 'WR')
        .sort((a, b) => (b.statistics?.receiving?.yards || 0) - (a.statistics?.receiving?.yards || 0))[0];

      return [qb, rb, wr].filter(Boolean);

    case 'mlb':
      return players
        .filter(p => p.statistics && p.statistics.batting && (p.statistics.batting.at_bats || 0) > 50)
        .sort((a, b) => {
          const aOPS = (a.statistics.batting.on_base_percentage || 0) + (a.statistics.batting.slugging_percentage || 0);
          const bOPS = (b.statistics.batting.on_base_percentage || 0) + (b.statistics.batting.slugging_percentage || 0);
          return bOPS - aOPS;
        })
        .slice(0, 10);

    case 'soccer':
      return players
        .filter(p => p.statistics && p.statistics[0] && (p.statistics[0].games?.appearences || 0) > 5)
        .sort((a, b) => {
          const aContrib = (a.statistics[0].goals?.total || 0) + (a.statistics[0].goals?.assists || 0);
          const bContrib = (b.statistics[0].goals?.total || 0) + (b.statistics[0].goals?.assists || 0);
          return bContrib - aContrib;
        })
        .slice(0, 10);

    default:
      return players.slice(0, 10);
  }
}

// ====================================================================
// TEAM STATISTICS TEST FUNCTIONS
// ====================================================================

async function getTeamStatsDataTest(sport, team1Id, team2Id) {
  try {
    console.log(`Fetching team stats for ${sport} - Team1: ${team1Id}, Team2: ${team2Id}`);

    const [team1Stats, team2Stats] = await Promise.all([
      getSingleTeamStatsTest(sport, team1Id),
      getSingleTeamStatsTest(sport, team2Id)
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

// Helper function to get the primary league ID for a soccer team based on country
function getSoccerLeagueForTeam(teamId) {
  try {
    const soccerTeamsPath = path.join(__dirname, 'soccer_teams.json');
    const soccerTeamsData = fs.readFileSync(soccerTeamsPath, 'utf8');
    const soccerTeams = JSON.parse(soccerTeamsData);

    const team = soccerTeams.find(t => t.id === parseInt(teamId));
    if (!team) {
      console.log(`Team ${teamId} not found in soccer_teams.json, defaulting to EPL (39)`);
      return 39; // Default to EPL
    }

    // Map country to primary league ID
    const leagueMap = {
      'England': 39,      // Premier League
      'Spain': 140,       // La Liga
      'Germany': 78,      // Bundesliga
      'Italy': 135,       // Serie A
      'France': 61,       // Ligue 1
      'Portugal': 94,     // Primeira Liga
      'Netherlands': 88,  // Eredivisie
      'Belgium': 144,     // Jupiler Pro League
      'Turkey': 203,      // Super Lig
      'Brazil': 71,       // Serie A (Brazil)
      'Argentina': 128,   // Liga Profesional
      'USA': 253,         // MLS
      'Mexico': 262       // Liga MX
    };

    const leagueId = leagueMap[team.country] || 39;
    console.log(`Team ${team.name} (${team.country}) → League ${leagueId}`);
    return leagueId;
  } catch (error) {
    console.error('Error getting league for team:', error);
    return 39; // Default to EPL on error
  }
}

async function getSingleTeamStatsTest(sport, teamId) {
  try {
    const sportLower = sport.toLowerCase();
    const currentSeason = sportLower === 'nba' ? 2024 : 2025; // Use 2024 for NBA, 2025 for others
    let apiUrl;

    // Handle NFL/NCAAF
    if (sportLower.includes('nfl') || sportLower === 'ncaaf') {
      // NFL uses StatPal API for comprehensive team stats
      return await getStatPalTeamStatsTest(teamId);
    }

    // Handle MLB
    if (sportLower === 'mlb') {
      // MLB uses StatPal API for comprehensive team stats
      return await getStatPalMLBTeamStatsTest(teamId);
    }

    // Handle Soccer (all variants: soccer, soccer_epl, soccer_uefa, etc.)
    if (sportLower.startsWith('soccer') || sportLower.includes('football')) {
      // Dynamically determine the league based on team's country
      const leagueId = getSoccerLeagueForTeam(teamId);
      apiUrl = `https://v3.football.api-sports.io/teams/statistics?season=${currentSeason}&team=${teamId}&league=${leagueId}`;
    } else if (sportLower === 'nba') {
      // Based on official API-Sports.io documentation - correct parameters
      apiUrl = `https://v2.nba.api-sports.io/teams/statistics?season=${currentSeason}&id=${teamId}`;
    } else {
      return { stats: null, error: `Team stats not supported for ${sport}` };
    }

    console.log(`Fetching team stats from: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: sport.toLowerCase() === 'nba' ? {
        "x-rapidapi-host": "v2.nba.api-sports.io",
        "x-rapidapi-key": API_SPORTS_KEY
      } : {
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

    let stats = response.data.response[0] || response.data.response;
    console.log(`Found team stats for team ${teamId}`);

    // Transform NBA stats to match expected structure
    if (sportLower === 'nba' && stats) {
      stats = transformNBATeamStats(stats);
    }

    return { stats, error: null };

  } catch (error) {
    console.error(`Error fetching team stats for team ${teamId}:`, error);
    return { stats: null, error: error.message };
  }
}

// Transform NBA Team Stats to structured format for UI
function transformNBATeamStats(nbaStats) {
  const games = nbaStats.games || 1;

  return {
    team: nbaStats.team,

    // Core Stats (already calculated per game by API)
    points: nbaStats.points || 0,
    fgp: parseFloat(nbaStats.fgp || 0),
    tpp: parseFloat(nbaStats.tpp || 0),
    ftp: parseFloat(nbaStats.ftp || 0),

    // Rebounds
    totReb: nbaStats.totReb || 0,
    offReb: nbaStats.offReb || 0,
    defReb: nbaStats.defReb || 0,

    // Assists and other stats
    assists: nbaStats.assists || 0,
    steals: nbaStats.steals || 0,
    blocks: nbaStats.blocks || 0,
    turnovers: nbaStats.turnovers || 0,
    pFouls: nbaStats.pFouls || 0,
    plusMinus: nbaStats.plusMinus || 0,

    // Calculated metrics (return as numbers, not strings)
    calculated: {
      reboundsPerGame: games > 0 ? parseFloat((nbaStats.totReb / games).toFixed(1)) : 0,
      assistsPerGame: games > 0 ? parseFloat((nbaStats.assists / games).toFixed(1)) : 0,
      stealsPerGame: games > 0 ? parseFloat((nbaStats.steals / games).toFixed(1)) : 0,
      blocksPerGame: games > 0 ? parseFloat((nbaStats.blocks / games).toFixed(1)) : 0,
      turnoversPerGame: games > 0 ? parseFloat((nbaStats.turnovers / games).toFixed(1)) : 0,
      turnoverDifferential: games > 0 ? parseFloat(((nbaStats.steals - nbaStats.turnovers) / games).toFixed(1)) : 0,
      offRebPerGame: games > 0 ? parseFloat((nbaStats.offReb / games).toFixed(1)) : 0,
      defRebPerGame: games > 0 ? parseFloat((nbaStats.defReb / games).toFixed(1)) : 0,
      foulsPerGame: games > 0 ? parseFloat((nbaStats.pFouls / games).toFixed(1)) : 0
    },

    games: games
  };
}

// StatPal NFL Team Statistics Function
async function getStatPalTeamStatsTest(teamId) {
  try {
    // Need to convert team ID to team code for StatPal
    const teamCode = await getTeamCodeForStatPal(teamId);
    if (!teamCode) {
      return { stats: null, error: "Could not find team code for StatPal API" };
    }

    const apiUrl = `https://statpal.io/api/v1/nfl/team-stats/${teamCode}?access_key=${STATPAL_API_KEY}`;

    console.log(`Fetching NFL team stats from StatPal: ${apiUrl} for team code: ${teamCode}`);

    const response = await axios.get(apiUrl);

    if (response.status !== 200) {
      return { stats: null, error: `StatPal API returned status ${response.status}` };
    }

    console.log(`StatPal API response structure for team code ${teamCode}:`, JSON.stringify({
      hasData: !!response.data,
      hasStatistics: !!response.data?.statistics,
      dataKeys: response.data ? Object.keys(response.data) : [],
      responsePreview: response.data ? JSON.stringify(response.data).substring(0, 500) : 'no data'
    }));

    if (!response.data || !response.data.statistics) {
      console.error(`StatPal missing statistics field. Full response:`, JSON.stringify(response.data).substring(0, 1000));
      return { stats: null, error: "No statistics data in StatPal response" };
    }

    const stats = response.data.statistics;
    console.log(`Found StatPal team stats for team code ${teamCode}`);

    // Transform StatPal data to structured format
    const transformedStats = transformStatPalData(stats);

    return { stats: transformedStats, error: null };

  } catch (error) {
    console.error(`Error fetching StatPal team stats for team ${teamId}:`, error);
    return { stats: null, error: error.message };
  }
}

// Helper function to get team code for StatPal API
async function getTeamCodeForStatPal(teamId) {
  try {
    // Read NFL teams file to get StatPal code
    const fs = require('fs');
    const path = require('path');
    const teamsFile = path.join(__dirname, 'nfl_teams.json');

    if (!fs.existsSync(teamsFile)) {
      console.error('NFL teams file not found');
      return null;
    }

    const teams = JSON.parse(fs.readFileSync(teamsFile, 'utf8'));
    const team = teams.find(t => t.id === parseInt(teamId));

    if (!team || !team.statpal_code) {
      console.error(`No StatPal code found for team ID ${teamId}`);
      return null;
    }

    return team.statpal_code.toLowerCase();
  } catch (error) {
    console.error('Error getting team code for StatPal:', error);
    return null;
  }
}

// Transform StatPal data to structured format for UI
function transformStatPalData(statpalStats) {
  const categories = statpalStats.category || [];

  // Find specific categories
  const passing = categories.find(c => c.name === "Passing");
  const rushing = categories.find(c => c.name === "Rushing");
  const downs = categories.find(c => c.name === "Downs");
  const kicking = categories.find(c => c.name === "Kicking");

  return {
    team: statpalStats.team,
    season: statpalStats.season,

    // Offensive Stats
    offense: {
      passing: {
        yardsPerGame: parseFloat(passing?.team?.yards_per_game || 0),
        totalYards: parseInt(passing?.team?.yards || 0),
        touchdowns: parseInt(passing?.team?.passing_touchdowns || 0),
        completions: parseInt(passing?.team?.completions || 0),
        attempts: parseInt(passing?.team?.passing_attempts || 0),
        completionPct: parseFloat(passing?.team?.completion_pct || 0),
        interceptions: parseInt(passing?.team?.interceptions || 0),
        sacks: parseInt(passing?.team?.sacks || 0),
        sackedYards: parseInt(passing?.team?.sacked_yards_lost || 0)
      },
      rushing: {
        yardsPerGame: parseFloat(rushing?.team?.yards_per_game || 0),
        totalYards: parseInt(rushing?.team?.yards || 0),
        touchdowns: parseInt(rushing?.team?.rushing_touchdowns || 0),
        attempts: parseInt(rushing?.team?.rushing_attempts || 0),
        yardsPerRush: parseFloat(rushing?.team?.yards_per_rush_avg || 0),
        fumbles: parseInt(rushing?.team?.fumbles || 0),
        fumblesLost: parseInt(rushing?.team?.fumbles_lost || 0)
      },
      efficiency: {
        thirdDownPct: parseFloat(downs?.team?.third_downs_pct || 0),
        fourthDownPct: parseFloat(downs?.team?.fourth_downs_pct || 0),
        totalFirstDowns: parseInt(downs?.team?.total_first_downs || 0),
        penaltyYards: parseInt(downs?.team?.penalties_yards || 0),
        penalties: parseInt(downs?.team?.penalties || 0)
      }
    },

    // Defensive Stats
    defense: {
      passing: {
        yardsAllowedPerGame: parseFloat(passing?.opponents?.yards_per_game || 0),
        touchdownsAllowed: parseInt(passing?.opponents?.passing_touchdowns || 0),
        interceptions: parseInt(passing?.opponents?.interceptions || 0),
        sacks: parseInt(passing?.opponents?.sacks || 0)
      },
      rushing: {
        yardsAllowedPerGame: parseFloat(rushing?.opponents?.yards_per_game || 0),
        touchdownsAllowed: parseInt(rushing?.opponents?.rushing_touchdowns || 0),
        fumblesRecovered: parseInt(rushing?.opponents?.fumbles_lost || 0)
      }
    },

    // Special Teams
    specialTeams: {
      fieldGoals: {
        made: parseInt(kicking?.team?.field_goals_made || 0),
        attempts: parseInt(kicking?.team?.field_goals_attempts || 0),
        percentage: kicking?.team?.field_goals_made && kicking?.team?.field_goals_attempts ?
          (parseInt(kicking.team.field_goals_made) / parseInt(kicking.team.field_goals_attempts) * 100).toFixed(1) : 0
      }
    },

    // Calculated Metrics
    calculated: {
      totalYardsPerGame: (parseFloat(passing?.team?.yards_per_game || 0) + parseFloat(rushing?.team?.yards_per_game || 0)),
      turnoverDifferential: (parseInt(passing?.opponents?.interceptions || 0) + parseInt(rushing?.opponents?.fumbles_lost || 0)) -
                           (parseInt(passing?.team?.interceptions || 0) + parseInt(rushing?.team?.fumbles_lost || 0))
    }
  };
}

// StatPal MLB Team Statistics Function
async function getStatPalMLBTeamStatsTest(teamId) {
  try {
    // Need to convert team ID to team code for StatPal
    const teamCode = await getMLBTeamCodeForStatPal(teamId);
    if (!teamCode) {
      return { stats: null, error: "Could not find team code for StatPal MLB API" };
    }

    const apiUrl = `https://statpal.io/api/v1/mlb/team-stats/${teamCode}?access_key=${STATPAL_API_KEY}`;

    console.log(`Fetching MLB team stats from StatPal: ${apiUrl}`);

    const response = await axios.get(apiUrl);

    if (response.status !== 200) {
      return { stats: null, error: `StatPal MLB API returned status ${response.status}` };
    }

    if (!response.data || !response.data.statistics) {
      return { stats: null, error: "No statistics data in StatPal MLB response" };
    }

    const stats = response.data.statistics;
    console.log(`Found StatPal MLB team stats for team code ${teamCode}`);

    // Transform StatPal MLB data to structured format
    const transformedStats = transformStatPalMLBData(stats);

    return { stats: transformedStats, error: null };

  } catch (error) {
    console.error(`Error fetching StatPal MLB team stats for team ${teamId}:`, error);
    return { stats: null, error: error.message };
  }
}

// Helper function to get MLB team code for StatPal API
async function getMLBTeamCodeForStatPal(teamId) {
  try {
    // Read MLB teams file to get StatPal code
    const fs = require('fs');
    const path = require('path');
    const teamsFile = path.join(__dirname, 'mlb_teams.json');

    if (!fs.existsSync(teamsFile)) {
      console.error('MLB teams file not found');
      return null;
    }

    const teams = JSON.parse(fs.readFileSync(teamsFile, 'utf8'));
    const team = teams.find(t => t.id === parseInt(teamId));

    if (!team || !team.statpal_code) {
      console.error(`No StatPal code found for MLB team ID ${teamId}`);
      return null;
    }

    return team.statpal_code.toLowerCase();
  } catch (error) {
    console.error('Error getting MLB team code for StatPal:', error);
    return null;
  }
}

// Transform StatPal MLB data to structured format for UI
function transformStatPalMLBData(statpalStats) {
  const categories = statpalStats.category || [];

  // Find specific categories
  const batting = categories.find(c => c.name === "Batting");
  const pitching = categories.find(c => c.name === "Pitching");
  const fielding = categories.find(c => c.name === "Fielding");

  // Aggregate team batting stats from all players
  const battingPlayers = batting?.team?.player || [];
  const pitchingPlayers = pitching?.team?.player || [];

  // Calculate team totals
  const teamBattingStats = battingPlayers.reduce((totals, player) => {
    return {
      atBats: totals.atBats + parseInt(player.at_bats || 0),
      hits: totals.hits + parseInt(player.hits || 0),
      homeRuns: totals.homeRuns + parseInt(player.home_runs || 0),
      rbi: totals.rbi + parseInt(player.runs_batted_in || 0),
      runs: totals.runs + parseInt(player.runs || 0),
      stolenBases: totals.stolenBases + parseInt(player.stolen_bases || 0),
      strikeouts: totals.strikeouts + parseInt(player.strikeouts || 0),
      walks: totals.walks + parseInt(player.walks || 0),
      doubles: totals.doubles + parseInt(player.doubles || 0),
      triples: totals.triples + parseInt(player.triples || 0)
    };
  }, { atBats: 0, hits: 0, homeRuns: 0, rbi: 0, runs: 0, stolenBases: 0, strikeouts: 0, walks: 0, doubles: 0, triples: 0 });

  const teamPitchingStats = pitchingPlayers.reduce((totals, player) => {
    return {
      wins: totals.wins + parseInt(player.wins || 0),
      losses: totals.losses + parseInt(player.losses || 0),
      saves: totals.saves + parseInt(player.saves || 0),
      strikeouts: totals.strikeouts + parseInt(player.strikeouts || 0),
      walks: totals.walks + parseInt(player.walks || 0),
      hits: totals.hits + parseInt(player.hits || 0),
      homeRuns: totals.homeRuns + parseInt(player.home_runs || 0),
      earnedRuns: totals.earnedRuns + parseInt(player.earned_runs || 0),
      inningsPitched: totals.inningsPitched + parseFloat(player.innings_pitched || 0)
    };
  }, { wins: 0, losses: 0, saves: 0, strikeouts: 0, walks: 0, hits: 0, homeRuns: 0, earnedRuns: 0, inningsPitched: 0 });

  return {
    team: statpalStats.team,
    season: statpalStats.season,

    // Batting Stats
    batting: {
      average: teamBattingStats.atBats > 0 ? (teamBattingStats.hits / teamBattingStats.atBats).toFixed(3) : "0.000",
      homeRuns: teamBattingStats.homeRuns,
      rbi: teamBattingStats.rbi,
      runs: teamBattingStats.runs,
      hits: teamBattingStats.hits,
      doubles: teamBattingStats.doubles,
      triples: teamBattingStats.triples,
      stolenBases: teamBattingStats.stolenBases,
      walks: teamBattingStats.walks,
      strikeouts: teamBattingStats.strikeouts,
      // Calculate OBP and SLG from aggregated data
      onBasePercentage: teamBattingStats.atBats > 0 ?
        ((teamBattingStats.hits + teamBattingStats.walks) / (teamBattingStats.atBats + teamBattingStats.walks)).toFixed(3) : "0.000",
      sluggingPercentage: teamBattingStats.atBats > 0 ?
        ((teamBattingStats.hits + teamBattingStats.doubles + (teamBattingStats.triples * 2) + (teamBattingStats.homeRuns * 3)) / teamBattingStats.atBats).toFixed(3) : "0.000"
    },

    // Pitching Stats
    pitching: {
      wins: teamPitchingStats.wins,
      losses: teamPitchingStats.losses,
      era: teamPitchingStats.inningsPitched > 0 ? (teamPitchingStats.earnedRuns * 9 / teamPitchingStats.inningsPitched).toFixed(2) : "0.00",
      strikeouts: teamPitchingStats.strikeouts,
      walks: teamPitchingStats.walks,
      saves: teamPitchingStats.saves,
      whip: teamPitchingStats.inningsPitched > 0 ?
        ((teamPitchingStats.walks + teamPitchingStats.hits) / teamPitchingStats.inningsPitched).toFixed(2) : "0.00",
      inningsPitched: teamPitchingStats.inningsPitched.toFixed(1),
      hitsAllowed: teamPitchingStats.hits,
      homeRunsAllowed: teamPitchingStats.homeRuns
    },

    // Fielding Stats (from team totals)
    fielding: {
      fieldingPercentage: fielding?.position?.[0]?.player?.[0]?.fielding_percentage || "0.000",
      errors: parseInt(fielding?.position?.[0]?.player?.[0]?.errors || 0),
      doublePlays: parseInt(fielding?.position?.[0]?.player?.[0]?.double_plays || 0)
    },

    // Calculated Metrics
    calculated: {
      runsPerGame: teamBattingStats.runs > 0 ? (teamBattingStats.runs / 162).toFixed(1) : "0.0",
      ops: teamBattingStats.atBats > 0 ?
        (parseFloat(((teamBattingStats.hits + teamBattingStats.walks) / (teamBattingStats.atBats + teamBattingStats.walks)).toFixed(3)) +
         parseFloat(((teamBattingStats.hits + teamBattingStats.doubles + (teamBattingStats.triples * 2) + (teamBattingStats.homeRuns * 3)) / teamBattingStats.atBats).toFixed(3))).toFixed(3) : "0.000"
    }
  };
}

// StatPal NFL Player Statistics Function
async function getStatPalNFLPlayerStatsTest(teamId) {
  try {
    // Need to convert team ID to team code for StatPal
    const teamCode = await getTeamCodeForStatPal(teamId);
    if (!teamCode) {
      return { players: [], error: "Could not find team code for StatPal NFL Player API" };
    }

    const apiUrl = `https://statpal.io/api/v1/nfl/player-stats/${teamCode}?access_key=${STATPAL_API_KEY}`;

    console.log(`Fetching NFL player stats from StatPal: ${apiUrl}`);

    const response = await axios.get(apiUrl);

    if (response.status !== 200) {
      return { players: [], error: `StatPal NFL Player API returned status ${response.status}` };
    }

    if (!response.data || !response.data.statistics) {
      return { players: [], error: "No statistics data in StatPal NFL Player response" };
    }

    const stats = response.data.statistics;
    console.log(`Found StatPal NFL player stats for team code ${teamCode}`);

    // Transform StatPal player data to structured format
    const transformedPlayers = transformStatPalNFLPlayerData(stats);

    return { players: transformedPlayers, error: null };

  } catch (error) {
    console.error(`Error fetching StatPal NFL player stats for team ${teamId}:`, error);
    return { players: [], error: error.message };
  }
}

// Transform StatPal NFL player data to structured format
function transformStatPalNFLPlayerData(statpalStats) {
  const categories = statpalStats.category || [];

  // Find specific categories
  const passing = categories.find(c => c.name === "Passing");
  const rushing = categories.find(c => c.name === "Rushing");
  const receiving = categories.find(c => c.name === "Receiving");
  const defense = categories.find(c => c.name === "Defense");
  const scoring = categories.find(c => c.name === "Scoring");

  const topPlayers = [];

  // Get top QB (highest passing yards) - handle both array and object structures
  let topQB = null;
  if (passing?.player && Array.isArray(passing.player) && passing.player.length > 0) {
    topQB = passing.player[0]; // Array structure
  } else if (passing?.player && typeof passing.player === 'object') {
    topQB = passing.player; // Single object structure
  }

  if (topQB) {
    topPlayers.push({
      id: topQB.id,
      name: topQB.name,
      position: "QB",
      category: "Passing",
      stats: {
        passingYards: parseInt(topQB.yards?.replace(/,/g, '') || 0),
        passingYardsPerGame: parseFloat(topQB.yards_per_game || 0),
        passingTouchdowns: parseInt(topQB.passing_touchdowns || 0),
        completionPct: parseFloat(topQB.completion_pct || 0),
        interceptions: parseInt(topQB.interceptions || 0),
        qbRating: parseFloat(topQB.quaterback_rating || 0),
        sacks: parseInt(topQB.sacks || 0),
        longestPass: parseInt(topQB.longest_pass || 0),
        attempts: parseInt(topQB.passing_attempts || 0),
        completions: parseInt(topQB.completions || 0)
      }
    });
  }

  // Get top RB (highest rushing yards) - handle both array and object structures
  let topRB = null;
  if (rushing?.player && Array.isArray(rushing.player) && rushing.player.length > 0) {
    topRB = rushing.player[0]; // Array structure
  } else if (rushing?.player && typeof rushing.player === 'object') {
    topRB = rushing.player; // Single object structure
  }

  if (topRB) {
    topPlayers.push({
      id: topRB.id,
      name: topRB.name,
      position: "RB",
      category: "Rushing",
      stats: {
        rushingYards: parseInt(topRB.yards?.replace(/,/g, '') || 0),
        rushingYardsPerGame: parseFloat(topRB.yards_per_game || 0),
        rushingTouchdowns: parseInt(topRB.rushing_touchdowns || 0),
        rushingAttempts: parseInt(topRB.rushing_attempts || 0),
        yardsPerRush: parseFloat(topRB.yards_per_rush_avg || 0),
        fumbles: parseInt(topRB.fumbles || 0),
        fumblesLost: parseInt(topRB.fumbles_lost || 0),
        longestRush: parseInt(topRB.longest_rush || 0),
        over20Yards: parseInt(topRB.over_20_yards || 0),
        firstDowns: parseInt(topRB.rushing_first_downs || 0)
      }
    });
  }

  // Get top WR (highest receiving yards) - handle both array and object structures
  let topWR = null;
  if (receiving?.player && Array.isArray(receiving.player) && receiving.player.length > 0) {
    topWR = receiving.player[0]; // Array structure
  } else if (receiving?.player && typeof receiving.player === 'object') {
    topWR = receiving.player; // Single object structure
  }

  if (topWR) {
    topPlayers.push({
      id: topWR.id,
      name: topWR.name,
      position: "WR",
      category: "Receiving",
      stats: {
        receivingYards: parseInt(topWR.receiving_yards?.replace(/,/g, '') || 0),
        receivingYardsPerGame: parseFloat(topWR.yards_per_game || 0),
        receivingTouchdowns: parseInt(topWR.receiving_touchdowns || 0),
        receptions: parseInt(topWR.receptions || 0),
        targets: parseInt(topWR.receiving_targets || 0),
        yardsPerReception: parseFloat(topWR.yards_per_reception_avg || 0),
        longestReception: parseInt(topWR.longest_reception || 0),
        over20Yards: parseInt(topWR.over_20_yards || 0),
        yardsAfterCatch: parseInt(topWR.yards_after_catch || 0),
        firstDowns: parseInt(topWR.receiving_first_downs || 0)
      }
    });
  }

  // Flatten all players into a single array for allPlayers - handle both array and object structures
  const allPlayersArray = [];

  // Helper function to safely add players
  const addPlayersFromCategory = (category) => {
    if (!category?.player) return;

    if (Array.isArray(category.player)) {
      allPlayersArray.push(...category.player);
    } else if (typeof category.player === 'object') {
      allPlayersArray.push(category.player);
    }
  };

  // Safely add players from each category
  addPlayersFromCategory(passing);
  addPlayersFromCategory(rushing);
  addPlayersFromCategory(receiving);
  addPlayersFromCategory(defense);
  addPlayersFromCategory(scoring);

  return {
    team: statpalStats.team,
    season: statpalStats.season,
    topPlayers,
    allPlayers: allPlayersArray, // ✅ Now returns array as expected by UI
    allCategories: {
      passing: Array.isArray(passing?.player) ? passing.player : (passing?.player ? [passing.player] : []),
      rushing: Array.isArray(rushing?.player) ? rushing.player : (rushing?.player ? [rushing.player] : []),
      receiving: Array.isArray(receiving?.player) ? receiving.player : (receiving?.player ? [receiving.player] : []),
      defense: Array.isArray(defense?.player) ? defense.player : (defense?.player ? [defense.player] : []),
      scoring: Array.isArray(scoring?.player) ? scoring.player : (scoring?.player ? [scoring.player] : [])
    }
  };
}

// +EV and Arbitrage Analysis Function - All Markets
function calculateEVOpportunities(bookmakers, event) {
  const sharpBooks = ['pinnacle', 'lowvig', 'betonlineag'];

  // Extract odds for all 3 markets
  const moneylineOdds = { home: [], away: [] };
  const spreadOdds = { home: [], away: [] };
  const totalOdds = { over: [], under: [] };

  bookmakers.forEach(bookmaker => {
    bookmaker.markets.forEach(market => {
      const isSharp = sharpBooks.includes(bookmaker.key);

      if (market.key === 'h2h') {
        const homeOutcome = market.outcomes.find(o => o.name === event.home_team);
        const awayOutcome = market.outcomes.find(o => o.name === event.away_team);

        if (homeOutcome && awayOutcome) {
          moneylineOdds.home.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            odds: homeOutcome.price,
            isSharp
          });

          moneylineOdds.away.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            odds: awayOutcome.price,
            isSharp
          });
        }
      }

      if (market.key === 'spreads') {
        const homeOutcome = market.outcomes.find(o => o.name === event.home_team);
        const awayOutcome = market.outcomes.find(o => o.name === event.away_team);

        if (homeOutcome && awayOutcome) {
          spreadOdds.home.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            odds: homeOutcome.price,
            point: homeOutcome.point,
            isSharp
          });

          spreadOdds.away.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            odds: awayOutcome.price,
            point: awayOutcome.point,
            isSharp
          });
        }
      }

      if (market.key === 'totals') {
        const overOutcome = market.outcomes.find(o => o.name === "Over");
        const underOutcome = market.outcomes.find(o => o.name === "Under");

        if (overOutcome && underOutcome) {
          totalOdds.over.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            odds: overOutcome.price,
            point: overOutcome.point,
            isSharp
          });

          totalOdds.under.push({
            bookmaker: bookmaker.title,
            bookmakerKey: bookmaker.key,
            odds: underOutcome.price,
            point: underOutcome.point,
            isSharp
          });
        }
      }
    });
  });

  // 1. Calculate Sharp Consensus and True Fair Value (Multiplicative Method)
  function getSharpConsensus(odds) {
    // BULLETPROOF: Handle null/undefined odds array
    if (!odds || !Array.isArray(odds) || odds.length === 0) return null;

    const sharpOdds = odds
      .filter(o => o && o.isSharp && typeof o.odds === 'number' && o.odds > 0)
      .map(o => o.odds);

    return sharpOdds.length > 0 ? sharpOdds.reduce((a, b) => a + b) / sharpOdds.length : null;
  }

  function calculateTrueFairValue(odds1, odds2) {
    // BULLETPROOF: Validate input odds
    if (!odds1 || !odds2 || typeof odds1 !== 'number' || typeof odds2 !== 'number') {
      return { fair1: null, fair2: null };
    }

    // BULLETPROOF: Check for reasonable odds range (1.01 to 100.0)
    if (odds1 < 1.01 || odds1 > 100 || odds2 < 1.01 || odds2 > 100) {
      return { fair1: null, fair2: null };
    }

    try {
    // Step 1: Calculate implied probabilities
    const implied1 = 1 / odds1;
    const implied2 = 1 / odds2;
    const totalImplied = implied1 + implied2;

      // BULLETPROOF: Check for division by zero or invalid total
      if (totalImplied <= 0 || !isFinite(totalImplied)) {
        return { fair1: null, fair2: null };
      }

    // Step 2: Remove vig (multiplicative method)
    const fairProb1 = implied1 / totalImplied;
    const fairProb2 = implied2 / totalImplied;

    // Step 3: Convert back to fair odds
    const fairOdds1 = 1 / fairProb1;
    const fairOdds2 = 1 / fairProb2;

      // BULLETPROOF: Validate final results
      if (!isFinite(fairOdds1) || !isFinite(fairOdds2) || fairOdds1 <= 0 || fairOdds2 <= 0) {
        return { fair1: null, fair2: null };
      }

    return {
      fair1: parseFloat(fairOdds1.toFixed(2)),
      fair2: parseFloat(fairOdds2.toFixed(2))
    };
    } catch (error) {
      console.error('Error calculating fair value:', error);
      return { fair1: null, fair2: null };
    }
  }

  // Calculate sharp consensus first
  const sharpConsensus = {
    moneyline: {
      home: getSharpConsensus(moneylineOdds.home),
      away: getSharpConsensus(moneylineOdds.away)
    },
    spread: {
      home: getSharpConsensus(spreadOdds.home),
      away: getSharpConsensus(spreadOdds.away),
      point: spreadOdds.home[0]?.point || null
    },
    total: {
      over: getSharpConsensus(totalOdds.over),
      under: getSharpConsensus(totalOdds.under),
      point: totalOdds.over[0]?.point || null
    }
  };

  // Calculate true fair value (vig removed) - ONLY from sharp books or N/A
  const fairValue = {
    moneyline: calculateTrueFairValue(sharpConsensus.moneyline.home, sharpConsensus.moneyline.away),
    spread: calculateTrueFairValue(sharpConsensus.spread.home, sharpConsensus.spread.away),
    total: calculateTrueFairValue(sharpConsensus.total.over, sharpConsensus.total.under)
  };

  // 2. Calculate Vig for each market
  function calculateMarketVig(odds1, odds2) {
    if (!odds1 || !odds2) return null;
    const implied1 = 1 / odds1;
    const implied2 = 1 / odds2;
    return ((implied1 + implied2) - 1) * 100;
  }


  const vigAnalysis = {
    moneyline: {
      sharp: sharpConsensus.moneyline.home && sharpConsensus.moneyline.away ?
        validateVig(calculateMarketVig(sharpConsensus.moneyline.home, sharpConsensus.moneyline.away)) : null,
      market: validateVig(calculateMarketVig(
        moneylineOdds.home.reduce((sum, o) => sum + o.odds, 0) / moneylineOdds.home.length,
        moneylineOdds.away.reduce((sum, o) => sum + o.odds, 0) / moneylineOdds.away.length
      ))
    },
    spread: {
      sharp: sharpConsensus.spread.home && sharpConsensus.spread.away ?
        calculateMarketVig(sharpConsensus.spread.home, sharpConsensus.spread.away) : null,
      market: calculateMarketVig(
        spreadOdds.home.reduce((sum, o) => sum + o.odds, 0) / spreadOdds.home.length,
        spreadOdds.away.reduce((sum, o) => sum + o.odds, 0) / spreadOdds.away.length
      )
    },
    total: {
      sharp: sharpConsensus.total.over && sharpConsensus.total.under ?
        calculateMarketVig(sharpConsensus.total.over, sharpConsensus.total.under) : null,
      market: calculateMarketVig(
        totalOdds.over.reduce((sum, o) => sum + o.odds, 0) / totalOdds.over.length,
        totalOdds.under.reduce((sum, o) => sum + o.odds, 0) / totalOdds.under.length
      )
    }
  };

  // 3. Find lowest vig books for each market
  const lowestVigBooks = {
    moneyline: findLowestVigBook(moneylineOdds.home, moneylineOdds.away),
    spread: findLowestVigBook(spreadOdds.home, spreadOdds.away),
    total: findLowestVigBook(totalOdds.over, totalOdds.under)
  };

  // 4. Find +EV opportunities across all markets
  const evOpportunities = [];

  // BULLETPROOF: Check moneyline +EV using TRUE FAIR VALUE (vig removed)
  if (fairValue.moneyline.fair1 && fairValue.moneyline.fair2 &&
      typeof fairValue.moneyline.fair1 === 'number' && typeof fairValue.moneyline.fair2 === 'number') {

    // Home team EV opportunities
    moneylineOdds.home.filter(o => o && !o.isSharp && typeof o.odds === 'number' && o.odds > 0).forEach(book => {
      try {
      const ev = ((book.odds - fairValue.moneyline.fair1) / fairValue.moneyline.fair1) * 100;

        // BULLETPROOF: Validate EV calculation and set reasonable limits (max 22% EV)
        if (isFinite(ev) && ev > 1.0 && ev < 22.0) {
        evOpportunities.push({
          market: "Moneyline",
          team: event.home_team,
          bookmaker: book.bookmaker,
          bookOdds: book.odds,
          fairOdds: fairValue.moneyline.fair1,
          sharpConsensus: sharpConsensus.moneyline.home,
          ev: parseFloat(ev.toFixed(1))
        });
        }
      } catch (error) {
        console.error('Error calculating home ML EV:', error);
      }
    });

    // Away team EV opportunities
    moneylineOdds.away.filter(o => o && !o.isSharp && typeof o.odds === 'number' && o.odds > 0).forEach(book => {
      try {
      const ev = ((book.odds - fairValue.moneyline.fair2) / fairValue.moneyline.fair2) * 100;

        // BULLETPROOF: Validate EV calculation and set reasonable limits (max 22% EV)
        if (isFinite(ev) && ev > 1.0 && ev < 22.0) {
        evOpportunities.push({
          market: "Moneyline",
          team: event.away_team,
          bookmaker: book.bookmaker,
          bookOdds: book.odds,
          fairOdds: fairValue.moneyline.fair2,
          sharpConsensus: sharpConsensus.moneyline.away,
          ev: parseFloat(ev.toFixed(1))
        });
        }
      } catch (error) {
        console.error('Error calculating away ML EV:', error);
      }
    });
  }

  // Sort by highest EV
  evOpportunities.sort((a, b) => b.ev - a.ev);

  // BULLETPROOF: Arbitrage Detection with Bet Sizing
  let arbitrageData = null;
  let hasArbitrage = false; // Initialize hasArbitrage variable

  try {
    // BULLETPROOF: Validate we have odds data
    const validHomeOdds = moneylineOdds.home.filter(o => o && typeof o.odds === 'number' && o.odds > 1.01);
    const validAwayOdds = moneylineOdds.away.filter(o => o && typeof o.odds === 'number' && o.odds > 1.01);

    if (validHomeOdds.length > 0 && validAwayOdds.length > 0) {
      const bestHomeOdds = Math.max(...validHomeOdds.map(o => o.odds));
      const bestAwayOdds = Math.max(...validAwayOdds.map(o => o.odds));
      const bestHomeBook = validHomeOdds.find(o => o.odds === bestHomeOdds);
      const bestAwayBook = validAwayOdds.find(o => o.odds === bestAwayOdds);

      // BULLETPROOF: Validate best odds are reasonable
      if (bestHomeOdds > 1.01 && bestAwayOdds > 1.01 && isFinite(bestHomeOdds) && isFinite(bestAwayOdds)) {
  const arbCheck = (1 / bestHomeOdds) + (1 / bestAwayOdds);
        hasArbitrage = arbCheck < 1.0 && arbCheck > 0.5; // Reasonable arbitrage range

  if (hasArbitrage) {
    const profit = ((1 - arbCheck) * 100);

          // BULLETPROOF: Validate profit is reasonable (max 14%)
          if (profit > 0 && profit < 14) {
    const bankroll = 100; // $100 example
    const bet1 = bankroll / (1 + (bestHomeOdds / bestAwayOdds));
    const bet2 = bankroll - bet1;

            // BULLETPROOF: Validate bet amounts
            if (bet1 > 0 && bet2 > 0 && isFinite(bet1) && isFinite(bet2)) {
    arbitrageData = {
      detected: true,
      profit: parseFloat(profit.toFixed(1)),
      bets: [
        {
          team: event.home_team,
          amount: parseFloat(bet1.toFixed(2)),
          percentage: parseFloat((bet1/bankroll * 100).toFixed(2)),
          odds: bestHomeOdds,
          bookmaker: bestHomeBook?.bookmaker,
          bookmakerKey: bestHomeBook?.bookmakerKey,
          icon: getBookmakerIcon(bestHomeBook?.bookmakerKey)
        },
        {
          team: event.away_team,
          amount: parseFloat(bet2.toFixed(2)),
          percentage: parseFloat((bet2/bankroll * 100).toFixed(2)),
          odds: bestAwayOdds,
          bookmaker: bestAwayBook?.bookmaker,
          bookmakerKey: bestAwayBook?.bookmakerKey,
          icon: getBookmakerIcon(bestAwayBook?.bookmakerKey)
        }
      ]
    };
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error calculating arbitrage:', error);
    arbitrageData = null;
  }

  // 6. Format opportunities for UI
  const formattedOpportunities = formatOpportunitiesForUI(
    evOpportunities,
    arbitrageData,
    lowestVigBooks,
    event
  );

  return {
    teams: `${event.home_team} vs ${event.away_team}`,
    sharpConsensus,
    fairValue,
    vigAnalysis,
    lowestVigBooks,
    arbitrage: arbitrageData,
    evOpportunities: evOpportunities.slice(0, 3),
    // NEW: UI-formatted opportunities
    uiOpportunities: formattedOpportunities,
    summary: {
      totalBooks: bookmakers.length,
      sharpBooks: moneylineOdds.home.filter(o => o.isSharp).length,
      hasOpportunities: evOpportunities.length > 0 || hasArbitrage
    }
  };
}

// Helper function to validate and cap vig values
function validateVig(vig) {
  if (!vig || !isFinite(vig)) return null;
  if (vig < 0) return 0.1; // Minimum realistic vig
  if (vig > 50) return 50; // Maximum realistic vig
  return Math.round(vig * 10) / 10;
}

// Helper function to calculate market vig - handle both 2-way and 3-way betting
function calculateMarketVig(odds1, odds2, odds3 = null) {
  if (!odds1 || !odds2) return null;

  const implied1 = 1 / odds1;
  const implied2 = 1 / odds2;

  // For 3-way betting (soccer), include draw odds
  if (odds3) {
    const implied3 = 1 / odds3;
    return ((implied1 + implied2 + implied3) - 1) * 100;
  }

  // For 2-way betting (NFL, NBA, etc.)
  return ((implied1 + implied2) - 1) * 100;
}

// Helper function to find lowest vig book for a market
function findLowestVigBook(odds1Array, odds2Array) {
  const bookVigs = [];

  odds1Array.forEach(book1 => {
    const book2 = odds2Array.find(b => b.bookmakerKey === book1.bookmakerKey);
    if (book2) {
      const vig = calculateMarketVig(book1.odds, book2.odds);
      bookVigs.push({
        bookmaker: book1.bookmaker,
        vig: parseFloat(vig.toFixed(1)),
        odds1: book1.odds,
        odds2: book2.odds
      });
    }
  });

  return bookVigs.sort((a, b) => a.vig - b.vig)[0] || null;
}

// Bookmaker Icon Mapping for UI
function getBookmakerIcon(bookmakerKey) {
  const iconMap = {
    'pinnacle': 'pinnacle',
    'draftkings': 'draftkings',
    'fanduel': 'fanduel',
    'betmgm': 'betmgm',
    'caesars': 'caesars',
    'williamhill_us': 'caesars', // Caesars owns William Hill US
    'betrivers': 'betrivers',
    'bovada': 'bovada',
    'betus': 'betus',
    'mybookieag': 'mybookie',
    'fanatics': 'fanatics',
    'ballybet': 'ballybet',
    'espnbet': 'espnbet',
    'hardrockbet': 'hardrock',
    'lowvig': 'lowvig',
    'betonlineag': 'betonline',
    'pointsbet': 'pointsbet'
  };

  return iconMap[bookmakerKey] || 'generic';
}

// Format opportunities for UI display
function formatOpportunitiesForUI(evOpportunities, arbitrageData, lowestVigBooks, event) {
  const opportunities = [];

  // Priority 1: Arbitrage (if found)
  if (arbitrageData && arbitrageData.detected) {
    opportunities.push({
      type: "arbitrage",
      title: `Arb Detected - ${arbitrageData.profit}% guaranteed`,
      description: `${arbitrageData.bets[0].percentage}% on ${arbitrageData.bets[0].team} ML ${arbitrageData.bets[0].odds}`,
      secondLine: `${arbitrageData.bets[1].percentage}% on ${arbitrageData.bets[1].team} ML ${arbitrageData.bets[1].odds}`,
      icon: "arbitrage", // Special arbitrage icon
      profit: arbitrageData.profit,
      bets: arbitrageData.bets
    });
  }

  // Priority 2: +EV Opportunities (highest EV first)
  evOpportunities.forEach(ev => {
    opportunities.push({
      type: "ev",
      title: `+EV ${ev.ev}% at ${ev.bookmaker}`,
      description: `${ev.team} ML ${ev.bookOdds}`,
      icon: getBookmakerIcon(ev.bookmaker?.toLowerCase().replace(/[^a-z]/g, '')),
      ev: ev.ev,
      bookmaker: ev.bookmaker,
      team: ev.team,
      odds: ev.bookOdds
    });
  });

  // Priority 3: If no opportunities, show efficient market + lowest vig
  if (opportunities.length === 0) {
    // Efficient market message
    opportunities.push({
      type: "efficient",
      title: "Market is efficiently priced",
      description: "No +EV or Arb opportunities found",
      icon: "x"
    });

    // Lowest vig recommendations
    if (lowestVigBooks.moneyline) {
      opportunities.push({
        type: "lowvig",
        title: `Lowest Vig at ${lowestVigBooks.moneyline.vig}%`,
        description: `ML on ${event.home_team} ${lowestVigBooks.moneyline.odds1} at ${lowestVigBooks.moneyline.bookmaker}`,
        icon: getBookmakerIcon(lowestVigBooks.moneyline.bookmaker?.toLowerCase().replace(/[^a-z]/g, '')),
        vig: lowestVigBooks.moneyline.vig,
        bookmaker: lowestVigBooks.moneyline.bookmaker
      });
    }

    if (lowestVigBooks.spread) {
      opportunities.push({
        type: "lowvig",
        title: `Lowest Vig Spread at ${lowestVigBooks.spread.vig}%`,
        description: `Spread ${lowestVigBooks.spread.odds1} at ${lowestVigBooks.spread.bookmaker}`,
        icon: getBookmakerIcon(lowestVigBooks.spread.bookmaker?.toLowerCase().replace(/[^a-z]/g, '')),
        vig: lowestVigBooks.spread.vig,
        bookmaker: lowestVigBooks.spread.bookmaker
      });
    }
  }

  return {
    hasOpportunities: evOpportunities.length > 0 || (arbitrageData && arbitrageData.detected),
    opportunities: opportunities.slice(0, 4), // Max 4 items for UI
    summary: opportunities.length === 1 && opportunities[0].type === "efficient" ?
      "Efficient market" :
      `${evOpportunities.length + (arbitrageData?.detected ? 1 : 0)} opportunities found`
  };
}

// ====================================================================
// SOCCER-SPECIFIC MARKET INTELLIGENCE FUNCTIONS (3-WAY BETTING)
// ====================================================================

// Soccer Sharp Meter - 3-Way Betting Analysis
function calculateSoccerSharpMeter(bookmakers, event, locale = 'en') {
  const sharpBooks = ['pinnacle', 'betfair']; // Soccer sharp books
  const publicBooks = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'betrivers', 'bovada', 'betus', 'mybookieag'];

  // Extract 3-way odds (Home/Draw/Away)
  const homeOdds = { sharp: [], public: [] };
  const drawOdds = { sharp: [], public: [] };
  const awayOdds = { sharp: [], public: [] };

  bookmakers.forEach(bookmaker => {
    const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
    if (!h2hMarket || !h2hMarket.outcomes || h2hMarket.outcomes.length !== 3) return;

    const isSharp = sharpBooks.includes(bookmaker.key);
    const isPublic = publicBooks.includes(bookmaker.key);

    const homeOutcome = h2hMarket.outcomes.find(o => o.name === event.home_team);
    const awayOutcome = h2hMarket.outcomes.find(o => o.name === event.away_team);
    const drawOutcome = h2hMarket.outcomes.find(o => o.name === 'Draw');

    if (homeOutcome && drawOutcome && awayOutcome) {
      if (isSharp) {
        homeOdds.sharp.push(homeOutcome.price);
        drawOdds.sharp.push(drawOutcome.price);
        awayOdds.sharp.push(awayOutcome.price);
      }
      if (isPublic) {
        homeOdds.public.push(homeOutcome.price);
        drawOdds.public.push(drawOutcome.price);
        awayOdds.public.push(awayOutcome.price);
      }
    }
  });

  // Calculate averages
  const avgSharpHome = homeOdds.sharp.length > 0 ? homeOdds.sharp.reduce((a, b) => a + b, 0) / homeOdds.sharp.length : null;
  const avgPublicHome = homeOdds.public.length > 0 ? homeOdds.public.reduce((a, b) => a + b, 0) / homeOdds.public.length : null;

  const avgSharpDraw = drawOdds.sharp.length > 0 ? drawOdds.sharp.reduce((a, b) => a + b, 0) / drawOdds.sharp.length : null;
  const avgPublicDraw = drawOdds.public.length > 0 ? drawOdds.public.reduce((a, b) => a + b, 0) / drawOdds.public.length : null;

  const avgSharpAway = awayOdds.sharp.length > 0 ? awayOdds.sharp.reduce((a, b) => a + b, 0) / awayOdds.sharp.length : null;
  const avgPublicAway = awayOdds.public.length > 0 ? awayOdds.public.reduce((a, b) => a + b, 0) / awayOdds.public.length : null;

  // If we don't have enough data, return placeholder
  if (!avgSharpHome || !avgPublicHome || !avgSharpDraw || !avgPublicDraw || !avgSharpAway || !avgPublicAway) {
    return {
      line1: "Insufficient data for soccer sharp meter",
      line2: "Need sharp and public books",
      line3: "No comparison available",
      gaugeValue: 50,
      gaugeLabel: "LOW",
      dataQuality: "insufficient",
      sharpBookCount: homeOdds.sharp.length,
      publicBookCount: homeOdds.public.length
    };
  }

  // OPTION 1: Odds Movement Analysis - Calculate implied probability differences
  const sharpImpliedHome = 1 / avgSharpHome;
  const publicImpliedHome = 1 / avgPublicHome;
  const homeDiff = (publicImpliedHome - sharpImpliedHome) * 100; // Positive = sharps getting better odds (public overpricing)

  const sharpImpliedDraw = 1 / avgSharpDraw;
  const publicImpliedDraw = 1 / avgPublicDraw;
  const drawDiff = (publicImpliedDraw - sharpImpliedDraw) * 100;

  const sharpImpliedAway = 1 / avgSharpAway;
  const publicImpliedAway = 1 / avgPublicAway;
  const awayDiff = (publicImpliedAway - sharpImpliedAway) * 100;

  // OPTION 2: Market Distribution - Find which outcome has the biggest sharp edge
  const edges = [
    { outcome: 'Home', diff: homeDiff, sharpOdds: avgSharpHome, publicOdds: avgPublicHome },
    { outcome: 'Draw', diff: drawDiff, sharpOdds: avgSharpDraw, publicOdds: avgPublicDraw },
    { outcome: 'Away', diff: awayDiff, sharpOdds: avgSharpAway, publicOdds: avgPublicAway }
  ];

  // Sort by absolute difference to find where sharps disagree most with public
  edges.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const biggestEdge = edges[0];

  // OPTION 3: Vig Confidence Analysis
  const sharpVig = ((sharpImpliedHome + sharpImpliedDraw + sharpImpliedAway) - 1) * 100;
  const publicVig = ((publicImpliedHome + publicImpliedDraw + publicImpliedAway) - 1) * 100;
  const vigGap = publicVig - sharpVig;

  // Generate Line 1: Primary Signal (which outcome sharps favor)
  let line1 = translate('noClearLean', locale);
  if (Math.abs(biggestEdge.diff) > 0.5) {
    if (biggestEdge.diff > 0) {
      // Public overpricing this outcome = sharps getting better odds elsewhere
      line1 = `${translate('sharpsFade', locale)} ${biggestEdge.outcome}`;
    } else {
      // Sharps getting worse odds = they're driving the price down = they favor this outcome
      line1 = `${translate('sharpsFavor', locale)} ${biggestEdge.outcome}`;
    }
  }

  // Generate Line 2: Secondary Signal (vig confidence or probability edge)
  let line2 = "Limited data";
  if (Math.abs(biggestEdge.diff) > 0.5) {
    line2 = `${Math.abs(biggestEdge.diff).toFixed(1)}% ${translate('impliedEdge', locale)}`;
  } else if (vigGap > 1.0) {
    line2 = translate('marketUncertainty', locale);
  } else {
    line2 = translate('tightMarket', locale);
  }

  // Generate Line 3: Detail Line (show the actual odds comparison)
  const line3 = `${translate('sharp', locale)} ${biggestEdge.outcome.toLowerCase()} ${biggestEdge.sharpOdds.toFixed(2)} ${translate('vsPublic', locale)} ${biggestEdge.publicOdds.toFixed(2)}`;

  // Calculate Gauge Value (0-100 scale)
  // 0 = Strong Home, 50 = Neutral/Draw, 100 = Strong Away
  let gaugeValue = 50; // Default neutral

  if (biggestEdge.outcome === 'Home') {
    // Sharps favor home: gauge should be lower (0-40 range)
    gaugeValue = 50 - Math.min(Math.abs(biggestEdge.diff) * 8, 40);
  } else if (biggestEdge.outcome === 'Away') {
    // Sharps favor away: gauge should be higher (60-100 range)
    gaugeValue = 50 + Math.min(Math.abs(biggestEdge.diff) * 8, 40);
  } else {
    // Draw: stay near 50 (45-55 range)
    gaugeValue = 50;
  }

  gaugeValue = Math.max(0, Math.min(100, Math.round(gaugeValue)));

  // Determine confidence level and gauge label
  let confidenceLevel = "low";
  let gaugeLabel = "LOW";

  if (homeOdds.sharp.length >= 2 && homeOdds.public.length >= 3) {
    confidenceLevel = "high";
    gaugeLabel = "HIGH";
  } else if (homeOdds.sharp.length >= 1 && homeOdds.public.length >= 2) {
    confidenceLevel = "medium";
    gaugeLabel = "MED";
  }

  return {
    // Display text (3 sentences) - NEW FORMAT
    line1,
    line2,
    line3,

    // Gauge data
    gaugeValue,
    gaugeLabel,

    // Backend calculation data
    homeDiff: Math.round(homeDiff * 10) / 10,
    drawDiff: Math.round(drawDiff * 10) / 10,
    awayDiff: Math.round(awayDiff * 10) / 10,
    avgSharpHome: Math.round(avgSharpHome * 100) / 100,
    avgPublicHome: Math.round(avgPublicHome * 100) / 100,
    avgSharpDraw: Math.round(avgSharpDraw * 100) / 100,
    avgPublicDraw: Math.round(avgPublicDraw * 100) / 100,
    avgSharpAway: Math.round(avgSharpAway * 100) / 100,
    avgPublicAway: Math.round(avgPublicAway * 100) / 100,
    sharpVig: Math.round(sharpVig * 10) / 10,
    publicVig: Math.round(publicVig * 10) / 10,
    vigGap: Math.round(vigGap * 10) / 10,
    confidenceLevel,
    dataQuality: confidenceLevel === "high" ? "excellent" :
                 confidenceLevel === "medium" ? "good" : "limited",

    // Metadata
    sharpBookCount: homeOdds.sharp.length,
    publicBookCount: homeOdds.public.length,
    biggestEdgeOutcome: biggestEdge.outcome
  };
}

// Helper function to convert decimal odds to fractional odds (for soccer)
function decimalToFractional(decimal) {
  if (!decimal || decimal === 1) return "1/1";

  // Get the profit (decimal - 1)
  const profit = decimal - 1;

  // Convert to fraction
  let numerator = profit;
  let denominator = 1;

  // Find common fraction by multiplying until we get close to integers
  const precision = 1000; // For accuracy
  numerator = Math.round(profit * precision);
  denominator = precision;

  // Simplify the fraction by finding GCD
  const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(numerator, denominator);

  numerator = numerator / divisor;
  denominator = denominator / divisor;

  // Common fractional odds simplifications
  const commonFractions = {
    '1/1': 1, '2/1': 2, '3/1': 3, '4/1': 4, '5/1': 5, '10/1': 10, '20/1': 20,
    '1/2': 0.5, '1/3': 0.333, '2/5': 0.4, '4/5': 0.8, '5/6': 0.833,
    '10/11': 0.909, '5/4': 1.25, '6/4': 1.5, '7/4': 1.75, '9/4': 2.25,
    '11/4': 2.75, '13/4': 3.25, '15/4': 3.75, '8/5': 1.6, '11/5': 2.2,
    '13/5': 2.6, '7/2': 3.5, '9/2': 4.5, '11/2': 5.5, '13/2': 6.5,
    '15/2': 7.5, '17/2': 8.5, '19/2': 9.5
  };

  // Check if it matches a common fraction
  for (const [frac, val] of Object.entries(commonFractions)) {
    if (Math.abs(profit - val) < 0.05) {
      return frac;
    }
  }

  // Return simplified fraction
  return `${numerator}/${denominator}`;
}

function calculateSoccerBestLines(bookmakers, event, locale = 'en') {
  const moneylines = { home: [], draw: [], away: [] };

  // Extract 3-way moneyline odds
  bookmakers.forEach(bookmaker => {
    const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
    if (h2hMarket && h2hMarket.outcomes.length === 3) {
      h2hMarket.outcomes.forEach(outcome => {
        if (outcome.name === event.home_team) {
          moneylines.home.push({
            bookmaker: bookmaker.title,
            odds: outcome.price,
            team: outcome.name
          });
        } else if (outcome.name === event.away_team) {
          moneylines.away.push({
            bookmaker: bookmaker.title,
            odds: outcome.price,
            team: outcome.name
          });
        } else if (outcome.name === "Draw") {
          moneylines.draw.push({
            bookmaker: bookmaker.title,
            odds: outcome.price,
            team: "Draw"
          });
        }
      });
    }
  });

  // Calculate consensus (median) for 3-way
  const consensusHome = moneylines.home.length > 0 ?
    moneylines.home.sort((a, b) => a.odds - b.odds)[Math.floor(moneylines.home.length / 2)].odds : 0;
  const consensusDraw = moneylines.draw.length > 0 ?
    moneylines.draw.sort((a, b) => a.odds - b.odds)[Math.floor(moneylines.draw.length / 2)].odds : 0;
  const consensusAway = moneylines.away.length > 0 ?
    moneylines.away.sort((a, b) => a.odds - b.odds)[Math.floor(moneylines.away.length / 2)].odds : 0;

  // Find best odds (highest for each outcome)
  const bestHome = moneylines.home.sort((a, b) => b.odds - a.odds)[0];
  const bestDraw = moneylines.draw.sort((a, b) => b.odds - a.odds)[0];
  const bestAway = moneylines.away.sort((a, b) => b.odds - a.odds)[0];

  return {
    consensusSpreadPoint: 0, // Soccer doesn't use spreads
    consensusTotal: 0, // Simplified for now
    consensusHomeML: consensusHome,
    consensusAwayML: consensusAway,
    consensusDrawML: consensusDraw,
    // Add fractional odds for UI display
    consensusHomeMLFractional: decimalToFractional(consensusHome),
    consensusAwayMLFractional: decimalToFractional(consensusAway),
    consensusDrawMLFractional: decimalToFractional(consensusDraw),
    bestLines: [
      bestHome && {
        type: "soccer_win",
        label: translate('bestHomeWin', locale),
        odds: bestHome.odds,
        fractionalOdds: decimalToFractional(bestHome.odds),
        bookmaker: bestHome.bookmaker,
        team: bestHome.team
      },
      bestDraw && {
        type: "soccer_draw",
        label: translate('bestDraw', locale),
        odds: bestDraw.odds,
        fractionalOdds: decimalToFractional(bestDraw.odds),
        bookmaker: bestDraw.bookmaker,
        team: "Draw"
      },
      bestAway && {
        type: "soccer_win",
        label: translate('bestAwayWin', locale),
        odds: bestAway.odds,
        fractionalOdds: decimalToFractional(bestAway.odds),
        bookmaker: bestAway.bookmaker,
        team: bestAway.team
      }
    ].filter(Boolean),
    rawData: {
      totalSpreads: 0,
      totalMoneylines: moneylines.home.length + moneylines.draw.length + moneylines.away.length,
      totalTotals: 0
    }
  };
}

// Helper function to find lowest vig (best odds) for a single outcome in 3-way betting
function findLowestVigForOutcome(outcomeOdds, fairValue) {
  if (!outcomeOdds || outcomeOdds.length === 0) return null;

  // Find the bookmaker with the best (highest) odds for this outcome
  // Higher odds = better value = lower implied vig
  const bestBook = outcomeOdds.sort((a, b) => b.odds - a.odds)[0];

  if (!bestBook) return null;

  // Calculate vig if we have fair value
  let vig = null;
  if (fairValue && bestBook.odds) {
    // Vig = difference between implied probability at book odds vs fair value
    const impliedProb = 1 / bestBook.odds;
    const fairProb = 1 / fairValue;
    vig = ((impliedProb - fairProb) / fairProb * 100);
    vig = Math.max(0, parseFloat(vig.toFixed(1))); // Ensure non-negative
  }

  return {
    bookmaker: bestBook.bookmaker,
    odds: bestBook.odds,
    fractionalOdds: decimalToFractional(bestBook.odds),
    vig: vig || 0
  };
}

function calculateSoccerEVOpportunities(bookmakers, event, locale = 'en') {
  try {
    // Extract 3-way moneyline odds (Home/Draw/Away)
    const homeOdds = [];
    const drawOdds = [];
    const awayOdds = [];

    bookmakers.forEach(bookmaker => {
      const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
      if (h2hMarket && h2hMarket.outcomes) {
        const homeOutcome = h2hMarket.outcomes.find(o => o.name === event.home_team);
        const awayOutcome = h2hMarket.outcomes.find(o => o.name === event.away_team);
        const drawOutcome = h2hMarket.outcomes.find(o => o.name === 'Draw');

        if (homeOutcome && awayOutcome && drawOutcome) {
          const isSharp = ['pinnacle', 'betfair'].includes(bookmaker.key);

          homeOdds.push({ bookmaker: bookmaker.title, bookmakerKey: bookmaker.key, odds: homeOutcome.price, isSharp });
          drawOdds.push({ bookmaker: bookmaker.title, bookmakerKey: bookmaker.key, odds: drawOutcome.price, isSharp });
          awayOdds.push({ bookmaker: bookmaker.title, bookmakerKey: bookmaker.key, odds: awayOutcome.price, isSharp });
        }
      }
    });

    if (homeOdds.length === 0) {
      return {
        teams: `${event.home_team} vs ${event.away_team}`,
        sharpConsensus: { moneyline: { home: null, away: null, draw: null } },
        fairValue: { moneyline: { fairHome: null, fairDraw: null, fairAway: null, fairHomeFractional: null, fairDrawFractional: null, fairAwayFractional: null } },
        vigAnalysis: {
          moneyline: { sharp: null, market: null, sharpHome: null, sharpDraw: null, sharpAway: null, marketHome: null, marketDraw: null, marketAway: null },
          spread: { sharp: null, market: null },
          total: { sharp: null, market: null }
        },
        uiOpportunities: {
          hasOpportunities: false,
          opportunities: [{
            type: "efficient",
            title: "No soccer odds available",
            description: "Unable to find 3-way betting odds",
            icon: "x"
          }],
          summary: "No data"
        }
      };
    }

    // Calculate sharp consensus (median of sharp books)
    const sharpHomeOdds = homeOdds.filter(o => o.isSharp).map(o => o.odds);
    const sharpDrawOdds = drawOdds.filter(o => o.isSharp).map(o => o.odds);
    const sharpAwayOdds = awayOdds.filter(o => o.isSharp).map(o => o.odds);

    const sharpConsensusHome = sharpHomeOdds.length > 0 ? sharpHomeOdds.sort((a, b) => a - b)[Math.floor(sharpHomeOdds.length / 2)] : null;
    const sharpConsensusDraw = sharpDrawOdds.length > 0 ? sharpDrawOdds.sort((a, b) => a - b)[Math.floor(sharpDrawOdds.length / 2)] : null;
    const sharpConsensusAway = sharpAwayOdds.length > 0 ? sharpAwayOdds.sort((a, b) => a - b)[Math.floor(sharpAwayOdds.length / 2)] : null;

    // Calculate 3-way fair value (remove vig from sharp consensus)
    let fairHome = null, fairDraw = null, fairAway = null;
    let fairHomeFractional = null, fairDrawFractional = null, fairAwayFractional = null;

    console.log('=== FAIR VALUE CALCULATION DEBUG ===');
    console.log('Sharp Consensus - Home:', sharpConsensusHome, 'Draw:', sharpConsensusDraw, 'Away:', sharpConsensusAway);
    console.log('Sharp book count:', sharpHomeOdds.length);

    if (sharpConsensusHome && sharpConsensusDraw && sharpConsensusAway) {
      const impliedHome = 1 / sharpConsensusHome;
      const impliedDraw = 1 / sharpConsensusDraw;
      const impliedAway = 1 / sharpConsensusAway;
      const totalImplied = impliedHome + impliedDraw + impliedAway;

      // Remove vig by normalizing to 100%
      const trueImpliedHome = impliedHome / totalImplied;
      const trueImpliedDraw = impliedDraw / totalImplied;
      const trueImpliedAway = impliedAway / totalImplied;

      fairHome = parseFloat((1 / trueImpliedHome).toFixed(2));
      fairDraw = parseFloat((1 / trueImpliedDraw).toFixed(2));
      fairAway = parseFloat((1 / trueImpliedAway).toFixed(2));

      // Convert to fractional odds
      fairHomeFractional = decimalToFractional(fairHome);
      fairDrawFractional = decimalToFractional(fairDraw);
      fairAwayFractional = decimalToFractional(fairAway);

      console.log('Fair Value Calculated - Home:', fairHome, 'Draw:', fairDraw, 'Away:', fairAway);
      console.log('Fair Value Fractional - Home:', fairHomeFractional, 'Draw:', fairDrawFractional, 'Away:', fairAwayFractional);
    } else {
      console.log('Cannot calculate fair value - missing sharp consensus data');
    }
    console.log('====================================');

    // Calculate 3-way vig analysis
    const allHomeOdds = homeOdds.map(o => o.odds);
    const allDrawOdds = drawOdds.map(o => o.odds);
    const allAwayOdds = awayOdds.map(o => o.odds);

    // Calculate individual vig per outcome (comparing average book odds to fair value)
    const avgHomeOdds = allHomeOdds.length > 0 ? allHomeOdds.reduce((a, b) => a + b, 0) / allHomeOdds.length : null;
    const avgDrawOdds = allDrawOdds.length > 0 ? allDrawOdds.reduce((a, b) => a + b, 0) / allDrawOdds.length : null;
    const avgAwayOdds = allAwayOdds.length > 0 ? allAwayOdds.reduce((a, b) => a + b, 0) / allAwayOdds.length : null;

    // Calculate vig for each outcome (Market books)
    const marketVigHome = fairHome && avgHomeOdds ? validateVig(((1 / avgHomeOdds) - (1 / fairHome)) / (1 / fairHome) * 100) : null;
    const marketVigDraw = fairDraw && avgDrawOdds ? validateVig(((1 / avgDrawOdds) - (1 / fairDraw)) / (1 / fairDraw) * 100) : null;
    const marketVigAway = fairAway && avgAwayOdds ? validateVig(((1 / avgAwayOdds) - (1 / fairAway)) / (1 / fairAway) * 100) : null;

    // Calculate vig for each outcome (Sharp books)
    const sharpAvgHome = sharpHomeOdds.length > 0 ? sharpHomeOdds.reduce((a, b) => a + b, 0) / sharpHomeOdds.length : null;
    const sharpAvgDraw = sharpDrawOdds.length > 0 ? sharpDrawOdds.reduce((a, b) => a + b, 0) / sharpDrawOdds.length : null;
    const sharpAvgAway = sharpAwayOdds.length > 0 ? sharpAwayOdds.reduce((a, b) => a + b, 0) / sharpAwayOdds.length : null;

    const sharpVigHome = fairHome && sharpAvgHome ? validateVig(((1 / sharpAvgHome) - (1 / fairHome)) / (1 / fairHome) * 100) : null;
    const sharpVigDraw = fairDraw && sharpAvgDraw ? validateVig(((1 / sharpAvgDraw) - (1 / fairDraw)) / (1 / fairDraw) * 100) : null;
    const sharpVigAway = fairAway && sharpAvgAway ? validateVig(((1 / sharpAvgAway) - (1 / fairAway)) / (1 / fairAway) * 100) : null;

    // Overall market vig (for backwards compatibility)
    let marketVig = null;
    if (allHomeOdds.length > 0) {
      const avgVigs = [];
      for (let i = 0; i < Math.min(allHomeOdds.length, allDrawOdds.length, allAwayOdds.length); i++) {
        const vig = calculateMarketVig(allHomeOdds[i], allAwayOdds[i], allDrawOdds[i]);
        if (vig !== null && isFinite(vig)) {
          avgVigs.push(vig);
        }
      }
      marketVig = avgVigs.length > 0 ? parseFloat((avgVigs.reduce((a, b) => a + b, 0) / avgVigs.length).toFixed(1)) : null;
    }

    // Overall sharp vig (for backwards compatibility)
    let sharpVig = null;
    if (sharpConsensusHome && sharpConsensusDraw && sharpConsensusAway) {
      sharpVig = parseFloat(calculateMarketVig(sharpConsensusHome, sharpConsensusAway, sharpConsensusDraw).toFixed(1));
    }

    // Find EV+ opportunities
    const evOpportunities = [];
    const arbitrageOpportunities = [];

    if (fairHome && fairDraw && fairAway) {
      // Check each bookmaker for EV+
      homeOdds.forEach(book => {
        const ev = ((book.odds / fairHome) - 1) * 100;
        if (ev > 0.3) { // 0.3%+ EV threshold
          evOpportunities.push({
            type: "ev",
            outcome: "Home Win",
            team: event.home_team,
            bookmaker: book.bookmaker,
            bookmakerKey: book.bookmakerKey,
            odds: book.odds,
            fractionalOdds: decimalToFractional(book.odds),
            fairOdds: fairHome,
            ev: parseFloat(ev.toFixed(1)),
            icon: "trending-up"
          });
        }
      });

      drawOdds.forEach(book => {
        const ev = ((book.odds / fairDraw) - 1) * 100;
        if (ev > 0.3) {
          evOpportunities.push({
            type: "ev",
            outcome: "Draw",
            team: "Draw",
            bookmaker: book.bookmaker,
            bookmakerKey: book.bookmakerKey,
            odds: book.odds,
            fractionalOdds: decimalToFractional(book.odds),
            fairOdds: fairDraw,
            ev: parseFloat(ev.toFixed(1)),
            icon: "trending-up"
          });
        }
      });

      awayOdds.forEach(book => {
        const ev = ((book.odds / fairAway) - 1) * 100;
        if (ev > 0.3) {
          evOpportunities.push({
            type: "ev",
            outcome: "Away Win",
            team: event.away_team,
            bookmaker: book.bookmaker,
            bookmakerKey: book.bookmakerKey,
            odds: book.odds,
            fractionalOdds: decimalToFractional(book.odds),
            fairOdds: fairAway,
            ev: parseFloat(ev.toFixed(1)),
            icon: "trending-up"
          });
        }
      });

      // Check for 3-way arbitrage
      const bestHome = Math.max(...homeOdds.map(o => o.odds));
      const bestDraw = Math.max(...drawOdds.map(o => o.odds));
      const bestAway = Math.max(...awayOdds.map(o => o.odds));

      const arbImplied = (1/bestHome) + (1/bestDraw) + (1/bestAway);
      if (arbImplied < 1) {
        const profit = ((1 - arbImplied) * 100);
        arbitrageOpportunities.push({
          type: "arbitrage",
          profit: parseFloat(profit.toFixed(2)),
          outcomes: [
            { outcome: "Home", odds: bestHome, stake: parseFloat((1/bestHome/arbImplied * 100).toFixed(1)) },
            { outcome: "Draw", odds: bestDraw, stake: parseFloat((1/bestDraw/arbImplied * 100).toFixed(1)) },
            { outcome: "Away", odds: bestAway, stake: parseFloat((1/bestAway/arbImplied * 100).toFixed(1)) }
          ]
        });
      }
    }

    // Calculate lowest vig for each outcome (use fair value if available, otherwise sharp consensus)
    const lowestVigHome = findLowestVigForOutcome(homeOdds, fairHome || sharpConsensusHome);
    const lowestVigDraw = findLowestVigForOutcome(drawOdds, fairDraw || sharpConsensusDraw);
    const lowestVigAway = findLowestVigForOutcome(awayOdds, fairAway || sharpConsensusAway);

    // Format opportunities for UI
    const allOpportunities = [...evOpportunities, ...arbitrageOpportunities];
    const hasEvOrArb = allOpportunities.length > 0;

    // Build UI opportunities array
    const uiOpportunitiesArray = [];

    if (hasEvOrArb) {
      // Show EV+ and Arb opportunities
      allOpportunities.slice(0, 3).forEach(opp => {
        uiOpportunitiesArray.push({
          type: opp.type,
          title: opp.type === "ev" ? `${opp.ev}% EV+ ${opp.outcome}` : `${opp.profit}% Arbitrage`,
          description: opp.type === "ev" ? `${opp.bookmaker} • ${opp.fractionalOdds || opp.odds}` : "3-way arbitrage opportunity",
          icon: opp.icon || "dollar-sign",
          percentage: opp.type === "ev" ? opp.ev : opp.profit,
          odds: opp.odds,
          fractionalOdds: opp.fractionalOdds
        });
      });
    } else {
      // No EV+ or Arb - show efficient market message + lowest vig lines
      uiOpportunitiesArray.push({
        type: "efficient",
        title: translate('marketEfficient', locale),
        description: translate('noProfitable', locale),
        icon: "x"
      });

      // Add lowest vig for Home Win
      if (lowestVigHome) {
        uiOpportunitiesArray.push({
          type: "lowvig",
          title: `${translate('lowestVigHomeWin', locale)} ${lowestVigHome.vig}%`,
          description: `${lowestVigHome.bookmaker} • ${lowestVigHome.fractionalOdds}`,
          icon: "dollar-sign",
          vig: lowestVigHome.vig,
          bookmaker: lowestVigHome.bookmaker,
          odds: lowestVigHome.odds,
          fractionalOdds: lowestVigHome.fractionalOdds
        });
      }

      // Add lowest vig for Draw
      if (lowestVigDraw) {
        uiOpportunitiesArray.push({
          type: "lowvig",
          title: `${translate('lowestVigDraw', locale)} ${lowestVigDraw.vig}%`,
          description: `${lowestVigDraw.bookmaker} • ${lowestVigDraw.fractionalOdds}`,
          icon: "dollar-sign",
          vig: lowestVigDraw.vig,
          bookmaker: lowestVigDraw.bookmaker,
          odds: lowestVigDraw.odds,
          fractionalOdds: lowestVigDraw.fractionalOdds
        });
      }

      // Add lowest vig for Away Win
      if (lowestVigAway) {
        uiOpportunitiesArray.push({
          type: "lowvig",
          title: `${translate('lowestVigAwayWin', locale)} ${lowestVigAway.vig}%`,
          description: `${lowestVigAway.bookmaker} • ${lowestVigAway.fractionalOdds}`,
          icon: "dollar-sign",
          vig: lowestVigAway.vig,
          bookmaker: lowestVigAway.bookmaker,
          odds: lowestVigAway.odds,
          fractionalOdds: lowestVigAway.fractionalOdds
        });
      }
    }

    const uiOpportunities = {
      hasOpportunities: hasEvOrArb,
      opportunities: uiOpportunitiesArray.slice(0, 4), // Max 4 items (1 efficient message + 3 lowest vig)
      summary: hasEvOrArb ? `${allOpportunities.length} opportunities` : translate('marketEfficient', locale)
    };

    return {
      teams: `${event.home_team} vs ${event.away_team}`,
      sharpConsensus: {
        moneyline: {
          home: sharpConsensusHome,
          draw: sharpConsensusDraw,
          away: sharpConsensusAway
        }
      },
      fairValue: {
        moneyline: {
          fairHome,
          fairDraw,
          fairAway,
          fairHomeFractional,
          fairDrawFractional,
          fairAwayFractional
        }
      },
      vigAnalysis: {
        moneyline: {
          sharp: validateVig(sharpVig),
          market: validateVig(marketVig),
          // Individual vig per outcome for UI display
          sharpHome: sharpVigHome,
          sharpDraw: sharpVigDraw,
          sharpAway: sharpVigAway,
          marketHome: marketVigHome,
          marketDraw: marketVigDraw,
          marketAway: marketVigAway
        },
        spread: { sharp: null, market: null },
        total: { sharp: null, market: null }
      },
      evOpportunities: uiOpportunities,
      rawEvOpportunities: evOpportunities.slice(0, 5),
      arbitrageOpportunities
    };

  } catch (error) {
    console.error('Error calculating soccer EV opportunities:', error);
    return {
      teams: `${event.home_team} vs ${event.away_team}`,
      sharpConsensus: { moneyline: { home: null, draw: null, away: null } },
      fairValue: { moneyline: { fairHome: null, fairDraw: null, fairAway: null, fairHomeFractional: null, fairDrawFractional: null, fairAwayFractional: null } },
      vigAnalysis: {
        moneyline: { sharp: null, market: null, sharpHome: null, sharpDraw: null, sharpAway: null, marketHome: null, marketDraw: null, marketAway: null },
        spread: { sharp: null, market: null },
        total: { sharp: null, market: null }
      },
      uiOpportunities: {
        hasOpportunities: false,
        opportunities: [{
          type: "efficient",
          title: translate('marketEfficient', locale),
          description: translate('noProfitable', locale),
          icon: "x"
        }],
        summary: translate('marketEfficient', locale)
      }
    };
  }
}

function formatSoccerOddsTable(bookmakers, event) {
  // Select balanced mix of bookmakers (2 sharp, 3 public max)
  const sharpBooks = bookmakers.filter(b => ['pinnacle', 'betfair'].includes(b.key));
  const publicBooks = bookmakers.filter(b => !['pinnacle', 'betfair'].includes(b.key));

  const selectedBooks = [
    ...sharpBooks.slice(0, 2),
    ...publicBooks.slice(0, 3)
  ].slice(0, 5);

  return selectedBooks.map(bookmaker => {
    const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');

    if (!h2hMarket || !h2hMarket.outcomes) {
      return {
        bookmaker: bookmaker.title,
        bookmakerKey: bookmaker.key,
        isSharp: ['pinnacle', 'betfair'].includes(bookmaker.key),
        odds: {
          moneyline: {
            home: null,
            draw: null,
            away: null
          }
        }
      };
    }

    const homeOutcome = h2hMarket.outcomes.find(o => o.name === event.home_team);
    const awayOutcome = h2hMarket.outcomes.find(o => o.name === event.away_team);
    const drawOutcome = h2hMarket.outcomes.find(o => o.name === 'Draw');

    return {
      bookmaker: bookmaker.title,
      bookmakerKey: bookmaker.key,
      isSharp: ['pinnacle', 'betfair'].includes(bookmaker.key),
      odds: {
        moneyline: {
          home: homeOutcome?.price || null,
          draw: drawOutcome?.price || null,
          away: awayOutcome?.price || null,
          homeFractional: homeOutcome?.price ? decimalToFractional(homeOutcome.price) : null,
          drawFractional: drawOutcome?.price ? decimalToFractional(drawOutcome.price) : null,
          awayFractional: awayOutcome?.price ? decimalToFractional(awayOutcome.price) : null
        }
      }
    };
  });
}

// ====================================================================
// NEW KEY INSIGHTS CALCULATION (V2)
// ====================================================================

// Calculate Market Consensus - Convert consensus ML to win probability
// Output format: "65% 76ers" for UI display
function calculateMarketConsensus(marketIntelligence, homeTeam, awayTeam) {
  try {
    const consensusHomeML = marketIntelligence?.bestLines?.consensusHomeML;
    const consensusAwayML = marketIntelligence?.bestLines?.consensusAwayML;
    const consensusDrawML = marketIntelligence?.bestLines?.consensusDrawML;

    // Handle 3-way betting (Soccer)
    if (consensusDrawML && consensusHomeML && consensusAwayML) {
      const impliedHome = 1 / consensusHomeML;
      const impliedDraw = 1 / consensusDrawML;
      const impliedAway = 1 / consensusAwayML;
      const total = impliedHome + impliedDraw + impliedAway;

      // Normalize to 100%
      const homePercent = Math.round((impliedHome / total) * 100);
      const drawPercent = Math.round((impliedDraw / total) * 100);
      const awayPercent = Math.round((impliedAway / total) * 100);

      const favorite = homePercent > awayPercent ? "home" : "away";
      const favoritePercent = Math.max(homePercent, awayPercent);
      const favoriteTeam = favorite === "home" ? homeTeam : awayTeam;

      return {
        display: `${favoritePercent}% ${favoriteTeam}`,
        label: `Market Consensus: ${favoritePercent}% ${favoriteTeam}`,
        teamSide: favorite // "home" or "away"
      };
    }

    // Handle 2-way betting (NFL, NBA, MLB)
    if (consensusHomeML && consensusAwayML) {
      const impliedHome = 1 / consensusHomeML;
      const impliedAway = 1 / consensusAwayML;
      const total = impliedHome + impliedAway;

      // Normalize to 100%
      const homePercent = Math.round((impliedHome / total) * 100);
      const awayPercent = Math.round((impliedAway / total) * 100);

      const favorite = homePercent > 50 ? "home" : "away";
      const favoritePercent = Math.max(homePercent, awayPercent);
      const favoriteTeam = favorite === "home" ? homeTeam : awayTeam;

      return {
        display: `${favoritePercent}% ${favoriteTeam}`,
        teamSide: favorite // "home" or "away"
      };
    }

    return null;
  } catch (error) {
    console.error('Error calculating market consensus:', error);
    return null;
  }
}

// Find Best Value - Highest +EV opportunity OR lowest vig on favorite
// Output format: "Home ML at DK" for UI display
function findBestValue(marketIntelligence, homeTeam, awayTeam) {
  try {
    const opportunities = marketIntelligence?.evOpportunities?.opportunities || [];

    // STEP 1: Check for +EV bets first (type === "ev")
    const evBets = opportunities.filter(opp => opp.type === "ev" && opp.ev);

    if (evBets.length > 0) {
      // Sort by EV and get the best one
      const bestEV = evBets.sort((a, b) => (b.ev || 0) - (a.ev || 0))[0];

      // Determine if it's home or away team
      const isHome = bestEV.team === homeTeam;
      const teamLabel = isHome ? "Home" : "Away";
      const marketType = bestEV.market === "Moneyline" ? "ML" : bestEV.market;

      // Get bookmaker short name (DK, FD, MGM, etc.)
      const bookmakerShort = getBookmakerShortName(bestEV.bookmaker);

      return {
        display: `${teamLabel} ${marketType} at ${bookmakerShort}`,
        teamSide: isHome ? "home" : "away"
      };
    }

    // STEP 2: No +EV found - find lowest vig on market favorite
    const lowVigBets = opportunities.filter(opp => opp.type === "lowvig");

    if (lowVigBets.length > 0) {
      // Get the lowest vig ML bet (market favorite)
      const lowestVigML = lowVigBets
        .filter(opp => opp.title && opp.title.includes("Lowest Vig at") && !opp.title.includes("Spread"))
        .sort((a, b) => (a.vig || 999) - (b.vig || 999))[0];

      if (lowestVigML) {
        const bookmakerShort = getBookmakerShortName(lowestVigML.bookmaker);
        const isHome = lowestVigML.team === homeTeam;
        const teamLabel = isHome ? "Home" : "Away";
        return {
          display: `${teamLabel} ML at ${bookmakerShort}`,
          label: `Best Value: ${teamLabel} ML at ${bookmakerShort}`,
          teamSide: isHome ? "home" : "away"
        };
      }
    }

    // STEP 3: Fallback to bestLines - find best ML for market favorite
    console.log('=== BEST VALUE FALLBACK DEBUG ===');
    console.log('marketIntelligence structure:', JSON.stringify({
      hasBestLines: !!marketIntelligence?.bestLines,
      hasBestLinesArray: !!marketIntelligence?.bestLines?.bestLines,
      bestLinesLength: marketIntelligence?.bestLines?.bestLines?.length
    }));

    const bestLinesArray = marketIntelligence?.bestLines?.bestLines || [];

    // Get consensus to determine market favorite
    const consensusHomeML = marketIntelligence?.bestLines?.consensusHomeML ||
                           marketIntelligence?.consensusHomeML || 0;
    const consensusAwayML = marketIntelligence?.bestLines?.consensusAwayML ||
                           marketIntelligence?.consensusAwayML || 0;

    console.log(`Consensus - Home ML: ${consensusHomeML}, Away ML: ${consensusAwayML}`);

    // Determine favorite (lower odds = favorite)
    const favoriteIsHome = consensusHomeML < consensusAwayML;
    const favoriteTeam = favoriteIsHome ? homeTeam : awayTeam;

    console.log(`Market Favorite: ${favoriteTeam} (${favoriteIsHome ? 'Home' : 'Away'})`);


    // Find best ML line for the favorite (support both moneyline and soccer_win types)
    const mlLines = Array.isArray(bestLinesArray) ?
      bestLinesArray.filter(line => line?.type === "moneyline" || line?.type === "soccer_win") : [];

    console.log(`Found ${mlLines.length} ML/Win lines in bestLines`);
    console.log('ML/Win lines:', JSON.stringify(mlLines, null, 2));

    if (mlLines.length > 0) {
      // Find the line for the market favorite
      const favoriteLine = mlLines.find(line =>
        line.team === favoriteTeam ||
        line.label?.includes(favoriteIsHome ? "Home" : "Away")
      );

      console.log('Favorite line found:', JSON.stringify(favoriteLine));

      if (favoriteLine) {
        const bookmakerShort = getBookmakerShortName(favoriteLine.bookmaker);
        const teamLabel = favoriteIsHome ? "Home" : "Away";

        // For soccer, show fractional odds; for other sports show ML
        const oddsDisplay = favoriteLine.fractionalOdds ? favoriteLine.fractionalOdds : "";

        return {
          display: favoriteLine.type === "soccer_win" ? `${oddsDisplay} at ${bookmakerShort}` : `${teamLabel} ML at ${bookmakerShort}`,
          label: `Best Line: ${teamLabel} at ${bookmakerShort}`,
          teamSide: favoriteIsHome ? "home" : "away"
        };
      }
    }

    console.log('No ML lines found, returning efficient market');
    console.log('===================================');

    // STEP 4: Final fallback - truly efficient market
    return {
      display: "Efficient market",
      label: "Best Value",
      teamSide: null // No team advantage
    };
  } catch (error) {
    console.error('Error finding best value:', error);
    return { display: "Unable to calculate", label: "Best Value", teamSide: null };
  }
}

// Helper function to get short bookmaker names
function getBookmakerShortName(bookmaker) {
  const shortNames = {
    'DraftKings': 'DK',
    'FanDuel': 'FD',
    'BetMGM': 'MGM',
    'Caesars': 'CZR',
    'BetRivers': 'Rivers',
    'Pinnacle': 'Pinnacle',
    'LowVig': 'LowVig',
    'BetOnline.ag': 'BOL',
    'Bovada': 'Bovada',
    'BetUS': 'BetUS',
    'MyBookie.ag': 'MyBookie',
    'Fanatics': 'Fanatics',
    'Hard Rock Bet': 'HardRock',
    'ESPN BET': 'ESPN'
  };

  return shortNames[bookmaker] || bookmaker;
}

// Calculate Offensive Edge - Scoring power differential
// Output format: "+7.2 PPG" for UI display (positive = team1 advantage)
// For soccer: "+1.2 GPG" (Goals Per Game)
function calculateOffensiveEdge(teamStats, homeTeam, awayTeam, sport = 'nfl') {
  try {
    console.log('=== OFFENSIVE EDGE DEBUG ===');
    console.log('Sport:', sport);
    console.log('teamStats.team1.stats keys:', teamStats?.team1?.stats ? Object.keys(teamStats.team1.stats) : 'no stats');
    console.log('teamStats.team1.stats.goals:', JSON.stringify(teamStats?.team1?.stats?.goals, null, 2));
    console.log('teamStats.team1.stats.calculated:', JSON.stringify(teamStats?.team1?.stats?.calculated, null, 2));

    // For soccer, check goals.for.average.total first, then fallback to calculated.pointsPerGame (NFL/NBA)
    const team1PPG = teamStats?.team1?.stats?.goals?.for?.average?.total ||
                     teamStats?.team1?.stats?.calculated?.pointsPerGame || 0;
    const team2PPG = teamStats?.team2?.stats?.goals?.for?.average?.total ||
                     teamStats?.team2?.stats?.calculated?.pointsPerGame || 0;

    console.log(`Team1 PPG: ${team1PPG}, Team2 PPG: ${team2PPG}`);

    const differential = team1PPG - team2PPG;
    const roundedDiff = Math.round(differential * 10) / 10;

    // Always show positive value (absolute) with + sign for the team with advantage
    const absoluteDiff = Math.abs(roundedDiff);

    // Use GPG for soccer, PPG for other sports
    const unit = sport?.includes('soccer') ? 'GPG' : 'PPG';

    const result = {
      display: `+${absoluteDiff} ${unit}`,
      label: "Offensive Edge",
      teamWithAdvantage: differential >= 0 ? "home" : "away" // Track which team has advantage
    };

    console.log('Offensive Edge Result:', result);
    console.log('===========================');

    return result;
  } catch (error) {
    console.error('Error calculating offensive edge:', error);
    return null;
  }
}

// Calculate Defensive Edge - Points allowed differential
// Output format: "-3.7 PPG" for UI display (negative = team1 has better defense)
// For soccer: "-0.8 GPG" (Goals Per Game allowed)
function calculateDefensiveEdge(teamStats, homeTeam, awayTeam, sport = 'nfl') {
  try {
    console.log('=== DEFENSIVE EDGE DEBUG ===');
    console.log('Sport:', sport);
    // For soccer, check goals.against.average.total first, then fallback to calculated.opponentPointsPerGame (NFL/NBA)
    const team1OppPPG = teamStats?.team1?.stats?.goals?.against?.average?.total ||
                        teamStats?.team1?.stats?.calculated?.opponentPointsPerGame || 0;
    const team2OppPPG = teamStats?.team2?.stats?.goals?.against?.average?.total ||
                        teamStats?.team2?.stats?.calculated?.opponentPointsPerGame || 0;

    console.log(`Team1 Opp PPG: ${team1OppPPG}, Team2 Opp PPG: ${team2OppPPG}`);

    // Lower is better for defense, so flip to show "fewer goals/points allowed"
    // Negative value = team1 allows fewer = better defense
    const differential = team1OppPPG - team2OppPPG;
    const roundedDiff = Math.round(differential * 10) / 10;

    // Format with + or - sign
    const sign = roundedDiff > 0 ? "+" : "";

    // Use "GA" (Goals Against) for soccer, "PA" (Points Against) for other sports
    const unit = sport?.includes('soccer') ? 'GA' : 'PA';

    const result = {
      display: `${sign}${roundedDiff} ${unit}`,
      label: "Defensive Edge"
    };

    console.log('Defensive Edge Result:', result);
    console.log('============================');

    return result;
  } catch (error) {
    console.error('Error calculating defensive edge:', error);
    return null;
  }
}

// Master function to calculate all new Key Insights
function calculateKeyInsightsNew(marketIntelligence, teamStats, homeTeam, awayTeam, sport = 'nfl') {
  console.log('=== CALCULATE KEY INSIGHTS NEW ===');
  console.log('Sport:', sport);
  console.log('Home Team:', homeTeam);
  console.log('Away Team:', awayTeam);
  console.log('Has teamStats:', !!teamStats);
  console.log('Has marketIntelligence:', !!marketIntelligence);

  const result = {
    marketConsensus: calculateMarketConsensus(marketIntelligence, homeTeam, awayTeam),
    bestValue: findBestValue(marketIntelligence, homeTeam, awayTeam),
    offensiveEdge: calculateOffensiveEdge(teamStats, homeTeam, awayTeam, sport),
    defensiveEdge: calculateDefensiveEdge(teamStats, homeTeam, awayTeam, sport)
  };

  console.log('Final Key Insights Result:', JSON.stringify(result, null, 2));
  console.log('===================================');

  return result;
}

// ====================================================================
// GAME DATA ENHANCEMENT FOR TEAM STATS
// ====================================================================

function enhanceTeamStatsWithGameData(teamStats, gameData) {
  if (!teamStats || !gameData) return teamStats;

  // Helper to calculate PPG and opponent PPG from last 10 games
  const calculateGameAverages = (games, teamId) => {
    if (!games || games.length === 0) return { ppg: 0, oppPpg: 0, homeAvg: 0, awayAvg: 0 };

    let totalPoints = 0, totalOppPoints = 0, homePoints = 0, awayPoints = 0, homeGames = 0, awayGames = 0;

    games.forEach(game => {
      let teamScore = 0, oppScore = 0, isHome = false;

      // Extract scores based on game structure (NFL vs NBA vs Soccer)
      if (game.teams?.home?.id === parseInt(teamId)) {
        // Team is home
        isHome = true;
        // Soccer structure: score.fulltime.home / score.fulltime.away
        if (game.score?.fulltime?.home !== undefined) {
          teamScore = game.score.fulltime.home || 0;
          oppScore = game.score.fulltime.away || 0;
        }
        // NFL structure: scores.home.total / scores.away.total
        else if (game.scores?.home?.total !== undefined) {
          teamScore = game.scores.home.total || 0;
          oppScore = game.scores.away.total || 0;
        }
        // NBA structure: scores.home.points / scores.visitors.points
        else if (game.scores?.home?.points !== undefined) {
          teamScore = game.scores.home.points || 0;
          oppScore = game.scores.visitors.points || 0;
        }
      } else if (game.teams?.away?.id === parseInt(teamId) || game.teams?.visitors?.id === parseInt(teamId)) {
        // Team is away/visitor
        isHome = false;
        // Soccer structure: score.fulltime.away / score.fulltime.home
        if (game.score?.fulltime?.away !== undefined) {
          teamScore = game.score.fulltime.away || 0;
          oppScore = game.score.fulltime.home || 0;
        }
        // NFL structure
        else if (game.scores?.away?.total !== undefined) {
          teamScore = game.scores.away.total || 0;
          oppScore = game.scores.home.total || 0;
        }
        // NBA structure
        else if (game.scores?.visitors?.points !== undefined) {
          teamScore = game.scores.visitors.points || 0;
          oppScore = game.scores.home.points || 0;
        }
      }

      totalPoints += teamScore;
      totalOppPoints += oppScore;

      if (isHome) {
        homePoints += teamScore;
        homeGames++;
      } else {
        awayPoints += teamScore;
        awayGames++;
      }
    });

    return {
      ppg: games.length > 0 ? totalPoints / games.length : 0,
      oppPpg: games.length > 0 ? totalOppPoints / games.length : 0,
      homeAvg: homeGames > 0 ? homePoints / homeGames : 0,
      awayAvg: awayGames > 0 ? awayPoints / awayGames : 0
    };
  };

  // Helper to extract current momentum from win/loss pattern
  const getCurrentMomentum = (pattern) => {
    if (!pattern) return "No streak";

    const results = pattern.replace(/[()]/g, '').split('-');
    if (results.length === 0) return "No streak";

    const lastResult = results[0]; // Most recent game
    let streak = 1;

    // Count consecutive same results from the start
    for (let i = 1; i < results.length; i++) {
      if (results[i] === lastResult) {
        streak++;
      } else {
        break;
      }
    }

    return `${streak}${lastResult}`;
  };

  // Calculate enhanced metrics for both teams
  const team1Games = gameData.team1_last10games?.last10Games || [];
  const team2Games = gameData.team2_last10games?.last10Games || [];

  const team1Averages = calculateGameAverages(team1Games, teamStats.team1?.teamId);
  const team2Averages = calculateGameAverages(team2Games, teamStats.team2?.teamId);

  // Add calculated metrics to team stats
  if (teamStats.team1?.stats) {
    teamStats.team1.stats.calculated = {
      ...teamStats.team1.stats.calculated,
      pointsPerGame: Math.round(team1Averages.ppg * 10) / 10,
      opponentPointsPerGame: Math.round(team1Averages.oppPpg * 10) / 10,
      homeAverage: Math.round(team1Averages.homeAvg * 10) / 10,
      awayAverage: Math.round(team1Averages.awayAvg * 10) / 10,
      recentForm: gameData.team1_last10games?.winLossRecord?.record || "0-0",
      momentum: getCurrentMomentum(gameData.team1_last10games?.winLossRecord?.pattern)
    };
  }

  if (teamStats.team2?.stats) {
    teamStats.team2.stats.calculated = {
      ...teamStats.team2.stats.calculated,
      pointsPerGame: Math.round(team2Averages.ppg * 10) / 10,
      opponentPointsPerGame: Math.round(team2Averages.oppPpg * 10) / 10,
      homeAverage: Math.round(team2Averages.homeAvg * 10) / 10,
      awayAverage: Math.round(team2Averages.awayAvg * 10) / 10,
      recentForm: gameData.team2_last10games?.winLossRecord?.record || "0-0",
      momentum: getCurrentMomentum(gameData.team2_last10games?.winLossRecord?.pattern)
    };
  }

  return teamStats;
}

// ====================================================================
// PLAYER STATISTICS INTEGRATION FOR MAIN WORKFLOW
// ====================================================================

async function getPlayerStatsForSport(sport, team1Id, team2Id) {
  try {
    console.log(`Fetching player stats for ${sport} - Team1: ${team1Id}, Team2: ${team2Id}`);

    const [team1Players, team2Players] = await Promise.all([
      getSingleTeamPlayerStats(sport, team1Id),
      getSingleTeamPlayerStats(sport, team2Id)
    ]);

    return {
      team1: {
        teamId: team1Id,
        allPlayers: team1Players.players?.allPlayers || [],
        topPlayers: team1Players.players?.topPlayers || getTopPlayersForSport(team1Players.players || [], sport),
        playerCount: (team1Players.players?.allPlayers || team1Players.players || []).length,
        error: team1Players.error
      },
      team2: {
        teamId: team2Id,
        allPlayers: team2Players.players?.allPlayers || [],
        topPlayers: team2Players.players?.topPlayers || getTopPlayersForSport(team2Players.players || [], sport),
        playerCount: (team2Players.players?.allPlayers || team2Players.players || []).length,
        error: team2Players.error
      }
    };

  } catch (error) {
    console.error("Player Stats Integration Error:", error);
    return { error: error.message };
  }
}

async function getSingleTeamPlayerStats(sport, teamId) {
  try {
    const sportLower = sport.toLowerCase();

    // Handle sport detection with startsWith for variants (e.g., soccer_epl, soccer_uefa)
    if (sportLower.includes('nfl') || sportLower === 'ncaaf') {
        // Use StatPal for NFL player stats
        return await getStatPalNFLPlayerStatsTest(teamId);
    } else if (sportLower === 'mlb') {
        // Use StatPal for MLB player stats
        return await getStatPalMLBPlayerStatsTest(teamId);
    } else if (sportLower.startsWith('soccer') || sportLower.includes('football')) {
        // Use API-Sports for soccer player stats
        return await getAPISoccerPlayerStats(teamId);
    } else if (sportLower === 'nba') {
        // Use API-Sports for NBA player stats (when season available)
        return await getAPINBAPlayerStats(teamId);
    } else if (sportLower === 'tennis') {
        // Tennis doesn't have traditional team player stats
        return { players: [], error: null };
    } else {
        return { players: [], error: `Player stats not supported for ${sport}` };
    }
  } catch (error) {
    console.error(`Error fetching player stats for ${sport} team ${teamId}:`, error);
    return { players: [], error: error.message };
  }
}

// API-Sports Soccer Player Stats Function
async function getAPISoccerPlayerStats(teamId) {
  try {
    // Try 2024 season first, fallback to 2023 if no data with stats
    let currentSeason = 2024;
    let apiUrl = `https://v3.football.api-sports.io/players?season=${currentSeason}&team=${teamId}`;

    console.log(`Fetching soccer player stats from: ${apiUrl}`);

    let response = await axios.get(apiUrl, {
      headers: {
        "x-apisports-key": API_SPORTS_KEY
      }
    });

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`Soccer player stats API error:`, response.data.errors);
      return { players: [], error: JSON.stringify(response.data.errors) };
    }

    let players = response.data.response || [];

    // Check if 2024 has actual stats (not just squad list with nulls)
    const hasStatsIn2024 = players.some(p =>
      p.statistics && p.statistics[0] &&
      (p.statistics[0].games?.appearences || 0) > 0
    );

    // If 2024 has no stats, try 2023
    if (!hasStatsIn2024) {
      console.log(`2024 season has no stats yet, trying 2023...`);
      currentSeason = 2023;
      apiUrl = `https://v3.football.api-sports.io/players?season=${currentSeason}&team=${teamId}`;

      response = await axios.get(apiUrl, {
        headers: {
          "x-apisports-key": API_SPORTS_KEY
        }
      });

      players = response.data.response || [];
    }

    if (players.length === 0) {
      console.log(`No soccer player stats found for team ${teamId}`);
      return { players: [], error: null };
    }

    console.log(`Found ${players.length} soccer players for team ${teamId} (Season ${currentSeason})`);

    // Transform to structured format matching NFL
    const transformedPlayers = transformSoccerPlayerData(players);

    return { players: transformedPlayers, error: null };

  } catch (error) {
    console.error(`Error fetching soccer player stats for team ${teamId}:`, error);
    return { players: [], error: error.message };
  }
}

// Transform Soccer Player Data to structured format (like NFL)
function transformSoccerPlayerData(playersData) {
  // Filter players with actual game time and stats
  const playersWithStats = playersData.filter(p => {
    if (!p.statistics || p.statistics.length === 0) return false;

    // Find the stat entry with most appearances (could have multiple leagues)
    const bestStat = p.statistics.reduce((best, current) => {
      const currentApps = current.games?.appearences || 0;
      const bestApps = best?.games?.appearences || 0;
      return currentApps > bestApps ? current : best;
    }, p.statistics[0]);

    // Must have at least 1 appearance OR goals/assists
    const hasAppearances = (bestStat.games?.appearences || 0) > 0;
    const hasContributions = (bestStat.goals?.total || 0) > 0 || (bestStat.goals?.assists || 0) > 0;

    return hasAppearances || hasContributions;
  });

  const topPlayers = playersWithStats
    .map(player => {
      // Get the stat entry with most appearances
      const stats = player.statistics.reduce((best, current) => {
        const currentApps = current.games?.appearences || 0;
        const bestApps = best?.games?.appearences || 0;
        return currentApps > bestApps ? current : best;
      }, player.statistics[0]);

      const goals = stats.goals?.total || 0;
      const assists = stats.goals?.assists || 0;
      const contribution = goals + assists;

      return { player, stats, contribution };
    })
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 10)
    .map(({ player, stats }) => {
      const goals = stats.goals?.total || 0;
      const assists = stats.goals?.assists || 0;
      const appearances = stats.games?.appearences || 1;
      const minutes = stats.games?.minutes || 0;

      return {
        id: player.player.id,
        name: player.player.name,
        position: stats.games?.position || "Forward",
        category: "Attacking",
        stats: {
          goals: goals,
          assists: assists,
          goalsPerGame: parseFloat((goals / appearances).toFixed(1)),
          minutesPerGoal: goals > 0 ? Math.round(minutes / goals) : 0,
          keyPasses: stats.passes?.key || 0,
          yellowCards: stats.cards?.yellow || 0,
          redCards: stats.cards?.red || 0,
          shotAccuracy: stats.shots?.total > 0 ?
            Math.round((stats.shots?.on || 0) / stats.shots?.total * 100) : 0,
          passAccuracy: stats.passes?.accuracy || 0,
          appearances: appearances,
          minutes: minutes,
          shotsTotal: stats.shots?.total || 0,
          shotsOnTarget: stats.shots?.on || 0
        }
      };
    });

  return {
    topPlayers,
    allPlayers: playersData
  };
}

// API-Sports NBA Player Stats Function
async function getAPINBAPlayerStats(teamId) {
  try {
    const currentSeason = 2024; // Use 2024 season for NBA
    const apiUrl = `https://v2.nba.api-sports.io/players/statistics?season=${currentSeason}&team=${teamId}`;

    console.log(`Fetching NBA player stats from: ${apiUrl}`);

    const response = await axios.get(apiUrl, {
      headers: {
        "x-rapidapi-host": "v2.nba.api-sports.io",
        "x-rapidapi-key": API_SPORTS_KEY
      }
    });

    if (response.data.errors && Object.keys(response.data.errors).length > 0) {
      console.error(`NBA player stats API error:`, response.data.errors);
      return { players: [], error: JSON.stringify(response.data.errors) };
    }

    if (!response.data.response || response.data.response.length === 0) {
      console.log(`No NBA player stats found for team ${teamId}`);
      return { players: [], error: null };
    }

    const players = response.data.response;
    console.log(`Found ${players.length} NBA players for team ${teamId}`);

    // Transform NBA players to structured format
    const transformedPlayers = transformNBAPlayerData(players);

    console.log(`NBA Transform Results - Top Players: ${transformedPlayers.topPlayers.length}`);
    console.log(`First top player:`, JSON.stringify(transformedPlayers.topPlayers[0], null, 2));
    console.log(`Unique player IDs:`, [...new Set(transformedPlayers.topPlayers.map(p => p.id))]);

    return { players: transformedPlayers, error: null };

  } catch (error) {
    console.error(`Error fetching NBA player stats for team ${teamId}:`, error);
    return { players: [], error: error.message };
  }
}

// Transform NBA Player Data to structured format (like NFL/Soccer)
function transformNBAPlayerData(playersData) {
  // Group by player ID and aggregate stats
  const playerMap = new Map();

  playersData.forEach(gameData => {
    if (!gameData.player) return;

    const playerId = gameData.player.id;

    if (!playerMap.has(playerId)) {
      playerMap.set(playerId, {
        player: gameData.player,
        position: gameData.pos,
        games: [],
        totalPoints: 0,
        totalReb: 0,
        totalAst: 0,
        totalStl: 0,
        totalBlk: 0,
        totalTo: 0,
        totalFgm: 0,
        totalFga: 0,
        totalTpm: 0,
        totalTpa: 0,
        totalFtm: 0,
        totalFta: 0,
        totalMin: 0
      });
    }

    const playerStats = playerMap.get(playerId);
    playerStats.games.push(gameData);
    playerStats.totalPoints += gameData.points || 0;
    playerStats.totalReb += gameData.totReb || 0;
    playerStats.totalAst += gameData.assists || 0;
    playerStats.totalStl += gameData.steals || 0;
    playerStats.totalBlk += gameData.blocks || 0;
    playerStats.totalTo += gameData.turnovers || 0;
    playerStats.totalFgm += gameData.fgm || 0;
    playerStats.totalFga += gameData.fga || 0;
    playerStats.totalTpm += gameData.tpm || 0;
    playerStats.totalTpa += gameData.tpa || 0;
    playerStats.totalFtm += gameData.ftm || 0;
    playerStats.totalFta += gameData.fta || 0;
    playerStats.totalMin += parseInt(gameData.min) || 0;
  });

  // Convert to array and calculate averages
  const aggregatedPlayers = Array.from(playerMap.values()).map(p => {
    const gamesPlayed = p.games.length;

    return {
      id: p.player.id,
      name: p.player.firstname + " " + p.player.lastname,
      position: p.position || "Guard",
      gamesPlayed,
      avgPoints: gamesPlayed > 0 ? p.totalPoints / gamesPlayed : 0,
      stats: {
        pointsAverage: gamesPlayed > 0 ? parseFloat((p.totalPoints / gamesPlayed).toFixed(1)) : 0,
        reboundsAverage: gamesPlayed > 0 ? parseFloat((p.totalReb / gamesPlayed).toFixed(1)) : 0,
        assistsAverage: gamesPlayed > 0 ? parseFloat((p.totalAst / gamesPlayed).toFixed(1)) : 0,
        stealsAverage: gamesPlayed > 0 ? parseFloat((p.totalStl / gamesPlayed).toFixed(1)) : 0,
        blocksAverage: gamesPlayed > 0 ? parseFloat((p.totalBlk / gamesPlayed).toFixed(1)) : 0,
        turnoversAverage: gamesPlayed > 0 ? parseFloat((p.totalTo / gamesPlayed).toFixed(1)) : 0,
        fgPercentage: p.totalFga > 0 ? parseFloat(((p.totalFgm / p.totalFga) * 100).toFixed(1)) : 0,
        threePtPercentage: p.totalTpa > 0 ? parseFloat(((p.totalTpm / p.totalTpa) * 100).toFixed(1)) : 0,
        ftPercentage: p.totalFta > 0 ? parseFloat(((p.totalFtm / p.totalFta) * 100).toFixed(1)) : 0,
        usagePercentage: 0,
        gamesPlayed: gamesPlayed,
        minutes: gamesPlayed > 0 ? Math.round(p.totalMin / gamesPlayed) : 0
      }
    };
  });

  // Sort by average points and get top 10
  const topPlayers = aggregatedPlayers
    .filter(p => p.avgPoints > 5)
    .sort((a, b) => b.avgPoints - a.avgPoints)
    .slice(0, 10);

  return {
    topPlayers,
    allPlayers: playersData
  };
}

// StatPal MLB Player Stats Function (reuse existing)
async function getStatPalMLBPlayerStatsTest(teamId) {
  try {
    // Need to convert team ID to team code for StatPal
    const teamCode = await getMLBTeamCodeForStatPal(teamId);
    if (!teamCode) {
      return { players: [], error: "Could not find team code for StatPal MLB Player API" };
    }

    const apiUrl = `https://statpal.io/api/v1/mlb/player-stats/${teamCode}?access_key=${STATPAL_API_KEY}`;

    console.log(`Fetching MLB player stats from StatPal: ${apiUrl}`);

    const response = await axios.get(apiUrl);

    if (response.status !== 200) {
      return { players: [], error: `StatPal MLB Player API returned status ${response.status}` };
    }

    if (!response.data || !response.data.statistics) {
      return { players: [], error: "No statistics data in StatPal MLB Player response" };
    }

    const stats = response.data.statistics;
    console.log(`Found StatPal MLB player stats for team code ${teamCode}`);

    // Transform StatPal MLB player data to structured format
    const transformedPlayers = transformStatPalMLBPlayerData(stats);

    return { players: transformedPlayers, error: null };

  } catch (error) {
    console.error(`Error fetching StatPal MLB player stats for team ${teamId}:`, error);
    return { players: [], error: error.message };
  }
}

// Transform StatPal MLB player data
function transformStatPalMLBPlayerData(statpalStats) {
  const categories = statpalStats.category || [];

  // Find batting category
  const batting = categories.find(c => c.name === "Batting");
  const pitching = categories.find(c => c.name === "Pitching");

  const topPlayers = [];

  // Get top 3 batters (highest OPS)
  if (batting?.team?.player?.length > 0) {
    const topBatters = batting.team.player
      .filter(p => parseInt(p.at_bats || 0) > 50) // Minimum AB threshold
      .sort((a, b) => {
        const aOPS = parseFloat(a.on_base_percentage || 0) + parseFloat(a.slugging_percentage || 0);
        const bOPS = parseFloat(b.on_base_percentage || 0) + parseFloat(b.slugging_percentage || 0);
        return bOPS - aOPS;
      })
      .slice(0, 2); // Top 2 batters

    topBatters.forEach(player => {
      topPlayers.push({
        id: player.id,
        name: player.name,
        position: "Batter",
        category: "Batting",
        stats: {
          battingAvg: parseFloat(player.batting_avg || 0),
          homeRuns: parseInt(player.home_runs || 0),
          rbi: parseInt(player.runs_batted_in || 0),
          runs: parseInt(player.runs || 0),
          hits: parseInt(player.hits || 0),
          stolenBases: parseInt(player.stolen_bases || 0),
          onBasePercentage: parseFloat(player.on_base_percentage || 0),
          sluggingPercentage: parseFloat(player.slugging_percentage || 0),
          ops: parseFloat(player.on_base_percentage || 0) + parseFloat(player.slugging_percentage || 0)
        }
      });
    });
  }

  // Get top pitcher (lowest ERA)
  if (pitching?.team?.player?.length > 0) {
    const topPitcher = pitching.team.player
      .filter(p => parseFloat(p.innings_pitched || 0) > 20) // Minimum IP threshold
      .sort((a, b) => parseFloat(a.earned_run_average || 999) - parseFloat(b.earned_run_average || 999))[0];

    if (topPitcher) {
      topPlayers.push({
        id: topPitcher.id,
        name: topPitcher.name,
        position: "Pitcher",
        category: "Pitching",
        stats: {
          era: parseFloat(topPitcher.earned_run_average || 0),
          wins: parseInt(topPitcher.wins || 0),
          losses: parseInt(topPitcher.losses || 0),
          strikeouts: parseInt(topPitcher.strikeouts || 0),
          walks: parseInt(topPitcher.walks || 0),
          whip: parseFloat(topPitcher.walk_hits_per_inning_pitched || 0),
          inningsPitched: parseFloat(topPitcher.innings_pitched || 0),
          saves: parseInt(topPitcher.saves || 0)
        }
      });
    }
  }

  return {
    team: statpalStats.team,
    season: statpalStats.season,
    topPlayers,
    allCategories: {
      batting: batting?.team?.player || [],
      pitching: pitching?.team?.player || []
    }
  };
}

// Generic top players function for all sports
function getTopPlayersForSport(players, sport) {
  if (!players || players.length === 0) return [];

  const sportLower = sport.toLowerCase();

  // Handle NFL/NCAAF
  if (sportLower.includes('nfl') || sportLower === 'ncaaf') {
      // StatPal data already has topPlayers from transform function
      return players.topPlayers || [];
  }

  // Handle MLB
  if (sportLower === 'mlb') {
      // StatPal data already has topPlayers from transform function
      return players.topPlayers || [];
  }

  // Handle Soccer (all variants: soccer, soccer_epl, soccer_uefa, etc.)
  if (sportLower.startsWith('soccer') || sportLower.includes('football')) {
      // API-Sports data - sort by goals + assists
      return players
        .filter(p => p.statistics && p.statistics[0] && (p.statistics[0].games?.appearences || 0) > 5)
        .sort((a, b) => {
          const aContrib = (a.statistics[0].goals?.total || 0) + (a.statistics[0].goals?.assists || 0);
          const bContrib = (b.statistics[0].goals?.total || 0) + (b.statistics[0].goals?.assists || 0);
          return bContrib - aContrib;
        })
        .slice(0, 10);
  }

  // Handle NBA
  if (sportLower === 'nba') {
      // API-Sports data - sort by points per game
      return players
        .filter(p => p.statistics && p.statistics.points && p.statistics.points.average > 5)
        .sort((a, b) => (b.statistics.points.average || 0) - (a.statistics.points.average || 0))
        .slice(0, 10);
  }

  // Default fallback
      return players.slice(0, 10);
}

// ====================================================================
// TEMPORARY HELPER: Copy Analysis to French Demo Document
// ====================================================================
exports.updateFrenchDemoAnalysis = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const sourceAnalysisId = '8q4tR1o645gY3pJsZua4';
    const targetDemoId = 'WxmvWHRNBCrULv7uuKeV';
    const sourceUserId = 'MTxoKPLMfIcm8UOXWpJuvXEpyL22'; // Your user ID
    const demoUserId = 'piWQIzwI9tNXrNTgb5dWTqAjUrj2';

    console.log(`Copying analysis ${sourceAnalysisId} from user ${sourceUserId} to French demo ${targetDemoId}`);

    // Read source analysis from your user's collection
    const sourceRef = db.collection('userAnalyses').doc(sourceUserId).collection('analyses').doc(sourceAnalysisId);
    const sourceDoc = await sourceRef.get();

    if (!sourceDoc.exists) {
      return res.status(404).json({
        error: 'Source analysis not found',
        sourceAnalysisId,
        sourceUserId
      });
    }

    const sourceData = sourceDoc.data();

    // Read current demo document to preserve certain fields
    const targetRef = db.collection('userAnalyses').doc(demoUserId).collection('analyses').doc(targetDemoId);
    const targetDoc = await targetRef.get();

    let preservedData = {};
    if (targetDoc.exists) {
      const targetData = targetDoc.data();
      // Preserve fields that shouldn't be overwritten
      preservedData = {
        createdAt: targetData.createdAt, // Keep original creation time
      };
    }

    // Sanitize the analysis data (remove undefined/null that Firestore doesn't like)
    const sanitizeForFirestore = (obj) => {
      if (obj === null || obj === undefined) return null;
      if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
      if (typeof obj === 'object') {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined && value !== null && key !== '') {
            cleaned[key] = sanitizeForFirestore(value);
          }
        }
        return cleaned;
      }
      return obj;
    };

    // Prepare the data to write
    const dataToWrite = {
      ...sanitizeForFirestore(sourceData),
      ...preservedData,
      // Ensure we keep the demo structure
      teams: sourceData.teams,
      confidence: sourceData.confidence,
      sport: sourceData.sport,
      imageUrl: sourceData.imageUrl,
      analysis: sanitizeForFirestore(sourceData.analysis),
    };

    // Write to the French demo document
    await targetRef.set(dataToWrite, { merge: false }); // Complete overwrite

    console.log(`✅ Successfully copied analysis to French demo ${targetDemoId}`);

    res.status(200).json({
      success: true,
      message: 'French demo analysis updated successfully',
      sourceAnalysisId,
      targetDemoId,
      teams: sourceData.teams,
      sport: sourceData.sport
    });

  } catch (error) {
    console.error('Error updating French demo analysis:', error);
    res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});
