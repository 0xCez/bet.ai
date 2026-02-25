import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { router } from "expo-router";

// Lazy-load expo-notifications to avoid crash in Expo Go (no native module)
let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");

  // Show notifications even when app is in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.log("[Notifications] Native module not available (Expo Go?), skipping setup");
}

interface UseNotificationsResult {
  expoPushToken: string | null;
  permissionGranted: boolean;
}

export function useNotifications(): UseNotificationsResult {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    // Skip entirely if native module not available (Expo Go)
    if (!Notifications || !Device) {
      console.log("[Notifications] Skipping — native module not available");
      return;
    }

    const N = Notifications; // local ref for cleanup closure

    registerForPushNotifications().then((token) => {
      if (token) {
        setExpoPushToken(token);
        setPermissionGranted(true);
        storeToken(token);
      }
    });

    // Foreground notification listener
    notificationListener.current =
      N.addNotificationReceivedListener((notification: any) => {
        console.log("[Notifications] Received:", notification.request.content.title);
      });

    // Tap handler — navigate based on notification type
    responseListener.current =
      N.addNotificationResponseReceivedListener((response: any) => {
        const data = response.notification.request.content.data;
        handleNotificationTap(data);
      });

    return () => {
      if (notificationListener.current) {
        N.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        N.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return { expoPushToken, permissionGranted };
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) return null;

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log("[Notifications] Must use physical device for push notifications");
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Notifications] Permission not granted");
    return null;
  }

  // Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.error("[Notifications] Missing EAS projectId");
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  console.log("[Notifications] Token:", tokenData.data);
  return tokenData.data;
}

async function storeToken(token: string): Promise<void> {
  try {
    const tokenRef = doc(db, "pushTokens", token);
    await setDoc(tokenRef, {
      token,
      platform: Platform.OS,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }, { merge: true });
    console.log("[Notifications] Token stored in Firestore");
  } catch (err) {
    console.error("[Notifications] Failed to store token:", err);
  }
}

function handleNotificationTap(data: Record<string, unknown>): void {
  const type = data?.type as string;

  switch (type) {
    case "topPick":
      // Navigate to player prop chart
      if (data.playerName && data.statType && data.line) {
        router.push({
          pathname: "/(stack)/player-prop-chart",
          params: {
            playerName: data.playerName as string,
            statType: data.statType as string,
            line: String(data.line),
            from: "notification",
          },
        });
      } else {
        router.push({ pathname: "/home", params: { page: "picks" } });
      }
      break;

    case "parlay":
      router.push({ pathname: "/home", params: { page: "builder" } });
      break;

    case "results":
      router.push({ pathname: "/home", params: { page: "picks" } });
      break;

    default:
      router.push({ pathname: "/home" });
      break;
  }
}
