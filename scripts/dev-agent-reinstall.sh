#!/usr/bin/env bash
# Rebuild the UseJunction agent from this checkout and reinstall it into ~/.usejunction.
# Dev-only: bypasses install.sh release/semver gates. Does not enroll or publish a release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_SRC="${ROOT}/agent"
INSTALL_DIR="${HOME}/.usejunction/bin"
APP_NAME="UseJunction"
APP_DIR="${HOME}/.usejunction/${APP_NAME}.app"
LEGACY_APP_DIR="${HOME}/.usejunction/UseJunction Agent.app"
CONFIG_PATH="${HOME}/.usejunction/config.json"
LOCK_FILE="${TMPDIR:-/tmp}/usejunction-dev-agent-reinstall.lock"
LOCK_DIR="${LOCK_FILE}.d"
PACKAGE_SCRIPT="${ROOT}/scripts/package-macos-app.sh"
tmpdir=""
lock_held=0

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

usage() {
  cat <<'EOF'
Usage: ./scripts/dev-agent-reinstall.sh

Rebuilds the local agent from source, swaps it into ~/.usejunction, and restarts
the background daemon. Requires an existing enrollment (config.json).
EOF
}

cleanup() {
  if [[ -n "$tmpdir" ]]; then
    rm -rf "$tmpdir"
  fi
  if [[ "$lock_held" -eq 1 ]]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -f "${AGENT_SRC}/main.go" ]]; then
  echo "Agent source not found at ${AGENT_SRC}/main.go" >&2
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "Go is required to rebuild the agent." >&2
  exit 1
fi

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "No existing enrollment at ${CONFIG_PATH}." >&2
  echo "Enroll first, then re-run this script:" >&2
  echo "  ./install.sh --token <token> --url http://localhost:3001" >&2
  exit 1
fi

# Serialize overlapping watcher rebuilds so the app swap cannot race.
# Prefer flock when available; fall back to a mkdir lock (portable on macOS).
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Another agent reinstall is already running; waiting…"
    flock 9
  fi
else
  waited=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    if [[ $waited -eq 0 ]]; then
      echo "Another agent reinstall is already running; waiting…"
    fi
    sleep 0.25
    waited=$((waited + 1))
    if [[ $waited -gt 240 ]]; then
      echo "Timed out waiting for agent reinstall lock." >&2
      exit 1
    fi
  done
  lock_held=1
fi

short_sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true)"
if [[ -z "$short_sha" ]]; then
  short_sha="nogit"
fi
unix_ts="$(date +%s)"
VERSION="0.0.0-dev.${short_sha}.${unix_ts}"

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/usejunction-dev-agent.XXXXXX")"
tmp_binary="${tmpdir}/usejunction"
echo "Building agent v${VERSION} from ${AGENT_SRC}…"
(
  cd "$AGENT_SRC"
  go build -ldflags "-X github.com/usejunction/agent/internal/config.Version=${VERSION}" -o "$tmp_binary" .
)

restart_daemon() {
  case "$OS" in
    darwin)
      label="gui/$(id -u)/com.usejunction.agent"
      if launchctl kickstart -k "$label" 2>/dev/null; then
        return 0
      fi
      plist="${HOME}/Library/LaunchAgents/com.usejunction.agent.plist"
      if [[ -f "$plist" ]]; then
        launchctl unload "$plist" 2>/dev/null || true
        launchctl load "$plist"
        return 0
      fi
      echo "Warning: launchd plist not found; binary was updated but daemon was not restarted." >&2
      return 0
      ;;
    linux)
      if command -v systemctl >/dev/null 2>&1; then
        systemctl --user daemon-reload 2>/dev/null || true
        systemctl --user restart usejunction-agent.service
        return 0
      fi
      echo "Warning: systemctl not available; binary was updated but daemon was not restarted." >&2
      return 0
      ;;
    *)
      echo "Warning: automatic restart is unsupported on ${OS}." >&2
      return 0
      ;;
  esac
}

install_macos() {
  if [[ ! -f "$PACKAGE_SCRIPT" ]]; then
    echo "Missing packaging script: ${PACKAGE_SCRIPT}" >&2
    exit 1
  fi
  local staged_app="${HOME}/.usejunction/${APP_NAME}.new.app"
  local previous_app="${HOME}/.usejunction/${APP_NAME}.previous.app"
  rm -rf "$staged_app" "$previous_app"
  bash "$PACKAGE_SCRIPT" "$tmp_binary" "$staged_app" "$VERSION"
  if [[ -d "$LEGACY_APP_DIR" && ! -d "$APP_DIR" ]]; then
    mv "$LEGACY_APP_DIR" "$APP_DIR"
  elif [[ -d "$LEGACY_APP_DIR" ]]; then
    rm -rf "$LEGACY_APP_DIR"
  fi
  bash "$PACKAGE_SCRIPT" "$tmp_binary" "$staged_app" "$VERSION"
  if [[ -d "$APP_DIR" ]]; then
    mv "$APP_DIR" "$previous_app"
  fi
  if ! mv "$staged_app" "$APP_DIR"; then
    [[ -d "$previous_app" ]] && mv "$previous_app" "$APP_DIR"
    echo "Failed to swap macOS app bundle into place." >&2
    exit 1
  fi
  mkdir -p "$INSTALL_DIR"
  ln -sf "../${APP_NAME}.app/Contents/MacOS/usejunction" "${INSTALL_DIR}/usejunction"
}

install_linux() {
  mkdir -p "$INSTALL_DIR"
  local destination="${INSTALL_DIR}/usejunction"
  local staged="${destination}.new"
  local previous="${destination}.previous"
  cp "$tmp_binary" "$staged"
  chmod +x "$staged"
  rm -f "$previous"
  if [[ -e "$destination" ]]; then
    mv "$destination" "$previous"
  fi
  if ! mv "$staged" "$destination"; then
    [[ -e "$previous" ]] && mv "$previous" "$destination"
    echo "Failed to install agent binary." >&2
    exit 1
  fi
}

case "$OS" in
  darwin) install_macos ;;
  linux) install_linux ;;
  *)
    echo "Unsupported OS for local agent reinstall: ${OS}" >&2
    exit 1
    ;;
esac

echo "Restarting background agent…"
restart_daemon

binary="${INSTALL_DIR}/usejunction"
if [[ "$OS" == "darwin" ]]; then
  binary="${APP_DIR}/Contents/MacOS/usejunction"
fi

if [[ -x "$binary" ]]; then
  echo "Installed UseJunction agent v${VERSION}."
  "$binary" status || true
else
  echo "Installed UseJunction agent v${VERSION}, but could not run status." >&2
fi
