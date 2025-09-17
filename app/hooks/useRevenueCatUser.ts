import { useState } from 'react';
import Purchases from 'react-native-purchases';
import { useRevenueCat } from '../providers/RevenueCatProvider';

interface UserLinkResult {
  success: boolean;
  error?: string;
}

export function useRevenueCatUser() {
  const { customerInfo, linkUser } = useRevenueCat();
  const [linkingLoading, setLinkingLoading] = useState(false);

  const linkUserToFirebase = async (firebaseUid: string): Promise<UserLinkResult> => {
    console.log("[RevenueCat] Linking user to Firebase:", firebaseUid);
    console.log("[RevenueCat] Current customer info:", customerInfo);
    
    setLinkingLoading(true);
    try {
      console.log("[RevenueCat] Attempting to link user...");
      await linkUser(firebaseUid);
      console.log("[RevenueCat] User linked successfully");
      return { success: true };
    } catch (error: any) {
      console.error('[RevenueCat] Failed to link user:', {
        code: error?.code,
        message: error?.message,
        underlyingError: error?.underlyingError
      });
      return {
        success: false,
        error: error?.message || 'Failed to link user'
      };
    } finally {
      setLinkingLoading(false);
    }
  };

  const getAnonymousUser = async (): Promise<string | null> => {
    try {
      console.log("[RevenueCat] Getting anonymous user...");
      const info = await Purchases.getCustomerInfo();
      console.log("[RevenueCat] Anonymous user info:", info);
      return info.originalAppUserId;
    } catch (error) {
      console.error('[RevenueCat] Failed to get anonymous user:', error);
      return null;
    }
  };

  return {
    linkUserToFirebase,
    getAnonymousUser,
    linkingLoading,
    customerInfo
  };
} 