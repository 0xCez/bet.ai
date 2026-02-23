/**
 * Centralized sports configuration — single source of truth.
 * Add a new sport here and everything else adapts:
 * BoardView filters, useCachedGames types, oddsApi keys, etc.
 */

export const SPORTS = {
  nba: {
    id: 'nba' as const,
    label: 'NBA',
    icon: 'basketball',
    oddsApiKey: 'basketball_nba',
    available: true,
  },
  soccer: {
    id: 'soccer' as const,
    label: 'Soccer',
    icon: 'football',
    oddsApiKey: null, // Multi-league, uses oddsApiSport field from Firestore
    available: false,
  },
  // Future sports — uncomment when ready:
  // mlb: { id: 'mlb' as const, label: 'MLB', icon: 'baseball', oddsApiKey: 'baseball_mlb', available: false },
  // nfl: { id: 'nfl' as const, label: 'NFL', icon: 'american-football', oddsApiKey: 'americanfootball_nfl', available: false },
} as const;

export type SportId = keyof typeof SPORTS;

export const SPORT_LIST: { id: SportId; label: string; icon: string; available: boolean }[] =
  Object.values(SPORTS);
