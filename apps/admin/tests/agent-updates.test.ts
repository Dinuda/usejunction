import assert from "node:assert/strict";
import { test } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { agentReleaseManifestSchema, isAgentCompatibleForWorkExtraction, normalizeAgentVersion, WORK_EXTRACTION_MIN_AGENT_VERSION } from "../lib/agent-updates/contracts";
import { requireAgentReleaseOps } from "../lib/agent-updates/ops-auth";
import {
  artifactKey,
  calculateCoverageMetrics,
  nextUpdateState,
  rolloutEligibility,
} from "../lib/agent-updates/service";

test("work extraction compatibility gates on minimum agent version", () => {
  assert.equal(WORK_EXTRACTION_MIN_AGENT_VERSION, "0.3.1");
  assert.equal(isAgentCompatibleForWorkExtraction("0.3.1"), true);
  assert.equal(isAgentCompatibleForWorkExtraction("0.3.0"), false);
  assert.equal(isAgentCompatibleForWorkExtraction("0.2.0"), false);
  assert.equal(isAgentCompatibleForWorkExtraction("0.4.0"), true);
});

test("normalizeAgentVersion coerces invalid versions so OTA can still target the device", () => {
  assert.equal(normalizeAgentVersion("0.3.1"), "0.3.1");
  assert.equal(normalizeAgentVersion("v0.3.1"), "0.3.1");
  assert.equal(normalizeAgentVersion("e2e"), "0.0.0");
  assert.equal(normalizeAgentVersion("dev"), "0.0.0");
  assert.equal(normalizeAgentVersion(""), "0.0.0");
  assert.equal(normalizeAgentVersion(undefined, "0.1.0"), "0.1.0");
});

test("release manifests reject malformed versions, checksums, and oversized artifacts", () => {
  const base = {
    schemaVersion: 1,
    version: "0.2.0",
    publishedAt: "2026-07-16T12:00:00.000Z",
    urgency: "normal",
    rolloutHours: 24,
    signingKeyId: "test",
    signature: "a".repeat(86),
    artifacts: {
      "darwin-arm64": { url: "https://example.com/agent", sha256: "a".repeat(64), size: 1024 },
      "darwin-amd64": { url: "https://example.com/agent", sha256: "a".repeat(64), size: 1024 },
      "linux-arm64": { url: "https://example.com/agent", sha256: "a".repeat(64), size: 1024 },
      "linux-amd64": { url: "https://example.com/agent", sha256: "a".repeat(64), size: 1024 },
    },
  } as const;
  assert.equal(agentReleaseManifestSchema.safeParse(base).success, true);
  const v2 = {
    ...base,
    schemaVersion: 2,
    artifacts: {
      ...base.artifacts,
      "windows-amd64": { url: "https://example.com/agent.exe", sha256: "b".repeat(64), size: 1024 },
      "windows-arm64": { url: "https://example.com/agent.exe", sha256: "c".repeat(64), size: 1024 },
    },
  } as const;
  assert.equal(agentReleaseManifestSchema.safeParse(v2).success, true);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...v2, artifacts: base.artifacts }).success, false);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...base, version: "0.2" }).success, false);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...base, version: "00.2.0" }).success, false);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...base, version: "0.2.0-beta.01" }).success, false);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...base, artifacts: { "darwin-arm64": base.artifacts["darwin-arm64"] } }).success, false);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...base, version: "0.2.0-" }).success, false);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...base, artifacts: { "darwin-arm64": { ...base.artifacts["darwin-arm64"], sha256: "bad" } } }).success, false);
  assert.equal(agentReleaseManifestSchema.safeParse({ ...base, artifacts: { "darwin-arm64": { ...base.artifacts["darwin-arm64"], size: 100 * 1024 * 1024 + 1 } } }).success, false);
});

test("normal eligibility is deterministic and critical eligibility is immediate", () => {
  const started = new Date("2026-07-16T00:00:00.000Z");
  const first = rolloutEligibility("device-1", "0.2.0", started, 24);
  const second = rolloutEligibility("device-1", "0.2.0", started, 24);
  assert.equal(first.toISOString(), second.toISOString());
  assert.ok(first >= started);
  assert.ok(first <= new Date(started.getTime() + 24 * 60 * 60_000));
  assert.equal(rolloutEligibility("device-1", "0.2.0", started, 0).toISOString(), started.toISOString());
});

test("artifact keys normalize supported agent platforms", () => {
  assert.equal(artifactKey("macos", "arm64"), "darwin-arm64");
  assert.equal(artifactKey("linux", "x86_64"), "linux-amd64");
  assert.equal(artifactKey("windows", "ARM64"), "windows-arm64");
});

test("out-of-order lifecycle events never regress a deployment", () => {
  assert.equal(nextUpdateState("installing", "download_completed"), "installing");
  assert.equal(nextUpdateState("failed", "download_completed"), "failed");
  assert.equal(nextUpdateState("failed", "download_started"), "downloading");
  assert.equal(nextUpdateState("confirmed", "install_failed"), "confirmed");
  assert.equal(nextUpdateState("confirmed", "rollback_confirmed"), "rolled_back");
});

