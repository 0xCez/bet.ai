/**
 * Shared type definitions for player props across the app.
 * Used by BoardView, TopPicks, ParlayBuilder, PlayerPropChart, etc.
 */

import type { SportId } from "../config/sports";

// ── Hit Rates ──

export interface HitRateWindow {
  over: number;
  total: number;
  pct: number; // Always Over-side percentage (raw from backend)
}

export interface DirectionalHitRates {
  l10?: number | null;
  l20?: number | null;
  season?: number | null;
}

export interface HitRates {
  l3?: HitRateWindow;
  l5?: HitRateWindow;
  l10?: HitRateWindow;
  l20?: HitRateWindow;
  season?: HitRateWindow;
}

// ── Ranked Props (unified shape for leaderboard, board, top picks) ──

export interface RankedProp {
  playerName: string;
  playerId?: string | null;
  team: string;
  opponent: string;
  statType: string;
  line: number;
  prediction: "over" | "under";
  oddsOver?: number;
  oddsUnder?: number;
  bookmakerOver?: string;
  bookmakerUnder?: string;
  l10Avg?: number;
  betScore?: number;
  edge?: number;
  greenScore?: number;
  hitRates?: HitRates;
  directionalHitRates?: DirectionalHitRates;
  confidenceTier?: string;
  sport: SportId;
  gameId: string;
  gameStartTime?: string;
}

// ── Parlay Stack Leg ──

export interface ParlayLeg {
  playerName: string;
  playerId?: string | null;
  team: string;
  opponent: string;
  statType: string;
  prediction: string;
  altLine: number;
  altOdds: number;
  bookmaker?: string;
  l10Avg: number;
  parlayEdge?: number;
  greenScore?: number;
  hitRates?: HitRates;
  directionalHitRates?: DirectionalHitRates;
  opponentDefense?: { rank: number; allowed?: number; stat?: string };
  isHome: boolean;
}

// ── Leaderboard (read from Firestore) ──

export interface LeaderboardData {
  edge: RankedProp[];
  stack: ParlayLeg[];
  generatedAt: string;
}
