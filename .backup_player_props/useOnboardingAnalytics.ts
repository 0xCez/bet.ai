import { useCallback, useEffect, useRef } from 'react';
import { usePostHog } from 'posthog-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

const ANALYTICS_ID_KEY = '@analytics_distinct_id';

// Funnel step types for type safety
type OnboardingStep =
  | 'carousel_started'
  | 'carousel_completed'
  | 'welcome_viewed'
  | 'signup_started'
  | 'signup_completed'
  | 'loading_viewed'
  | 'tutorial_viewed'
  | 'paywall_viewed'
  | 'paywall_plan_selected'
  | 'paywall_purchase_attempted'
  | 'paywall_purchase_success'
  | 'paywall_purchase_failed'
  | 'login_viewed'
  | 'login_success';

interface FunnelProperties {
  plan?: 'annual' | 'weekly';
  method?: 'apple' | 'google';
  error?: string;
  [key: string]: any;
}

/**
 * Generates a distinct ID with download date and country
 * Format: YYYYMMDD_XX_randomId (e.g., 20241224_US_a1b2c3d4)
 */
const generateDistinctId = (): string => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

  // Get country code from device locale
  const locales = Localization.getLocales();
  const countryCode = locales[0]?.regionCode || 'XX';

  // Generate random suffix
  const randomSuffix = Math.random().toString(36).substring(2, 10);

  return `${dateStr}_${countryCode}_${randomSuffix}`;
};

/**
 * Hook for tracking onboarding funnel events
 *
 * Usage:
 * const { trackFunnelStep } = useOnboardingAnalytics();
 * trackFunnelStep('carousel_started');
 * trackFunnelStep('paywall_plan_selected', { plan: 'annual' });
 */
export function useOnboardingAnalytics() {
  const posthog = usePostHog();
  const isIdentified = useRef(false);

  // Identify user on mount
  useEffect(() => {
    const identifyUser = async () => {
      if (isIdentified.current) return;

      try {
        // Check if we already have a distinct ID
        let distinctId = await AsyncStorage.getItem(ANALYTICS_ID_KEY);

        if (!distinctId) {
          // Generate new ID with date + country
          distinctId = generateDistinctId();
          await AsyncStorage.setItem(ANALYTICS_ID_KEY, distinctId);
        }

        // Identify the user in PostHog
        posthog?.identify(distinctId, {
          first_seen: distinctId.slice(0, 8), // Extract date part
          country: distinctId.slice(9, 11),   // Extract country part
        });

        isIdentified.current = true;
      } catch (error) {
        console.error('[Analytics] Error identifying user:', error);
      }
    };

    identifyUser();
  }, [posthog]);

  /**
   * Track a funnel step event
   */
  const trackFunnelStep = useCallback(
    (step: OnboardingStep, properties?: FunnelProperties) => {
      posthog?.capture('onboarding_funnel', {
        step,
        ...properties,
      });
    },
    [posthog]
  );

  /**
   * Track when user upgrades from anonymous to authenticated
   * Call this after successful login to link the anonymous user to their account
   */
  const linkAuthenticatedUser = useCallback(
    async (firebaseUid: string, email?: string) => {
      try {
        const distinctId = await AsyncStorage.getItem(ANALYTICS_ID_KEY);

        // Alias the Firebase UID to the anonymous ID
        if (distinctId) {
          posthog?.alias(firebaseUid);
        }

        // Update user properties with authenticated info
        posthog?.identify(firebaseUid, {
          email: email || null,
          authenticated: true,
          anonymous_id: distinctId || null,
        });
      } catch (error) {
        console.error('[Analytics] Error linking authenticated user:', error);
      }
    },
    [posthog]
  );

  return {
    trackFunnelStep,
    linkAuthenticatedUser,
  };
}
