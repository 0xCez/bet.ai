// Cloud Functions base URL
// 🔧 DEV NOTE: Using production Cloud Functions because they're not deployed to dev project
// Cloud Functions are stateless and only call external APIs (OpenAI, Odds API, etc.)
// This is safe - they don't directly access Firebase data
export const CLOUD_FUNCTIONS_BASE_URL = "https://us-central1-betai-f9176.cloudfunctions.net";

// For local testing with emulator (uncomment when needed):
// export const CLOUD_FUNCTIONS_BASE_URL = "http://127.0.0.1:5001/betai-f9176/us-central1";

// Add other API-related constants here as needed
export const API_TIMEOUT = 30000; // 30 seconds
export const MAX_RETRIES = 3;
