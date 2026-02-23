# Bet.AI — API Integration Guide

> Reference doc for consuming Bet.AI Cloud Functions from an external webapp.

---

## Base URL

```
https://us-central1-betai-f9176.cloudfunctions.net
```

All endpoints support CORS (`Access-Control-Allow-Origin: *`).

---

## 1. EdgeBoard + Parlay Stack — `getCheatsheetData`

Returns all cached props for today's games. This is a **zero-latency read** from Firestore — no external API calls.

### Request

```
GET /getCheatsheetData
```

No params needed.

### Response

```json
{
  "success": true,
  "timestamp": "2026-02-23T18:00:00.000Z",
  "games": [
    { "home": "Los Angeles Lakers", "away": "Boston Celtics", "time": "2026-02-23T00:30:00Z" }
  ],
  "edge": [ ... ],
  "stack": [ ... ],
  "parlaySlips": [ ... ]
}
```

### `edge[]` — EdgeBoard Props (standard lines, ML-ranked)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Player name |
| `teamCode` | string | 3-letter team code (e.g. `"LAL"`) |
| `stat` | string | Display name (e.g. `"POINTS"`) |
| `statType` | string | Internal key (e.g. `"points"`) — use this when calling `getPlayerPropChart` |
| `dir` | string | `"over"` or `"under"` |
| `line` | number | Prop line (e.g. `25.5`) |
| `avg` | number | L10 average |
| `odds` | number | American odds (e.g. `-110`) |
| `bk` | string | Primary bookmaker short code (`"DK"`, `"FD"`, `"MGM"`, etc.) |
| `allBks` | array | All bookmakers: `[{ bk: "DK", odds: -110 }, ...]` |
| `l10` | number\|null | L10 Over hit rate % (0-100) |
| `szn` | number\|null | Season Over hit rate % |
| `dirL10` | number\|null | Directional L10 hit rate (accounts for Over vs Under) |
| `trend` | number\|null | Recent trend value |
| `defRank` | number\|null | Opponent defense rank (1-30, lower = tougher) |
| `defTeam` | string | Opponent 3-letter code |
| `isHome` | boolean | Player is on the home team |
| `green` | number | Green score (0-5 signals passing) |
| `betScore` | number\|null | ML confidence % |
| `edge` | number\|null | Edge value |
| `headshotUrl` | string\|null | ESPN player headshot URL |

### `stack[]` — Parlay Stack Props (alt lines, goblin-tier odds)

Same shape as `edge[]` with these differences:

| Field | Difference |
|-------|-----------|
| `line` | Alt line (lower/safer than standard) |
| `odds` | Range: -400 to -650 (heavy favorites by design) |
| `edge` | **Parlay edge** = actual L10 hit rate − implied probability from odds |
| `betScore` | Not present on stack |
| `defStat` | Abbreviated stat for defense context (`"PTS"`, `"REB"`, etc.) |

### `parlaySlips[]` — Pre-built Parlay Slips

3 pre-built parlays, each locked to one bookmaker for easy copy:

```json
{
  "name": "LOCK",
  "subtitle": "Safest alt lines",
  "bk": "DK",
  "legs": [ /* same shape as stack items */ ],
  "combinedOdds": -145
}
```

Slip names: `LOCK` (safest), `STEADY` (balanced), `SNIPER` (high-upside).

### Example: Fetch & build leaderboard (EdgeBoard)

```js
const API = 'https://us-central1-betai-f9176.cloudfunctions.net';

const { edge, stack, parlaySlips } = await fetch(`${API}/getCheatsheetData`)
  .then(r => r.json());

// EdgeBoard leaderboard — ranked by ML confidence
const leaderboard = edge
  .sort((a, b) => (b.betScore || 0) - (a.betScore || 0) || (b.green || 0) - (a.green || 0))
  .map((p, i) => ({
    rank: i + 1,
    name: p.name,
    pick: `${p.stat} ${p.dir === 'over' ? 'O' : 'U'} ${p.line}`,
    odds: p.odds,
    book: p.bk,
    green: p.green,
    betScore: p.betScore,
    headshot: p.headshotUrl,
  }));

// Parlay Stack — ranked by parlay edge
const stackRanked = stack
  .sort((a, b) => (b.edge || 0) - (a.edge || 0));
```

