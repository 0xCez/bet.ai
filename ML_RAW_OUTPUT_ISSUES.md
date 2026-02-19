# Model Raw Output Issues — For ML Engineer

## TL;DR

The CatBoost model on Vertex AI has a **severe probability calibration problem**. It's ~65% accurate but outputs 85-98% probabilities. We're patching this server-side with temperature scaling + hard caps, but the model itself should be fixed at training time.

---

## 1. What the Model Returns (Vertex AI Endpoint)

**Endpoint:** `us-central1-aiplatform.googleapis.com/.../endpoints/7508590194849742848:predict`

We send 88 features per prop, get back:

```json
{
  "prediction": "Over",
  "probability_over": 0.9312,
  "probability_under": 0.0688,
  "confidence": 0.8624
}
```

## 2. The Problem: Probabilities Are Not Calibrated

### What we see in production:
- **Most raw outputs are in the 85-98% range** — the model is almost never uncertain
- The model outputs 90%+ on props that only hit ~60-65% of the time
- There's very little spread — a 92% prop and an 88% prop perform about the same
- The probability distribution is heavily biased toward extremes (U-shaped near 0 and 1)

### What this means:
The probabilities don't reflect actual hit rates. If you bucket all props where the model said "93% Over" and check how many actually went Over, it's closer to **63-67%**, not 93%.

This is the textbook definition of **poor calibration** — the predicted probabilities don't match the observed frequencies.

### Why this matters for users:
- A user sees "93% confidence" and bets accordingly
- When it misses (which happens ~35% of the time), they lose trust
- We can't honestly display the model's raw numbers to anyone

---

## 3. Root Cause: CatBoost Default Behavior

CatBoost (and XGBoost/LightGBM) optimizes for **log loss / classification accuracy**, not for probability calibration. The leaf values in the trees get pushed toward extreme logits during training, resulting in sigmoid outputs clustered near 0 or 1.

**This is expected behavior for tree-based models** — but it needs to be addressed if you want to use the probabilities as actual confidence estimates.

---

## 4. What We're Doing Server-Side (Band-Aids)

These are NOT model fixes — they're post-hoc patches in our Cloud Function (`mlPlayerPropsV2.js`):

### a) Temperature Scaling (T=2.0)
```
raw_prob → logit → logit/2.0 → sigmoid → calibrated_prob
```
- Manually tuned T=2.0 to soften extremes
- 95% raw → ~82% displayed, 90% → ~76%, etc.
- **Problem:** T is hand-picked, not fit on validation data

### b) Hard Probability Cap at 85%
- After temperature scaling, we still clamp at 85% max
- A 65% accurate model should never claim 85%+ on anything

### c) Avg-Gated Sanity Filter
- If the player's L10 average contradicts the prediction AND fewer than 2/3 supporting signals exist → prop is removed entirely
- This catches cases where the model says "Over 19.5" but the player averages 17.2 and plays a top-10 defense
- **This shouldn't be needed if the model was better calibrated and less confident on weak signals**

---

## 5. What Should Change in Training

### Priority 1: Probability Calibration
The model's probabilities should be calibrated so that when it says "70% Over", roughly 70% of those props actually go Over.

**Options:**
- **Platt scaling** (logistic regression on model's raw outputs, fit on held-out validation set)
- **Isotonic regression** (non-parametric calibration, more flexible than Platt)
- **CatBoost built-in:** `posterior_sampling=True` or adjusting `leaf_estimation_method` and `leaf_estimation_iterations`
- **Calibration during training:** Use `auto_class_weights` or custom loss that penalizes calibration error

**Validation:** Plot a **reliability diagram** (predicted probability bins vs actual hit rate). Currently it would show a nearly flat line at ~65% actual for predicted probs ranging from 55% to 98%.

### Priority 2: Reduce Overconfidence Specifically
- The model rarely outputs probabilities in the 50-70% range where most of its predictions actually live
- Consider adding **label smoothing** (e.g., treat labels as 0.05/0.95 instead of 0/1) during training
- Or train with a custom loss that includes a calibration penalty term

### Priority 3: Feature Review for Contradictions
The model sometimes predicts "Over" on a line even though:
- Player's average is below the line
- The opponent has a top-10 defense for that stat
- L10 hit rate is under 50%

This suggests the model may be over-weighting certain features (betting line features, interaction terms) and under-weighting the simple "is the average above or below the line?" signal.

**Suggestion:** Check feature importances — are betting odds features (`implied_prob_over`, `odds_spread`, `market_confidence`) dominating over actual performance features (`L10_PTS`, `TREND_PTS`)? If so, the model might be learning to parrot the market rather than find edge.

### Priority 4: Per-Stat-Type Performance
We apply the same model to Points, Rebounds, Assists, 3PT Made, combos (PTS+REB+AST), etc. The model may perform very differently across stat types:
- Points props: higher sample, more stable, maybe better calibrated
- 3PT Made: binary-ish (0, 1, 2, 3), harder to predict, maybe worse calibrated
- Combos: noisier, more variance

**Suggestion:** Evaluate accuracy AND calibration per `prop_type`. If 3PT Made is significantly worse, we might need separate models or different thresholds.

---

## 6. Ideal End State

After fixing calibration, we should be able to:
1. **Remove** temperature scaling (T=2.0) — model outputs should already be honest
2. **Remove** the 85% hard cap — if the model says 80%, it should mean 80%
3. **Reduce** reliance on sanity filters — the model shouldn't be high-confidence on contradictory props
4. **Trust the probability spread** — a 72% prop should meaningfully outperform a 58% prop

The Green Score system (0-5 signal count) would still add value as a user-facing transparency layer, but it shouldn't be papering over model deficiencies.

---

## 7. Current Model Specs (for reference)

| Property | Value |
|----------|-------|
| Model type | CatBoost binary classifier |
| Features | 88 (5 categorical + 83 numeric) |
| Target | Over (1) vs Under (0) |
| Accuracy | ~64.9% on test set |
| Training data | Historical NBA player props + outcomes |
| Deployment | Vertex AI endpoint (us-central1) |
| Feature engineering | Done at inference time in Cloud Function |
| Categorical features | `prop_type`, `home_team`, `away_team`, `bookmaker`, `SEASON` |
