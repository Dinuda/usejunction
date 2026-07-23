#!/usr/bin/env bash
# Rebuild the UseJunction agent from this checkout and reinstall it into ~/.usejunction.
# Dev-only: bypasses install.sh release/semver gates. Does not enroll or publish a release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT_SRC="${ROOT}/agent"
INSTALL_DIR="${HOME}/.usejunction/bin"
APP_NAME="UseJunction"
APP_DIR="${HOME}/.usejunction/${APP_NAME}.app"
PREVIOUS_APP="${HOME}/.usejunction/${APP_NAME}.previous.app"
LEGACY_APP_DIR="${HOME}/.usejunction/UseJunction Agent.app"
CONFIG_PATH="${HOME}/.usejunction/config.json"
PLIST="${HOME}/Library/LaunchAgents/com.usejunction.agent.plist"
DEV_SOURCE_FILE="${HOME}/.usejunction/dev-source"
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

Fails if the daemon cannot be restarted onto the new binary (so a stale process
cannot keep running from UseJunction.previous.app).
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

darwin_domain() {
  printf 'gui/%s' "$(id -u)"
}

darwin_label() {
  printf '%s/com.usejunction.agent' "$(darwin_domain)"
}

# Stop the launchd/systemd job before replacing binaries so the old process
# cannot keep executing from a renamed .previous.app path.
stop_daemon() {
  case "$OS" in
    darwin)
      local domain label
      domain="$(darwin_domain)"
      label="$(darwin_label)"
      if [[ -f "$PLIST" ]]; then
        launchctl bootout "$domain" "$PLIST" 2>/dev/null || true
        launchctl unload "$PLIST" 2>/dev/null || true
      fi
      # Best-effort: kill any leftover daemon still mapped to previous/current app.
      pkill -f "${HOME}/.usejunction/.*usejunction.*daemon" 2>/dev/null || true
      sleep 0.3
      ;;
    linux)
      if command -v systemctl >/dev/null 2>&1; then
        systemctl --user stop usejunction-agent.service 2>/dev/null || true
      fi
      ;;
  esac
}

restart_daemon() {
  case "$OS" in
    darwin)
      local domain label
      domain="$(darwin_domain)"
      label="$(darwin_label)"
      ensure_launchd_plist
      if [[ ! -f "$PLIST" ]]; then
        echo "launchd plist not found at ${PLIST}; binary was updated but daemon was not restarted." >&2
        return 1
      fi
      # Prefer kickstart -k when the job is already loaded.
      if launchctl kickstart -k "$label" 2>/dev/null; then
        return 0
      fi
      # Job was booted out — bootstrap then kickstart. Never bare-load alone.
      launchctl bootout "$domain" "$PLIST" 2>/dev/null || true
      if launchctl bootstrap "$domain" "$PLIST" 2>/dev/null; then
        launchctl kickstart -k "$label" 2>/dev/null || true
        return 0
      fi
      launchctl unload "$PLIST" 2>/dev/null || true
      if launchctl load "$PLIST" 2>/dev/null; then
        launchctl kickstart -k "$label" 2>/dev/null || true
        return 0
      fi
      echo "Failed to restart launchd agent ${label}." >&2
      return 1
      ;;
    linux)
      if ! command -v systemctl >/dev/null 2>&1; then
        echo "systemctl not available; binary was updated but daemon was not restarted." >&2
        return 1
      fi
      systemctl --user daemon-reload 2>/dev/null || true
      systemctl --user restart usejunction-agent.service
      return 0
      ;;
    *)
      echo "Automatic restart is unsupported on ${OS}." >&2
      return 1
      ;;
  esac
}

