import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { collection, query, where, getDocsFromServer } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { CachedGame } from "../../components/ui/CachedGameCard";

interface UseCachedGamesResult {
  games: CachedGame[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch ALL pre-cached games from Firestore
 * Always fetches from server (bypasses offline cache)
 * Returns games sorted by game start time (soonest first)
 */
export const useCachedGames = (): UseCachedGamesResult => {
  const [games, setGames] = useState<CachedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCachedGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const cacheRef = collection(db, "matchAnalysisCache");

      // Query for ALL pre-cached games (no limit)
      const q = query(
        cacheRef,
        where("preCached", "==", true)
      );

      // ALWAYS fetch from server - never use cached data
      const snapshot = await getDocsFromServer(q);

      console.log(`[useCachedGames] Fetched ${snapshot.size} pre-cached games from server`);

      const cachedGames: CachedGame[] = [];
      const now = new Date();
      const nowIso = now.toISOString();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const gameStartTime = data.gameStartTime || data.analysis?.gameStartTime;

        // Only filter out games that have ENDED (started more than 4 hours ago)
        // We keep games that haven't started yet OR are currently in progress
        const fourHoursMs = 4 * 60 * 60 * 1000;
        const gameStartedTooLongAgo = gameStartTime &&
          new Date(gameStartTime).getTime() < (Date.now() - fourHoursMs);

        // Check expiry
        const isExpired = data.expiresAt && data.expiresAt < nowIso;

        if (isExpired || gameStartedTooLongAgo) {
          console.log(`[useCachedGames] Skipping expired/ended game: ${data.analysis?.teams?.home} vs ${data.analysis?.teams?.away}`);
          return;
        }

        const analysis = data.analysis || {};
        const teams = analysis.teams || {};
        const team1Name = teams.home || "Team 1";
        const team2Name = teams.away || "Team 2";

        // Extract confidence from market consensus
        const marketConsensusDisplay = analysis.keyInsightsNew?.marketConsensus?.display;
        const extractedConfidence = marketConsensusDisplay
          ? parseInt(marketConsensusDisplay.match(/(\d+)%/)?.[1] || '0', 10)
          : null;
        const confidence = extractedConfidence || 75;

        cachedGames.push({
          id: doc.id,
          sport: data.sport as "nba" | "soccer",
          team1: team1Name,
          team2: team2Name,
          team1Id: data.team1Id,
          team2Id: data.team2Id,
          confidence: confidence,
          league: analysis.league || undefined,
          timestamp: data.timestamp,
          gameStartTime: gameStartTime,
          analysis: analysis,
        });
      });

      // Sort by game start time (soonest first)
      cachedGames.sort((a, b) => {
        const timeA = a.gameStartTime ? new Date(a.gameStartTime).getTime() : Infinity;
        const timeB = b.gameStartTime ? new Date(b.gameStartTime).getTime() : Infinity;
        return timeA - timeB;
      });

      console.log(`[useCachedGames] Returning ${cachedGames.length} valid games`);
      setGames(cachedGames);
    } catch (err) {
      console.error("[useCachedGames] Error fetching cached games:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch games");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchCachedGames();
  }, [fetchCachedGames]);

  // Refresh when app comes back to foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      // App came to foreground from background
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        console.log("[useCachedGames] App returned to foreground, refreshing games...");
        fetchCachedGames();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchCachedGames]);

  return {
    games,
    loading,
    error,
    refresh: fetchCachedGames,
  };
};

export default useCachedGames;
