# ML Props Integration Guide (Web App)

## Quick Start

The ML props prediction system is deployed and ready to use. Just make HTTP requests to the cloud function.

---

## Endpoint

```
POST https://getmlplayerpropsv2-ifivis3hsq-uc.a.run.app
```

**No API keys needed** - authentication is handled by the cloud function.

---

## Request Format

```javascript
const response = await fetch('https://getmlplayerpropsv2-ifivis3hsq-uc.a.run.app', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    team1: 'Orlando Magic',
    team2: 'Milwaukee Bucks',
    sport: 'NBA'
  })
});

const data = await response.json();
```

### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `team1` | string | Yes | First team name (e.g., "Lakers", "Orlando Magic") |
| `team2` | string | Yes | Second team name (e.g., "Warriors", "Milwaukee Bucks") |
| `sport` | string | Yes | Must be "NBA" |
| `gameDate` | string | No | ISO date (defaults to next available game) |

---

## Response Format

```typescript
interface MLPropsResponse {
  success: boolean;
  sport: 'NBA';
  eventId: string;
  teams: {
    home: string;
    away: string;
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
  playerName: string;
  team: string;
  statType: string; // "points", "rebounds", "assists", "points+rebounds+assists", etc.
  line: number;
  prediction: 'Over' | 'Under';
  probabilityOver: number;    // 0-1 decimal
  probabilityUnder: number;   // 0-1 decimal
  confidence: number;         // 0-1 decimal (higher = more confident)
  confidencePercent: string;  // "39.4"
  confidenceTier: 'high' | 'medium' | 'low';
  oddsOver: number;           // American odds (-110, +120, etc.)
  oddsUnder: number;
  gamesUsed: number;          // Number of games used for feature calculation
  playerStats: {
    pointsPerGame: number;
    reboundsPerGame: number;
    assistsPerGame: number;
    stealsPerGame: number;
    blocksPerGame: number;
    fgPct: number;            // Field goal % (46.3, not 0.463)
    fg3Pct: number;           // 3-point %
    minutesPerGame: number;
  };
}
```

---

## Example Response

See [ml-props-example-response.json](./ml-props-example-response.json) for full real response.

**Summary:**
```json
{
  "success": true,
  "sport": "NBA",
  "teams": {
    "home": "Orlando Magic",
    "away": "Milwaukee Bucks"
  },
  "gameTime": "2026-02-12T00:00:00.000Z",
  "totalPropsAvailable": 59,
  "propsAnalyzed": 58,
  "highConfidenceCount": 10,
  "mediumConfidenceCount": 0,
  "topProps": [
    {
      "playerName": "Franz Wagner",
      "team": "Orlando Magic",
      "statType": "points+rebounds+assists",
      "line": 20.8,
      "prediction": "Under",
      "probabilityOver": 0.106,
      "probabilityUnder": 0.894,
      "confidence": 0.394,
      "confidencePercent": "39.4",
      "confidenceTier": "high",
      "oddsOver": -110,
      "oddsUnder": -105,
      "gamesUsed": 15,
      "playerStats": {
        "pointsPerGame": 19.2,
        "reboundsPerGame": 5.3,
        "assistsPerGame": 3.1,
        "stealsPerGame": 1,
        "blocksPerGame": 0.2,
        "fgPct": 51.4,
        "fg3Pct": 41.4,
        "minutesPerGame": 27
      }
    }
    // ... 9 more props
  ]
}
```

---

## React/Next.js Integration

### Basic Usage

```typescript
// hooks/useMLProps.ts
import { useState } from 'react';

interface MLPropsParams {
  team1: string;
  team2: string;
}

export function useMLProps() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMLProps = async ({ team1, team2 }: MLPropsParams) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('https://getmlplayerpropsv2-ifivis3hsq-uc.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team1, team2, sport: 'NBA' })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { fetchMLProps, loading, error };
}
```

### Component Example

```typescript
// components/MLPropsCard.tsx
import { useMLProps } from '@/hooks/useMLProps';

export function MLPropsCard({ team1, team2 }: { team1: string; team2: string }) {
  const { fetchMLProps, loading, error } = useMLProps();
  const [props, setProps] = useState<any>(null);

  useEffect(() => {
    fetchMLProps({ team1, team2 }).then(setProps);
  }, [team1, team2]);

  if (loading) return <div>Loading ML predictions...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!props) return null;

  return (
    <div>
      <h2>ML Predictions: {props.teams.home} vs {props.teams.away}</h2>
      <p>High Confidence Props: {props.highConfidenceCount}</p>

      {props.topProps.map((prop: any, i: number) => (
        <div key={i} className="prop-card">
          <h3>{prop.playerName} - {prop.statType}</h3>
          <p>Line: {prop.line}</p>
          <p>
            <strong>Prediction: {prop.prediction}</strong>
            ({prop.confidencePercent}% confidence)
          </p>
          <p>
            Probability: {(prop.probabilityOver * 100).toFixed(1)}% Over /
            {(prop.probabilityUnder * 100).toFixed(1)}% Under
          </p>
          <div className="stats">
            {prop.playerStats.pointsPerGame} PPG |
            {prop.playerStats.reboundsPerGame} RPG |
            {prop.playerStats.assistsPerGame} APG
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Confidence Tiers

Use `confidenceTier` to filter/sort props:

| Tier | Confidence | Win Rate | Usage |
|------|-----------|----------|-------|
| **high** | > 15% (65%+) | ~70% | Show prominently, recommend betting |
| **medium** | 10-15% (60-65%) | ~62% | Show with caution label |
| **low** | < 10% (50-60%) | ~52% | Not returned by default |

**Note:** Only `high` and `medium` tier props are returned by the API.

---

## Error Handling

### Common Errors

**No matching game:**
```json
{ "error": "No matching game found" }
```
→ Game not available or teams names don't match

**Rate limit (rare with key rotation):**
```json
{ "error": "Internal server error", "message": "Request failed with status code 429" }
```
→ All SGO API keys exhausted (contact support for more keys)

**Internal error:**
```json
{ "error": "Internal server error", "message": "..." }
```
→ Check logs or try again

---

## Performance

- **Average response time:** 6-15 seconds
  - 2-3s: Fetch betting odds from SGO
  - 2-5s: Resolve player IDs & fetch game logs
  - 2-5s: Calculate 88 features per prop
  - 1-2s: Vertex AI predictions (batched)

- **Caching:** Game logs cached for 1 hour (faster subsequent requests)
- **Timeout:** 300 seconds (5 minutes)

---

## Rate Limits

The system uses **automatic key rotation** with 2 SGO API keys:
- Key 1: 2,500 entities/month
- Key 2: 2,500 entities/month
- **Total:** 5,000 game fetches per month

When one key hits limit, it automatically switches to the next.

---

## ML Model Details

- **Model:** CatBoost (Gradient Boosting)
- **Accuracy:** 64.9%
- **Brier Score:** 0.2308 (calibration)
- **ROI:** 41.1% (following high confidence bets)
- **Features:** 88 total
  - 12 Last 3 games stats
  - 15 Last 10 games stats
  - 21 Betting line features
  - 40 Advanced/composite metrics
- **Deployed on:** Google Vertex AI (us-central1)

---

## Debugging

Check cloud function logs:
```bash
gcloud functions logs read getMLPlayerPropsV2 --gen2 --region=us-central1 --limit=20
```

---

## Support

For issues or questions, contact the backend team or check:
- [ML_INTEGRATION_BLUEPRINT.md](./ML_INTEGRATION_BLUEPRINT.md) - Full technical spec
- [ml-props-example-response.json](./ml-props-example-response.json) - Real response example
