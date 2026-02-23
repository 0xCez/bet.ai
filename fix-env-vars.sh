#!/bin/bash
ENV_VARS="ODDS_API_KEY=2151b9918e2de73545bd66f1331c2dda,API_SPORTS_KEY=77fea40da4ce95b70120be298555b660,STATPAL_API_KEY=39ac2518-b037-4c2c-97af-8176590e886e,WEATHER_API_KEY=18e17a88ccd7422ba37190127250904"

SERVICES="analyzeimage chatwithgpt saveexternalanalysis updatefrenchdemoanalysis getplayergamelogs cleanupcache deleteuseraccount generatewinreasons populatemmafighters populatesoccerteams populatetennisplayers testvertexai"

for svc in $SERVICES; do
  echo "Updating $svc..."
  gcloud run services update "$svc" --region us-central1 --project betai-f9176 --update-env-vars "$ENV_VARS" --quiet 2>&1 | tail -1
done

echo ""
echo "=== ALL SERVICES UPDATED ==="
echo "Now triggering preCacheTopGames..."
curl -s -X POST "https://us-central1-betai-f9176.cloudfunctions.net/preCacheTopGames" -H "Content-Type: application/json" -d '{"forceRefresh":true}'
echo ""
echo "=== DONE ==="
