# index.js Cloud Functions Summary

**File:** `functions/index.js` (7,055 lines)
**Purpose:** All backend cloud functions for Bet.AI

---

## Main HTTP Endpoints

### 1. `analyzeImage` (Lines 113-614)
**The core analysis pipeline.** Triggered when users upload a bet slip.

**Flow:**
1. OCR via GPT-4 Vision → extracts team names + sport
2. Fuzzy match team IDs from `*_teams.json` files
3. Cache check in Firestore (`matchAnalysisCache` collection)
4. If cache miss, parallel API calls:
   - The Odds API (betting lines)
   - API-Sports (game data, team/player stats)
   - StatPal (advanced stats)
   - OpenWeather (weather)
5. GPT-4 generates AI analysis
6. Returns full analysis object
7. Async saves to cache (non-blocking)

**Cache Key:** `${sport}_${team1Id}_${team2Id}_${locale}`

---

### 2. `marketIntelligence` (Lines 3109-6962)
**Dedicated endpoint for Market Intel page and team/player stats.**

Fetches:
- Market odds and movements
- Team statistics with calculated metrics (PPG, momentum, trends)
- Player statistics
- Enhanced visualizations data

**This is what breaks on replays** - it calls live APIs that return nothing for past events.

---

### 3. `chatWithGPT` (Lines 615-713)
Chat endpoint for AI debates about bets.

---

### 4. `cleanupCache` (Lines 2617-2691)
Maintenance endpoint to remove expired cache entries.

---

### 5. `saveExternalAnalysis` (Lines 3000-3108)
Admin endpoint to inject pre-analyzed data (requires API key).

---

## Key Code Sections

| Lines | Section |
|-------|---------|
| 1-116 | Imports, constants, translations |
| 117-614 | `analyzeImage` main function |
| 615-713 | `chatWithGPT` |
| 714-2050 | Helper functions (team matching, data fetching) |
| 2051-2114 | Cache check logic |
| 2115-2616 | More helpers (stats processing, weather) |
| 2617-2691 | `cleanupCache` |
| 2692-2892 | Team ID resolution helpers |
| 2893-3099 | `populateTennisPlayers` |
| 3000-3108 | `saveExternalAnalysis` |
| 3109-6962 | `marketIntelligence` (massive!) |
| 6963-7055 | `updateFrenchDemoAnalysis` |

---

## Database Collections

```
matchAnalysisCache/{cacheId}
├── sport: string
├── team1Id: string
├── team2Id: string
├── language: string (en/fr/es)
├── analysis: object (full analysis result)
├── timestamp: Firestore.Timestamp
└── expiresAt: Firestore.Timestamp (optional)
```

---

## Current Cache Settings

```javascript
const CACHE_EXPIRY_TIME = 0; // Currently DISABLED
```

Cache is disabled due to data quality issues (stale market data problem you mentioned).

---

## External APIs

| API | Purpose | Used In |
|-----|---------|---------|
| The Odds API | Betting lines, vig | analyzeImage, marketIntelligence |
| API-Sports | Games, team/player stats | analyzeImage, marketIntelligence |
| StatPal | Advanced statistics | analyzeImage |
| OpenWeather | Weather data | analyzeImage |
| OpenAI GPT-4 | AI analysis generation | analyzeImage, chatWithGPT |

---

## Key Helper Functions

- `getTeamId(teamName, sport)` - Fuzzy match team names to IDs
- `fetchOddsData(sport, team1, team2)` - Get betting odds
- `fetchGameData(sport, team1Id, team2Id)` - Get game info from API-Sports
- `fetchTeamStats(sport, teamId)` - Get team statistics
- `fetchPlayerStats(sport, teamId)` - Get player statistics
- `generateAnalysis(data, locale)` - GPT-4 analysis generation

---

## For Weekly Pre-Cache Feature

**Key insight:** The `analyzeImage` function already does everything we need:
1. Takes team names + sport
2. Fetches all data
3. Generates analysis
4. Saves to cache

**Solution approach:** Create a new endpoint that:
1. Fetches upcoming top games (from The Odds API or API-Sports)
2. For each game, calls the existing analysis pipeline internally
3. Saves with extended TTL (7-10 days)
4. Scheduled via Cloud Scheduler (weekly cron)

**Minimal new code needed** - we can reuse existing functions!

---

## Pre-Cache Implementation (Added)

### New File: `preCacheTopGames.js`
Separate file for the weekly cron job function.

### Changes to `index.js`:
1. **Line 12-13:** Re-exports `preCacheTopGames` from separate file
2. **Lines 2106-2118:** Added pre-cache check in `checkCacheForMatch()` - checks `expiresAt` field for pre-cached entries
3. **Lines 3149-3201:** Added cache check in `marketIntelligence` endpoint

### Pre-cached entries have:
- `preCached: true` flag
- `expiresAt: ISO timestamp (10 days from creation)`

### Cache Key Format:
`{sport}_{team1Id}-{team2Id}_{locale}` (e.g., `nba_1-14_en`)
