# NBA Props ML Model - Output Interpretation Guide

## CRITICAL: Understanding the Model's Output

This document explains exactly how the NBA Props CatBoost ML model works and how to correctly interpret its predictions. **Read this carefully before integrating with Bet.AI.**

---

## Table of Contents
1. [How the Model Was Trained](#1-how-the-model-was-trained)
2. [What the Model Predicts](#2-what-the-model-predicts)
3. [Understanding the API Response](#3-understanding-the-api-response)
4. [The Prediction Logic - CRITICAL](#4-the-prediction-logic---critical)
5. [Common Mistakes to Avoid](#5-common-mistakes-to-avoid)
6. [Code Examples for Correct Interpretation](#6-code-examples-for-correct-interpretation)
7. [Debugging Guide](#7-debugging-guide)

---

## 1. How the Model Was Trained

### Training Target (Label)
The model was trained to predict a binary target called `over_hit`:

```python
# From dataset_builder.py
final_df["over_hit"] = (final_df["actual_stat"] > final_df["line"]).astype(int)
```

**This means:**
- `over_hit = 1` (class 1) → The player's actual stat **exceeded** the betting line (OVER hit)
- `over_hit = 0` (class 0) → The player's actual stat **stayed at or below** the line (UNDER hit)

### Model Type
- **Framework:** CatBoost 1.2.8
- **Type:** Binary Classifier
- **Classes:**
  - Class 0 = Under (player stat ≤ line)
  - Class 1 = Over (player stat > line)

---

## 2. What the Model Predicts

The model outputs **probabilities**, not discrete labels. Specifically:

```python
probas = model.predict_proba(features)
# Returns: [[prob_class_0, prob_class_1], ...]
#          [[prob_under,   prob_over  ], ...]
```

**CRITICAL UNDERSTANDING:**
- `probas[:, 0]` = Probability of **Under** (class 0)
- `probas[:, 1]` = Probability of **Over** (class 1)
- These always sum to 1.0

---

## 3. Understanding the API Response

### Response Structure
```json
{
  "predictions": [
    {
      "prediction": "Over",
      "probability_over": 0.72,
      "probability_under": 0.28,
      "confidence": 0.22,
      "should_bet": true,
      "betting_value": "high"
    }
  ]
}
```

### Field Definitions

| Field | Type | Description | Formula |
|-------|------|-------------|---------|
| `prediction` | string | "Over" or "Under" | Based on which probability is higher |
| `probability_over` | float (0-1) | Probability that player stat > line | `model.predict_proba(X)[:, 1]` |
| `probability_under` | float (0-1) | Probability that player stat ≤ line | `1 - probability_over` |
| `confidence` | float (0-0.5) | Model's certainty level | `abs(probability_over - 0.5)` |
| `should_bet` | boolean | Whether to bet | `true` if confidence > 0.10 |
| `betting_value` | string | Value tier | "high", "medium", or "low" |

---

## 4. The Prediction Logic - CRITICAL

### Step-by-Step Prediction Process

```python
# Step 1: Get raw probability from model
prob_over = model.predict_proba(features)[0, 1]  # INDEX 1 = OVER

# Step 2: Calculate prob_under
prob_under = 1 - prob_over

# Step 3: Determine prediction direction
if prob_over >= 0.5:
    prediction = "Over"
else:
    prediction = "Under"

# Step 4: Calculate confidence
confidence = abs(prob_over - 0.5)

# Step 5: Determine if should bet
should_bet = confidence > 0.10

# Step 6: Determine betting value tier
if confidence > 0.15:
    betting_value = "high"
elif confidence > 0.10:
    betting_value = "medium"
else:
    betting_value = "low"
```

### Visual Probability Scale

```
UNDER ←──────────────────────┼──────────────────────→ OVER
0.0                         0.5                         1.0
     |←── Low Conf ──→||←── Low Conf ──→|
            0.4      0.5      0.6
          |←────────→|  |←────────→|
           Don't bet      Don't bet

0.0    0.35    0.40  0.5  0.60    0.65    1.0
       High    Med   Low  Low    Med     High
       UNDER  UNDER      N/A    OVER    OVER
```

### Interpretation Table

| probability_over | prediction | confidence | should_bet | betting_value |
|-----------------|------------|------------|------------|---------------|
| 0.75 | Over | 0.25 | true | high |
| 0.65 | Over | 0.15 | true | medium → high |
| 0.60 | Over | 0.10 | true | medium |
| 0.55 | Over | 0.05 | false | low |
| 0.50 | Over | 0.00 | false | low |
| 0.45 | Under | 0.05 | false | low |
| 0.40 | Under | 0.10 | true | medium |
| 0.35 | Under | 0.15 | true | medium → high |
| 0.25 | Under | 0.25 | true | high |

---

## 5. Common Mistakes to Avoid

### Mistake #1: Inverting Over/Under
**WRONG:**
```python
# This is BACKWARDS!
if probability_over > 0.5:
    recommendation = "Under"  # WRONG!
```

**CORRECT:**
```python
if probability_over > 0.5:
    recommendation = "Over"   # CORRECT!
if probability_over < 0.5:
    recommendation = "Under"  # CORRECT!
```

### Mistake #2: Confusing Probability Indices
**WRONG:**
```python
prob_over = model.predict_proba(X)[:, 0]  # WRONG! Index 0 is UNDER
```

**CORRECT:**
```python
prob_over = model.predict_proba(X)[:, 1]  # CORRECT! Index 1 is OVER
```

### Mistake #3: Not Understanding What probability_over Means

`probability_over = 0.72` means:
- 72% chance the player's stat EXCEEDS the line
- 28% chance the player's stat STAYS AT OR BELOW the line
- Model recommends: **BET OVER**

`probability_over = 0.28` means:
- 28% chance the player's stat EXCEEDS the line
- 72% chance the player's stat STAYS AT OR BELOW the line
- Model recommends: **BET UNDER**

### Mistake #4: Only Showing One Side

If your app only shows "Under" recommendations, check:
1. Are you inverting the logic?
2. Are you filtering incorrectly?
3. Are you reading `probability_under` as `probability_over`?

---

## 6. Code Examples for Correct Interpretation

### JavaScript/TypeScript
```typescript
interface ModelPrediction {
  prediction: "Over" | "Under";
  probability_over: number;
  probability_under: number;
  confidence: number;
  should_bet: boolean;
  betting_value: "high" | "medium" | "low";
}

function interpretPrediction(pred: ModelPrediction): string {
  // probability_over > 0.5 means bet OVER
  // probability_over < 0.5 means bet UNDER

  if (!pred.should_bet) {
    return `Skip this bet - confidence too low (${(pred.confidence * 100).toFixed(1)}%)`;
  }

  if (pred.probability_over > 0.5) {
    return `BET OVER - ${(pred.probability_over * 100).toFixed(1)}% chance of hitting Over`;
  } else {
    return `BET UNDER - ${(pred.probability_under * 100).toFixed(1)}% chance of hitting Under`;
  }
}

// Example usage:
const response = await fetch(VERTEX_AI_ENDPOINT, { ... });
const data = await response.json();
const prediction = data.predictions[0];

console.log(interpretPrediction(prediction));

// If prediction.probability_over = 0.72:
// Output: "BET OVER - 72.0% chance of hitting Over"

// If prediction.probability_over = 0.28:
// Output: "BET UNDER - 72.0% chance of hitting Under"
```

### Swift (iOS)
```swift
struct ModelPrediction: Codable {
    let prediction: String
    let probability_over: Double
    let probability_under: Double
    let confidence: Double
    let should_bet: Bool
    let betting_value: String
}

func interpretPrediction(_ pred: ModelPrediction) -> (direction: String, confidence: String, shouldBet: Bool) {
    let direction: String
    let displayProbability: Double

    if pred.probability_over > 0.5 {
        direction = "OVER"
        displayProbability = pred.probability_over
    } else {
        direction = "UNDER"
        displayProbability = pred.probability_under
    }

    let confidenceStr = String(format: "%.1f%%", displayProbability * 100)

    return (direction, confidenceStr, pred.should_bet)
}

// Usage:
let (direction, confidence, shouldBet) = interpretPrediction(prediction)
if shouldBet {
    betLabel.text = "BET \(direction)"
    confidenceLabel.text = "\(confidence) probability"
} else {
    betLabel.text = "SKIP"
    confidenceLabel.text = "Low confidence"
}
```

### Python
```python
def interpret_prediction(pred: dict) -> dict:
    """
    Correctly interpret model prediction.

    Args:
        pred: Dictionary with probability_over, probability_under, etc.

    Returns:
        Dictionary with recommendation and explanation.
    """
    prob_over = pred['probability_over']
    prob_under = pred['probability_under']
    confidence = pred['confidence']
    should_bet = pred['should_bet']

    # Determine direction
    if prob_over > 0.5:
        direction = "OVER"
        winning_prob = prob_over
    else:
        direction = "UNDER"
        winning_prob = prob_under

    return {
        'recommendation': f"BET {direction}" if should_bet else "SKIP",
        'direction': direction,
        'winning_probability': winning_prob,
        'confidence_pct': confidence * 100,
        'should_bet': should_bet,
        'explanation': (
            f"{winning_prob:.1%} probability of {direction} hitting. "
            f"Confidence: {confidence:.1%}. "
            f"{'Bet recommended.' if should_bet else 'Skip - low confidence.'}"
        )
    }

# Example:
pred = {
    'probability_over': 0.72,
    'probability_under': 0.28,
    'confidence': 0.22,
    'should_bet': True
}

result = interpret_prediction(pred)
# {
#   'recommendation': 'BET OVER',
#   'direction': 'OVER',
#   'winning_probability': 0.72,
#   'confidence_pct': 22.0,
#   'should_bet': True,
#   'explanation': '72.0% probability of OVER hitting. Confidence: 22.0%. Bet recommended.'
# }
```

---

## 7. Debugging Guide

### If All Predictions Are "Under"

Check these common issues:

**1. Are you inverting probability_over?**
```python
# WRONG - This would make all predictions Under when prob_over > 0.5
if prediction['probability_over'] > 0.5:
    show_under_recommendation()  # BUG!

# CORRECT
if prediction['probability_over'] > 0.5:
    show_over_recommendation()
```

**2. Are you reading probability_under as probability_over?**
```python
# WRONG - Variables might be swapped
prob_to_display = prediction['probability_under']  # You think this is Over but it's Under

# CORRECT
prob_over = prediction['probability_over']
prob_under = prediction['probability_under']
```

**3. Are you filtering predictions incorrectly?**
```python
# WRONG - This only shows Under predictions
if prediction['probability_under'] > 0.5:
    display(prediction)

# CORRECT - Show both
display(prediction)  # The prediction field already says "Over" or "Under"
```

### Verification Test

Send this test request and verify your app shows "OVER":

**Test Case 1: Should show OVER**
```json
{
  "prediction": "Over",
  "probability_over": 0.75,
  "probability_under": 0.25,
  "confidence": 0.25,
  "should_bet": true,
  "betting_value": "high"
}
```

Your app should display: **"BET OVER - 75% confidence"** or similar

**Test Case 2: Should show UNDER**
```json
{
  "prediction": "Under",
  "probability_over": 0.25,
  "probability_under": 0.75,
  "confidence": 0.25,
  "should_bet": true,
  "betting_value": "high"
}
```

Your app should display: **"BET UNDER - 75% confidence"** or similar

---

## Summary: The Golden Rules

1. **`probability_over` is the probability of OVER hitting** (player exceeds line)
2. **`probability_over > 0.5` means BET OVER**
3. **`probability_over < 0.5` means BET UNDER**
4. **`confidence = abs(probability_over - 0.5)`** - higher is better
5. **Only bet when `should_bet = true`** (confidence > 10%)
6. **The `prediction` field already tells you "Over" or "Under"** - just use it!

### Quick Reference Formula

```
IF probability_over > 0.5:
    RECOMMENDATION = "OVER"
    DISPLAY_PROBABILITY = probability_over
ELSE:
    RECOMMENDATION = "UNDER"
    DISPLAY_PROBABILITY = probability_under

CONFIDENCE = abs(probability_over - 0.5)
BET_IF = confidence > 0.10
```

---

## API Response Field Reference

| Field | Always Present | Type | Range | Meaning |
|-------|---------------|------|-------|---------|
| `prediction` | Yes | string | "Over"/"Under" | Which side to bet |
| `probability_over` | Yes | float | 0.0 - 1.0 | P(stat > line) |
| `probability_under` | Yes | float | 0.0 - 1.0 | P(stat ≤ line) |
| `confidence` | Yes | float | 0.0 - 0.5 | abs(prob_over - 0.5) |
| `should_bet` | Yes | boolean | true/false | confidence > 0.10 |
| `betting_value` | Yes | string | "high"/"medium"/"low" | Value tier |

---

**Document Version:** 1.0
**Last Updated:** February 5, 2026
**Model Version:** nba-props-catboost-v2 (20260201_171801)
