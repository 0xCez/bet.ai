/**
 * Test script for ML Feature Engineering
 * Tests the 88-feature calculation with mock data
 *
 * Run with: node testMLFeatures.js
 */

const { calculateAllMLFeatures } = require('./helpers/mlFeatureEngineering');

// Mock game logs (simulating API-Sports response structure)
const mockGameLogs = [
  // Game 1 (most recent)
  {
    game: { date: { start: '2026-02-02T02:00:00Z' } },
    points: 28,
    totReb: 8,
    assists: 9,
    min: '36:24',
    fgm: 11,
    fga: 22,
    tpm: 2,
    tpa: 6,
    ftm: 4,
    fta: 5,
    steals: 1,
    blocks: 0,
    turnovers: 3
  },
  // Game 2
  {
    game: { date: { start: '2026-01-31T02:00:00Z' } },
    points: 25,
    totReb: 7,
    assists: 10,
    min: '35:12',
    fgm: 10,
    fga: 20,
    tpm: 1,
    tpa: 5,
    ftm: 4,
    fta: 4,
    steals: 2,
    blocks: 1,
    turnovers: 2
  },
  // Game 3
  {
    game: { date: { start: '2026-01-29T02:00:00Z' } },
    points: 31,
    totReb: 6,
    assists: 8,
    min: '38:06',
    fgm: 12,
    fga: 24,
    tpm: 3,
    tpa: 7,
    ftm: 4,
    fta: 6,
    steals: 0,
    blocks: 1,
    turnovers: 4
  },
  // Games 4-10 (for L10 calculation)
  ...Array.from({ length: 7 }, (_, i) => ({
    game: { date: { start: `2026-01-${27 - i * 2}T02:00:00Z` } },
    points: 24 + Math.floor(Math.random() * 10),
    totReb: 6 + Math.floor(Math.random() * 4),
    assists: 7 + Math.floor(Math.random() * 5),
    min: `${34 + Math.floor(Math.random() * 4)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
    fgm: 9 + Math.floor(Math.random() * 4),
    fga: 18 + Math.floor(Math.random() * 6),
    tpm: 1 + Math.floor(Math.random() * 3),
    tpa: 4 + Math.floor(Math.random() * 4),
    ftm: 3 + Math.floor(Math.random() * 3),
    fta: 4 + Math.floor(Math.random() * 2),
    steals: Math.floor(Math.random() * 3),
    blocks: Math.floor(Math.random() * 2),
    turnovers: 2 + Math.floor(Math.random() * 3)
  }))
];

console.log('🧪 Testing ML Feature Engineering Pipeline\n');
console.log('═══════════════════════════════════════════\n');

console.log(`📊 Mock Data: ${mockGameLogs.length} games`);
console.log(`   Most recent: ${mockGameLogs[0].points} PTS, ${mockGameLogs[0].totReb} REB, ${mockGameLogs[0].assists} AST\n`);

// Test parameters
const testParams = {
  gameLogs: mockGameLogs,
  propType: 'points',
  homeTeam: 'LAL',
  awayTeam: 'GSW',
  isHome: true,
  gameDate: '2026-02-05T02:00:00Z',
  line: 28.5,
  oddsOver: -110,
  oddsUnder: -110,
  bookmaker: 'DraftKings'
};

try {
  console.log('⚙️  Calculating all 88 ML features...\n');

  const features = calculateAllMLFeatures(testParams);

  console.log('✅ Feature calculation successful!\n');
  console.log('═══════════════════════════════════════════\n');

  // Display key features
  console.log('📈 Key Features Summary:\n');

  console.log('🔢 Categorical (5):');
  console.log(`   prop_type: ${features.prop_type}`);
  console.log(`   home_team: ${features.home_team}`);
  console.log(`   away_team: ${features.away_team}`);
  console.log(`   bookmaker: ${features.bookmaker}`);
  console.log(`   SEASON: ${features.SEASON}\n`);

  console.log('📅 Temporal (3):');
  console.log(`   year: ${features.year}`);
  console.log(`   month: ${features.month}`);
  console.log(`   day_of_week: ${features.day_of_week}\n`);

  console.log('🎯 Last 3 Games Stats (sample):');
  console.log(`   L3_PTS: ${features.L3_PTS.toFixed(2)}`);
  console.log(`   L3_REB: ${features.L3_REB.toFixed(2)}`);
  console.log(`   L3_AST: ${features.L3_AST.toFixed(2)}`);
  console.log(`   L3_FG_PCT: ${features.L3_FG_PCT.toFixed(2)}%\n`);

  console.log('📊 Last 10 Games Stats (sample):');
  console.log(`   L10_PTS: ${features.L10_PTS.toFixed(2)}`);
  console.log(`   L10_PTS_STD: ${features.L10_PTS_STD.toFixed(2)} (consistency)`);
  console.log(`   L10_REB: ${features.L10_REB.toFixed(2)}`);
  console.log(`   L10_AST: ${features.L10_AST.toFixed(2)}\n`);

  console.log('🏠 Game Context (5):');
  console.log(`   HOME_AWAY: ${features.HOME_AWAY} (${features.HOME_AWAY === 1 ? 'Home' : 'Away'})`);
  console.log(`   DAYS_REST: ${features.DAYS_REST}`);
  console.log(`   BACK_TO_BACK: ${features.BACK_TO_BACK} (${features.BACK_TO_BACK === 1 ? 'Yes' : 'No'})`);
  console.log(`   GAMES_IN_LAST_7: ${features.GAMES_IN_LAST_7}`);
  console.log(`   MINUTES_TREND: ${features.MINUTES_TREND.toFixed(2)}\n`);

  console.log('⚡ Advanced Metrics (sample):');
  console.log(`   SCORING_EFFICIENCY: ${features.SCORING_EFFICIENCY.toFixed(3)}`);
  console.log(`   ASSIST_TO_RATIO: ${features.ASSIST_TO_RATIO.toFixed(2)}`);
  console.log(`   USAGE_RATE: ${features.USAGE_RATE.toFixed(3)}`);
  console.log(`   TREND_PTS: ${features.TREND_PTS.toFixed(2)} (L3 vs L10)`);
  console.log(`   CONSISTENCY_PTS: ${features.CONSISTENCY_PTS.toFixed(3)} (lower = more consistent)\n`);

  console.log('🔗 Interaction Features (sample):');
  console.log(`   L3_PTS_x_HOME: ${features.L3_PTS_x_HOME.toFixed(2)}`);
  console.log(`   USAGE_x_EFFICIENCY: ${features.USAGE_x_EFFICIENCY.toFixed(3)}\n`);

  console.log('📦 Composite Metrics (sample):');
  console.log(`   LOAD_INTENSITY: ${features.LOAD_INTENSITY.toFixed(2)}`);
  console.log(`   THREE_POINT_THREAT: ${features.THREE_POINT_THREAT.toFixed(2)}`);
  console.log(`   MINUTES_STABILITY: ${features.MINUTES_STABILITY.toFixed(3)}\n`);

  console.log('💰 Betting Line Features (sample):');
  console.log(`   line: ${features.line}`);
  console.log(`   odds_over: ${features.odds_over}`);
  console.log(`   odds_under: ${features.odds_under}`);
  console.log(`   implied_prob_over: ${(features.implied_prob_over * 100).toFixed(2)}%`);
  console.log(`   implied_prob_under: ${(features.implied_prob_under * 100).toFixed(2)}%`);
  console.log(`   market_margin: ${(features.market_margin * 100).toFixed(2)}% (vig)\n`);

  console.log('═══════════════════════════════════════════\n');

  // Count features
  const featureCount = Object.keys(features).length;
  console.log(`🎯 Total features calculated: ${featureCount}`);

  if (featureCount === 88) {
    console.log('✅ SUCCESS: All 88 features present!\n');
  } else {
    console.log(`⚠️  WARNING: Expected 88 features, got ${featureCount}\n`);
  }

  // Display all feature names
  console.log('📋 All Feature Names:');
  console.log(Object.keys(features).join(', '));
  console.log('\n');

  // Validate all features are numeric or string
  console.log('🔍 Validating feature types...');
  let validationPassed = true;
  const categoricalFeatures = ['prop_type', 'home_team', 'away_team', 'bookmaker', 'SEASON'];

  for (const [key, value] of Object.entries(features)) {
    if (categoricalFeatures.includes(key)) {
      if (typeof value !== 'string') {
        console.error(`❌ ${key} should be string, got ${typeof value}`);
        validationPassed = false;
      }
    } else {
      if (typeof value !== 'number' || isNaN(value)) {
        console.error(`❌ ${key} should be numeric, got ${typeof value}: ${value}`);
        validationPassed = false;
      }
    }
  }

  if (validationPassed) {
    console.log('✅ All features have valid types!\n');
  } else {
    console.log('❌ Some features have invalid types\n');
  }

  console.log('═══════════════════════════════════════════');
  console.log('🎉 Test completed successfully!\n');

  // Export sample for inspection
  console.log('💾 Full feature object:');
  console.log(JSON.stringify(features, null, 2));

} catch (error) {
  console.error('❌ Test failed:', error);
  console.error(error.stack);
  process.exit(1);
}
