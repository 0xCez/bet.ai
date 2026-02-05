# NBA Props ML Integration - Backend Documentation

## Overview

This document describes the backend Cloud Functions infrastructure for NBA player props ML predictions. The system calculates **88 features** required by the Vertex AI CatBoost model from real-time NBA player game logs.

## Architecture

```
Client Request
     ↓
getNBAPropsWithML Cloud Function (nbaPropsML.js)
     ↓
     ├─→ getPlayerGameLogs (nbaHelpers.js) ← Fetch game logs from API-Sports
     │        ↓
     │   Firestore Cache (1 hour TTL)
     │
     └─→ calculateAllMLFeatures (mlFeatureEngineering.js)
              ↓
         88-Feature Object → Ready for Vertex AI
```

## Files Structure

```
functions/
├── index.js                              # Main exports (registers new functions)
├── nbaPropsML.js                         # Main Cloud Function orchestrator (NEW)
├── helpers/
│   ├── nbaHelpers.js                     # API-Sports integration & utilities (NEW)
│   └── mlFeatureEngineering.js           # 88-feature calculation engine (NEW)
└── testMLFeatures.js                     # Test script with mock data (NEW)
```

## Cloud Functions

### 1. `getNBAPropsWithML`

**Purpose:** Main entry point for calculating ML features for NBA props

**Endpoint:** `POST /getNBAPropsWithML`

**Request Body:**
```json
{
  "team1": "Los Angeles Lakers",
  "team2": "Golden State Warriors",
  "team1_code": "LAL",
  "team2_code": "GSW",
  "gameDate": "2026-02-05T02:00:00Z",
  "props": [
    {
      "playerId": 265,
      "playerName": "LeBron James",
      "team": "Los Angeles Lakers",
      "statType": "points",
      "consensusLine": 28.5,
      "bestOver": { "bookmaker": "DraftKings", "odds": -110, "line": 28.5 },
      "bestUnder": { "bookmaker": "FanDuel", "odds": -110, "line": 28.5 }
    }
  ]
}
```

**Response:**
```json
{
  "sport": "nba",
  "teams": {
    "home": "LAL",
    "away": "GSW",
    "logos": { "home": "", "away": "" }
  },
  "gameDate": "2026-02-05T02:00:00Z",
  "propsWithFeatures": [
    {
      "playerId": 265,
      "playerName": "LeBron James",
      "statType": "points",
      "line": 28.5,
      "mlFeatures": {
        "prop_type": "points",
        "home_team": "LAL",
        "L3_PTS": 28.0,
        "L10_PTS": 29.2,
        "SCORING_EFFICIENCY": 1.27,
        // ... 83 more features
      },
      "gamesUsed": 15
    }
  ],
  "timestamp": "2026-02-04T...",
  "featuresCalculated": 1,
  "totalPropsRequested": 1
}
```

**Configuration:**
- Timeout: 120 seconds (2 minutes)
- Memory: 512MB
- Supports parallel processing of multiple props

---

### 2. `getPlayerGameLogs` (Utility)

**Purpose:** Debug endpoint to fetch player game logs directly

**Endpoint:** `GET /getPlayerGameLogs?playerId=265&season=2024&limit=15`

**Response:**
```json
{
  "playerId": 265,
  "season": 2024,
  "gamesFound": 15,
  "gameLogs": [
    {
      "game": { "id": 12345, "date": { "start": "2026-02-02T02:00:00Z" } },
      "points": 28,
      "totReb": 8,
      "assists": 9,
      "min": "36:24",
      "fgm": 11,
      "fga": 22,
      // ... more stats
    }
  ]
}
```

---

## Feature Engineering Pipeline

### Input: Player Game Logs

The pipeline requires the player's last **15 games** from API-Sports NBA endpoint:

```
https://v2.nba.api-sports.io/players/statistics?season=2024&id=265
```

**Critical:** Use `id=<playerId>` (not `team=<teamId>`) to get game-by-game logs instead of season aggregates.

### Output: 88 ML Features

The `calculateAllMLFeatures()` function generates:

