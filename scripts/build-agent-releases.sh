#!/usr/bin/env bash
# Cross-compile agent binaries into apps/admin/public for control-plane installs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-${USEJUNCTION_AGENT_VERSION:-}}"
URGENCY="${2:-normal}"
if [[ ! "$VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$ ]]; then
  echo "Usage: $0 <semver> [normal|critical]" >&2
  exit 1
fi
if [[ "$VERSION" == *-* ]]; then
  IFS=. read -ra prerelease_parts <<< "${VERSION#*-}"
  for part in "${prerelease_parts[@]}"; do
    if [[ "$part" =~ ^[0-9]+$ && "$part" != "0" && "$part" == 0* ]]; then
      echo "Invalid semantic version: numeric prerelease identifiers cannot have leading zeroes" >&2
      exit 1
    fi
  done
fi
if [[ "$URGENCY" != "normal" && "$URGENCY" != "critical" ]]; then
  echo "Urgency must be normal or critical" >&2
  exit 1
fi
OUT="${ROOT}/apps/admin/public/releases/download/v${VERSION}"
AGENT_DIR="${ROOT}/agent"
LDFLAGS="-s -w -X github.com/usejunction/agent/internal/config.Version=${VERSION}"
if [[ -n "${AGENT_UPDATE_TRUSTED_KEYS:-}" ]]; then
  LDFLAGS="${LDFLAGS} -X github.com/usejunction/agent/internal/updater.TrustedUpdateSigningKeys=${AGENT_UPDATE_TRUSTED_KEYS}"
fi

mkdir -p "$OUT"
rm -f "${OUT}"/usejunction-* "${OUT}/checksums.txt"

targets=(
  "darwin/amd64"
  "darwin/arm64"
  "linux/amd64"
  "linux/arm64"
  "windows/amd64"
  "windows/arm64"
)

echo "Building agent ${VERSION} into ${OUT}"
for target in "${targets[@]}"; do
  os="${target%/*}"
  arch="${target#*/}"
  suffix=""
  [[ "$os" == "windows" ]] && suffix=".exe"
  name="usejunction-${os}-${arch}${suffix}"
  echo "  ${name}"
  (cd "$AGENT_DIR" && CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build -ldflags="$LDFLAGS" -o "${OUT}/${name}" .)
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

(
  cd "$OUT"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c checksums.txt
  else
    sha256sum -c checksums.txt
  fi
)

node - "$OUT" "$VERSION" "$URGENCY" <<'NODE'
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const [out, version, urgency] = process.argv.slice(2);
const checksums = new Map(
  fs.readFileSync(path.join(out, "checksums.txt"), "utf8")
    .trim().split(/\n+/).map((line) => {
      const [sha256, name] = line.trim().split(/\s+/, 2);
      return [name, sha256];
    }),
);
const artifacts = {};
for (const key of ["darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64", "windows-amd64", "windows-arm64"]) {
  const name = `usejunction-${key}${key.startsWith("windows-") ? ".exe" : ""}`;
  const file = path.join(out, name);
  if (!checksums.has(name) || !fs.existsSync(file)) throw new Error(`missing ${name}`);
  artifacts[key] = {
    url: `https://github.com/usejunction/usejunction/releases/download/agent-v${version}/${name}`,
    sha256: checksums.get(name),
    size: fs.statSync(file).size,
  };
}
const manifest = {
  schemaVersion: 2,
  version,
  publishedAt: new Date().toISOString(),
  urgency,
  rolloutHours: urgency === "critical" ? 0 : 24,
  artifacts,
};
const signingKeyId = process.env.AGENT_UPDATE_SIGNING_KEY_ID;
const signingPrivateKey = process.env.AGENT_UPDATE_SIGNING_PRIVATE_KEY;
if (signingKeyId && signingPrivateKey) {
  const normalized = signingPrivateKey.trim();
  const seed = /^[a-f0-9]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (seed.length !== 32) throw new Error("AGENT_UPDATE_SIGNING_PRIVATE_KEY must be a 32-byte Ed25519 private seed");
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([pkcs8Prefix, seed]), format: "der", type: "pkcs8" });
  manifest.signingKeyId = signingKeyId;
  const payload = Buffer.from(JSON.stringify(manifest));
  manifest.signature = crypto.sign(null, payload, privateKey).toString("base64url");
}
fs.writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
NODE

echo "Wrote release manifest: ${OUT}/manifest.json"