### Example: Filter by bookmaker (Parlay Stack)

```js
const BOOKS = [...new Set(stack.map(p => p.bk))]; // ['DK', 'FD', 'MGM', ...]

// Filter to DraftKings only
const dkLegs = stack.filter(p => p.bk === 'DK' || p.allBks.some(b => b.bk === 'DK'));
```

---

## 2. Player Prop Chart — `getPlayerPropChart`

Deep-dive into a single player+stat. Returns game logs, bar chart data, hit rates, defense context, EV, and alt lines.

### Request

```
POST /getPlayerPropChart
Content-Type: application/json

{
  "playerName": "Luka Doncic",
  "statType": "points",
  "line": 25.5
}
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `playerName` | string | Yes | Exact player name as it appears in `edge[].name` or `stack[].name` |
| `statType` | string | Yes | Internal key from `edge[].statType` (e.g. `"points"`, `"rebounds"`, `"assists"`, `"threes"`, `"steals"`, `"blocks"`, `"turnovers"`, `"pts_rebs"`, `"pts_asts"`, `"rebs_asts"`, `"pts_rebs_asts"`, `"steals_blocks"`, `"fantasy_score"`, `"double_double"`) |
| `line` | number | Yes | The prop line value |

### Response

```json
{
  "success": true,
  "source": "edge",
  "player": { ... },
  "matchup": { ... },
  "prop": { ... },
  "gameLogs": [ ... ],
  "hitRates": { ... },
  "defense": { ... },
  "ev": 12.5,
  "safeLines": [ ... ],
  "otherProps": [ ... ]
}
```

### `player`

```json
{
  "name": "Luka Doncic",
  "position": "PG",
  "team": "Dallas Mavericks",
  "teamCode": "DAL",
  "headshotUrl": "https://a.espncdn.com/..."
}
```

### `matchup`

```json
{
  "opponent": "Los Angeles Lakers",
  "opponentCode": "LAL",
  "isHome": true,
  "gameTime": "2026-02-23T00:30:00Z",
  "home": "Dallas Mavericks",
  "away": "Los Angeles Lakers"
}
```

### `prop`

```json
{
  "stat": "POINTS",
  "statType": "points",
  "line": 25.5,
  "prediction": "over",
  "oddsOver": -115,
  "oddsUnder": null,
  "bookmaker": "DK",
  "avg": 27.3,
  "trend": 2.1,
  "green": 4,
  "defRank": 22,
  "betScore": 78.5,
  "edge": null
}
```

- `oddsOver` is set when `prediction === "over"`, `oddsUnder` when `"under"`.
- `avg` = L10 average for this stat.

### `gameLogs[]` — Last N games (bar chart data)

```json
{
  "gameId": 12345,
  "date": "2026-02-19",
  "displayDate": "Feb 19",
  "opponent": "Los Angeles Lakers",
  "opponentCode": "LAL",
  "value": 31,
  "hit": true
}
```

- `hit` = whether the value cleared the line in the predicted direction.
- Ordered newest-first. Reverse for chronological bar chart display.
- `opponent` / `opponentCode` can be `null` for old games with missing data.

### `hitRates`

5 windows, all with the same shape:

```json
{
  "l5":     { "over": 4, "total": 5, "pct": 80 },
  "l10":    { "over": 7, "total": 10, "pct": 70 },
  "l20":    { "over": 14, "total": 20, "pct": 70 },
  "season": { "over": 38, "total": 55, "pct": 69.1 },
  "h2h":    { "over": 3, "total": 4, "pct": 75 }
}
```

- `over` = number of games the Over hit (regardless of prediction direction).
- `pct` = `over / total * 100`.
- `h2h` = games vs today's opponent only.

### `defense` (nullable)

```json
{
  "rank": 22,
  "totalTeams": 30,
  "label": "Weak",
  "allowed": 118.5,
  "stat": "PTS",
  "opponentCode": "LAL",
  "supports": true,
  "narrative": "Supports"
}
```

| Field | Description |
|-------|-------------|
| `rank` | 1-30 (1 = best defense, 30 = worst) |
| `label` | `"Elite"` (1-5), `"Strong"` (6-12), `"Average"` (13-18), `"Weak"` (19-25), `"Poor"` (26-30) |
| `allowed` | Avg stat allowed per game to opponents |
| `supports` | `true` if defense context agrees with the prediction direction |
| `narrative` | `"Supports"` or `"Contradicts"` |

### `ev` (nullable)

Expected Value percentage. Formula: `(p * (decimalOdds - 1) - (1 - p)) * 100` where `p` = directional L10 hit rate.

- Positive = +EV bet (good).
- Negative = -EV (bad).
- `null` = insufficient data.

### `safeLines[]` — Alt lines (from Parlay Stack)

```json
{
  "statType": "points",
  "stat": "POINTS",
  "prediction": "over",
  "altLine": 22.5,
  "altOdds": -450,
  "bookmaker": "DK",
  "l10HitPct": 90,
  "sznHitPct": 85.5,
  "l10Avg": 27.3,
  "parlayEdge": 12.4
}
```

These are validated alt lines for the same player — lower lines with heavy odds that pass all 5 safety signals.

### `otherProps[]` — Other available stats for this player

```json
{
  "statType": "rebounds",
  "stat": "REBOUNDS",
  "line": 8.5,
  "prediction": "over",
  "oddsOver": -110,
  "oddsUnder": null,
  "bookmaker": "DK",
  "l10Avg": 9.2,
  "greenScore": 3
}
```

Use these to build a stat switcher (tap to load a different stat for the same player).

---

## 3. Refresh Pipeline — `refreshProps`

Triggers a fresh pipeline run. Use sparingly — each call hits external APIs (The Odds API, API-Sports, ESPN).

### Request

```
POST /refreshProps
Content-Type: application/json

