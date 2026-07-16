#!/usr/bin/env bash
set -euo pipefail

ENROLL_TOKEN=""
CONNECT_TOKEN=""
CONTROL_PLANE_URL="${USEJUNCTION_URL:-http://localhost:3001}"
INSTALL_DIR="${HOME}/.usejunction/bin"
APP_NAME="UseJunction Agent"
APP_DIR="${HOME}/.usejunction/${APP_NAME}.app"
VERSION="0.1.0"
UPGRADE_ONLY=false

usage() {
  echo "Usage: curl -fsSL <control-plane>/install.sh | sh -s -- [(--token <token> | --connect <token>) | --upgrade] [--url <control-plane>]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token|--enroll-token) ENROLL_TOKEN="$2"; shift 2 ;;
    --connect) CONNECT_TOKEN="$2"; shift 2 ;;
    --url) CONTROL_PLANE_URL="$2"; shift 2 ;;
    --upgrade) UPGRADE_ONLY=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

CONTROL_PLANE_URL="${CONTROL_PLANE_URL%/}"

if [[ -z "$ENROLL_TOKEN" && -z "$CONNECT_TOKEN" && "$UPGRADE_ONLY" != true ]]; then
  usage
fi

if [[ "$UPGRADE_ONLY" == true && ! -f "${HOME}/.usejunction/config.json" ]]; then
  echo "No existing UseJunction enrollment found at ~/.usejunction/config.json" >&2
  exit 1
fi

LATEST_JSON="$(curl -fsSL "${CONTROL_PLANE_URL}/api/agent-releases/latest" 2>/dev/null || true)"
LATEST_VERSION="$(printf '%s' "$LATEST_JSON" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [[ "$LATEST_VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$ ]]; then
  VERSION="$LATEST_VERSION"
elif [[ "$UPGRADE_ONLY" == true ]]; then
  echo "No active agent release is available from ${CONTROL_PLANE_URL}." >&2
  exit 1
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
  local staged_app="${APP_DIR}.new"
  rm -rf "$staged_app"
  if package_script="$(find_package_script)"; then
    bash "$package_script" "$binary" "$staged_app" "$VERSION"
    swap_macos_app "$staged_app"
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

  mkdir -p "${staged_app}/Contents/MacOS" "${staged_app}/Contents/Resources"
  cp "$binary" "${staged_app}/Contents/MacOS/usejunction"
  chmod +x "${staged_app}/Contents/MacOS/usejunction"
  cp "${macos_assets}/AppIcon.icns" "${staged_app}/Contents/Resources/AppIcon.icns"
  sed \
    -e "s/<string>0.1.0<\\/string>/<string>${VERSION}<\\/string>/g" \
    "${macos_assets}/Info.plist" > "${staged_app}/Contents/Info.plist"
  swap_macos_app "$staged_app"
}

swap_macos_app() {
  local staged_app="$1"
  local previous_app="${APP_DIR}.previous"
  rm -rf "$previous_app"
  if [[ -d "$APP_DIR" ]]; then
    mv "$APP_DIR" "$previous_app"
  fi
  if ! mv "$staged_app" "$APP_DIR"; then
    [[ -d "$previous_app" ]] && mv "$previous_app" "$APP_DIR"
    return 1
  fi
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
    local extracted="${tmp_dir}/extracted"
    local staged_app="${APP_DIR}.new"
    rm -rf "$extracted" "$staged_app"
    mkdir -p "$extracted"
    ditto -x -k "$app_path" "$extracted"
    [[ -x "${extracted}/${APP_NAME}.app/Contents/MacOS/usejunction" ]] || { echo "App bundle missing executable"; return 1; }
    ditto "${extracted}/${APP_NAME}.app" "$staged_app"
    swap_macos_app "$staged_app"
    link_macos_cli
    return 0
  fi
  return 1
}

