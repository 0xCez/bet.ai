import React, { useState, useEffect } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  Alert,
} from "react-native";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import { TopBar } from "../components/ui/TopBar";
import { AnalysisHistoryItem } from "../components/ui/AnalysisHistoryItem";
import { LogoSpinner } from "../components/ui/LogoSpinner";
import { useRouter } from "expo-router";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
  deleteDoc,
  doc,
} from "firebase/firestore"; // Import Firestore functions
import { getAuth, User } from "firebase/auth"; // Import Auth functions
import { auth, db } from "../firebaseConfig"; // Assuming firebaseConfig.ts exports auth and db
import { useRevenueCatPurchases } from "./hooks/useRevenueCatPurchases";
import i18n from "../i18n";

// Define the structure of the analysis data from Firestore
interface UserAnalysis {
  id: string; // Firestore document ID from the subcollection
  teams: string;
  date: string; // Or Timestamp, adjust as per your Firestore data
  confidence: number;
  imageUrl?: string; // Make sure this matches your Firestore field name
  createdAt: Timestamp; // Assuming you have a timestamp for ordering
  // Add other relevant fields from your userAnalyses collection
}

// Remove mock data
// const mockHistoryData = [...];

export default function HistoryScreen() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<UserAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchAnalyses(currentUser.uid);
      } else {
        // Handle case where user is not logged in
        setAnalyses([]);
        setIsLoading(false);
        setError("Please log in to view your history.");
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [auth]); // Depend on auth instance

  async function fetchAnalyses(userId: string) {
    setIsLoading(true);
    setError(null);
    try {
      // Correct path: userAnalyses/{userId}/analyses
      const userAnalysesSubcollection = collection(
        db,
        "userAnalyses",
        userId,
        "analyses"
      );

      // Query the subcollection, ordered by creation time
      // No need for 'where("userId", ...)' because we are already inside the user's subcollection
      const q = query(
        userAnalysesSubcollection,
        orderBy("createdAt", "desc") // Order by 'createdAt' timestamp, descending
      );

      const querySnapshot = await getDocs(q);
      const fetchedAnalyses = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<UserAnalysis, "id">),
      }));

      setAnalyses(fetchedAnalyses);
    } catch (err) {
      console.error("Error fetching analyses: ", err);
      setError("Failed to fetch analysis history.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleDeleteAnalysis = async (analysisId: string) => {
    Alert.alert(
      i18n.t("historyDeleteAnalysis"),
      i18n.t("historyDeleteConfirm"),
      [
        {
          text: i18n.t("common.cancel"),
          style: "cancel",
        },
        {
          text: i18n.t("historyDeleteAction"),
          style: "destructive",
          onPress: async () => {
            setIsDeletingId(analysisId);
            try {
              const analysisRef = doc(
                db,
                "userAnalyses",
                user?.uid || "",
                "analyses",
                analysisId
              );
              await deleteDoc(analysisRef);
              setAnalyses(
                analyses.filter((analysis) => analysis.id !== analysisId)
              );
              console.log("Analysis deleted successfully");
            } catch (err) {
              console.error("Error deleting analysis: ", err);
              Alert.alert(
                i18n.t("common.error"),
                i18n.t("historyErrorDeleting")
              );
            } finally {
              setIsDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handleAnalysisPress = (item: UserAnalysis) => {
    // Navigate to analysis details screen, passing only the Firestore document ID
    router.push({
      pathname: "/analysis",
      params: { analysisId: item.id }, // Pass only the ID
    });
  };

  if (isLoading) {
    return (
      <ScreenBackground hideBg>
        <TopBar />
        <View style={styles.centered}>
          <LogoSpinner size={96} />
        </View>
      </ScreenBackground>
    );
  }

  if (error) {
    return (
      <ScreenBackground hideBg>
        <TopBar />

        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground hideBg>
      <TopBar />
      {analyses.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {i18n.t("historyNoAnalysisFound")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={analyses}
          keyExtractor={(item) => item.id}
          numColumns={2}
          key={"history-grid"}
          renderItem={({ item }) => (
            <AnalysisHistoryItem
              teams={item.teams}
              confidence={item.confidence}
              imageUrl={item.imageUrl}
              onDelete={() => handleDeleteAnalysis(item.id)}
              onPress={() => handleAnalysisPress(item)}
              isDeleting={isDeletingId === item.id}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 8, // Use horizontal padding for grid outer spacing
    paddingTop: 16,
    paddingBottom: 32, // Add padding at the bottom if needed
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  errorText: {
    color: "#F44336", // Red color for errors
    fontSize: 16,
    textAlign: "center",
  },
  emptyText: {
    color: "#999999", // Grey color for empty state
    fontSize: 16,
    textAlign: "center",
  },
});
