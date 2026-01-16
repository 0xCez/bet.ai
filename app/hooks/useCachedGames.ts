import { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { CachedGame } from "../../components/ui/CachedGameCard";

interface UseCachedGamesResult {
  games: CachedGame[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch pre-cached games from Firestore
 * Returns games that were pre-cached by the weekly cron job
 */
export const useCachedGames = (maxGames: number = 10): UseCachedGamesResult => {
  const [games, setGames] = useState<CachedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCachedGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const cacheRef = collection(db, "matchAnalysisCache");

      // Query for pre-cached games
      // Note: We filter expired games client-side and sort by confidence
      const now = new Date().toISOString();
      const q = query(
        cacheRef,
        where("preCached", "==", true),
        limit(50) // Fetch more to ensure we get all valid games
      );

      const snapshot = await getDocs(q);

      const cachedGames: CachedGame[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();

        // Check if not expired
        if (data.expiresAt && data.expiresAt > now) {
          const analysis = data.analysis || {};

          // Extract team names from analysis.teams (structure: { home: "Team1", away: "Team2" })
          const teams = analysis.teams || {};
          const team1Name = teams.home || "Team 1";
          const team2Name = teams.away || "Team 2";

          // Extract Win Probability from marketConsensus display (e.g., "61% Los Angeles Lakers" -> 61)
          // This is the market-implied win probability calculated from the odds
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
            analysis: analysis,
          });
        }
      });

      // Sort by confidence (highest first) and limit to maxGames
      cachedGames.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

      setGames(cachedGames.slice(0, maxGames));
    } catch (err) {
      console.error("Error fetching cached games:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch games");
    } finally {
      setLoading(false);
    }
  }, [maxGames]);

  useEffect(() => {
    fetchCachedGames();
  }, [fetchCachedGames]);

  return {
    games,
    loading,
    error,
    refresh: fetchCachedGames,
  };
};

export default useCachedGames;