install_agent() {
  local agent_src=""
  if [[ "$OS" == "darwin" ]]; then
    if [[ "$UPGRADE_ONLY" != true || "${USEJUNCTION_BUILD_FROM_SOURCE:-}" == "1" ]] && agent_src="$(find_agent_src)" && command -v go >/dev/null 2>&1; then
      echo "Building agent from source (${agent_src})..."
      local tmp_binary
      tmp_binary="$(mktemp)"
      (cd "$agent_src" && go build -ldflags "-X github.com/usejunction/agent/internal/config.Version=${VERSION}" -o "$tmp_binary" .)
      install_macos_app_bundle "$tmp_binary"
      rm -f "$tmp_binary"
      link_macos_cli
      return 0
    fi

    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT

    local control_base="${CONTROL_PLANE_URL}/releases/download/v${VERSION}"
    local github_base="https://github.com/usejunction/usejunction/releases/download/agent-v${VERSION}"
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
    if [[ "$UPGRADE_ONLY" != true || "${USEJUNCTION_BUILD_FROM_SOURCE:-}" == "1" ]] && agent_src="$(find_agent_src)" && command -v go >/dev/null 2>&1; then
      echo "Building agent from source (${agent_src})..."
      local tmp_binary
      tmp_binary="$(mktemp "${INSTALL_DIR}/.usejunction-build.XXXXXX")"
      (cd "$agent_src" && go build -ldflags "-X github.com/usejunction/agent/internal/config.Version=${VERSION}" -o "$tmp_binary" .)
      atomic_install_binary "$tmp_binary" "$BINARY"
      return 0
    fi

    local tmp_dir
    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT

    local control_base="${CONTROL_PLANE_URL}/releases/download/v${VERSION}"
    local github_base="https://github.com/usejunction/usejunction/releases/download/agent-v${VERSION}"
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
        atomic_install_binary "$binary_path" "$BINARY"
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

atomic_install_binary() {
  local source="$1"
  local destination="$2"
  local staged="${destination}.new"
  local previous="${destination}.previous"
  cp "$source" "$staged"
  chmod +x "$staged"
  rm -f "$previous"
  if [[ -e "$destination" ]]; then
    mv "$destination" "$previous"
  fi
  if ! mv "$staged" "$destination"; then
    [[ -e "$previous" ]] && mv "$previous" "$destination"
    return 1
  fi
}

semver_compare() {
  local left="$1" right="$2"
  local left_core="${left%%-*}" right_core="${right%%-*}"
  local left_pre="" right_pre=""
  [[ "$left" == *-* ]] && left_pre="${left#*-}"
  [[ "$right" == *-* ]] && right_pre="${right#*-}"
  local left_major left_minor left_patch right_major right_minor right_patch
  IFS=. read -r left_major left_minor left_patch <<< "$left_core"
  IFS=. read -r right_major right_minor right_patch <<< "$right_core"
  local left_number right_number
  for left_number in "$left_major" "$left_minor" "$left_patch"; do
    case "$left_number" in *[!0-9]*|'') return 2 ;; esac
  done
  for right_number in "$right_major" "$right_minor" "$right_patch"; do
    case "$right_number" in *[!0-9]*|'') return 2 ;; esac
  done
  local pair
  for pair in "${left_major}:${right_major}" "${left_minor}:${right_minor}" "${left_patch}:${right_patch}"; do
    left_number="${pair%%:*}"
    right_number="${pair#*:}"
    if ((10#$left_number > 10#$right_number)); then echo 1; return 0; fi
    if ((10#$left_number < 10#$right_number)); then echo -1; return 0; fi
  done
  if [[ -z "$left_pre" || -z "$right_pre" ]]; then
    if [[ -z "$left_pre" && -z "$right_pre" ]]; then echo 0
    elif [[ -z "$left_pre" ]]; then echo 1
    else echo -1
    fi
    return 0
  fi
  local left_parts right_parts
  IFS=. read -ra left_parts <<< "$left_pre"
  IFS=. read -ra right_parts <<< "$right_pre"
  local index=0 max_parts="${#left_parts[@]}"
  (( ${#right_parts[@]} > max_parts )) && max_parts="${#right_parts[@]}"
  while ((index < max_parts)); do
    if ((index >= ${#left_parts[@]})); then echo -1; return 0; fi
    if ((index >= ${#right_parts[@]})); then echo 1; return 0; fi
    local left_part="${left_parts[$index]}" right_part="${right_parts[$index]}"
    if [[ "$left_part" != "$right_part" ]]; then
      if [[ "$left_part" =~ ^[0-9]+$ && "$right_part" =~ ^[0-9]+$ ]]; then
        if ((10#$left_part > 10#$right_part)); then echo 1; else echo -1; fi
      elif [[ "$left_part" =~ ^[0-9]+$ ]]; then echo -1
      elif [[ "$right_part" =~ ^[0-9]+$ ]]; then echo 1
      elif [[ "$left_part" > "$right_part" ]]; then echo 1
      else echo -1
      fi
      return 0
    fi
    index=$((index + 1))
  done
  echo 0
}

if [[ "$UPGRADE_ONLY" == true && -x "$BINARY" ]]; then
  CURRENT_JSON="$("$BINARY" status --format json 2>/dev/null || true)"
  CURRENT_VERSION="$(printf '%s' "$CURRENT_JSON" | sed -n 's/.*"agentVersion"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  if [[ -z "$CURRENT_VERSION" ]]; then
    echo "Could not determine the installed agent version; refusing an unverified upgrade." >&2
    exit 1
  fi
  VERSION_ORDER="$(semver_compare "$VERSION" "$CURRENT_VERSION")" || {
    echo "Could not compare installed version ${CURRENT_VERSION} with release ${VERSION}." >&2
    exit 1
  }
  if [[ "$VERSION_ORDER" == "-1" ]]; then
    echo "Refusing to downgrade UseJunction from v${CURRENT_VERSION} to v${VERSION}." >&2
    exit 1
  fi
  if [[ "$VERSION_ORDER" == "0" ]]; then
    echo "UseJunction agent v${CURRENT_VERSION} is already installed."
    exit 0
  fi
fi

install_agent
if [[ "$OS" == "darwin" ]]; then
  BINARY="${APP_DIR}/Contents/MacOS/usejunction"
else
  chmod +x "$BINARY"
fi
export PATH="$INSTALL_DIR:$PATH"

if [[ "$UPGRADE_ONLY" == true ]]; then
  echo "Restarting existing background agent…"
  if [[ "$OS" == "darwin" ]]; then
    launchctl kickstart -k "gui/$(id -u)/com.usejunction.agent" 2>/dev/null || {
      PLIST="${HOME}/Library/LaunchAgents/com.usejunction.agent.plist"
      launchctl unload "$PLIST" 2>/dev/null || true
      launchctl load "$PLIST"
    }
  elif [[ "$OS" == "linux" ]] && command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload
    systemctl --user restart usejunction-agent.service
  fi
  "$BINARY" status
  echo "UseJunction agent upgraded to v${VERSION}."
  exit 0
fi

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
echo "Rollback an update: usejunction update --rollback"