#### 1. **Categorical Features (5)**
- `prop_type`: "points", "rebounds", "assists", etc.
- `home_team`: Team code (e.g., "LAL")
- `away_team`: Team code (e.g., "GSW")
- `bookmaker`: "DraftKings", "FanDuel", etc.
- `SEASON`: "2025-26"

#### 2. **Temporal Features (3)**
- `year`: 2026
- `month`: 2 (February)
- `day_of_week`: 4 (Thursday)

#### 3. **Last 3 Games Stats - L3 (12)**
- `L3_PTS`, `L3_REB`, `L3_AST`, `L3_MIN`
- `L3_FG_PCT`, `L3_FG3_PCT`, `L3_FT_PCT`
- `L3_STL`, `L3_BLK`, `L3_TOV`
- `L3_FGA`, `L3_FTA`

#### 4. **Last 10 Games Stats - L10 (15)**
- Same as L3, plus standard deviations:
- `L10_PTS_STD`, `L10_REB_STD`, `L10_AST_STD`

#### 5. **Game Context (5)**
- `HOME_AWAY`: 1 (home) or 0 (away)
- `DAYS_REST`: Days since last game
- `BACK_TO_BACK`: 1 if playing consecutive days
- `GAMES_IN_LAST_7`: Games played in last 7 days
- `MINUTES_TREND`: L3_MIN - L10_MIN (positive = increasing playing time)

#### 6. **Advanced Metrics (12)**
- `SCORING_EFFICIENCY`: Points per FGA
- `ASSIST_TO_RATIO`: Assists / Turnovers
- `REBOUND_RATE`: Rebounds per minute
- `USAGE_RATE`: FGA per minute
- `TREND_PTS`, `TREND_REB`, `TREND_AST`: L3 - L10
- `CONSISTENCY_PTS`, `CONSISTENCY_REB`, `CONSISTENCY_AST`: Std dev / Mean
- `ACCELERATION_PTS`: Trend / Days rest
- `EFFICIENCY_STABLE`: 1 if FG% stable (<5% change)

#### 7. **Interaction Features (6)**
- `L3_PTS_x_HOME`: Points × Home/Away indicator
- `L3_REB_x_HOME`, `L3_AST_x_HOME`
- `L3_MIN_x_B2B`: Minutes × Back-to-back indicator
- `L3_PTS_x_REST`: Points × Days rest
- `USAGE_x_EFFICIENCY`: Usage rate × Scoring efficiency

#### 8. **Composite Metrics (8)**
- `LOAD_INTENSITY`: Games in last 7 × Avg minutes
- `SHOOTING_VOLUME`: FGA
- `REBOUND_INTENSITY`: Rebounds × Rebound rate
- `PLAYMAKING_EFFICIENCY`: Assists × Assist/TO ratio
- `THREE_POINT_THREAT`: 3PM × 3P%
- `DEFENSIVE_IMPACT`: Steals + Blocks
- `PTS_VOLATILITY`: Coefficient of variation
- `MINUTES_STABILITY`: L3_MIN / L10_MIN

#### 9. **Ratio Features (2)**
- `L3_vs_L10_PTS_RATIO`: Recent form vs longer term
- `L3_vs_L10_REB_RATIO`

#### 10. **Betting Line Features (21)**
- `line`: Prop line (e.g., 28.5)
- `odds_over`, `odds_under`: American odds
- `implied_prob_over`, `implied_prob_under`: Converted probabilities
- `market_margin`: Vig/juice percentage
- `fair_prob_over`, `fair_prob_under`: Vig-free probabilities
- `decimal_odds_over`, `decimal_odds_under`
- `bookmaker_encoded`: Numeric bookmaker ID
- `odds_difference`, `is_favorite`, `is_underdog`
- `odds_magnitude`, `vig_percentage`
- Plus placeholders for: `expected_value_over`, `expected_value_under`, `line_movement`, `sharp_money_indicator`, `betting_volume_ratio`

---

## Caching Strategy

### Game Logs Cache
- **Storage:** Firestore `ml_cache` collection
- **Key:** `player_gamelogs_{playerId}_{season}`
- **TTL:** 1 hour (3,600,000ms)
- **Purpose:** Reduce API-Sports calls (rate limit: 3,000/day paid tier)

