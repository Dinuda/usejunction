import assert from "node:assert/strict";
import { test } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { agentReleaseManifestSchema, isAgentCompatibleForWorkExtraction, WORK_EXTRACTION_MIN_AGENT_VERSION } from "../lib/agent-updates/contracts";
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
