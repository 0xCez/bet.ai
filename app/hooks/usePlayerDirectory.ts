import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";

export interface DirectoryPlayer {
  name: string;
  team: string;
  teamCode: string;
  position: string | null;
  headshotUrl: string | null;
  averages: {
    ppg?: number;
    rpg?: number;
    apg?: number;
    spg?: number;
    bpg?: number;
    tpg?: number;
    threePg?: number;
    gamesPlayed?: number;
  };
  gamesPlayed: number;
  nextGame: {
    date: string;
    opponent: string;
    opponentCode: string;
    isHome: boolean;
  } | null;
}

interface UsePlayerDirectoryResult {
  players: DirectoryPlayer[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch the full NBA player directory from Firestore.
 * Fetches once on mount, refreshes when app returns to foreground.
 * 240 players (8 per team × 30 teams), synced daily by backend.
 */
export const usePlayerDirectory = (): UsePlayerDirectoryResult => {
  const [players, setPlayers] = useState<DirectoryPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDirectory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const snapshot = await getDocs(collection(db, "nbaPlayerDirectory"));

      const result: DirectoryPlayer[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        result.push({
          name: data.name || "",
          team: data.team || "",
          teamCode: data.teamCode || "",
          position: data.position || null,
          headshotUrl: data.headshotUrl || null,
          averages: data.averages || {},
          gamesPlayed: data.gamesPlayed || 0,
          nextGame: data.nextGame || null,
        });
      });

      // Sort alphabetically by name
      result.sort((a, b) => a.name.localeCompare(b.name));

      console.log(`[usePlayerDirectory] Loaded ${result.length} players`);
      setPlayers(result);
    } catch (err) {
      console.error("[usePlayerDirectory] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to load player directory");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  // Refresh when app returns to foreground
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          fetchDirectory();
        }
        appState.current = nextAppState;
      }
    );
    return () => subscription.remove();
  }, [fetchDirectory]);

  return { players, loading, error, refresh: fetchDirectory };
};

export default usePlayerDirectory;
