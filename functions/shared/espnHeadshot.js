/**
 * shared/espnHeadshot.js — ESPN player headshot + position resolution
 *
 * Provides:
 * - resolveEspnHeadshot(playerName) → headshot URL (permanent Firestore cache)
 * - resolveEspnPlayer(playerName) → { headshotUrl, position } (permanent Firestore cache)
 * - resolveHeadshotsBatch(playerNames) → { name: url }
 */

const axios = require('axios');
const admin = require('firebase-admin');

let db;
const getDb = () => { if (!db) db = admin.firestore(); return db; };

// In-memory warm cache (persists across warm invocations)
const espnCache = {};

/**
 * Resolve a player's ESPN headshot URL and position.
 * Checks Firestore cache first (permanent), then ESPN search API.
 *
 * @returns {{ headshotUrl: string|null, position: string|null }}
 */
async function resolveEspnPlayer(playerName) {
  const key = playerName.toLowerCase().trim();
  if (espnCache[key]) return espnCache[key];

  const docId = `espn_hs_${key.replace(/[^a-z0-9]/g, '_')}`;

  // Firestore cache (permanent — ESPN IDs don't change)
  try {
    const doc = await getDb().collection('ml_cache').doc(docId).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.headshotUrl) {
        const result = { headshotUrl: data.headshotUrl, position: data.position || null };
        espnCache[key] = result;
        return result;
      }
    }
  } catch (e) { /* cache miss */ }

  // ESPN public search API
  try {
    const resp = await axios.get(
      `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(playerName)}&type=player&sport=basketball&league=nba&limit=1`,
      { timeout: 5000 }
    );
    const item = resp.data?.items?.[0];
    if (item) {
      const headshotUrl = item.headshot?.href || null;
      const position = item.position || null;
      const result = { headshotUrl, position };

      espnCache[key] = result;
      try {
        await getDb().collection('ml_cache').doc(docId).set({
          playerName,
          espnId: item.id,
          headshotUrl,
          position,
          fetchedAt: Date.now(),
        });
      } catch (e) { /* silent cache write failure */ }
      return result;
    }
  } catch (e) {
    console.warn(`[espn] Player lookup failed for ${playerName}:`, e.message);
  }

  return { headshotUrl: null, position: null };
}

/**
 * Resolve headshot URL only (backward-compatible with original function).
 */
async function resolveEspnHeadshot(playerName) {
  const result = await resolveEspnPlayer(playerName);
  return result.headshotUrl;
}

/**
 * Batch resolve headshots for multiple players.
 */
async function resolveHeadshotsBatch(playerNames, batchSize = 5) {
  const map = {};
  for (let i = 0; i < playerNames.length; i += batchSize) {
    const batch = playerNames.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(n => resolveEspnHeadshot(n)));
    batch.forEach((name, idx) => { map[name] = results[idx]; });
  }
  return map;
}

module.exports = { resolveEspnHeadshot, resolveEspnPlayer, resolveHeadshotsBatch };
