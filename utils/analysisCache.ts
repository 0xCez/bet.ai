// Shared cache for analysis data across all pages
// This allows market-intel, team-stats, player-stats, and chat pages to access
// the same analysis data without re-fetching from Firestore

export interface AnalysisResult {
  sport?: string;
  teams?: {
    home: string;
    away: string;
    logos?: {
      home: string;
      away: string;
    };
  };
  matchSnapshot?: any;
  xFactors?: any[];
  aiAnalysis?: {
    confidenceScore: string;
    bettingSignal: string;
    breakdown: string;
  };
  keyInsights?: any;
  marketIntelligence?: any;
  teamStats?: any;
}

// Static cache to persist between navigation
let cachedAnalysisResult: AnalysisResult | null = null;
let cachedDisplayImageUrl: string | null = null;
let cachedParams: any = null;

export const AnalysisCache = {
  // Get cached analysis data
  getAnalysis: (): AnalysisResult | null => cachedAnalysisResult,

  // Set cached analysis data
  setAnalysis: (data: AnalysisResult | null) => {
    cachedAnalysisResult = data;
  },

  // Get cached display image URL
  getImageUrl: (): string | null => cachedDisplayImageUrl,

  // Set cached display image URL
  setImageUrl: (url: string | null) => {
    cachedDisplayImageUrl = url;
  },

  // Get cached params
  getParams: (): any => cachedParams,

  // Set cached params
  setParams: (params: any) => {
    cachedParams = params;
  },

  // Clear all cache
  clearAll: () => {
    cachedAnalysisResult = null;
    cachedDisplayImageUrl = null;
    cachedParams = null;
  },

  // Check if params match cached params
  isSameAnalysis: (params: any): boolean => {
    if (!cachedParams) return false;
    return (
      cachedParams.team1 === params.team1 &&
      cachedParams.team2 === params.team2 &&
      cachedParams.sport === params.sport &&
      cachedParams.analysisId === params.analysisId
    );
  }
};
