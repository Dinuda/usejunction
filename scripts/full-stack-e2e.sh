#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="${ADMIN_URL:-http://localhost:3001}"
LITELLM_URL="${LITELLM_URL:-http://localhost:4000}"
LANGFUSE_URL="${LANGFUSE_URL:-http://localhost:3000}"
LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-sk-usejunction-master}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}"
INGEST_SECRET="${INGEST_SECRET:-change-me-ingest-secret}"
MODEL="${E2E_MODEL:-gpt-4o-mini}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

load_env_file() {
  local env_file="${ENV_FILE:-$ROOT/.env}"
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line; do
    [[ "$line" =~ ^(OPENAI_API_KEY|ANTHROPIC_API_KEY|INGEST_SECRET)= ]] || continue
    local key="${line%%=*}"
    local value="${line#*=}"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$env_file"
}

has_provider_key() {
  [[ -n "${OPENAI_API_KEY:-}" || -n "${ANTHROPIC_API_KEY:-}" ]]
}

wait_for() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-60}"
  local attempt=1
  echo "==> Waiting for $name at $url..."
  while [[ $attempt -le $max_attempts ]]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "    $name is ready"
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  echo "ERROR: $name did not become ready in time" >&2
  return 1
}

load_env_file

wait_for "admin" "$ADMIN_URL/api/health"
wait_for "langfuse" "$LANGFUSE_URL"
wait_for "litellm" "$LITELLM_URL/health/liveliness" 90

echo "==> Logging in to admin..."
login_resp=$(curl -s -w "\n%{http_code}" -c "$COOKIE_JAR" -X POST "$ADMIN_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
login_code=$(echo "$login_resp" | tail -n1)
if [[ "$login_code" != "200" ]]; then
  echo "ERROR: admin login failed (HTTP $login_code)" >&2
  exit 1
fi

echo "==> Fetching seed user id..."
user_id=$(curl -s -b "$COOKIE_JAR" "$ADMIN_URL/api/dashboard/developers" | python3 -c "
import sys, json
data = json.load(sys.stdin)
devs = data.get('developers') or []
if not devs:
    raise SystemExit('no seeded developers found')
print(devs[0]['id'])
")
echo "    Using user id: $user_id"

before_count=$(curl -s -b "$COOKIE_JAR" "$ADMIN_URL/api/dashboard/requests?limit=100" | python3 -c "
import sys, json
print(len(json.load(sys.stdin).get('requests', [])))
")

GATEWAY_TESTED=0
MATCH_TOOL="codex"
MATCH_MODEL_HINT="gpt"
E2E_TRACE_ID="e2e-$(date +%s)"

if has_provider_key; then
  echo "==> Sending LiteLLM chat completion..."
  completion_resp=$(curl -s -w "\n%{http_code}" -X POST "$LITELLM_URL/v1/chat/completions" \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    -H "Content-Type: application/json" \
    -H "x-usejunction-user: $user_id" \
    -H "x-usejunction-tool: codex" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"ping from full-stack e2e\"}]}")
  completion_code=$(echo "$completion_resp" | tail -n1)
  completion_body=$(echo "$completion_resp" | sed '$d')
  if [[ "$completion_code" != "200" ]]; then
    echo "ERROR: LiteLLM request failed (HTTP $completion_code)" >&2
    echo "$completion_body" >&2
    exit 1
  fi
  echo "    LiteLLM response OK"
  GATEWAY_TESTED=1
else
  echo "==> Skipping LiteLLM completion (no OPENAI_API_KEY or ANTHROPIC_API_KEY in env / .env)"
  echo "==> Posting sample gateway ingest directly to admin..."
  ingest_resp=$(curl -s -w "\n%{http_code}" -X POST "$ADMIN_URL/api/ingest/request" \
    -H "Authorization: Bearer $INGEST_SECRET" \
    -H "Content-Type: application/json" \
    -d "{
      \"orgId\": \"seed-org\",
      \"userId\": \"$user_id\",
      \"toolName\": \"codex\",
      \"provider\": \"openai\",
      \"model\": \"openai/gpt-4o-mini\",
      \"inputTokens\": 10,
      \"outputTokens\": 5,
      \"totalTokens\": 15,
      \"estimatedCost\": 0,
      \"latencyMs\": 1,
      \"status\": \"success\",
      \"traceId\": \"$E2E_TRACE_ID\",
      \"source\": \"gateway\"
    }")
  ingest_code=$(echo "$ingest_resp" | tail -n1)
  ingest_body=$(echo "$ingest_resp" | sed '$d')
  if [[ "$ingest_code" != "200" ]]; then
    echo "ERROR: direct ingest failed (HTTP $ingest_code)" >&2
    echo "$ingest_body" >&2
    exit 1
  fi
  echo "    Direct ingest OK ($ingest_body)"
  MATCH_MODEL_HINT="gpt-4o-mini"
fi

echo "==> Polling admin Requests API for new row..."
found=0
for attempt in $(seq 1 30); do
  requests_json=$(curl -s -b "$COOKIE_JAR" "$ADMIN_URL/api/dashboard/requests?limit=20")
  match=$(echo "$requests_json" | MATCH_TOOL="$MATCH_TOOL" MATCH_MODEL_HINT="$MATCH_MODEL_HINT" python3 -c "
import os, sys, json
data = json.load(sys.stdin)
tool = os.environ['MATCH_TOOL']
hint = os.environ['MATCH_MODEL_HINT']
for r in data.get('requests', []):
    if (r.get('tool') or r.get('toolName')) != tool:
        continue
    model = r.get('model') or ''
    trace = r.get('traceLink') or ''
    if hint in model or hint in trace:
        print(json.dumps(r))
        break
" || true)
  if [[ -n "$match" ]]; then
    found=1
    echo "    Request row found:"
    echo "$match" | python3 -m json.tool
    trace_link=$(echo "$match" | python3 -c "import sys,json; print(json.load(sys.stdin).get('traceLink') or '')")
    if [[ -n "$trace_link" ]]; then
      echo "    Langfuse trace link: $trace_link"
    elif [[ "$GATEWAY_TESTED" -eq 1 ]]; then
      echo "    WARN: no trace link on request row (Langfuse keys may be unset)"
    fi
    break
  fi
  sleep 2
done

if [[ "$found" -ne 1 ]]; then
  echo "ERROR: no matching request row appeared in admin" >&2
  curl -s -b "$COOKIE_JAR" "$ADMIN_URL/api/dashboard/requests?limit=5" | python3 -m json.tool >&2 || true
  exit 1
fi

after_count=$(curl -s -b "$COOKIE_JAR" "$ADMIN_URL/api/dashboard/requests?limit=100" | python3 -c "
import sys, json
print(len(json.load(sys.stdin).get('requests', [])))
")

echo ""
echo "PASS: Full stack E2E"
echo "  - Services healthy (admin, langfuse, litellm)"
if [[ "$GATEWAY_TESTED" -eq 1 ]]; then
  echo "  - LiteLLM completion succeeded"
else
  echo "  - LiteLLM gateway test skipped (no provider keys); ingest API verified instead"
fi
echo "  - Admin Requests row present (count: $before_count -> $after_count)"
echo "  - Admin UI: $ADMIN_URL/requests"
echo "  - Langfuse UI: $LANGFUSE_URL"
