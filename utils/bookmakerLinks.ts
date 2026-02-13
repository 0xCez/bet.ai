import { Linking, Platform } from 'react-native';
import { openBrowserAsync } from 'expo-web-browser';

export interface BookmakerLinkConfig {
  key: string;
  displayName: string;
  webUrl: string;
  /** Sport-specific path segments appended to webUrl */
  sportPaths: Record<string, string>;
  /** Deep link scheme for the native app (null if none known) */
  appScheme: string | null;
  /** Affiliate query params — populate when affiliate accounts are set up */
  affiliateParams: Record<string, string>;
}

const BOOKMAKER_CONFIGS: BookmakerLinkConfig[] = [
  {
    key: 'draftkings',
    displayName: 'DraftKings',
    webUrl: 'https://sportsbook.draftkings.com',
    sportPaths: {
      nba: '/leagues/basketball/nba',
      nfl: '/leagues/football/nfl',
      soccer: '/leagues/soccer',
    },
    appScheme: 'draftkings://',
    affiliateParams: {},
  },
  {
    key: 'fanduel',
    displayName: 'FanDuel',
    webUrl: 'https://sportsbook.fanduel.com',
    sportPaths: {
      nba: '/navigation/nba',
      nfl: '/navigation/nfl',
      soccer: '/navigation/soccer',
    },
    appScheme: 'fanduel://',
    affiliateParams: {},
  },
  {
    key: 'betmgm',
    displayName: 'BetMGM',
    webUrl: 'https://sports.betmgm.com',
    sportPaths: {
      nba: '/sports/basketball',
      nfl: '/sports/football',
      soccer: '/sports/soccer',
    },
    appScheme: 'betmgm://',
    affiliateParams: {},
  },
  {
    key: 'pinnacle',
    displayName: 'Pinnacle',
    webUrl: 'https://www.pinnacle.com',
    sportPaths: {
      nba: '/en/basketball/nba',
      nfl: '/en/football/nfl',
      soccer: '/en/soccer',
    },
    appScheme: null,
    affiliateParams: {},
  },
  {
    key: 'caesars',
    displayName: 'Caesars',
    webUrl: 'https://www.caesars.com/sportsbook-and-casino',
    sportPaths: {
      nba: '/sport/basketball/nba',
      nfl: '/sport/football/nfl',
      soccer: '/sport/soccer',
    },
    appScheme: 'caesarssportsbook://',
    affiliateParams: {},
  },
  {
    key: 'betrivers',
    displayName: 'BetRivers',
    webUrl: 'https://www.betrivers.com',
    sportPaths: {
      nba: '/sports/basketball/nba',
      nfl: '/sports/football/nfl',
      soccer: '/sports/soccer',
    },
    appScheme: 'betrivers://',
    affiliateParams: {},
  },
  {
    key: 'bovada',
    displayName: 'Bovada',
    webUrl: 'https://www.bovada.lv',
    sportPaths: {
      nba: '/sports/basketball/nba',
      nfl: '/sports/football/nfl',
      soccer: '/sports/soccer',
    },
    appScheme: null,
    affiliateParams: {},
  },
  {
    key: 'betus',
    displayName: 'BetUS',
    webUrl: 'https://www.betus.com.pa',
    sportPaths: {
      nba: '/sportsbook/basketball/nba',
      nfl: '/sportsbook/football/nfl',
      soccer: '/sportsbook/soccer',
    },
    appScheme: null,
    affiliateParams: {},
  },
  {
    key: 'mybookieag',
    displayName: 'MyBookie.ag',
    webUrl: 'https://www.mybookie.ag',
    sportPaths: {
      nba: '/sportsbook/nba',
      nfl: '/sportsbook/nfl',
      soccer: '/sportsbook/soccer',
    },
    appScheme: null,
    affiliateParams: {},
  },
  {
    key: 'espnbet',
    displayName: 'ESPN BET',
    webUrl: 'https://espnbet.com',
    sportPaths: {
      nba: '/sport/basketball/organization/nba',
      nfl: '/sport/football/organization/nfl',
      soccer: '/sport/soccer',
    },
    appScheme: 'espnbet://',
    affiliateParams: {},
  },
  {
    key: 'fanatics',
    displayName: 'Fanatics',
    webUrl: 'https://sportsbook.fanatics.com',
    sportPaths: {
      nba: '/sports/basketball/nba',
      nfl: '/sports/football/nfl',
      soccer: '/sports/soccer',
    },
    appScheme: 'fanaticssportsbook://',
    affiliateParams: {},
  },
  {
    key: 'ballybet',
    displayName: 'Bally Bet',
    webUrl: 'https://www.ballybet.com',
    sportPaths: {
      nba: '/sports/basketball',
      nfl: '/sports/football',
      soccer: '/sports/soccer',
    },
    appScheme: 'ballybet://',
    affiliateParams: {},
  },
  {
    key: 'hardrockbet',
    displayName: 'Hard Rock Bet',
    webUrl: 'https://www.hardrockbet.com',
    sportPaths: {
      nba: '/sports/basketball',
      nfl: '/sports/football',
      soccer: '/sports/soccer',
    },
    appScheme: 'hardrockbet://',
    affiliateParams: {},
  },
  {
    key: 'lowvig',
    displayName: 'LowVig.ag',
    webUrl: 'https://www.lowvig.ag',
    sportPaths: {},
    appScheme: null,
    affiliateParams: {},
  },
  {
    key: 'betonlineag',
    displayName: 'BetOnline.ag',
    webUrl: 'https://www.betonline.ag',
    sportPaths: {
      nba: '/sportsbook/basketball/nba',
      nfl: '/sportsbook/football/nfl',
      soccer: '/sportsbook/soccer',
    },
    appScheme: null,
    affiliateParams: {},
  },
];

