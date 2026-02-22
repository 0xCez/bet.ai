/**
 * shared/retry.js — Lightweight retry with exponential backoff
 *
 * Designed for Cloud Functions: fast retries (1s, 2s, 4s),
 * not long waits that burn timeout budget.
 *
 * Only retries transient errors (429, 5xx, timeout, network).
 * Does NOT retry auth errors (401), bad requests (400), or 404s.
 */

/**
 * Determine if an error is transient (worth retrying).
 */
function isTransientError(err) {
  const status = err.response?.status;
  if (status === 429) return true;  // rate limit
  if (status >= 500 && status < 600) return true;  // server error

  const code = err.code;
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) return true;
  if (err.message?.includes('timeout')) return true;
  if (err.message?.includes('socket hang up')) return true;

  return false;
}

/**
 * Retry an async function with exponential backoff.
 *
 * @param {Function} fn - async function to retry
 * @param {object} options
 * @param {number} options.maxRetries - max retry attempts (default: 2)
 * @param {number} options.baseDelay - initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - max delay in ms (default: 4000)
 * @param {string} options.label - label for log messages
 * @returns {Promise} - result of fn
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = 2,
    baseDelay = 1000,
    maxDelay = 4000,
    label = '',
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxRetries || !isTransientError(err)) {
        throw err;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const tag = label ? `[retry:${label}]` : '[retry]';
      console.warn(`${tag} Attempt ${attempt + 1}/${maxRetries + 1} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

module.exports = { withRetry, isTransientError };
