/**
 * shared/bookmakerTiers.js — Bookmaker quality tiers from Phase 2 analysis.
 *
 * Hit rate by bookmaker (7-day sample, 5,109 graded picks):
 *   FanDuel: 77.2%   (Tier 1)
 *   DraftKings: ~70%  (Tier 2)
 *   BetMGM: ~70%      (Tier 2)
 *   Bovada: 51.1%     (Tier 4)
 */

const BOOKMAKER_TIERS = {
  'fanduel':    { tier: 1, priority: 1 },
  'draftkings': { tier: 2, priority: 2 },
  'betmgm':     { tier: 2, priority: 3 },
  'espnbet':    { tier: 2, priority: 4 },
  'caesars':    { tier: 2, priority: 5 },
  'fanatics':   { tier: 3, priority: 6 },
  'hardrock':   { tier: 3, priority: 7 },
  'betrivers':  { tier: 3, priority: 8 },
  'bet365':     { tier: 3, priority: 9 },
  'bovada':     { tier: 4, priority: 10 },
  'betonline':  { tier: 4, priority: 11 },
  'mybookie':   { tier: 4, priority: 12 },
  'betus':      { tier: 4, priority: 13 },
};

// Tier bonus multipliers for sort scoring
const TIER_BONUSES = { 1: 1.10, 2: 1.05, 3: 1.00, 4: 0.90 };

/**
 * Get the tier info for a bookmaker (case-insensitive, handles short names).
 */
function getBookmakerTier(bookmaker) {
  if (!bookmaker) return { tier: 3, priority: 99 };
  const key = bookmaker.toLowerCase().replace(/[\s_-]/g, '');
  // Try exact match first, then partial match
  if (BOOKMAKER_TIERS[key]) return BOOKMAKER_TIERS[key];
  // Handle short names: "FD" → fanduel, "DK" → draftkings, etc.
  const shortMap = {
    'fd': 'fanduel', 'dk': 'draftkings', 'mgm': 'betmgm',
    'espn': 'espnbet', 'cz': 'caesars', 'br': 'betrivers',
    'bov': 'bovada', 'hr': 'hardrock',
  };
  const mapped = shortMap[key];
  if (mapped && BOOKMAKER_TIERS[mapped]) return BOOKMAKER_TIERS[mapped];
  return { tier: 3, priority: 99 };
}

/**
 * Scoring bonus multiplier for a bookmaker.
 * Tier 1 = 1.10x, Tier 2 = 1.05x, Tier 3 = 1.0x, Tier 4 = 0.90x
 */
function getBookmakerBonus(bookmaker) {
  const { tier } = getBookmakerTier(bookmaker);
  return TIER_BONUSES[tier] || 1.0;
}

module.exports = { BOOKMAKER_TIERS, getBookmakerTier, getBookmakerBonus };
