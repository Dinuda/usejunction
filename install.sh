#!/usr/bin/env bash
set -euo pipefail

ENROLL_TOKEN=""
CONTROL_PLANE_URL="${USEJUNCTION_URL:-http://localhost:3001}"
INSTALL_DIR="${HOME}/.usejunction/bin"
VERSION="0.1.0"

usage() {
  echo "Usage: curl -fsSL https://usejunction.dev/install.sh | sh -s -- --token <token> [--url <control-plane>]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token|--enroll-token) ENROLL_TOKEN="$2"; shift 2 ;;
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$INSTALL_DIR/usejunction"

DOWNLOAD_BASE="${USEJUNCTION_DOWNLOAD_BASE:-https://github.com/usejunction/usejunction/releases/download/v${VERSION}}"

if [[ -f "$SCRIPT_DIR/agent/main.go" ]]; then
  echo "Building agent from source..."
  (cd "$SCRIPT_DIR/agent" && go build -o "$BINARY" .)
elif command -v go >/dev/null 2>&1 && [[ -f "$SCRIPT_DIR/../agent/main.go" ]]; then
  echo "Building agent from source..."
  (cd "$SCRIPT_DIR/../agent" && go build -o "$BINARY" .)
else
  ARCHIVE="usejunction-${OS}-${ARCH}"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  echo "Downloading UseJunction agent ${VERSION} for ${OS}/${ARCH}..."
  curl -fsSL "${DOWNLOAD_BASE}/${ARCHIVE}" -o "${TMP_DIR}/${ARCHIVE}"
  curl -fsSL "${DOWNLOAD_BASE}/checksums.txt" -o "${TMP_DIR}/checksums.txt"
  EXPECTED="$(awk -v name="$ARCHIVE" '$2 == name {print $1}' "${TMP_DIR}/checksums.txt")"
  [[ -n "$EXPECTED" ]] || { echo "Checksum for ${ARCHIVE} not found"; exit 1; }
  if command -v shasum >/dev/null 2>&1; then
    ACTUAL="$(shasum -a 256 "${TMP_DIR}/${ARCHIVE}" | awk '{print $1}')"
  else
    ACTUAL="$(sha256sum "${TMP_DIR}/${ARCHIVE}" | awk '{print $1}')"
  fi
  [[ "$ACTUAL" == "$EXPECTED" ]] || { echo "Agent checksum verification failed"; exit 1; }
  cp "${TMP_DIR}/${ARCHIVE}" "$BINARY"
fi

chmod +x "$BINARY"
export PATH="$INSTALL_DIR:$PATH"

echo "Enrolling device..."
"$BINARY" enroll --token "$ENROLL_TOKEN" --url "$CONTROL_PLANE_URL"

echo "Detecting tools..."
"$BINARY" doctor

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
