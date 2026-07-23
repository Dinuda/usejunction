import assert from "node:assert/strict";
import { test } from "vitest";
import {
  inferQuotaWindowMs,
  paceAwarePlanVerdict,
  paceToPlanVerdictCode,
  paceVerdictLabel,
  projectMemberQuotaPaces,
  projectQuotaPace,
} from "../lib/quotas/pace";
import { mapQuotaSnapshots, STALE_QUOTA_MS } from "../lib/quotas/plan-utilization-policy";

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
  assert.equal(inferQuotaWindowMs("claude_5h"), 5 * 60 * 60 * 1000);
  assert.equal(inferQuotaWindowMs("gemini_weekly"), 7 * 24 * 60 * 60 * 1000);
});

test("projectQuotaPace computes Antigravity model-family windows", () => {
  const now = new Date("2026-07-22T21:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "antigravity",
        windowType: "claude_5h",
        usedPercent: 40,
        creditsRemaining: null,
        resetAt: new Date("2026-07-23T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "antigravity",
        windowType: "credits",
        usedPercent: null,
        creditsRemaining: 12,
        resetAt: null,
        source: "antigravity_model_credits",
        updatedAt: now,
      },
    ],
    now,
  );
  const pace = projectQuotaPace(quota!, now);
  assert.notEqual(pace.code, "UNKNOWN");
  assert.equal(pace.usedPercent, 40);
  assert.ok(pace.daysToReset != null && pace.daysToReset > 0);
  assert.notEqual(paceVerdictLabel(pace.code), "Pace unavailable");
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

test("projectQuotaPace prefers periodStartsAt over inferred window length", () => {
  const now = new Date("2026-07-16T00:00:00.000Z");
  // Exact 10-day window: day 5 of 10 at 60% → excess (would be mid-month under 30d inference).
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 60,
        creditsRemaining: null,
        resetAt: new Date("2026-07-21T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  const withPeriod = {
    ...quota!,
    periodStartsAt: "2026-07-11T00:00:00.000Z",
  };
  const pace = projectQuotaPace(withPeriod, now);
  assert.equal(pace.code, "EXCESS");
  assert.equal(pace.expectedPercent, 50);
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

test("paceToPlanVerdictCode maps pace codes to plan verdicts", () => {
  assert.equal(paceToPlanVerdictCode("EXCESS"), "NEAR_LIMIT");
  assert.equal(paceToPlanVerdictCode("ALREADY_EXCEEDED"), "LIMIT_EXCEEDED");
  assert.equal(paceToPlanVerdictCode("ON_TRACK"), "HEALTHY");
  assert.equal(paceToPlanVerdictCode("UNDER"), "LIGHT_USE");
  assert.equal(paceToPlanVerdictCode("UNKNOWN"), null);
});

test("paceAwarePlanVerdict projects low mid-cycle usage as near limit when burn will exhaust", () => {
  // Early in a short window: 22% used after ~1 day of a ~30 day window is above pace
  // when projected linearly (exhausts ~3.5 days in, reset ~29 days away).
  const now = new Date("2026-07-16T12:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 22,
        creditsRemaining: null,
        resetAt: new Date("2026-08-15T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  // Force a short elapsed window so 22% is clearly above linear pace.
  const hot = {
    ...quota!,
    periodStartsAt: "2026-07-15T12:00:00.000Z",
    resetsAt: "2026-08-15T00:00:00.000Z",
  };
  const verdict = paceAwarePlanVerdict({ primaryQuota: hot, included: null, now });
  assert.equal(verdict.code, "NEAR_LIMIT");
  assert.ok(verdict.reasons.includes("pace_excess"));
});

test("paceAwarePlanVerdict keeps light use when burn is under pace", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const [quota] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
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
  const verdict = paceAwarePlanVerdict({ primaryQuota: quota!, included: null, now });
  assert.equal(verdict.code, "LIGHT_USE");
  assert.ok(verdict.reasons.includes("pace_under"));
});

test("paceAwarePlanVerdict projects included-allowance burn via billing cycle window", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const verdict = paceAwarePlanVerdict({
    primaryQuota: null,
    included: {
      includedCycleMicros: "1000000",
      grossUsageMicros: "220000",
      rawRatio: 0.22,
      displayRatio: 0.22,
    },
    cycleWindow: {
      startsAt: "2026-07-15T12:00:00.000Z",
      endsAt: "2026-08-15T00:00:00.000Z",
    },
    now,
  });
  assert.equal(verdict.code, "NEAR_LIMIT");
  assert.ok(verdict.reasons.includes("pace_excess"));
});

test("paceAwarePlanVerdict keeps DATA_STALE and falls back when pace timing is unknown", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const [stale] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 50,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: new Date(now.getTime() - STALE_QUOTA_MS - 1),
      },
    ],
    now,
  );
  assert.equal(
    paceAwarePlanVerdict({ primaryQuota: stale!, included: null, now }).code,
    "DATA_STALE",
  );

  const [noReset] = mapQuotaSnapshots(
    [
      {
        toolName: "cursor",
        windowType: "unknown_window",
        usedPercent: 10,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
    now,
  );
  // Pace UNKNOWN → static LIGHT_USE (<25%).
  assert.equal(
    paceAwarePlanVerdict({ primaryQuota: noReset!, included: null, now }).code,
    "LIGHT_USE",
  );
});
