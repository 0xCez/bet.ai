/**
 * StatPal API Client
 *
 * Used for: NFL, MLB player stats
 * Note: Team codes must be LOWERCASE (e.g., 'phi' not 'PHI')
 */

import axios from 'axios';
import { config } from './config';
import {
  NFLPlayerStats,
  NFLPassingStats,
  NFLRushingStats,
  NFLReceivingStats,
} from '../types';

// ============================================
// NFL PLAYER STATS
// ============================================

interface StatPalNFLResponse {
  statistics: {
    id: string;
    season: string;
    team: string;
    category: Array<{
      name: string;
      player: any | any[];
    }>;
  };
}

export async function getNFLPlayerStats(teamCode: string): Promise<NFLPlayerStats | null> {
  try {
    // IMPORTANT: StatPal requires lowercase team codes
    const lowerTeamCode = teamCode.toLowerCase();
    const url = `${config.statpal.baseUrl}/nfl/player-stats/${lowerTeamCode}?access_key=${config.statpal.apiKey}`;

    const response = await axios.get<StatPalNFLResponse>(url);

    if (!response.data?.statistics?.category) {
      console.error(`No statistics data for team ${teamCode}`);
      return null;
    }

    const categories = response.data.statistics.category;

    // Extract passing stats (usually single player - QB)
    const passingCategory = categories.find((c) => c.name === 'Passing');
    let passing: NFLPassingStats | undefined;

    if (passingCategory?.player) {
      const p = Array.isArray(passingCategory.player)
        ? passingCategory.player[0]
        : passingCategory.player;

      passing = {
        name: p.name,
        id: p.id,
        yards: p.yards || '0',
        yardsPerGame: parseFloat(p.yards_per_game) || 0,
        passingTouchdowns: parseInt(p.passing_touchdowns) || 0,
        completionPct: parseFloat(p.completion_pct) || 0,
        interceptions: parseInt(p.interceptions) || 0,
        qbRating: parseFloat(p.quaterback_rating) || 0,
        attempts: parseInt(p.passing_attempts) || 0,
        completions: parseInt(p.completions) || 0,
        longestPass: parseInt(p.longest_pass) || 0,
        sacks: parseInt(p.sacks) || 0,
      };
    }

    // Extract rushing stats (array of players)
    const rushingCategory = categories.find((c) => c.name === 'Rushing');
    const rushing: NFLRushingStats[] = [];

    if (rushingCategory?.player) {
      const players = Array.isArray(rushingCategory.player)
        ? rushingCategory.player
        : [rushingCategory.player];

      for (const p of players) {
        rushing.push({
          name: p.name,
          id: p.id,
          yards: p.yards || '0',
          yardsPerGame: parseFloat(p.yards_per_game) || 0,
          rushingTouchdowns: parseInt(p.rushing_touchdowns) || 0,
          rushingAttempts: parseInt(p.rushing_attempts) || 0,
          yardsPerRush: parseFloat(p.yards_per_rush_avg) || 0,
          fumbles: parseInt(p.fumbles) || 0,
          fumblesLost: parseInt(p.fumbles_lost) || 0,
          longestRush: parseInt(p.longest_rush) || 0,
          over20Yards: parseInt(p.over_20_yards) || 0,
          firstDowns: parseInt(p.rushing_first_downs) || 0,
        });
      }
    }

    // Extract receiving stats (array of players)
    const receivingCategory = categories.find((c) => c.name === 'Receiving');
    const receiving: NFLReceivingStats[] = [];

    if (receivingCategory?.player) {
      const players = Array.isArray(receivingCategory.player)
        ? receivingCategory.player
        : [receivingCategory.player];

      for (const p of players) {
        receiving.push({
          name: p.name,
          id: p.id,
          receivingYards: p.receiving_yards || '0',
          yardsPerGame: parseFloat(p.yards_per_game) || 0,
          receivingTouchdowns: parseInt(p.receiving_touchdowns) || 0,
          receptions: parseInt(p.receptions) || 0,
          targets: parseInt(p.receiving_targets) || 0,
          yardsPerReception: parseFloat(p.yards_per_reception_avg) || 0,
          longestReception: parseInt(p.longest_reception) || 0,
          over20Yards: parseInt(p.over_20_yards) || 0,
          yardsAfterCatch: parseInt(p.yards_after_catch) || 0,
          firstDowns: parseInt(p.receiving_first_downs) || 0,
        });
      }
    }

    return { passing, rushing, receiving };
  } catch (error: any) {
    console.error(`StatPal NFL API error for ${teamCode}:`, error.message);
    return null;
  }
}

// ============================================
// MLB PLAYER STATS (similar structure)
// ============================================

export async function getMLBPlayerStats(teamCode: string): Promise<any | null> {
  try {
    const lowerTeamCode = teamCode.toLowerCase();
    const url = `${config.statpal.baseUrl}/mlb/player-stats/${lowerTeamCode}?access_key=${config.statpal.apiKey}`;

    const response = await axios.get(url);

    if (!response.data?.statistics) {
      console.error(`No MLB statistics data for team ${teamCode}`);
      return null;
    }

    return response.data.statistics;
  } catch (error: any) {
    console.error(`StatPal MLB API error for ${teamCode}:`, error.message);
    return null;
  }
}

// ============================================
// TEAM STATS (for additional context)
// ============================================

export async function getNFLTeamStats(teamCode: string): Promise<any | null> {
  try {
    const lowerTeamCode = teamCode.toLowerCase();
    const url = `${config.statpal.baseUrl}/nfl/team-stats/${lowerTeamCode}?access_key=${config.statpal.apiKey}`;

    const response = await axios.get(url);
    return response.data?.statistics || null;
  } catch (error: any) {
    console.error(`StatPal NFL Team Stats error for ${teamCode}:`, error.message);
    return null;
  }
}
