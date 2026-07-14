#!/usr/bin/env bash
set -euo pipefail

ENROLL_TOKEN=""
CONNECT_TOKEN=""
CONTROL_PLANE_URL="${USEJUNCTION_URL:-http://localhost:3001}"
INSTALL_DIR="${HOME}/.usejunction/bin"
APP_NAME="UseJunction Agent"
APP_DIR="${HOME}/.usejunction/${APP_NAME}.app"
VERSION="0.1.0"

usage() {
  echo "Usage: curl -fsSL <control-plane>/install.sh | sh -s -- (--token <token> | --connect <token>) [--url <control-plane>]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token|--enroll-token) ENROLL_TOKEN="$2"; shift 2 ;;
    --connect) CONNECT_TOKEN="$2"; shift 2 ;;
    --url) CONTROL_PLANE_URL="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

CONTROL_PLANE_URL="${CONTROL_PLANE_URL%/}"

if [[ -z "$ENROLL_TOKEN" && -z "$CONNECT_TOKEN" ]]; then
  usage
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

mkdir -p "$INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || true)"
BINARY="$INSTALL_DIR/usejunction"
ARCHIVE="usejunction-${OS}-${ARCH}"

find_agent_src() {
  if [[ -n "${USEJUNCTION_ROOT:-}" && -f "${USEJUNCTION_ROOT}/agent/main.go" ]]; then
    printf '%s\n' "${USEJUNCTION_ROOT}/agent"
    return 0
  fi
  if [[ -n "${SCRIPT_DIR:-}" && -f "${SCRIPT_DIR}/agent/main.go" ]]; then
    printf '%s\n' "${SCRIPT_DIR}/agent"
    return 0
  fi
  local dir="${PWD:-.}"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/agent/main.go" ]]; then
      printf '%s\n' "$dir/agent"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

download_agent() {
  local base="$1"
  local tmp_dir="$2"
  local archive="$3"
  curl -fsSL "${base}/${archive}" -o "${tmp_dir}/${archive}"
  curl -fsSL "${base}/checksums.txt" -o "${tmp_dir}/checksums.txt"
  local expected
  expected="$(awk -v name="$archive" '$2 == name {print $1}' "${tmp_dir}/checksums.txt")"
  [[ -n "$expected" ]] || { echo "Checksum for ${archive} not found in ${base}/checksums.txt"; return 1; }
  local actual
  if command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "${tmp_dir}/${archive}" | awk '{print $1}')"
  else
    actual="$(sha256sum "${tmp_dir}/${archive}" | awk '{print $1}')"
  fi
  [[ "$actual" == "$expected" ]] || { echo "Agent checksum verification failed"; return 1; }
  printf '%s\n' "${tmp_dir}/${archive}"
}

