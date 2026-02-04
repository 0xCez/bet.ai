const functions = require("firebase-functions");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Cloud Function to generate compelling win reasons using GPT-4o-mini
 * Called from single-prediction screen to create 3 punchy bullet points
 */
exports.generateWinReasons = functions.https.onCall(async (request) => {
  // For Gen 2, data is in request.data
  const data = request.data || request;

  console.log("Received request - favoredTeam:", data.favoredTeam, "opponentTeam:", data.opponentTeam);
  console.log("Full data keys:", Object.keys(data));

  const { favoredTeam, opponentTeam, confidence, analysisData } = data;

  // Validate inputs with detailed logging
  if (!favoredTeam || !opponentTeam || !analysisData) {
    console.error("Validation failed:", {
      favoredTeam,
      opponentTeam,
      hasAnalysisData: !!analysisData,
    });
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Missing required parameters: favoredTeam=${!!favoredTeam}, opponentTeam=${!!opponentTeam}, analysisData=${!!analysisData}`
    );
  }

  try {
    // Extract ALL relevant insights from analysis data
    const xFactors = analysisData.xFactors || [];
    const keyInsights = analysisData.keyInsights || {};
    const keyInsightsNew = analysisData.keyInsightsNew || {};
    const matchSnapshot = analysisData.matchSnapshot || {};
    const sport = analysisData.sport || '';

    // Build comprehensive data string for LLM with ALL available metrics
    const dataPoints = [];

    if (xFactors.length > 0) dataPoints.push(`X-Factors: ${JSON.stringify(xFactors)}`);
    if (keyInsights.offensiveEdge) dataPoints.push(`Offensive Edge: ${JSON.stringify(keyInsights.offensiveEdge)}`);
    if (keyInsights.defensiveEdge) dataPoints.push(`Defensive Edge: ${JSON.stringify(keyInsights.defensiveEdge)}`);
    if (keyInsights.bestValue) dataPoints.push(`Best Value: ${JSON.stringify(keyInsights.bestValue)}`);
    if (keyInsightsNew) dataPoints.push(`Additional Insights: ${JSON.stringify(keyInsightsNew)}`);
    if (matchSnapshot.momentum) dataPoints.push(`Momentum: ${JSON.stringify(matchSnapshot.momentum)}`);
    if (matchSnapshot.recentForm) dataPoints.push(`Recent Form: ${JSON.stringify(matchSnapshot.recentForm)}`);
    if (matchSnapshot.headToHead) dataPoints.push(`Head-to-Head: ${JSON.stringify(matchSnapshot.headToHead)}`);

    // Build killer prompt focused on real alpha
    const prompt = `You are a sharp sports betting analyst who ONLY cares about data-driven edge. Your job is to extract the 3 most compelling, statistically-backed reasons why ${favoredTeam} will beat ${opponentTeam}.

CONFIDENCE: ${confidence}%
SPORT: ${sport}

DATA:
${dataPoints.join('\n')}

CRITICAL RULES:
1. NO GENERIC FLUFF - Never mention home court/field advantage, venue names, or obvious statements
2. NUMBERS ONLY - Every bullet MUST include specific stats, percentages, or quantifiable metrics from the data above
3. SHARP PHRASING - Write like a professional bettor: concise, direct, data-heavy
4. REAL ALPHA - Focus on statistical edges, mismatches, and trends that create betting value
5. Each bullet under 75 characters

BAD EXAMPLES (NEVER DO THIS):
❌ "Game at Little Caesars Arena gives Pistons a strong home advantage"
❌ "Team has momentum heading into this matchup"
❌ "Defense will be the difference maker"

GOOD EXAMPLES:
✅ "Pistons +6.5 PPG offensive edge vs Nuggets' 28th-ranked defense"
✅ "Riding 7-1 ATS streak while Nuggets 2-8 ATS last 10"
✅ "Exploiting pace mismatch: 102.4 vs 98.1 possessions per game"

Return EXACTLY 3 bullet points using real numbers from the data. No bullet symbols, no intro, just pure alpha.`;

    console.log("Sending enhanced prompt with data points:", dataPoints.length);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    // Parse response into clean array
    const reasons = response.choices[0].message.content
      .trim()
      .split("\n")
      .map((r) => r.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter((r) => r.length > 0)
      .slice(0, 3);

    // Ensure we got 3 reasons
    if (reasons.length < 3) {
      throw new Error("LLM did not return 3 reasons");
    }

    return { success: true, reasons };
  } catch (error) {
    console.error("Error generating win reasons:", error);
    throw new functions.https.HttpsError(
      "internal",
      "Failed to generate win reasons",
      error.message
    );
  }
});
