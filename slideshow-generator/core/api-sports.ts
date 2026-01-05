/**
 * API-Sports Client
 *
 * Used for: NBA, Soccer player stats
 */

import axios from 'axios';
import { config } from './config';
import { NBAAggregatedStats, SoccerPlayerStats } from '../types';

// ============================================
// NBA PLAYER STATS
// ============================================

interface APISportsNBAResponse {
  response: Array<{
    player: { id: number; firstname: string; lastname: string };
    team: { id: number; name: string };
    game: { id: number };
    points: number;
    pos: string;
    min: string;
    fgm: number;
    fga: number;
    fgp: string;
    ftm: number;
    fta: number;
    ftp: string;
    tpm: number;
    tpa: number;
    tpp: string;
    offReb: number;
    defReb: number;
    totReb: number;
    assists: number;
    steals: number;
    turnovers: number;
    blocks: number;
  }>;
}

export async function getNBAPlayerStats(
  teamId: number,
  season: number = 2024
): Promise<NBAAggregatedStats[]> {
  try {
    const url = `${config.apiSports.nbaBaseUrl}/players/statistics?season=${season}&team=${teamId}`;

    const response = await axios.get<APISportsNBAResponse>(url, {
      headers: {
        'x-rapidapi-key': config.apiSports.apiKey,
        'x-rapidapi-host': 'v2.nba.api-sports.io',
      },
    });

    if (!response.data?.response?.length) {
      console.error(`No NBA data for team ${teamId}`);
      return [];
    }

    // Aggregate game-by-game stats into player averages
    const playerMap = new Map<
      number,
      {
        player: { id: number; firstname: string; lastname: string };
        position: string;
        games: number;
        totalPoints: number;
        totalReb: number;
        totalAst: number;
        totalStl: number;
        totalBlk: number;
        totalTo: number;
        totalFgm: number;
        totalFga: number;
        totalTpm: number;
        totalTpa: number;
        totalFtm: number;
        totalFta: number;
        totalMin: number;
      }
    >();

    for (const game of response.data.response) {
      if (!game.player) continue;

      const playerId = game.player.id;

      if (!playerMap.has(playerId)) {
        playerMap.set(playerId, {
          player: game.player,
          position: game.pos || 'Unknown',
          games: 0,
          totalPoints: 0,
          totalReb: 0,
          totalAst: 0,
          totalStl: 0,
          totalBlk: 0,
          totalTo: 0,
          totalFgm: 0,
          totalFga: 0,
          totalTpm: 0,
          totalTpa: 0,
          totalFtm: 0,
          totalFta: 0,
          totalMin: 0,
        });
      }

      const p = playerMap.get(playerId)!;
      p.games++;
      p.totalPoints += game.points || 0;
      p.totalReb += game.totReb || 0;
      p.totalAst += game.assists || 0;
      p.totalStl += game.steals || 0;
      p.totalBlk += game.blocks || 0;
      p.totalTo += game.turnovers || 0;
      p.totalFgm += game.fgm || 0;
      p.totalFga += game.fga || 0;
      p.totalTpm += game.tpm || 0;
      p.totalTpa += game.tpa || 0;
      p.totalFtm += game.ftm || 0;
      p.totalFta += game.fta || 0;
      p.totalMin += parseInt(game.min) || 0;
    }

    // Convert to aggregated stats
    const aggregated: NBAAggregatedStats[] = [];

    for (const [playerId, p] of playerMap) {
      if (p.games === 0) continue;

      aggregated.push({
        playerId,
        name: `${p.player.firstname} ${p.player.lastname}`,
        position: p.position,
        gamesPlayed: p.games,
        pointsAverage: parseFloat((p.totalPoints / p.games).toFixed(1)),
        reboundsAverage: parseFloat((p.totalReb / p.games).toFixed(1)),
        assistsAverage: parseFloat((p.totalAst / p.games).toFixed(1)),
        stealsAverage: parseFloat((p.totalStl / p.games).toFixed(1)),
        blocksAverage: parseFloat((p.totalBlk / p.games).toFixed(1)),
        turnoversAverage: parseFloat((p.totalTo / p.games).toFixed(1)),
        fgPercentage:
          p.totalFga > 0
            ? parseFloat(((p.totalFgm / p.totalFga) * 100).toFixed(1))
            : 0,
        threePtPercentage:
          p.totalTpa > 0
            ? parseFloat(((p.totalTpm / p.totalTpa) * 100).toFixed(1))
            : 0,
        ftPercentage:
          p.totalFta > 0
            ? parseFloat(((p.totalFtm / p.totalFta) * 100).toFixed(1))
            : 0,
        minutesAverage: parseFloat((p.totalMin / p.games).toFixed(1)),
      });
    }

    // Sort by points and filter players with meaningful stats
    return aggregated
      .filter((p) => p.pointsAverage > 5 && p.gamesPlayed >= 5)
      .sort((a, b) => b.pointsAverage - a.pointsAverage);
  } catch (error: any) {
    console.error(`API-Sports NBA error for team ${teamId}:`, error.message);
    return [];
  }
}

