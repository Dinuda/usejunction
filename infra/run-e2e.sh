#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_HOST_PORT="${ADMIN_HOST_PORT:-3011}"
export ADMIN_URL="${ADMIN_URL:-http://localhost:${ADMIN_HOST_PORT}}"

exec "$ROOT/scripts/full-stack-e2e.sh"
