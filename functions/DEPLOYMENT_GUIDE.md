# NBA Props ML - Deployment Guide

Complete step-by-step guide to deploy the ML integration to Firebase Cloud Functions.

---

## Prerequisites

Before deploying, ensure you have:

- [x] Firebase CLI installed (`npm install -g firebase-tools`)
- [x] Firebase project configured (`betai-f9176`)
- [x] Google Cloud service account with Vertex AI permissions
- [x] API-Sports NBA API key

---

## Step 1: Service Account Setup (Critical!)

The ML integration requires a Google Cloud service account to authenticate with Vertex AI.

### 1.1 Create Service Account

```bash
# Make sure you're in the correct project
gcloud config set project betai-f9176

# Create the service account
gcloud iam service-accounts create nba-props-predictor \
  --display-name="NBA Props Predictor Service Account" \
  --project=betai-f9176
```

**Expected output:**
```
Created service account [nba-props-predictor]
```

### 1.2 Grant Vertex AI Permissions

```bash
# Grant permission to call Vertex AI endpoints
gcloud projects add-iam-policy-binding betai-f9176 \
  --member="serviceAccount:nba-props-predictor@betai-f9176.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

**Expected output:**
```
Updated IAM policy for project [betai-f9176]
```

### 1.3 Create and Download Key File

```bash
# Create key file (THIS IS SENSITIVE - NEVER COMMIT TO GIT!)
gcloud iam service-accounts keys create service-account-key.json \
  --iam-account=nba-props-predictor@betai-f9176.iam.gserviceaccount.com
```

This creates a `service-account-key.json` file in your current directory.

### 1.4 Set Environment Variable for Cloud Functions

Firebase Cloud Functions need to access this service account. We'll upload it securely:

```bash
# Navigate to functions directory
cd functions

# Set the service account key as an environment variable
# Option A: Using Firebase Functions config (DEPRECATED but still works)
firebase functions:config:set vertexai.serviceaccount="$(cat ../service-account-key.json | base64)"

# Option B: Using Google Cloud Secret Manager (RECOMMENDED for production)
# First, enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create secret
gcloud secrets create vertex-ai-service-account \
  --data-file=../service-account-key.json \
  --replication-policy="automatic"

# Grant Cloud Functions access to the secret
gcloud secrets add-iam-policy-binding vertex-ai-service-account \
  --member="serviceAccount:betai-f9176@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**IMPORTANT:** For this integration, we're using Google Auth's automatic discovery, which means:
- When running locally: Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json`
- When deployed: Cloud Functions automatically uses the default service account

The easiest approach for Cloud Functions:

```bash
# Set environment variable for local testing
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/../service-account-key.json"

# For deployed functions, set the service account in firebase.json (see Step 3)
```

---

## Step 2: Install Dependencies

```bash
# Navigate to functions directory if not already there
cd functions

# Install new dependency (google-auth-library)
npm install google-auth-library@^9.0.0

# Verify all dependencies
npm install
```

**Expected packages to be installed:**
- `google-auth-library` - OAuth2 authentication for Vertex AI
- All existing dependencies (axios, firebase-admin, etc.)

---

## Step 3: Configure Service Account for Deployment

Edit `firebase.json` to specify the service account for Cloud Functions:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log",
        "*.local"
      ],
      "runtime": "nodejs22",
      "serviceAccount": "nba-props-predictor@betai-f9176.iam.gserviceaccount.com"
    }
  ]
}
```

**Note:** If this causes issues, you can also set it per-function using environment variables.

---

## Step 4: Verify API Keys

Ensure API-Sports key is configured:

```bash
# Check if API-Sports key is set
firebase functions:config:get

# If not set, add it:
firebase functions:config:set apisports.key="YOUR_API_SPORTS_KEY"
```

---

## Step 5: Test Locally (Optional but Recommended)

```bash
# Start Firebase emulator
npm run serve

# In another terminal, test the endpoints:

# Test 1: Vertex AI connection
curl http://localhost:5001/betai-f9176/us-central1/testVertexAI

# Test 2: Feature engineering (without ML prediction)
node testMLFeatures.js

# Test 3: Game logs endpoint
curl "http://localhost:5001/betai-f9176/us-central1/getPlayerGameLogs?playerId=265&season=2024"
```

