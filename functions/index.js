const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const stringSimilarity = require("string-similarity");
const { parse } = require("path");
const fs = require("fs");
const path = require("path");
require('dotenv').config();


const ODDS_API_KEY = process.env.ODDS_API_KEY;
const API_SPORTS_KEY = process.env.API_SPORTS_KEY;
const STATPAL_API_KEY = process.env.STATPAL_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const TENNIS_API_KEY = process.env.TENNIS_API_KEY || '2cf2f7d9e8e9d7ea2ab285677a6a0e7f45d05b4275bbd0b741343a9277586e26';



admin.initializeApp();
const db = admin.firestore();
const CACHE_EXPIRY_TIME = 36 * 60 * 60 * 1000; // 36 hours in milliseconds

/**
 * Converts JSON data to a more token-efficient markdown format
 * @param {Object} json - The JSON object to convert
 * @param {number} maxDepth - Maximum nesting depth (default: 3)
 * @param {number} currentDepth - Current depth (used internally)
 * @param {boolean} isArrayItem - Whether the current item is part of an array (used internally)
 * @returns {string} Markdown formatted string
 */


exports.analyzeImage = functions.https.onRequest(async (req, res) => {
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
          const [oddsData, gameData] = await Promise.all([
            sport === 'tennis' ?
              getTennisOddsData(team1Id, team2Id, team1, team2) :
              getOddsData(sport_type_odds, team1, team2, team1_code, team2_code, locale),
            getGameData(sport, team1Id, team2Id, team1_code, team2_code, team1StatpalCode, team2StatpalCode)
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
          console.log("=== END AI PROMPT DATA ===");

          const prompt = `
          Task Overview:
          You are an expert sports betting analyst.
          Your job is to generate a final AI Betting Insight for a specific sports event, using structured data collected from multiple sources.
          Like odds data, key insights, match data, last 10 matches, h2h games, injuries, upcoming game, weather forecast.

          Your tone should be sharp, real, and slightly degenerate — like a bettor who's been in the trenches. Avoid corporate or generic phrasing. Speak like someone explaining edge to a fellow bettor over Discord or in a sharp betting groupchat. Inject urgency when there's mispricing, and confidence when everything lines up. If the public is lost, say it. If the sharps are sniping, flag it. If it's a trap, expose it.

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
            // Return the JSON object immediately without waiting for cache save
            res.status(200).json(jsonResponse);

            // Save the analysis to cache asynchronously after sending response
            console.log(`Saving analysis to cache for ${sport} match between team ${team1Id} and team ${team2Id} with locale ${locale}`);
            saveAnalysisToCache(sport, team1Id, team2Id, jsonResponse, locale)
              .catch(error => console.error("Error saving to cache:", error));

               // Verify cache is immediately retrievable
            await verifyCacheRetrieval(sport, team1Id, team2Id, locale);
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

    // Determine the correct JSON file path based on the sport
    switch (normalizedSport) {
        case 'nba':
            teamFilePath = path.join(__dirname, 'nba_teams.json');
            sport_type_odds = 'basketball_nba';
            break;
        case 'mlb':
            teamFilePath = path.join(__dirname, 'mlb_teams.json');
            sport_type_odds = 'baseball_mlb';
            break;
        case 'nfl':
            teamFilePath = path.join(__dirname, 'nfl_teams.json');
            sport_type_odds = 'americanfootball_nfl';
            break;
        case 'ncaaf':
            teamFilePath = path.join(__dirname, 'ncaaf_teams.json');
            sport_type_odds = 'americanfootball_ncaaf';
            break;
        case 'soccer':
            teamFilePath = path.join(__dirname, 'soccer_teams.json');
            sport_type_odds = soccer_odds_type || 'soccer_epl';
            break;
        case 'mma':
            teamFilePath = path.join(__dirname, 'mma_fighters.json');
            sport_type_odds = 'mma_mixed_martial_arts';
            break;
        case 'tennis':
            teamFilePath = path.join(__dirname, 'tennis_players.json');
            sport_type_odds = 'tennis';
            break;
        default:
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
                    "x-apisports-key": API_KEY,
                    "x-rapidapi-host": config.host
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
        last10Games: latest10FinishedGames.slice(0, 2), // Include just 2 games for context in debugging
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
                "x-apisports-key": API_KEY,
                 // Include host if required by the API provider
                "x-rapidapi-host": config.host
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
            // Include just 2 games for context in debugging
            h2hGames: latest10FinishedGames.slice(0, 2),
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

      // Check if cache is still valid (not expired) and language matches
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
