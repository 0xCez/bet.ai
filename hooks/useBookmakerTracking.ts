import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';
import { auth } from '@/firebaseConfig';
import { BookmakerLinkConfig } from '@/utils/bookmakerLinks';

interface BookmakerTrackingOptions {
  section: 'best_lines' | 'odds_table' | 'ev_opportunities';
  sport?: string;
  team1?: string;
  team2?: string;
}

export function useBookmakerTracking({ section, sport, team1, team2 }: BookmakerTrackingOptions) {
  const posthog = usePostHog();

  const trackBookmakerTap = useCallback(
    (bookmaker: string, config: BookmakerLinkConfig) => {
      posthog?.capture('bookmaker_link_tapped', {
        userId: auth.currentUser?.uid ?? null,
        bookmaker,
        bookmakerKey: config.key,
        section,
        sport: sport ?? null,
        team1: team1 ?? null,
        team2: team2 ?? null,
        timestamp: new Date().toISOString(),
      });
    },
    [posthog, section, sport, team1, team2]
  );

  return trackBookmakerTap;
}
