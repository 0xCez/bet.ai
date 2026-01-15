import { useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-react-native';
import { auth } from '@/firebaseConfig';

interface PageTrackingOptions {
  pageName: string;
  metadata?: Record<string, any>;
}

/**
 * Custom hook to track page views and time spent on page
 * Usage: usePageTracking({ pageName: 'market-intel', metadata: { sport: 'nba' } })
 */
export function usePageTracking({ pageName, metadata = {} }: PageTrackingOptions) {
  const posthog = usePostHog();
  const pageEntryTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Only track for logged in users
    if (!auth.currentUser) return;

    // Record entry time
    pageEntryTimeRef.current = Date.now();

    // Track page entry
    posthog?.capture(`${pageName}_viewed`, {
      userId: auth.currentUser.uid,
      timestamp: new Date().toISOString(),
      ...metadata,
    });

    // Cleanup: Track page exit and time spent
    return () => {
      if (pageEntryTimeRef.current && auth.currentUser) {
        const timeSpentMs = Date.now() - pageEntryTimeRef.current;
        const timeSpentSeconds = Math.round(timeSpentMs / 1000);

        posthog?.capture(`${pageName}_exit`, {
          userId: auth.currentUser.uid,
          timeSpentSeconds: timeSpentSeconds,
          timeSpentMinutes: Math.round((timeSpentSeconds / 60) * 10) / 10,
          timestamp: new Date().toISOString(),
          ...metadata,
        });

        pageEntryTimeRef.current = null;
      }
    };
  }, [pageName, JSON.stringify(metadata)]);
}
