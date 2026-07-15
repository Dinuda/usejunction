#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"

headers="$(curl -fsSI "${BASE_URL}/login")"
for required in \
  "content-security-policy:" \
  "x-frame-options: DENY" \
  "x-content-type-options: nosniff" \
  "referrer-policy:"; do
  if ! printf '%s\n' "$headers" | tr '[:upper:]' '[:lower:]' | rg -q "$(printf '%s' "$required" | tr '[:upper:]' '[:lower:]')"; then
    echo "Missing security header: $required" >&2
    exit 1
  fi
done

status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H 'content-type: application/json' \
  -d '{}' \
  "${BASE_URL}/api/ingest/request")"
if [[ "$status" != "401" ]]; then
  echo "Unauthenticated ingest returned $status, expected 401" >&2
  exit 1
fi

status="$(curl -sS -o /dev/null -w '%{http_code}' \
  "${BASE_URL}/api/connect-invite/not-a-token/status")"
if [[ "$status" != "404" && "$status" != "401" ]]; then
  echo "Invalid connect polling returned $status" >&2
  exit 1
fi

echo "Security smoke checks passed for ${BASE_URL}."
