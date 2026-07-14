#!/usr/bin/env bash
# Package a usejunction binary into a macOS .app bundle with icon.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <binary-path> <output-app-path> [version]" >&2
  exit 1
fi

BINARY="$1"
APP_PATH="$2"
VERSION="${3:-0.1.0}"

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

sed \
  -e "s/<string>0.1.0<\\/string>/<string>${VERSION}<\\/string>/g" \
  "${MACOS_DIR}/Info.plist" > "${APP_PATH}/Contents/Info.plist"

echo "Packaged ${APP_NAME}.app"
