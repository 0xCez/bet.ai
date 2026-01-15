/**
 * Firestore-based shared cache for Player Props
 *
 * This allows props data to be shared across users for the same game,
 * reducing API calls. Data expires after 24 hours.
 */

import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// Collection name for cached props
const PROPS_CACHE_COLLECTION = 'propsCache';

// Cache TTL: 24 hours in milliseconds
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Interface matching PlayerPropsResult from player-props.tsx
interface CachedPropsData {
  sport: string;
  teams: {
    home: string;
    away: string;
    logos: { home: string; away: string };
  };
  playerProps: {
    team1: any[];
    team2: any[];
  };
  timestamp: string;
}

interface CachedPropsDocument {
  data: CachedPropsData;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/**
 * Generate a consistent cache key from game parameters
 * Normalizes team names to ensure consistent matching
 */
export const generatePropsCacheKey = (
  team1: string,
  team2: string,
  sport: string
): string => {
  // Normalize: lowercase, remove extra spaces, sort alphabetically
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, '_');
  const teams = [normalize(team1), normalize(team2)].sort();
  return `${normalize(sport)}_${teams[0]}_${teams[1]}`;
};

/**
 * Check if cached data is still valid (not expired)
 */
const isCacheValid = (expiresAt: Timestamp): boolean => {
  return expiresAt.toMillis() > Date.now();
};

/**
 * Get cached props from Firestore
 * Returns null if not found or expired
 */
export const getPropsFromFirestore = async (
  team1: string,
  team2: string,
  sport: string
): Promise<CachedPropsData | null> => {
  try {
    const cacheKey = generatePropsCacheKey(team1, team2, sport);
    const docRef = doc(db, PROPS_CACHE_COLLECTION, cacheKey);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log('[PropsCache] No cached data found in Firestore');
      return null;
    }

    const cached = docSnap.data() as CachedPropsDocument;

    // Check if cache has expired
    if (!isCacheValid(cached.expiresAt)) {
      console.log('[PropsCache] Cached data expired');
      return null;
    }

    console.log('[PropsCache] Valid cached data found in Firestore');
    return cached.data;
  } catch (error) {
    console.error('[PropsCache] Error reading from Firestore:', error);
    return null;
  }
};

/**
 * Save props to Firestore cache
 * Sets expiration to 24 hours from now
 */
export const savePropsToFirestore = async (
  team1: string,
  team2: string,
  sport: string,
  data: CachedPropsData
): Promise<void> => {
  try {
    const cacheKey = generatePropsCacheKey(team1, team2, sport);
    const docRef = doc(db, PROPS_CACHE_COLLECTION, cacheKey);

    const now = Date.now();
    const cacheDoc: CachedPropsDocument = {
      data,
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + CACHE_TTL_MS),
    };

    await setDoc(docRef, cacheDoc);
    console.log('[PropsCache] Saved to Firestore cache:', cacheKey);
  } catch (error) {
    console.error('[PropsCache] Error saving to Firestore:', error);
    // Don't throw - caching failure shouldn't break the app
  }
};

/**
 * Get remaining TTL for cached data (for display purposes)
 * Returns hours remaining, or null if not cached
 */
export const getCacheTTL = async (
  team1: string,
  team2: string,
  sport: string
): Promise<number | null> => {
  try {
    const cacheKey = generatePropsCacheKey(team1, team2, sport);
    const docRef = doc(db, PROPS_CACHE_COLLECTION, cacheKey);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const cached = docSnap.data() as CachedPropsDocument;
    const remainingMs = cached.expiresAt.toMillis() - Date.now();

    if (remainingMs <= 0) return null;

    return Math.ceil(remainingMs / (60 * 60 * 1000)); // Hours remaining
  } catch (error) {
    return null;
  }
};
