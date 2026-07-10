#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="${ADMIN_URL:-http://localhost:3001}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

curl -sf -c "$COOKIE_JAR" -X POST "$ADMIN_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin"}' >/dev/null

token=$(curl -sf -b "$COOKIE_JAR" -X POST "$ADMIN_URL/api/enrollment-tokens" \
  -H "Content-Type: application/json" -d '{}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

echo "Enrollment token: $token"
(cd "$ROOT/agent" && go build -o usejunction .)
"$ROOT/agent/usejunction" enroll --token "$token" --url "$ADMIN_URL"
"$ROOT/agent/usejunction" doctor
"$ROOT/agent/usejunction" report
echo "Demo complete. Check $ADMIN_URL/devices"
