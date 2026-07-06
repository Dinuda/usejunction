#!/usr/bin/env bash
set -euo pipefail

BASE="${USEJUNCTION_URL:-http://localhost:3002}"
INGEST_SECRET="${INGEST_SECRET:-change-me-ingest-secret}"

echo "==> Generating enrollment token..."
TOKEN_RESP=$(curl -s -X POST "$BASE/api/enrollment-tokens")
TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: $TOKEN"

echo "==> Ingesting sample gateway request..."
curl -s -X POST "$BASE/api/ingest/request" \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "seed-org",
    "toolName": "codex",
    "model": "openai/gpt-4o-mini",
    "provider": "openai",
    "inputTokens": 100,
    "outputTokens": 50,
    "totalTokens": 150,
    "estimatedCost": 0.01,
    "latencyMs": 320,
    "status": "success",
    "traceId": "e2e-trace-001"
  }' | python3 -m json.tool

echo "==> Enrolling agent..."
AGENT_BIN="$(cd "$(dirname "$0")/../agent" && pwd)/usejunction"
if [[ ! -x "$AGENT_BIN" ]]; then
  (cd "$(dirname "$0")/../agent" && go build -o usejunction .)
fi
"$AGENT_BIN" enroll --token "$TOKEN" --url "$BASE" --email "demo@example.com" --name "Demo Dev"

echo "==> Running doctor + report..."
"$AGENT_BIN" doctor
"$AGENT_BIN" report --format json

echo "==> Overview dashboard:"
curl -s "$BASE/api/dashboard/overview" | python3 -m json.tool

echo "==> Requests:"
curl -s "$BASE/api/dashboard/requests?limit=5" | python3 -m json.tool

echo "==> Config health:"
curl -s "$BASE/api/dashboard/config-health" | python3 -m json.tool

echo ""
echo "E2E demo complete. Open $BASE in your browser."
