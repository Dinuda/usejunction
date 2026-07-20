#!/usr/bin/env node
/**
 * Sign (or re-sign) an agent release manifest so the payload matches the Go
 * verifier in agent/internal/updater (signedManifestPayload + encoding/json).
 *
 * Usage:
 *   node scripts/sign-agent-release-manifest.js <manifest.json> [urgency]
 *
 * Requires:
 *   AGENT_UPDATE_SIGNING_KEY_ID
 *   AGENT_UPDATE_SIGNING_PRIVATE_KEY  (32-byte Ed25519 seed as hex or base64/base64url)
 */
const fs = require("fs");
const crypto = require("crypto");

function usage() {
  console.error("Usage: node scripts/sign-agent-release-manifest.js <manifest.json> [urgency]");
  process.exit(1);
}

function loadPrivateKey(raw) {
  const normalized = String(raw).trim();
  const seed = /^[a-f0-9]{64}$/i.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (seed.length !== 32) {
    throw new Error("AGENT_UPDATE_SIGNING_PRIVATE_KEY must be a 32-byte Ed25519 private seed");
  }
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return crypto.createPrivateKey({ key: Buffer.concat([pkcs8Prefix, seed]), format: "der", type: "pkcs8" });
}

/** Canonical JSON matching Go encoding/json of signedManifestPayload. */
function signedPayloadBytes(manifest) {
  const artifacts = {};
  for (const key of Object.keys(manifest.artifacts).sort()) {
    const artifact = manifest.artifacts[key];
    artifacts[key] = {
      url: artifact.url,
      sha256: artifact.sha256,
      size: artifact.size,
    };
  }
  return Buffer.from(
    JSON.stringify({
      schemaVersion: manifest.schemaVersion,
      version: manifest.version,
      publishedAt: manifest.publishedAt,
      urgency: manifest.urgency,
      rolloutHours: manifest.rolloutHours,
      artifacts,
      signingKeyId: manifest.signingKeyId,
    }),
  );
}

function signManifest(manifest, signingKeyId, privateKey) {
  const next = { ...manifest };
  delete next.signature;
  next.signingKeyId = signingKeyId;
  if (typeof next.rolloutHours !== "number") {
    next.rolloutHours = next.urgency === "critical" ? 0 : 24;
  }
  const payload = signedPayloadBytes(next);
  next.signature = crypto.sign(null, payload, privateKey).toString("base64url");
  return next;
}

function main() {
  const manifestPath = process.argv[2];
  const urgency = process.argv[3];
  if (!manifestPath) usage();

  const signingKeyId = process.env.AGENT_UPDATE_SIGNING_KEY_ID;
  const signingPrivateKey = process.env.AGENT_UPDATE_SIGNING_PRIVATE_KEY;
  if (!signingKeyId || !signingPrivateKey) {
    throw new Error("AGENT_UPDATE_SIGNING_KEY_ID and AGENT_UPDATE_SIGNING_PRIVATE_KEY are required");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (urgency === "normal" || urgency === "critical") {
    manifest.urgency = urgency;
    manifest.rolloutHours = urgency === "critical" ? 0 : 24;
  }

  const privateKey = loadPrivateKey(signingPrivateKey);
  const signed = signManifest(manifest, signingKeyId, privateKey);
  fs.writeFileSync(manifestPath, `${JSON.stringify(signed, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { signedPayloadBytes, signManifest, loadPrivateKey };
