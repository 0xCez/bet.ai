/**
 * Slideshow Generator - Main Entry Point
 *
 * Export all modules for easy importing in Next.js/React web apps
 */

// Core API clients
export { config, validateConfig } from './core/config';
export { getNFLPlayerStats, getMLBPlayerStats, getNFLTeamStats } from './core/statpal';
export { getNBAPlayerStats, getSoccerPlayerStats } from './core/api-sports';
export {
  getEvents,
  getEventOdds,
  getSportOdds,
  findEvent,
  calculateBestLines,
  getOddsComparison,
  getAvailableSports,
  SPORT_KEYS,
} from './core/the-odds-api';

// Types
export * from './types';

// Team data
export { NFL_TEAMS, NBA_TEAMS, SOCCER_TEAMS, getTeamByCode, getTeamById, getAllTeams } from './data/teams';

// Formats
export { generateTargetAvoid, formatForDisplay, formatSlideshowPost } from './formats/target-avoid';