test("coverage uses the fixed cohort denominator and confirmed restarts", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const before = new Date("2026-07-16T11:55:00.000Z");
  const after = new Date("2026-07-16T13:00:00.000Z");
  const metrics = calculateCoverageMetrics([
    { eligibleAt: before, directiveDeliveredAt: before, downloadedAt: before, installStartedAt: before, state: "confirmed" },
    { eligibleAt: before, directiveDeliveredAt: before, downloadedAt: before, installStartedAt: before, state: "failed" },
    { eligibleAt: before, directiveDeliveredAt: null, downloadedAt: null, installStartedAt: null, state: "pending" },
    { eligibleAt: after, directiveDeliveredAt: null, downloadedAt: null, installStartedAt: null, state: "pending" },
  ], now);
  assert.deepEqual(metrics, {
    total: 4,
    eligible: 3,
    offered: 2,
    downloaded: 2,
    attempted: 2,
    confirmed: 1,
    failed: 1,
    rolledBack: 0,
    pending: 2,
    pullCoveragePercent: 50,
    installCoveragePercent: 25,
    downloadToInstallPercent: 50,
    failureRatePercent: 50,
  });
});

test("sign-agent-release-manifest re-signs after urgency mutation", async () => {
  const { generateKeyPairSync, verify } = await import("node:crypto");
  const { mkdtemp, readFile, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const seed = Buffer.from(jwk.d!, "base64url");
  const dir = await mkdtemp(join(tmpdir(), "uj-sign-"));
  const manifestPath = join(dir, "manifest.json");
  const artifacts = Object.fromEntries(
    ["darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64", "windows-amd64", "windows-arm64"].map((key) => [
      key,
      { url: `https://example.com/${key}`, sha256: "a".repeat(64), size: 1024 },
    ]),
  );
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 2,
      version: "0.3.1",
      publishedAt: "2026-07-19T00:00:00.000Z",
      urgency: "normal",
      rolloutHours: 24,
      artifacts,
    }),
  );

  const script = join(process.cwd(), "../../scripts/sign-agent-release-manifest.js");
  const first = spawnSync("node", [script, manifestPath], {
    env: {
      ...process.env,
      AGENT_UPDATE_SIGNING_KEY_ID: "ci-test",
      AGENT_UPDATE_SIGNING_PRIVATE_KEY: seed.toString("hex"),
    },
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr);
  const signedNormal = JSON.parse(await readFile(manifestPath, "utf8")) as {
    urgency: string;
    rolloutHours: number;
    signature: string;
    signingKeyId: string;
  };
  assert.equal(signedNormal.urgency, "normal");
  assert.ok(signedNormal.signature);

  const second = spawnSync("node", [script, manifestPath, "critical"], {
    env: {
      ...process.env,
      AGENT_UPDATE_SIGNING_KEY_ID: "ci-test",
      AGENT_UPDATE_SIGNING_PRIVATE_KEY: seed.toString("hex"),
    },
    encoding: "utf8",
  });
  assert.equal(second.status, 0, second.stderr);
  const signedCritical = JSON.parse(await readFile(manifestPath, "utf8")) as {
    urgency: string;
    rolloutHours: number;
    signature: string;
    artifacts: Record<string, { url: string; sha256: string; size: number }>;
    schemaVersion: number;
    version: string;
    publishedAt: string;
    signingKeyId: string;
  };
  assert.equal(signedCritical.urgency, "critical");
  assert.equal(signedCritical.rolloutHours, 0);
  assert.notEqual(signedCritical.signature, signedNormal.signature);

  const sortedArtifacts: Record<string, { url: string; sha256: string; size: number }> = {};
  for (const key of Object.keys(signedCritical.artifacts).sort()) {
    const artifact = signedCritical.artifacts[key]!;
    sortedArtifacts[key] = { url: artifact.url, sha256: artifact.sha256, size: artifact.size };
  }
  const payload = Buffer.from(
    JSON.stringify({
      schemaVersion: signedCritical.schemaVersion,
      version: signedCritical.version,
      publishedAt: signedCritical.publishedAt,
      urgency: signedCritical.urgency,
      rolloutHours: signedCritical.rolloutHours,
      artifacts: sortedArtifacts,
      signingKeyId: signedCritical.signingKeyId,
    }),
  );
  assert.equal(
    verify(null, payload, publicKey, Buffer.from(signedCritical.signature, "base64url")),
    true,
  );

  const missingSecrets = spawnSync("node", [script, manifestPath], {
    env: { ...process.env, AGENT_UPDATE_SIGNING_KEY_ID: "", AGENT_UPDATE_SIGNING_PRIVATE_KEY: "" },
    encoding: "utf8",
  });
  assert.notEqual(missingSecrets.status, 0);
});

test("platform release operations require the dedicated bearer token", () => {
  const previous = process.env.AGENT_RELEASE_OPERATIONS_TOKEN;
  process.env.AGENT_RELEASE_OPERATIONS_TOKEN = "release-operations-secret";
  try {
    const missing = requireAgentReleaseOps(new NextRequest("https://example.com/api/internal/agent-releases/1/coverage"));
    assert.ok(missing instanceof NextResponse);
    assert.equal(missing.status, 401);
    const wrong = requireAgentReleaseOps(new NextRequest("https://example.com/api/internal/agent-releases/1/coverage", {
      headers: { authorization: "Bearer wrong" },
    }));
    assert.ok(wrong instanceof NextResponse);
    assert.equal(wrong.status, 401);
    assert.equal(requireAgentReleaseOps(new NextRequest("https://example.com/api/internal/agent-releases/1/coverage", {
      headers: { authorization: "Bearer release-operations-secret" },
    })), true);
  } finally {
    if (previous === undefined) delete process.env.AGENT_RELEASE_OPERATIONS_TOKEN;
    else process.env.AGENT_RELEASE_OPERATIONS_TOKEN = previous;
  }
});
