/**
 * TARGET/AVOID Slideshow Format Generator
 *
 * Analyzes player stats and generates TARGET/AVOID recommendations
 * with 3 bullet point reasons for each player.
 */

import {
  League,
  PlayerInsight,
  Verdict,
  NFLReceivingStats,
  NFLRushingStats,
  NFLPassingStats,
  NBAAggregatedStats,
  SoccerPlayerStats,
  GenerateRequest,
  SlideshowPost,
} from '../types';
import { getNFLPlayerStats } from '../core/statpal';
import { getNBAPlayerStats, getSoccerPlayerStats } from '../core/api-sports';
import { NFL_TEAMS, NBA_TEAMS, SOCCER_TEAMS } from '../data/teams';

// ============================================
// NFL ANALYSIS
// ============================================

function analyzeNFLReceiver(player: NFLReceivingStats, teamName: string): PlayerInsight {
  const ypg = player.yardsPerGame;
  const targets = player.targets;
  const ypr = player.yardsPerReception;
  const over20 = player.over20Yards;
  const tds = player.receivingTouchdowns;
  const receptions = player.receptions;

  // Determine TARGET or AVOID
  const isTarget = ypg >= 55 && targets >= 40 && ypr >= 10;

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = ypg >= 70 ? 'High' : 'Medium';
    reasons = [
      `${ypg} receiving yards/game - ${ypg >= 70 ? 'elite' : 'solid'} production`,
      `${(targets / 11).toFixed(1)} targets/game with ${over20} catches over 20 yards`,
      `${ypr} yards/reception - ${ypr >= 13 ? 'explosive playmaker' : 'efficient route runner'}`,
    ];
  } else {
    confidence = ypg < 40 ? 'High' : 'Medium';
    reasons = [
      `Only ${ypg} yards/game - ${ypg < 40 ? 'minimal' : 'limited'} production`,
      `${(targets / 11).toFixed(1)} targets/game - ${targets < 40 ? 'low involvement' : 'inconsistent usage'}`,
      ypr < 10
        ? `Short routes: ${ypr} yards/reception, limited upside`
        : `${receptions} receptions on ${targets} targets - ${((receptions / targets) * 100).toFixed(0)}% catch rate`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.id,
    team: teamName,
    position: 'WR',
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'Receiving Yards',
    reasons,
    confidence,
    rawStats: player,
  };
}

function analyzeNFLRusher(player: NFLRushingStats, teamName: string): PlayerInsight {
  const ypg = player.yardsPerGame;
  const attempts = player.rushingAttempts;
  const ypc = player.yardsPerRush;
  const over20 = player.over20Yards;
  const fumbles = player.fumbles;
  const tds = player.rushingTouchdowns;

  const isTarget = ypg >= 50 && attempts >= 100 && ypc >= 4.0;

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = ypg >= 70 ? 'High' : 'Medium';
    reasons = [
      `${ypg} rushing yards/game - ${ypg >= 70 ? 'workhorse' : 'solid'} RB1 volume`,
      `${(attempts / 11).toFixed(1)} carries/game with ${ypc} YPC efficiency`,
      over20 > 0
        ? `${over20} explosive runs (20+ yards) - home run threat`
        : `${tds} rushing TDs - red zone role secured`,
    ];
  } else {
    confidence = ypg < 35 ? 'High' : 'Medium';
    reasons = [
      `Only ${ypg} yards/game - ${ypg < 35 ? 'backup' : 'committee'} role`,
      `${(attempts / 11).toFixed(1)} carries/game - limited workload`,
      fumbles > 0
        ? `${fumbles} fumbles - ball security concerns`
        : `${ypc} YPC - ${ypc < 4.0 ? 'inefficient behind this O-line' : 'decent but low volume'}`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.id,
    team: teamName,
    position: 'RB',
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'Rushing Yards',
    reasons,
    confidence,
    rawStats: player,
  };
}

