/**
 * Vertex AI Integration Module
 * Handles authentication and predictions for NBA Props ML model
 *
 * Model Details:
 * - Endpoint: Vertex AI CatBoost model (64.9% accuracy)
 * - Region: us-central1
 * - Project: betai-f9176 (ID: 133991312998)
 * - Endpoint ID: 4819237529867780096
 *
 * Authentication: OAuth2 Service Account (requires service-account-key.json)
 */

const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');

// Vertex AI Configuration
const VERTEX_AI_CONFIG = {
  projectNumber: '133991312998',
  location: 'us-central1',
  endpointId: '4819237529867780096',
  get endpoint() {
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectNumber}/locations/${this.location}/endpoints/${this.endpointId}:predict`;
  }
};

// OAuth2 scopes required for Vertex AI
const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

// Cache access token (valid for ~1 hour)
let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get OAuth2 access token for Vertex AI
 * Uses Google Service Account credentials with automatic token caching
 *
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
  try {
    // Return cached token if still valid (with 5-minute buffer)
    const now = Date.now();
    if (cachedToken && now < tokenExpiry - (5 * 60 * 1000)) {
      console.log('[Vertex AI] Using cached access token');
      return cachedToken;
    }

    console.log('[Vertex AI] Fetching new access token...');

    // Initialize Google Auth with service account
    // This automatically looks for credentials in:
    // 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
    // 2. Default service account (if running on GCP)
    const auth = new GoogleAuth({
      scopes: SCOPES
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      throw new Error('Failed to obtain access token from Google Auth');
    }

    // Cache token (typically valid for 3600 seconds = 1 hour)
    cachedToken = tokenResponse.token;
    tokenExpiry = now + (3600 * 1000); // 1 hour from now

    console.log('[Vertex AI] ✅ Access token obtained successfully');

    return cachedToken;

  } catch (error) {
    console.error('[Vertex AI] Error getting access token:', error);
    throw new Error(`Vertex AI authentication failed: ${error.message}`);
  }
}

/**
 * Call Vertex AI prediction endpoint
 * Sends 88 features to the model and returns prediction
 *
 * @param {Object} features - Complete 88-feature object from mlFeatureEngineering
 * @returns {Promise<Object>} Prediction result
 */
async function callVertexAI(features) {
  try {
    console.log('[Vertex AI] Preparing prediction request...');

    // Get OAuth2 access token
    const accessToken = await getAccessToken();

    // Prepare request payload
    // Vertex AI expects "instances" array (can batch multiple predictions)
    const requestBody = {
      instances: [features]
    };

    console.log(`[Vertex AI] Calling endpoint: ${VERTEX_AI_CONFIG.endpoint}`);

    // Make prediction request
    const response = await axios.post(
      VERTEX_AI_CONFIG.endpoint,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    if (response.status !== 200) {
      throw new Error(`Vertex AI returned status ${response.status}: ${JSON.stringify(response.data)}`);
    }

    console.log('[Vertex AI] ✅ Prediction successful');

    // Parse and return prediction
    return parsePredictionResponse(response.data);

  } catch (error) {
    console.error('[Vertex AI] Prediction error:', error.message);

    // Provide helpful error context
    if (error.response) {
      console.error('[Vertex AI] Response status:', error.response.status);
      console.error('[Vertex AI] Response data:', JSON.stringify(error.response.data, null, 2));
    }

    throw new Error(`Vertex AI prediction failed: ${error.message}`);
  }
}

/**
 * Parse Vertex AI prediction response
 * Extracts prediction, probabilities, confidence, and betting recommendations
 *
 * @param {Object} rawResponse - Raw Vertex AI response
 * @returns {Object} Parsed prediction object
 */
function parsePredictionResponse(rawResponse) {
  try {
    // Extract prediction from response
    // Response format:
    // {
    //   "predictions": [{ prediction, probability_over, probability_under, confidence, should_bet, betting_value }],
    //   "deployedModelId": "...",
    //   "model": "...",
    //   "modelDisplayName": "...",
    //   "modelVersionId": "..."
    // }

    if (!rawResponse.predictions || rawResponse.predictions.length === 0) {
      throw new Error('No predictions returned from model');
    }

    const prediction = rawResponse.predictions[0];

    // Validate required fields
    const requiredFields = ['prediction', 'probability_over', 'probability_under', 'confidence'];
    for (const field of requiredFields) {
      if (prediction[field] === undefined) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Calculate additional metrics
    // Use probabilities DIRECTLY from the model without swapping
    const probabilityOver = prediction.probability_over;
    const probabilityUnder = prediction.probability_under;
    const confidence = prediction.confidence;

    // Use prediction DIRECTLY from the model
    const finalPrediction = prediction.prediction;

    // Determine betting recommendation tier
    const bettingValue = getBettingValueTier(confidence);

    // Determine if should bet (confidence > 10% = 0.10)
    const shouldBet = confidence > 0.10;

    // Create standardized prediction object
    const parsedPrediction = {
      // Primary prediction
      prediction: finalPrediction, // "Over" or "Under"

      // Probabilities
      probabilityOver: probabilityOver,
      probabilityUnder: probabilityUnder,
      probabilityOverPercent: (probabilityOver * 100).toFixed(1), // "78.7%"
      probabilityUnderPercent: (probabilityUnder * 100).toFixed(1), // "21.3%"

      // Confidence metrics
      confidence: confidence,
      confidencePercent: (confidence * 100).toFixed(1), // "28.7%"
      confidenceTier: bettingValue, // "high", "medium", "low"

      // Betting recommendation
      shouldBet: shouldBet,
      bettingValue: bettingValue,

      // Model metadata
      modelInfo: {
        deployedModelId: rawResponse.deployedModelId,
        modelDisplayName: rawResponse.modelDisplayName,
        modelVersionId: rawResponse.modelVersionId
      }
    };

    return parsedPrediction;

  } catch (error) {
    console.error('[Vertex AI] Error parsing prediction response:', error);
    throw new Error(`Failed to parse prediction: ${error.message}`);
  }
}

/**
 * Determine betting value tier based on confidence
 *
 * Strategy from API docs:
 * - HIGH: confidence > 15% (~70% win rate)
 * - MEDIUM: confidence 10-15% (~62% win rate)
 * - LOW: confidence < 10% (~52% win rate, not recommended)
 *
 * @param {number} confidence - Confidence value (0-1)
 * @returns {string} "high", "medium", or "low"
 */
function getBettingValueTier(confidence) {
  if (confidence > 0.15) {
    return 'high';
  } else if (confidence >= 0.10) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Batch predict multiple props
 * More efficient than individual predictions when processing many props
 *
 * @param {Array<Object>} featuresArray - Array of 88-feature objects
 * @returns {Promise<Array<Object>>} Array of predictions
 */
async function batchPredictVertexAI(featuresArray) {
  try {
    console.log(`[Vertex AI] Preparing batch prediction for ${featuresArray.length} props...`);

    // Get OAuth2 access token
    const accessToken = await getAccessToken();

    // Vertex AI supports batch predictions via "instances" array
    const requestBody = {
      instances: featuresArray
    };

    console.log(`[Vertex AI] Calling endpoint with ${featuresArray.length} instances`);

    const response = await axios.post(
      VERTEX_AI_CONFIG.endpoint,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout for batch
      }
    );

    if (response.status !== 200) {
      throw new Error(`Vertex AI returned status ${response.status}`);
    }

    console.log(`[Vertex AI] ✅ Batch prediction successful (${response.data.predictions.length} results)`);

    // Parse all predictions
    const predictions = response.data.predictions.map(pred => {
      return {
        prediction: pred.prediction,
        probabilityOver: pred.probability_over,
        probabilityUnder: pred.probability_under,
        probabilityOverPercent: (pred.probability_over * 100).toFixed(1),
        probabilityUnderPercent: (pred.probability_under * 100).toFixed(1),
        confidence: pred.confidence,
        confidencePercent: (pred.confidence * 100).toFixed(1),
        confidenceTier: getBettingValueTier(pred.confidence),
        shouldBet: pred.confidence > 0.10,
        bettingValue: pred.betting_value || getBettingValueTier(pred.confidence)
      };
    });

    return predictions;

  } catch (error) {
    console.error('[Vertex AI] Batch prediction error:', error.message);
    throw new Error(`Batch prediction failed: ${error.message}`);
  }
}

/**
 * Health check: Test Vertex AI connectivity and authentication
 * Useful for debugging and deployment verification
 *
 * @returns {Promise<Object>} Status object
 */
async function testVertexAIConnection() {
  try {
    console.log('[Vertex AI] Testing connection...');

    // Test 1: Can we get an access token?
    const token = await getAccessToken();
    console.log('[Vertex AI] ✅ Authentication successful');

    // Test 2: Is the endpoint reachable? (We'd need a sample prediction for full test)
    return {
      status: 'success',
      authenticated: true,
      endpoint: VERTEX_AI_CONFIG.endpoint,
      tokenObtained: !!token,
      message: 'Vertex AI connection verified'
    };

  } catch (error) {
    console.error('[Vertex AI] Connection test failed:', error);
    return {
      status: 'failed',
      authenticated: false,
      error: error.message,
      message: 'Vertex AI connection failed - check service account credentials'
    };
  }
}

module.exports = {
  callVertexAI,
  batchPredictVertexAI,
  testVertexAIConnection,
  getAccessToken,
  VERTEX_AI_CONFIG
};
