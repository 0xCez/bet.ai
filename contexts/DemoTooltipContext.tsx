import React, { createContext, useContext, useState, useCallback } from "react";

// Define tooltip IDs for each step
export type TooltipId =
  | "welcome"        // First tooltip when entering demo
  | "insight_tab"    // Explaining the insight/analysis tab
  | "nav_hint"       // Hint to explore other tabs
  | "market_tab"     // Market intelligence tab
  | "teams_tab"      // Teams stats tab
  | "players_tab"    // Players stats tab
  | "expert_tab"     // Expert/chat tab
  | "demo_complete"; // Final tooltip before paywall

interface DemoTooltipContextType {
  isDemo: boolean;
  setIsDemo: (value: boolean) => void;
  currentTooltip: TooltipId | null;
  showTooltip: (id: TooltipId) => void;
  dismissTooltip: () => void;
  dismissedTooltips: Set<TooltipId>;
  hasSeenTooltip: (id: TooltipId) => boolean;
  visitedTabs: Set<string>;
  markTabVisited: (tab: string) => void;
  resetDemo: () => void;
}

const DemoTooltipContext = createContext<DemoTooltipContextType | undefined>(undefined);

export function DemoTooltipProvider({ children }: { children: React.ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);
  const [currentTooltip, setCurrentTooltip] = useState<TooltipId | null>(null);
  const [dismissedTooltips, setDismissedTooltips] = useState<Set<TooltipId>>(new Set());
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["insight"])); // Start with insight visited

  const showTooltip = useCallback((id: TooltipId) => {
    if (!dismissedTooltips.has(id)) {
      setCurrentTooltip(id);
    }
  }, [dismissedTooltips]);

  const dismissTooltip = useCallback(() => {
    if (currentTooltip) {
      setDismissedTooltips(prev => new Set([...prev, currentTooltip]));
      setCurrentTooltip(null);
    }
  }, [currentTooltip]);

  const hasSeenTooltip = useCallback((id: TooltipId) => {
    return dismissedTooltips.has(id);
  }, [dismissedTooltips]);

  const markTabVisited = useCallback((tab: string) => {
    setVisitedTabs(prev => new Set([...prev, tab]));
  }, []);

  const resetDemo = useCallback(() => {
    setCurrentTooltip(null);
    setDismissedTooltips(new Set());
    setVisitedTabs(new Set(["insight"]));
  }, []);

  return (
    <DemoTooltipContext.Provider
      value={{
        isDemo,
        setIsDemo,
        currentTooltip,
        showTooltip,
        dismissTooltip,
        dismissedTooltips,
        hasSeenTooltip,
        visitedTabs,
        markTabVisited,
        resetDemo,
      }}
    >
      {children}
    </DemoTooltipContext.Provider>
  );
}

export function useDemoTooltip() {
  const context = useContext(DemoTooltipContext);
  if (context === undefined) {
    throw new Error("useDemoTooltip must be used within a DemoTooltipProvider");
  }
  return context;
}