function analyzeNFLPasser(player: NFLPassingStats, teamName: string): PlayerInsight {
  const ypg = player.yardsPerGame;
  const compPct = player.completionPct;
  const tds = player.passingTouchdowns;
  const ints = player.interceptions;
  const rating = player.qbRating;

  const isTarget = ypg >= 220 && compPct >= 64 && rating >= 90;

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = ypg >= 250 ? 'High' : 'Medium';
    reasons = [
      `${ypg} passing yards/game average`,
      `${compPct}% completion rate - ${compPct >= 67 ? 'elite' : 'solid'} accuracy`,
      `${rating} QB rating with ${tds} TDs vs ${ints} INTs`,
    ];
  } else {
    confidence = ypg < 200 ? 'High' : 'Medium';
    reasons = [
      `Only ${ypg} passing yards/game - ${ypg < 200 ? 'run-first' : 'limited'} scheme`,
      compPct < 64
        ? `${compPct}% completion - accuracy concerns`
        : `Low volume: ${player.attempts} attempts over 11 games`,
      ints > tds / 3
        ? `${ints} INTs on ${tds} TDs - turnover prone`
        : `${rating} QB rating - ${rating < 90 ? 'below average' : 'decent but capped'}`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.id,
    team: teamName,
    position: 'QB',
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'Passing Yards',
    reasons,
    confidence,
    rawStats: player,
  };
}

// ============================================
// NBA ANALYSIS
// ============================================

function analyzeNBAPoints(player: NBAAggregatedStats, teamName: string): PlayerInsight {
  const ppg = player.pointsAverage;
  const fgPct = player.fgPercentage;
  const minutes = player.minutesAverage;
  const games = player.gamesPlayed;

  const isTarget = ppg >= 18 && fgPct >= 44 && minutes >= 28;

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = ppg >= 22 ? 'High' : 'Medium';
    reasons = [
      `${ppg} PPG average over ${games} games`,
      `${fgPct}% FG shooting - ${fgPct >= 47 ? 'elite' : 'solid'} efficiency`,
      `${minutes} minutes/game - ${minutes >= 32 ? 'heavy usage, closes games' : 'consistent role'}`,
    ];
  } else {
    confidence = ppg < 14 ? 'High' : 'Medium';
    reasons = [
      `Only ${ppg} PPG - ${ppg < 14 ? 'limited' : 'inconsistent'} scoring role`,
      fgPct < 44
        ? `${fgPct}% FG shooting - efficiency concerns`
        : `Only ${minutes} min/game - reduced opportunity`,
      `${games} games played - ${games < 30 ? 'limited sample size' : 'below expectations'}`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.playerId,
    team: teamName,
    position: player.position,
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'Points',
    reasons,
    confidence,
    rawStats: player,
  };
}

function analyzeNBARebounds(player: NBAAggregatedStats, teamName: string): PlayerInsight {
  const rpg = player.reboundsAverage;
  const minutes = player.minutesAverage;
  const position = player.position;

  // Centers/PFs expected to rebound more
  const isBig = ['C', 'PF', 'F-C', 'C-F'].includes(position);
  const threshold = isBig ? 7 : 5;

  const isTarget = rpg >= threshold && minutes >= 25;

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = rpg >= (isBig ? 9 : 6) ? 'High' : 'Medium';
    reasons = [
      `${rpg} RPG average - ${rpg >= 9 ? 'elite' : 'solid'} glass work`,
      `${position} position - ${isBig ? 'primary rebounder role' : 'versatile rebounding guard/wing'}`,
      `${minutes} min/game - ${minutes >= 30 ? 'high volume opportunity' : 'consistent minutes'}`,
    ];
  } else {
    confidence = rpg < 4 ? 'High' : 'Medium';
    reasons = [
      `Only ${rpg} RPG - ${rpg < 4 ? 'minimal' : 'limited'} rebounding production`,
      isBig
        ? `Undersized or perimeter-oriented for ${position}`
        : `${position} - not primary rebounding role`,
      `${minutes} min/game - ${minutes < 25 ? 'limited floor time' : 'not crashing boards'}`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.playerId,
    team: teamName,
    position: player.position,
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'Rebounds',
    reasons,
    confidence,
    rawStats: player,
  };
}

