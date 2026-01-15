# Slideshow Generator - Architecture & Context

## What This Is

This is a **self-contained module** for generating sports betting content for social media slideshows (TikTok carousels, Instagram posts, etc.). It analyzes real player statistics and betting odds to produce "TARGET" (bet on) and "AVOID" (skip) recommendations with supporting data.

**Key Point**: This folder is designed to be dropped into any Next.js/React codebase with zero configuration. All API keys are hardcoded - no environment variables or external auth needed.

---

## Folder Structure

```
slideshow-generator/
├── core/                    # API clients & authentication
│   ├── config.ts           # All API keys (hardcoded)
│   ├── statpal.ts          # NFL & MLB player stats
│   ├── api-sports.ts       # NBA & Soccer player stats
│   └── the-odds-api.ts     # Live betting odds
├── formats/                 # Content generation logic
│   └── target-avoid.ts     # TARGET/AVOID slideshow format
├── data/                    # Static reference data
│   └── teams.ts            # Team IDs, codes, mappings
├── types/                   # TypeScript interfaces
│   └── index.ts            # All type definitions
├── index.ts                # Main exports (single import point)
├── test.ts                 # Test script
├── README.md               # Usage documentation
├── ARCHITECTURE.md         # This file
├── package.json            # Dependencies
└── tsconfig.json           # TypeScript config
```

---

## The Two Layers

### Layer 1: Core (API Clients)

Located in `/core/`. These handle authentication and data fetching from external APIs.

| File | APIs | Sports | Purpose |
|------|------|--------|---------|
| `config.ts` | - | - | Centralized API keys and base URLs |
| `statpal.ts` | StatPal | NFL, MLB | Player passing/rushing/receiving stats |
| `api-sports.ts` | API-Sports | NBA, Soccer | Player points/rebounds/assists, goals/cards |
| `the-odds-api.ts` | TheOddsAPI | All | Live odds from DraftKings, FanDuel, etc. |

**Authentication**: All API keys are in `config.ts`:
```typescript
// config.ts - Keys are hardcoded, ready to use
export const config = {
  statpal: { apiKey: '39ac2518-...', baseUrl: '...' },
  apiSports: { apiKey: '77fea40d...', ... },
  theOddsApi: { apiKey: 'cffccdd0...', ... },
};
```

### Layer 2: Formats (Content Generators)

Located in `/formats/`. These transform raw API data into specific content formats.

| File | Format | Output |
|------|--------|--------|
| `target-avoid.ts` | TARGET/AVOID | Player recommendations with 3 bullet points each |

**Extensible**: Add new format files for different content types:
- `formats/best-bets.ts` - Daily best bets
- `formats/injury-report.ts` - Injury impact analysis
- `formats/line-movement.ts` - Sharp money alerts

---

## API Details

### StatPal (NFL/MLB)
- **Endpoint**: `https://statpal.io/api/v1`
- **Auth**: API key in query string
- **Critical**: Team codes must be **lowercase** (`phi`, `kc`, `chi`)
- **Returns**: Season stats for passing, rushing, receiving

### API-Sports (NBA/Soccer)
- **Endpoint**: `https://v2.nba.api-sports.io` and `https://v3.football.api-sports.io`
- **Auth**: `x-apisports-key` header
- **Uses**: Numeric team IDs (see `data/teams.ts`)
- **Returns**: Game-by-game stats, aggregated into averages

### TheOddsAPI (Odds)
- **Endpoint**: `https://api.the-odds-api.com/v4`
- **Auth**: API key in query string
- **Returns**: Live odds from multiple bookmakers (DraftKings, FanDuel, BetMGM, etc.)
- **Features**: Best line finder, odds comparison

---

## Data Flow

```
User Request (league, teams, format)
        │
        ▼
┌───────────────────────────────────────────┐
│  Format Module (e.g., target-avoid.ts)    │
│  - Determines which API clients to call   │
│  - Processes raw data into insights       │
│  - Generates formatted output             │
└───────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│  Core API Clients                         │
│  - statpal.ts → NFL/MLB stats             │
│  - api-sports.ts → NBA/Soccer stats       │
│  - the-odds-api.ts → Live odds            │
└───────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│  External APIs                            │
│  - StatPal (authenticated)                │
│  - API-Sports (authenticated)             │
│  - TheOddsAPI (authenticated)             │
└───────────────────────────────────────────┘
```

---

## Key Types

```typescript
// Player insight (TARGET or AVOID)
interface PlayerInsight {
  playerName: string;
  team: string;
  league: string;
  propType: string;        // 'receiving_yards', 'points', 'anytime_goal'
  verdict: 'TARGET' | 'AVOID';
  reasons: string[];       // 3 bullet points
  confidence: number;      // 0-100
}

// Full slideshow post
interface SlideshowPost {
  league: string;
  generatedAt: string;
  players: PlayerInsight[];
}

// Generation request
interface GenerateRequest {
  league: 'NFL' | 'NBA' | 'SOCCER';
  teams?: string[];        // Optional filter
  count?: number;          // How many players (default 4)
}
```

---

## Usage in Next.js

### Option 1: API Route
```typescript
// pages/api/slideshow.ts
import { generateTargetAvoid } from '@/lib/slideshow-generator';

export default async function handler(req, res) {
  const result = await generateTargetAvoid({
    league: req.body.league,
    teams: req.body.teams,
  });
  res.json(result);
}
```

### Option 2: Server Action
```typescript
// app/actions/slideshow.ts
'use server';
import { generateTargetAvoid } from '@/lib/slideshow-generator';

export async function generate(league: string) {
  return generateTargetAvoid({ league });
}
```

### Option 3: Direct Import
```typescript
import {
  getNFLPlayerStats,
  getNBAPlayerStats,
  getOddsComparison,
  SPORT_KEYS,
} from '@/lib/slideshow-generator';
```

---

## Adding New Formats

1. Create new file in `/formats/`:
```typescript
// formats/best-bets.ts
import { getNFLPlayerStats } from '../core/statpal';
import { getOddsComparison } from '../core/the-odds-api';

export async function generateBestBets(options) {
  // Fetch data from core clients
  // Process into your format
  // Return structured output
}
```

2. Export from `index.ts`:
```typescript
export { generateBestBets } from './formats/best-bets';
```

---

## Adding New Sports

1. Add team data to `data/teams.ts`
2. Add API client to `core/` (if new API needed)
3. Add sport handling to format files
4. Update types in `types/index.ts`

---

## Important Notes

1. **StatPal team codes are lowercase**: `phi`, `dal`, `kc` (not `PHI`)
2. **API-Sports uses numeric IDs**: Lakers = 17, not "LAL"
3. **All keys are hardcoded**: No `.env` files needed
4. **Web only**: This is for Next.js/React, not React Native
5. **TypeScript**: Full type safety throughout

---

## Dependencies

```json
{
  "axios": "^1.6.0",
  "typescript": "^5.0.0"
}
```

That's it. Just `npm install` and import.