# Recreate the launchd agent if onboarding wiped it or never enrolled via install.sh.
ensure_launchd_plist() {
  [[ "$OS" == "darwin" ]] || return 0
  local binary="${APP_DIR}/Contents/MacOS/usejunction"
  if [[ ! -x "$binary" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.usejunction.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binary}</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/.usejunction/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/.usejunction/agent.err</string>
</dict>
</plist>
EOF
}

# Pin this checkout so curl|install.sh and OTA cannot silently replace 0.0.0-dev.
write_dev_source_pin() {
  mkdir -p "${HOME}/.usejunction"
  printf '%s\n' "$ROOT" > "$DEV_SOURCE_FILE"
  echo "Pinned local checkout at ${DEV_SOURCE_FILE} → ${ROOT}"
}

# Confirm the running daemon is the new app binary, not a stale .previous.app process.
verify_daemon() {
  local binary="$1"
  local expected_version="$2"
  case "$OS" in
    darwin)
      local i cmd_line
      for i in 1 2 3 4 5 6 7 8 9 10; do
        if pgrep -f "${PREVIOUS_APP}/Contents/MacOS/usejunction" >/dev/null 2>&1; then
          echo "Stale daemon still running from ${PREVIOUS_APP}." >&2
          return 1
        fi
        if pgrep -f "${APP_DIR}/Contents/MacOS/usejunction" >/dev/null 2>&1 \
          || pgrep -f 'UseJunction\.app/Contents/MacOS/usejunction' >/dev/null 2>&1; then
          break
        fi
        sleep 0.3
        if [[ $i -eq 10 ]]; then
          echo "Daemon did not start from ${APP_DIR} after restart." >&2
          return 1
        fi
      done
      ;;
    linux)
      if command -v systemctl >/dev/null 2>&1; then
        if ! systemctl --user is-active --quiet usejunction-agent.service; then
          echo "usejunction-agent.service is not active after restart." >&2
          return 1
        fi
      fi
      ;;
  esac

  if [[ ! -x "$binary" ]]; then
    echo "Installed binary is not executable: ${binary}" >&2
    return 1
  fi

  local status_json
  if ! status_json="$("$binary" status --format json 2>/dev/null)"; then
    echo "Could not run status on installed binary: ${binary}" >&2
    return 1
  fi
  if ! printf '%s' "$status_json" | grep -Eq "\"agentVersion\"[[:space:]]*:[[:space:]]*\"${expected_version}\""; then
    echo "Installed binary status version mismatch (expected ${expected_version})." >&2
    echo "$status_json" >&2
    return 1
  fi
  return 0
}

install_macos() {
  if [[ ! -f "$PACKAGE_SCRIPT" ]]; then
    echo "Missing packaging script: ${PACKAGE_SCRIPT}" >&2
    exit 1
  fi
  local staged_app="${HOME}/.usejunction/${APP_NAME}.new.app"
  rm -rf "$staged_app" "$PREVIOUS_APP"
  bash "$PACKAGE_SCRIPT" "$tmp_binary" "$staged_app" "$VERSION"
  if [[ -d "$LEGACY_APP_DIR" && ! -d "$APP_DIR" ]]; then
    mv "$LEGACY_APP_DIR" "$APP_DIR"
  elif [[ -d "$LEGACY_APP_DIR" ]]; then
    rm -rf "$LEGACY_APP_DIR"
  fi
  if [[ -d "$APP_DIR" ]]; then
    mv "$APP_DIR" "$PREVIOUS_APP"
  fi
  if ! mv "$staged_app" "$APP_DIR"; then
    [[ -d "$PREVIOUS_APP" ]] && mv "$PREVIOUS_APP" "$APP_DIR"
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

echo "Stopping background agent before binary swap…"
stop_daemon

case "$OS" in
  darwin) install_macos ;;
  linux) install_linux ;;
  *)
    echo "Unsupported OS for local agent reinstall: ${OS}" >&2
    exit 1
    ;;
esac

write_dev_source_pin

echo "Restarting background agent…"
if ! restart_daemon; then
  echo "Agent binary was installed but daemon restart failed." >&2
  exit 1
fi

binary="${INSTALL_DIR}/usejunction"
if [[ "$OS" == "darwin" ]]; then
  binary="${APP_DIR}/Contents/MacOS/usejunction"
fi

if ! verify_daemon "$binary" "$VERSION"; then
  echo "Agent reinstall verification failed for v${VERSION}." >&2
  exit 1
fi

echo "Installed UseJunction agent v${VERSION}."
"$binary" status || true