function analyzeNBAAssists(player: NBAAggregatedStats, teamName: string): PlayerInsight {
  const apg = player.assistsAverage;
  const topg = player.turnoversAverage;
  const minutes = player.minutesAverage;
  const position = player.position;

  const isGuard = ['PG', 'SG', 'G'].includes(position);
  const threshold = isGuard ? 5 : 3;

  const isTarget = apg >= threshold && minutes >= 25 && (topg === 0 || apg / topg >= 1.5);

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = apg >= (isGuard ? 7 : 5) ? 'High' : 'Medium';
    reasons = [
      `${apg} APG average - ${isGuard ? 'primary' : 'secondary'} facilitator`,
      topg > 0
        ? `${(apg / topg).toFixed(1)} AST/TO ratio - takes care of the ball`
        : `Clean playmaking with minimal turnovers`,
      `${minutes} min/game - ${minutes >= 32 ? 'full-time ball-handler' : 'consistent playmaking role'}`,
    ];
  } else {
    confidence = apg < 3 ? 'High' : 'Medium';
    reasons = [
      `Only ${apg} APG - ${apg < 3 ? 'off-ball' : 'limited'} playmaking role`,
      isGuard
        ? `Low assist rate for ${position} - not primary ball-handler`
        : `${position} position - scoring focused, not passing`,
      topg > 0 && apg / topg < 1.5
        ? `${apg}/${topg} AST/TO - turnover concerns`
        : `${minutes} min/game limits opportunity`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.playerId,
    team: teamName,
    position: player.position,
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'Assists',
    reasons,
    confidence,
    rawStats: player,
  };
}

// ============================================
// SOCCER ANALYSIS
// ============================================

function analyzeSoccerGoals(player: SoccerPlayerStats, teamName: string): PlayerInsight {
  const gpg = player.goalsPerGame;
  const goals = player.goals;
  const shots = player.shotsTotal;
  const accuracy = player.shotAccuracy;
  const position = player.position;

  const isAttacker = ['Attacker', 'Forward', 'Midfielder'].includes(position);
  const isTarget = gpg >= 0.3 && shots >= 20 && isAttacker;

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = gpg >= 0.5 ? 'High' : 'Medium';
    reasons = [
      `${goals} goals in ${player.appearances} games (${gpg} goals/game)`,
      `${shots} total shots with ${accuracy}% on target`,
      `${position} role - ${gpg >= 0.5 ? 'clinical finisher' : 'consistent goal threat'}`,
    ];
  } else {
    confidence = gpg < 0.15 ? 'High' : 'Medium';
    reasons = [
      `Only ${goals} goals in ${player.appearances} games (${gpg}/game)`,
      shots < 20
        ? `Low volume: only ${shots} shots all season`
        : `${accuracy}% shot accuracy - finishing concerns`,
      isAttacker
        ? `Underperforming in ${position} role`
        : `${position} - not primary goal scorer`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.playerId,
    team: teamName,
    position: player.position,
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'Anytime Goal Scorer',
    reasons,
    confidence,
    rawStats: player,
  };
}

function analyzeSoccerCards(player: SoccerPlayerStats, teamName: string): PlayerInsight {
  const yellows = player.yellowCards;
  const apps = player.appearances;
  const cardsPerGame = apps > 0 ? yellows / apps : 0;
  const position = player.position;

  // Defenders and defensive mids get more cards
  const isPhysicalPosition = ['Defender', 'Midfielder'].includes(position);
  const isTarget = cardsPerGame >= 0.25 && yellows >= 3;

  let reasons: [string, string, string];
  let confidence: 'High' | 'Medium' | 'Low';

  if (isTarget) {
    confidence = cardsPerGame >= 0.35 ? 'High' : 'Medium';
    reasons = [
      `${yellows} yellow cards in ${apps} games (${cardsPerGame.toFixed(2)}/game)`,
      `${position} - ${isPhysicalPosition ? 'physical, tackles often' : 'aggressive style'}`,
      `Card magnet - ${cardsPerGame >= 0.35 ? 'bookings expected' : 'high card rate'}`,
    ];
  } else {
    confidence = cardsPerGame < 0.1 ? 'High' : 'Medium';
    reasons = [
      `Only ${yellows} yellows in ${apps} games (${cardsPerGame.toFixed(2)}/game)`,
      isPhysicalPosition
        ? `Disciplined for a ${position}`
        : `${position} - minimal defensive contact`,
      `Clean player - ${yellows < 3 ? 'rarely booked' : 'avoids cards'}`,
    ];
  }

  return {
    playerName: player.name,
    playerId: player.playerId,
    team: teamName,
    position: player.position,
    verdict: isTarget ? 'TARGET' : 'AVOID',
    propType: 'To Be Booked',
    reasons,
    confidence,
    rawStats: player,
  };
}

