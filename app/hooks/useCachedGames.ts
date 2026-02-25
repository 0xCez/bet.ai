import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { collection, query, where, getDocsFromServer, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { CachedGame } from "../../components/ui/CachedGameCard";
import type { SportId } from "../../config/sports";

interface UseCachedGamesResult {
  games: CachedGame[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Parse a Firestore doc into a CachedGame object.
 * Works for both matchAnalysisCache and gameArchive docs.
 */
function docToCachedGame(doc: any, source: "cache" | "archive"): CachedGame | null {
  const data = doc.data();
  const gameStartTime = data.gameStartTime || data.analysis?.gameStartTime;
  if (!gameStartTime) return null;

  const analysis = data.analysis || {};
  const teams = analysis.teams || {};
  const team1Name = teams.home || "Team 1";
  const team2Name = teams.away || "Team 2";

  const marketConsensusDisplay = analysis.keyInsightsNew?.marketConsensus?.display;
  const extractedConfidence = marketConsensusDisplay
    ? parseInt(marketConsensusDisplay.match(/(\d+)%/)?.[1] || "0", 10)
    : null;
  const confidence = extractedConfidence || 75;

  return {
    id: doc.id,
    sport: data.sport as SportId,
    team1: team1Name,
    team2: team2Name,
    team1Id: data.team1Id,
    team2Id: data.team2Id,
    confidence: confidence,
    league: analysis.league || undefined,
    timestamp: data.timestamp,
    gameStartTime: gameStartTime,
    analysis: analysis,
  };
}

/**
 * Hook to fetch ALL pre-cached games from Firestore.
 * Reads from both matchAnalysisCache (live) and gameArchive (past games).
 * Always fetches from server (bypasses offline cache).
 * Returns games sorted by game start time (soonest first).
 */
export const useCachedGames = (): UseCachedGamesResult => {
  const [games, setGames] = useState<CachedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCachedGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch from BOTH collections in parallel
      const cacheQuery = query(
        collection(db, "matchAnalysisCache"),
        where("preCached", "==", true)
      );
      const archiveRef = collection(db, "gameArchive");

      const [cacheSnapshot, archiveSnapshot] = await Promise.all([
        getDocsFromServer(cacheQuery),
        getDocsFromServer(archiveRef),
      ]);

      console.log(`[useCachedGames] Fetched ${cacheSnapshot.size} from cache, ${archiveSnapshot.size} from archive`);

      const cachedGames: CachedGame[] = [];
      const seenIds = new Set<string>();

      // Process cache docs (live games) — no time filter, show all
      cacheSnapshot.forEach((doc) => {
        const game = docToCachedGame(doc, "cache");
        if (game) {
          cachedGames.push(game);
          seenIds.add(doc.id);
        }
      });

      // Process archive docs (past games) — skip duplicates
      archiveSnapshot.forEach((doc) => {
        if (seenIds.has(doc.id)) return;
        const game = docToCachedGame(doc, "archive");
        if (game) {
          cachedGames.push(game);
        }
      });

      // Sort by game start time (soonest first)
      cachedGames.sort((a, b) => {
        const timeA = a.gameStartTime ? new Date(a.gameStartTime).getTime() : Infinity;
        const timeB = b.gameStartTime ? new Date(b.gameStartTime).getTime() : Infinity;
        return timeA - timeB;
      });

      console.log(`[useCachedGames] Returning ${cachedGames.length} valid games (cache + archive)`);
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
