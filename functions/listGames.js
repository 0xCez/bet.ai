const admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

async function listGames() {
  const snapshot = await db.collection("matchAnalysisCache")
    .where("preCached", "==", true)
    .get();

  const games = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const analysis = data.analysis || {};
    const teams = analysis.teams || {};
    games.push({
      sport: data.sport,
      home: teams.home || "Unknown",
      away: teams.away || "Unknown",
      expiresAt: data.expiresAt
    });
  });

  games.sort((a, b) => {
    if (a.sport !== b.sport) return a.sport.localeCompare(b.sport);
    return a.home.localeCompare(b.home);
  });

  console.log(JSON.stringify(games, null, 2));
}

listGames().catch(console.error);
