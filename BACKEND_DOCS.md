# 📚 Backend Functions Documentation

## Overview

This document explains the structure and functionality of `/functions/index.js` - the heart of Bet.AI's backend infrastructure. The file contains **6,230+ lines** of Firebase Cloud Functions that power the entire betting analysis platform.

**Tech Stack:**
- **Runtime:** Node.js v22 (serverless on Firebase Cloud Functions)
- **Key Libraries:** Firebase Admin, OpenAI API, Axios, Cheerio, String Similarity
- **External APIs:** The Odds API, API-Sports, StatPal, OpenWeather, Tennis API

---

## 📖 Table of Contents

1. [Setup & Configuration](#1-setup--configuration)
2. [Main Edge Functions](#2-main-edge-functions)
3. [Core Helper Functions](#3-core-helper-functions)
4. [Market Intelligence Functions](#4-market-intelligence-functions)
5. [Team & Player Statistics Functions](#5-team--player-statistics-functions)
6. [Data Transformation & Utilities](#6-data-transformation--utilities)

---

## 1. Setup & Configuration

**Lines: 1-34**

### Environment Setup
```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
```

### API Keys (from .env)
- `ODDS_API_KEY` - The Odds API for betting lines
- `API_SPORTS_KEY` - API-Sports for game data (NBA, MLB, NFL, Soccer)
- `STATPAL_API_KEY` - StatPal API for advanced team/player stats
- `OPENAI_API_KEY` - OpenAI GPT-4 for AI analysis
- `WEATHER_API_KEY` - OpenWeather for game conditions
- `TENNIS_API_KEY` - Tennis stats and fixtures

### Constants
- `CACHE_EXPIRY_TIME` - 36 hours (analysis cache duration)

---

## 2. Main Edge Functions

These are the **primary HTTP endpoints** that the React Native app calls.

---

### 2.1 `analyzeImage`
**Lines: 35-495**
**Endpoint:** `POST /analyzeImage`

**Purpose:** The main bet analysis workflow - users upload a bet slip image and receive complete AI-powered betting insights.

**Flow:**
1. **Image → Text (OCR via GPT-4 Vision)**
   - Extracts team names, sport, team codes from bet slip image
   - Returns structured JSON: `{sport, team1, team2, team1_code, team2_code, soccer_odds_type}`
   - Handles multi-sport: NBA, MLB, NFL, Soccer, MMA, Tennis

2. **Team ID Resolution**
   - Calls `findTeamIds()` to match team names to database IDs
   - Uses fuzzy matching for team name variants

3. **Cache Check**
   - Calls `checkCacheForMatch()` to see if analysis exists
   - Respects locale (en, es, fr)
   - Returns cached data if found and language matches

4. **Data Fetching (if no cache hit)**
   - Runs 5 parallel API calls using `Promise.all()`:
     ```javascript
     [oddsData, gameData, marketIntelligence, teamStats, playerStats]
     ```
   - Also fetches weather data if venue available

5. **AI Analysis Generation**
   - Sends massive prompt to OpenAI GPT-4o with all collected data
   - AI returns structured JSON with:
     - Key Insights (confidence, market activity, line shifts)
     - Match Snapshot (recent performance, H2H, momentum)
     - X-Factors (injuries, weather, officiating, fatigue)
     - AI Analysis (confidence score, betting signal, breakdown)

6. **Response & Caching**
   - Returns complete analysis to app immediately
   - Saves analysis to Firestore cache asynchronously
   - Cache key format: `${sport}_${team1Id}_${team2Id}_${locale}`

**Locale Support:**
- Supports `en`, `es`, `fr` via `locale` parameter
- AI responds in requested language
- Maintains separate cache per locale

**Error Handling:**
- Returns `error_no_team` if < 2 teams detected
- Graceful fallbacks for missing data sections

---

### 2.2 `chatWithGPT`
**Lines: 498-531**
**Endpoint:** `POST /chatWithGPT`

**Purpose:** Powers the AI chatbot feature where users can debate bets with AI.

**Flow:**
1. Receives `messages` array (chat history)
2. Sends to OpenAI GPT-4 with conversation context
3. Returns AI response in real-time

**Usage:**
```javascript
{
  messages: [
    { role: "user", content: "Why did you pick the Lakers?" },
    { role: "assistant", content: "Based on..." }
  ]
}
```

---

### 2.3 `populateTennisPlayers`
**Lines: 2700-2883**
**Endpoint:** `GET /populateTennisPlayers`

**Purpose:** Maintenance endpoint to populate/update tennis player database from Tennis API.

**Flow:**
1. Fetches players from multiple tennis tournaments
2. Merges with existing `tennis_players.json`
3. De-duplicates by player ID
4. Returns count of new players added

**Note:** Admin-only function for data management.

---

### 2.4 `saveExternalAnalysis`
**Lines: 2886-2988**
**Endpoint:** `POST /saveExternalAnalysis`

**Purpose:** API endpoint for external systems to inject pre-analyzed game data into cache.

**Flow:**
1. Validates API key (`x-api-key` header)
2. Validates sport and team names
3. Calls `findTeamIds()` to get internal IDs
4. Saves to Firestore cache using same structure as `analyzeImage`

**Use Case:** Pre-populate cache with expert analysis from external sources.

**Security:** Requires `BET_AI_API_KEY` environment variable.

---

### 2.5 `marketIntelligence`
**Lines: 2995-3080**
**Endpoint:** `POST /marketIntelligence`

**Purpose:** NEW - Dedicated endpoint for Market Intelligence, Team Stats, and Player Stats screens.

**Flow:**
1. Accepts `{sport, team1, team2, team1_code, team2_code}`
2. Gets team IDs via `findTeamIds()`
3. Fetches 4 data sources in parallel:
   ```javascript
   [marketIntelligence, teamStats, playerStats, gameData]
   ```
4. Enhances team stats with calculated metrics from game data
5. Returns structured response matching `analyzeImage` format

**Response Structure:**
```javascript
{
  sport: "nfl",
  teams: { home: "Ravens", away: "Chiefs" },
  marketIntelligence: {
    bestLines: {...},
    sharpMeter: {...},
    vigAnalysis: {...},
    evOpportunities: [...]
  },
  teamStats: {
    team1: { stats: {...}, calculated: { ppg, momentum } },
    team2: { stats: {...}, calculated: { ppg, momentum } }
  },
  playerStats: {
    team1: { topPlayers: [...], allPlayers: [...] },
    team2: { topPlayers: [...], allPlayers: [...] }
  },
  gameData: { team1_last10games, team2_last10games, h2h_games }
}
```

**Why Separate Endpoint?**
- App can fetch market intel without re-running full AI analysis
- Faster load times for dedicated Market Intel screen
- Reduces OpenAI API costs

---

## 3. Core Helper Functions

These functions support the main edge functions and handle critical business logic.

---

### 3.1 `findTeamIds()`
**Lines: 534-815**

**Purpose:** Matches team names from user input to internal database IDs across multiple sports.

**Parameters:**
- `sport` - Sport type (nba, mlb, nfl, soccer, mma, tennis)
- `team1Name`, `team1Code` - Team 1 identifiers
- `team2Name`, `team2Code` - Team 2 identifiers
- `soccer_odds_type` - Specific league for soccer (optional)

**How it Works:**
1. **Determines JSON file** based on sport:
   - NBA → `nba_teams.json`
   - NFL → `nfl_teams.json`
   - Soccer → `soccer_teams.json`
   - Tennis → `tennis_players.json`
   - MMA → `mma_fighters.json`

2. **Fuzzy Matching Algorithm:**
   - Normalizes team names (removes special chars, lowercase)
   - Calculates match score using:
     - String similarity (Levenshtein distance)
     - Code matching (3-letter codes like "LAL", "GSW")
     - Name variants matching
   - Returns best matches above threshold (0.6 similarity)

3. **Returns:**
   ```javascript
   {
     team1Id: "1234",
     team2Id: "5678",
     team1StatpalCode: "LAL",
     team2StatpalCode: "GSW",
     sport_type_odds: "basketball_nba"
   }
   ```

**Error Handling:** Returns `null` IDs if teams not found.

---

### 3.2 Game Data Functions

#### `getLatest10Games()`
**Lines: 879-1141**

**Purpose:** Fetches last 10 games for a team from API-Sports.

**Flow:**
1. Determines current season based on sport
2. Calls API-Sports endpoint for team's games
3. Filters to only completed games
4. Falls back to previous season if < 4 games found
5. Returns array of game objects

**Sports Supported:** NBA, MLB, NFL, Soccer

---

#### `getWinLossRecord()`
**Lines: 816-878**

**Purpose:** Calculates win/loss record from game history.

**Returns:**
```javascript
{
  record: "7-3",        // W-L format
  pattern: "(W-W-L-W-W-L-W-W-W-L)",  // Visual pattern
  wins: 7,
  losses: 3
}
```

**Logic:**
- Determines winner by comparing scores
- Sport-agnostic (works for all sports)

---

#### `getHeadToHeadGames()`
**Lines: 1214-1375**

**Purpose:** Fetches historical matchups between two teams.

**Flow:**
1. Fetches both teams' game histories
2. Filters to games where they played each other
3. Calculates H2H record via `getHeadToHeadRecord()`
4. Returns recent H2H games + summary

---

#### `getGameData()`
**Lines: 1376-1483**

**Purpose:** Master function that aggregates all game data for a matchup.

**Returns:**
```javascript
{
  team1_last10games: { winLossRecord, last10Games: [...] },
  team2_last10games: { winLossRecord, last10Games: [...] },
  h2h_games: { h2hRecord, h2hGames: [...] },
  team1_injuries: [...],
  team2_injuries: [...],
  upcomingGame: {...}
}
```

**Note:** This is a critical aggregation function used by both `analyzeImage` and `marketIntelligence`.

---

### 3.3 Injury Functions

#### `getTeamInjuries()`
**Lines: 1484-1520**

Routes to sport-specific injury functions:
- NFL → `nflInjuries()`
- Soccer → `soccerInjuries()`

---

#### `soccerInjuries()`
**Lines: 1521-1631**

**Purpose:** Fetches injured/suspended players for soccer teams.

**Data Source:** API-Sports `/injuries` endpoint

**Returns:**
```javascript
[
  {
    player: { name: "Kevin De Bruyne" },
    injury: { reason: "Hamstring", type: "Injury" }
  }
]
```

---

#### `nflInjuries()`
**Lines: 1632-1697**

**Purpose:** Scrapes NFL injury reports from web.

**Method:** Uses Cheerio to parse HTML tables from injury report websites.

**Returns:** Similar structure to soccer injuries.

---

### 3.4 Odds & Betting Data Functions

#### `getOddsData()`
**Lines: 1841-1937**

**Purpose:** Fetches betting odds from The Odds API for traditional sports (NBA, NFL, MLB, Soccer).

**Flow:**
1. Constructs API URL with sport and markets (h2h, spreads, totals)
2. Fetches from The Odds API
3. Uses `fuzzyMatchTeam()` to find correct event
4. Calls `getKeyInsightsFromOdds()` to extract insights
5. Returns odds data + key insights

**Markets Fetched:**
- Moneyline (h2h)
- Spreads
- Totals (over/under)

---

#### `getTennisOddsData()`
**Lines: 2082-2183**

**Purpose:** Special function for tennis odds (different API).

**Flow:**
1. Fetches tennis events from The Odds API
2. Matches players by name
3. Returns tennis-specific odds structure (only h2h, no spreads)

---

#### `getKeyInsightsFromOdds()` / `getKeyInsightsFromTennisOdds()`
**Lines: 2184-2259 (tennis version shown)**

**Purpose:** Extracts market insights from raw odds data.

**Calculates:**
- Public vs. Sharp percentages (based on sharp books like Pinnacle)
- Market activity (number of bookmakers offering odds)
- Line shifts (opening vs. current lines)

**Returns:**
```javascript
{
  confidence: "High",
  marketActivity: "Heavy",
  lineShift: "Moderate",
  publicVsSharps: { public: 65, sharps: 35 }
}
```

---

### 3.5 Weather Function

#### `getWeatherForecast()`
**Lines: 1698-1768**

**Purpose:** Fetches weather forecast for game venue.

**Data Source:** OpenWeather API

**Returns:**
```javascript
{
  date: "2024-10-20",
  temperature: { fahrenheit: 72, celsius: 22 },
  conditions: "Partly cloudy",
  precipitation: 10,
  wind: { speed: 12, direction: "NW" },
  humidity: 65
}
```

**Impact:** Used in X-Factors analysis to identify weather-affected games.

---

### 3.6 Cache Functions

#### `checkCacheForMatch()`
**Lines: 1938-2009**

**Purpose:** Checks Firestore for existing analysis.

**Cache Key Format:**
```
analyses/${sport}_${team1Id}_${team2Id}_${locale}
```

**Logic:**
1. Queries Firestore with cache key
2. Checks if document exists
3. Validates cache age (< 36 hours)
4. Returns cached data or null

---

#### `saveAnalysisToCache()`
**Lines: 2010-2063**

**Purpose:** Saves completed analysis to Firestore.

**Flow:**
1. Creates cache document ID
2. Adds metadata (timestamp, language, teamIds)
3. Writes to Firestore `analyses` collection
4. Called asynchronously after response sent to user

---

#### `verifyCacheRetrieval()`
**Lines: 2064-2081**

**Purpose:** Verifies cache write was successful.

**Flow:**
1. Immediately attempts to read back cached data
2. Logs success/failure
3. Used for debugging cache issues

---

## 4. Market Intelligence Functions

**Lines: 3083-5619**

These functions power the Market Intelligence screen with advanced betting metrics.

---

### 4.1 `getMarketIntelligenceDataTest()`
**Lines: 3083-3099**

**Purpose:** Router function that delegates to sport-specific market intel functions.

**Routing:**
- Soccer → `getSoccerMarketIntelligenceTest()`
- All others → `getTwoWayMarketIntelligenceTest()`

**Why Separate?**
- Soccer has 3-way betting (home/draw/away)
- NFL/NBA/MLB have 2-way betting (home/away)

---

### 4.2 `getTwoWayMarketIntelligenceTest()`
**Lines: 3102-3173**

**Purpose:** Fetches market intelligence for 2-way betting sports (NFL, NBA, MLB).

**Flow:**
1. Fetches odds from The Odds API
2. Finds matching event via `fuzzyMatchTeam()`
3. Runs 5 parallel calculations:
   - `calculateBestLinesTest()` - Best odds across books
   - `calculateSharpMeterTest()` - Sharp money indicators
   - `calculateEVOpportunities()` - +EV betting opportunities
   - `calculateMarketTightnessTest()` - Vig analysis
   - `formatOddsTableTest()` - Formatted odds comparison

**Returns:**
```javascript
{
  bestLines: { moneyline: {...}, spread: {...}, total: {...} },
  sharpMeter: { moneyline: {...}, spread: {...} },
  evAnalysis: {
    vigAnalysis: {...},
    uiOpportunities: [...],
    fairValue: {...}
  },
  marketTightness: {...},
  oddsTable: [...]
}
```

---

### 4.3 `getSoccerMarketIntelligenceTest()`
**Lines: 3174-3253**

**Purpose:** Fetches market intelligence for soccer (3-way betting).

**Differences from 2-way:**
- Uses `calculateSoccerSharpMeter()`
- Uses `calculateSoccerBestLines()`
- Uses `calculateSoccerEVOpportunities()`
- Handles draw outcome in all calculations

---

### 4.4 Best Lines Calculators

#### `calculateBestLinesTest()` (2-way)
**Lines: 3254-3387**

**Purpose:** Finds best available odds across all bookmakers.

**For each market (moneyline, spread, total):**
1. Identifies sharp books (Pinnacle, BetOnline, Bovada)
2. Finds highest odds for each team/outcome
3. Returns best sharp line + best overall line

**Example Output:**
```javascript
{
  moneyline: {
    home: { sharpLine: -110, bestLine: -105, book: "FanDuel" },
    away: { sharpLine: -120, bestLine: -115, book: "DraftKings" }
  }
}
```

---

#### `calculateSoccerBestLines()` (3-way)
**Lines: 5241-5321**

**Purpose:** Same as above but includes draw outcome.

---

### 4.5 Sharp Meter Calculators

#### `calculateSharpMeterTest()` (2-way)
**Lines: 3499-3629**

**Purpose:** Detects where "sharp money" (professional bettors) is going.

**Algorithm:**
1. Identifies sharp bookmakers:
   - Pinnacle (most respected)
   - BetOnline, Bovada, BetRivers (sharp-friendly)

2. Compares sharp consensus vs. public consensus

3. Calculates "Sharp Agreement" (how aligned sharp books are)

4. **Sharpness Score:**
   - `>= 75%` → 🔥 Strong (Sharps heavily favor one side)
   - `60-74%` → ⚠️ Moderate
   - `< 60%` → 🤷 Low (No clear sharp consensus)

**Example Output:**
```javascript
{
  moneyline: {
    favoredSide: "away",
    sharpConsensus: 78,  // 78% of sharps favor away
    sharpnessScore: "Strong",
    indicator: "🔥 Sharps on Ravens -3",
    sharpAgreement: 92   // Sharps agree 92%
  }
}
```

---

#### `calculateSoccerSharpMeter()` (3-way)
**Lines: 5066-5240**

**Purpose:** Same sharp detection for soccer (includes draw).

**Additional Logic:**
- Handles scenarios where sharps split between home/draw/away
- Flags "Sharp Trap" when sharp consensus conflicts with line movement

---

### 4.6 EV & Arbitrage Calculators

#### `calculateEVOpportunities()`
**Lines: 4565-4917**

**Purpose:** Identifies positive expected value (+EV) betting opportunities and arbitrage scenarios.

**Concepts:**

**1. Vig (Vigorish)**
- The bookmaker's commission/edge
- Lower vig = better value for bettors
- Calculated via `calculateMarketVig()`

**2. Fair Value**
- True probability of outcome (no vig)
- Calculated by averaging sharp book odds and removing vig

**3. Expected Value (EV)**
- Profit expected over many bets
- Formula: `(Probability × Profit) - (1 - Probability × Stake)`
- Positive EV = profitable long-term

**4. Arbitrage**
- Betting both sides across different books to guarantee profit
- Requires odds discrepancy between books

**Flow:**
1. Identifies lowest-vig books for fair value baseline
2. Calculates true fair value from sharp consensus
3. Compares each bookmaker's odds to fair value
4. Flags opportunities where bookmaker odds imply < fair value probability
5. Checks for arbitrage opportunities

**Example Output:**
```javascript
{
  vigAnalysis: {
    lowestVig: { moneyline: 4.2, spread: 3.8, total: 4.1 },
    bestBooks: ["Pinnacle", "BetOnline"]
  },
  fairValue: {
    moneyline: { home: 45.2, away: 54.8 },
    spread: { home: 52.1, away: 47.9 }
  },
  uiOpportunities: [
    {
      market: "moneyline",
      outcome: "Ravens",
      bookmaker: "FanDuel",
      odds: -105,
      expectedValue: 5.2,  // 5.2% EV
      type: "+EV",
      confidence: "High"
    }
  ],
  arbitrage: []  // Empty if no arb opportunities
}
```

---

#### `calculateSoccerEVOpportunities()`
**Lines: 5322-5572**

**Purpose:** Same EV/arbitrage detection for 3-way soccer markets.

**Additional Complexity:**
- Must calculate fair value across 3 outcomes (home/draw/away)
- Arbitrage requires 3-way bet placement

---

### 4.7 Vig Analysis Functions

#### `calculateMarketTightnessTest()`
**Lines: 3630-3692**

**Purpose:** Analyzes overall market efficiency (how tight odds are).

**Calculates:**
- Average vig across all bookmakers
- Vig range (highest vs. lowest)
- Tightness score (0-100, higher = more efficient market)

**Returns:**
```javascript
{
  moneyline: { avgVig: 4.5, vigRange: 6.2, tightnessScore: 85 },
  spread: { avgVig: 4.1, vigRange: 3.8, tightnessScore: 92 },
  total: { avgVig: 4.3, vigRange: 4.5, tightnessScore: 88 }
}
```

---

#### `findLowestVigBook()`
**Lines: 4943-4962**

**Purpose:** Finds bookmaker with lowest vig for a specific market.

**Usage:** Used to determine fair value baseline.

---

### 4.8 Odds Table Formatter

#### `formatOddsTableTest()` / `formatSoccerOddsTable()`
**Lines: 3730-3805 (2-way), 5573-5618 (soccer)**

**Purpose:** Formats raw odds data into table structure for UI display.

**Returns Array:**
```javascript
[
  {
    bookmaker: "FanDuel",
    bookmakerKey: "fanduel",
    isSharp: false,
    odds: {
      moneyline: { home: -110, away: +105 },
      spread: { home: -3 (-110), away: +3 (-110) },
      total: { over: 47.5 (-115), under: 47.5 (-105) }
    }
  },
  // ... more bookmakers
]
```

---

### 4.9 Line Movement Tracking

#### `calculateLineMovementTest()`
**Lines: 3388-3498**

**Purpose:** Tracks how betting lines have moved over time.

**Flow:**
1. Fetches historical odds for event ID
2. Compares opening lines vs. current lines
3. Calculates direction and magnitude of movement

**Returns:**
```javascript
{
  moneyline: {
    opening: { home: -110, away: +100 },
    current: { home: -120, away: +110 },
    movement: { home: -10, away: +10 },
    direction: "home_favored_more"
  }
}
```

**Use Case:** Detects "reverse line movement" (sharps moving line against public).

---

## 5. Team & Player Statistics Functions

**Lines: 3806-6230**

These functions power the Team Stats and Player Stats screens.

---

### 5.1 Team Stats Architecture

#### `getTeamStatsDataTest()`
**Lines: 3947-3974**

**Purpose:** Master function for fetching team statistics.

**Flow:**
1. Fetches stats for both teams in parallel
2. Returns structured comparison

**Returns:**
```javascript
{
  team1: { teamId, teamName, stats: {...} },
  team2: { teamId, teamName, stats: {...} },
  comparison: { ... }  // Side-by-side comparison
}
```

---

#### `getSingleTeamStatsTest()`
**Lines: 3975-4041**

**Purpose:** Routes to sport-specific team stats fetchers.

**Routing:**
- NBA → `transformNBATeamStats()` (API-Sports)
- NFL → `getStatPalTeamStatsTest()` (StatPal)
- MLB → `getStatPalMLBTeamStatsTest()` (StatPal)
- Soccer → `getStatPalTeamStatsTest()` (StatPal)

**Why Multiple APIs?**
- API-Sports has great NBA data
- StatPal has better NFL/MLB/Soccer data
- Functions normalize to consistent structure

---

#### `transformNBATeamStats()`
**Lines: 4042-4084**

**Purpose:** Transforms API-Sports NBA stats to app format.

**Input:** Raw API-Sports response
**Output:** Structured stats object with:
- Season info
- Games played
- PPG, FG%, 3P%, FT%
- Rebounds, assists, steals, blocks
- Recent form

---

#### `getStatPalTeamStatsTest()` (NFL/Soccer)
**Lines: 4085-4121**

**Purpose:** Fetches team stats from StatPal API.

**Flow:**
1. Gets StatPal team code via `getTeamCodeForStatPal()`
2. Calls StatPal API with team code
3. Transforms response via `transformStatPalData()`

---

#### `getStatPalMLBTeamStatsTest()`
**Lines: 4229-4265**

**Purpose:** Special MLB stats fetcher (different API endpoint).

---

#### `transformStatPalData()` / `transformStatPalMLBData()`
**Lines: 4150-4228, 4294-4391**

**Purpose:** Normalizes StatPal API responses to consistent format.

**Output Structure:**
```javascript
{
  season: "2024",
  gamesPlayed: 82,
  record: "45-37",
  stats: {
    offense: { ppg: 112.5, ... },
    defense: { oppPpg: 108.2, ... },
    efficiency: { ... }
  }
}
```

---

### 5.2 Enhanced Team Stats

#### `enhanceTeamStatsWithGameData()`
**Lines: 5624-5740**

**Purpose:** Adds calculated metrics to team stats using recent game data.

**Enhancements:**
1. **Points Per Game (PPG)** - Calculated from last 10 games
2. **Opponent PPG** - Defensive performance
3. **Home/Away Averages** - Split performance by venue
4. **Recent Form** - Win/loss record (e.g., "7-3")
5. **Momentum** - Current streak (e.g., "3W" = 3-game win streak)

**Why Important?**
- Team's season stats might not reflect recent performance
- Home/away splits are critical for betting
- Momentum indicators show trending teams

**Example:**
```javascript
{
  team1: {
    stats: {
      // ... existing stats from API
      calculated: {
        pointsPerGame: 28.4,          // From last 10
        opponentPointsPerGame: 21.2,
        homeAverage: 31.2,            // Higher at home
        awayAverage: 25.6,
        recentForm: "7-3",
        momentum: "3W"                // Hot streak!
      }
    }
  }
}
```

---

### 5.3 Player Stats Architecture

#### `getPlayerStatsForSport()`
**Lines: 5746-5776**

**Purpose:** Master function for fetching player statistics.

**Flow:**
1. Fetches player stats for both teams in parallel
2. Returns top players + full roster for each team

**Returns:**
```javascript
{
  team1: {
    teamId: "1234",
    allPlayers: [...],    // Full roster
    topPlayers: [...],    // Top 3-5 players
    playerCount: 25
  },
  team2: { ... }
}
```

---

#### `getSingleTeamPlayerStats()`
**Lines: 5778-5805**

**Purpose:** Routes to sport-specific player stats fetchers.

**Routing:**
- NFL → `getStatPalNFLPlayerStatsTest()`
- MLB → `getStatPalMLBPlayerStatsTest()`
- Soccer → `getAPISoccerPlayerStats()`
- NBA → `getAPINBAPlayerStats()`
- Tennis → Returns empty (no team players)

---

#### `getAPISoccerPlayerStats()`
**Lines: 5808-5866**

**Purpose:** Fetches soccer player stats from API-Sports.

**Smart Season Fallback:**
1. Tries 2024 season first
2. Checks if players have actual stats (not just squad list)
3. Falls back to 2023 if 2024 has no stats yet
4. Transforms via `transformSoccerPlayerData()`

---

#### `transformSoccerPlayerData()`
**Lines: 5869-5941**

**Purpose:** Normalizes soccer player data to app format.

**Filters:**
- Only players with game time
- At least 1 appearance OR goals/assists

**Sorts By:**
- Contribution (goals + assists)
- Then by appearances

**Output:**
```javascript
{
  allPlayers: [...],
  topPlayers: [
    {
      name: "Erling Haaland",
      position: "Forward",
      stats: {
        appearances: 35,
        goals: 36,
        assists: 8,
        contribution: 44,    // goals + assists
        rating: "8.9"
      }
    }
  ]
}
```

---

#### `getAPINBAPlayerStats()`
**Lines: 5942-5984**

**Purpose:** Fetches NBA player stats from API-Sports.

**Season:** Always uses 2024 season

---

#### `transformNBAPlayerData()`
**Lines: 5985-6071**

**Purpose:** Normalizes NBA player data to app format.

**Sorts By:**
- PPG (points per game)
- Then minutes played

**Top Players:** Top 5 by scoring

---

#### `getStatPalNFLPlayerStatsTest()`
**Lines: 4392-4428**

**Purpose:** Fetches NFL player stats from StatPal API.

**Categories:**
- Passing leaders (QBs)
- Rushing leaders (RBs)
- Receiving leaders (WRs/TEs)

---

#### `transformStatPalNFLPlayerData()`
**Lines: 4429-4564**

**Purpose:** Normalizes StatPal NFL data to app format.

**Smart Extraction:**
1. Identifies position-specific leaders
2. Extracts passing stats (yards, TDs, INTs)
3. Extracts rushing stats (carries, yards, TDs)
4. Extracts receiving stats (receptions, yards, TDs)
5. Combines into unified player list

**Top Players:** Top 3 from each category (QB, RB, WR)

---

#### `getStatPalMLBPlayerStatsTest()`
**Lines: 6072-6108**

**Purpose:** Fetches MLB player stats from StatPal API.

---

#### `transformStatPalMLBPlayerData()`
**Lines: 6109-6187**

**Purpose:** Normalizes StatPal MLB data to app format.

**Categories:**
- Batting leaders (AVG, HR, RBI)
- Pitching leaders (ERA, Wins, Strikeouts)

---

#### `getTopPlayersForSport()`
**Lines: 6188-6230**

**Purpose:** Extracts top 3-5 players from full roster based on sport-specific criteria.

**Logic:**
- Soccer → Goals + Assists
- NBA → Points per game
- NFL → Position-specific stats
- MLB → Batting average + power stats

---

## 6. Data Transformation & Utilities

### 6.1 Team ID Mapping Functions

#### `getTeamCodeForStatPal()` / `getMLBTeamCodeForStatPal()`
**Lines: 4122-4149, 4266-4293**

**Purpose:** Maps API-Sports team IDs to StatPal team codes.

**Why Needed?**
- Different APIs use different identifiers
- We store mappings in JSON files
- Enables cross-API data fetching

**Example Mapping:**
```javascript
{
  id: 1434,              // API-Sports ID
  name: "Ravens",
  code: "BAL",           // StatPal code
  statpal_code: "RAVENS"
}
```

---

### 6.2 String Utilities

#### `normalizeString()`
**Lines: 1769-1773**

**Purpose:** Normalizes strings for comparison (lowercase, remove special chars).

---

#### `fuzzyMatchTeam()`
**Lines: 1774-1840**

**Purpose:** Fuzzy matches team names from odds API to user input.

**Algorithm:**
1. Normalizes both team names
2. Tries exact match first
3. Tries partial match (e.g., "Lakers" matches "Los Angeles Lakers")
4. Uses string similarity for fuzzy match
5. Returns best match above threshold

**Use Case:** Odds API might return "LA Lakers" but user uploaded "Lakers".

---

### 6.3 Icon Mapping

#### `getBookmakerIcon()`
**Lines: 4963-4987**

**Purpose:** Maps bookmaker key to icon name for UI.

**Example:**
```javascript
getBookmakerIcon("fanduel") → "fanduel_icon"
getBookmakerIcon("draftkings") → "draftkings_icon"
```

---

### 6.4 Validation Functions

#### `validateVig()`
**Lines: 4918-4925**

**Purpose:** Validates calculated vig is reasonable (0-20%).

**Why?**
- Catch API errors
- Prevent displaying nonsense data
- Typical vig is 4-6%

---

### 6.5 Tennis-Specific Functions

#### `getTennisHeadToHead()`
**Lines: 2260-2415**

**Purpose:** Fetches historical matches between two tennis players.

---

#### `getTennisFixtures()`
**Lines: 2416-2699**

**Purpose:** Fetches upcoming tennis matches for players.

---

## 🎯 Key Takeaways for New Developers

### 1. **Main Flow Understanding**

```
User uploads bet slip
    ↓
analyzeImage() → Vision API extracts teams
    ↓
findTeamIds() → Matches to database
    ↓
checkCacheForMatch() → Check if analysis exists
    ↓
[If no cache]
    ↓
Promise.all([
  getOddsData(),
  getGameData(),
  getMarketIntelligenceDataTest(),
  getTeamStatsDataTest(),
  getPlayerStatsForSport()
])
    ↓
AI generates insights
    ↓
saveAnalysisToCache() → Cache for next time
    ↓
Return to app
```

### 2. **Caching Strategy**

- **Cache Key:** `${sport}_${team1Id}_${team2Id}_${locale}`
- **TTL:** 36 hours
- **Why Cache?**
  - Reduces OpenAI API costs ($$$)
  - Faster response times
  - Reduces load on sports APIs
- **When to Bust Cache?**
  - Game starts (odds change rapidly)
  - Major news (injury update)
  - User selects different locale

### 3. **Multi-Sport Architecture**

Each sport has unique data structures, so the code routes to sport-specific functions:

```
if (sport.includes('soccer')) {
  → Soccer-specific functions (3-way betting, API-Sports)
} else if (sport === 'nfl') {
  → NFL-specific functions (StatPal API)
} else if (sport === 'nba') {
  → NBA-specific functions (API-Sports + transformations)
}
```

**Key Files:**
- `nba_teams.json` - NBA team mappings
- `nfl_teams.json` - NFL team mappings
- `soccer_teams.json` - Soccer team mappings
- `mma_fighters.json` - MMA fighter mappings
- `tennis_players.json` - Tennis player mappings

### 4. **API Rate Limiting**

**Be Careful:**
- API-Sports: 100 requests/day (free tier)
- The Odds API: 500 requests/month (free tier)
- OpenAI: Pay per token

**Mitigation:**
- Cache aggressively
- Batch requests with `Promise.all()`
- Fall back to previous season if current season has no data

### 5. **Error Handling Philosophy**

- **Graceful Degradation:** If one data source fails, return partial data
- **Logging:** Console.log everything for debugging
- **User-Friendly Messages:** "Could not find team" vs. "Error 404"

### 6. **Locale Support**

- Supported: `en`, `es`, `fr`
- AI prompt includes locale-specific terminology translations
- Cache maintains separate entries per locale
- All text must be translated, but structure stays the same

### 7. **Market Intelligence Deep Dive**

**Why It's Complex:**

The Market Intelligence functions are the most sophisticated in the codebase because they involve:

1. **Multi-Bookmaker Comparison:** Fetching odds from 15-20+ bookmakers
2. **Sharp Detection:** Identifying "sharp" bookmakers (Pinnacle, BetOnline)
3. **Mathematical Calculations:**
   - Vig calculation (bookmaker's edge)
   - Fair value calculation (true odds)
   - Expected value calculation (+EV opportunities)
   - Arbitrage detection (guaranteed profit scenarios)
4. **Line Movement Tracking:** Historical odds to detect reverse line movement
5. **3-Way Betting Logic:** Soccer has home/draw/away instead of just home/away

**Example Market Intelligence Insight:**

> "FanDuel has Ravens -3 at -105 odds. Sharp books have Ravens -3.5. This is a +EV opportunity because FanDuel's line is softer. The true fair value is Ravens -3.2, so getting -3 at -105 is a 3.8% +EV play."

### 8. **Testing Locally**

**Run Functions Emulator:**
```bash
cd functions/
npm run serve
```

**Test Endpoint:**
```bash
curl -X POST http://localhost:5001/YOUR-PROJECT/us-central1/analyzeImage \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://...", "locale": "en"}'
```

### 9. **Common Pitfalls**

1. **Forgetting to normalize team names** → Use `normalizeString()`
2. **Not handling null/undefined** → Always check `if (data && data.length > 0)`
3. **Hardcoding season years** → Calculate current season dynamically
4. **Ignoring locale** → AI must respond in requested language
5. **Not caching** → Every API call costs money

### 10. **Where to Add New Features**

**New Sport?**
1. Add team/player JSON file (e.g., `hockey_teams.json`)
2. Update `findTeamIds()` to handle new sport
3. Add sport-specific stats fetcher
4. Update `getMarketIntelligenceDataTest()` routing
5. Add transformers for new API response structures

**New Bookmaker?**
1. Update `getOddsData()` (should auto-detect from API)
2. Add icon in `getBookmakerIcon()`
3. Test sharp detection classification

**New Market Type (e.g., Player Props)?**
1. Add new market fetch in `getOddsData()`
2. Create `calculatePlayerPropBestLines()`
3. Create `calculatePlayerPropEV()`
4. Add UI formatting function

---

## 🚀 Deployment

**Deploy to Firebase:**
```bash
firebase deploy --only functions
```

**Deploy Specific Function:**
```bash
firebase deploy --only functions:analyzeImage
```

**View Logs:**
```bash
firebase functions:log
```

**Monitor Performance:**
- Firebase Console → Functions → Usage
- Check invocations, errors, and execution time

---

## 📞 API Endpoint Reference

| Endpoint | Method | Purpose | Response Time |
|----------|--------|---------|---------------|
| `/analyzeImage` | POST | Full bet analysis | 3-5s (first time), <1s (cached) |
| `/chatWithGPT` | POST | AI chatbot | 1-2s |
| `/marketIntelligence` | POST | Market intel + stats | 2-3s |
| `/saveExternalAnalysis` | POST | Inject cached analysis | <500ms |
| `/populateTennisPlayers` | GET | Update tennis DB | 5-10s |

---

## 📚 Further Reading

- [Firebase Cloud Functions Docs](https://firebase.google.com/docs/functions)
- [The Odds API Documentation](https://the-odds-api.com/liveapi/guides/v4/)
- [API-Sports Documentation](https://www.api-football.com/documentation-v3)
- [StatPal API Documentation](https://statpal.co/api-docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)

---

## 🤝 Questions?

If you're stuck on something:
1. Check the console logs (Firebase Functions logs are verbose)
2. Verify API keys are set in `.env`
3. Test with function emulator locally first
4. Check API rate limits (might be throttled)
5. Ask the team! This is complex stuff.

**Remember:** This is a 6,230-line file powering a sophisticated sports betting platform. Take your time understanding each section. Focus on one flow at a time (e.g., start with `analyzeImage` flow, then move to Market Intelligence).

---

**Last Updated:** October 17, 2025
**Version:** 1.0
**Maintainer:** Development Team
