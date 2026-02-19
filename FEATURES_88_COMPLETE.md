# NBA Props CatBoost Model — Complete 88-Feature Specification

> **Purpose**: This document provides the exact computation for every one of the 88 features
> used by the deployed CatBoost model, so that the cloud function can reproduce them identically.
>
> All formulas have been **verified against real test instances** (LeBron points, Giannis rebounds,
> Trae Young assists, Luka points_rebounds combo) and match to within ±0.01.

---

## Architecture: 44 Raw + 44 Derived = 88

The 88 features split into two halves:

| Group | Count | What they are | Where they come from |
|-------|-------|---------------|----------------------|
| **Raw inputs** | 44 | Data you fetch/extract from APIs | Odds API, NBA API game logs, game schedule |
| **Derived features** | 44 | Computed from the raw inputs | Your cloud function computes these |

At inference time, your cloud function must:
1. **Load** the model pickle — it contains 2 things you can't get from this doc alone
2. **Fetch** the 44 raw inputs from external sources
3. **Compute** the 44 derived features using the formulas in this doc
4. **Encode** the 5 categoricals to integers
5. **Reorder** columns to match `model_data['feature_names']`
6. **Predict**

### What's in the pickle file (and ONLY in the pickle file)

The `.pkl` model file contains everything this doc cannot:

```python
with open('model.pkl', 'rb') as f:
    model_data = pickle.load(f)

# 1. The model itself
model = model_data['model']

# 2. The exact feature order (list of 88 strings)
feature_names = model_data['feature_names']
# → ['prop_type', 'home_team', 'away_team', 'bookmaker', 'SEASON', 'year', ...]

# 3. The categorical string→int mappings (built at training time)
categorical_mappings = model_data['categorical_mappings']
# → {'prop_type': {'points': 0, 'rebounds': 1, 'assists': 2, ...},
#    'bookmaker': {'draftkings': 0, 'fanduel': 1, ...},
#    'home_team': {'Atlanta Hawks': 0, 'Boston Celtics': 1, ...},
#    'away_team': {'Atlanta Hawks': 0, 'Boston Celtics': 1, ...},
#    'SEASON': {'2023-24': 0, '2024-25': 1, '2025-26': 2, ...}}
```

> **Without the pickle file, you cannot encode categoricals or order features correctly.**
> This doc gives you every formula and every gotcha, but the integer mappings and
> column order are generated at training time and stored only in the pickle.
> Your cloud function MUST load the pickle to get them.

---

## Table of Contents

