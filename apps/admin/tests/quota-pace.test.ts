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
  assert.equal(inferQuotaWindowMs("weekly"), 7 * 24 * 60 * 60 * 1000);
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
  assert.match(pace.summary, /Excess/i);
  assert.equal(paceVerdictLabel(pace.code), "Excess");
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
  assert.match(pace.summary, /Headroom|under pace/i);
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
