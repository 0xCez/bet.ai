# ML Integration Blueprint: NBA Player Props Prediction System

> **Purpose:** This document contains EVERYTHING needed to reproduce the complete ML-powered NBA player props prediction pipeline in a new web application. Give this doc to Claude in the target codebase and it will re-create the entire integration.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Sources & APIs](#2-data-sources--apis)
3. [Complete 88-Feature Specification](#3-complete-88-feature-specification)
4. [Feature Engineering Implementation](#4-feature-engineering-implementation)
5. [Vertex AI Integration](#5-vertex-ai-integration)
6. [End-to-End Pipeline (Cloud Function)](#6-end-to-end-pipeline-cloud-function)
7. [Response Format & Confidence Logic](#7-response-format--confidence-logic)
8. [Caching Strategy](#8-caching-strategy)
9. [Dependencies & Configuration](#9-dependencies--configuration)
10. [Deployment & Auth Setup](#10-deployment--auth-setup)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     COMPLETE DATA FLOW                           │
│                                                                  │
│  Client Request (team1, team2)                                   │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────┐     ┌─────────────────────┐                │
│  │  SGO API         │     │  API-Sports          │                │
│  │  (Betting Odds)  │     │  (Player Game Logs)  │                │
│  └────────┬────────┘     └─────────┬───────────┘                │
│           │                         │                            │
│           ▼                         ▼                            │
│  Extract player props      Fetch last 15 games                   │
│  (lines, odds, names)      per player (game-by-game)             │
│           │                         │                            │
│           └─────────┬───────────────┘                            │
│                     ▼                                            │
│         ┌─────────────────────┐                                  │
│         │  Feature Engineering │                                  │
│         │  (88 Features)       │                                  │
│         └──────────┬──────────┘                                  │
│                    ▼                                              │
│         ┌─────────────────────┐                                  │
│         │  Vertex AI CatBoost  │                                  │
│         │  Model Prediction    │                                  │
│         └──────────┬──────────┘                                  │
│                    ▼                                              │
│         ┌─────────────────────┐                                  │
│         │  Filter & Rank       │                                  │
│         │  (confidence > 10%)  │                                  │
│         └──────────┬──────────┘                                  │
│                    ▼                                              │
│         Top 10 Props Response                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Tech stack:** Node.js 22, Firebase Cloud Functions, Firestore, Google Vertex AI (CatBoost model)

---

## 2. Data Sources & APIs

### 2.1 SGO API (Sports Game Odds) — Betting Lines

- **Base URL:** `https://api.sportsgameodds.com/v2`
- **Auth:** Query param `apiKey=<YOUR_SGO_KEY>`
- **Endpoint:** `GET /events/?apiKey={key}&leagueID=NBA&oddsAvailable=true&limit=50`

**What it provides:**
- Real-time player props for upcoming NBA games
- Per-bookmaker odds (DraftKings, FanDuel, BetMGM, Caesars, etc.)
- Over/Under lines and American odds
- Player names, team assignments

**How to extract props from SGO response:**

```javascript
// SGO returns event.odds as an object keyed by oddID
// Each odd has: playerID, statID, betTypeID, sideID, byBookmaker
// Group by playerID+statID, separate over/under by sideID

function extractProps(event) {
  const props = [];
  if (!event.odds || !event.players) return props;

  const playerOddsMap = {};
  for (const odd of Object.values(event.odds)) {
    if (!odd.playerID || odd.betTypeID !== 'ou') continue;
    const key = `${odd.playerID}-${odd.statID}`;
    if (!playerOddsMap[key]) playerOddsMap[key] = {};
    if (odd.sideID === 'over') playerOddsMap[key].over = odd;
    else if (odd.sideID === 'under') playerOddsMap[key].under = odd;
  }

  for (const odds of Object.values(playerOddsMap)) {
    const { over, under } = odds;
    if (!over || !under) continue;

    const player = event.players?.[over.playerID];
    if (!player) continue;

    let playerName = player.name || '';
    if (!playerName && player.firstName && player.lastName) {
      playerName = `${player.firstName} ${player.lastName}`.trim();
    }
    if (!playerName) continue;

    // Calculate consensus line (average across bookmakers)
    let lineSum = 0, lineCount = 0;
    let bestOverOdds = -Infinity, bestUnderOdds = -Infinity;
    let bestOverBook = '', bestUnderBook = '';

    if (over.byBookmaker) {
      for (const [bk, bo] of Object.entries(over.byBookmaker)) {
        if (!bo.available || !bo.overUnder) continue;
        const ub = under.byBookmaker?.[bk];
        if (!ub?.available) continue;

        const lv = parseFloat(bo.overUnder);
        if (!isNaN(lv)) { lineSum += lv; lineCount++; }

        const oo = parseInt(bo.odds, 10);
        const uo = parseInt(ub.odds, 10);
        if (oo > bestOverOdds) { bestOverOdds = oo; bestOverBook = bk; }
        if (uo > bestUnderOdds) { bestUnderOdds = uo; bestUnderBook = bk; }
      }
    }

    if (lineCount === 0) continue;

    const isHome = player.teamID === event.teams.home.teamID;

    props.push({
      playerName,
      team: isHome ? event.teams.home.names.long : event.teams.away.names.long,
      isHome,
      statType: over.statID,
      line: Math.round((lineSum / lineCount) * 10) / 10,
      oddsOver: bestOverOdds,
      oddsUnder: bestUnderOdds,
      bookmakerOver: bestOverBook,
      bookmakerUnder: bestUnderBook
    });
  }

  return props;
}
```

**Bookmaker name normalization** (SGO uses lowercase, model trained on capitalized):

```javascript
const BOOKMAKER_MAP = {
  'draftkings': 'DraftKings',
  'fanduel': 'FanDuel',
  'betmgm': 'BetMGM',
  'caesars': 'Caesars',
  'bovada': 'Bovada',
  'pointsbet': 'PointsBet',
  'bet365': 'Bet365',
  'betrivers': 'BetRivers',
  'unibet': 'Unibet',
  'wynnbet': 'WynnBet',
  'hardrock': 'Hard Rock',
};
```

### 2.2 API-Sports — Player Game Logs

- **Base URL:** `https://v2.nba.api-sports.io`
- **Auth:** Header `x-apisports-key: <YOUR_KEY>`
- **Rate Limit:** 3,000 requests/day (paid tier)

**Endpoint for individual game logs:**

```
GET /players/statistics?season={season}&id={playerId}
```

> **CRITICAL:** Use `id=<playerId>` (NOT `team=<teamId>`) to get game-by-game logs. Using `team` returns season aggregates which are useless for this pipeline.

**Season calculation:**

```javascript
function getCurrentNBASeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // NBA season starts in October. Oct-Dec = current year, Jan-Sep = previous year
  return month >= 10 ? year : year - 1;
}
```

**Player ID resolution** (search by last name, match full name):

```javascript
async function findPlayerId(playerName, apiKey) {
  const cacheKey = playerName.toLowerCase().trim();
  if (playerIdCache[cacheKey]) return playerIdCache[cacheKey];

  const parts = playerName.trim().split(' ');
  const lastName = parts[parts.length - 1];

  const response = await axios.get(
    `https://v2.nba.api-sports.io/players?search=${encodeURIComponent(lastName)}`,
    { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
  );

  if (!response.data?.response?.length) return null;

  const normalizedSearch = playerName.toLowerCase().replace(/[^a-z\s]/g, '').trim();

  // Exact match
  for (const p of response.data.response) {
    const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (fullName === normalizedSearch) {
      playerIdCache[cacheKey] = p.id;
      return p.id;
    }
  }

  // Partial match fallback
  for (const p of response.data.response) {
    const fullName = `${p.firstname || ''} ${p.lastname || ''}`.toLowerCase();
    if (fullName.includes(normalizedSearch) || normalizedSearch.includes(fullName)) {
      playerIdCache[cacheKey] = p.id;
      return p.id;
    }
  }

  // Last resort: first result
  playerIdCache[cacheKey] = response.data.response[0].id;
  return response.data.response[0].id;
}
```

**Raw game log structure from API-Sports:**

```javascript
{
  game: { id: 12345, date: { start: '2026-02-02T02:00:00Z' } },
  points: 28,
  totReb: 8,        // Total rebounds
  assists: 9,
  min: '36:24',      // String format MM:SS
  fgm: 11,           // Field goals made
  fga: 22,           // Field goals attempted
  tpm: 2,            // Three-pointers made (NOT "fg3m")
  tpa: 6,            // Three-pointers attempted (NOT "fg3a")
  ftm: 4,            // Free throws made
  fta: 5,            // Free throws attempted
  steals: 1,
  blocks: 0,
  turnovers: 3
}
```

> **IMPORTANT field names:** API-Sports uses `tpm`/`tpa` for three-pointers (not `fg3m`/`fg3a`), and `totReb` for rebounds (not `reb` or `rebounds`).

**Game log fetching with season fallback:**

```javascript
async function getGameLogs(playerId, apiKey, limit = 15) {
  const season = getCurrentNBASeason();
  const response = await axios.get(
    `https://v2.nba.api-sports.io/players/statistics?season=${season}&id=${playerId}`,
    { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
  );

  if (!response.data?.response?.length) {
    // Try previous season as fallback
    const prevResponse = await axios.get(
      `https://v2.nba.api-sports.io/players/statistics?season=${season - 1}&id=${playerId}`,
      { headers: { 'x-apisports-key': apiKey }, timeout: 10000 }
    );
    if (!prevResponse.data?.response?.length) return [];
    let logs = prevResponse.data.response;
    logs.sort((a, b) => (b.game?.id || 0) - (a.game?.id || 0));
    return logs.slice(0, limit);
  }

  let logs = response.data.response;
  // Sort by game.id DESC (higher = more recent). game.date is often null.
  logs.sort((a, b) => (b.game?.id || 0) - (a.game?.id || 0));
  return logs.slice(0, limit);
}
```

---

## 3. Complete 88-Feature Specification

The model expects EXACTLY 88 features. Here is every single one, organized by category:

### 3.1 Categorical Features (5)

| Feature | Type | Values |
|---------|------|--------|
| `prop_type` | string | `"points"`, `"rebounds"`, `"assists"`, `"threePointersMade"`, `"steals"`, `"blocks"`, `"turnovers"`, `"points_rebounds"`, `"points_assists"`, `"rebounds_assists"`, `"points_rebounds_assists"` |
| `home_team` | string | Team code: `"LAL"`, `"GSW"`, `"BOS"`, etc. |
| `away_team` | string | Team code |
| `bookmaker` | string | `"DraftKings"`, `"FanDuel"`, `"BetMGM"`, `"Caesars"`, etc. |
| `SEASON` | string | `"2025-26"`, `"2024-25"`, etc. |

**Prop type mapping from SGO stat IDs:**

```javascript
const propTypeMap = {
  'points': 'points',
  'rebounds': 'rebounds',
  'assists': 'assists',
  'threePointersMade': 'threePointersMade',
  'steals': 'steals',
  'blocks': 'blocks',
  'turnovers': 'turnovers',
  'points+rebounds': 'points_rebounds',
  'points+assists': 'points_assists',
  'rebounds+assists': 'rebounds_assists',
  'points+rebounds+assists': 'points_rebounds_assists'
};
```

### 3.2 Temporal Features (3)

| Feature | Type | Description |
|---------|------|-------------|
| `year` | int | Game year (e.g., 2026) |
| `month` | int | 1-12 |
| `day_of_week` | int | 0-6 (0=Sunday) |

### 3.3 Last 3 Games Stats — L3 (12)

Rolling averages over the most recent 3 games:

| Feature | Computation |
|---------|------------|
| `L3_PTS` | avg(points) |
| `L3_REB` | avg(totReb) |
| `L3_AST` | avg(assists) |
| `L3_MIN` | avg(parseMinutes(min)) |
| `L3_FG_PCT` | total_fgm / total_fga (0-1 decimal) |
| `L3_FG3M` | avg(tpm) |
| `L3_FG3_PCT` | total_tpm / total_tpa (0-1 decimal) |
| `L3_STL` | avg(steals) |
| `L3_BLK` | avg(blocks) |
| `L3_TOV` | avg(turnovers) |
| `L3_FGM` | avg(fgm) |
| `L3_FGA` | avg(fga) |

### 3.4 Last 10 Games Stats — L10 (15)

Same as L3 but over 10 games, plus standard deviations:

| Feature | Computation |
|---------|------------|
| `L10_PTS` | avg(points) |
| `L10_REB` | avg(totReb) |
| `L10_AST` | avg(assists) |
| `L10_MIN` | avg(parseMinutes(min)) |
| `L10_FG_PCT` | total_fgm / total_fga |
| `L10_FG3M` | avg(tpm) |
| `L10_FG3_PCT` | total_tpm / total_tpa |
| `L10_STL` | avg(steals) |
| `L10_BLK` | avg(blocks) |
| `L10_TOV` | avg(turnovers) |
| `L10_FGM` | avg(fgm) |
| `L10_FGA` | avg(fga) |
| `L10_PTS_STD` | stddev(per-game points array) |
| `L10_REB_STD` | stddev(per-game rebounds array) |
| `L10_AST_STD` | stddev(per-game assists array) |

### 3.5 Game Context Features (5)

| Feature | Computation |
|---------|------------|
| `HOME_AWAY` | 1 if player on home team, 0 if away |
| `DAYS_REST` | Days since player's last game (default 2 if unknown) |
| `BACK_TO_BACK` | 1 if DAYS_REST === 1, else 0 |
| `GAMES_IN_LAST_7` | Count of games in past 7 days (default 3) |
| `MINUTES_TREND` | L3_MIN - L10_MIN (positive = more playing time recently) |

### 3.6 Advanced Performance Metrics (12)

| Feature | Formula |
|---------|---------|
| `SCORING_EFFICIENCY` | L3_PTS / L3_FGA (or 0 if L3_FGA=0) |
| `ASSIST_TO_RATIO` | L3_AST / L3_TOV (or L3_AST if L3_TOV=0) |
| `REBOUND_RATE` | L3_REB / L3_MIN |
| `USAGE_RATE` | L3_FGA / L3_MIN |
| `TREND_PTS` | L3_PTS - L10_PTS |
| `TREND_REB` | L3_REB - L10_REB |
| `TREND_AST` | L3_AST - L10_AST |
| `CONSISTENCY_PTS` | L10_PTS_STD / L10_PTS (coefficient of variation) |
| `CONSISTENCY_REB` | L10_REB_STD / L10_REB |
| `CONSISTENCY_AST` | L10_AST_STD / L10_AST |
| `ACCELERATION_PTS` | TREND_PTS / DAYS_REST |
| `EFFICIENCY_STABLE` | 1 if abs(L3_FG_PCT - L10_FG_PCT) < 0.05, else 0 |

### 3.7 Interaction Features (6)

| Feature | Formula |
|---------|---------|
| `L3_PTS_x_HOME` | L3_PTS * HOME_AWAY |
| `L3_REB_x_HOME` | L3_REB * HOME_AWAY |
| `L3_AST_x_HOME` | L3_AST * HOME_AWAY |
| `L3_MIN_x_B2B` | L3_MIN * BACK_TO_BACK |
| `L3_PTS_x_REST` | L3_PTS * DAYS_REST |
| `USAGE_x_EFFICIENCY` | USAGE_RATE * SCORING_EFFICIENCY |

### 3.8 Composite Metrics (8)

| Feature | Formula |
|---------|---------|
| `LOAD_INTENSITY` | GAMES_IN_LAST_7 * (L10_MIN / 7) |
| `SHOOTING_VOLUME` | L3_FGA |
| `REBOUND_INTENSITY` | L3_REB * REBOUND_RATE |
| `PLAYMAKING_EFFICIENCY` | L3_AST * ASSIST_TO_RATIO |
| `THREE_POINT_THREAT` | L3_FG3M * L3_FG3_PCT |
| `DEFENSIVE_IMPACT` | L3_STL + L3_BLK + 0.5 |
| `PTS_VOLATILITY` | L10_PTS_STD / L10_PTS |
| `MINUTES_STABILITY` | L3_MIN / L10_MIN (1.0=stable, >1=increasing) |

### 3.9 Ratio Features (2)

| Feature | Formula |
|---------|---------|
| `L3_vs_L10_PTS_RATIO` | L3_PTS / L10_PTS (>1 = hot streak) |
| `L3_vs_L10_REB_RATIO` | L3_REB / L10_REB |

### 3.10 Betting Line Features (21)

| Feature | Formula |
|---------|---------|
| `line` | Consensus prop line (e.g., 28.5) |
| `odds_over` | American odds for Over (e.g., -110) |
| `odds_under` | American odds for Under |
| `implied_prob_over` | americanToImpliedProb(odds_over) |
| `implied_prob_under` | americanToImpliedProb(odds_under) |
| `LINE_VALUE` | (l3Stat - line) / line |
| `ODDS_EDGE` | implied_prob_over - implied_prob_under |
| `odds_spread` | odds_over - odds_under |
| `market_confidence` | abs(implied_prob_over - 0.5) |
| `L3_PTS_vs_LINE` | L3_PTS - line |
| `L3_REB_vs_LINE` | L3_REB - line |
| `L3_AST_vs_LINE` | L3_AST - line |
| `LINE_DIFFICULTY_PTS` | line / L10_PTS |
| `LINE_DIFFICULTY_REB` | line / L10_REB |
| `LINE_DIFFICULTY_AST` | line / L10_AST |
| `IMPLIED_PROB_OVER` | same as implied_prob_over (duplicate for model) |
| `LINE_vs_AVG_PTS` | line - L10_PTS |
| `LINE_vs_AVG_REB` | line - L10_REB |
| `L3_vs_market` | (L3_PTS - line) * implied_prob_over |
| `L10_vs_market` | (L10_PTS - line) * implied_prob_over |

> **Note on LINE_VALUE:** Uses the L3 stat matching the prop type (points->L3_PTS, rebounds->L3_REB, assists->L3_AST). For combo props, defaults to L3_PTS.

---

## 4. Feature Engineering Implementation

### 4.1 Utility Functions

```javascript
function parseMinutes(minStr) {
  if (!minStr || typeof minStr !== 'string') return 0;
  const parts = minStr.split(':');
  return (parseInt(parts[0]) || 0) + ((parseInt(parts[1]) || 0) / 60);
}

function stddev(arr) {
  if (!arr || arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length);
}

function daysBetween(d1, d2) {
  return Math.ceil(Math.abs(new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function americanToImpliedProb(odds) {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}
```

### 4.2 Complete `buildFeatures` Function

This is the single function that takes game logs + prop data and outputs the 88-feature object:

```javascript
function buildFeatures(gameLogs, prop, homeTeam, awayTeam, gameDate) {
  const l3Games = gameLogs.slice(0, 3);
  const l10Games = gameLogs.slice(0, 10);

  // ── L3 Stats ──
  const l3Count = l3Games.length || 1;
  let l3 = { pts: 0, reb: 0, ast: 0, min: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, stl: 0, blk: 0, tov: 0 };
  l3Games.forEach(g => {
    l3.pts += g.points || 0;
    l3.reb += g.totReb || 0;
    l3.ast += g.assists || 0;
    l3.min += parseMinutes(g.min);
    l3.fgm += g.fgm || 0;
    l3.fga += g.fga || 0;
    l3.fg3m += g.tpm || 0;   // API-Sports uses 'tpm'
    l3.fg3a += g.tpa || 0;   // API-Sports uses 'tpa'
    l3.ftm += g.ftm || 0;
    l3.fta += g.fta || 0;
    l3.stl += g.steals || 0;
    l3.blk += g.blocks || 0;
    l3.tov += g.turnovers || 0;
  });

  const L3_PTS = l3.pts / l3Count;
  const L3_REB = l3.reb / l3Count;
  const L3_AST = l3.ast / l3Count;
  const L3_MIN = l3.min / l3Count;
  const L3_FG_PCT = l3.fga > 0 ? l3.fgm / l3.fga : 0;
  const L3_FG3M = l3.fg3m / l3Count;
  const L3_FG3_PCT = l3.fg3a > 0 ? l3.fg3m / l3.fg3a : 0;
  const L3_STL = l3.stl / l3Count;
  const L3_BLK = l3.blk / l3Count;
  const L3_TOV = l3.tov / l3Count;
  const L3_FGM = l3.fgm / l3Count;
  const L3_FGA = l3.fga / l3Count;

  // ── L10 Stats ──
  const l10Count = l10Games.length || 1;
  let l10 = { pts: 0, reb: 0, ast: 0, min: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, stl: 0, blk: 0, tov: 0 };
  const ptsArr = [], rebArr = [], astArr = [];
  l10Games.forEach(g => {
    const pts = g.points || 0;
    const reb = g.totReb || 0;
    const ast = g.assists || 0;
    ptsArr.push(pts); rebArr.push(reb); astArr.push(ast);
    l10.pts += pts;
    l10.reb += reb;
    l10.ast += ast;
    l10.min += parseMinutes(g.min);
    l10.fgm += g.fgm || 0;
    l10.fga += g.fga || 0;
    l10.fg3m += g.tpm || 0;
    l10.fg3a += g.tpa || 0;
    l10.stl += g.steals || 0;
    l10.blk += g.blocks || 0;
    l10.tov += g.turnovers || 0;
  });

  const L10_PTS = l10.pts / l10Count;
  const L10_REB = l10.reb / l10Count;
  const L10_AST = l10.ast / l10Count;
  const L10_MIN = l10.min / l10Count;
  const L10_FG_PCT = l10.fga > 0 ? l10.fgm / l10.fga : 0;
  const L10_FG3M = l10.fg3m / l10Count;
  const L10_FG3_PCT = l10.fg3a > 0 ? l10.fg3m / l10.fg3a : 0;
  const L10_STL = l10.stl / l10Count;
  const L10_BLK = l10.blk / l10Count;
  const L10_TOV = l10.tov / l10Count;
  const L10_FGM = l10.fgm / l10Count;
  const L10_FGA = l10.fga / l10Count;
  const L10_PTS_STD = stddev(ptsArr);
  const L10_REB_STD = stddev(rebArr);
  const L10_AST_STD = stddev(astArr);

  // ── Game Context ──
  const HOME_AWAY = prop.isHome ? 1 : 0;
  const DAYS_REST = 2;          // Default (API-Sports game.date often null)
  const BACK_TO_BACK = 0;
  const GAMES_IN_LAST_7 = 3;
  const MINUTES_TREND = L3_MIN - L10_MIN;

  // ── Advanced Metrics ──
  const SCORING_EFFICIENCY = L3_FGA > 0 ? L3_PTS / L3_FGA : 0;
  const ASSIST_TO_RATIO = L3_TOV > 0 ? L3_AST / L3_TOV : L3_AST;
  const REBOUND_RATE = L3_MIN > 0 ? L3_REB / L3_MIN : 0;
  const USAGE_RATE = L3_MIN > 0 ? L3_FGA / L3_MIN : 0;
  const TREND_PTS = L3_PTS - L10_PTS;
  const TREND_REB = L3_REB - L10_REB;
  const TREND_AST = L3_AST - L10_AST;
  const CONSISTENCY_PTS = L10_PTS > 0 ? L10_PTS_STD / L10_PTS : 0;
  const CONSISTENCY_REB = L10_REB > 0 ? L10_REB_STD / L10_REB : 0;
  const CONSISTENCY_AST = L10_AST > 0 ? L10_AST_STD / L10_AST : 0;
  const ACCELERATION_PTS = DAYS_REST > 0 ? TREND_PTS / DAYS_REST : TREND_PTS;
  const EFFICIENCY_STABLE = Math.abs(L3_FG_PCT - L10_FG_PCT) < 0.05 ? 1 : 0;

  // ── Interaction Features ──
  const L3_PTS_x_HOME = L3_PTS * HOME_AWAY;
  const L3_REB_x_HOME = L3_REB * HOME_AWAY;
  const L3_AST_x_HOME = L3_AST * HOME_AWAY;
  const L3_MIN_x_B2B = L3_MIN * BACK_TO_BACK;
  const L3_PTS_x_REST = L3_PTS * DAYS_REST;
  const USAGE_x_EFFICIENCY = USAGE_RATE * SCORING_EFFICIENCY;

  // ── Composite Metrics ──
  const LOAD_INTENSITY = GAMES_IN_LAST_7 * (L10_MIN / 7);
  const SHOOTING_VOLUME = L3_FGA;
  const REBOUND_INTENSITY = L3_REB * REBOUND_RATE;
  const PLAYMAKING_EFFICIENCY = L3_AST * ASSIST_TO_RATIO;
  const THREE_POINT_THREAT = L3_FG3M * L3_FG3_PCT;
  const DEFENSIVE_IMPACT = L3_STL + L3_BLK + 0.5;
  const PTS_VOLATILITY = L10_PTS > 0 ? L10_PTS_STD / L10_PTS : 0;
  const MINUTES_STABILITY = L10_MIN > 0 ? L3_MIN / L10_MIN : 1;

  // ── Ratio Features ──
  const L3_vs_L10_PTS_RATIO = L10_PTS > 0 ? L3_PTS / L10_PTS : 1;
  const L3_vs_L10_REB_RATIO = L10_REB > 0 ? L3_REB / L10_REB : 1;

  // ── Betting Line Features ──
  const line = prop.line;
  const odds_over = prop.oddsOver;
  const odds_under = prop.oddsUnder;
  const implied_prob_over = americanToImpliedProb(odds_over);
  const implied_prob_under = americanToImpliedProb(odds_under);
  const LINE_VALUE = line !== 0 ? (L3_PTS - line) / line : 0;
  const ODDS_EDGE = implied_prob_over - implied_prob_under;
  const odds_spread = odds_over - odds_under;
  const market_confidence = Math.abs(implied_prob_over - 0.5);
  const L3_PTS_vs_LINE = L3_PTS - line;
  const L3_REB_vs_LINE = L3_REB - line;
  const L3_AST_vs_LINE = L3_AST - line;
  const LINE_DIFFICULTY_PTS = L10_PTS !== 0 ? line / L10_PTS : 1;
  const LINE_DIFFICULTY_REB = L10_REB !== 0 ? line / L10_REB : 1;
  const LINE_DIFFICULTY_AST = L10_AST !== 0 ? line / L10_AST : 1;
  const LINE_vs_AVG_PTS = line - L10_PTS;
  const LINE_vs_AVG_REB = line - L10_REB;
  const L3_vs_market = (L3_PTS - line) * implied_prob_over;
  const L10_vs_market = (L10_PTS - line) * implied_prob_over;

  // ── Temporal ──
  const date = new Date(gameDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day_of_week = date.getDay();

  // ── Season ──
  const SEASON = `${getCurrentNBASeason()}-${(getCurrentNBASeason() + 1) % 100}`;

  return {
    // Categorical (5)
    prop_type: propTypeMap[prop.statType] || prop.statType,
    home_team: homeTeam,
    away_team: awayTeam,
    bookmaker: normalizeBookmaker(prop.bookmakerOver) || 'DraftKings',
    SEASON,

    // Temporal (3)
    year, month, day_of_week,

    // L3 (12)
    L3_PTS, L3_REB, L3_AST, L3_MIN, L3_FG_PCT, L3_FG3M, L3_FG3_PCT,
    L3_STL, L3_BLK, L3_TOV, L3_FGM, L3_FGA,

    // L10 (15)
    L10_PTS, L10_REB, L10_AST, L10_MIN, L10_FG_PCT, L10_FG3M, L10_FG3_PCT,
    L10_STL, L10_BLK, L10_TOV, L10_FGM, L10_FGA,
    L10_PTS_STD, L10_REB_STD, L10_AST_STD,

    // Game Context (5)
    HOME_AWAY, DAYS_REST, BACK_TO_BACK, GAMES_IN_LAST_7, MINUTES_TREND,

    // Advanced (12)
    SCORING_EFFICIENCY, ASSIST_TO_RATIO, REBOUND_RATE, USAGE_RATE,
    TREND_PTS, TREND_REB, TREND_AST,
    CONSISTENCY_PTS, CONSISTENCY_REB, CONSISTENCY_AST,
    ACCELERATION_PTS, EFFICIENCY_STABLE,

    // Interactions (6)
    L3_PTS_x_HOME, L3_REB_x_HOME, L3_AST_x_HOME,
    L3_MIN_x_B2B, L3_PTS_x_REST, USAGE_x_EFFICIENCY,

    // Composites (8)
    LOAD_INTENSITY, SHOOTING_VOLUME, REBOUND_INTENSITY, PLAYMAKING_EFFICIENCY,
    THREE_POINT_THREAT, DEFENSIVE_IMPACT, PTS_VOLATILITY, MINUTES_STABILITY,

    // Ratios (2)
    L3_vs_L10_PTS_RATIO, L3_vs_L10_REB_RATIO,

    // Betting (21)
    line, odds_over, odds_under, implied_prob_over, implied_prob_under,
    LINE_VALUE, ODDS_EDGE, odds_spread, market_confidence,
    L3_PTS_vs_LINE, L3_REB_vs_LINE, L3_AST_vs_LINE,
    LINE_DIFFICULTY_PTS, LINE_DIFFICULTY_REB, LINE_DIFFICULTY_AST,
    IMPLIED_PROB_OVER: implied_prob_over,
    LINE_vs_AVG_PTS, LINE_vs_AVG_REB,
    L3_vs_market, L10_vs_market
  };
}
```

---

## 5. Vertex AI Integration

### 5.1 Model Details

| Property | Value |
|----------|-------|
| **Model Type** | CatBoost (gradient boosting) |
| **Task** | Binary classification (Over/Under) |
| **Accuracy** | 64.9% on test set |
| **Brier Score** | 0.2308 |
| **ROI** | 41.1% following confidence-based strategy |
| **Region** | us-central1 |
| **Project Number** | 133991312998 |
| **Project ID** | betai-f9176 |
| **Endpoint ID** | 7508590194849742848 |
| **Model Display Name** | nba-props-catboost-v2 |

### 5.2 Prediction Endpoint

```
POST https://us-central1-aiplatform.googleapis.com/v1/projects/133991312998/locations/us-central1/endpoints/7508590194849742848:predict
```

### 5.3 Authentication (OAuth2 Service Account)

```javascript
const { GoogleAuth } = require('google-auth-library');

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 300000) return cachedToken; // 5-min buffer

  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();
  cachedToken = token.token;
  tokenExpiry = now + 3600000; // 1 hour
  return cachedToken;
}
```

### 5.4 Making Predictions

**Single prediction:**

```javascript
async function callVertexAI(features) {
  const accessToken = await getAccessToken();

  const response = await axios.post(
    VERTEX_ENDPOINT,
    { instances: [features] },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  return parsePredictionResponse(response.data);
}
```

**Batch predictions (more efficient):**

```javascript
async function predictBatch(featuresArray) {
  const token = await getAccessToken();

  const response = await axios.post(
    VERTEX_ENDPOINT,
    { instances: featuresArray },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60s for batch
    }
  );

  return response.data.predictions;
}
```

### 5.5 Response Format

**Raw Vertex AI response:**

```json
{
  "predictions": [
    {
      "prediction": "Over",
      "probability_over": 0.787254950367566,
      "probability_under": 0.212745049632434,
      "confidence": 0.287254950367566,
      "should_bet": true,
      "betting_value": "high"
    }
  ],
  "deployedModelId": "1459976069581897728",
  "model": "projects/133991312998/locations/us-central1/models/657542038270509056",
  "modelDisplayName": "nba-props-catboost-v2",
  "modelVersionId": "1"
}
```

### 5.6 Parsing Predictions

```javascript
function parsePredictionResponse(rawResponse) {
  const prediction = rawResponse.predictions[0];

  const probabilityOver = prediction.probability_over;
  const probabilityUnder = prediction.probability_under;
  const confidence = prediction.confidence;  // abs(prob - 0.5)

  return {
    prediction: prediction.prediction,  // "Over" or "Under"
    probabilityOver,
    probabilityUnder,
    probabilityOverPercent: (probabilityOver * 100).toFixed(1),
    probabilityUnderPercent: (probabilityUnder * 100).toFixed(1),
    confidence,
    confidencePercent: (confidence * 100).toFixed(1),
    confidenceTier: getBettingValueTier(confidence),
    shouldBet: confidence > 0.10,
    bettingValue: getBettingValueTier(confidence),
    modelInfo: {
      deployedModelId: rawResponse.deployedModelId,
      modelDisplayName: rawResponse.modelDisplayName,
      modelVersionId: rawResponse.modelVersionId
    }
  };
}

function getBettingValueTier(confidence) {
  if (confidence > 0.15) return 'high';     // ~70% win rate
  if (confidence >= 0.10) return 'medium';   // ~62% win rate
  return 'low';                              // ~52%, not recommended
}
```

---

## 6. End-to-End Pipeline (Cloud Function)

This is the complete orchestration — the main cloud function that ties everything together:

```javascript
// Cloud Function: getMLPlayerPropsV2
// Input:  { team1: "Lakers", team2: "Warriors", sport: "NBA", gameDate?: "ISO" }
// Output: { topProps: [...], totalPropsAvailable, highConfidenceCount, ... }

exports.getMLPlayerPropsV2 = functions.https.onRequest(
  { timeoutSeconds: 300, memory: '1GiB', cors: true },
  async (req, res) => {
    const { team1, team2, sport, gameDate } = req.body;

    // 1. Validate
    if (sport.toLowerCase() !== 'nba') return res.status(400).json({ error: 'Only NBA supported' });

    // 2. Fetch SGO event (matching game by team names)
    const event = await fetchSGOEvent(team1, team2);
    if (!event) return res.status(404).json({ error: 'No matching game found' });

    // 3. Extract all props from event odds
    const allProps = extractProps(event);

    // 4. Resolve player IDs (search API-Sports by name, batches of 5)
    const uniquePlayers = [...new Set(allProps.map(p => p.playerName))];
    const playerIdMap = {};
    for (let i = 0; i < uniquePlayers.length; i += 5) {
      const batch = uniquePlayers.slice(i, i + 5);
      const results = await Promise.all(batch.map(name => findPlayerId(name, apiKey)));
      batch.forEach((name, idx) => { playerIdMap[name] = results[idx]; });
    }

    // 5. Fetch game logs for resolved players (batches of 4)
    const gameLogsMap = {};
    const validPlayerIds = Object.entries(playerIdMap).filter(([, id]) => id !== null);
    for (let i = 0; i < validPlayerIds.length; i += 4) {
      const batch = validPlayerIds.slice(i, i + 4);
      const results = await Promise.all(batch.map(([, id]) => getGameLogs(id, apiKey)));
      batch.forEach(([name], idx) => { gameLogsMap[name] = results[idx]; });
    }

    // 6. Build 88 features for each prop that has game logs
    const processableProps = allProps.filter(p => gameLogsMap[p.playerName]?.length > 0);
    const featuresList = processableProps.map(prop =>
      buildFeatures(gameLogsMap[prop.playerName], prop, homeTeamCode, awayTeamCode, gameDate)
    );

    // 7. Call Vertex AI in batches of 10
    const allPredictions = [];
    for (let i = 0; i < featuresList.length; i += 10) {
      const batch = featuresList.slice(i, i + 10);
      const preds = await predictBatch(batch);
      allPredictions.push(...preds);
    }

    // 8. Combine props with predictions, filter to confidence > 10%
    const results = [];
    processableProps.forEach((prop, idx) => {
      const pred = allPredictions[idx];
      if (!pred) return;

      const confidence = pred.confidence;
      if (confidence > 0.10) {
        results.push({
          playerName: prop.playerName,
          team: prop.team,
          statType: prop.statType,
          line: prop.line,
          prediction: pred.prediction,      // "Over" or "Under"
          probabilityOver: pred.probability_over,
          probabilityUnder: pred.probability_under,
          confidence,
          confidencePercent: (confidence * 100).toFixed(1),
          confidenceTier: confidence > 0.15 ? 'high' : 'medium',
          oddsOver: prop.oddsOver,
          oddsUnder: prop.oddsUnder,
          gamesUsed: gameLogsMap[prop.playerName].length,
          playerStats: { /* L10 averages for UI display */ }
        });
      }
    });

    // 9. Sort by confidence, take top 10
    results.sort((a, b) => b.confidence - a.confidence);
    const topProps = results.slice(0, 10);

    return res.status(200).json({
      success: true,
      sport: 'NBA',
      teams: { home: event.teams.home.names.long, away: event.teams.away.names.long },
      gameTime: event.status.startsAt,
      totalPropsAvailable: allProps.length,
      propsAnalyzed: processableProps.length,
      highConfidenceCount: topProps.filter(p => p.confidenceTier === 'high').length,
      mediumConfidenceCount: topProps.filter(p => p.confidenceTier === 'medium').length,
      topProps,
      timestamp: new Date().toISOString()
    });
  }
);
```

---

## 7. Response Format & Confidence Logic

### 7.1 Final API Response Shape

```typescript
interface MLPropsResponse {
  success: boolean;
  sport: 'NBA';
  eventId: string;
  teams: {
    home: string;   // "Los Angeles Lakers"
    away: string;   // "Golden State Warriors"
  };
  gameTime: string; // ISO date
  totalPropsAvailable: number;
  propsAnalyzed: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  topProps: PropPrediction[];
  timestamp: string;
}

interface PropPrediction {
  playerName: string;     // "LeBron James"
  team: string;           // "Los Angeles Lakers"
  statType: string;       // "points", "rebounds", etc.
  line: number;           // 28.5
  prediction: string;     // "Over" or "Under"
  probabilityOver: number;  // 0.787
  probabilityUnder: number; // 0.213
  confidence: number;       // 0.287
  confidencePercent: string; // "28.7"
  confidenceTier: string;   // "high" or "medium"
  oddsOver: number;         // -110
  oddsUnder: number;        // -110
  gamesUsed: number;        // 15
  playerStats: {
    pointsPerGame: number;
    reboundsPerGame: number;
    assistsPerGame: number;
    stealsPerGame: number;
    blocksPerGame: number;
    fgPct: number;          // Percentage (46.3, not 0.463)
    fg3Pct: number;
    minutesPerGame: number;
  } | null;
}
```

### 7.2 Confidence Tiers

| Tier | Confidence Range | Probability | Win Rate | Recommendation |
|------|-----------------|-------------|----------|---------------|
| **HIGH** | > 0.15 | 65%+ | ~70% | Strong bet |
| **MEDIUM** | 0.10 - 0.15 | 60-65% | ~62% | Moderate bet |
| **LOW** | < 0.10 | 50-60% | ~52% | Skip (not shown) |

### 7.3 Filtering Logic

- Only show props where `confidence > 0.10` (shouldBet = true)
- Sort all qualifying props by confidence descending
- Take top 10 props
- Count high vs medium for summary stats

---

## 8. Caching Strategy

### 8.1 Game Logs Cache (Firestore)

```javascript
// Collection: ml_cache
// Key format: player_gamelogs_{playerId}_{season}
// TTL: 1 hour (3,600,000 ms)

async function getCachedGameLogs(playerId, season) {
  const cacheKey = `player_gamelogs_${playerId}_${season}`;
  const cacheDoc = await db.collection('ml_cache').doc(cacheKey).get();

  if (cacheDoc.exists) {
    const cached = cacheDoc.data();
    if (Date.now() - cached.timestamp < 3600000) {
      return cached.gameLogs; // Cache HIT
    }
  }

  // Cache MISS - fetch from API
  const gameLogs = await getPlayerGameLogs(playerId, season, 15);

  // Store in cache
  await db.collection('ml_cache').doc(cacheKey).set({
    playerId, season, gameLogs, timestamp: Date.now()
  });

  return gameLogs;
}
```

### 8.2 Player ID Cache (In-Memory)

```javascript
// Persists across invocations within same function instance
const playerIdCache = {};
// Key: playerName.toLowerCase().trim()
// Value: API-Sports player ID (number)
```

### 8.3 OAuth2 Token Cache (In-Memory)

```javascript
let cachedToken = null;
let tokenExpiry = 0;
// Token valid for ~1 hour, refresh 5 minutes before expiry
```

---

## 9. Dependencies & Configuration

### 9.1 NPM Dependencies

```json
{
  "dependencies": {
    "axios": "^1.8.4",
    "firebase-admin": "^12.7.0",
    "firebase-functions": "^6.3.2",
    "google-auth-library": "^9.0.0"
  }
}
```

### 9.2 Environment Variables

```bash
API_SPORTS_KEY=<your-api-sports-key>          # NBA stats API
GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account-key.json>  # Vertex AI auth
```

### 9.3 Hardcoded Config (in code)

```javascript
const SGO_API_KEY = '<your-sgo-key>';
const SGO_BASE_URL = 'https://api.sportsgameodds.com/v2';
const VERTEX_ENDPOINT = 'https://us-central1-aiplatform.googleapis.com/v1/projects/133991312998/locations/us-central1/endpoints/7508590194849742848:predict';
```

### 9.4 Firebase Configuration

```json
{
  "functions": [{
    "source": "functions",
    "runtime": "nodejs22",
    "serviceAccount": "nba-props-predictor@betai-f9176.iam.gserviceaccount.com"
  }]
}
```

---

## 10. Deployment & Auth Setup

### 10.1 GCP Service Account Setup

```bash
# 1. Create service account
gcloud iam service-accounts create nba-props-predictor \
  --display-name="NBA Props Predictor"

# 2. Grant Vertex AI user role
gcloud projects add-iam-policy-binding betai-f9176 \
  --member="serviceAccount:nba-props-predictor@betai-f9176.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"

# 3. Generate key file (for local development)
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=nba-props-predictor@betai-f9176.iam.gserviceaccount.com

# 4. Set environment variable (local dev)
export GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
```

### 10.2 Firebase Deploy

```bash
firebase deploy --only functions
```

### 10.3 Health Check Endpoint

```javascript
// GET /testVertexAI - verifies auth and endpoint connectivity
exports.testVertexAI = functions.https.onRequest(async (req, res) => {
  const token = await getAccessToken();
  res.json({
    status: 'success',
    authenticated: true,
    endpoint: VERTEX_ENDPOINT,
    tokenObtained: !!token
  });
});
```

---

## Quick Reference: File Structure

```
functions/
├── mlPlayerPropsV2.js              # Main cloud function (production)
├── nbaPropsML.js                   # Orchestrator with Firestore caching
├── helpers/
│   ├── mlFeatureEngineering.js     # 88-feature calculation engine
│   ├── vertexAI.js                 # Vertex AI auth + prediction
│   └── nbaHelpers.js               # API-Sports utilities
├── data/
│   └── nbaStarPlayers.json         # Pre-mapped player IDs (optional)
└── package.json
```

---

## Gotchas & Important Notes

1. **API-Sports field names:** `tpm`/`tpa` (NOT fg3m/fg3a), `totReb` (NOT reb/rebounds)
2. **FG_PCT as decimal:** Model expects 0-1 (e.g., 0.463), NOT percentage (46.3%)
3. **Sort game logs by game.id DESC** — `game.date` is often null in API-Sports
4. **Season calculation:** Oct-Dec = current year, Jan-Sep = previous year
5. **Batch predictions:** Send up to 10 instances per Vertex AI request
6. **Player ID resolution:** Search by last name, match normalized full name
7. **Division by zero:** Always guard with `x > 0 ? (a / x) : 0` pattern
8. **IMPLIED_PROB_OVER is a duplicate** of implied_prob_over (model expects both)
9. **The model is already deployed on Vertex AI** — you just need auth to call it
10. **Confidence = abs(probability_over - 0.5)** — NOT a separate model output
