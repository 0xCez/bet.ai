/**
 * Slideshow Generator - Configuration & API Keys
 *
 * All API keys are included - no external config needed.
 */

export interface Config {
  statpal: {
    apiKey: string;
    baseUrl: string;
  };
  apiSports: {
    apiKey: string;
    nbaBaseUrl: string;
    soccerBaseUrl: string;
    nflBaseUrl: string;
  };
  theOddsApi: {
    apiKey: string;
    baseUrl: string;
  };
}

// All API keys included - ready to use out of the box
export const config: Config = {
  // StatPal - NFL & MLB player stats
  statpal: {
    apiKey: '39ac2518-b037-4c2c-97af-8176590e886e',
    baseUrl: 'https://statpal.io/api/v1',
  },
  // API-Sports - NBA & Soccer player stats
  apiSports: {
    apiKey: '77fea40da4ce95b70120be298555b660',
    nbaBaseUrl: 'https://v2.nba.api-sports.io',
    soccerBaseUrl: 'https://v3.football.api-sports.io',
    nflBaseUrl: 'https://v1.american-football.api-sports.io',
  },
  // TheOddsAPI - Live betting odds
  theOddsApi: {
    apiKey: 'c47264a2786aad2554daec3a87b1ce2a',
    baseUrl: 'https://api.the-odds-api.com/v4',
  },
};

// Helper to validate config (always returns true since keys are hardcoded)
export function validateConfig(): boolean {
  return true;
}