// ============================================
// MAIN GENERATOR
// ============================================

export async function generateTargetAvoid(request: GenerateRequest): Promise<SlideshowPost> {
  const { league, teams, count = 2 } = request;

  const insights: PlayerInsight[] = [];

  if (league === 'NFL') {
    const teamCodes = teams?.length
      ? teams
      : NFL_TEAMS.filter((t) => t.statpalCode).map((t) => t.statpalCode!);

    for (const code of teamCodes.slice(0, 3)) {
      const stats = await getNFLPlayerStats(code);
      if (!stats) continue;

      const team = NFL_TEAMS.find((t) => t.statpalCode === code);
      const teamName = team?.name || code.toUpperCase();

      // Analyze receivers
      for (const receiver of stats.receiving.slice(0, 3)) {
        insights.push(analyzeNFLReceiver(receiver, teamName));
      }

      // Analyze rushers
      for (const rusher of stats.rushing.slice(0, 2)) {
        insights.push(analyzeNFLRusher(rusher, teamName));
      }

      // Analyze QB
      if (stats.passing) {
        insights.push(analyzeNFLPasser(stats.passing, teamName));
      }
    }
  } else if (league === 'NBA') {
    const teamIds = teams?.length
      ? teams.map((t) => parseInt(t))
      : NBA_TEAMS.filter((t) => t.id <= 41).map((t) => t.id); // Only real NBA teams

    for (const teamId of teamIds.slice(0, 3)) {
      const stats = await getNBAPlayerStats(teamId);
      if (!stats.length) continue;

      const team = NBA_TEAMS.find((t) => t.id === teamId);
      const teamName = team?.name || `Team ${teamId}`;

      // Analyze top players for different props
      for (const player of stats.slice(0, 5)) {
        insights.push(analyzeNBAPoints(player, teamName));
        insights.push(analyzeNBARebounds(player, teamName));
        insights.push(analyzeNBAAssists(player, teamName));
      }
    }
  } else if (league === 'SOCCER') {
    const teamIds = teams?.length
      ? teams.map((t) => parseInt(t))
      : [33, 40, 49, 50]; // Man United, Liverpool, Chelsea, Man City

    for (const teamId of teamIds.slice(0, 3)) {
      const stats = await getSoccerPlayerStats(teamId);
      if (!stats.length) continue;

      const team = SOCCER_TEAMS.find((t) => t.id === teamId);
      const teamName = team?.name || `Team ${teamId}`;

      // Analyze players
      for (const player of stats.slice(0, 5)) {
        insights.push(analyzeSoccerGoals(player, teamName));
        insights.push(analyzeSoccerCards(player, teamName));
      }
    }
  }

  // Sort by confidence, then split into TARGETs and AVOIDs
  const targets = insights
    .filter((i) => i.verdict === 'TARGET')
    .sort((a, b) => (b.confidence === 'High' ? 1 : 0) - (a.confidence === 'High' ? 1 : 0));

  const avoids = insights
    .filter((i) => i.verdict === 'AVOID')
    .sort((a, b) => (b.confidence === 'High' ? 1 : 0) - (a.confidence === 'High' ? 1 : 0));

  // Pick top TARGETs and AVOIDs
  const selected = [
    ...targets.slice(0, Math.ceil(count / 2)),
    ...avoids.slice(0, Math.floor(count / 2)),
  ];

  return {
    league,
    generatedAt: new Date().toISOString(),
    players: selected,
  };
}

// ============================================
// FORMAT OUTPUT FOR DISPLAY
// ============================================

export function formatForDisplay(insight: PlayerInsight): string {
  const emoji = insight.verdict === 'TARGET' ? '🎯' : '🚫';

  return `${emoji} ${insight.verdict}: ${insight.playerName}

• ${insight.reasons[0]}
• ${insight.reasons[1]}
• ${insight.reasons[2]}`;
}

export function formatSlideshowPost(post: SlideshowPost): string {
  return post.players.map(formatForDisplay).join('\n\n---\n\n');
}
