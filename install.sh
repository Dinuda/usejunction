#!/usr/bin/env bash
set -euo pipefail

ENROLL_TOKEN=""
CONTROL_PLANE_URL="${USEJUNCTION_URL:-http://localhost:3001}"
INSTALL_DIR="${HOME}/.usejunction/bin"
VERSION="0.1.0"

usage() {
  echo "Usage: curl -fsSL https://usejunction.dev/install.sh | sh -s -- --enroll-token <token> [--url <control-plane>]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --enroll-token) ENROLL_TOKEN="$2"; shift 2 ;;
    --url) CONTROL_PLANE_URL="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

[[ -n "$ENROLL_TOKEN" ]] || usage

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

mkdir -p "$INSTALL_DIR"

# For MVP: build from source if binary not published
BINARY="$INSTALL_DIR/usejunction"
if [[ -f "$(dirname "$0")/../agent/main.go" ]]; then
  echo "Building agent from source..."
  (cd "$(dirname "$0")/../agent" && go build -o "$BINARY" .)
elif command -v go >/dev/null 2>&1 && [[ -d "$(dirname "$0")/agent" ]]; then
  (cd "$(dirname "$0")/agent" && go build -o "$BINARY" .)
else
  echo "Downloading usejunction agent (placeholder — build from repo for MVP)..."
  if ! command -v go >/dev/null 2>&1; then
    echo "Go is required to build the agent. Install Go 1.22+ and re-run."
    exit 1
  fi
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  (cd "$REPO_ROOT/agent" && go build -o "$BINARY" .)
fi

chmod +x "$BINARY"
export PATH="$INSTALL_DIR:$PATH"

echo "Enrolling device..."
"$BINARY" enroll --token "$ENROLL_TOKEN" --url "$CONTROL_PLANE_URL"

echo "Detecting tools..."
"$BINARY" doctor

echo "Configuring supported tools..."
"$BINARY" configure || true

# macOS launchd user agent
if [[ "$OS" == "darwin" ]]; then
  PLIST="${HOME}/Library/LaunchAgents/com.usejunction.agent.plist"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.usejunction.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>${BINARY}</string>
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
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Started background agent (launchd)."
fi

# Linux systemd user service
if [[ "$OS" == "linux" ]] && command -v systemctl >/dev/null 2>&1; then
  UNIT_DIR="${HOME}/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/usejunction-agent.service" <<EOF
[Unit]
Description=UseJunction Agent
After=network.target

[Service]
ExecStart=${BINARY} daemon
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now usejunction-agent.service
  echo "Started background agent (systemd user)."
fi

"$BINARY" status
echo ""
echo "UseJunction installed. Admin panel: ${CONTROL_PLANE_URL}"
echo "Rollback: usejunction uninstall"
