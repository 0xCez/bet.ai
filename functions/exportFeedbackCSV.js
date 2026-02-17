/**
 * Export Feedback CSV
 * HTTP Cloud Function that exports all resolved predictions as CSV.
 * Used by the retraining pipeline (retrain_pipeline.py --feedback-csv).
 *
 * Usage:
 *   curl https://us-central1-betai-f9176.cloudfunctions.net/exportFeedbackCSV -o feedback.csv
 */

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

exports.exportFeedbackCSV = functions.https.onRequest(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true
  },
  async (req, res) => {
    try {
      const db = admin.firestore();

      // Get all resolved predictions (exclude DNP and push)
      const snapshot = await db.collection('ml_predictions')
        .where('resultRecorded', '==', true)
        .get();

      if (snapshot.empty) {
        res.status(200).send('No feedback data available.');
        return;
      }

      // Build CSV rows
      const rows = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();

        // Skip DNP and push results (not useful for training)
        if (data.actualResult === 'dnp' || data.actualResult === 'push') {
          continue;
        }

        // Skip if no features stored
        if (!data.features) continue;

        const features = data.features;

        // Flatten: all 88 features + result columns
        const row = {
          ...features,
          game_date: data.gameDate || '',
          player_name: data.playerName || '',
          actual_stat: data.actualStat,
          over_hit: data.actualResult === 'over' ? 1 : 0
        };

        rows.push(row);
      }

      if (rows.length === 0) {
        res.status(200).send('No usable feedback data (all DNP or push).');
        return;
      }

      // Generate CSV
      const headers = Object.keys(rows[0]);
      const csvLines = [
        headers.join(','),
        ...rows.map(row => headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        }).join(','))
      ];

      const csv = csvLines.join('\n');

      console.log(`[Export] Generated CSV: ${rows.length} rows, ${headers.length} columns`);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=feedback_data.csv');
      res.status(200).send(csv);

    } catch (error) {
      console.error('[Export] Error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);