**Expected results:**
- `testVertexAI`: Should return `{"status":"success","authenticated":true,...}`
- `testMLFeatures.js`: Should print "✅ Calculated 88 features successfully"
- `getPlayerGameLogs`: Should return JSON with 15 games

---

## Step 6: Deploy to Firebase

```bash
# Deploy only the new ML functions (faster)
firebase deploy --only functions:getNBAPropsWithML,functions:getPlayerGameLogs,functions:testVertexAI

# OR deploy all functions (slower but safer)
firebase deploy --only functions
```

**Expected output:**
```
✔  Deploy complete!

Functions URL:
  - getNBAPropsWithML(us-central1): https://us-central1-betai-f9176.cloudfunctions.net/getNBAPropsWithML
  - getPlayerGameLogs(us-central1): https://us-central1-betai-f9176.cloudfunctions.net/getPlayerGameLogs
  - testVertexAI(us-central1): https://us-central1-betai-f9176.cloudfunctions.net/testVertexAI
```

---

## Step 7: Test Deployed Functions

### Test 1: Vertex AI Health Check

```bash
curl https://us-central1-betai-f9176.cloudfunctions.net/testVertexAI
```

**Expected response:**
```json
{
  "status": "success",
  "authenticated": true,
  "endpoint": "https://us-central1-aiplatform.googleapis.com/v1/projects/133991312998/locations/us-central1/endpoints/4819237529867780096:predict",
  "tokenObtained": true,
  "message": "Vertex AI connection verified"
}
```

**If you get an error:**
- Check service account is created: `gcloud iam service-accounts list | grep nba-props`
- Check permissions: `gcloud projects get-iam-policy betai-f9176 --flatten="bindings[].members" --filter="bindings.members:nba-props-predictor"`
- Check Cloud Function logs: `firebase functions:log --only testVertexAI`

### Test 2: Game Logs Endpoint

```bash
# Test with LeBron James (ID: 265)
curl "https://us-central1-betai-f9176.cloudfunctions.net/getPlayerGameLogs?playerId=265&season=2024"
```

**Expected response:**
```json
{
  "playerId": 265,
  "season": 2024,
  "gamesFound": 15,
  "gameLogs": [
    {
      "game": { "id": ..., "date": { "start": "2024-..." } },
      "points": 28,
      "totReb": 8,
      "assists": 9,
      ...
    }
  ]
}
```

### Test 3: Full ML Pipeline (with sample data)

Create a test file `test-ml-request.json`:

```json
{
  "team1": "Los Angeles Lakers",
  "team2": "Golden State Warriors",
  "team1_code": "LAL",
  "team2_code": "GSW",
  "gameDate": "2026-02-10T02:00:00Z",
  "props": [
    {
      "playerId": 265,
      "playerName": "LeBron James",
      "team": "Los Angeles Lakers",
      "statType": "points",
      "consensusLine": 28.5,
      "bestOver": { "bookmaker": "DraftKings", "odds": -110, "line": 28.5 },
      "bestUnder": { "bookmaker": "FanDuel", "odds": -110, "line": 28.5 }
    }
  ]
}
```

Then test:

```bash
curl -X POST https://us-central1-betai-f9176.cloudfunctions.net/getNBAPropsWithML \
  -H "Content-Type: application/json" \
  -d @test-ml-request.json
```

