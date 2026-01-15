/**
 * Team Data for all leagues
 *
 * Includes API-Sports IDs and StatPal codes for mapping
 */

import { Team } from '../types';

export const NFL_TEAMS: Team[] = [
  { id: 1, name: "Las Vegas Raiders", code: "LV", statpalCode: "oak" },
  { id: 2, name: "Jacksonville Jaguars", code: "JAX", statpalCode: "jac" },
  { id: 3, name: "New England Patriots", code: "NE", statpalCode: "ne" },
  { id: 4, name: "New York Giants", code: "NYG", statpalCode: "nyg" },
  { id: 5, name: "Baltimore Ravens", code: "BAL", statpalCode: "bal" },
  { id: 6, name: "Tennessee Titans", code: "TEN", statpalCode: "ten" },
  { id: 7, name: "Detroit Lions", code: "DET", statpalCode: "det" },
  { id: 8, name: "Atlanta Falcons", code: "ATL", statpalCode: "atl" },
  { id: 9, name: "Cleveland Browns", code: "CLE", statpalCode: "cle" },
  { id: 10, name: "Cincinnati Bengals", code: "CIN", statpalCode: "cin" },
  { id: 11, name: "Arizona Cardinals", code: "ARI", statpalCode: "ari" },
  { id: 12, name: "Philadelphia Eagles", code: "PHI", statpalCode: "phi" },
  { id: 13, name: "New York Jets", code: "NYJ", statpalCode: "nyj" },
  { id: 14, name: "San Francisco 49ers", code: "SF", statpalCode: "sf" },
  { id: 15, name: "Green Bay Packers", code: "GB", statpalCode: "gb" },
  { id: 16, name: "Chicago Bears", code: "CHI", statpalCode: "chi" },
  { id: 17, name: "Kansas City Chiefs", code: "KC", statpalCode: "kc" },
  { id: 18, name: "Washington Commanders", code: "WAS", statpalCode: "wsh" },
  { id: 19, name: "Carolina Panthers", code: "CAR", statpalCode: "car" },
  { id: 20, name: "Buffalo Bills", code: "BUF", statpalCode: "buf" },
  { id: 21, name: "Indianapolis Colts", code: "IND", statpalCode: "ind" },
  { id: 22, name: "Pittsburgh Steelers", code: "PIT", statpalCode: "pit" },
  { id: 23, name: "Seattle Seahawks", code: "SEA", statpalCode: "sea" },
  { id: 24, name: "Tampa Bay Buccaneers", code: "TB", statpalCode: "tb" },
  { id: 25, name: "Miami Dolphins", code: "MIA", statpalCode: "mia" },
  { id: 26, name: "Houston Texans", code: "HOU", statpalCode: "hou" },
  { id: 27, name: "New Orleans Saints", code: "NO", statpalCode: "no" },
  { id: 28, name: "Denver Broncos", code: "DEN", statpalCode: "den" },
  { id: 29, name: "Dallas Cowboys", code: "DAL", statpalCode: "dal" },
  { id: 30, name: "Los Angeles Chargers", code: "LAC", statpalCode: "sd" },
  { id: 31, name: "Los Angeles Rams", code: "LA", statpalCode: "stl" },
  { id: 32, name: "Minnesota Vikings", code: "MIN", statpalCode: "min" },
];

