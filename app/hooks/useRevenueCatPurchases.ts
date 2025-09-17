import { useState } from 'react';
import Purchases from 'react-native-purchases';
import { useRevenueCat } from '../providers/RevenueCatProvider';
import { Platform } from 'react-native';

const ENTITLEMENT_ID = 'Premium'; // Make sure this matches exactly with RevenueCat

interface PurchaseResult {
  success: boolean;
  error?: string;
  errorDetails?: any;
}

export function useRevenueCatPurchases() {
  const { customerInfo, currentOffering, isSubscribed } = useRevenueCat();
  const [purchaseLoading, setPurchaseLoading] = useState(false);

  const purchasePackage = async (packageIdentifier?: string): Promise<PurchaseResult> => {
    console.log("[RevenueCat] Starting purchase flow...");
    console.log("[RevenueCat] Platform:", Platform.OS);
    console.log("[RevenueCat] Current offering:", currentOffering);
    console.log("[RevenueCat] Selected package:", packageIdentifier);
    console.log("[RevenueCat] Looking for entitlement:", ENTITLEMENT_ID);
    
    if (!currentOffering) {
      console.log("[RevenueCat] No offering available for purchase");
      return { success: false, error: 'No offering available' };
    }

    // Find the specific package in the offering
    const packageToPurchase = currentOffering.availablePackages?.find(
      pkg => pkg.identifier === packageIdentifier
    );

    if (!packageToPurchase) {
      console.log("[RevenueCat] Package not found:", packageIdentifier);
      return { success: false, error: 'Selected package not available' };
    }

    console.log("[RevenueCat] Package to purchase:", {
      identifier: packageToPurchase.identifier,
      packageType: packageToPurchase.packageType,
      product: packageToPurchase.product
    });

    setPurchaseLoading(true);
    try {
      // Check if user is already subscribed
      if (isSubscribed) {
        console.log("[RevenueCat] User is already subscribed");
        return { success: true };
      }

      console.log("[RevenueCat] Initiating purchase...");
      const { customerInfo: purchaseInfo } = await Purchases.purchasePackage(packageToPurchase);
      
      console.log("[RevenueCat] Purchase completed. Full response:", {
        entitlements: purchaseInfo?.entitlements,
        activeEntitlements: purchaseInfo?.entitlements.active,
        allEntitlements: purchaseInfo?.entitlements.all,
        verification: purchaseInfo?.entitlements.verification
      });
      
      // Check if the entitlement exists in the response
      const hasEntitlement = purchaseInfo?.entitlements.active[ENTITLEMENT_ID] !== undefined;
      console.log(`[RevenueCat] Entitlement '${ENTITLEMENT_ID}' status:`, hasEntitlement ? "Active" : "Not Found");
      
      if (!hasEntitlement) {
        // Try to get more details about why the entitlement isn't active
        const entitlementDetails = purchaseInfo?.entitlements.all[ENTITLEMENT_ID];
        console.log("[RevenueCat] Entitlement details:", entitlementDetails);
        
        return { 
          success: false, 
          error: 'Purchase completed but subscription not activated',
          errorDetails: {
            verification: purchaseInfo?.entitlements.verification,
            activeEntitlements: Object.keys(purchaseInfo?.entitlements.active || {}),
            allEntitlements: Object.keys(purchaseInfo?.entitlements.all || {})
          }
        };
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('[RevenueCat] Purchase error:', {
        message: error?.message,
        code: error?.code,
        details: error
      });

      return { 
        success: false, 
        error: error?.message || 'Failed to complete purchase',
        errorDetails: error
      };
    } finally {
      setPurchaseLoading(false);
    }
  };

  const checkSubscriptionStatus = async (): Promise<boolean> => {
    try {
      console.log("[RevenueCat] Checking subscription status...");
      const info = await Purchases.getCustomerInfo();
      const isActive = info?.entitlements.active[ENTITLEMENT_ID] !== undefined;
      console.log(`[RevenueCat] Subscription status for '${ENTITLEMENT_ID}':`, isActive ? "Active" : "Inactive");
      console.log("[RevenueCat] Available entitlements:", {
        active: Object.keys(info?.entitlements.active || {}),
        all: Object.keys(info?.entitlements.all || {})
      });
      return isActive;
    } catch (error) {
      console.error('[RevenueCat] Failed to check subscription status:', error);
      return false;
    }
  };

  return {
    purchasePackage,
    checkSubscriptionStatus,
    purchaseLoading,
    isSubscribed,
    customerInfo,
    currentOffering
  };
} 