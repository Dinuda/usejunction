#!/usr/bin/env bash
# Regenerate agent/macos/AppIcon.icns from the admin favicon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="${ROOT}/apps/admin/public/favicon.svg"
OUT="${ROOT}/agent/macos/AppIcon.icns"
ICONSET="${ROOT}/agent/macos/AppIcon.iconset"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "App icon generation requires macOS (iconutil)." >&2
  exit 1
fi

if [[ ! -f "$SVG" ]]; then
  echo "Missing favicon: $SVG" >&2
  exit 1
fi

MAGICK=""
if command -v magick >/dev/null 2>&1; then
  MAGICK="magick"
elif command -v convert >/dev/null 2>&1; then
  MAGICK="convert"
else
  echo "ImageMagick (magick or convert) is required." >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

for size in 16 32 64 128 256 512; do
  "$MAGICK" -background none -density 300 "$SVG" -resize "${size}x${size}" \
    "${ICONSET}/icon_${size}x${size}.png"
  double=$((size * 2))
  "$MAGICK" -background none -density 300 "$SVG" -resize "${double}x${double}" \
    "${ICONSET}/icon_${size}x${size}@2x.png"
done

iconutil -c icns "$ICONSET" -o "$OUT"
rm -rf "$ICONSET"
echo "Wrote ${OUT}"
