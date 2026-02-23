/**
 * Shared formatting helpers used across multiple components.
 * Consolidates duplicated code from PlayerPropCard, ParlayBuilder, ParlayLegCard.
 */

// ── Team Abbreviations ──

const TEAM_ABBREVIATIONS: { [key: string]: string } = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "LA Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

export const getTeamAbbreviation = (teamName?: string): string => {
  if (!teamName) return "TBD";
  return TEAM_ABBREVIATIONS[teamName] || teamName.substring(0, 3).toUpperCase();
};

// ── Stat Type Formatting ──

const STAT_FORMAT_MAP: { [key: string]: string } = {
  points: "PTS",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TO",
  three_pointers_made: "3PT",
  threepointersmade: "3PT",
  threes: "3PT",
  "points+rebounds": "PTS+REB",
  "points+assists": "PTS+AST",
  "rebounds+assists": "REB+AST",
  "points+rebounds+assists": "PRA",
  "blocks+steals": "BLK+STL",
  pts_rebs_asts: "PRA",
  double_double: "DD",
};

export const formatStatType = (statType: string): string => {
  return STAT_FORMAT_MAP[statType.toLowerCase()] || statType.replace(/[_+]/g, "+").toUpperCase();
};

// ── Odds Formatting ──

export const formatOdds = (odds: number): string => {
  return odds > 0 ? `+${odds}` : `${odds}`;
};

// ── Game Time Formatting ──

export const formatGameTime = (isoString?: string): string | null => {
  if (!isoString) return null;
  const gameDate = new Date(isoString);
  const now = new Date();
  const isToday = gameDate.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = gameDate.toDateString() === tomorrow.toDateString();
  const timeStr = gameDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (isToday) return `Today ${timeStr}`;
  if (isTomorrow) return `Tmrw ${timeStr}`;
  const dayStr = gameDate.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayStr} ${timeStr}`;
};

// ── Bookmaker Logos ──

export const BOOKMAKER_LOGOS: Record<string, any> = {
  DraftKings: require("../assets/images/Draftkings.png"),
  FanDuel: require("../assets/images/Fanduel.png"),
  BetMGM: require("../assets/images/Betmgm.png"),
  Caesars: require("../assets/images/Caesars.png"),
  ESPNBet: require("../assets/images/Espnbet.png"),
  "ESPN BET": require("../assets/images/Espnbet.png"),
  BetRivers: require("../assets/images/Betrivers.png"),
  Bovada: require("../assets/images/Bovada.png"),
  Fanatics: require("../assets/images/fanatics.png"),
  "Hard Rock": require("../assets/images/Hardrockbet.png"),
  BallyBet: require("../assets/images/Ballybet.png"),
  MyBookie: require("../assets/images/mybookie.png"),
  BetOnline: require("../assets/images/Betonline.png"),
  BetUS: require("../assets/images/Betus.png"),
  // Short codes from backend (shortBook mapping)
  DK: require("../assets/images/Draftkings.png"),
  FD: require("../assets/images/Fanduel.png"),
  MGM: require("../assets/images/Betmgm.png"),
  CAESARS: require("../assets/images/Caesars.png"),
  ESPN: require("../assets/images/Espnbet.png"),
  BR: require("../assets/images/Betrivers.png"),
  BOV: require("../assets/images/Bovada.png"),
  FAN: require("../assets/images/fanatics.png"),
  HR: require("../assets/images/Hardrockbet.png"),
  BALLY: require("../assets/images/Ballybet.png"),
  MYBK: require("../assets/images/mybookie.png"),
  BOL: require("../assets/images/Betonline.png"),
  BETUS: require("../assets/images/Betus.png"),
};

// Reverse map: short code → full bookmaker key for openBookmakerLink
export const SHORT_TO_BOOKMAKER: Record<string, string> = {
  DK: "draftkings",
  FD: "fanduel",
  MGM: "betmgm",
  CAESARS: "caesars",
  ESPN: "espnbet",
  BR: "betrivers",
  BOV: "bovada",
  FAN: "fanatics",
  HR: "hardrockbet",
  BALLY: "ballybet",
  BET365: "bet365",
  UNI: "unibet",
  MYBK: "mybookieag",
  BOL: "betonlineag",
  BETUS: "betus",
  // Full names also work
  DraftKings: "draftkings",
  FanDuel: "fanduel",
  BetMGM: "betmgm",
  Caesars: "caesars",
  ESPNBet: "espnbet",
  BetRivers: "betrivers",
  Bovada: "bovada",
  Fanatics: "fanatics",
  "Hard Rock": "hardrockbet",
  BallyBet: "ballybet",
  MyBookie: "mybookieag",
  BetOnline: "betonlineag",
  BetUS: "betus",
};
