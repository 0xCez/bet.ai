# bet.ai Feature Roadmap — Progress Tracker

> This document tracks implementation progress across conversation contexts.
> Updated: 2026-02-24

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Complete

---

## Phase 0: Scaffolding
- [x] 0a. Centralized sports config (`config/sports.ts` + `functions/shared/sportsConfig.js`)
- [x] 0b. Shared types file (`types/props.ts`)

## Phase 1: Fix Foundations
- [x] 1a. Fix Board card Over/Under mismatch (directionalHitRates backend + BoardView frontend)
- [x] 1b. Player quality filter (MIN_GAMES=5, MIN_AVG_MINUTES=20 in EdgeBoard + ParlayStack)
- [x] 1c. Improve bet ranking (betScore primary sort, edge field, top 15)

## Phase 2: Bet Leaderboard + Top Picks
- [x] 2a. Backend: `writeLeaderboardAndSlips()` writes `leaderboard` + `parlayOfTheDay` docs to Firestore on every refresh cycle
- [x] 2b. App: Top Picks screen (`app/(stack)/top-picks.tsx`) with Standard/Alt lines tabs
- [x] 2c. "Top Picks" button added to BoardView header

## Phase 3: Parlay of the Day + Builder Integration
- [x] 3a. `writeLeaderboardAndSlips()` writes `parlayOfTheDay` with LOCK/STEADY/SNIPER slips
- [x] 3b. Parlay of the Day cards in Parlay tab (reads from Firestore, expandable cards with tappable legs)
- [x] 3c. Bookmaker filter in Board tab (dropdown + filter logic)
- [x] 3d. Expanded bookmaker coverage: 5 → 13 books (DK, FD, MGM, Caesars, ESPN, BetRivers, Bovada, Fanatics, Hard Rock, BallyBet, MyBookie, BetOnline, BetUS)
- [x] 3e. Bookmaker filter chips on Suggested Parlays
- [x] 3f. Bookmaker link resolution fixed (short codes → full keys → deep links)

## Phase 4: PlayerChart + Narrative
- [x] 4a. Clear Over/Under direction badge on PlayerChart header
- [x] 4b. Opponent defense context section (rank, label, supports/contradicts)
- [x] 4c. EV+ calculation and display (backend + badge)
- [ ] 4d. Arbitrage detection (roadmap only, no code)

## Phase 5: Engagement
- [ ] 5a. Push notifications (`expo-notifications` + FCM + Cloud Function)
- [ ] 5b. Player search bar in Board tab
- [ ] 5c. Gamification: risk profile + "Build Your Model" UX
- [ ] 5d. Onboarding refresh (after all features complete)
  - [ ] Add bookmaker preference question: "Which sportsbook do you use?" (multi-select: DK, FD, MGM, Caesars, ESPN BET, BetRivers, Bovada, Fanatics, Hard Rock, BallyBet, etc.)
  - [ ] Store preference in AsyncStorage + Firestore user profile
  - [ ] Use preference to filter/prioritize props by bookmaker across Board, Picks, and Parlay tabs
  - [ ] Show bookmaker-specific odds first when user has a preference set

---

## Key Architecture Decisions
1. **Sport-agnostic from day 1**: `config/sports.ts` is single source of truth for all sport definitions
2. **No new endpoints for leaderboard**: Write to Firestore during existing refresh cycle via `writeLeaderboardAndSlips()`
3. **Backend-first fixes**: directionalHitRates + quality filter ship server-side so all app versions benefit
4. **Gamification is UX-only**: Client-side re-sort, no backend model changes
5. **Reuse everything**: See plan file at `.claude/plans/soft-petting-tide.md` for full reuse table

## What Was Done — Detailed Changes