**Expected response:**
```json
{
  "sport": "nba",
  "teams": { "home": "LAL", "away": "GSW", "logos": {...} },
  "gameDate": "2026-02-10T02:00:00Z",
  "props": [
    {
      "playerId": 265,
      "playerName": "LeBron James",
      "statType": "points",
      "line": 28.5,
      "gamesUsed": 15,
      "mlPrediction": {
        "prediction": "Over",
        "probabilityOver": 0.7145,
        "probabilityOverPercent": "71.5",
        "probabilityUnder": 0.2855,
        "probabilityUnderPercent": "28.5",
        "confidence": 0.2145,
        "confidencePercent": "21.5",
        "confidenceTier": "high",
        "shouldBet": true,
        "bettingValue": "high"
      }
    }
  ],
  "highConfidenceProps": [...],
  "summary": {
    "totalPropsRequested": 1,
    "propsProcessed": 1,
    "highConfidenceCount": 1,
    "mediumConfidenceCount": 0,
    "lowConfidenceCount": 0,
    "predictionErrors": 0
  },
  "timestamp": "2026-02-04T..."
}
```

---

## Step 8: Monitor Performance

### Check Logs

```bash
# View all function logs
firebase functions:log

# View specific function logs
firebase functions:log --only getNBAPropsWithML

# View logs with filtering
firebase functions:log | grep "Vertex AI"
```

### Monitor Costs

Cloud Functions costs breakdown:
- **Invocations:** First 2M/month free, then $0.40 per million
- **Compute time:** First 400K GB-seconds free, then ~$0.0000025 per GB-second
- **Networking:** First 5GB/month free, then $0.12 per GB

Vertex AI costs:
- **Predictions:** ~$0.000001 per prediction (essentially free at small scale)

**Expected monthly cost for 1,000 predictions/day:**
- Cloud Functions: ~$5-10
- Vertex AI: ~$0.03
- **Total: ~$5-10/month**

### Performance Metrics

Expected performance:
- **Feature calculation:** 2-5 seconds per prop
- **Vertex AI prediction:** 500ms-1s per prop
- **Total per prop:** 3-6 seconds
- **Parallel processing:** 10 props in ~6-10 seconds

---

## Troubleshooting

### Issue: "Authentication failed"

**Solution:**
```bash
# Verify service account exists
gcloud iam service-accounts describe nba-props-predictor@betai-f9176.iam.gserviceaccount.com

# Re-create key if needed
gcloud iam service-accounts keys create service-account-key-new.json \
  --iam-account=nba-props-predictor@betai-f9176.iam.gserviceaccount.com

# Update environment variable
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/service-account-key-new.json"
```

### Issue: "No game logs found"

**Solution:**
- Check API-Sports key is valid
- Verify player ID is correct (use NBA API to look up: https://v2.nba.api-sports.io/players?name=LeBron)
- Check API-Sports rate limits

### Issue: "Vertex AI prediction failed"

**Solution:**
- Verify all 88 features are present
- Check Vertex AI endpoint is deployed: `gcloud ai endpoints list --region=us-central1 --project=betai-f9176`
- Test with simpler payload (use testMLFeatures.js output)

### Issue: "Function timeout"

**Solution:**
- Increase timeout in `nbaPropsML.js`: Change `timeoutSeconds: 120` to `timeoutSeconds: 300`
- Redeploy: `firebase deploy --only functions:getNBAPropsWithML`
- Consider batching fewer props per request

---

## Security Checklist

- [ ] Service account key is NOT committed to git
- [ ] Service account has minimal permissions (only `aiplatform.user`)
- [ ] CORS is properly configured for your domain
- [ ] API keys are stored in Firebase Functions config (not in code)
- [ ] Rate limiting is considered for public endpoints

---

## Next Steps After Deployment

1. **Frontend Integration**
   - Update `services/api.ts` with new method
   - Integrate into `player-props.tsx`
   - Display predictions with confidence indicators

2. **Monitoring**
   - Set up Cloud Monitoring alerts for function failures
   - Track prediction accuracy over time
   - Monitor API-Sports rate limit usage

3. **Optimization**
   - Fine-tune cache TTLs based on usage patterns
   - Consider batching strategy for high-volume scenarios
   - Add prediction result caching (30-minute TTL)

---

## Support

If deployment fails:
1. Check logs: `firebase functions:log`
2. Verify service account: `gcloud iam service-accounts list`
3. Test locally first: `npm run serve`
4. Review this guide step-by-step

---

**Deployment Status:** Ready for production ✅

**Last Updated:** 2026-02-04
