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
CONCURRENT_BODY_ONE="$(mktemp)"
CONCURRENT_BODY_TWO="$(mktemp)"
CONCURRENT_CODE_ONE="$(mktemp)"
CONCURRENT_CODE_TWO="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$CONCURRENT_BODY_ONE" "$CONCURRENT_BODY_TWO" "$CONCURRENT_CODE_ONE" "$CONCURRENT_CODE_TWO"' EXIT

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
csrf_token=$(curl -s -c "$COOKIE_JAR" "$ADMIN_URL/api/auth/csrf" | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
login_resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$ADMIN_URL/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$csrf_token" \
  --data-urlencode "email=$ADMIN_EMAIL" \
  --data-urlencode "password=$ADMIN_PASSWORD" \
  --data-urlencode "callbackUrl=$ADMIN_URL/dashboard")
login_code=$(echo "$login_resp" | tail -n1)
if [[ "$login_code" != "200" && "$login_code" != "302" ]]; then
  echo "ERROR: admin login failed (HTTP $login_code)" >&2
  exit 1
fi

echo "==> Fetching seed user ids..."
developers_json=$(cd "$ROOT" && pnpm --silent --filter @usejunction/db exec dotenv -e ../../.env -- tsx -e '
import { prisma } from "@usejunction/db";
void (async () => {
  const developers = await prisma.developer.findMany({ where: { orgId: "seed-org" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  process.stdout.write(JSON.stringify({ developers }));
  await prisma.$disconnect();
})();
')
user_id=$(echo "$developers_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
devs = data.get('developers') or []
if not devs:
    raise SystemExit('no seeded developers found')
print(devs[0]['id'])
")
second_user_id=$(echo "$developers_json" | python3 -c "
import sys, json
devs = json.load(sys.stdin).get('developers') or []
if len(devs) < 2:
    raise SystemExit('two seeded developers are required')
print(devs[1]['id'])
")
echo "    Using user id: $user_id"

echo "==> Enrolling a developer-bound device and reporting repository usage..."
enrollment_token=$(curl -s -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/me/enrollment-token" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
enrollment=$(curl -s -X POST "$ADMIN_URL/api/enroll" -H "Content-Type: application/json" -d "{\"token\":\"$enrollment_token\",\"hostname\":\"e2e-device\",\"os\":\"linux\",\"architecture\":\"amd64\",\"agentVersion\":\"e2e\"}")
device_token=$(echo "$enrollment" | python3 -c "import sys,json; print(json.load(sys.stdin)['deviceToken'])")
curl -sf -X POST "$ADMIN_URL/api/ingest/local-usage" \
  -H "Authorization: Bearer $device_token" \
  -H "Content-Type: application/json" \
  -d '{"aggregates":[{"date":"2026-07-10","toolName":"claude","model":"claude-e2e","inputTokens":20,"outputTokens":10,"repository":{"host":"github.com","owner":"acme","name":"e2e"}}]}' >/dev/null
analytics_query='{"schemaVersion":"1","window":{"from":"2026-07-01","to":"2026-07-31"},"measures":["inputTokens"],"dimensions":["repository"]}'
repo_metric=$(curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/insights/query" -H "Content-Type: application/json" -d "$analytics_query" | python3 -c "import sys,json; data=json.load(sys.stdin); print(next((r['dimensions']['repository'] for r in data['data']['rows'] if r['dimensions'].get('repository') and int(r['measures']['inputTokens']) >= 20),''))")
[[ -n "$repo_metric" ]] || { echo "ERROR: repository metric was not returned" >&2; exit 1; }
cache_status=$(curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/insights/query" -H "Content-Type: application/json" -d "$analytics_query" | python3 -c "import sys,json; print(json.load(sys.stdin)['meta']['cache']['status'])")
[[ "$cache_status" == "hit" ]] || { echo "ERROR: repeated analytics query was not served from cache" >&2; exit 1; }

echo "==> Creating an Enterprise subscription and assigning it to the developer..."
plan_resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/tools/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"toolKey":"claude","planKey":"enterprise","billingCadence":"monthly","seatCapacity":1,"cycleSeatMicros":"31000000","includedCycleMicros":"0","inputRateMicrosPerMillion":"2000000","outputRateMicrosPerMillion":"4000000","cacheRateMicrosPerMillion":"1000000"}')
plan_code=$(echo "$plan_resp" | tail -n1)
plan_body=$(echo "$plan_resp" | sed '$d')
[[ "$plan_code" == "201" ]] || { echo "ERROR: subscription creation failed (HTTP $plan_code)" >&2; echo "$plan_body" >&2; exit 1; }
plan_id=$(echo "$plan_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['subscription']['id'])")
assignment_resp=$(curl -s -w "\n%{http_code}" -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/developers/$user_id/billing-assignments" \
  -H "Content-Type: application/json" \
  -d "{\"planTemplateId\":\"$plan_id\",\"startDate\":\"2026-07-01\",\"seatCount\":1,\"seatStatus\":\"active\"}")
assignment_code=$(echo "$assignment_resp" | tail -n1)
assignment_body=$(echo "$assignment_resp" | sed '$d')
[[ "$assignment_code" == "201" ]] || { echo "ERROR: plan assignment failed (HTTP $assignment_code)" >&2; echo "$assignment_body" >&2; exit 1; }
assignments=$(curl -sf -b "$COOKIE_JAR" "$ADMIN_URL/api/developers/$user_id/billing-assignments")
python3 -c "import sys,json; data=json.load(sys.stdin); rows=data.get('assignments', []); assert any(row['planName']=='Enterprise' and int(row['cycleSeatMicros']) > 0 for row in rows)" <<<"$assignments"
echo "    Enterprise plan assignment verified (billing arithmetic is covered by read-model tests)"

echo "==> Creating branded tool subscriptions and reserving seats..."
chatgpt_pro=$(curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/tools/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"toolKey":"chatgpt-codex","planKey":"pro","billingCadence":"monthly","seatCapacity":2}')
chatgpt_pro_id=$(echo "$chatgpt_pro" | python3 -c "import sys,json; print(json.load(sys.stdin)['subscription']['id'])")
curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/tools/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"toolKey":"chatgpt-codex","planKey":"plus","billingCadence":"monthly","seatCapacity":1}' >/dev/null
cursor_pro_plus=$(curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/tools/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"toolKey":"cursor","planKey":"pro-plus","billingCadence":"monthly","seatCapacity":1}')
cursor_pro_plus_id=$(echo "$cursor_pro_plus" | python3 -c "import sys,json; print(json.load(sys.stdin)['subscription']['id'])")

curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/developers/$user_id/billing-assignments" \
  -H "Content-Type: application/json" \
  -d "{\"planTemplateId\":\"$chatgpt_pro_id\",\"startDate\":\"2026-07-01\",\"seatCount\":1,\"seatStatus\":\"active\"}" >/dev/null
curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/developers/$user_id/billing-assignments" \
  -H "Content-Type: application/json" \
  -d "{\"planTemplateId\":\"$cursor_pro_plus_id\",\"startDate\":\"2026-07-01\",\"seatCount\":1,\"seatStatus\":\"active\"}" >/dev/null

subscriptions=$(curl -sf -b "$COOKIE_JAR" "$ADMIN_URL/api/tools/subscriptions")
python3 -c "
import sys, json
items = json.load(sys.stdin)['subscriptions']
by_plan = {(item.get('toolKey'), item.get('catalogPlanKey')): item for item in items}
pro = by_plan[('chatgpt-codex', 'pro')]
plus = by_plan[('chatgpt-codex', 'plus')]
cursor = by_plan[('cursor', 'pro-plus')]
assert (pro['seatCapacity'], pro['assignedSeats'], pro['availableSeats']) == (2, 1, 1)
assert (plus['seatCapacity'], plus['assignedSeats'], plus['availableSeats']) == (1, 0, 1)
assert (cursor['seatCapacity'], cursor['assignedSeats'], cursor['availableSeats']) == (1, 1, 0)
assert sum(int(item['estimatedCycleMicros']) for item in (pro, plus, cursor)) == 480000000
" <<<"$subscriptions"
echo "    ChatGPT Pro/Plus and Cursor Pro+ inventory verified (capacity, availability, and cycle total)"

echo "==> Verifying concurrent assignments cannot over-allocate a seat pool..."
copilot_business=$(curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/tools/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{"toolKey":"github-copilot","planKey":"business","billingCadence":"monthly","seatCapacity":1}')
copilot_business_id=$(echo "$copilot_business" | python3 -c "import sys,json; print(json.load(sys.stdin)['subscription']['id'])")
curl -s -o "$CONCURRENT_BODY_ONE" -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/developers/$user_id/billing-assignments" \
  -H "Content-Type: application/json" \
  -d "{\"planTemplateId\":\"$copilot_business_id\",\"startDate\":\"2026-07-01\",\"seatCount\":1,\"seatStatus\":\"active\"}" >"$CONCURRENT_CODE_ONE" &
pid_one=$!
curl -s -o "$CONCURRENT_BODY_TWO" -w "%{http_code}" -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/developers/$second_user_id/billing-assignments" \
  -H "Content-Type: application/json" \
  -d "{\"planTemplateId\":\"$copilot_business_id\",\"startDate\":\"2026-07-01\",\"seatCount\":1,\"seatStatus\":\"active\"}" >"$CONCURRENT_CODE_TWO" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"
codes=$(printf "%s\n%s\n" "$(cat "$CONCURRENT_CODE_ONE")" "$(cat "$CONCURRENT_CODE_TWO")" | sort | tr '\n' ' ')
[[ "$codes" == "201 409 " ]] || { echo "ERROR: expected one successful and one rejected concurrent assignment, got $codes" >&2; cat "$CONCURRENT_BODY_ONE" "$CONCURRENT_BODY_TWO" >&2; exit 1; }
copilot_state=$(curl -sf -b "$COOKIE_JAR" "$ADMIN_URL/api/tools/subscriptions" | COPILOT_ID="$copilot_business_id" python3 -c "import os,sys,json; item=next(x for x in json.load(sys.stdin)['subscriptions'] if x['id']==os.environ['COPILOT_ID']); print(f\"{item['assignedSeats']}:{item['availableSeats']}\")")
[[ "$copilot_state" == "1:0" ]] || { echo "ERROR: concurrent seat pool ended in state $copilot_state" >&2; exit 1; }
echo "    Exactly one Copilot Business seat was assigned"

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

echo "==> Polling the server-rendered Activity page for the new row..."
found=0
for attempt in $(seq 1 30); do
  activity_html=$(curl -sf -b "$COOKIE_JAR" "$ADMIN_URL/activity" || true)
  if [[ "$activity_html" == *"$MATCH_MODEL_HINT"* ]]; then
    found=1
    echo "    Request row found on /activity"
    break
  fi
  sleep 2
done

if [[ "$found" -ne 1 ]]; then
  echo "ERROR: no matching request row appeared in admin" >&2
  exit 1
fi

echo "==> Verifying legacy analytical reads are gone..."
for path in \
  /api/dashboard/config-health /api/dashboard/developers /api/dashboard/devices \
  /api/dashboard/local-models /api/dashboard/metrics /api/dashboard/requests \
  /api/dashboard/tools /api/dashboard/usage /api/me/overview /api/me/usage \
  /api/billing/summary /api/org-spend /api/tools/cursor \
  /api/insights/overview /api/insights/plan-usage; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$ADMIN_URL$path")
  [[ "$code" == "404" ]] || { echo "ERROR: legacy route $path returned HTTP $code" >&2; exit 1; }
done

echo ""
echo "PASS: Full stack E2E"
echo "  - Services healthy (admin, langfuse, litellm)"
if [[ "$GATEWAY_TESTED" -eq 1 ]]; then
  echo "  - LiteLLM completion succeeded"
else
  echo "  - LiteLLM gateway test skipped (no provider keys); ingest API verified instead"
fi
echo "  - Central analytics query and PostgreSQL cache verified"
echo "  - Admin activity row present and legacy reads return 404"
echo "  - Admin UI: $ADMIN_URL/activity"
echo "  - Langfuse UI: $LANGFUSE_URL"
