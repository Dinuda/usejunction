import assert from "node:assert/strict";
import { test } from "vitest";
import {
  dedupeQuotaUtilizations,
  evaluatePlanUtilization,
  includedAllowanceUtilization,
  mapQuotaSnapshots,
  primaryUtilizationRatio,
  selectPrimaryQuota,
  STALE_QUOTA_MS,
} from "../lib/billing/plan-utilization-policy";
import { resolveReportWindow } from "../lib/analytics/contracts/time-window";

test("mapQuotaSnapshots keeps null absolutes and converts percent to ratio", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const [row] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 82,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
        developerId: "dev-1",
      },
    ],
    now,
  );
  assert.equal(row.rawRatio, 0.82);
  assert.equal(row.displayRatio, 0.82);
  assert.equal(row.limit, null);
  assert.equal(row.consumed, null);
  assert.equal(row.source, "provider");
  assert.equal(row.stale, false);
});

test("mapQuotaSnapshots treats Codex OAuth quota readings as provider data", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const [row] = mapQuotaSnapshots(
    [
      {
        toolName: "codex",
        windowType: "session_5h",
        usedPercent: 42,
        creditsRemaining: null,
        resetAt: new Date("2026-07-14T17:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
        developerId: "dev-1",
      },
    ],
    now,
  );
  assert.equal(row.toolKey, "chatgpt-codex");
  assert.equal(row.source, "provider");
  assert.equal(row.resetsAt, "2026-07-14T17:00:00.000Z");
});

test("selectPrimaryQuota prefers monthly over weekly", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const rows = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "weekly",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 40,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  const primary = selectPrimaryQuota(rows);
  assert.equal(primary?.windowType, "monthly");
  assert.equal(primary?.rawRatio, 0.4);
});

test("dedupeQuotaUtilizations keeps highest ratio", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const rows = mapQuotaSnapshots(
    [
      {
        toolName: "claude",
        windowType: "monthly",
        usedPercent: 20,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
        developerId: "dev-1",
      },
      {
        toolName: "claude",
        windowType: "monthly",
        usedPercent: 55,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: new Date(now.getTime() + 1000),
        developerId: "dev-1",
      },
    ],
    now,
  );
  const deduped = dedupeQuotaUtilizations(rows);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.rawRatio, 0.55);
});

test("included allowance caps display ratio but preserves raw over 100%", () => {
  const included = includedAllowanceUtilization({
    includedCycleMicros: BigInt(10_000_000),
    grossUsageMicros: BigInt(12_700_000),
  });
  assert.ok(included.rawRatio != null && included.rawRatio > 1);
  assert.equal(included.displayRatio, 1);
});

test("primaryUtilizationRatio prefers quota over included", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 30,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  const included = includedAllowanceUtilization({
    includedCycleMicros: BigInt(10_000_000),
    grossUsageMicros: BigInt(8_000_000),
  });
  assert.equal(primaryUtilizationRatio({ primaryQuota: quota, included }), 0.3);
});

test("evaluatePlanUtilization thresholds and stale", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const fresh = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  )[0];
  assert.equal(evaluatePlanUtilization({ primaryQuota: fresh, included: null }).code, "NEAR_LIMIT");

  const exceeded = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 110,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  )[0];
  assert.equal(evaluatePlanUtilization({ primaryQuota: exceeded, included: null }).code, "LIMIT_EXCEEDED");

  const light = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 10,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  )[0];
  assert.equal(evaluatePlanUtilization({ primaryQuota: light, included: null }).code, "LIGHT_USE");

  const stale = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 50,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: new Date(now.getTime() - STALE_QUOTA_MS - 1),
      },
    ],
    now,
  )[0];
  assert.equal(evaluatePlanUtilization({ primaryQuota: stale, included: null }).code, "DATA_STALE");

  assert.equal(evaluatePlanUtilization({ primaryQuota: null, included: null }).code, "UNKNOWN");
});

test("resolveReportWindow uses range and rejects non-UTC", () => {
  const window = resolveReportWindow({ range: 7, now: new Date("2026-07-14T12:00:00.000Z") });
  assert.equal(window.timezone, "UTC");
  assert.equal(window.grain, "day");
  assert.throws(() => resolveReportWindow({ range: 30, timezone: "Asia/Colombo" }));
});