### Cache Flow
```javascript
1. Check Firestore for cached game logs
2. If cache hit AND age < 1 hour → Return cached data
3. If cache miss OR stale → Fetch from API-Sports
4. Store fresh data in Firestore with timestamp
5. Return game logs
```

---

## Performance Considerations

### API Rate Limits
- **API-Sports NBA:** 3,000 requests/day (paid tier)
- **Mitigation:** Aggressive Firestore caching (1 hour TTL)

### Function Execution
- **Timeout:** 120 seconds (handles slow API calls)
- **Memory:** 512MB (sufficient for parallel processing)
- **Parallel Processing:** All props calculated concurrently using `Promise.all()`

### Optimization Tips
1. **Batch props:** Send multiple props in one request
2. **Filter early:** Only request props you'll display (e.g., top 10 players)
3. **Cache on client:** Store propsWithFeatures for 30 minutes on client side

---

## Testing

### Run Local Test
```bash
cd functions
node testMLFeatures.js
```

**Expected Output:**
```
✅ Feature calculation successful!
🎯 Total features calculated: 88-89
✅ All features have valid types!
🎉 Test completed successfully!
```

### Test with Real API
```bash
# Deploy functions
firebase deploy --only functions:getNBAPropsWithML,functions:getPlayerGameLogs

# Test game logs endpoint
curl "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/getPlayerGameLogs?playerId=265&season=2024"

# Test full ML pipeline (with valid prop data)
curl -X POST "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/getNBAPropsWithML" \
  -H "Content-Type: application/json" \
  -d '{
    "team1": "Los Angeles Lakers",
    "team2": "Golden State Warriors",
    "team1_code": "LAL",
    "team2_code": "GSW",
    "gameDate": "2026-02-05T02:00:00Z",
    "props": [...]
  }'
```

---

## Error Handling

### Common Errors

1. **No game logs found**
   - Cause: Player hasn't played recently or invalid player ID
   - Response: Returns `null` for that prop, continues with others

2. **API-Sports timeout**
   - Cause: API is slow or down
   - Mitigation: 10-second timeout on API calls, returns cached data if available

3. **Invalid prop data**
   - Cause: Missing required fields (playerId, statType, consensusLine)
   - Response: Skips that prop, logs warning

4. **Rate limit exceeded**
   - Cause: Too many API calls
   - Mitigation: Firestore cache reduces calls by ~80%

---

## Integration with Frontend

### Add to `services/api.ts`

```typescript
/**
 * Get NBA props with ML features
 */
static async getNBAPropsWithML(
  team1: string,
  team2: string,
  team1_code: string,
  team2_code: string,
  gameDate: string,
  props: Array<any>
): Promise<any> {
  try {
    const response = await fetch(`${this.baseURL}/getNBAPropsWithML`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        team1,
        team2,
        team1_code,
        team2_code,
        gameDate,
        props
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching NBA props with ML:", error);
    throw error;
  }
}
```

---

## Next Steps

### Phase 1: Deploy & Test ✅ COMPLETE
- [x] Created NBA helpers module
- [x] Built 88-feature engineering pipeline
- [x] Created Cloud Function orchestrator
- [x] Local testing with mock data

### Phase 2: Vertex AI Integration (NEXT)
- [ ] Create `vertexAI.js` helper for OAuth2 authentication
- [ ] Implement `callVertexAI(features)` function
- [ ] Parse ML predictions (probability_over, confidence, betting_value)
- [ ] Add to `getNBAPropsWithML` response

### Phase 3: Frontend Integration
- [ ] Add `APIService.getNBAPropsWithML()` method
- [ ] Update `player-props.tsx` to call new endpoint
- [ ] Display ML predictions with confidence scores
- [ ] Filter to HIGH confidence props (>15%)

### Phase 4: Production Optimization
- [ ] Monitor API-Sports rate limits
- [ ] Tune cache TTLs based on usage
- [ ] Add analytics tracking (feature calculation time, API success rate)
- [ ] Set up alerts for function failures

---

## Support

For questions or issues:
1. Check logs: `firebase functions:log`
2. Review test output: `node testMLFeatures.js`
3. Verify API-Sports key is set: `firebase functions:config:get`

---

**Last Updated:** 2026-02-04
**Status:** Phase 1 Complete ✅ Ready for Vertex AI integration
