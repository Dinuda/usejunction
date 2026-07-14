#!/usr/bin/env bash
# Cross-compile agent binaries into apps/admin/public for control-plane installs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${USEJUNCTION_AGENT_VERSION:-0.1.0}"
OUT="${ROOT}/apps/admin/public/releases/download/v${VERSION}"
AGENT_DIR="${ROOT}/agent"

mkdir -p "$OUT"
rm -f "${OUT}"/usejunction-* "${OUT}/checksums.txt"

targets=(
  "darwin/amd64"
  "darwin/arm64"
  "linux/amd64"
  "linux/arm64"
)

echo "Building agent ${VERSION} into ${OUT}"
for target in "${targets[@]}"; do
  os="${target%/*}"
  arch="${target#*/}"
  name="usejunction-${os}-${arch}"
  echo "  ${name}"
  (cd "$AGENT_DIR" && CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -ldflags="-s -w" -o "${OUT}/${name}" .)
  if [[ "$os" == "darwin" && "$(uname -s)" == "Darwin" ]]; then
    app_zip="${name}.app.zip"
    echo "  ${app_zip}"
    bash "${ROOT}/scripts/package-macos-app.sh" "${OUT}/${name}" "${OUT}/UseJunction Agent.app" "$VERSION"
    (cd "$OUT" && ditto -c -k --sequesterRsrc --keepParent "UseJunction Agent.app" "${app_zip}")
    rm -rf "${OUT}/UseJunction Agent.app"
  fi
done

(
  cd "$OUT"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 usejunction-* | while read -r sum file; do
      printf '%s  %s\n' "$sum" "$(basename "$file")"
    done > checksums.txt
  else
    sha256sum usejunction-* | while read -r sum file; do
      printf '%s  %s\n' "$sum" "$(basename "$file")"
    done > checksums.txt
  fi
)

echo "Wrote checksums:"
cat "${OUT}/checksums.txt"
