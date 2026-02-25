/**
 * One-time script to backfill team stats for precached NBA games.
 * Only updates analysis.teamStats — does NOT touch any other field.
 *
 * Usage: node backfillTeamStats.js
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const axios = require('axios');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();

// Get API key from Secret Manager (same as index.js)
let _apiSportsKey = null;
async function getApiSportsKey() {
  if (_apiSportsKey) return _apiSportsKey;
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: 'projects/betai-f9176/secrets/API_SPORTS_KEY/versions/latest',
  });
  _apiSportsKey = version.payload.data.toString('utf8').trim();
  return _apiSportsKey;
}

// Same transform as index.js
function transformNBATeamStats(nbaStats) {
  const games = nbaStats.games || 1;
  return {
    team: nbaStats.team || null,
    points: nbaStats.points || 0,
    fgp: parseFloat(nbaStats.fgp || 0),
    tpp: parseFloat(nbaStats.tpp || 0),
    ftp: parseFloat(nbaStats.ftp || 0),
    totReb: nbaStats.totReb || 0,
    offReb: nbaStats.offReb || 0,
    defReb: nbaStats.defReb || 0,
    assists: nbaStats.assists || 0,
    steals: nbaStats.steals || 0,
    turnovers: nbaStats.turnovers || 0,
    blocks: nbaStats.blocks || 0,
    plusMinus: nbaStats.plusMinus || 0,
    pFouls: nbaStats.pFouls || 0,
    games: games,
    fastBreakPoints: nbaStats.fastBreakPoints || 0,
    pointsInPaint: nbaStats.pointsInPaint || 0,
    secondChancePoints: nbaStats.secondChancePoints || 0,
    pointsOffTurnovers: nbaStats.pointsOffTurnovers || 0,
    longestRun: nbaStats.longestRun || 0,
    biggestLead: nbaStats.biggestLead || 0,
  };
}

async function fetchTeamStats(teamId) {
  const apiKey = await getApiSportsKey();
  const url = `https://v2.nba.api-sports.io/teams/statistics?season=2025&id=${teamId}`;

  const response = await axios.get(url, {
    headers: { "x-apisports-key": apiKey }
  });

  if (response.data.errors && Object.keys(response.data.errors).length > 0) {
    return { stats: null, error: JSON.stringify(response.data.errors) };
  }

  if (!response.data.response) {
    return { stats: null, error: "No data found" };
  }

  let stats = response.data.response[0] || response.data.response;
  stats = transformNBATeamStats(stats);
  return { stats, error: null };
}

(async () => {
  console.log('Fetching all precached NBA games...');

  const snap = await db.collection('matchAnalysisCache')
    .where('sport', '==', 'nba')
    .where('preCached', '==', true)
    .get();

  console.log(`Found ${snap.size} precached NBA docs\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const analysis = data.analysis || {};
    const teams = analysis.teams || {};
    const ts = analysis.teamStats || {};
    const team1Id = ts.team1?.teamId;
    const team2Id = ts.team2?.teamId;

    // Skip if stats are already valid
    if (ts.team1?.stats && ts.team2?.stats) {
      console.log(`SKIP ${docSnap.id} (${teams.away} @ ${teams.home}) — stats already valid`);
      skipped++;
      continue;
    }

    if (!team1Id || !team2Id) {
      console.log(`SKIP ${docSnap.id} — no team IDs found`);
      skipped++;
      continue;
    }

    console.log(`FIXING ${docSnap.id} (${teams.away} @ ${teams.home}) — team1: ${team1Id}, team2: ${team2Id}`);

    try {
      const [team1Stats, team2Stats] = await Promise.all([
        fetchTeamStats(team1Id),
        fetchTeamStats(team2Id)
      ]);

      const newTeamStats = {
        team1: { teamId: team1Id, stats: team1Stats.stats, error: team1Stats.error },
        team2: { teamId: team2Id, stats: team2Stats.stats, error: team2Stats.error }
      };

      // ONLY update analysis.teamStats — nothing else
      await docSnap.ref.update({ 'analysis.teamStats': newTeamStats });

      const t1ok = team1Stats.stats ? '✅' : '❌';
      const t2ok = team2Stats.stats ? '✅' : '❌';
      console.log(`  → Updated. Team1: ${t1ok}  Team2: ${t2ok}`);
      updated++;

      // Rate limit: API-Sports allows 10 req/min on free tier
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`  → FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  process.exit(0);
})();
