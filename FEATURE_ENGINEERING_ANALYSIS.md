# Feature Engineering Analysis - NBA Props ML Integration

## Executive Summary

We need to build an **88-feature engineering pipeline** to feed our Vertex AI NBA props prediction model. Good news: **We already have ~60% of the required data** from our existing `marketIntelligence` Cloud Function! This analysis maps our current data to the 88 required features and identifies gaps.

---

## Current Data Pipeline (What We Already Have)

### Existing Cloud Function: `marketIntelligence`
**Location:** `functions/index.js:3182`

**What it fetches:**
1. **Market Intelligence** - Betting odds (not needed for ML, but useful for UI)
2. **Team Stats** - Season averages for both teams
3. **Player Stats** - Individual player statistics
4. **Game Data** - Upcoming games, H2H history, injuries

**Key Functions:**
- `getPlayerStatsForSport(sport, team1Id, team2Id)` - Returns player stats for both teams
- `getTeamStatsDataTest(sport, team1Id, team2Id)` - Returns team-level stats
- `getGameData(sport, team1Id, team2Id, ...)` - Returns game context

---

## Feature Mapping: What We Have vs What We Need

### ✅ ALREADY AVAILABLE (Estimated ~52 features / 88)

#### 1. **Categorical Features (5/5)** ✅
- ✅ `prop_type` - We'll determine this from SGO API props data
- ✅ `home_team` - From `team1_code` / `team2_code` params
- ✅ `away_team` - From `team1_code` / `team2_code` params
- ✅ `bookmaker` - From SGO API (DraftKings, FanDuel, etc.)
- ✅ `SEASON` - Can derive from current date (e.g., "2025-26")

#### 2. **Temporal Features (3/3)** ✅
- ✅ `year` - From game date
- ✅ `month` - From game date
- ✅ `day_of_week` - From game date

**Source:** We already fetch game dates from `getGameData()` → `upcomingGame.date.start`

#### 3. **Last 3 Games Stats (0/12)** ⚠️ **GAP**
**Current Issue:** Our API-Sports call fetches **season-long stats**, not game-by-game logs.

**What we currently get:**
```javascript
// From API-Sports NBA endpoint
{
  points: 25.8,  // Season average
  totReb: 6.9,   // Season average
  assists: 7.8,  // Season average
  fgp: "47.2",   // Season FG%
  // ... more season averages
}
```

**What we need:**
```javascript
// Last 3 games individual stats
L3_PTS: 26.3,  // Average of last 3 games' points
L3_REB: 7.2,   // Average of last 3 games' rebounds
// ... 12 total L3_ features
```

#### 4. **Last 10 Games Stats (0/15)** ⚠️ **GAP**
Same issue as L3 stats - we need game-by-game data, not season averages.

