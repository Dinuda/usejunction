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
  verdictHint,
  verdictLabel,
} from "../lib/quotas/plan-utilization-policy";
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

test("mapQuotaSnapshots accepts ISO string dates from serialized snapshots", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const [row] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 50,
        creditsRemaining: null,
        resetAt: "2026-08-01T00:00:00.000Z",
        source: "cli_rpc",
        updatedAt: "2026-07-14T12:00:00.000Z",
        developerId: "dev-1",
      },
    ],
    now,
  );
  assert.equal(row.resetsAt, "2026-08-01T00:00:00.000Z");
  assert.equal(row.observedAt, "2026-07-14T12:00:00.000Z");
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

test("selectPrimaryQuota ignores promo grants and rate-limit resets when plan windows exist", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const rows = mapQuotaSnapshots(
    [
      {
        toolName: "codex",
        windowType: "rate_limit_resets",
        usedPercent: null,
        creditsRemaining: 4,
        resetAt: new Date("2026-07-25T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "codex",
        windowType: "weekly",
        usedPercent: 63,
        creditsRemaining: null,
        resetAt: new Date("2026-07-23T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "cursor",
        windowType: "promo_grant",
        usedPercent: null,
        creditsRemaining: 15,
        resetAt: null,
        source: "local_app",
        updatedAt: now,
      },
    ],
    now,
  );
  const primary = selectPrimaryQuota(rows);
  assert.equal(primary?.windowType, "weekly");
  assert.equal(primary?.rawRatio, 0.63);
});

test("dedupeQuotaUtilizations keeps the freshest reading instead of an older high ratio", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const rows = mapQuotaSnapshots(
    [
      {
        toolName: "claude",
        windowType: "monthly",
        usedPercent: 55,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
        developerId: "dev-1",
      },
      {
        toolName: "claude",
        windowType: "monthly",
        usedPercent: 20,
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
  assert.equal(deduped[0]?.rawRatio, 0.2);
});

test("dedupeQuotaUtilizations prefers the current reset window", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const rows = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 95,
        creditsRemaining: null,
        resetAt: new Date("2026-07-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: new Date("2026-07-14T12:01:00.000Z"),
      },
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 5,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );

  const deduped = dedupeQuotaUtilizations(rows);
  assert.equal(deduped[0]?.rawRatio, 0.05);
  assert.equal(deduped[0]?.resetsAt, "2026-08-01T00:00:00.000Z");
});

test("selectPrimaryQuota prefers aggregate plan and Copilot premium windows", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const cursorRows = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "api",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 20,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  const copilotRows = mapQuotaSnapshots(
    [
      {
        toolName: "copilot",
        windowType: "copilot_completions",
        usedPercent: 0,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "github_api",
        updatedAt: now,
      },
      {
        toolName: "copilot",
        windowType: "copilot_premium_interactions",
        usedPercent: 15,
        creditsRemaining: 255,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "github_api",
        updatedAt: now,
      },
    ],
    now,
  );

  assert.equal(selectPrimaryQuota(cursorRows)?.windowType, "plan");
  assert.equal(selectPrimaryQuota(copilotRows)?.windowType, "copilot_premium_interactions");
});

test("selectPrimaryQuota never promotes fresh bonus inventory over a stale plan window", () => {
  const now = new Date("2026-07-14T12:00:00.000Z");
  const rows = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 40,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: new Date("2026-07-12T00:00:00.000Z"),
      },
      {
        toolName: "cursor",
        windowType: "bonus",
        usedPercent: null,
        creditsRemaining: 20,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );

  assert.equal(selectPrimaryQuota(rows)?.windowType, "plan");
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

test("verdictLabel and verdictHint describe within-allowance vs near-limit states", () => {
  assert.equal(verdictLabel("LIGHT_USE"), "Within allowance");
  assert.equal(verdictLabel("HEALTHY"), "On track");
  assert.equal(verdictLabel("NEAR_LIMIT"), "Near limit");
  assert.equal(verdictLabel("LIMIT_EXCEEDED"), "Over quota");
  assert.match(verdictHint("NEAR_LIMIT") ?? "", /plan cap before renewal/i);
  assert.equal(
    verdictHint("NEAR_LIMIT", { expectedEndDateLabel: "Aug 3" }),
    "Likely to hit the plan cap by Aug 3",
  );
  assert.match(verdictHint("LIGHT_USE") ?? "", /within the included plan allowance/i);
});

test("resolveReportWindow uses range and rejects non-UTC", () => {
  const window = resolveReportWindow({ range: 7, now: new Date("2026-07-14T12:00:00.000Z") });
  assert.equal(window.timezone, "UTC");
  assert.equal(window.grain, "day");
  assert.throws(() => resolveReportWindow({ range: 30, timezone: "Asia/Colombo" }));
});
