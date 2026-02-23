/**
 * Centralized sports configuration for Cloud Functions.
 * Mirrors config/sports.ts on the app side.
 * Add a new sport here and backend pipelines adapt.
 */

const SPORTS = {
  nba: {
    id: 'nba',
    label: 'NBA',
    oddsApiKey: 'basketball_nba',
    available: true,
  },
  soccer: {
    id: 'soccer',
    label: 'Soccer',
    oddsApiKey: null, // Multi-league
    available: false,
  },
  // Future:
  // mlb: { id: 'mlb', label: 'MLB', oddsApiKey: 'baseball_mlb', available: false },
  // nfl: { id: 'nfl', label: 'NFL', oddsApiKey: 'americanfootball_nfl', available: false },
};

const SPORT_IDS = Object.keys(SPORTS);

module.exports = { SPORTS, SPORT_IDS };