// Build lookup indexes once
const configByKey = new Map<string, BookmakerLinkConfig>();
const configByDisplayName = new Map<string, BookmakerLinkConfig>();

BOOKMAKER_CONFIGS.forEach((config) => {
  configByKey.set(config.key, config);
  configByDisplayName.set(config.displayName, config);
});

/**
 * Resolve a BookmakerLinkConfig from either a bookmakerKey (e.g. "draftkings")
 * or a display name (e.g. "DraftKings").
 */
export function getBookmakerConfig(
  bookmakerKeyOrName?: string
): BookmakerLinkConfig | null {
  if (!bookmakerKeyOrName) return null;

  const byKey = configByKey.get(bookmakerKeyOrName);
  if (byKey) return byKey;

  const byName = configByDisplayName.get(bookmakerKeyOrName);
  if (byName) return byName;

  // Fallback: case-insensitive normalized comparison
  const normalized = bookmakerKeyOrName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const config of BOOKMAKER_CONFIGS) {
    if (
      config.key.replace(/[^a-z0-9]/g, '') === normalized ||
      config.displayName.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized
    ) {
      return config;
    }
  }

  return null;
}

/**
 * Build the full URL for a bookmaker, optionally targeting a specific sport page.
 */
export function buildBookmakerUrl(
  config: BookmakerLinkConfig,
  sport?: string
): string {
  // Normalize sport key (handle "soccer_epl", "americanfootball_nfl", etc.)
  let sportKey = sport?.toLowerCase() || '';
  if (sportKey.includes('soccer') || sportKey.includes('epl') || sportKey.includes('premier')) {
    sportKey = 'soccer';
  } else if (sportKey.includes('nba') || sportKey.includes('basketball')) {
    sportKey = 'nba';
  } else if (sportKey.includes('nfl') || sportKey.includes('football')) {
    sportKey = 'nfl';
  }

  const basePath = config.sportPaths[sportKey] || '';
  const fullUrl = config.webUrl + basePath;

  const url = new URL(fullUrl);
  Object.entries(config.affiliateParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

/**
 * Open the bookmaker's app (if installed) or fall back to the in-app browser.
 * Returns true if a link was opened, false if the bookmaker was not found.
 */
export async function openBookmakerLink(
  bookmakerKeyOrName?: string,
  sport?: string
): Promise<boolean> {
  const config = getBookmakerConfig(bookmakerKeyOrName);
  if (!config) return false;

  // Try native app deep link first (mobile only)
  if (config.appScheme && Platform.OS !== 'web') {
    try {
      const canOpen = await Linking.canOpenURL(config.appScheme);
      if (canOpen) {
        await Linking.openURL(config.appScheme);
        return true;
      }
    } catch {
      // Fall through to web URL
    }
  }

  // Fallback: open sport-specific page in the in-app browser
  const webUrl = buildBookmakerUrl(config, sport);
  await openBrowserAsync(webUrl);
  return true;
}
