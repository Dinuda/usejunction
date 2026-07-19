import assert from "node:assert/strict";
import { test } from "vitest";
import {
  inferQuotaWindowMs,
  paceVerdictLabel,
  projectMemberQuotaPaces,
  projectQuotaPace,
} from "../lib/quotas/pace";
import { mapQuotaSnapshots } from "../lib/quotas/plan-utilization-policy";

test("inferQuotaWindowMs covers common vendor windows", () => {
  assert.equal(inferQuotaWindowMs("monthly"), 30 * 24 * 60 * 60 * 1000);
  assert.equal(inferQuotaWindowMs("plan"), 30 * 24 * 60 * 60 * 1000);
  assert.equal(
    inferQuotaWindowMs("copilot_premium_interactions"),
    30 * 24 * 60 * 60 * 1000,
  );
  assert.equal(inferQuotaWindowMs("weekly"), 7 * 24 * 60 * 60 * 1000);
  assert.equal(inferQuotaWindowMs("daily"), 24 * 60 * 60 * 1000);
  assert.equal(inferQuotaWindowMs("session_5h"), 5 * 60 * 60 * 1000);
});

test("projectQuotaPace flags excess when burn empties before reset", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  // Mid-month (15/30 days), already at 90% → will burn out before Aug 1.
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
        developerId: "dev-1",
      },
    ],
    now,
  );
  const pace = projectQuotaPace(quota!, now);
  assert.equal(pace.code, "EXCESS");
  assert.ok(pace.daysToExhaust != null && pace.daysToExhaust < (pace.daysToReset ?? 999));
  assert.match(pace.summary, /above pace/i);
  assert.equal(paceVerdictLabel(pace.code), "Above pace");
});

test("projectQuotaPace marks under-pace when usage lags the window", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "claude",
        windowType: "monthly",
        usedPercent: 10,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  const pace = projectQuotaPace(quota!, now);
  assert.equal(pace.code, "UNDER");
  assert.match(pace.summary, /underutilized/i);
  assert.equal(paceVerdictLabel(pace.code), "Underutilized");
});

test("projectQuotaPace marks usage near expected utilization as on pace", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 45,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );

  const pace = projectQuotaPace(quota!, now);
  assert.equal(pace.code, "ON_TRACK");
  assert.equal(pace.expectedPercent, 50);
  assert.equal(paceVerdictLabel(pace.code), "On pace");
});

test("projectQuotaPace keeps missing, expired, and stale vendor timing unavailable", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const snapshots = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "unknown_window",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
      {
        toolName: "claude",
        windowType: "weekly",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: new Date("2026-07-18T11:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "copilot",
        windowType: "copilot_premium_interactions",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "github_api",
        updatedAt: new Date("2026-07-16T00:00:00.000Z"),
      },
    ],
    now,
  );

  for (const quota of snapshots) {
    const pace = projectQuotaPace(quota, now);
    assert.equal(pace.code, "UNKNOWN");
    assert.equal(paceVerdictLabel(pace.code), "Pace unavailable");
  }
});

test("projectQuotaPace recognizes an exceeded stale quota without timing", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "unknown_window",
        usedPercent: 105,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: new Date("2026-07-15T00:00:00.000Z"),
      },
    ],
    now,
  );

  assert.equal(projectQuotaPace(quota!, now).code, "ALREADY_EXCEEDED");
});

test("projectQuotaPace marks already exceeded", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 105,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  assert.equal(projectQuotaPace(quota!, now).code, "ALREADY_EXCEEDED");
});

test("projectMemberQuotaPaces returns one primary row per tool, excess first", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const paces = projectMemberQuotaPaces(
    [
      {
        toolName: "claude",
        windowType: "monthly",
        usedPercent: 10,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
      {
        toolName: "cursor",
        windowType: "weekly",
        usedPercent: 40,
        creditsRemaining: null,
        resetAt: new Date("2026-07-21T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 92,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  assert.equal(paces.length, 2);
  assert.equal(paces[0]?.toolKey, "cursor");
  assert.equal(paces[0]?.code, "EXCESS");
  assert.equal(paces[0]?.windowType, "monthly");
});
