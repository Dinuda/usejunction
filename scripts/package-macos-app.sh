#!/usr/bin/env bash
# Package a usejunction binary into a macOS .app bundle with icon.
# Optional menu-bar companion: 4th arg or USEJUNCTION_MENU_BINARY → Contents/MacOS/UseJunctionMenu.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <binary-path> <output-app-path> [version] [menu-binary-path]" >&2
  echo "  menu binary may also be set via USEJUNCTION_MENU_BINARY" >&2
  exit 1
fi

BINARY="$1"
APP_PATH="$2"
VERSION="${3:-0.1.0}"
MENU_BINARY="${4:-${USEJUNCTION_MENU_BINARY:-}}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MACOS_DIR="${ROOT}/agent/macos"
APP_NAME="$(basename "$APP_PATH" .app)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS app packaging requires Darwin." >&2
  exit 1
fi

if [[ ! -f "$BINARY" ]]; then
  echo "Binary not found: $BINARY" >&2
  exit 1
fi

if [[ ! -f "${MACOS_DIR}/AppIcon.icns" || ! -f "${MACOS_DIR}/Info.plist" ]]; then
  echo "Missing bundle assets in ${MACOS_DIR}" >&2
  exit 1
fi

rm -rf "$APP_PATH"
mkdir -p "${APP_PATH}/Contents/MacOS" "${APP_PATH}/Contents/Resources"

cp "$BINARY" "${APP_PATH}/Contents/MacOS/usejunction"
chmod +x "${APP_PATH}/Contents/MacOS/usejunction"
cp "${MACOS_DIR}/AppIcon.icns" "${APP_PATH}/Contents/Resources/AppIcon.icns"

if [[ -n "$MENU_BINARY" ]]; then
  if [[ ! -f "$MENU_BINARY" ]]; then
    echo "Menu binary not found: $MENU_BINARY" >&2
    exit 1
  fi
  cp "$MENU_BINARY" "${APP_PATH}/Contents/MacOS/UseJunctionMenu"
  chmod +x "${APP_PATH}/Contents/MacOS/UseJunctionMenu"
fi

sed \
  -e "s/<string>0.1.0<\\/string>/<string>${VERSION}<\\/string>/g" \
  "${MACOS_DIR}/Info.plist" > "${APP_PATH}/Contents/Info.plist"

echo "Packaged ${APP_NAME}.app"