export const NBA_TEAMS: Team[] = [
  { id: 1, name: "Atlanta Hawks", code: "ATL", statpalCode: "atl" },
  { id: 2, name: "Boston Celtics", code: "BOS", statpalCode: "bos" },
  { id: 4, name: "Brooklyn Nets", code: "BKN", statpalCode: "nj" },
  { id: 5, name: "Charlotte Hornets", code: "CHA", statpalCode: "cha" },
  { id: 6, name: "Chicago Bulls", code: "CHI", statpalCode: "chi" },
  { id: 7, name: "Cleveland Cavaliers", code: "CLE", statpalCode: "cle" },
  { id: 8, name: "Dallas Mavericks", code: "DAL", statpalCode: "dal" },
  { id: 9, name: "Denver Nuggets", code: "DEN", statpalCode: "den" },
  { id: 10, name: "Detroit Pistons", code: "DET", statpalCode: "det" },
  { id: 11, name: "Golden State Warriors", code: "GSW", statpalCode: "gs" },
  { id: 14, name: "Houston Rockets", code: "HOU", statpalCode: "hou" },
  { id: 15, name: "Indiana Pacers", code: "IND", statpalCode: "ind" },
  { id: 16, name: "LA Clippers", code: "LAC", statpalCode: "lac" },
  { id: 17, name: "Los Angeles Lakers", code: "LAL", statpalCode: "lal" },
  { id: 19, name: "Memphis Grizzlies", code: "MEM", statpalCode: "mem" },
  { id: 20, name: "Miami Heat", code: "MIA", statpalCode: "mia" },
  { id: 21, name: "Milwaukee Bucks", code: "MIL", statpalCode: "mil" },
  { id: 22, name: "Minnesota Timberwolves", code: "MIN", statpalCode: "min" },
  { id: 23, name: "New Orleans Pelicans", code: "NOP", statpalCode: "no" },
  { id: 24, name: "New York Knicks", code: "NYK", statpalCode: "ny" },
  { id: 25, name: "Oklahoma City Thunder", code: "OKC", statpalCode: "okc" },
  { id: 26, name: "Orlando Magic", code: "ORL", statpalCode: "orl" },
  { id: 27, name: "Philadelphia 76ers", code: "PHI", statpalCode: "phi" },
  { id: 28, name: "Phoenix Suns", code: "PHX", statpalCode: "phx" },
  { id: 29, name: "Portland Trail Blazers", code: "POR", statpalCode: "por" },
  { id: 30, name: "Sacramento Kings", code: "SAC", statpalCode: "sac" },
  { id: 31, name: "San Antonio Spurs", code: "SAS", statpalCode: "sa" },
  { id: 38, name: "Toronto Raptors", code: "TOR", statpalCode: "tor" },
  { id: 40, name: "Utah Jazz", code: "UTA", statpalCode: "utah" },
  { id: 41, name: "Washington Wizards", code: "WAS", statpalCode: "wsh" },
];

export const SOCCER_TEAMS: Team[] = [
  // Premier League
  { id: 33, name: "Manchester United", code: "MUN" },
  { id: 34, name: "Newcastle", code: "NEW" },
  { id: 35, name: "Bournemouth", code: "BOU" },
  { id: 36, name: "Fulham", code: "FUL" },
  { id: 39, name: "Wolves", code: "WOL" },
  { id: 40, name: "Liverpool", code: "LIV" },
  { id: 41, name: "Southampton", code: "SOU" },
  { id: 42, name: "Arsenal", code: "ARS" },
  { id: 45, name: "Everton", code: "EVE" },
  { id: 46, name: "Leicester", code: "LEI" },
  { id: 47, name: "Tottenham", code: "TOT" },
  { id: 48, name: "West Ham", code: "WHU" },
  { id: 49, name: "Chelsea", code: "CHE" },
  { id: 50, name: "Manchester City", code: "MCI" },
  { id: 51, name: "Brighton", code: "BHA" },
  { id: 52, name: "Crystal Palace", code: "CRY" },
  { id: 55, name: "Brentford", code: "BRE" },
  { id: 63, name: "Leeds", code: "LEE" },
  { id: 65, name: "Nottingham Forest", code: "NFO" },
  { id: 66, name: "Aston Villa", code: "AVL" },
  { id: 1359, name: "Ipswich Town", code: "IPS" },
];

// Helper functions
export function getTeamByCode(league: string, code: string): Team | undefined {
  const teams = league === 'NFL' ? NFL_TEAMS : league === 'NBA' ? NBA_TEAMS : SOCCER_TEAMS;
  return teams.find((t) => t.code.toLowerCase() === code.toLowerCase() || t.statpalCode === code.toLowerCase());
}

export function getTeamById(league: string, id: number): Team | undefined {
  const teams = league === 'NFL' ? NFL_TEAMS : league === 'NBA' ? NBA_TEAMS : SOCCER_TEAMS;
  return teams.find((t) => t.id === id);
}

export function getAllTeams(league: string): Team[] {
  if (league === 'NFL') return NFL_TEAMS;
  if (league === 'NBA') return NBA_TEAMS.filter((t) => t.id <= 41);
  if (league === 'SOCCER') return SOCCER_TEAMS;
  return [];
}