### Phase 0 (NEW FILES)
- **`config/sports.ts`** — `SPORTS` config, `SportId` type, `SPORT_LIST` array. All sport-specific code imports from here.
- **`types/props.ts`** — `HitRateWindow`, `DirectionalHitRates`, `HitRates`, `RankedProp`, `ParlayLeg`, `LeaderboardData` interfaces
- **`functions/shared/sportsConfig.js`** — Backend mirror of sports config
- **`components/ui/CachedGameCard.tsx`** — `sport` field now uses `SportId` type
- **`app/hooks/useCachedGames.ts`** — imports `SportId`, uses it for sport casting

### Phase 1 (BUG FIXES + QUALITY)
- **`functions/mlPlayerPropsV2.js`**:
  - Added `MIN_GAMES=5` + `MIN_AVG_MINUTES=20` quality gate after game logs filter (~line 536)
  - Added `directionalHitRates` object (`l10`, `l20`, `season`) — pct matches prediction direction
  - Added `edge` field — explicit `weightedHitRate - impliedPct`
  - Changed sort from `displayConfidence` to `betScore` (line 728)
  - Increased top-N from 10 to 15
- **`functions/parlayStack.js`**:
  - Added `parseMinutes()` + `MIN_AVG_MINUTES=20` gate after existing `MIN_GAMES` check
- **`components/ui/BoardView.tsx`**:
  - Replaced `SPORT_OPTIONS` with `SPORT_LIST` from `config/sports.ts`
  - `PickRow` interface now includes `directionalHitRates` and `edge`
  - L10 display in both `renderPlayerTile` and `renderGameCard` is now direction-aware
  - Sort comparator uses directional L10 via `dirL10()` helper

### Phase 2 (LEADERBOARD + TOP PICKS)
- **`functions/preCacheTopGames.js`**:
  - Added `writeLeaderboardAndSlips()` function — aggregates cross-game props, writes `leaderboard` and `parlayOfTheDay` docs
  - `mapEdgeProp()` now includes `betScore`, `edge`, `dirL10`, `statType` fields
  - Called in: `preCacheTopGames`, `discoverGamesDaily`, `refreshPropsScheduled` (1-3), `refreshProps`
- **`app/(stack)/top-picks.tsx`** (NEW) — Screen with Standard Lines / Alt Lines tabs, reads `leaderboard` doc
- **`app/(stack)/_layout.tsx`** — Registered `top-picks` route
- **`components/ui/BoardView.tsx`** — Added "Top Picks" trophy button in header

### Phase 3 (PARLAY OF DAY + FILTERS)
- **`components/ui/ParlayBuilder.tsx`**:
  - Added `dailySlips` state, fetches `parlayOfTheDay` doc on mount
  - Added "Parlay of the Day" section with 3 horizontal cards (LOCK/SAFE/VALUE)
  - Cards show risk icon, leg count, combined odds, "View" CTA
- **`components/ui/BoardView.tsx`**:
  - Added `bookFilter` state + `showBookDropdown`
  - Extract `uniqueBooks` from props in useMemo
  - Added bookmaker filter chip in header (with BOOKMAKER_LOGOS in dropdown)
  - `filteredPlayers` now filters by both team AND bookmaker

### Phase 4 (COMPLETE)
- **`functions/playerPropChart.js`**:
  - Imported `getOpponentDefensiveStats` + `getOpponentStatForProp` from `shared/defense.js`
  - Added `defenseLabel()` helper: rank 1-5=Elite, 6-12=Strong, 13-18=Average, 19-25=Weak, 26-30=Poor
  - Added `calculateEV()` helper: EV = (p * (decimalOdds - 1) - (1 - p)) * 100, using L10 hit rate
  - Response now includes `defense` object (rank, totalTeams, label, allowed, stat, opponentCode, supports, narrative)
  - Response now includes `ev` (Expected Value %, can be positive or negative)
