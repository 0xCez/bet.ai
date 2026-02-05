# Probability Mapping Issue - Vertex AI Model Deployment

## Executive Summary

The ML Props prediction system is returning only extreme predictions (either all UNDER or all OVER), indicating a probability index mapping error in the Vertex AI model deployment preprocessing/postprocessing script.

---

## Problem Description

### Current Behavior
- **Scenario 1 (Using raw Vertex AI output)**: All predictions show UNDER with extremely low `probability_over` values (3-10%)
- **Scenario 2 (After swapping probabilities in our code)**: All predictions show OVER with extremely high `probability_over` values (90-97%)
- **Expected Behavior**: A realistic distribution of OVER and UNDER predictions with varying confidence levels

### Example Data

**Raw Vertex AI Output (All UNDER)**:
```json
{
  "playerName": "Jalen Duren",
  "statType": "points",
  "line": 11.5,
  "probability_over": 0.037,    // 3.7%
  "probability_under": 0.963,   // 96.3%
  "prediction": "Under",
  "confidence": 0.463
}
```

**After Swapping in Our Code (All OVER)**:
```json
{
  "playerName": "Jalen Duren",
  "statType": "points",
  "line": 11.5,
  "probability_over": 0.963,    // 96.3%
  "probability_under": 0.037,   // 3.7%
  "prediction": "Over",
  "confidence": 0.463
}
```

Notice the probabilities are perfectly inverted (3.7% ↔ 96.3%), suggesting the indices are swapped.

---

## Root Cause Analysis

### What Your MODEL_OUTPUT_GUIDE.md Says

According to the official model documentation (MODEL_OUTPUT_GUIDE.md from the model codebase):

```python
# CatBoost binary classifier
# Class 0 = Under
# Class 1 = Over

probas = model.predict_proba(features)
probability_over = probas[0, 1]   # INDEX 1 = OVER (class 1) ✓ CORRECT
probability_under = probas[0, 0]  # INDEX 0 = UNDER (class 0) ✓ CORRECT
confidence = abs(probability_over - 0.5)
prediction = "Over" if probability_over >= 0.5 else "Under"
```

### What We Suspect is Happening in Vertex AI Deployment

The Vertex AI model deployment script appears to be incorrectly mapping the indices:

```python
# SUSPECTED INCORRECT MAPPING
probas = model.predict_proba(features)
probability_over = probas[0, 0]   # ❌ WRONG! This is actually UNDER (class 0)
probability_under = probas[0, 1]  # ❌ WRONG! This is actually OVER (class 1)
```

---

## Evidence

### Test Results

| Test Scenario | Total Props | OVER Count | UNDER Count | Sample `prob_over` Values |
|--------------|-------------|------------|-------------|---------------------------|
| Raw Vertex AI output | 9 | 0 | 9 | 3.7%, 3.8%, 8.2%, 4.1%, 9.2% |
| After probability swap | 9 | 9 | 0 | 96.3%, 96.2%, 92.4%, 95.9%, 90.8% |
| Expected distribution | 9 | ~4-5 | ~4-5 | Mixed values around 50% |

### Mathematical Proof

The probability values are perfectly complementary:
- Original `prob_over` = 3.7% → Swapped `prob_over` = 96.3% (100% - 3.7%)
- Original `prob_over` = 8.2% → Swapped `prob_over` = 91.8% (100% - 8.2%)

This confirms the indices are swapped, not that the model has a bias issue.

---

## Impact

### Business Impact
- **User Trust**: Users see nonsensical predictions (100% UNDER or 100% OVER)
- **Betting Accuracy**: Predictions are completely inverted from reality
- **Revenue**: Feature unusable in production until fixed

### Statistical Impossibility
For 9 consecutive predictions to all be UNDER (or all OVER) with 90%+ confidence:
- Probability: (0.5)^9 = 0.2% chance
- This happening consistently across multiple games → **impossible without a bug**

---

## Required Fix

### Location
Check the **Vertex AI model deployment script** (preprocessing or postprocessing code) that handles:
1. Model inference
2. `predict_proba()` output parsing
3. JSON response construction

### What to Verify

```python
# In your Vertex AI deployment script, ensure this pattern:

def predict(instance):
    features = preprocess(instance)
    probas = model.predict_proba([features])  # Returns [[prob_class_0, prob_class_1]]

    # CORRECT MAPPING:
    probability_over = float(probas[0, 1])    # INDEX 1 = OVER (class 1) ✓
    probability_under = float(probas[0, 0])   # INDEX 0 = UNDER (class 0) ✓

    # NOT THIS (incorrect):
    # probability_over = float(probas[0, 0])  # ❌ This is UNDER!
    # probability_under = float(probas[0, 1]) # ❌ This is OVER!

    confidence = abs(probability_over - 0.5)
    prediction = "Over" if probability_over >= 0.5 else "Under"

    return {
        "probability_over": probability_over,
        "probability_under": probability_under,
        "prediction": prediction,
        "confidence": confidence
    }
```

### Key Points to Check
1. **Class Label Order**: Verify that class 0 = Under and class 1 = Over in the model metadata
2. **Index Mapping**: Ensure `predict_proba()[:, 1]` maps to `probability_over`
3. **Prediction Logic**: Verify `prediction` field is derived correctly from probabilities
4. **Deployment Configuration**: Check if any deployment settings are inverting class labels

---

## Expected Vertex AI Response Format

After the fix, each prediction should return:

```json
{
  "probability_over": 0.63,      // From predict_proba()[:, 1]
  "probability_under": 0.37,     // From predict_proba()[:, 0]
  "prediction": "Over",          // "Over" if prob_over >= 0.5, else "Under"
  "confidence": 0.13             // abs(prob_over - 0.5)
}
```

---

## Testing the Fix

### After Redeployment, Verify:

1. **Distribution Test**: Run predictions on 50+ props and verify:
   - ~50% are OVER, ~50% are UNDER
   - `probability_over` values are distributed across 0.0-1.0 range
   - No clustering at extremes (< 10% or > 90%)

2. **Sanity Check**: For any prop:
   - `probability_over + probability_under ≈ 1.0`
   - `prediction` matches `probability_over >= 0.5`
   - `confidence = abs(probability_over - 0.5)`

3. **Real-World Test**: Compare predictions to actual game outcomes:
   - Props predicted OVER should have ~prob_over success rate
   - Props predicted UNDER should have ~prob_under success rate

---

## Additional Notes

### Reference from MODEL_OUTPUT_GUIDE.md

Your documentation explicitly warns about this issue:

> **Section 5: Common Mistakes to Avoid**
> - Inverting Over/Under probabilities when extracting from predict_proba()

This confirms the team is aware this is a common error pattern.

### Timeline
- **Issue Identified**: 2026-02-05
- **Severity**: Critical - feature completely unusable
- **Urgency**: High - blocking production launch

---

## Questions for Model Team

1. Where is the Vertex AI deployment preprocessing/postprocessing script located?
2. Has the model been retrained recently, potentially changing class label order?
3. Are there any deployment configuration files that might override class mappings?
4. Can you provide sample `predict_proba()` output for a known test case so we can verify?

---

## Contact

If you need clarification or want to see actual Vertex AI response samples from our production system, please reach out. We can provide full request/response logs for debugging.