// ============================================
// SOCCER PLAYER STATS
// ============================================

interface APISportsSoccerResponse {
  response: Array<{
    player: {
      id: number;
      name: string;
    };
    statistics: Array<{
      games: {
        appearences: number;
        minutes: number;
        position: string;
        rating: string;
      };
      goals: {
        total: number;
        assists: number;
      };
      shots: {
        total: number;
        on: number;
      };
      passes: {
        key: number;
        accuracy: number;
      };
      cards: {
        yellow: number;
        red: number;
      };
    }>;
  }>;
}

export async function getSoccerPlayerStats(
  teamId: number,
  season: number = 2024
): Promise<SoccerPlayerStats[]> {
  try {
    const url = `${config.apiSports.soccerBaseUrl}/players?team=${teamId}&season=${season}`;

    const response = await axios.get<APISportsSoccerResponse>(url, {
      headers: {
        'x-rapidapi-key': config.apiSports.apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      },
    });

    if (!response.data?.response?.length) {
      console.error(`No Soccer data for team ${teamId}`);
      return [];
    }

    const players: SoccerPlayerStats[] = [];

    for (const playerData of response.data.response) {
      if (!playerData.statistics?.length) continue;

      // Get the stats with most appearances (primary league)
      const stats = playerData.statistics.reduce((best, current) => {
        const currentApps = current.games?.appearences || 0;
        const bestApps = best?.games?.appearences || 0;
        return currentApps > bestApps ? current : best;
      }, playerData.statistics[0]);

      const appearances = stats.games?.appearences || 0;
      if (appearances === 0) continue;

      const goals = stats.goals?.total || 0;
      const assists = stats.goals?.assists || 0;
      const shotsTotal = stats.shots?.total || 0;
      const shotsOn = stats.shots?.on || 0;

      players.push({
        playerId: playerData.player.id,
        name: playerData.player.name,
        position: stats.games?.position || 'Unknown',
        appearances,
        minutes: stats.games?.minutes || 0,
        goals,
        assists,
        goalsPerGame: parseFloat((goals / appearances).toFixed(2)),
        shotsTotal,
        shotsOnTarget: shotsOn,
        shotAccuracy: shotsTotal > 0 ? parseFloat(((shotsOn / shotsTotal) * 100).toFixed(1)) : 0,
        keyPasses: stats.passes?.key || 0,
        passAccuracy: stats.passes?.accuracy || 0,
        yellowCards: stats.cards?.yellow || 0,
        redCards: stats.cards?.red || 0,
      });
    }

    // Sort by goals + assists contribution
    return players
      .filter((p) => p.appearances >= 5)
      .sort((a, b) => b.goals + b.assists - (a.goals + a.assists));
  } catch (error: any) {
    console.error(`API-Sports Soccer error for team ${teamId}:`, error.message);
    return [];
  }
}