- **`app/(stack)/player-prop-chart.tsx`**:
  - Added OVER/UNDER direction badge above stat line (green/red colored) + `dirBadge`/`dirBadgeText` styles
  - Added `DefenseContext` interface to types
  - Added EV badge in odds row (next to VALUE badge) — green for positive EV, red for negative
  - Added Defense Matchup section between hit rates and safe lines:
    - Opponent logo + code + rank badge (#N/30) + label (Elite/Strong/etc.)
    - Allowed stat per game
    - Supports/Contradicts narrative tag (green/orange) based on prediction direction vs defense quality

### Parlay Tab Rework + Bookmaker Expansion
- **`functions/shared/oddsApi.js`**:
  - Expanded `BOOKMAKERS` from 5 to 13: +betrivers, bovada, fanatics, hardrockbet, ballybet, mybookieag, betonlineag, betus
  - Added MyBookie, BetOnline, BetUS to `BOOKMAKER_MAP`
- **`functions/preCacheTopGames.js`**:
  - Rewrote `buildParlaySlips(altLegs, edgeProps)` — now takes both pipelines:
    - LOCK: 4-5 alt legs, 70%+ directional L10, highest edge
    - STEADY: 3 alt legs, 80%+ directional L10, lightest juice
    - SNIPER: 2-3 legs mixing top standard-line edges + 1 safe alt kicker
  - Added MyBookie, BetOnline, BetUS to `BOOK_SHORT`
- **`components/ui/BuilderView.tsx`**:
  - Renamed tab "Builder" → "Parlay" with sub-tabs: Suggested / Build Your Own
  - Updated RISK_THEME for LOCK/STEADY/SNIPER (purple accent for SNIPER)
  - Added bookmaker filter chips (horizontal scroll)
  - Made parlay legs tappable → navigates to player chart with `from: "parlay"`
  - Fixed bookmaker link resolution via `SHORT_TO_BOOKMAKER` reverse map
  - SNIPER legs from standard lines show "STD" badge
- **`utils/formatters.ts`**:
  - Added MyBookie, BetOnline, BetUS + all short codes (MYBK, BOL, BETUS) to `BOOKMAKER_LOGOS`
  - Added `SHORT_TO_BOOKMAKER` reverse map for deep link resolution
- **`app/(stack)/player-prop-chart.tsx`**:
  - Back button now prioritizes `params.from` over `router.back()` — always returns to correct tab
  - Handles `from: "parlay"` → Parlay tab
- **`app/home.tsx`**:
  - Added `useEffect` to sync `activePage` when `params.page` changes (fixes back navigation)
- **`components/ui/PlayerPropCard.tsx`** — Added `from: "board"` to navigation params
- **`components/ui/PicksView.tsx`** — Redesigned cards with accent bar, headshot ring, L10 badge, bookmaker logo

### Top Picks → 4th Tab Integration
- **`components/ui/PicksView.tsx`** (NEW) — Extracted from `top-picks.tsx`, reusable component without top bar
- **`components/ui/PageIndicator.tsx`** — Added "Picks" tab (trophy icon) at index 1, TAB_WIDTH 100→80, TAB_GAP 8→6, font size sm→xs
- **`app/home.tsx`** — Mounted `PicksView` at tab index 1, shifted Scan→2, Builder→3. Updated "Build a Parlay" to `handlePageChange(3)`. Added `"picks"` to `HomeParams`.
- **`components/ui/BoardView.tsx`** — Removed `handleTopPicksPress`, trophy button JSX, and `topPicksBtn`/`topPicksBtnText` styles
- **`app/(stack)/top-picks.tsx`** — Thin wrapper rendering `<PicksView />` with back button for deep-link compat

## Next Steps (for next context)
1. Phase 5a: Push notifications (`expo-notifications` + FCM + Cloud Function)
2. Phase 5b: Player search bar in Board tab
3. Phase 5c: Gamification: risk profile + "Build Your Model" UX
4. Phase 5d: Onboarding refresh — includes bookmaker preference question (multi-select), stored in AsyncStorage + Firestore, used to filter/prioritize props across all tabs
5. Phase 4d: Arbitrage detection (roadmap only, no code needed)
