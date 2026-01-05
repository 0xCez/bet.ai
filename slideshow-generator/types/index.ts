/**
 * Slideshow Generator - TypeScript Types
 */

// ============================================
// LEAGUES & SPORTS
// ============================================

export type League = 'NFL' | 'NBA' | 'SOCCER' | 'MLB';

export interface Team {
  id: number;
  name: string;
  code: string;
  city?: string;
  logo?: string;
  statpalCode?: string; // lowercase code for StatPal API
}

// ============================================
// NFL TYPES (StatPal)
// ============================================

export interface NFLPassingStats {
  name: string;
  id: string;
  yards: string;
  yardsPerGame: number;
  passingTouchdowns: number;
  completionPct: number;
  interceptions: number;
  qbRating: number;
  attempts: number;
  completions: number;
  longestPass: number;
  sacks: number;
}

export interface NFLRushingStats {
  name: string;
  id: string;
  yards: string;
  yardsPerGame: number;
  rushingTouchdowns: number;
  rushingAttempts: number;
  yardsPerRush: number;
  fumbles: number;
  fumblesLost: number;
  longestRush: number;
  over20Yards: number;
  firstDowns: number;
}

export interface NFLReceivingStats {
  name: string;
  id: string;
  receivingYards: string;
  yardsPerGame: number;
  receivingTouchdowns: number;
  receptions: number;
  targets: number;
  yardsPerReception: number;
  longestReception: number;
  over20Yards: number;
  yardsAfterCatch: number;
  firstDowns: number;
}

export interface NFLPlayerStats {
  passing?: NFLPassingStats;
  rushing: NFLRushingStats[];
  receiving: NFLReceivingStats[];
}

// ============================================
// NBA TYPES (API-Sports)
// ============================================

export interface NBAGameStats {
  playerId: number;
  playerName: string;
  position: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  minutes: number;
  fgm: number;
  fga: number;
  fgp: number;
  tpm: number;
  tpa: number;
  tpp: number;
  ftm: number;
  fta: number;
  ftp: number;
}

export interface NBAAggregatedStats {
  playerId: number;
  name: string;
  position: string;
  gamesPlayed: number;
  pointsAverage: number;
  reboundsAverage: number;
  assistsAverage: number;
  stealsAverage: number;
  blocksAverage: number;
  turnoversAverage: number;
  fgPercentage: number;
  threePtPercentage: number;
  ftPercentage: number;
  minutesAverage: number;
}

// ============================================
// SOCCER TYPES (API-Sports)
// ============================================

export interface SoccerPlayerStats {
  playerId: number;
  name: string;
  position: string;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  goalsPerGame: number;
  shotsTotal: number;
  shotsOnTarget: number;
  shotAccuracy: number;
  keyPasses: number;
  passAccuracy: number;
  yellowCards: number;
  redCards: number;
}

// ============================================
// TARGET/AVOID OUTPUT
// ============================================

export type Verdict = 'TARGET' | 'AVOID';

export interface PlayerInsight {
  playerName: string;
  playerId: string | number;
  team: string;
  position: string;
  verdict: Verdict;
  propType: string; // e.g., "Receiving Yards", "Points", "Anytime Scorer"
  reasons: [string, string, string]; // Always 3 bullet points
  confidence: 'High' | 'Medium' | 'Low';
  rawStats: Record<string, any>;
}

export interface SlideshowPost {
  league: League;
  generatedAt: string;
  players: PlayerInsight[];
}

// ============================================
// API INPUT/OUTPUT
// ============================================

export interface GenerateRequest {
  league: League;
  teams?: string[]; // Team codes (e.g., ['phi', 'dal']) - optional, if empty picks from whole league
  propTypes?: string[]; // e.g., ['receiving_yards', 'rushing_yards'] - optional
  count?: number; // How many players to generate (default: 2 - one TARGET, one AVOID)
}

export interface GenerateResponse {
  success: boolean;
  data?: SlideshowPost;
  error?: string;
}