{
  "pipeline": "both"
}
```

| Param | Values | Description |
|-------|--------|-------------|
| `pipeline` | `"edge"`, `"stack"`, `"both"` | Which pipeline to refresh |

### Response

```json
{
  "success": true,
  "message": "Refreshed both pipelines",
  "edgeCount": 45,
  "stackCount": 28
}
```

After refresh, `getCheatsheetData` will return the updated data.

---

## Typical Webapp Flow

```
┌─────────────┐     GET /getCheatsheetData      ┌──────────────────┐
│             │ ──────────────────────────────► │                  │
│   React     │     { edge[], stack[] }         │  Firebase Cloud  │
│   Webapp    │ ◄────────────────────────────── │  Functions       │
│             │                                  │                  │
│  User taps  │     POST /getPlayerPropChart     │  (reads from     │
│  a player   │ ──────────────────────────────► │   Firestore      │
│             │     { gameLogs, hitRates, ... }  │   cache)         │
│             │ ◄────────────────────────────── │                  │
└─────────────┘                                  └──────────────────┘
```

1. **On page load**: `GET /getCheatsheetData` → populate EdgeBoard table + Parlay Stack table
2. **User clicks a player**: `POST /getPlayerPropChart` with `{ playerName, statType, line }` → render chart page
3. **Manual refresh** (admin only): `POST /refreshProps` → re-run pipeline

---

## Team Logos

ESPN team logos follow this URL pattern:
```
https://a.espncdn.com/i/teamlogos/nba/500/{abbrev}.png
```

Abbreviation mapping:
```
ATL, BOS, BKN, CHA, CHI, CLE, DAL, DEN, DET, GSW,
HOU, IND, LAC, LAL, MEM, MIA, MIL, MIN, NOP, NYK,
OKC, ORL, PHI, PHX, POR, SAC, SAS, TOR, UTA, WAS
```

---

## Bookmaker Codes

| Code | Name |
|------|------|
| `DK` | DraftKings |
| `FD` | FanDuel |
| `MGM` | BetMGM |
| `CAESARS` | Caesars |
| `ESPN` | ESPNBet |
| `BET365` | Bet365 |
| `BOV` | Bovada |
| `BR` | BetRivers |
| `UNI` | Unibet |
| `HR` | Hard Rock |
| `FAN` | Fanatics |
| `BALLY` | BallyBet |

---

## Team Color Map

For team-colored gradients on player cards:

```js
const TEAM_COLORS = {
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#000000', CHA: '#1D1160',
  CHI: '#CE1141', CLE: '#860038', DAL: '#00538C', DEN: '#0E2240',
  DET: '#C8102E', GSW: '#1D428A', HOU: '#CE1141', IND: '#002D62',
  LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9', MIA: '#98002E',
  MIL: '#00471B', MIN: '#0C2340', NOP: '#0C2340', NYK: '#006BB6',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#1D1160',
  POR: '#E03A3E', SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141',
  UTA: '#002B5C', WAS: '#002B5C',
};
```

---

## Stat Type Reference

| `statType` | Display Name |
|-----------|-------------|
| `points` | POINTS |
| `rebounds` | REBOUNDS |
| `assists` | ASSISTS |
| `threes` | 3-POINTERS |
| `steals` | STEALS |
| `blocks` | BLOCKS |
| `turnovers` | TURNOVERS |
| `pts_rebs` | PTS + REB |
| `pts_asts` | PTS + AST |
| `rebs_asts` | REB + AST |
| `pts_rebs_asts` | PTS + REB + AST |
| `steals_blocks` | STL + BLK |
| `fantasy_score` | FANTASY |
| `double_double` | DOUBLE-DOUBLE |

---

## 5. Design Reference — Cheatsheet Grid (EdgeBoard / Parlay Stack)

The cheatsheet is a single-image grid showing all today's props. Two modes share the same layout engine.

### Layout Structure

```
┌─────────────────────────────────────────────────┐
│  HEADER BAR                                      │
│  [App Logo]  "TODAY'S TOP PICKS"  [Date badge]   │
├─────────────────────────────────────────────────┤
│  COLUMN HEADERS (grid row)                       │
│  PLAYER | PICK | AVG | ODDS | L10 | SZN | ...   │
├─────────────────────────────────────────────────┤
│  ROW 1  [headshot] Name · Line · Stats ...       │
│  ROW 2  ...                                      │
│  ROW 3  ...                                      │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