1. [Feature List (Exact Order)](#1-feature-list-exact-order)
2. [The 44 Raw Input Features](#2-the-44-raw-input-features)
3. [Categorical Features (5)](#3-categorical-features-5)
4. [Temporal Features (3)](#4-temporal-features-3)
5. [L3 Rolling Stats (12)](#5-l3-rolling-stats-12)
6. [L10 Rolling Stats + Std Dev (15)](#6-l10-rolling-stats--std-dev-15)
7. [Game Context (5)](#7-game-context-5)
8. [The 44 Derived Features](#8-the-44-derived-features)
9. [Advanced Performance (12)](#9-advanced-performance-12)
10. [Interaction Features (6)](#10-interaction-features-6)
11. [Composite & Ratio Features (10)](#11-composite--ratio-features-10)
12. [Betting Line Features (20)](#12-betting-line-features-20)
13. [Prop-Type-Dependent Logic](#13-prop-type-dependent-logic)
14. [Categorical Encoding](#14-categorical-encoding)
15. [Data Sources](#15-data-sources)
16. [FG_PCT Format Warning](#16-fg_pct-format-warning)
17. [Inference Code Reference](#17-inference-code-reference)
18. [CatBoost Training Configuration](#18-catboost-training-configuration)
19. [Categorical Mappings — Exact Structure](#19-categorical-mappings--exact-structure)
20. [Probability Output & Calibration](#20-probability-output--calibration)

---

## 1. Feature List (Exact Order)

The model stores its feature names in `model_data['feature_names']` inside the pickle file.
The cloud function **must** select columns in this exact order via `df[feature_names]`.

Below is the canonical list of 88 features (as used in the deployed model):

| #  | Feature Name             | Category         | Type        |
|----|--------------------------|------------------|-------------|
| 1  | `prop_type`              | Categorical      | int (encoded) |
| 2  | `home_team`              | Categorical      | int (encoded) |
| 3  | `away_team`              | Categorical      | int (encoded) |
| 4  | `bookmaker`              | Categorical      | int (encoded) |
| 5  | `SEASON`                 | Categorical      | int (encoded) |
| 6  | `year`                   | Temporal         | int         |
| 7  | `month`                  | Temporal         | int         |
| 8  | `day_of_week`            | Temporal         | int         |
| 9  | `L3_PTS`                 | L3 Rolling       | float       |
| 10 | `L3_REB`                 | L3 Rolling       | float       |
| 11 | `L3_AST`                 | L3 Rolling       | float       |
| 12 | `L3_MIN`                 | L3 Rolling       | float       |
| 13 | `L3_FG_PCT`              | L3 Rolling       | float (0–1) |
| 14 | `L3_FG3M`                | L3 Rolling       | float       |
| 15 | `L3_FG3_PCT`             | L3 Rolling       | float (0–1) |
| 16 | `L3_STL`                 | L3 Rolling       | float       |
| 17 | `L3_BLK`                 | L3 Rolling       | float       |
| 18 | `L3_TOV`                 | L3 Rolling       | float       |
| 19 | `L3_FGM`                 | L3 Rolling       | float       |
| 20 | `L3_FGA`                 | L3 Rolling       | float       |
| 21 | `L10_PTS`                | L10 Rolling      | float       |
| 22 | `L10_REB`                | L10 Rolling      | float       |
| 23 | `L10_AST`                | L10 Rolling      | float       |
| 24 | `L10_MIN`                | L10 Rolling      | float       |
| 25 | `L10_FG_PCT`             | L10 Rolling      | float (0–1) |
| 26 | `L10_FG3M`               | L10 Rolling      | float       |
| 27 | `L10_FG3_PCT`            | L10 Rolling      | float (0–1) |
| 28 | `L10_STL`                | L10 Rolling      | float       |
| 29 | `L10_BLK`                | L10 Rolling      | float       |
| 30 | `L10_TOV`                | L10 Rolling      | float       |
| 31 | `L10_FGM`                | L10 Rolling      | float       |
| 32 | `L10_FGA`                | L10 Rolling      | float       |
| 33 | `L10_PTS_STD`            | L10 Std Dev      | float       |
| 34 | `L10_REB_STD`            | L10 Std Dev      | float       |
| 35 | `L10_AST_STD`            | L10 Std Dev      | float       |
| 36 | `HOME_AWAY`              | Game Context     | int (0/1)   |
| 37 | `DAYS_REST`              | Game Context     | int         |
| 38 | `BACK_TO_BACK`           | Game Context     | int (0/1)   |
| 39 | `GAMES_IN_LAST_7`        | Game Context     | int         |
| 40 | `MINUTES_TREND`          | Game Context     | float       |
| 41 | `SCORING_EFFICIENCY`     | Advanced         | float       |
| 42 | `ASSIST_TO_RATIO`        | Advanced         | float       |
| 43 | `REBOUND_RATE`           | Advanced         | float       |
| 44 | `USAGE_RATE`             | Advanced         | float       |
| 45 | `TREND_PTS`              | Advanced         | float       |
| 46 | `TREND_REB`              | Advanced         | float       |
| 47 | `TREND_AST`              | Advanced         | float       |
| 48 | `CONSISTENCY_PTS`        | Advanced         | float       |
| 49 | `CONSISTENCY_REB`        | Advanced         | float       |
| 50 | `CONSISTENCY_AST`        | Advanced         | float       |
| 51 | `ACCELERATION_PTS`       | Advanced         | float       |
| 52 | `EFFICIENCY_STABLE`      | Advanced         | int (0/1)   |
| 53 | `L3_PTS_x_HOME`          | Interaction      | float       |
| 54 | `L3_REB_x_HOME`          | Interaction      | float       |
| 55 | `L3_AST_x_HOME`          | Interaction      | float       |
| 56 | `L3_MIN_x_B2B`           | Interaction      | float       |
| 57 | `L3_PTS_x_REST`          | Interaction      | float       |
| 58 | `USAGE_x_EFFICIENCY`     | Interaction      | float       |
| 59 | `LOAD_INTENSITY`         | Composite        | float       |
| 60 | `SHOOTING_VOLUME`        | Composite        | float       |
| 61 | `REBOUND_INTENSITY`      | Composite        | float       |
| 62 | `PLAYMAKING_EFFICIENCY`  | Composite        | float       |
| 63 | `THREE_POINT_THREAT`     | Composite        | float       |
| 64 | `DEFENSIVE_IMPACT`       | Composite        | float       |
| 65 | `PTS_VOLATILITY`         | Ratio            | float       |
| 66 | `MINUTES_STABILITY`      | Ratio            | float       |
| 67 | `L3_vs_L10_PTS_RATIO`    | Ratio            | float       |
| 68 | `L3_vs_L10_REB_RATIO`    | Ratio            | float       |
| 69 | `line`                   | Betting Raw      | float       |
| 70 | `odds_over`              | Betting Raw      | int         |
| 71 | `odds_under`             | Betting Raw      | int         |
| 72 | `implied_prob_over`      | Betting Raw      | float (0–1) |
| 73 | `implied_prob_under`     | Betting Raw      | float (0–1) |
| 74 | `LINE_VALUE`             | Betting Derived  | float       |
| 75 | `ODDS_EDGE`              | Betting Derived  | float       |
| 76 | `odds_spread`            | Betting Derived  | int         |
| 77 | `market_confidence`      | Betting Derived  | float       |
| 78 | `L3_PTS_vs_LINE`         | Line Comparison  | float       |
| 79 | `L3_REB_vs_LINE`         | Line Comparison  | float       |
| 80 | `L3_AST_vs_LINE`         | Line Comparison  | float       |
| 81 | `LINE_DIFFICULTY_PTS`    | Line Difficulty  | float       |
| 82 | `LINE_DIFFICULTY_REB`    | Line Difficulty  | float       |
| 83 | `LINE_DIFFICULTY_AST`    | Line Difficulty  | float       |
| 84 | `IMPLIED_PROB_OVER`      | Betting Derived  | float (0–1) |
| 85 | `LINE_vs_AVG_PTS`        | Line vs Avg      | float       |
| 86 | `LINE_vs_AVG_REB`        | Line vs Avg      | float       |
| 87 | `L3_vs_market`           | Market           | float       |
| 88 | `L10_vs_market`          | Market           | float       |

> **IMPORTANT**: The authoritative order comes from `model_data['feature_names']` inside the
> pickle file. Always use `df[feature_names]` to reorder columns before prediction.

---

## 2. The 44 Raw Input Features

These are the features your cloud function must **fetch or extract** before computing anything.
They come from 3 sources: the Odds API, the NBA API game logs, and the game schedule/calendar.

### From The Odds API (8 features)

You get these directly from the prop market data for the bet being analyzed.

| #  | Feature              | Odds API field                                         | Example         |
|----|----------------------|--------------------------------------------------------|-----------------|
| 1  | `prop_type`          | Market key: `player_points` → `"points"`              | `"points"`      |
| 4  | `bookmaker`          | `bookmakers[].key`                                     | `"draftkings"`  |
| 69 | `line`               | `outcomes[].point` (the prop line)                     | `28.5`          |
| 70 | `odds_over`          | `outcomes[name="Over"].price` (American odds)          | `-115`          |
| 71 | `odds_under`         | `outcomes[name="Under"].price` (American odds)         | `-105`          |
| 72 | `implied_prob_over`  | **Computed** from `odds_over` (see formula below)      | `0.535`         |
| 73 | `implied_prob_under` | **Computed** from `odds_under` (see formula below)     | `0.512`         |

Plus from the event-level data:

| #  | Feature      | Odds API field       | Example                    |
|----|--------------|----------------------|----------------------------|
| 2  | `home_team`  | `home_team` on event | `"Los Angeles Lakers"`     |
| 3  | `away_team`  | `away_team` on event | `"Golden State Warriors"`  |

**Implied probability conversion:**
```python
def american_to_implied_prob(odds):
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)   # -115 → 0.535
    else:
        return 100 / (odds + 100)               # +100 → 0.500
```

### From the Game Schedule / Calendar (7 features)

Extracted from the game date and the player's recent schedule.

| #  | Feature           | How to get it                                                                 | Example |
|----|-------------------|-------------------------------------------------------------------------------|---------|
| 5  | `SEASON`          | From game date: if month >= 10 → `"{year}-{year+1}"`, else `"{year-1}-{year}"` | `"2025-26"` |
| 6  | `year`            | `game_date.year`                                                              | `2026`  |
| 7  | `month`           | `game_date.month`                                                             | `2`     |
| 8  | `day_of_week`     | `game_date.weekday()` (Monday=0 ... Sunday=6)                                 | `4`     |
| 36 | `HOME_AWAY`       | `1` if player's team is home, `0` if away. Parse from MATCHUP: `vs.`=home, `@`=away | `1` |
| 37 | `DAYS_REST`       | Calendar days since player's **previous game**. Default `3` if first/unknown  | `2`     |
| 38 | `BACK_TO_BACK`    | `1 if DAYS_REST == 1 else 0`                                                 | `0`     |
| 39 | `GAMES_IN_LAST_7` | Count of player's games in the 7 days **before** this game (exclusive)        | `3`     |

**SEASON derivation:**
```python
def get_season(game_date):
    if game_date.month >= 10:  # Oct-Dec = start of new season
        return f"{game_date.year}-{str(game_date.year + 1)[-2:]}"
    else:  # Jan-Sep = second half of season
        return f"{game_date.year - 1}-{str(game_date.year)[-2:]}"
# Feb 2026 → "2025-26"
```

### From NBA API Game Logs (29 features)

These are **rolling averages** computed from the player's recent game log history.
At inference, fetch the player's last 10 completed games from the NBA API
(`PlayerGameLog` endpoint) and compute the averages yourself.

**L3 = mean of the last 3 completed games (12 features):**

| #  | Feature       | NBA API column | How to compute at inference                          |
|----|---------------|----------------|------------------------------------------------------|
| 9  | `L3_PTS`      | `PTS`          | `mean(last_3_games['PTS'])`                          |
| 10 | `L3_REB`      | `REB`          | `mean(last_3_games['REB'])`                          |
| 11 | `L3_AST`      | `AST`          | `mean(last_3_games['AST'])`                          |
| 12 | `L3_MIN`      | `MIN`          | `mean(last_3_games['MIN'])`                          |
| 13 | `L3_FG_PCT`   | `FG_PCT`       | `mean(last_3_games['FG_PCT'])` **(decimal 0–1!)**    |
| 14 | `L3_FG3M`     | `FG3M`         | `mean(last_3_games['FG3M'])`                         |
| 15 | `L3_FG3_PCT`  | `FG3_PCT`      | `mean(last_3_games['FG3_PCT'])` **(decimal 0–1!)**   |
| 16 | `L3_STL`      | `STL`          | `mean(last_3_games['STL'])`                          |
| 17 | `L3_BLK`      | `BLK`          | `mean(last_3_games['BLK'])`                          |
| 18 | `L3_TOV`      | `TOV`          | `mean(last_3_games['TOV'])`                          |
| 19 | `L3_FGM`      | `FGM`          | `mean(last_3_games['FGM'])`                          |
| 20 | `L3_FGA`      | `FGA`          | `mean(last_3_games['FGA'])`                          |

**L10 = mean of the last 10 completed games (12 features):**

| #  | Feature        | How to compute at inference                          |
|----|----------------|------------------------------------------------------|
| 21 | `L10_PTS`      | `mean(last_10_games['PTS'])`                         |
| 22 | `L10_REB`      | `mean(last_10_games['REB'])`                         |
| 23 | `L10_AST`      | `mean(last_10_games['AST'])`                         |
| 24 | `L10_MIN`      | `mean(last_10_games['MIN'])`                         |
| 25 | `L10_FG_PCT`   | `mean(last_10_games['FG_PCT'])` **(decimal 0–1!)**   |
| 26 | `L10_FG3M`     | `mean(last_10_games['FG3M'])`                        |
| 27 | `L10_FG3_PCT`  | `mean(last_10_games['FG3_PCT'])` **(decimal 0–1!)**  |
| 28 | `L10_STL`      | `mean(last_10_games['STL'])`                         |
| 29 | `L10_BLK`      | `mean(last_10_games['BLK'])`                         |
| 30 | `L10_TOV`      | `mean(last_10_games['TOV'])`                         |
| 31 | `L10_FGM`      | `mean(last_10_games['FGM'])`                         |
| 32 | `L10_FGA`      | `mean(last_10_games['FGA'])`                         |

**L10 standard deviations (3 features):**

| #  | Feature        | How to compute at inference                              |
|----|----------------|----------------------------------------------------------|
| 33 | `L10_PTS_STD`  | `std(last_10_games['PTS'])` (sample std, ddof=1)         |
| 34 | `L10_REB_STD`  | `std(last_10_games['REB'])`                              |
| 35 | `L10_AST_STD`  | `std(last_10_games['AST'])`                              |

> **At inference you DON'T need shift(1)** — that was a training-time safeguard to exclude
> the current game. At inference, you're computing stats from already-completed games
> before today's game, so there's nothing to shift.

**Example: fetching game logs at inference:**
```python
from nba_api.stats.endpoints import playergamelog

log = playergamelog.PlayerGameLog(
    player_id=2544,  # LeBron
    season='2025-26',
    season_type_all_star='Regular Season'
).get_data_frames()[0]

log = log.sort_values('GAME_DATE', ascending=False)
last_3  = log.head(3)
last_10 = log.head(10)

L3_PTS      = last_3['PTS'].mean()       # 31.3
L10_PTS     = last_10['PTS'].mean()      # 27.4
L10_PTS_STD = last_10['PTS'].std()       # 4.8

# FG_PCT from NBA API is already decimal (0.545, not 54.5)
L3_FG_PCT   = last_3['FG_PCT'].mean()   # 0.545
```

### Summary: 44 Raw Features Checklist

```
FROM ODDS API (8):
  ✅ prop_type, bookmaker, home_team, away_team
  ✅ line, odds_over, odds_under
  ✅ implied_prob_over, implied_prob_under (computed from odds)

FROM CALENDAR (7):
  ✅ SEASON, year, month, day_of_week
  ✅ HOME_AWAY, DAYS_REST, BACK_TO_BACK, GAMES_IN_LAST_7

FROM NBA API GAME LOGS (29):
  ✅ L3_PTS, L3_REB, L3_AST, L3_MIN, L3_FG_PCT, L3_FG3M,
     L3_FG3_PCT, L3_STL, L3_BLK, L3_TOV, L3_FGM, L3_FGA     (12)
  ✅ L10_PTS, L10_REB, L10_AST, L10_MIN, L10_FG_PCT, L10_FG3M,
     L10_FG3_PCT, L10_STL, L10_BLK, L10_TOV, L10_FGM, L10_FGA (12)
  ✅ L10_PTS_STD, L10_REB_STD, L10_AST_STD                     (3)
                                                         TOTAL: 44
```

Once you have these 44, the `compute_derived_features()` function in
[Section 17](#17-inference-code-reference) produces the other 44.

---

## 3. Categorical Features (5)

These are string values that get **integer-encoded** before being passed to the model.

### `prop_type`

The type of player prop bet. Values the model was trained on:

| Value                      | Description                        |
|----------------------------|------------------------------------|
| `points`                   | Player total points                |
| `rebounds`                 | Player total rebounds              |
| `assists`                  | Player total assists               |
| `threes`                   | Player 3-pointers made             |
| `blocks`                   | Player blocks                      |
| `steals`                   | Player steals                      |
| `turnovers`                | Player turnovers                   |
| `points_rebounds`          | Points + rebounds combo            |
| `points_assists`           | Points + assists combo             |
| `rebounds_assists`         | Rebounds + assists combo           |
| `points_rebounds_assists`  | PRA combo                          |
| `blocks_steals`            | Blocks + steals combo              |

> **NOT** `threePointersMade`. The model uses `threes`.

### `bookmaker`

Bookmaker keys as lowercase slugs. The predictor normalizes variations.

| Value stored in model | Known input aliases                        |
|-----------------------|--------------------------------------------|
| `draftkings`          | DraftKings, DRAFTKINGS                     |
| `fanduel`             | FanDuel, FANDUEL                           |
| `betmgm`              | BetMGM, mgm, bet_mgm                      |
| `betrivers`           | BetRivers                                  |
| `bovada`              | Bovada                                     |
| `betonlineag`         | BetOnline, betonline.ag                    |
| `mybookieag`          | MyBookie                                   |
| `williamhill_us`      | WilliamHill, william_hill                  |
| `barstool`            | Barstool                                   |
| `fanatics`            | Fanatics                                   |

### `home_team` / `away_team`

Full team names (not abbreviations). The predictor converts 3-letter codes.

| Code | Full Name                   | Code | Full Name                   |
|------|-----------------------------|------|-----------------------------|
| ATL  | Atlanta Hawks               | MEM  | Memphis Grizzlies           |
| BOS  | Boston Celtics              | MIA  | Miami Heat                  |
| BKN  | Brooklyn Nets               | MIL  | Milwaukee Bucks             |
| CHA  | Charlotte Hornets           | MIN  | Minnesota Timberwolves      |
| CHI  | Chicago Bulls               | NOP  | New Orleans Pelicans        |
| CLE  | Cleveland Cavaliers         | NYK  | New York Knicks             |
| DAL  | Dallas Mavericks            | OKC  | Oklahoma City Thunder       |
| DEN  | Denver Nuggets              | ORL  | Orlando Magic               |
| DET  | Detroit Pistons             | PHI  | Philadelphia 76ers          |
| GSW  | Golden State Warriors       | PHX  | Phoenix Suns                |
| HOU  | Houston Rockets             | POR  | Portland Trail Blazers      |
| IND  | Indiana Pacers              | SAC  | Sacramento Kings            |
| LAC  | Los Angeles Clippers        | SAS  | San Antonio Spurs           |
| LAL  | Los Angeles Lakers          | TOR  | Toronto Raptors             |
|      |                             | UTA  | Utah Jazz                   |
|      |                             | WAS  | Washington Wizards          |

> The model was trained with full names. If you send 3-letter codes, the predictor
> (`predictor.py`) converts them via `TEAM_CODE_TO_NAME`. If building a new cloud function,
> you must do the same conversion before encoding.

### `SEASON`

NBA season string. Example: `"2025-26"`, `"2024-25"`.

---

## 4. Temporal Features (3)

Derived from the game date.

| # | Feature        | Formula                                      | Example     |
|---|----------------|----------------------------------------------|-------------|
| 6 | `year`         | Game date year                               | `2026`      |
| 7 | `month`        | Game date month (1–12)                       | `2`         |
| 8 | `day_of_week`  | Game date weekday (0=Monday ... 6=Sunday)    | `4` (Friday)|

---

## 5. L3 Rolling Stats (12)

**Rolling mean of the last 3 games**, computed per player, with `shift(1)` to exclude
the current game (prevents data leakage).

Source: NBA API game logs (`nba_api.stats.endpoints`).

| # | Feature       | Raw NBA API Field   | Formula                                                    |
|---|---------------|---------------------|------------------------------------------------------------|
| 9 | `L3_PTS`      | `PTS`               | `groupby('player_id')['PTS'].rolling(3).mean().shift(1)`   |
| 10| `L3_REB`      | `REB`               | same pattern with `REB`                                    |
| 11| `L3_AST`      | `AST`               | same pattern with `AST`                                    |
| 12| `L3_MIN`      | `MIN`               | same pattern with `MIN`                                    |
| 13| `L3_FG_PCT`   | `FG_PCT`            | same pattern with `FG_PCT` **(decimal 0–1 in training)**   |
| 14| `L3_FG3M`     | `FG3M`              | same pattern with `FG3M`                                   |
| 15| `L3_FG3_PCT`  | `FG3_PCT`           | same pattern with `FG3_PCT` **(decimal 0–1 in training)**  |
| 16| `L3_STL`      | `STL`               | same pattern with `STL`                                    |
| 17| `L3_BLK`      | `BLK`               | same pattern with `BLK`                                    |
| 18| `L3_TOV`      | `TOV`               | same pattern with `TOV`                                    |
| 19| `L3_FGM`      | `FGM`               | same pattern with `FGM`                                    |
| 20| `L3_FGA`      | `FGA`               | same pattern with `FGA`                                    |

```python
# Training code (build_features_complete.py:65-66)
df[f'L3_{stat}'] = df.groupby('player_id')[stat].transform(
    lambda x: x.rolling(3, min_periods=1).mean().shift(1)
)
```

---

## 6. L10 Rolling Stats + Std Dev (15)

**Rolling mean of the last 10 games** (same `shift(1)` pattern), plus standard deviation
for PTS, REB, AST.

| #  | Feature         | Formula                                           |
|----|-----------------|---------------------------------------------------|
| 21 | `L10_PTS`       | `rolling(10).mean().shift(1)` on PTS              |
| 22 | `L10_REB`       | same on REB                                       |
| 23 | `L10_AST`       | same on AST                                       |
| 24 | `L10_MIN`       | same on MIN                                       |
| 25 | `L10_FG_PCT`    | same on FG_PCT **(decimal 0–1)**                  |
| 26 | `L10_FG3M`      | same on FG3M                                      |
| 27 | `L10_FG3_PCT`   | same on FG3_PCT **(decimal 0–1)**                 |
| 28 | `L10_STL`       | same on STL                                       |
| 29 | `L10_BLK`       | same on BLK                                       |
| 30 | `L10_TOV`       | same on TOV                                       |
| 31 | `L10_FGM`       | same on FGM                                       |
| 32 | `L10_FGA`       | same on FGA                                       |
| 33 | `L10_PTS_STD`   | `rolling(10).std().shift(1)` on PTS               |
| 34 | `L10_REB_STD`   | same on REB                                       |
| 35 | `L10_AST_STD`   | same on AST                                       |

```python
# Training code (build_features_complete.py:72-77)
df[f'L10_{stat}_STD'] = df.groupby('player_id')[stat].transform(
    lambda x: x.rolling(10, min_periods=1).std().shift(1)
)
```

---

## 7. Game Context (5)

| #  | Feature          | Formula                                                              | Example |
|----|------------------|----------------------------------------------------------------------|---------|
| 36 | `HOME_AWAY`      | `1` if player's team is home, `0` if away                           | `1`     |
| 37 | `DAYS_REST`      | Calendar days since player's previous game. Default `3` if unknown. | `2`     |
| 38 | `BACK_TO_BACK`   | `1` if `DAYS_REST == 1`, else `0`                                   | `0`     |
| 39 | `GAMES_IN_LAST_7`| Count of games played by this player in the 7 days before this game | `3`     |
| 40 | `MINUTES_TREND`  | `L3_MIN - L10_MIN`                                                  | `1.4`   |

```python
MINUTES_TREND = L3_MIN - L10_MIN
```

---

## 8. The 44 Derived Features

These are all computed from the 44 raw inputs above. Your cloud function must compute
them using the exact formulas below (all verified against real test data).

The complete `compute_derived_features()` Python function is in
[Section 17](#17-inference-code-reference).

### 44 Derived Features Checklist

```
ADVANCED PERFORMANCE (12):
  MINUTES_TREND, SCORING_EFFICIENCY, ASSIST_TO_RATIO, REBOUND_RATE,
  USAGE_RATE, TREND_PTS, TREND_REB, TREND_AST, CONSISTENCY_PTS,
  CONSISTENCY_REB, CONSISTENCY_AST, ACCELERATION_PTS, EFFICIENCY_STABLE

INTERACTIONS (6):
  L3_PTS_x_HOME, L3_REB_x_HOME, L3_AST_x_HOME,
  L3_MIN_x_B2B, L3_PTS_x_REST, USAGE_x_EFFICIENCY

COMPOSITE & RATIOS (10):
  LOAD_INTENSITY, SHOOTING_VOLUME, REBOUND_INTENSITY,
  PLAYMAKING_EFFICIENCY, THREE_POINT_THREAT, DEFENSIVE_IMPACT,
  PTS_VOLATILITY, MINUTES_STABILITY, L3_vs_L10_PTS_RATIO, L3_vs_L10_REB_RATIO

BETTING DERIVED (16):
  LINE_VALUE(*), ODDS_EDGE, odds_spread, market_confidence,
  L3_PTS_vs_LINE, L3_REB_vs_LINE, L3_AST_vs_LINE,
  LINE_DIFFICULTY_PTS, LINE_DIFFICULTY_REB, LINE_DIFFICULTY_AST,
  IMPLIED_PROB_OVER, LINE_vs_AVG_PTS, LINE_vs_AVG_REB,
  L3_vs_market(*), L10_vs_market(*)
                                                         TOTAL: 44

(*) = prop_type-dependent, see Section 13
```

---

## 9. Advanced Performance (12)

All formulas use **L3 stats** (last 3 games rolling averages) as inputs unless noted.

| #  | Feature              | Formula                                                          |
|----|----------------------|------------------------------------------------------------------|
| 41 | `SCORING_EFFICIENCY` | `L3_PTS / L3_FGA`                                               |
| 42 | `ASSIST_TO_RATIO`    | `L3_AST / L3_TOV`                                               |
| 43 | `REBOUND_RATE`       | `L3_REB / L3_MIN`                                               |
| 44 | `USAGE_RATE`         | `L3_FGA / L3_MIN`                                               |
| 45 | `TREND_PTS`          | `L3_PTS - L10_PTS`                                              |
| 46 | `TREND_REB`          | `L3_REB - L10_REB`                                              |
| 47 | `TREND_AST`          | `L3_AST - L10_AST`                                              |
| 48 | `CONSISTENCY_PTS`    | `L10_PTS_STD / L10_PTS`                                         |
| 49 | `CONSISTENCY_REB`    | `L10_REB_STD / L10_REB`                                         |
| 50 | `CONSISTENCY_AST`    | `L10_AST_STD / L10_AST`                                         |
| 51 | `ACCELERATION_PTS`   | `(L3_PTS - L10_PTS) / DAYS_REST`                                |
| 52 | `EFFICIENCY_STABLE`  | `1 if L3_PTS >= L10_PTS else 0`                                 |

> **ACCELERATION_PTS** divides TREND_PTS by DAYS_REST (momentum normalized by rest).
> **EFFICIENCY_STABLE** is a binary flag: `1` = player on hot streak, `0` = declining.

---

## 10. Interaction Features (6)

Multiplicative interactions between performance and context features.

| #  | Feature               | Formula                            |
|----|-----------------------|------------------------------------|
| 53 | `L3_PTS_x_HOME`      | `L3_PTS * HOME_AWAY`              |
| 54 | `L3_REB_x_HOME`      | `L3_REB * HOME_AWAY`              |
| 55 | `L3_AST_x_HOME`      | `L3_AST * HOME_AWAY`              |
| 56 | `L3_MIN_x_B2B`       | `L3_MIN * BACK_TO_BACK`           |
| 57 | `L3_PTS_x_REST`      | `L3_PTS * DAYS_REST`              |
| 58 | `USAGE_x_EFFICIENCY`  | `USAGE_RATE * SCORING_EFFICIENCY`  |

---

## 11. Composite & Ratio Features (10)

### Composite (6)

| #  | Feature                 | Formula                                                 |
|----|-------------------------|---------------------------------------------------------|
| 59 | `LOAD_INTENSITY`        | `GAMES_IN_LAST_7 * L10_MIN / 7`                        |
| 60 | `SHOOTING_VOLUME`       | `L3_FGA`                                                |
| 61 | `REBOUND_INTENSITY`     | `L3_REB * REBOUND_RATE` = `L3_REB² / L3_MIN`           |
| 62 | `PLAYMAKING_EFFICIENCY` | `L3_AST * ASSIST_TO_RATIO` = `L3_AST² / L3_TOV`        |
| 63 | `THREE_POINT_THREAT`    | `L3_FG3M * L3_FG3_PCT` **(FG3_PCT in decimal 0–1)**    |
| 64 | `DEFENSIVE_IMPACT`      | `L3_STL + L3_BLK + 0.5`                                |

> **THREE_POINT_THREAT**: If your FG3_PCT is in percentage form (e.g. 40.0), divide by 100 first.
> Example: `2.7 * 0.40 = 1.08`.

### Ratios (4)

| #  | Feature                | Formula                                        |
|----|------------------------|-------------------------------------------------|
| 65 | `PTS_VOLATILITY`       | `L10_PTS_STD / L10_PTS`                        |
| 66 | `MINUTES_STABILITY`    | `L3_MIN / L10_MIN`                             |
| 67 | `L3_vs_L10_PTS_RATIO`  | `L3_PTS / L10_PTS`                             |
| 68 | `L3_vs_L10_REB_RATIO`  | `L3_REB / L10_REB`                             |

---

## 12. Betting Line Features (20)

### Raw Betting Data (5)

These come directly from the odds API.

| #  | Feature              | Source                     | Format          |
|----|----------------------|----------------------------|-----------------|
| 69 | `line`               | The Odds API prop line     | float (e.g. 28.5) |
| 70 | `odds_over`          | American odds for Over     | int (e.g. -115) |
| 71 | `odds_under`         | American odds for Under    | int (e.g. -105) |
| 72 | `implied_prob_over`  | Derived from `odds_over`   | float (0–1)     |
| 73 | `implied_prob_under` | Derived from `odds_under`  | float (0–1)     |

**Implied probability conversion from American odds:**

```python
def american_to_implied_prob(odds):
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)
    else:
        return 100 / (odds + 100)

# Examples:
# -115 → 115/215 = 0.5349
# +100 → 100/200 = 0.5000
# -105 → 105/205 = 0.5122
```

### Derived Betting Features (15)

#### Features that are ALWAYS computed the same way (regardless of prop_type):

| #  | Feature              | Formula                                              |
|----|----------------------|------------------------------------------------------|
| 75 | `ODDS_EDGE`          | `implied_prob_over - implied_prob_under`              |
| 76 | `odds_spread`        | `odds_over - odds_under`                             |
| 77 | `market_confidence`  | `abs(implied_prob_over - 0.5)`                       |
| 78 | `L3_PTS_vs_LINE`     | `L3_PTS - line` **(ALWAYS uses PTS)**                |
| 79 | `L3_REB_vs_LINE`     | `L3_REB - line` **(ALWAYS uses REB)**                |
| 80 | `L3_AST_vs_LINE`     | `L3_AST - line` **(ALWAYS uses AST)**                |
| 81 | `LINE_DIFFICULTY_PTS`| `line / L10_PTS` **(ALWAYS uses PTS)**               |
| 82 | `LINE_DIFFICULTY_REB`| `line / L10_REB` **(ALWAYS uses REB)**               |
| 83 | `LINE_DIFFICULTY_AST`| `line / L10_AST` **(ALWAYS uses AST)**               |
| 84 | `IMPLIED_PROB_OVER`  | `implied_prob_over` (duplicate/copy)                 |
| 85 | `LINE_vs_AVG_PTS`    | `line - L10_PTS` **(ALWAYS uses PTS)**               |
| 86 | `LINE_vs_AVG_REB`    | `line - L10_REB` **(ALWAYS uses REB)**               |

> These features compare the betting line against PTS, REB, and AST **regardless** of what
> the prop_type is. A rebounds prop will still have `L3_PTS_vs_LINE = L3_PTS - line`.
> This is by design — it gives the model cross-stat context.

#### Features that DEPEND on prop_type:

| #  | Feature          | Formula — depends on prop_type                          |
|----|------------------|---------------------------------------------------------|
| 74 | `LINE_VALUE`     | `(L3_{PROP_STAT} - line) / line`                        |
| 87 | `L3_vs_market`   | `(L3_{PROP_STAT} - line) * implied_prob_over`           |
| 88 | `L10_vs_market`  | `(L10_{PROP_STAT} - line) * implied_prob_over`          |

See [Section 11](#11-prop-type-dependent-logic) for the full prop_type → stat mapping.

---

## 13. Prop-Type-Dependent Logic

Three features change their computation based on `prop_type`: **LINE_VALUE**, **L3_vs_market**, **L10_vs_market**.

### Stat mapping for LINE_VALUE

```python
def get_l3_stat_for_prop(row):
    """Get the relevant L3 stat sum for this prop_type."""
    prop = row['prop_type']
    if prop == 'points':
        return row['L3_PTS']
    elif prop == 'rebounds':
        return row['L3_REB']
    elif prop == 'assists':
        return row['L3_AST']
    elif prop == 'threes':
        return row['L3_FG3M']
    elif prop == 'blocks':
        return row['L3_BLK']
    elif prop == 'steals':
        return row['L3_STL']
    elif prop == 'turnovers':
        return row['L3_TOV']
    elif prop == 'points_rebounds':
        return row['L3_PTS'] + row['L3_REB']
    elif prop == 'points_assists':
        return row['L3_PTS'] + row['L3_AST']
    elif prop == 'rebounds_assists':
        return row['L3_REB'] + row['L3_AST']
    elif prop == 'points_rebounds_assists':
        return row['L3_PTS'] + row['L3_REB'] + row['L3_AST']
    elif prop == 'blocks_steals':
        return row['L3_BLK'] + row['L3_STL']
    else:
        return row['L3_PTS']  # fallback
```

```python
LINE_VALUE = (L3_stat - line) / line
```

**Verified examples:**
- LeBron (points, line=28.5): `(31.3 - 28.5) / 28.5 = 0.098`
- Giannis (rebounds, line=12.5): `(14.3 - 12.5) / 12.5 = 0.144`
- Trae (assists, line=10.5): `(12.7 - 10.5) / 10.5 = 0.210`
- Luka (points_rebounds, line=41.5): `(33.0 + 9.0 - 41.5) / 41.5 = 0.012`

### Stat mapping for L3_vs_market and L10_vs_market

```python
def get_market_stat(row, window='L3'):
    """
    Get the relevant stat for market comparison.
    For simple props: uses the matching stat.
    For combo props: uses PTS as primary stat (NOT the sum).
    """
    prop = row['prop_type']

    if prop in ('points', 'points_rebounds', 'points_assists',
                'points_rebounds_assists', 'threes'):
        return row[f'{window}_PTS']
    elif prop in ('rebounds', 'rebounds_assists'):
        return row[f'{window}_REB']
    elif prop == 'assists':
        return row[f'{window}_AST']
    elif prop == 'blocks' or prop == 'blocks_steals':
        return row[f'{window}_BLK']
    elif prop == 'steals':
        return row[f'{window}_STL']
    elif prop == 'turnovers':
        return row[f'{window}_TOV']
    else:
        return row[f'{window}_PTS']  # fallback
```

```python
L3_vs_market  = (L3_{market_stat}  - line) * implied_prob_over
L10_vs_market = (L10_{market_stat} - line) * implied_prob_over
```

**Verified examples:**
- LeBron (points): `(31.3 - 28.5) * 0.535 = 1.498`
- Giannis (rebounds): `(14.3 - 12.5) * 0.545 = 0.981`
- Luka (points_rebounds): `(33.0 - 41.5) * 0.524 = -4.454` (uses PTS only, not sum!)

> **KEY INSIGHT**: For combo props, `LINE_VALUE` uses the **sum** of the relevant stats,
> but `L3_vs_market` / `L10_vs_market` use only the **primary stat** (PTS for points combos,
> REB for rebounds combos). This is how the training data was built.

---

## 14. Categorical Encoding

### How encoding works in training

```python
# train_final_clean.py lines 75-82
categorical_allowed = ['bookmaker', 'prop_type', 'home_team', 'away_team', 'SEASON']

for col in categorical_features:
    # Build unified mapping from ALL splits
    unique_vals = pd.concat([X_train[col], X_val[col], X_test[col]]).unique()
    mapping = {val: idx for idx, val in enumerate(unique_vals)}

    X_train[col] = X_train[col].map(mapping).fillna(-1).astype(int)
    X_val[col]   = X_val[col].map(mapping).fillna(-1).astype(int)
    X_test[col]  = X_test[col].map(mapping).fillna(-1).astype(int)
```

### What the model pickle stores

The model pickle file (`model_data`) contains:
- `model_data['model']` — the CatBoost model
- `model_data['feature_names']` — list of 88 feature names (in order)
- `model_data['categorical_mappings']` — either:
  - A `dict` of `{column_name: {string_value: int_code}}` mappings, OR
  - A `list` of categorical column names (in older versions)

### At inference time

```python
# From predictor.py
for col, mapping in categorical_mappings.items():
    if col in df.columns:
        df[col] = df[col].astype(str).map(mapping)
        df[col] = df[col].fillna(-1)  # unknown values → -1
        df[col] = df[col].astype(int)
```

> **If categorical_mappings is a list** (not a dict), the predictor won't have the actual
> value→int mappings and you'll need to rebuild them from training data.

### Normalization before encoding

The predictor applies these transformations BEFORE categorical encoding:

1. **bookmaker**: lowercase + special case mapping (see Section 2)
2. **home_team / away_team**: 3-letter code → full team name
3. **prop_type**: lowercase + abbreviation mapping (`pts`→`points`, `reb`→`rebounds`, etc.)
4. **FG_PCT fields**: if value > 1, divide by 100 (percentage → decimal)

---

## 15. Data Sources

### Source 1: The Odds API

**What it provides:** Betting lines and odds for player props.

| Feature         | Odds API Field                                |
|-----------------|-----------------------------------------------|
| `line`          | `outcomes[].point` from player prop market    |
| `odds_over`     | `outcomes[name="Over"].price` (American odds) |
| `odds_under`    | `outcomes[name="Under"].price` (American odds)|
| `bookmaker`     | `bookmakers[].key` (e.g. `draftkings`)        |
| `home_team`     | `home_team` from event                        |
| `away_team`     | `away_team` from event                        |
| `prop_type`     | Derived from market key (e.g. `player_points` → `points`) |

**implied_prob_over / implied_prob_under** are computed from American odds (see Section 10).

### Source 2: NBA API (nba_api Python package)

**What it provides:** Player game logs with box score stats.

| Feature Feeds Into       | NBA API Endpoint                                          |
|--------------------------|-----------------------------------------------------------|
| `PTS, REB, AST, MIN`    | `PlayerGameLog` → columns `PTS`, `REB`, `AST`, `MIN`     |
| `FG_PCT, FG3_PCT`       | `PlayerGameLog` → columns `FG_PCT`, `FG3_PCT`            |
| `FGM, FGA, FG3M`        | `PlayerGameLog` → columns `FGM`, `FGA`, `FG3M`           |
| `STL, BLK, TOV`         | `PlayerGameLog` → columns `STL`, `BLK`, `TOV`            |
| `MATCHUP`               | `PlayerGameLog` → `MATCHUP` (used for HOME_AWAY)         |
| `GAME_DATE`             | `PlayerGameLog` → `GAME_DATE` (used for DAYS_REST, etc.) |

**Rolling stats pipeline:**
```
NBA API game logs → sort by (player_id, game_date) → rolling(3/10).mean().shift(1) → L3_*/L10_*
```

### Source 3: Game Schedule / Calendar

| Feature          | Source                                                |
|------------------|-------------------------------------------------------|
| `year`           | Game date `.year`                                     |
| `month`          | Game date `.month`                                    |
| `day_of_week`    | Game date `.weekday()` (Monday=0)                     |
| `SEASON`         | Derived from game date (Oct–Jun: `"{year-1}-{year}"`) |
| `HOME_AWAY`      | From MATCHUP: `@` = away (0), `vs.` = home (1)       |
| `DAYS_REST`      | `game_date - previous_game_date` in days              |
| `BACK_TO_BACK`   | `1 if DAYS_REST == 1 else 0`                          |
| `GAMES_IN_LAST_7`| Count of player's games where `date >= game_date - 7` |

---

## 16. FG_PCT Format Warning

**CRITICAL**: The model was trained with FG_PCT values in **decimal format** (0.0 to 1.0).

| Field         | Training format | Common API format | Conversion needed? |
|---------------|-----------------|-------------------|--------------------|
| `L3_FG_PCT`   | 0.545           | 54.5              | YES: divide by 100 |
| `L10_FG_PCT`  | 0.512           | 51.2              | YES: divide by 100 |
| `L3_FG3_PCT`  | 0.400           | 40.0              | YES: divide by 100 |
| `L10_FG3_PCT` | 0.350           | 35.0              | YES: divide by 100 |

The predictor does this automatically:
```python
if (df[field] > 1).any():
    df[field] = df[field] / 100
```

**This affects `THREE_POINT_THREAT`**: `L3_FG3M * L3_FG3_PCT` must use decimal FG3_PCT.
Example: `2.7 * 0.40 = 1.08` (correct), NOT `2.7 * 40.0 = 108` (wrong).

---

## 17. Inference Code Reference

### Complete feature computation in Python

```python
import pandas as pd
import numpy as np

def compute_derived_features(df):
    """
    Given a DataFrame with raw features (L3/L10 stats, line, odds, game context),
    compute all 44 derived features to match training.

    Input df must already contain:
    - L3_PTS through L3_FGA (12 rolling stats)
    - L10_PTS through L10_FGA + L10_PTS_STD/REB_STD/AST_STD (15 rolling stats)
    - HOME_AWAY, DAYS_REST, BACK_TO_BACK, GAMES_IN_LAST_7 (4 context)
    - line, odds_over, odds_under, implied_prob_over, implied_prob_under (5 betting)
    - prop_type (string)

    FG_PCT fields must be in DECIMAL format (0-1) before calling this.
    """
    d = df.copy()

    # --- Game Context ---
    d['MINUTES_TREND'] = d['L3_MIN'] - d['L10_MIN']

    # --- Advanced Performance ---
    d['SCORING_EFFICIENCY'] = d['L3_PTS'] / d['L3_FGA'].replace(0, 1)
    d['ASSIST_TO_RATIO']    = d['L3_AST'] / d['L3_TOV'].replace(0, 1)
    d['REBOUND_RATE']       = d['L3_REB'] / d['L3_MIN'].replace(0, 1)
    d['USAGE_RATE']         = d['L3_FGA'] / d['L3_MIN'].replace(0, 1)
    d['TREND_PTS']          = d['L3_PTS'] - d['L10_PTS']
    d['TREND_REB']          = d['L3_REB'] - d['L10_REB']
    d['TREND_AST']          = d['L3_AST'] - d['L10_AST']
    d['CONSISTENCY_PTS']    = d['L10_PTS_STD'] / d['L10_PTS'].replace(0, 1)
    d['CONSISTENCY_REB']    = d['L10_REB_STD'] / d['L10_REB'].replace(0, 1)
    d['CONSISTENCY_AST']    = d['L10_AST_STD'] / d['L10_AST'].replace(0, 1)
    d['ACCELERATION_PTS']   = (d['L3_PTS'] - d['L10_PTS']) / d['DAYS_REST'].replace(0, 1)
    d['EFFICIENCY_STABLE']  = (d['L3_PTS'] >= d['L10_PTS']).astype(int)

    # --- Interaction Features ---
    d['L3_PTS_x_HOME']      = d['L3_PTS'] * d['HOME_AWAY']
    d['L3_REB_x_HOME']      = d['L3_REB'] * d['HOME_AWAY']
    d['L3_AST_x_HOME']      = d['L3_AST'] * d['HOME_AWAY']
    d['L3_MIN_x_B2B']       = d['L3_MIN'] * d['BACK_TO_BACK']
    d['L3_PTS_x_REST']      = d['L3_PTS'] * d['DAYS_REST']
    d['USAGE_x_EFFICIENCY']  = d['USAGE_RATE'] * d['SCORING_EFFICIENCY']

    # --- Composite Features ---
    d['LOAD_INTENSITY']       = d['GAMES_IN_LAST_7'] * d['L10_MIN'] / 7
    d['SHOOTING_VOLUME']      = d['L3_FGA']
    d['REBOUND_INTENSITY']    = d['L3_REB'] * d['REBOUND_RATE']
    d['PLAYMAKING_EFFICIENCY']= d['L3_AST'] * d['ASSIST_TO_RATIO']
    d['THREE_POINT_THREAT']   = d['L3_FG3M'] * d['L3_FG3_PCT']  # FG3_PCT must be decimal!
    d['DEFENSIVE_IMPACT']     = d['L3_STL'] + d['L3_BLK'] + 0.5

    # --- Ratio Features ---
    d['PTS_VOLATILITY']       = d['L10_PTS_STD'] / d['L10_PTS'].replace(0, 1)
    d['MINUTES_STABILITY']    = d['L3_MIN'] / d['L10_MIN'].replace(0, 1)
    d['L3_vs_L10_PTS_RATIO']  = d['L3_PTS'] / d['L10_PTS'].replace(0, 1)
    d['L3_vs_L10_REB_RATIO']  = d['L3_REB'] / d['L10_REB'].replace(0, 1)

    # --- Betting Derived (prop_type INDEPENDENT) ---
    d['ODDS_EDGE']            = d['implied_prob_over'] - d['implied_prob_under']
    d['odds_spread']          = d['odds_over'] - d['odds_under']
    d['market_confidence']    = (d['implied_prob_over'] - 0.5).abs()
    d['L3_PTS_vs_LINE']       = d['L3_PTS'] - d['line']
    d['L3_REB_vs_LINE']       = d['L3_REB'] - d['line']
    d['L3_AST_vs_LINE']       = d['L3_AST'] - d['line']
    d['LINE_DIFFICULTY_PTS']  = d['line'] / d['L10_PTS'].replace(0, 1)
    d['LINE_DIFFICULTY_REB']  = d['line'] / d['L10_REB'].replace(0, 1)
    d['LINE_DIFFICULTY_AST']  = d['line'] / d['L10_AST'].replace(0, 1)
    d['IMPLIED_PROB_OVER']    = d['implied_prob_over']
    d['LINE_vs_AVG_PTS']      = d['line'] - d['L10_PTS']
    d['LINE_vs_AVG_REB']      = d['line'] - d['L10_REB']

    # --- Betting Derived (prop_type DEPENDENT) ---
    d['LINE_VALUE']    = d.apply(lambda r: _line_value(r), axis=1)
    d['L3_vs_market']  = d.apply(lambda r: _l3_vs_market(r), axis=1)
    d['L10_vs_market'] = d.apply(lambda r: _l10_vs_market(r), axis=1)

    # --- Cleanup ---
    d = d.fillna(0).replace([np.inf, -np.inf], 0)

    return d


def _get_l3_stat(row):
    """Get L3 stat matching prop_type (uses SUM for combos)."""
    p = row['prop_type']
    m = {
        'points': row['L3_PTS'],
        'rebounds': row['L3_REB'],
        'assists': row['L3_AST'],
        'threes': row['L3_FG3M'],
        'blocks': row['L3_BLK'],
        'steals': row['L3_STL'],
        'turnovers': row['L3_TOV'],
        'points_rebounds': row['L3_PTS'] + row['L3_REB'],
        'points_assists': row['L3_PTS'] + row['L3_AST'],
        'rebounds_assists': row['L3_REB'] + row['L3_AST'],
        'points_rebounds_assists': row['L3_PTS'] + row['L3_REB'] + row['L3_AST'],
        'blocks_steals': row['L3_BLK'] + row['L3_STL'],
    }
    return m.get(p, row['L3_PTS'])


def _get_market_stat(row, window):
    """Get stat for market comparison (uses PRIMARY stat, not combo sum)."""
    p = row['prop_type']
    if p in ('points', 'points_rebounds', 'points_assists',
             'points_rebounds_assists', 'threes'):
        return row[f'{window}_PTS']
    elif p in ('rebounds', 'rebounds_assists'):
        return row[f'{window}_REB']
    elif p == 'assists':
        return row[f'{window}_AST']
    elif p in ('blocks', 'blocks_steals'):
        return row[f'{window}_BLK']
    elif p == 'steals':
        return row[f'{window}_STL']
    elif p == 'turnovers':
        return row[f'{window}_TOV']
    return row[f'{window}_PTS']


def _line_value(row):
    stat = _get_l3_stat(row)
    line = row['line']
    return (stat - line) / line if line != 0 else 0


def _l3_vs_market(row):
    stat = _get_market_stat(row, 'L3')
    return (stat - row['line']) * row['implied_prob_over']


def _l10_vs_market(row):
    stat = _get_market_stat(row, 'L10')
    return (stat - row['line']) * row['implied_prob_over']
```

### Full prediction flow

```python
import pickle

# 1. Load model
with open('model.pkl', 'rb') as f:
    model_data = pickle.load(f)
    model = model_data['model']
    feature_names = model_data['feature_names']
    cat_mappings = model_data.get('categorical_mappings', {})

# 2. Build input DataFrame with all 88 features
df = pd.DataFrame([instance])

# 3. Normalize categoricals BEFORE encoding
df['bookmaker'] = df['bookmaker'].apply(normalize_bookmaker)
df['home_team'] = df['home_team'].apply(normalize_team)  # 3-letter → full name
df['away_team'] = df['away_team'].apply(normalize_team)
df['prop_type'] = df['prop_type'].apply(normalize_prop_type)

# 4. Convert FG_PCT from percentage to decimal if needed
for field in ['L3_FG_PCT', 'L10_FG_PCT', 'L3_FG3_PCT', 'L10_FG3_PCT']:
    if field in df.columns and (df[field] > 1).any():
        df[field] = df[field] / 100

# 5. Compute derived features
df = compute_derived_features(df)

# 6. Encode categoricals
for col, mapping in cat_mappings.items():
    if col in df.columns:
        df[col] = df[col].astype(str).map(mapping).fillna(-1).astype(int)

# 7. Select features in model order
X = df[feature_names].copy()
X = X.fillna(0).replace([np.inf, -np.inf], 0)

# 8. Predict
probas = model.predict_proba(X)
over_index = list(model.classes_).index(1)
prob_over = float(probas[0, over_index])
```

---

## Summary of Key Gotchas

| Issue | Details |
|-------|---------|
| **FG_PCT format** | Model trained on decimals (0–1). Divide by 100 if coming as percentages. |
| **Team names** | Model expects full names ("Los Angeles Lakers"), not codes ("LAL"). |
| **LINE_VALUE is prop-dependent** | Uses the matching stat (or sum for combos) divided by line. |
| **L3_vs_market uses primary stat** | For combo props, uses PTS only (not the sum). |
| **L3_PTS_vs_LINE is NOT prop-dependent** | Always `L3_PTS - line`, even for rebounds/assists props. |
| **DEFENSIVE_IMPACT has +0.5** | `L3_STL + L3_BLK + 0.5`, not just the sum. |
| **ACCELERATION_PTS divides by REST** | `TREND_PTS / DAYS_REST`, not just TREND_PTS. |
| **LOAD_INTENSITY divides by 7** | `GAMES_IN_LAST_7 * L10_MIN / 7` |
| **Feature order matters** | Always use `df[model_data['feature_names']]` to reorder. |
| **Unknown categoricals → -1** | Any value not in the training mapping gets encoded as -1. |
| **NaN/Inf → 0** | All missing or infinite values are replaced with 0. |
| **shift(1) in training** | Rolling stats exclude the current game. At inference, you compute over the N most recent completed games. |

---

## 18. CatBoost Training Configuration

### Exact parameters used

```python
from catboost import CatBoostClassifier

model = CatBoostClassifier(
    iterations=500,
    depth=6,
    learning_rate=0.05,
    random_seed=42,
    auto_class_weights='Balanced',
    eval_metric='Accuracy',
    verbose=100
    # loss_function defaults to 'Logloss' (binary classification)
    # No scale_pos_weight — auto_class_weights='Balanced' handles class imbalance
    # No l2_leaf_reg specified — uses CatBoost default (3.0)
    # No border_count specified — uses CatBoost default (254)
)

model.fit(
    X_train, y_train,
    eval_set=(X_val, y_val),
    early_stopping_rounds=50,
    verbose=100
)
```

### Key training details

| Parameter | Value | Notes |
|-----------|-------|-------|
| `iterations` | 500 | Max trees. May stop earlier via early stopping |
| `depth` | 6 | Tree depth |
| `learning_rate` | 0.05 | Step size |
| `random_seed` | 42 | Deterministic |
| `auto_class_weights` | `'Balanced'` | Adjusts weights inversely proportional to class frequency |
| `eval_metric` | `'Accuracy'` | Metric monitored for early stopping |
| `loss_function` | `'Logloss'` | CatBoost default for binary classification |
| `early_stopping_rounds` | 50 | Stops if val accuracy doesn't improve for 50 rounds |

### Train/Val/Test split

- **Temporal split** (no shuffling):
  - Train: 2023-24 season
  - Val: 2024-25 season
  - Test: 2025-26 season
- `auto_class_weights='Balanced'` was used because Over/Under classes are slightly imbalanced

### Reported performance

| Metric | Test Set |
|--------|----------|
| Accuracy | 64.9% |
| Brier Score | 0.2308 |
| AUC | 0.686 |
| Baseline (always Over) | ~50-55% (varies by season) |

---

## 19. Categorical Mappings — Exact Structure

### How the mappings were built

The deployed model (`_fixed.pkl`) had its categorical_mappings **patched after training** because the original training scripts had a bug — they saved the list of column names instead of the actual mappings.

The fix was documented in `CRITICAL_FIX_CATEGORICAL_ENCODING.md` and works like this:

```python
# Extract mappings from training data (post-hoc fix)
categorical_mappings = {}
for col in ['bookmaker', 'prop_type', 'home_team', 'away_team', 'SEASON']:
    if col in all_data.columns:
        unique_vals = sorted(all_data[col].dropna().unique())
        mapping = {str(val): idx for idx, val in enumerate(unique_vals)}
        categorical_mappings[col] = mapping
```

### Important: sorted() vs unsorted ordering

- The **original training scripts** used `pd.concat([...]).unique()` which gives **insertion-order** (non-deterministic)
- The **fix script** used `sorted()` which gives **alphabetical order**
- The fix script then **replaced** the mappings in the pickle, so the deployed model uses **alphabetical order**

### Expected mapping structure

```python
categorical_mappings = {
    'bookmaker': {
        'barstool': 0,
        'betmgm': 1,
        'betonlineag': 2,
        'betrivers': 3,
        'bovada': 4,
        'draftkings': 5,
        'fanduel': 6,
        'fanatics': 7,
        'mybookieag': 8,
        'williamhill_us': 9,
        # ... (all bookmakers seen in train+val+test, sorted alphabetically)
    },
    'prop_type': {
        'assists': 0,
        'blocks': 1,
        'blocks_steals': 2,
        'points': 3,
        'points_assists': 4,
        'points_rebounds': 5,
        'points_rebounds_assists': 6,
        'rebounds': 7,
        'rebounds_assists': 8,
        'steals': 9,
        'threes': 10,
        'turnovers': 11,
        # ... (all prop types seen in training, sorted alphabetically)
    },
    'home_team': {
        'Atlanta Hawks': 0,
        'Boston Celtics': 1,
        'Brooklyn Nets': 2,
        'Charlotte Hornets': 3,
        # ... all 30 NBA teams sorted alphabetically by full name
        'Washington Wizards': 29,
    },
    'away_team': {
        # Same mapping as home_team (same vocabulary, same integer codes)
        'Atlanta Hawks': 0,
        'Boston Celtics': 1,
        # ...
    },
    'SEASON': {
        '2023-24': 0,
        '2024-25': 1,
        '2025-26': 2,
        # ... (seasons present in train+val+test data)
    }
}
```

> **WARNING**: The exact integer assignments above are **approximate** (based on alphabetical sorting).
> The **authoritative** mappings are only in the pickle file. If you're rebuilding from scratch,
> use `sorted()` on the unique values from your training data to match the deployed model.

### How to handle missing mappings

If you don't have the pickle but need to reconstruct:

1. Load the training CSVs (`train_final_clean.csv`, `val_final_clean.csv`, `test_final_clean.csv`)
2. Concatenate all three
3. For each categorical column, get `sorted(all_data[col].dropna().unique())`
4. Build `{str(val): idx for idx, val in enumerate(sorted_unique)}`
5. Save into a new pickle with the model

---

## 20. Probability Output & Calibration

### How predictions are produced

```python
# CatBoost internally:
# 1. Computes raw score (sum of tree leaf values)
# 2. Applies sigmoid: prob = 1 / (1 + exp(-raw_score))
# 3. Returns [P(Under), P(Over)] via predict_proba()

probas = model.predict_proba(X)  # shape: (n_samples, 2)

# Get P(Over) — class 1
over_index = list(model.classes_).index(1)  # verify which index = class 1
prob_over = probas[:, over_index]

# Decision threshold
prediction = 'Over' if prob_over >= 0.5 else 'Under'
confidence = abs(prob_over - 0.5)
```

### No calibration was applied

The training pipeline does **NOT** apply any post-hoc calibration:
- No Platt scaling
- No isotonic regression
- No `CalibratedClassifierCV`
- No temperature scaling

The raw `predict_proba()` output from CatBoost is used directly.

### CatBoost's built-in calibration

CatBoost with `loss_function='Logloss'` optimizes the log-likelihood, which naturally produces
**reasonably well-calibrated** probabilities. Unlike some other gradient boosting frameworks,
CatBoost's probabilities tend to be closer to true frequencies out of the box.

However, `auto_class_weights='Balanced'` can shift the probability distribution — it inflates
probabilities for the minority class and deflates for the majority class. This means the raw
probabilities may be slightly miscalibrated compared to true event frequencies.

### Adding temperature scaling (optional improvement)

If you want to add temperature scaling post-hoc:

```python
import numpy as np
from scipy.optimize import minimize_scalar
from sklearn.metrics import log_loss

def calibrate_temperature(model, X_val, y_val):
    """Find optimal temperature T on validation set."""
    # Get raw logits (before sigmoid)
    raw_scores = model.predict(X_val, prediction_type='RawFormulaVal')

    def nll_with_temp(T):
        calibrated = 1 / (1 + np.exp(-raw_scores / T))
        return log_loss(y_val, calibrated)

    result = minimize_scalar(nll_with_temp, bounds=(0.1, 10.0), method='bounded')
    return result.x  # optimal temperature

# Usage:
# T = calibrate_temperature(model, X_val, y_val)
# raw = model.predict(X_new, prediction_type='RawFormulaVal')
# calibrated_prob = 1 / (1 + np.exp(-raw / T))
```

> **Note**: Temperature scaling requires access to validation labels (`y_val`).
> T > 1 softens probabilities toward 0.5 (less confident).
> T < 1 sharpens probabilities toward 0 or 1 (more confident).
> T = 1 is the default (no change).

### Confidence thresholds used in production

```python
confidence = abs(prob_over - 0.5)

should_bet = confidence > 0.10           # minimum 60/40 split
betting_value = (
    'high'   if confidence > 0.15 else   # > 65% one way
    'medium' if confidence > 0.10 else   # > 60% one way
    'low'                                 # < 60% (skip)
)
```
