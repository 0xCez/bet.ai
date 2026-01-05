# Slideshow Generator

Generate TARGET/AVOID slideshow posts for player props across NFL, NBA, and Soccer.

**Built for Next.js/React web apps** - no React Native dependencies.

## Quick Start

```bash
# Install dependencies
npm install

# Run test
npm test

# Build for production
npm run build
```

## Structure

```
slideshow-generator/
├── core/
│   ├── config.ts        # API keys & configuration
│   ├── statpal.ts       # StatPal API client (NFL, MLB)
│   ├── api-sports.ts    # API-Sports client (NBA, Soccer)
│   └── the-odds-api.ts  # TheOddsAPI client (odds, lines)
├── formats/
│   └── target-avoid.ts  # TARGET/AVOID generation logic
├── data/
│   └── teams.ts         # Team data with IDs and codes
├── types/
│   └── index.ts         # TypeScript interfaces
├── index.ts             # Main entry point
└── test.ts              # Test script
```

## API Clients Included

### 1. StatPal (NFL, MLB)
Player stats for American football and baseball.

```typescript
import { getNFLPlayerStats } from './slideshow-generator';

const eagles = await getNFLPlayerStats('phi');
// Returns: { passing, rushing, receiving }
```

### 2. API-Sports (NBA, Soccer)
Player stats for basketball and football/soccer.

```typescript
import { getNBAPlayerStats, getSoccerPlayerStats } from './slideshow-generator';

const hawks = await getNBAPlayerStats(1); // Team ID
const manUtd = await getSoccerPlayerStats(33);
```

### 3. TheOddsAPI (Live Odds)
Real-time betting odds from multiple bookmakers.

```typescript
import { getOddsComparison, getSportOdds, SPORT_KEYS } from './slideshow-generator';

// Get odds for a specific matchup
const odds = await getOddsComparison(SPORT_KEYS.NFL, 'Eagles', 'Cowboys');

// Get all NFL odds
const allNFL = await getSportOdds(SPORT_KEYS.NFL);

// Available sport keys
SPORT_KEYS = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
  EPL: 'soccer_epl',
  LA_LIGA: 'soccer_spain_la_liga',
  CHAMPIONS_LEAGUE: 'soccer_uefa_champs_league',
  // ... more
}
```

## TARGET/AVOID Generator

### Basic Example

```typescript
import { generateTargetAvoid, formatSlideshowPost } from './slideshow-generator';

// Generate for a specific team
const result = await generateTargetAvoid({
  league: 'NFL',
  teams: ['phi'],  // Eagles
  count: 4,        // 2 TARGETs, 2 AVOIDs
});

console.log(formatSlideshowPost(result));
```

### Output Format

```
🎯 TARGET: DeVonta Smith

• 68.5 receiving yards/game - leads Eagles WRs
• 7.1 targets/game with 10 receptions over 20 yards
• Elite efficiency: 13.7 yards/reception, 79-yard long

---

🚫 AVOID: Jahan Dotson

• Only 17.6 yards/game - limited WR3 role
• 1.6 targets/game - barely involved in offense
• Inconsistent: 10 catches on 18 targets all season
```

## Team Codes

**NFL** (StatPal codes - lowercase):
- `phi` - Philadelphia Eagles
- `dal` - Dallas Cowboys
- `kc` - Kansas City Chiefs
- [See full list in data/teams.ts]

**NBA** (API-Sports IDs):
- `1` - Atlanta Hawks
- `17` - Los Angeles Lakers
- `2` - Boston Celtics
- [See full list in data/teams.ts]

**Soccer** (API-Sports IDs):
- `33` - Manchester United
- `40` - Liverpool
- `50` - Manchester City
- [See full list in data/teams.ts]

## Environment Variables

For production, set these in your `.env.local`:

```env
STATPAL_API_KEY=39ac2518-b037-4c2c-97af-8176590e886e
API_SPORTS_KEY=77fea40da4ce95b70120be298555b660
ODDS_API_KEY=cffccdd07d04d837bf5e98201938dbe0
```

## Prop Types Analyzed

### NFL
- Receiving Yards (WR/TE)
- Rushing Yards (RB)
- Passing Yards (QB)

### NBA
- Points
- Rebounds
- Assists

### Soccer
- Anytime Goal Scorer
- Player to be Booked (Yellow Card)

## Next.js Integration

### Option 1: API Route (Pages Router)

```typescript
// pages/api/slideshow.ts
import { generateTargetAvoid } from '@/lib/slideshow-generator';

export default async function handler(req, res) {
  const { league, teams } = req.body;

  const result = await generateTargetAvoid({
    league,
    teams,
    count: 4,
  });

  res.json(result);
}
```

### Option 2: Server Action (App Router)

```typescript
// app/actions/slideshow.ts
'use server';

import { generateTargetAvoid } from '@/lib/slideshow-generator';

export async function generateSlideshow(league: string, teams?: string[]) {
  const result = await generateTargetAvoid({
    league: league as 'NFL' | 'NBA' | 'SOCCER',
    teams,
    count: 4,
  });

  return result;
}
```

### Option 3: React Component

```tsx
// components/SlideshowGenerator.tsx
'use client';

import { useState } from 'react';
import { generateSlideshow } from '@/app/actions/slideshow';

export function SlideshowGenerator() {
  const [league, setLeague] = useState('NFL');
  const [result, setResult] = useState(null);

  const generate = async () => {
    const data = await generateSlideshow(league);
    setResult(data);
  };

  return (
    <div>
      <select value={league} onChange={(e) => setLeague(e.target.value)}>
        <option value="NFL">NFL</option>
        <option value="NBA">NBA</option>
        <option value="SOCCER">Soccer</option>
      </select>
      <button onClick={generate}>Generate</button>

      {result?.players.map((player, i) => (
        <div key={i} className={player.verdict === 'TARGET' ? 'bg-green-100' : 'bg-red-100'}>
          <h3>{player.verdict}: {player.playerName}</h3>
          <ul>
            {player.reasons.map((r, j) => <li key={j}>{r}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

## Getting Odds Data

```typescript
import { getOddsComparison, SPORT_KEYS } from '@/lib/slideshow-generator';

// Get full odds comparison for a matchup
const comparison = await getOddsComparison(SPORT_KEYS.NFL, 'Eagles', 'Bears');

// Result:
{
  homeTeam: 'Philadelphia Eagles',
  awayTeam: 'Chicago Bears',
  commenceTime: '2025-11-28T18:30:00Z',
  bestLines: [
    { type: 'moneyline', label: 'Best Home ML', team: 'Philadelphia Eagles', odds: 1.28, bookmaker: 'FanDuel' },
    { type: 'spread', label: 'Best Home Spread (-6.5)', odds: -108, point: -6.5, bookmaker: 'DraftKings' },
    // ...
  ],
  allBookmakers: [
    { name: 'DraftKings', homeML: 1.25, awayML: 3.50, homeSpread: { point: -6.5, odds: -110 }, ... },
    { name: 'FanDuel', homeML: 1.28, awayML: 3.40, ... },
    // ...
  ]
}
```

## License

MIT