#### 5. **Game Context Features (5/6)** ✅ Mostly
- ✅ `HOME_AWAY` - We know which team is home from `team1`/`team2` params
- ⚠️ `DAYS_REST` - **Need to calculate** from previous game date
- ⚠️ `BACK_TO_BACK` - **Need to calculate** from previous game date
- ⚠️ `GAMES_IN_LAST_7` - **Need to calculate** from recent games schedule
- ⚠️ `MINUTES_TREND` - **Need to derive** from L3 vs L10 data (which we don't have yet)

#### 6. **Advanced Performance Metrics (11/11)** ✅ Can Calculate
These are **derived features** we can compute from L3/L10 data once we have it:
```javascript
SCORING_EFFICIENCY = L3_PTS / L3_FGA
ASSIST_TO_RATIO = L3_AST / L3_TOV
REBOUND_RATE = L3_REB / L3_MIN
USAGE_RATE = L3_FGA / L3_MIN
TREND_PTS = L3_PTS - L10_PTS
TREND_REB = L3_REB - L10_REB
TREND_AST = L3_AST - L10_AST
CONSISTENCY_PTS = L10_PTS_STD / L10_PTS
CONSISTENCY_REB = L10_REB_STD / L10_REB
CONSISTENCY_AST = L10_AST_STD / L10_AST
ACCELERATION_PTS = (L3_PTS - L10_PTS) / DAYS_REST
EFFICIENCY_STABLE = 1 if abs(L3_FG_PCT - L10_FG_PCT) < 0.05 else 0
```

**Status:** Can calculate once we have L3/L10 data.

#### 7. **Interaction Features (6/6)** ✅ Can Calculate
All derived from L3/L10 data + context:
```javascript
L3_PTS_x_HOME = L3_PTS * HOME_AWAY
L3_REB_x_HOME = L3_REB * HOME_AWAY
L3_AST_x_HOME = L3_AST * HOME_AWAY
L3_MIN_x_B2B = L3_MIN * BACK_TO_BACK
L3_PTS_x_REST = L3_PTS * DAYS_REST
USAGE_x_EFFICIENCY = USAGE_RATE * SCORING_EFFICIENCY
```

#### 8. **Composite Metrics (7/7)** ✅ Can Calculate
All derived from base stats:
```javascript
LOAD_INTENSITY = GAMES_IN_LAST_7 * L10_MIN / 7
SHOOTING_VOLUME = L3_FGA
REBOUND_INTENSITY = L3_REB * REBOUND_RATE
PLAYMAKING_EFFICIENCY = L3_AST * ASSIST_TO_RATIO
THREE_POINT_THREAT = L3_FG3M * L3_FG3_PCT
DEFENSIVE_IMPACT = L3_STL + L3_BLK + 0.5
PTS_VOLATILITY = L10_PTS_STD / L10_PTS
MINUTES_STABILITY = L3_MIN / L10_MIN
```

#### 9. **Ratio Features (2/2)** ✅ Can Calculate
```javascript
L3_vs_L10_PTS_RATIO = L3_PTS / L10_PTS
L3_vs_L10_REB_RATIO = L3_REB / L10_REB
```

#### 10. **Betting Line Features (21/21)** ✅
We already have this from **SGO API** (SportsGameOdds):
- ✅ `line` - The prop line (e.g., 28.5 points)
- ✅ `odds_over` - American odds for Over (e.g., -110)
- ✅ `odds_under` - American odds for Under (e.g., -110)
- ✅ `implied_prob_over` - Calculated from odds
- ✅ `implied_prob_under` - Calculated from odds

All other betting features are **derived calculations** from these base values.

**Source:** `.backup_player_props/sgoApi.ts` already fetches this data.

---

## 🚨 CRITICAL DATA GAPS

### Gap #1: Individual Game Logs (Last 3 & Last 10 Games)

**Problem:** We currently fetch **season averages**, but the model needs **individual game statistics** to calculate:
- L3_* features (last 3 games averages)
- L10_* features (last 10 games averages)
- L10_*_STD features (standard deviation over last 10 games)

**Solution:** We need to call a different API-Sports endpoint:

#### Current Endpoint (Season Stats):
```
https://v2.nba.api-sports.io/players/statistics?season=2025&team=145
```

Returns: Season-long aggregated stats

#### New Endpoint Needed (Game Logs):
```
https://v2.nba.api-sports.io/players/statistics?season=2025&id=265
```

**IMPORTANT:** Use `id=<playerId>` instead of `team=<teamId>` to get **individual game logs** for a specific player.

**Response Structure:**
```json
{
  "response": [
    {
      "game": {
        "id": 123456,
        "date": "2026-02-01"
      },
      "points": 28,
      "totReb": 8,
      "assists": 9,
      "min": "36:24",
      "fgm": 11,
      "fga": 22,
      "fgp": "50.0",
      "ftm": 4,
      "fta": 5,
      "ftp": "80.0",
      "tpm": 2,
      "tpa": 6,
      "tpp": "33.3",
      "offReb": 2,
      "defReb": 6,
      "steals": 1,
      "blocks": 0,
      "turnovers": 3,
      "pFouls": 2,
      "plusMinus": "+12"
    },
    // ... more games
  ]
}
```

### Gap #2: Recent Schedule Data (for DAYS_REST, BACK_TO_BACK, GAMES_IN_LAST_7)

**Problem:** We need to know:
- When was the player's last game?
- Was it a back-to-back?
- How many games in the last 7 days?

**Solution:** Use the game logs from Gap #1 to calculate:
```javascript
// Pseudo-code
const gameLogs = await getPlayerGameLogs(playerId, season);
const sortedGames = gameLogs.sort((a, b) => new Date(b.game.date) - new Date(a.game.date));

const lastGame = sortedGames[0];
const DAYS_REST = daysBetween(lastGame.game.date, upcomingGame.date);
const BACK_TO_BACK = DAYS_REST === 1 ? 1 : 0;

const last7Days = sortedGames.filter(g =>
  daysBetween(g.game.date, upcomingGame.date) <= 7
);
const GAMES_IN_LAST_7 = last7Days.length;
```

---

## Proposed Architecture

### New Cloud Function: `getPlayerPropsFeatures`

**Purpose:** Fetch player game logs and calculate all 88 features for ML prediction

**Input:**
```javascript
{
  playerId: 265,           // LeBron James
  playerName: "LeBron James",
  teamId: 145,             // Lakers
  opponentTeamId: 137,     // Warriors
  gameDate: "2026-02-04",
  isHome: true,
  propType: "points",
  line: 28.5,
  oddsOver: -110,
  oddsUnder: -110,
  bookmaker: "DraftKings"
}
```

**Process:**
1. Fetch player's last 15 games from API-Sports (to ensure we have 10 valid games)
2. Calculate L3 averages (last 3 games)
3. Calculate L10 averages + standard deviations (last 10 games)
4. Calculate all derived features (advanced metrics, interactions, composites)
5. Return complete 88-feature object ready for Vertex AI

**Output:**
```javascript
{
  // All 88 features ready to send to ML model
  prop_type: "points",
  home_team: "LAL",
  away_team: "GSW",
  // ... 85 more features
}
```

### Integration with Existing Flow

**Current Flow:**
```
User scans ticket → analyzeImage → analysis.tsx
                                       ↓
                          FloatingBottomNav (Props tab)
                                       ↓
                          player-props.tsx (SGO API for lines)
```

**New Flow with ML:**
```
User scans ticket → analyzeImage → analysis.tsx
                                       ↓
                          FloatingBottomNav (Props tab)
                                       ↓
                          player-props.tsx
                                       ↓
                          1. Fetch prop lines (SGO API) ✅ Already working
                          2. For each prop → getPlayerPropsFeatures (NEW)
                          3. For each prop → Vertex AI predict (NEW)
                          4. Display props with ML predictions + confidence
```

---

## Data Flow Summary

### What We Already Have:
1. ✅ **Team IDs** - From `marketIntelligence` flow
2. ✅ **Player Lists** - From `getPlayerStatsForSport()`
3. ✅ **Betting Lines** - From SGO API (`.backup_player_props/sgoApi.ts`)
4. ✅ **Season Stats** - From API-Sports (but need to switch to game logs)
5. ✅ **Game Date/Time** - From `getGameData()`

### What We Need to Add:
1. ⚠️ **Player Game Logs API** - Switch from season stats to game-by-game logs
2. ⚠️ **Feature Calculation Logic** - Build 88-feature engineering pipeline
3. ⚠️ **Vertex AI Integration** - Call ML endpoint with OAuth2 auth
4. ⚠️ **Confidence Filtering** - Only show HIGH confidence props (>15%)

---

## Next Steps

### Phase 1: Data Collection ✅ (Already mostly done!)
- [x] We have team IDs
- [x] We have player lists
- [x] We have betting lines
- [ ] Switch to game logs endpoint (easy fix)

### Phase 2: Feature Engineering (This is the work)
1. Create `calculateL3Stats(gameLogs)` function
2. Create `calculateL10Stats(gameLogs)` function
3. Create `calculateDerivedFeatures(L3, L10, context)` function
4. Create `buildMLPayload(allFeatures)` function

### Phase 3: ML Integration
1. Set up Vertex AI service account authentication
2. Create `callVertexAI(features)` function
3. Parse ML response (prediction, probability, confidence, betting_value)

### Phase 4: UI Integration
1. Add ML predictions to `player-props.tsx`
2. Filter to only show HIGH confidence props
3. Show confidence score + betting recommendation

---

## Performance Considerations

### API Rate Limits
- **API-Sports NBA:** 100 requests/day (free tier) or 3,000 requests/day (paid)
- **SGO API:** Unknown rate limits (currently using `b07ce45b95064ec5b62dcbb1ca5e7cf0`)
- **Vertex AI:** No hard limit, pay per prediction (~$0.000001 per prediction)

### Optimization Strategy
1. **Cache player game logs** in Firestore (1 hour TTL)
   - Key: `player_{playerId}_{season}_gamelogs`
   - Reduces API calls drastically

2. **Batch predictions**
   - Send multiple props in one `instances` array to Vertex AI
   - Reduces API roundtrips

3. **Filter early**
   - Only fetch features for props we want to show (e.g., points, rebounds, assists)
   - Skip exotic props like "first basket" or "double-double"

---

## Code Structure Proposal

```
functions/
  index.js                     (existing)
  mlFeatureEngineering.js      (NEW - 88 feature calculation)
  vertexAIService.js           (NEW - ML API integration)

services/
  api.ts                       (existing)

.backup_player_props/
  sgoApi.ts                    (existing - betting lines)
  player-props.tsx             (existing - update to show ML predictions)
```

---

## Key Insight: We're 60% There!

**Good news:** Most of the heavy lifting is already done. We have:
- ✅ The infrastructure (Cloud Functions, Firestore, API integrations)
- ✅ The data sources (API-Sports, SGO API)
- ✅ The UI components (player-props.tsx with prop display)

**What we need to build:**
- Feature engineering logic (~300 lines of calculation code)
- Vertex AI integration (~100 lines with OAuth2)
- UI updates to show confidence scores (~50 lines)

**Estimated total new code:** ~500 lines (very manageable!)

---

## Risk Assessment

### Low Risk:
- ✅ Data availability (API-Sports has game logs)
- ✅ Feature calculations (just math, no complex logic)
- ✅ UI integration (just adding ML data to existing props display)

### Medium Risk:
- ⚠️ API rate limits (mitigation: aggressive caching)
- ⚠️ API-Sports downtime (mitigation: fallback to season stats with warning)

### High Risk:
- 🚨 **Model accuracy in production** - 64.9% test accuracy might drop in real-world
  - Mitigation: Only show HIGH confidence props (>15% = ~70% win rate)
  - Mitigation: Track actual performance in Firestore for monitoring

---

## Conclusion

We have a clear path forward:

1. **Add game logs endpoint** to existing API-Sports integration (1 hour)
2. **Build feature engineering pipeline** (4-6 hours)
3. **Integrate Vertex AI** with OAuth2 auth (2-3 hours)
4. **Update UI** to display ML predictions (1-2 hours)

**Total estimated effort:** 8-12 hours of focused work.

**Biggest advantage:** We're not starting from scratch. Our existing `marketIntelligence` pipeline gives us 60% of what we need. We just need to:
- Switch from season stats to game logs (easy)
- Add calculation logic (tedious but straightforward)
- Plug in the ML API (well-documented in API_DOCUMENTATION.md)

Let's build this! 🚀