### Three Format Presets

| Format | Dimensions | Max Rows | Use Case |
|--------|-----------|----------|----------|
| IG Square | 1080 x 1080 | 5 | Instagram posts |
| TikTok | 1080 x 1920 | 10 | TikTok / IG Stories |
| Twitter/X | 1600 x 900 | 6 | Twitter posts |

IG & TikTok use a **compact 6-column** layout. X uses a **full 8-column** layout.

### Column Grids

**EdgeBoard (compact — IG/TikTok):**
```
PLAYER | PICK | ODDS | L10 | SZN | OPP DEF
  3fr     2fr   1.3fr  1.3fr 1.3fr  1.5fr
```

**EdgeBoard (full — X/Twitter):**
```
PLAYER | PICK | L10 AVG | ODDS | L10 | SZN | FORM | OPP DEF
  3fr     2fr    1.2fr    1.2fr  1.2fr 1.2fr  1.2fr   1.5fr
```

**Parlay Stack** uses the same column grid but replaces `PICK` with `ALT LINE` and shows the bookmaker logo + odds in the ODDS column.

### Row Anatomy

Each row is a CSS grid row with these cells:

```
┌──────────────────┬─────────┬──────┬──────┬──────┬──────┬──────┬─────────┐
│ [Team gradient]  │ ▲ 25.5  │ 27.3 │ -110 │ 70%  │ 69%  │ +2.1 │ 22/30   │
│ [Headshot] Name  │ POINTS  │      │ [DK] │      │      │ L3v10│ [Logo]  │
└──────────────────┴─────────┴──────┴──────┴──────┴──────┴──────┴─────────┘
```

