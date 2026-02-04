# NBA Props Prediction API - Complete Integration Guide

## Table of Contents
1. [API Overview](#api-overview)
2. [Complete API Specification](#complete-api-specification)
3. [Authentication & Service Account Setup](#authentication--service-account-setup)
4. [Request Format & All Required Features](#request-format--all-required-features)
5. [Response Format & Field Descriptions](#response-format--field-descriptions)
6. [Complete Integration Examples](#complete-integration-examples)
7. [Error Handling & Common Issues](#error-handling--common-issues)
8. [Testing & Validation](#testing--validation)
9. [Production Deployment Checklist](#production-deployment-checklist)
10. [Model Information & Performance](#model-information--performance)

---

## API Overview

### What This API Does
This API predicts whether NBA player props (points, rebounds, assists, etc.) will go OVER or UNDER the betting line using a trained CatBoost machine learning model deployed on Google Cloud Vertex AI.

### Model Performance
- **Accuracy:** 64.9% on test data
- **Brier Score:** 0.2308 (calibration metric, lower is better)
- **ROI:** 41.1% when following the betting strategy (only bet when confidence > 10%)
- **Training Data:** Historical NBA player performance and betting odds data

### Key Concepts
- **Over/Under:** Binary prediction - will the player's stat exceed the line (Over) or stay below (Under)
- **Confidence:** How certain the model is = `abs(probability - 0.5)`. Higher confidence = stronger prediction
- **Betting Strategy:** Only bet when confidence > 10% (i.e., probability > 60% OR < 40%)
- **Betting Value:** "high" (>15% confidence), "medium" (10-15%), "low" (<10%)

---

## Complete API Specification

### Endpoint URL
```
POST https://us-central1-aiplatform.googleapis.com/v1/projects/133991312998/locations/us-central1/endpoints/4819237529867780096:predict
```

**IMPORTANT:** This URL is the exact, complete endpoint. Do not modify it.

### Components Explained
- `us-central1`: Google Cloud region where the model is deployed
- `133991312998`: Google Cloud project number (NOT project ID "betai-f9176")
- `4819237529867780096`: Vertex AI endpoint ID
- `:predict`: Vertex AI's prediction operation

### Request Method
`POST` only. GET requests will fail.

### Required Headers
```http
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json
```

Where `{ACCESS_TOKEN}` is a Google Cloud OAuth 2.0 token obtained via Service Account authentication (see section below).

### Response Format
JSON with HTTP status codes:
- `200`: Success - prediction returned
- `400`: Bad request - missing/invalid features
- `401`: Unauthorized - invalid or expired token
- `403`: Forbidden - insufficient permissions
- `500`: Internal server error - model error

---

## Authentication & Service Account Setup

### Why Service Account?
A Service Account is a special Google Cloud account that applications use to authenticate without user interaction. Your app will use this to call the API automatically.

### Step-by-Step Service Account Creation

**1. Create the Service Account**

Run this command (requires gcloud CLI with owner/editor permissions):

```bash
gcloud iam service-accounts create nba-props-predictor \
  --display-name="NBA Props Predictor Service Account" \
  --project=betai-f9176
```

This creates a service account with email: `nba-props-predictor@betai-f9176.iam.gserviceaccount.com`

**2. Grant Prediction Permissions**

```bash
gcloud projects add-iam-policy-binding betai-f9176 \
  --member="serviceAccount:nba-props-predictor@betai-f9176.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

This grants the service account permission to call Vertex AI endpoints.

**3. Create and Download Key File**

```bash
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=nba-props-predictor@betai-f9176.iam.gserviceaccount.com
```

This creates a JSON file `service-account-key.json` containing credentials. **This file is sensitive - never commit it to git or expose it publicly.**

**4. Key File Structure**

The `service-account-key.json` file looks like this:

```json
{
  "type": "service_account",
  "project_id": "betai-f9176",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "nba-props-predictor@betai-f9176.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

---

## Request Format & All Required Features

### Request Body Structure

```json
{
  "instances": [
    {
      // 88 features go here
    }
  ]
}
```

- `instances`: Array of prediction requests (can send multiple at once)
- Each instance must contain ALL 88 features (no exceptions)
- Missing features will cause 400 error

### Complete Feature List (88 Features)

The model requires exactly 88 features. Here's the complete list with explanations:

#### 1. Categorical Features (5)

| Feature | Type | Description | Example Values |
|---------|------|-------------|----------------|
| `prop_type` | string | Type of prop bet | "points", "rebounds", "assists", "points_rebounds", "points_assists", "rebounds_assists", "points_rebounds_assists" |
| `home_team` | string | Home team 3-letter code | "LAL", "GSW", "BOS", "MIA", "CHI", etc. |
| `away_team` | string | Away team 3-letter code | Same as home_team |
| `bookmaker` | string | Bookmaker name | "DraftKings", "FanDuel", "BetMGM", "Caesars", etc. |
| `SEASON` | string | NBA season | "2025-26", "2024-25", etc. |

#### 2. Temporal Features (3)

| Feature | Type | Description | Example |
|---------|------|-------------|---------|
| `year` | int | Year of game | 2026 |
| `month` | int | Month of game (1-12) | 2 |
| `day_of_week` | int | Day of week (0=Monday, 6=Sunday) | 3 |

#### 3. Last 3 Games Stats (12 features - prefix L3_)

Player's average stats over last 3 games:

| Feature | Type | Description |
|---------|------|-------------|
| `L3_PTS` | float | Average points |
| `L3_REB` | float | Average rebounds |
| `L3_AST` | float | Average assists |
| `L3_MIN` | float | Average minutes played |
| `L3_FG_PCT` | float | Field goal percentage (0-1) |
| `L3_FG3M` | float | Average 3-pointers made |
| `L3_FG3_PCT` | float | 3-point percentage (0-1) |
| `L3_STL` | float | Average steals |
| `L3_BLK` | float | Average blocks |
| `L3_TOV` | float | Average turnovers |
| `L3_FGM` | float | Average field goals made |
| `L3_FGA` | float | Average field goal attempts |

#### 4. Last 10 Games Stats (15 features - prefix L10_)

Player's average and standard deviation over last 10 games:

| Feature | Type | Description |
|---------|------|-------------|
| `L10_PTS` | float | Average points |
| `L10_REB` | float | Average rebounds |
| `L10_AST` | float | Average assists |
| `L10_MIN` | float | Average minutes |
| `L10_FG_PCT` | float | Field goal percentage |
| `L10_FG3M` | float | Average 3-pointers made |
| `L10_FG3_PCT` | float | 3-point percentage |
| `L10_STL` | float | Average steals |
| `L10_BLK` | float | Average blocks |
| `L10_TOV` | float | Average turnovers |
| `L10_FGM` | float | Field goals made |
| `L10_FGA` | float | Field goal attempts |
| `L10_PTS_STD` | float | Standard deviation of points (measures consistency) |
| `L10_REB_STD` | float | Standard deviation of rebounds |
| `L10_AST_STD` | float | Standard deviation of assists |

#### 5. Game Context Features (6)

| Feature | Type | Description | Values |
|---------|------|-------------|--------|
| `HOME_AWAY` | int | Is player's team home? | 1 = home, 0 = away |
| `DAYS_REST` | int | Days since last game | 0-7+ |
| `BACK_TO_BACK` | int | Back-to-back game? | 1 = yes, 0 = no |
| `GAMES_IN_LAST_7` | int | Games played in last 7 days | 0-7 |
| `MINUTES_TREND` | float | Change in minutes (L3 avg - L10 avg) | -10 to +10 typically |

#### 6. Advanced Performance Metrics (11)

| Feature | Type | Description | Formula/Meaning |
|---------|------|-------------|-----------------|
| `SCORING_EFFICIENCY` | float | Points per field goal attempt | L3_PTS / L3_FGA |
| `ASSIST_TO_RATIO` | float | Assists per turnover | L3_AST / L3_TOV |
| `REBOUND_RATE` | float | Rebounds per minute | L3_REB / L3_MIN |
| `USAGE_RATE` | float | Player's offensive involvement | L3_FGA / L3_MIN |
| `TREND_PTS` | float | Points trend (L3 - L10) | Positive = improving |
| `TREND_REB` | float | Rebounds trend (L3 - L10) | Positive = improving |
| `TREND_AST` | float | Assists trend (L3 - L10) | Positive = improving |
| `CONSISTENCY_PTS` | float | Points consistency | L10_PTS_STD / L10_PTS |
| `CONSISTENCY_REB` | float | Rebounds consistency | L10_REB_STD / L10_REB |
| `CONSISTENCY_AST` | float | Assists consistency | L10_AST_STD / L10_AST |
| `ACCELERATION_PTS` | float | Rate of points change | (L3_PTS - L10_PTS) / DAYS_REST |
| `EFFICIENCY_STABLE` | int | Is shooting efficiency stable? | 1 if abs(L3_FG_PCT - L10_FG_PCT) < 0.05, else 0 |

#### 7. Interaction Features (6)

These capture relationships between features:

| Feature | Type | Description |
|---------|------|-------------|
| `L3_PTS_x_HOME` | float | L3_PTS * HOME_AWAY (points at home) |
| `L3_REB_x_HOME` | float | L3_REB * HOME_AWAY |
| `L3_AST_x_HOME` | float | L3_AST * HOME_AWAY |
| `L3_MIN_x_B2B` | float | L3_MIN * BACK_TO_BACK (minutes on B2B) |
| `L3_PTS_x_REST` | float | L3_PTS * DAYS_REST |
| `USAGE_x_EFFICIENCY` | float | USAGE_RATE * SCORING_EFFICIENCY |

#### 8. Composite Metrics (7)

| Feature | Type | Description |
|---------|------|-------------|
| `LOAD_INTENSITY` | float | GAMES_IN_LAST_7 * L10_MIN / 7 (workload) |
| `SHOOTING_VOLUME` | float | L3_FGA (shot attempts) |
| `REBOUND_INTENSITY` | float | L3_REB * REBOUND_RATE |
| `PLAYMAKING_EFFICIENCY` | float | L3_AST * ASSIST_TO_RATIO |
| `THREE_POINT_THREAT` | float | L3_FG3M * L3_FG3_PCT |
| `DEFENSIVE_IMPACT` | float | L3_STL + L3_BLK + 0.5 |
| `PTS_VOLATILITY` | float | L10_PTS_STD / L10_PTS (consistency) |
| `MINUTES_STABILITY` | float | L3_MIN / L10_MIN (playing time trend) |

#### 9. Ratio Features (2)

| Feature | Type | Description |
|---------|------|-------------|
| `L3_vs_L10_PTS_RATIO` | float | L3_PTS / L10_PTS |
| `L3_vs_L10_REB_RATIO` | float | L3_REB / L10_REB |

#### 10. Betting Line Features (21)

| Feature | Type | Description |
|---------|------|-------------|
| `line` | float | The betting line value (e.g., 28.5 points) |
| `odds_over` | int | American odds for Over (e.g., -110) |
| `odds_under` | int | American odds for Under (e.g., -110) |
| `implied_prob_over` | float | Market probability for Over (0-1) |
| `implied_prob_under` | float | Market probability for Under (0-1) |
| `LINE_VALUE` | float | How favorable the line is: (L3_PTS - line) / line |
| `ODDS_EDGE` | float | Difference between market probs: implied_prob_over - implied_prob_under |
| `odds_spread` | int | Difference in odds: odds_over - odds_under |
| `market_confidence` | float | abs(implied_prob_over - 0.5) (market certainty) |
| `L3_PTS_vs_LINE` | float | L3_PTS - line |
| `L3_REB_vs_LINE` | float | L3_REB - line |
| `L3_AST_vs_LINE` | float | L3_AST - line |
| `LINE_DIFFICULTY_PTS` | float | line / L10_PTS (how hard to beat) |
| `LINE_DIFFICULTY_REB` | float | line / L10_REB |
| `LINE_DIFFICULTY_AST` | float | line / L10_AST |
| `IMPLIED_PROB_OVER` | float | Same as implied_prob_over (duplicate) |
| `LINE_vs_AVG_PTS` | float | line - L10_PTS |
| `LINE_vs_AVG_REB` | float | line - L10_REB |
| `L3_vs_market` | float | (L3_PTS - line) * implied_prob_over |
| `L10_vs_market` | float | (L10_PTS - line) * implied_prob_over |

### Complete Example Request

```json
{
  "instances": [
    {
      "prop_type": "points_rebounds",
      "home_team": "LAL",
      "away_team": "GSW",
      "bookmaker": "DraftKings",
      "SEASON": "2025-26",
      "year": 2026,
      "month": 2,
      "day_of_week": 3,
      "L3_PTS": 26.3,
      "L3_REB": 7.2,
      "L3_AST": 8.1,
      "L3_MIN": 35.0,
      "L3_FG_PCT": 0.48,
      "L3_FG3M": 2.1,
      "L3_FG3_PCT": 0.35,
      "L3_STL": 1.2,
      "L3_BLK": 0.5,
      "L3_TOV": 3.2,
      "L3_FGM": 9.5,
      "L3_FGA": 19.8,
      "L10_PTS": 25.8,
      "L10_PTS_STD": 3.2,
      "L10_REB": 6.9,
      "L10_REB_STD": 1.5,
      "L10_AST": 7.8,
      "L10_AST_STD": 2.1,
      "L10_MIN": 34.5,
      "L10_FG_PCT": 0.47,
      "L10_FG3M": 2.0,
      "L10_FG3_PCT": 0.34,
      "L10_STL": 1.1,
      "L10_BLK": 0.6,
      "L10_TOV": 3.1,
      "L10_FGM": 9.2,
      "L10_FGA": 19.6,
      "HOME_AWAY": 1,
      "DAYS_REST": 2,
      "BACK_TO_BACK": 0,
      "GAMES_IN_LAST_7": 3,
      "MINUTES_TREND": 0.5,
      "SCORING_EFFICIENCY": 1.32,
      "ASSIST_TO_RATIO": 2.55,
      "REBOUND_RATE": 0.21,
      "USAGE_RATE": 0.28,
      "TREND_PTS": 0.5,
      "TREND_REB": 0.3,
      "TREND_AST": 0.3,
      "CONSISTENCY_PTS": 0.12,
      "CONSISTENCY_REB": 0.22,
      "CONSISTENCY_AST": 0.27,
      "ACCELERATION_PTS": 0.05,
      "EFFICIENCY_STABLE": 1,
      "L3_PTS_x_HOME": 26.3,
      "L3_REB_x_HOME": 7.2,
      "L3_AST_x_HOME": 8.1,
      "L3_MIN_x_B2B": 0,
      "L3_PTS_x_REST": 52.6,
      "USAGE_x_EFFICIENCY": 0.37,
      "LOAD_INTENSITY": 12.25,
      "SHOOTING_VOLUME": 19.8,
      "REBOUND_INTENSITY": 2.52,
      "PLAYMAKING_EFFICIENCY": 20.65,
      "THREE_POINT_THREAT": 0.74,
      "DEFENSIVE_IMPACT": 1.95,
      "L3_vs_L10_PTS_RATIO": 1.02,
      "L3_vs_L10_REB_RATIO": 1.04,
      "PTS_VOLATILITY": 0.124,
      "MINUTES_STABILITY": 0.97,
      "line": 28.5,
      "odds_over": -110,
      "odds_under": -110,
      "implied_prob_over": 0.52,
      "LINE_VALUE": 0.0,
      "L3_PTS_vs_LINE": -2.2,
      "L3_REB_vs_LINE": -21.3,
      "L3_AST_vs_LINE": -20.4,
      "LINE_DIFFICULTY_PTS": 1.08,
      "LINE_DIFFICULTY_REB": 3.96,
      "LINE_DIFFICULTY_AST": 3.52,
      "IMPLIED_PROB_OVER": 0.52,
      "ODDS_EDGE": 0.0,
      "LINE_vs_AVG_PTS": 2.7,
      "LINE_vs_AVG_REB": 21.6,
      "implied_prob_under": 0.48,
      "odds_spread": 0,
      "market_confidence": 0.04,
      "L3_vs_market": 0.0,
      "L10_vs_market": 0.0
    }
  ]
}
```

---

## Response Format & Field Descriptions

### Success Response Structure (HTTP 200)

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

### Field Descriptions

#### Prediction Fields (in `predictions` array)

| Field | Type | Description | Example | How to Use |
|-------|------|-------------|---------|------------|
| `prediction` | string | Model's recommendation | "Over" or "Under" | Display this to user as the bet recommendation |
| `probability_over` | float | Probability of Over outcome | 0.787 = 78.7% | Show as percentage: `(value * 100).toFixed(1) + '%'` |
| `probability_under` | float | Probability of Under outcome | 0.213 = 21.3% | Always equals `1 - probability_over` |
| `confidence` | float | Model confidence level | 0.287 = 28.7% | `abs(probability_over - 0.5)`. Higher = more certain |
| `should_bet` | boolean | Betting recommendation | true/false | If true, model recommends betting. If false, skip this bet |
| `betting_value` | string | Value rating | "high", "medium", "low" | Display confidence tier to user |

#### Metadata Fields

| Field | Description |
|-------|-------------|
| `deployedModelId` | ID of the deployed model instance (for debugging) |
| `model` | Full model resource path |
| `modelDisplayName` | Human-readable model name |
| `modelVersionId` | Model version number |

### Betting Strategy Logic

```
Step 1: Calculate confidence
  confidence = abs(probability_over - 0.5)

Step 2: Determine if should bet
  should_bet = confidence > 0.10

  Explanation:
  - If probability_over = 0.65 → confidence = 0.15 → should_bet = true (bet OVER)
  - If probability_over = 0.35 → confidence = 0.15 → should_bet = true (bet UNDER)
  - If probability_over = 0.55 → confidence = 0.05 → should_bet = false (don't bet)

Step 3: Determine betting value tier
  if confidence > 0.15:
    betting_value = "high"    # Strong recommendation (65%+ or 35%-)
  elif confidence > 0.10:
    betting_value = "medium"  # Moderate recommendation (60-65% or 35-40%)
  else:
    betting_value = "low"     # Weak, don't bet (50-60% or 40-50%)
```

### Example Interpretations

**Example 1: Strong Over**
```json
{
  "prediction": "Over",
  "probability_over": 0.72,
  "probability_under": 0.28,
  "confidence": 0.22,
  "should_bet": true,
  "betting_value": "high"
}
```
Interpretation: 72% chance of Over. Confidence 22% (strong). Recommend betting Over with high value.

**Example 2: Don't Bet**
```json
{
  "prediction": "Under",
  "probability_over": 0.48,
  "probability_under": 0.52,
  "confidence": 0.02,
  "should_bet": false,
  "betting_value": "low"
}
```
Interpretation: 52% chance of Under. Confidence only 2% (very weak). Do NOT bet - too close to 50/50.

**Example 3: Medium Under**
```json
{
  "prediction": "Under",
  "probability_over": 0.38,
  "probability_under": 0.62,
  "confidence": 0.12,
  "should_bet": true,
  "betting_value": "medium"
}
```
Interpretation: 62% chance of Under. Confidence 12% (moderate). Recommend betting Under with medium value.

---

## Complete Integration Examples

### Python Implementation

**File: `nba_predictor.py`**

```python
#!/usr/bin/env python3
"""
NBA Props Prediction API Client
Complete implementation with error handling
"""

from google.oauth2 import service_account
from google.auth.transport.requests import Request
import requests
import json
from typing import Dict, List, Optional

class NBAPropsPredictor:
    """Client for NBA Props Prediction API on Vertex AI"""

    def __init__(self, service_account_file: str):
        """
        Initialize predictor with service account credentials

        Args:
            service_account_file: Path to service-account-key.json
        """
        self.endpoint_url = (
            "https://us-central1-aiplatform.googleapis.com/v1/"
            "projects/133991312998/locations/us-central1/"
            "endpoints/4819237529867780096:predict"
        )

        # Load credentials
        self.credentials = service_account.Credentials.from_service_account_file(
            service_account_file,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )

        # Get initial token
        self.credentials.refresh(Request())
        self.access_token = self.credentials.token

    def _refresh_token_if_needed(self):
        """Refresh access token if expired"""
        if not self.credentials.valid:
            self.credentials.refresh(Request())
            self.access_token = self.credentials.token

    def predict(self, features: Dict) -> Dict:
        """
        Get prediction for a single set of features

        Args:
            features: Dictionary with all 88 required features

        Returns:
            Prediction result dictionary

        Raises:
            ValueError: If features are missing or invalid
            requests.HTTPError: If API call fails
        """
        # Refresh token if needed
        self._refresh_token_if_needed()

        # Prepare request
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "instances": [features]
        }

        # Make request
        response = requests.post(
            self.endpoint_url,
            headers=headers,
            json=payload,
            timeout=30
        )

        # Handle errors
        if response.status_code != 200:
            error_msg = f"API Error {response.status_code}: {response.text}"
            raise requests.HTTPError(error_msg)

        # Parse response
        result = response.json()

        # Return first prediction (we sent one instance)
        return result['predictions'][0]

    def predict_batch(self, features_list: List[Dict]) -> List[Dict]:
        """
        Get predictions for multiple sets of features

        Args:
            features_list: List of feature dictionaries

        Returns:
            List of prediction results
        """
        self._refresh_token_if_needed()

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "instances": features_list
        }

        response = requests.post(
            self.endpoint_url,
            headers=headers,
            json=payload,
            timeout=30
        )

        if response.status_code != 200:
            error_msg = f"API Error {response.status_code}: {response.text}"
            raise requests.HTTPError(error_msg)

        result = response.json()
        return result['predictions']

    def format_prediction(self, prediction: Dict) -> str:
        """
        Format prediction for display

        Args:
            prediction: Prediction dictionary from API

        Returns:
            Formatted string for display
        """
        bet_dir = prediction['prediction']
        prob_over = prediction['probability_over'] * 100
        prob_under = prediction['probability_under'] * 100
        confidence = prediction['confidence'] * 100
        should_bet = prediction['should_bet']
        value = prediction['betting_value'].upper()

        output = f"""
Prediction: {bet_dir}
Probability Over: {prob_over:.1f}%
Probability Under: {prob_under:.1f}%
Confidence: {confidence:.1f}%
Should Bet: {'YES' if should_bet else 'NO'}
Betting Value: {value}
"""
        return output.strip()


# Example usage
if __name__ == "__main__":
    # Initialize predictor
    predictor = NBAPropsPredictor("service-account-key.json")

    # Example features (all 88 required)
    features = {
        "prop_type": "points_rebounds",
        "home_team": "LAL",
        "away_team": "GSW",
        "bookmaker": "DraftKings",
        "SEASON": "2025-26",
        "year": 2026,
        "month": 2,
        "day_of_week": 3,
        "L3_PTS": 26.3,
        "L3_REB": 7.2,
        "L3_AST": 8.1,
        "L3_MIN": 35.0,
        "L3_FG_PCT": 0.48,
        "L3_FG3M": 2.1,
        "L3_FG3_PCT": 0.35,
        "L3_STL": 1.2,
        "L3_BLK": 0.5,
        "L3_TOV": 3.2,
        "L3_FGM": 9.5,
        "L3_FGA": 19.8,
        "L10_PTS": 25.8,
        "L10_PTS_STD": 3.2,
        "L10_REB": 6.9,
        "L10_REB_STD": 1.5,
        "L10_AST": 7.8,
        "L10_AST_STD": 2.1,
        "L10_MIN": 34.5,
        "L10_FG_PCT": 0.47,
        "L10_FG3M": 2.0,
        "L10_FG3_PCT": 0.34,
        "L10_STL": 1.1,
        "L10_BLK": 0.6,
        "L10_TOV": 3.1,
        "L10_FGM": 9.2,
        "L10_FGA": 19.6,
        "HOME_AWAY": 1,
        "DAYS_REST": 2,
        "BACK_TO_BACK": 0,
        "GAMES_IN_LAST_7": 3,
        "MINUTES_TREND": 0.5,
        "SCORING_EFFICIENCY": 1.32,
        "ASSIST_TO_RATIO": 2.55,
        "REBOUND_RATE": 0.21,
        "USAGE_RATE": 0.28,
        "TREND_PTS": 0.5,
        "TREND_REB": 0.3,
        "TREND_AST": 0.3,
        "CONSISTENCY_PTS": 0.12,
        "CONSISTENCY_REB": 0.22,
        "CONSISTENCY_AST": 0.27,
        "ACCELERATION_PTS": 0.05,
        "EFFICIENCY_STABLE": 1,
        "L3_PTS_x_HOME": 26.3,
        "L3_REB_x_HOME": 7.2,
        "L3_AST_x_HOME": 8.1,
        "L3_MIN_x_B2B": 0,
        "L3_PTS_x_REST": 52.6,
        "USAGE_x_EFFICIENCY": 0.37,
        "LOAD_INTENSITY": 12.25,
        "SHOOTING_VOLUME": 19.8,
        "REBOUND_INTENSITY": 2.52,
        "PLAYMAKING_EFFICIENCY": 20.65,
        "THREE_POINT_THREAT": 0.74,
        "DEFENSIVE_IMPACT": 1.95,
        "L3_vs_L10_PTS_RATIO": 1.02,
        "L3_vs_L10_REB_RATIO": 1.04,
        "PTS_VOLATILITY": 0.124,
        "MINUTES_STABILITY": 0.97,
        "line": 28.5,
        "odds_over": -110,
        "odds_under": -110,
        "implied_prob_over": 0.52,
        "LINE_VALUE": 0.0,
        "L3_PTS_vs_LINE": -2.2,
        "L3_REB_vs_LINE": -21.3,
        "L3_AST_vs_LINE": -20.4,
        "LINE_DIFFICULTY_PTS": 1.08,
        "LINE_DIFFICULTY_REB": 3.96,
        "LINE_DIFFICULTY_AST": 3.52,
        "IMPLIED_PROB_OVER": 0.52,
        "ODDS_EDGE": 0.0,
        "LINE_vs_AVG_PTS": 2.7,
        "LINE_vs_AVG_REB": 21.6,
        "implied_prob_under": 0.48,
        "odds_spread": 0,
        "market_confidence": 0.04,
        "L3_vs_market": 0.0,
        "L10_vs_market": 0.0
    }

    # Get prediction
    try:
        prediction = predictor.predict(features)
        print(predictor.format_prediction(prediction))

        # Check if should bet
        if prediction['should_bet']:
            print(f"\n✅ RECOMMENDATION: Bet {prediction['prediction']}")
        else:
            print("\n❌ SKIP: Confidence too low")

    except Exception as e:
        print(f"Error: {e}")
```

**Required Python packages:**
```bash
pip install google-auth google-auth-httplib2 requests
```

### Node.js Implementation

**File: `nbaPredictor.js`**

```javascript
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');

class NBAPropsPredictor {
  /**
   * Initialize predictor with service account
   * @param {string} serviceAccountFile - Path to service-account-key.json
   */
  constructor(serviceAccountFile) {
    this.endpointUrl =
      'https://us-central1-aiplatform.googleapis.com/v1/' +
      'projects/133991312998/locations/us-central1/' +
      'endpoints/4819237529867780096:predict';

    this.auth = new GoogleAuth({
      keyFile: serviceAccountFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
  }

  /**
   * Get access token
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();
    return accessToken.token;
  }

  /**
   * Get prediction for single set of features
   * @param {Object} features - Object with all 88 required features
   * @returns {Promise<Object>} Prediction result
   */
  async predict(features) {
    const accessToken = await this.getAccessToken();

    try {
      const response = await axios.post(
        this.endpointUrl,
        {
          instances: [features]
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.predictions[0];
    } catch (error) {
      if (error.response) {
        throw new Error(
          `API Error ${error.response.status}: ${JSON.stringify(error.response.data)}`
        );
      }
      throw error;
    }
  }

  /**
   * Get predictions for multiple feature sets
   * @param {Array<Object>} featuresList - Array of feature objects
   * @returns {Promise<Array<Object>>} Array of predictions
   */
  async predictBatch(featuresList) {
    const accessToken = await this.getAccessToken();

    const response = await axios.post(
      this.endpointUrl,
      {
        instances: featuresList
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.predictions;
  }

  /**
   * Format prediction for display
   * @param {Object} prediction - Prediction object from API
   * @returns {string} Formatted string
   */
  formatPrediction(prediction) {
    const betDir = prediction.prediction;
    const probOver = (prediction.probability_over * 100).toFixed(1);
    const probUnder = (prediction.probability_under * 100).toFixed(1);
    const confidence = (prediction.confidence * 100).toFixed(1);
    const shouldBet = prediction.should_bet ? 'YES' : 'NO';
    const value = prediction.betting_value.toUpperCase();

    return `
Prediction: ${betDir}
Probability Over: ${probOver}%
Probability Under: ${probUnder}%
Confidence: ${confidence}%
Should Bet: ${shouldBet}
Betting Value: ${value}
    `.trim();
  }
}

// Example usage
async function main() {
  const predictor = new NBAPropsPredictor('./service-account-key.json');

  // Example features (all 88 required)
  const features = {
    prop_type: 'points_rebounds',
    home_team: 'LAL',
    away_team: 'GSW',
    bookmaker: 'DraftKings',
    SEASON: '2025-26',
    year: 2026,
    month: 2,
    day_of_week: 3,
    L3_PTS: 26.3,
    L3_REB: 7.2,
    L3_AST: 8.1,
    L3_MIN: 35.0,
    L3_FG_PCT: 0.48,
    L3_FG3M: 2.1,
    L3_FG3_PCT: 0.35,
    L3_STL: 1.2,
    L3_BLK: 0.5,
    L3_TOV: 3.2,
    L3_FGM: 9.5,
    L3_FGA: 19.8,
    L10_PTS: 25.8,
    L10_PTS_STD: 3.2,
    L10_REB: 6.9,
    L10_REB_STD: 1.5,
    L10_AST: 7.8,
    L10_AST_STD: 2.1,
    L10_MIN: 34.5,
    L10_FG_PCT: 0.47,
    L10_FG3M: 2.0,
    L10_FG3_PCT: 0.34,
    L10_STL: 1.1,
    L10_BLK: 0.6,
    L10_TOV: 3.1,
    L10_FGM: 9.2,
    L10_FGA: 19.6,
    HOME_AWAY: 1,
    DAYS_REST: 2,
    BACK_TO_BACK: 0,
    GAMES_IN_LAST_7: 3,
    MINUTES_TREND: 0.5,
    SCORING_EFFICIENCY: 1.32,
    ASSIST_TO_RATIO: 2.55,
    REBOUND_RATE: 0.21,
    USAGE_RATE: 0.28,
    TREND_PTS: 0.5,
    TREND_REB: 0.3,
    TREND_AST: 0.3,
    CONSISTENCY_PTS: 0.12,
    CONSISTENCY_REB: 0.22,
    CONSISTENCY_AST: 0.27,
    ACCELERATION_PTS: 0.05,
    EFFICIENCY_STABLE: 1,
    L3_PTS_x_HOME: 26.3,
    L3_REB_x_HOME: 7.2,
    L3_AST_x_HOME: 8.1,
    L3_MIN_x_B2B: 0,
    L3_PTS_x_REST: 52.6,
    USAGE_x_EFFICIENCY: 0.37,
    LOAD_INTENSITY: 12.25,
    SHOOTING_VOLUME: 19.8,
    REBOUND_INTENSITY: 2.52,
    PLAYMAKING_EFFICIENCY: 20.65,
    THREE_POINT_THREAT: 0.74,
    DEFENSIVE_IMPACT: 1.95,
    L3_vs_L10_PTS_RATIO: 1.02,
    L3_vs_L10_REB_RATIO: 1.04,
    PTS_VOLATILITY: 0.124,
    MINUTES_STABILITY: 0.97,
    line: 28.5,
    odds_over: -110,
    odds_under: -110,
    implied_prob_over: 0.52,
    LINE_VALUE: 0.0,
    L3_PTS_vs_LINE: -2.2,
    L3_REB_vs_LINE: -21.3,
    L3_AST_vs_LINE: -20.4,
    LINE_DIFFICULTY_PTS: 1.08,
    LINE_DIFFICULTY_REB: 3.96,
    LINE_DIFFICULTY_AST: 3.52,
    IMPLIED_PROB_OVER: 0.52,
    ODDS_EDGE: 0.0,
    LINE_vs_AVG_PTS: 2.7,
    LINE_vs_AVG_REB: 21.6,
    implied_prob_under: 0.48,
    odds_spread: 0,
    market_confidence: 0.04,
    L3_vs_market: 0.0,
    L10_vs_market: 0.0
  };

  try {
    const prediction = await predictor.predict(features);
    console.log(predictor.formatPrediction(prediction));

    if (prediction.should_bet) {
      console.log(`\n✅ RECOMMENDATION: Bet ${prediction.prediction}`);
    } else {
      console.log('\n❌ SKIP: Confidence too low');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = NBAPropsPredictor;
```

**Required Node.js packages:**
```bash
npm install google-auth-library axios
```

---

## Error Handling & Common Issues

### HTTP Status Codes

| Code | Meaning | Common Cause | Solution |
|------|---------|--------------|----------|
| 200 | Success | None | Prediction returned successfully |
| 400 | Bad Request | Missing features, invalid JSON | Check all 88 features are present and valid |
| 401 | Unauthorized | Invalid/expired token | Refresh access token |
| 403 | Forbidden | Insufficient permissions | Check service account has `aiplatform.user` role |
| 429 | Too Many Requests | Rate limit exceeded | Implement exponential backoff retry |
| 500 | Internal Error | Model error | Retry request, contact support if persists |
| 503 | Service Unavailable | Model not ready | Wait and retry |

### Common Error Messages

#### 1. "Missing features" Error

**Error:**
```json
{
  "error": "['year', 'month', 'L3_FGM'] not in index"
}
```

**Cause:** Request is missing required features.

**Solution:** Ensure all 88 features are in the request. Use the complete example as template.

#### 2. "Object of type bool is not JSON serializable"

**Error:**
```json
{
  "error": "Object of type bool is not JSON serializable"
}
```

**Cause:** This was a bug in model v1, fixed in v2.

**Solution:** Ensure using model v2 (deployed). This error should not occur with current deployment.

#### 3. "Invalid authentication credentials"

**Error:**
```json
{
  "error": {
    "code": 401,
    "message": "Request had invalid authentication credentials"
  }
}
```

**Cause:** Access token is invalid or expired.

**Solution:** Tokens expire after 1 hour. Refresh token before each request or cache with expiry check.

#### 4. "Permission denied"

**Error:**
```json
{
  "error": {
    "code": 403,
    "message": "Permission 'aiplatform.endpoints.predict' denied"
  }
}
```

**Cause:** Service account lacks permissions.

**Solution:** Run:
```bash
gcloud projects add-iam-policy-binding betai-f9176 \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT@betai-f9176.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

### Retry Logic Example

```python
import time
from typing import Optional

def predict_with_retry(
    predictor,
    features: dict,
    max_retries: int = 3
) -> Optional[dict]:
    """
    Make prediction with exponential backoff retry
    """
    for attempt in range(max_retries):
        try:
            return predictor.predict(features)
        except requests.HTTPError as e:
            if e.response.status_code in [429, 503]:
                # Retry on rate limit or service unavailable
                wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                print(f"Retry {attempt + 1}/{max_retries} after {wait_time}s")
                time.sleep(wait_time)
            else:
                # Don't retry on other errors
                raise

    return None
```

---

## Testing & Validation

### Step 1: Test Service Account Setup

```bash
# Verify service account exists
gcloud iam service-accounts list --project=betai-f9176 | grep nba-props

# Verify permissions
gcloud projects get-iam-policy betai-f9176 \
  --flatten="bindings[].members" \
  --filter="bindings.members:nba-props-predictor@betai-f9176.iam.gserviceaccount.com"

# Should show: roles/aiplatform.user
```

### Step 2: Test Authentication

```python
from google.oauth2 import service_account
from google.auth.transport.requests import Request

credentials = service_account.Credentials.from_service_account_file(
    'service-account-key.json',
    scopes=['https://www.googleapis.com/auth/cloud-platform']
)

credentials.refresh(Request())
print(f"Token obtained: {credentials.token[:20]}...")
# Should print: Token obtained: ya29.c.c0ASRK0Ga...
```

### Step 3: Test API Call

Use the provided example code or run:

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d @prediction_input.json \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/133991312998/locations/us-central1/endpoints/4819237529867780096:predict"
```

Expected response:
```json
{
  "predictions": [
    {
      "prediction": "Over",
      "probability_over": 0.787,
      "probability_under": 0.213,
      "confidence": 0.287,
      "should_bet": true,
      "betting_value": "high"
    }
  ],
  ...
}
```

### Step 4: Validate Predictions

Check that:
- `probability_over + probability_under ≈ 1.0` (within 0.001)
- `confidence = abs(probability_over - 0.5)`
- `should_bet = true` when `confidence > 0.10`
- `betting_value = "high"` when `confidence > 0.15`
- `betting_value = "medium"` when `0.10 < confidence <= 0.15`
- `betting_value = "low"` when `confidence <= 0.10`

---

## Production Deployment Checklist

### Security

- [ ] Service account key stored securely (environment variable or secret manager)
- [ ] Key file NOT committed to version control (.gitignore)
- [ ] Separate service accounts for dev/staging/prod
- [ ] Minimal permissions (only `aiplatform.user` role)
- [ ] Key rotation policy defined (rotate every 90 days)

### Error Handling

- [ ] Retry logic implemented for 429/503 errors
- [ ] Exponential backoff configured
- [ ] Timeout set (30 seconds recommended)
- [ ] All error types handled (400, 401, 403, 500, 503)
- [ ] Logging implemented for all requests/responses

### Performance

- [ ] Token caching implemented (refresh before 1 hour expiry)
- [ ] Batch predictions used when possible (multiple instances in one request)
- [ ] Connection pooling configured
- [ ] Response time monitoring in place
- [ ] Alerting set up for slow/failed requests

### Monitoring

- [ ] Log all prediction requests (features + results)
- [ ] Track prediction counts per day
- [ ] Monitor error rates
- [ ] Alert on sustained errors (>5% error rate)
- [ ] Track response times (alert if >2 seconds)
- [ ] Monitor API costs

### Testing

- [ ] Unit tests for API client
- [ ] Integration tests with live API
- [ ] Validation tests for prediction logic
- [ ] Load testing completed
- [ ] Failover scenarios tested

---

## Model Information & Performance

### Model Architecture
- **Framework:** CatBoost 1.2.8 (gradient boosting)
- **Type:** Binary classifier (Over = 1, Under = 0)
- **Features:** 88 total (5 categorical, 83 numerical)
- **Training Framework:** Python 3.13
- **Deployment:** Custom Docker container on Vertex AI

### Model IDs
- **Model Resource:** projects/133991312998/locations/us-central1/models/657542038270509056
- **Model Display Name:** nba-props-catboost-v2
- **Deployed Model ID:** 1459976069581897728
- **Endpoint ID:** 4819237529867780096
- **Version:** 20260201_171801 (February 1, 2026)

### Performance Metrics (Test Set)

| Metric | Value | Meaning |
|--------|-------|---------|
| Accuracy | 64.9% | Correct predictions on test data |
| Brier Score | 0.2308 | Probability calibration (0 = perfect, 1 = worst) |
| ROI | 41.1% | Return on investment when betting per strategy |
| Samples | ~50,000 | Test set size |

### Betting Strategy Performance

When following `should_bet = true` recommendations:
- **Win Rate:** ~65%
- **Average Odds:** -110 (1.91 decimal)
- **ROI:** 41.1%
- **Break-even:** 52.4% (at -110 odds)

**Risk Tiers:**
- High value (>15% confidence): ~70% win rate
- Medium value (10-15% confidence): ~62% win rate
- Low value (<10% confidence): ~52% win rate (don't bet)

### Infrastructure

| Component | Specification |
|-----------|---------------|
| Region | us-central1 (Iowa, USA) |
| Machine Type | n1-standard-2 (2 vCPU, 7.5 GB RAM) |
| Min Replicas | 1 (always on) |
| Max Replicas | 3 (auto-scaling) |
| Container | Custom Docker with CatBoost + Flask |
| Health Check | /health endpoint every 30s |

### Expected Latency
- **Average:** 500-1000ms per prediction
- **Cold Start:** 2-3 seconds (first request after idle)
- **Batch:** ~100ms additional per extra instance

### Cost Estimate (Monthly)

| Component | Cost |
|-----------|------|
| VM Hosting (1 replica) | ~$70/month |
| Prediction Calls | $0.0000057 per prediction |
| Network Egress | ~$0.12/GB |

**Example:** 10,000 predictions/month = $70 + $0.06 = ~$70/month

---

## Support & Additional Resources

### Google Cloud Project Details
- **Project ID:** betai-f9176
- **Project Number:** 133991312998
- **Region:** us-central1
- **Endpoint ID:** 4819237529867780096

### Useful Commands

**Check endpoint status:**
```bash
gcloud ai endpoints describe 4819237529867780096 \
  --region=us-central1 \
  --project=betai-f9176
```

**List deployed models:**
```bash
gcloud ai models list \
  --region=us-central1 \
  --project=betai-f9176
```

**View logs:**
```bash
gcloud logging read \
  "resource.type=aiplatform.googleapis.com/Endpoint" \
  --limit=50 \
  --project=betai-f9176
```

### Documentation Links
- [Vertex AI Prediction API](https://cloud.google.com/vertex-ai/docs/predictions/get-predictions)
- [Service Account Authentication](https://cloud.google.com/docs/authentication/production)
- [Google Auth Library - Python](https://google-auth.readthedocs.io/)
- [Google Auth Library - Node.js](https://www.npmjs.com/package/google-auth-library)

### Troubleshooting Checklist

If predictions fail:
1. Verify service account has `aiplatform.user` role
2. Check access token is valid (refresh if needed)
3. Confirm all 88 features are present in request
4. Verify endpoint is healthy (should show "Ready" in console)
5. Check logs for specific error messages
6. Test with provided example features first

---

## Version History

### v2 (Current - February 3, 2026)
- **Changes:** Fixed JSON serialization bug for boolean fields
- **Status:** Production
- **Model ID:** 657542038270509056
- **Deployed Model ID:** 1459976069581897728

### v1 (Deprecated - February 1, 2026)
- **Changes:** Initial deployment
- **Status:** Replaced
- **Issue:** Boolean serialization error

---

## Quick Start Summary

1. **Get Service Account Key:**
   ```bash
   gcloud iam service-accounts create nba-props-predictor --project=betai-f9176
   gcloud projects add-iam-policy-binding betai-f9176 \
     --member="serviceAccount:nba-props-predictor@betai-f9176.iam.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   gcloud iam service-accounts keys create service-account-key.json \
     --iam-account=nba-props-predictor@betai-f9176.iam.gserviceaccount.com
   ```

2. **Install Dependencies:**
   - Python: `pip install google-auth requests`
   - Node.js: `npm install google-auth-library axios`

3. **Make Prediction:**
   - Use provided Python or Node.js code
   - Include all 88 features
   - Parse `predictions[0]` from response

4. **Interpret Results:**
   - If `should_bet = true` → Bet on `prediction` (Over/Under)
   - If `should_bet = false` → Skip this bet
   - Higher `betting_value` → Higher confidence

5. **Production:**
   - Store key securely
   - Implement retry logic
   - Monitor errors and latency
   - Follow betting strategy (>10% confidence only)

---

**End of Documentation**
