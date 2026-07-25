#!/usr/bin/env bash
# Local dev entrypoint: start admin + agent watcher (rebuilds on start and on save).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WATCH="${ROOT}/scripts/dev-agent-watch.sh"

cleanup() {
  if [[ -n "${admin_pid:-}" ]]; then
    kill "$admin_pid" 2>/dev/null || true
  fi
  if [[ -n "${watch_pid:-}" ]]; then
    kill "$watch_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

pnpm --filter @usejunction/admin dev &
admin_pid=$!

bash "$WATCH" &
watch_pid=$!

wait -n "$admin_pid" "$watch_pid"
exit_code=$?
cleanup
exit "$exit_code"