**Player cell details:**
- Background: linear gradient using team color → `${teamColor}50` to `${teamColor}20` to transparent
- Team logo watermark: 2x headshot size, centered behind avatar, very low opacity
- Headshot: circular, 62-90% of row height (capped at format's `avatarMax`)
- Name: first name small above, last name bold below

**Data cell color coding:**

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| L10/SZN (Over) | >= 60% | 45-59% | < 45% |
| L10/SZN (Under) | <= 40% | 41-55% | > 55% |
| DEF Rank (Over) | >= 21 (weak D) | 11-20 | <= 10 (strong D) |
| DEF Rank (Under) | <= 10 (strong D) | 11-20 | >= 21 (weak D) |

**5-star highlight:** When `green === 5`, the row gets a subtle green glow border and the accent color switches from team color to `rgba(34,197,94,0.7)`.

### Pagination

Props overflow into pages (variants). UI shows `◀ 1/N ▶` controls. Each page is a separate image.

### Bookmaker Filter (Parlay Stack only)

Stack mode shows a row of bookmaker buttons (DK, FD, MGM, etc.) derived from `[...new Set(stack.map(p => p.bk))]`. Selecting one filters the grid to that book's legs only.

### Mode Toggle

Two buttons: **EdgeBoard** (standard lines, ML-ranked) and **Parlay Stack** (alt lines, edge-ranked).

### Sorting

- **EdgeBoard**: pre-sorted by `betScore` desc from the API (ML confidence ranking).
- **Parlay Stack**: pre-sorted by `edge` desc from the API (parlay edge = L10 hit rate - implied prob).

Within each mode, the leaderboard ranking is the row order.

---

## 6. Design Reference — Player Prop Chart

The player chart is a deep-dive screen for a single player+stat. Accessed by tapping a row from the grid leaderboard.

### Design Tokens

```
Background:      #0D0F14  (dark blue-black)
Card surface:    rgba(22, 26, 34, 0.8)  (glass card)
Card border:     rgba(255, 255, 255, 0.06)
Primary cyan:    #00D7D7
Success green:   #22C55E
Error red:       #EF4444 / #FF6B6B
Muted text:      #7A8BA3
Foreground:      #F5F8FC

Font family:     Aeonik (Regular, Medium, Bold, Black)
Border radius:   8-16px (sm=8, md=10, lg=12, xl=16)
Spacing scale:   4, 8, 12, 16, 20, 24, 32, 40, 48
```

### Full Screen Layout (top to bottom)

```
┌─────────────────────────────────────┐
│  TOP BAR  (← back)   [App Logo]    │
├─────────────────────────────────────┤
│                                     │
│  ┌─ PLAYER HEADER CARD ──────────┐  │
│  │  [Team gradient bg]           │  │
│  │  [Watermark logo, 6% opacity] │  │
│  │                               │  │
│  │  [72px headshot]  Name · PG   │  │
│  │  [26px team logo    OVER      │  │
│  │   badge overlay]  PTS O 25.5  │  │
│  │                   DAL @ LAL   │  │
│  │  ─────────────────────────────│  │
│  │  [DK logo] Line: 25.5        │  │
│  │            O -115  U +105     │  │
│  │                   [AVG] [EV]  │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ BAR CHART ───────────────────┐  │
│  │  Y-axis │ ██ ██ ██ ▐▌ ██ ░░  │  │
│  │  labels │ bars (green/red)    │  │
│  │         │ ---- dashed line -- │  │
│  │  ───────┼─────────────────────│  │
│  │         │ [logos] + dates     │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐         │
│  │SZN│ │H2H│ │L5 │ │L10│ │L20│     │
│  │38 │ │3/4│ │4/5│ │7/ │ │14/│     │
│  │/55│ │75%│ │80%│ │10 │ │20 │     │
│  │69%│ │   │ │   │ │70%│ │70%│     │
│  └──┘ └──┘ └──┘ └──┘ └──┘         │
│                                     │
│  ┌─ DEFENSE MATCHUP ─────────────┐  │
│  │  🛡 DEFENSE MATCHUP           │  │
│  │  [LAL logo] vs LAL            │  │
│  │  [DEF #22/30]  Weak           │  │
│  │  Allows 118.5 PTS/G           │  │
│  │  [✓ Supports Over]            │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ ALT LINES ──────────────────┐  │
│  │  🛡✓ ALT LINES               │  │
│  │  PTS  O 22.5  [90% L10]  DK  │  │
│  │  PTS  O 20.5  [100% L10] FD  │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

### Section 1: Player Header Card

```
Container:
  border-radius: 16px
  background: rgba(22, 26, 34, 0.8)
  border: 1px solid rgba(0, 215, 215, 0.15)
  padding: 16px
  box-shadow: 0 8px 24px rgba(0, 215, 215, 0.15)

Team gradient overlay (absolute fill):
  linear-gradient(to bottom-right,
    ${teamColor}40,    ← 25% opacity team color
    ${teamColor}18,    ← 9% opacity
    transparent
  )

Team logo watermark (absolute, right-aligned):
  150x150px, 6% opacity, vertically centered, right: -20px
```

**Header content row** (flex row, centered, gap 12px):

| Element | Spec |
|---------|------|
| Headshot | 72x72, border-radius 50%, 2px border in `${teamColor}66` |
| Team logo badge | 26x26 circle, positioned bottom-right of headshot, bg `#161A22` |
| Player name | 20px bold, `#F5F8FC` |
| Position | 14px medium, `#7A8BA3`, same baseline as name |
| Direction badge | Pill: `OVER` (green bg 15%) or `UNDER` (red bg 15%), 11px bold, 0.8 letter-spacing |
| Stat line | 16px bold, e.g. `PTS O 25.5` — tappable chevron if `otherProps` exist |
| Matchup text | 12px regular, muted, e.g. `DAL @ LAL · Feb 23, 7:30 PM` |

**Odds row** (below content, separated by 1px border-top):

| Element | Spec |
|---------|------|
| Bookmaker logo | 32x32, border-radius 8px |
| Line label | 12px bold, `Line: 25.5` |
| Over odds | 14px bold, green (`#22C55E`) |
| Under odds | 14px bold, red (`#FF6B6B`) |
| AVG badge | Cyan bg 8%, cyan border 15%, label "AVG" 9px muted, value 16px bold cyan |
| EV badge | Green/red bg 8%, border 30%, label "EV" 9px muted, value 16px bold `+12.5%` |

### Section 2: Bar Chart

Uses `gameLogs[]` from the API. Key algorithm:

```
Y-axis scale (computeYScale):
  ceiling = max(maxValue, line) + 1
  step = auto (1/2/3/5/10/20 depending on range)
  yMax = ceil(ceiling / step) * step
  ticks = [0, step, 2*step, ..., yMax]

Bar sizing:
  totalBars = games + (hasUpcoming ? 1 : 0)
  barWidth = min(
    (chartWidth - gap*(totalBars+1)) / totalBars,
    totalBars <= 6 ? 56 : totalBars <= 10 ? 44 : 36
  )
```

| Element | Spec |
|---------|------|
| Chart height | 300px |
| Bar colors | Hit (value > line for Over): `#22C55E`, Miss: `#EF4444` |
| Bar opacity | 0.88 |
| Bar radius | 4px top corners |
| Reference line | Dashed cyan line at `prop.line` value, `rgba(0, 215, 215, 0.5)`, stroke 1.5, dash `6,4` |
| Line label | Right-aligned, cyan bold, e.g. `25.0` |
| Value labels | Above each bar, 11px bold white |
| Grid lines | Horizontal at each Y tick, `rgba(122, 139, 163, 0.12)` |
| Y-axis labels | Left, 10px medium, muted |
| X-axis | Team logos (circular) + date labels below each bar |
| Upcoming game bar | Dashed cyan outline, 8% fill, `?` label, projected height = avg of previous games |

**Window selector** — tapping L5/L10/L20 hit rate cards filters the chart to show that many games. H2H filters to opponent-only games. Season shows all.

### Section 3: Hit Rate Cards

5 equal-width cards in a row, glass background:

```
Container:  flex row, gap 8px
Each card:
  border-radius: 12px
  background: rgba(22, 26, 34, 0.8)
  border: 1px solid rgba(255, 255, 255, 0.06)
  padding: 12px vertical, 4px horizontal
  text-align: center

  Selected state: border rgba(0, 215, 215, 0.4), cyan shadow glow

Content (stacked center):
  Label:     11px bold, white (cyan when selected)
  Fraction:  18px bold, color-coded (green ≥60%, red <40%, white otherwise)
  Pct:       12px medium, same color as fraction
```

| Card | Data |
|------|------|
| Season | `hitRates.season` — all games this year |
| H2H | `hitRates.h2h` — games vs today's opponent only |
| L5 | `hitRates.l5` — last 5 games |
| L10 | `hitRates.l10` — last 10 games (default selected) |
| L20 | `hitRates.l20` — last 20 games |

Only L5, L10, L20 are tappable (they control the bar chart window).

### Section 4: Defense Matchup

Only shown when `defense` is not null.

```
Section header: shield icon (cyan) + "DEFENSE MATCHUP" (11px bold cyan, 1.2 letter-spacing)

Card:
  background: rgba(22, 26, 34, 0.8)
  border: 1px solid rgba(255, 255, 255, 0.06)
  border-radius: 12px
  padding: 12px
  gap: 8px

Row 1 (flex row):
  [24px opponent logo]
  "vs LAL" (14px bold white)
  [DEF #22/30 badge] — colored pill:
    rank ≤ 10 → green bg 12%
    rank ≥ 21 → red bg 12%
    else → cyan bg 8%
  "Weak" (12px semibold, color matches rank range)

Row 2:
  "Allows 118.5 PTS/G to opponents" (12px medium, muted)

Row 3 (narrative tag):
  [checkmark or warning icon]
  "Supports Over" or "Contradicts Under"
  supports → green bg 12%, green text
  contradicts → orange bg 12%, orange text (#FFA500)
```

### Section 5: Alt Lines (Safe Lines)

Only shown when `safeLines[]` is not empty.

```
Section header: shield-checkmark icon (green) + "ALT LINES" + "Alternative lines" (right-aligned muted)

Each row:
  background: rgba(34, 197, 94, 0.04)
  border: 1px solid rgba(34, 197, 94, 0.12)
  border-radius: 10px
  padding: 12px
  margin-bottom: 8px
  flex row layout

Left:    stat short (14px bold) + "O 22.5" (13px, green/red)
Center:  [90% L10 badge] (green bg 15%, bold green) + "Avg 27.3" (12px muted)
Right:   [bookmaker logo 22px] + odds (12px bold muted, e.g. "-450")
```

### Leaderboard Integration

When the webapp loads `getCheatsheetData`, build a ranked dropdown for the player chart:

```js
// Sort edge props by ML confidence (betScore desc)
const ranked = edge.sort((a, b) =>
  (b.betScore || 0) - (a.betScore || 0) ||
  (b.green || 0) - (a.green || 0) ||
  (b.edge || 0) - (a.edge || 0)
);

// Each entry in the leaderboard:
ranked.forEach((p, i) => {
  console.log(`#${i+1} ${p.name} — ${p.stat} ${p.dir === 'over' ? 'O' : 'U'} ${p.line} (${p.green}/5 · ${p.betScore}%)`);
});

// When user selects a player, load their chart:
const pick = ranked[selectedIndex];
const chart = await fetch(`${API}/getPlayerPropChart`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playerName: pick.name,
    statType: pick.statType,
    line: pick.line,
  })
}).then(r => r.json());
```
