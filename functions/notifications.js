/**
 * Push Notifications Module
 *
 * Sends data-rich push notifications via Expo's push service.
 * 3 notification types:
 *   1. Top Edge Pick — best ML pick with full stats
 *   2. Parlay of the Day — LOCK slip with aggregate stats
 *   3. Results Recap — yesterday's top pick hit/miss
 *
 * Tokens stored in Firestore `pushTokens` collection.
 * Called internally from refresh cycle + results tracker.
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');

const expo = new Expo();

function getDb() {
  return admin.firestore();
}

// ── Bookmaker display names ──
const BK_NAMES = {
  DK: 'DraftKings', FD: 'FanDuel', MGM: 'BetMGM', CZR: 'Caesars',
  ESPN: 'ESPN BET', BR: 'BetRivers', BOV: 'Bovada', FAN: 'Fanatics',
  HR: 'Hard Rock', BALLY: 'BallyBet', MYBK: 'MyBookie', BOL: 'BetOnline',
  BETUS: 'BetUS',
};

function bkName(short) {
  return BK_NAMES[short] || short;
}

// ── Defense label from rank ──
function defLabel(rank) {
  if (!rank) return null;
  if (rank <= 5) return 'Elite';
  if (rank <= 12) return 'Strong';
  if (rank <= 18) return 'Avg';
  if (rank <= 25) return 'Weak';
  return 'Poor';
}

// ── Format odds for display ──
function fmtOdds(odds) {
  if (odds == null) return '';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

// ── Stat display name ──
const STAT_SHORT = {
  player_points: 'PTS', player_rebounds: 'REB', player_assists: 'AST',
  player_threes: '3PM', player_blocks: 'BLK', player_steals: 'STL',
  player_turnovers: 'TOV', points: 'PTS', rebounds: 'REB', assists: 'AST',
  threes: '3PM', blocks: 'BLK', steals: 'STL', turnovers: 'TOV',
};

function statShort(statType) {
  return STAT_SHORT[statType?.toLowerCase()] || statType || '';
}

// ── Fetch all push tokens ──
async function getAllTokens() {
  const db = getDb();
  const snapshot = await db.collection('pushTokens').get();
  return snapshot.docs
    .map(doc => doc.data().token)
    .filter(t => t && Expo.isExpoPushToken(t));
}

// ── Send to all devices ──
async function sendToAll(title, body, data = {}) {
  const tokens = await getAllTokens();
  if (tokens.length === 0) {
    console.log('[Notifications] No push tokens registered');
    return { sent: 0 };
  }

  const messages = tokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }));

  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;
  const invalidTokens = [];

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i++) {
        if (tickets[i].status === 'ok') {
          sent++;
        } else if (tickets[i].details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(chunk[i].to);
        }
      }
    } catch (err) {
      console.error('[Notifications] Error sending chunk:', err.message);
    }
  }

  // Clean up invalid tokens
  if (invalidTokens.length > 0) {
    const db = getDb();
    const batch = db.batch();
    for (const token of invalidTokens) {
      batch.delete(db.collection('pushTokens').doc(token));
    }
    await batch.commit();
    console.log(`[Notifications] Removed ${invalidTokens.length} invalid tokens`);
  }

  console.log(`[Notifications] Sent ${sent}/${tokens.length} notifications`);
  return { sent, total: tokens.length };
}

// ── Type 1: Top Edge Pick ──
async function sendTopPickNotification(edgeProps) {
  if (!edgeProps || edgeProps.length === 0) return;

  const pick = edgeProps[0]; // #1 pick by betScore
  const dir = (pick.dir || 'over').toUpperCase();
  const stat = statShort(pick.statType);
  const def = defLabel(pick.defRank);
  const odds = fmtOdds(pick.odds);
  const book = bkName(pick.bk);

  const title = `${pick.name} ${dir} ${pick.line} ${stat}`;

  const parts = [];
  if (pick.l10 != null) parts.push(`L10: ${pick.l10}%`);
  if (pick.szn != null) parts.push(`SZN: ${pick.szn}%`);
  if (def) parts.push(`${def} DEF`);
  if (odds) parts.push(`${odds} on ${book}`);

  const body = parts.join(' · ');

  return sendToAll(title, body, {
    type: 'topPick',
    playerName: pick.name,
    statType: pick.statType,
    line: pick.line,
    dir: pick.dir,
  });
}

// ── Type 2: Parlay of the Day ──
async function sendParlayNotification(parlaySlips) {
  if (!parlaySlips || parlaySlips.length === 0) return;

  // Find the LOCK slip (safest)
  const lockSlip = parlaySlips.find(s => s.name === 'LOCK') || parlaySlips[0];
  const legs = lockSlip.legs || [];
  if (legs.length === 0) return;

  const legCount = legs.length;
  const book = bkName(lockSlip.bk);
  const odds = fmtOdds(lockSlip.combinedOdds);

  // Aggregate L10 and SZN across legs
  const l10s = legs.map(l => l.l10).filter(v => v != null);
  const szns = legs.map(l => l.szn).filter(v => v != null);
  const avgL10 = l10s.length > 0 ? Math.round(l10s.reduce((a, b) => a + b, 0) / l10s.length) : null;
  const avgSzn = szns.length > 0 ? Math.round(szns.reduce((a, b) => a + b, 0) / szns.length) : null;

  const title = `LOCK Parlay — ${legCount} legs`;

  const parts = [];
  if (avgL10 != null) parts.push(`L10: ${avgL10}%`);
  if (avgSzn != null) parts.push(`SZN: ${avgSzn}%`);
  if (odds) parts.push(`${odds} on ${book}`);
  parts.push("don't sleep!");

  const body = parts.join(' · ');

  return sendToAll(title, body, { type: 'parlay' });
}

// ── Type 3: Results Recap ──
async function sendResultsNotification(picksDoc) {
  if (!picksDoc) return;

  const edge = picksDoc.edge || [];
  const stats = picksDoc.stats;

  // Find the #1 edge pick (first in array = highest betScore)
  const topPick = edge[0];
  if (!topPick || topPick.hit == null) return;

  const hitOrMiss = topPick.hit ? 'HIT' : 'MISSED';
  const stat = statShort(topPick.statType);
  const odds = fmtOdds(topPick.odds);
  const book = bkName(topPick.bk);

  const title = `Yesterday's top pick ${hitOrMiss}`;

  const parts = [];
  parts.push(`${topPick.name} ${topPick.actualStat} ${stat} on ${topPick.line}`);
  if (odds && book) parts.push(`${odds} on ${book}`);
  if (stats?.hitRate != null) {
    parts.push(`Overall: ${Math.round(stats.hitRate * 100)}% hit rate`);
  }

  const body = parts.join(' · ');

  return sendToAll(title, body, { type: 'results' });
}

// ── Determine which notification to send (alternates daily) ──
async function sendDailyPicksNotification(edgeProps, parlaySlips) {
  const day = new Date().getDate();
  if (day % 2 === 0) {
    // Even days: top pick
    console.log('[Notifications] Sending top pick notification (even day)');
    return sendTopPickNotification(edgeProps);
  } else {
    // Odd days: parlay
    console.log('[Notifications] Sending parlay notification (odd day)');
    return sendParlayNotification(parlaySlips);
  }
}

// ── HTTP endpoint: register push token ──
const registerPushToken = onRequest({
  timeoutSeconds: 10,
  memory: '128MiB',
  cors: true,
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const { token, platform } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ error: 'Invalid Expo push token' });
  }

  const db = getDb();
  await db.collection('pushTokens').doc(token).set({
    token,
    platform: platform || 'unknown',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`[Notifications] Token registered: ${platform} — ${token.substring(0, 30)}...`);
  return res.status(200).json({ success: true });
});

module.exports = {
  registerPushToken,
  sendTopPickNotification,
  sendParlayNotification,
  sendResultsNotification,
  sendDailyPicksNotification,
};
