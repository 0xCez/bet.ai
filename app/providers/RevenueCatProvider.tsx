import React, { createContext, useContext, useEffect, useState } from "react";
import Purchases, {
  CustomerInfo,
  PurchasesConfiguration,
  LogInResult,
} from "react-native-purchases";
import { Platform } from "react-native";
import { getFirebaseInfo } from "../../firebaseConfig";

// Replace these with your actual RevenueCat API keys
const REVENUE_CAT_API_KEY_IOS = "appl_QNGGsxInDnggPuoPDvMxaguetdy";
const REVENUE_CAT_API_KEY_ANDROID = "goog_hBaephPMRgERKYiWrpcEEWefzcY";

interface RevenueCatContextType {
  customerInfo: CustomerInfo | null;
  isLoading: boolean;
  isSubscribed: boolean;
  currentOffering: {
    identifier: string;
    availablePackages: Array<{
      identifier: string;
      packageType: string;
      product: {
        identifier: string;
        description: string;
        title: string;
        price: number;
        priceString: string;
      };
    }>;
  } | null;
  linkUser: (userId: string) => Promise<void>;
  restorePurchases: () => Promise<CustomerInfo>;
}

export const RevenueCatContext = createContext<
  RevenueCatContextType | undefined
>(undefined);

export function RevenueCatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentOffering, setCurrentOffering] =
    useState<RevenueCatContextType["currentOffering"]>(null);

  useEffect(() => {
    initializeRevenueCat();
  }, []);

  async function initializeRevenueCat() {
    try {
      console.log("[RevenueCat] Initializing with configuration...");
      const configuration: PurchasesConfiguration = {
        apiKey:
          Platform.select({
            ios: REVENUE_CAT_API_KEY_IOS,
            android: REVENUE_CAT_API_KEY_ANDROID,
          }) || "",
      };

      await Purchases.configure(configuration);
      console.log("[RevenueCat] Configuration complete");
      await updateCustomerInfo();
      await getOfferings();
    } catch (error) {
      console.error("[RevenueCat] Failed to initialize RevenueCat:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateCustomerInfo() {
    try {
      console.log("[RevenueCat] Fetching customer info...");
      const info = await Purchases.getCustomerInfo();
      console.log("[RevenueCat] Customer info received:", info);
      setCustomerInfo(info);
    } catch (error) {
      console.error("[RevenueCat] Failed to get customer info:", error);
    }
  }

  async function getOfferings() {
    try {
      console.log("[RevenueCat] Fetching offerings...");
      const offerings = await Purchases.getOfferings();
      console.log("[RevenueCat] Received offerings:", offerings);

      if (offerings.current) {
        console.log(
          "[RevenueCat] Setting current offering:",
          offerings.current
        );
        setCurrentOffering(offerings.current);
      } else {
        console.log("[RevenueCat] No current offering available");
      }
    } catch (error) {
      console.error("[RevenueCat] Failed to get offerings:", error);
    }
  }

  async function linkUser(userId: string) {
    try {
      console.log("[RevenueCat] Linking user:", userId);
      const { customerInfo: info } = await Purchases.logIn(userId);
      console.log("[RevenueCat] User linked successfully");
      setCustomerInfo(info);
    } catch (error) {
      console.error("[RevenueCat] Failed to link user:", error);
    }
  }

  async function restorePurchases() {
    try {
      console.log("[RevenueCat] Restoring purchases...");
      const info = await Purchases.restorePurchases();
      console.log("[RevenueCat] Purchases restored");
      setCustomerInfo(info);
      return info;
    } catch (error) {
      console.error("[RevenueCat] Failed to restore purchases:", error);
      throw error;
    }
  }

  // 🔧 DEV BYPASS: Always grant subscription in development environment
  // TODO: REMOVE THIS BEFORE PRODUCTION DEPLOYMENT
  const firebaseInfo = getFirebaseInfo();
  const isDevEnvironment = firebaseInfo.projectId === 'betai-dev-16';

  const isSubscribed = isDevEnvironment
    ? true // Always subscribed in dev
    : customerInfo?.entitlements.active["Premium"] !== undefined;

  // Log subscription status for debugging
  if (isDevEnvironment) {
    console.log("🔧 [DEV BYPASS] Subscription check bypassed - always granted in dev environment");
  }

  const value = {
    customerInfo,
    isLoading,
    isSubscribed,
    currentOffering,
    linkUser,
    restorePurchases,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error("useRevenueCat must be used within a RevenueCatProvider");
  }
  return context;
}