find_package_script() {
  if [[ -n "${USEJUNCTION_ROOT:-}" && -f "${USEJUNCTION_ROOT}/scripts/package-macos-app.sh" ]]; then
    printf '%s\n' "${USEJUNCTION_ROOT}/scripts/package-macos-app.sh"
    return 0
  fi
  if [[ -n "${SCRIPT_DIR:-}" && -f "${SCRIPT_DIR}/scripts/package-macos-app.sh" ]]; then
    printf '%s\n' "${SCRIPT_DIR}/scripts/package-macos-app.sh"
    return 0
  fi
  local dir="${PWD:-.}"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/scripts/package-macos-app.sh" ]]; then
      printf '%s\n' "$dir/scripts/package-macos-app.sh"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

install_macos_app_bundle() {
  local binary="$1"
  local package_script=""
  if package_script="$(find_package_script)"; then
    bash "$package_script" "$binary" "$APP_DIR" "$VERSION"
    return 0
  fi

  local macos_assets=""
  if [[ -n "${USEJUNCTION_ROOT:-}" && -f "${USEJUNCTION_ROOT}/agent/macos/AppIcon.icns" ]]; then
    macos_assets="${USEJUNCTION_ROOT}/agent/macos"
  elif [[ -n "${SCRIPT_DIR:-}" && -f "${SCRIPT_DIR}/agent/macos/AppIcon.icns" ]]; then
    macos_assets="${SCRIPT_DIR}/agent/macos"
  else
    local dir="${PWD:-.}"
    while [[ "$dir" != "/" ]]; do
      if [[ -f "$dir/agent/macos/AppIcon.icns" ]]; then
        macos_assets="$dir/agent/macos"
        break
      fi
      dir="$(dirname "$dir")"
    done
  fi
  [[ -n "$macos_assets" ]] || { echo "macOS bundle assets not found"; return 1; }

  rm -rf "$APP_DIR"
  mkdir -p "${APP_DIR}/Contents/MacOS" "${APP_DIR}/Contents/Resources"
  cp "$binary" "${APP_DIR}/Contents/MacOS/usejunction"
  chmod +x "${APP_DIR}/Contents/MacOS/usejunction"
  cp "${macos_assets}/AppIcon.icns" "${APP_DIR}/Contents/Resources/AppIcon.icns"
  sed \
    -e "s/<string>0.1.0<\\/string>/<string>${VERSION}<\\/string>/g" \
    "${macos_assets}/Info.plist" > "${APP_DIR}/Contents/Info.plist"
}

link_macos_cli() {
  mkdir -p "$INSTALL_DIR"
  ln -sf "../${APP_NAME}.app/Contents/MacOS/usejunction" "${INSTALL_DIR}/usejunction"
}

download_macos_agent() {
  local base="$1"
  local tmp_dir="$2"
  local app_archive="${ARCHIVE}.app.zip"
  local app_path
  if app_path="$(download_agent "$base" "$tmp_dir" "$app_archive")"; then
    rm -rf "$APP_DIR"
    ditto -x -k "$app_path" "${HOME}/.usejunction"
    [[ -x "${APP_DIR}/Contents/MacOS/usejunction" ]] || { echo "App bundle missing executable"; return 1; }
    link_macos_cli
    return 0
  fi
  return 1
}

install_agent() {
  local agent_src=""
  if [[ "$OS" == "darwin" ]]; then
    if agent_src="$(find_agent_src)" && command -v go >/dev/null 2>&1; then
      echo "Building agent from source (${agent_src})..."
      local tmp_binary
      tmp_binary="$(mktemp)"
      (cd "$agent_src" && go build -o "$tmp_binary" .)
      install_macos_app_bundle "$tmp_binary"
      rm -f "$tmp_binary"
      link_macos_cli
      return 0
    fi

    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT

    local control_base="${CONTROL_PLANE_URL}/releases/download/v${VERSION}"
    local github_base="https://github.com/usejunction/usejunction/releases/download/v${VERSION}"
    local bases=()
    if [[ -n "${USEJUNCTION_DOWNLOAD_BASE:-}" ]]; then
      bases+=("${USEJUNCTION_DOWNLOAD_BASE}")
    fi
    bases+=("${control_base}" "${github_base}")

    local base
    for base in "${bases[@]}"; do
      echo "Downloading UseJunction agent ${VERSION} for ${OS}/${ARCH} from ${base}..."
      if download_macos_agent "$base" "$tmp_dir"; then
        return 0
      fi
      echo "App bundle download from ${base} failed; trying bare binary..."
      local binary_path
      if binary_path="$(download_agent "$base" "$tmp_dir" "$ARCHIVE")"; then
        install_macos_app_bundle "$binary_path"
        link_macos_cli
        return 0
      fi
      echo "Download from ${base} failed; trying next source..."
    done
  else
    if agent_src="$(find_agent_src)" && command -v go >/dev/null 2>&1; then
      echo "Building agent from source (${agent_src})..."
      (cd "$agent_src" && go build -o "$BINARY" .)
      return 0
    fi

    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT

    local control_base="${CONTROL_PLANE_URL}/releases/download/v${VERSION}"
    local github_base="https://github.com/usejunction/usejunction/releases/download/v${VERSION}"
    local bases=()
    if [[ -n "${USEJUNCTION_DOWNLOAD_BASE:-}" ]]; then
      bases+=("${USEJUNCTION_DOWNLOAD_BASE}")
    fi
    bases+=("${control_base}" "${github_base}")

    local base
    for base in "${bases[@]}"; do
      echo "Downloading UseJunction agent ${VERSION} for ${OS}/${ARCH} from ${base}..."
      local binary_path
      if binary_path="$(download_agent "$base" "$tmp_dir" "$ARCHIVE")"; then
        cp "$binary_path" "$BINARY"
        return 0
      fi
      echo "Download from ${base} failed; trying next source..."
    done
  fi

  echo "Could not install the UseJunction agent."
  echo "No prebuilt binary was found, and Go source was not available to build."
  echo "Fix options:"
  echo "  1. From a checkout:  ./install.sh --token <token> --url ${CONTROL_PLANE_URL}"
  echo "  2. Or: cd agent && go build -o ~/.usejunction/bin/usejunction ."
  echo "  3. Or set USEJUNCTION_ROOT to your repo and re-run this installer."
  exit 1
}

install_agent
if [[ "$OS" == "darwin" ]]; then
  BINARY="${APP_DIR}/Contents/MacOS/usejunction"
else
  chmod +x "$BINARY"
fi
export PATH="$INSTALL_DIR:$PATH"

if [[ -n "$CONNECT_TOKEN" ]]; then
  JOIN_URL="${CONTROL_PLANE_URL}/connect-invite/${CONNECT_TOKEN}"
  echo "Opening browser to authenticate…"
  echo "  ${JOIN_URL}"
  if command -v open >/dev/null 2>&1; then
    open "$JOIN_URL" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$JOIN_URL" >/dev/null 2>&1 || true
  fi

  echo "Waiting for you to sign in (up to 10 minutes)…"
  ATTEMPTS=0
  MAX_ATTEMPTS=120
  while [[ $ATTEMPTS -lt $MAX_ATTEMPTS ]]; do
    STATUS_JSON="$(curl -fsS "${CONTROL_PLANE_URL}/api/connect-invite/${CONNECT_TOKEN}/status" 2>/dev/null || true)"
    STATUS="$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    if [[ "$STATUS" == "ready" ]]; then
      ENROLL_TOKEN="$(printf '%s' "$STATUS_JSON" | sed -n 's/.*"enrollmentToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
      if [[ -n "$ENROLL_TOKEN" ]]; then
        echo "Authenticated. Enrolling device…"
        break
      fi
    fi
    if [[ "$STATUS" == "expired" || "$STATUS" == "used" ]]; then
      echo "Connect invite ${STATUS}. Ask your admin for a new command."
      exit 1
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    sleep 5
  done
  if [[ -z "$ENROLL_TOKEN" ]]; then
    echo "Timed out waiting for browser authentication."
    exit 1
  fi
fi

echo "Enrolling device..."
"$BINARY" enroll --token "$ENROLL_TOKEN" --url "$CONTROL_PLANE_URL" --setup

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
