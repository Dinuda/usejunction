import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildMemberPlanBoard,
  planBoardLeadLabel,
} from "../lib/quotas/plan-board";

test("buildMemberPlanBoard uses vendorSeats when account plan is missing", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    accounts: [{ toolName: "cursor", plan: null, email: "dev@example.com" }],
    vendorSeats: [{ provider: "anysphere", product: "cursor", plan: "Pro" }],
    toolsUsage: [{ toolName: "cursor", requests: 10, tokens: 1000, cost: 5 }],
    snapshots: [
      {
        toolName: "cursor",
        windowType: "monthly",
        usedPercent: 20,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.planName, "Pro");
  assert.equal(cards[0]?.accountEmail, "dev@example.com");
  assert.equal(cards[0]?.billingCycle?.cycleStart, "2026-07-01");
  assert.equal(cards[0]?.billingCycle?.cycleEnd, "2026-08-01");
  assert.equal(cards[0]?.usage?.verifiedUsageCost, 0);
  assert.equal(cards[0]?.usage?.estimatedApiCost, 5);
});

test("buildMemberPlanBoard prefers seat assignment cycle anchors", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    planSeats: [
      {
        toolName: "claude",
        billingCadence: "monthly",
        billingCycleAnchorDate: "2026-07-08",
        billingCycleDays: null,
      },
    ],
    toolsUsage: [
      {
        toolName: "claude",
        requests: 10,
        tokens: 1000,
        cost: 621.62,
        verifiedUsageCost: 0,
        estimatedApiCost: 621.62,
      },
    ],
    snapshots: [
      {
        toolName: "claude",
        windowType: "plan",
        usedPercent: 9,
        creditsRemaining: null,
        resetAt: new Date("2026-08-08T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
  });

  assert.equal(cards[0]?.billingCycle?.cycleStart, "2026-07-08");
  assert.equal(cards[0]?.billingCycle?.cycleEnd, "2026-08-08");
  assert.equal(cards[0]?.usage?.verifiedUsageCost, 0);
  assert.equal(cards[0]?.usage?.estimatedApiCost, 621.62);
});

test("buildMemberPlanBoard maps Copilot educational vendor plan to Student", () => {
  const cards = buildMemberPlanBoard({
    accounts: [
      {
        toolName: "copilot",
        plan: "individual/free_educational_quota",
        email: "Dinuda",
      },
    ],
    toolsUsage: [{ toolName: "copilot", requests: 5, tokens: 500, cost: 0 }],
    snapshots: [],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.planName, "Student");
});

test("buildMemberPlanBoard groups primary pace and promo/credit windows per tool", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    accounts: [{ toolName: "chatgpt-codex", plan: "Plus", email: "dev@example.com" }],
    toolsUsage: [
      { toolName: "chatgpt-codex", requests: 40, tokens: 12000, cost: 18.5 },
      { toolName: "cursor", requests: 200, tokens: 90000, cost: 120 },
    ],
    snapshots: [
      {
        toolName: "chatgpt-codex",
        windowType: "weekly",
        usedPercent: 40,
        creditsRemaining: null,
        resetAt: new Date("2026-07-21T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "chatgpt-codex",
        windowType: "promo_grant",
        usedPercent: null,
        creditsRemaining: 12.5,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "oauth_api",
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
  });

  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.toolKey, "cursor");
  assert.equal(cards[0]?.pace.code, "EXCESS");

  const chatgpt = cards.find((card) => card.toolKey === "chatgpt-codex");
  assert.ok(chatgpt);
  assert.equal(chatgpt.planName, "Plus");
  assert.equal(chatgpt.primary?.windowType, "weekly");
  assert.equal(chatgpt.promotions.length, 1);
  assert.equal(chatgpt.promotions[0]?.kind, "promo");
  assert.match(chatgpt.promotions[0]?.signal ?? "", /\$12\.5 left|12\.5/);
  assert.equal(chatgpt.usage?.tokens, 12000);
  assert.equal(chatgpt.usage?.cost, 18.5);
});

test("buildMemberPlanBoard hides zero and stale rate-limit reset promotions", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");
  const staleAt = new Date(now.getTime() - 40 * 60 * 60 * 1000);
  const cards = buildMemberPlanBoard({
    now,
    snapshots: [
      {
        toolName: "codex",
        windowType: "weekly",
        usedPercent: 2,
        creditsRemaining: null,
        resetAt: new Date("2026-08-05T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "codex",
        windowType: "rate_limit_resets",
        usedPercent: null,
        creditsRemaining: 0,
        resetAt: null,
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "codex",
        windowType: "rate_limit_resets",
        usedPercent: null,
        creditsRemaining: 2,
        resetAt: null,
        source: "oauth_api",
        updatedAt: staleAt,
      },
    ],
  });

  const chatgpt = cards.find((card) => card.toolKey === "chatgpt-codex");
  assert.ok(chatgpt);
  assert.equal(chatgpt.promotions.length, 0);
  assert.equal(chatgpt.quotaSyncedAt, now.toISOString());
});

test("buildMemberPlanBoard honors a weekly usage-window override over a shorter window", () => {
  const now = new Date("2026-07-26T14:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    usageWindowPreferences: { "chatgpt-codex": "weekly" },
    snapshots: [
      {
        toolName: "codex",
        deviceId: "device-1",
        windowType: "session_5h",
        usedPercent: 90,
        creditsRemaining: null,
        resetAt: new Date("2026-07-26T19:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
      {
        toolName: "codex",
        deviceId: "device-1",
        windowType: "weekly",
        usedPercent: 14,
        creditsRemaining: null,
        resetAt: new Date("2026-08-02T10:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
  });
  assert.equal(cards[0]?.primary?.windowType, "weekly");
  assert.equal(cards[0]?.pace.usedPercent, 14);
});

test("buildMemberPlanBoard does not silently fall back when an override is unavailable", () => {
  const cards = buildMemberPlanBoard({
    usageWindowPreferences: { cursor: "weekly" },
    accounts: [{ toolName: "cursor", plan: "Pro", email: null }],
    snapshots: [
      {
        toolName: "cursor",
        deviceId: "device-1",
        windowType: "monthly",
        usedPercent: 30,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: new Date("2026-07-26T14:00:00.000Z"),
      },
    ],
  });
  assert.equal(cards[0]?.primary, null);
  assert.equal(cards[0]?.usageWindowPreference, "weekly");
});

test("planBoardLeadLabel reports status distribution with attention priority", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    snapshots: [
      {
        toolName: "cursor",
        windowType: "plan",
        usedPercent: 105,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "cli_rpc",
        updatedAt: now,
      },
      {
        toolName: "claude",
        windowType: "weekly",
        usedPercent: 60,
        creditsRemaining: null,
        resetAt: new Date("2026-07-21T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: now,
      },
      {
        toolName: "copilot",
        windowType: "copilot_premium_interactions",
        usedPercent: 10,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
        source: "github_api",
        updatedAt: now,
      },
      {
        toolName: "unknown-tool",
        windowType: "unknown_window",
        usedPercent: 5,
        creditsRemaining: null,
        resetAt: null,
        source: "observed",
        updatedAt: now,
      },
    ],
  });

  assert.deepEqual(planBoardLeadLabel(cards), {
    value: "1 plan over limit",
    sub: "4 plans · 1 over · 1 above pace · 1 under · 1 unavailable",
  });
});

test("planBoardLeadLabel calls out unavailable timing instead of reporting steady", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    snapshots: [
      {
        toolName: "cursor",
        windowType: "unknown_window",
        usedPercent: 5,
        creditsRemaining: null,
        resetAt: null,
        source: "cli_rpc",
        updatedAt: now,
      },
    ],
  });

  assert.deepEqual(planBoardLeadLabel(cards), {
    value: "Offline for 1 plan",
    sub: "1 plan · 1 unavailable",
  });
});

test("planBoardLeadLabel distinguishes underutilized and all-on-pace plans", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");
  const snapshots = [
    {
      toolName: "cursor",
      windowType: "plan",
      usedPercent: 10,
      creditsRemaining: null,
      resetAt: new Date("2026-08-01T00:00:00.000Z"),
      source: "cli_rpc",
      updatedAt: now,
    },
    {
      toolName: "claude",
      windowType: "weekly",
      usedPercent: 40,
      creditsRemaining: null,
      resetAt: new Date("2026-07-21T00:00:00.000Z"),
      source: "oauth_api",
      updatedAt: now,
    },
  ];
  const under = planBoardLeadLabel(buildMemberPlanBoard({ now, snapshots }));
  assert.equal(under.value, "1 plan underutilized");
  assert.equal(under.sub, "2 plans · 1 on pace · 1 under");

  const onTrack = planBoardLeadLabel(
    buildMemberPlanBoard({
      now,
      snapshots: snapshots.map((snapshot) => ({
        ...snapshot,
        usedPercent: snapshot.toolName === "cursor" ? 45 : 40,
      })),
    }),
  );
  assert.deepEqual(onTrack, {
    value: "All plans on pace",
    sub: "2 plans · 2 on pace",
  });
});

test("buildMemberPlanBoard keeps request-only usage without tokens or quota", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    accounts: [{ toolName: "antigravity", plan: "google-ai-pro", email: "dev@example.com" }],
    toolsUsage: [{ toolName: "antigravity", requests: 39, tokens: 0, cost: 0 }],
    snapshots: [],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.toolKey, "antigravity");
  assert.equal(cards[0]?.usage?.requests, 39);
  assert.equal(cards[0]?.usage?.tokens, 0);
  assert.equal(cards[0]?.primary, null);
});

test("buildMemberPlanBoard still drops tools with neither quota nor usage", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const cards = buildMemberPlanBoard({
    now,
    accounts: [{ toolName: "claude", plan: "Pro", email: "dev@example.com" }],
    toolsUsage: [{ toolName: "claude", requests: 0, tokens: 0, cost: 0 }],
    snapshots: [],
  });

  assert.equal(cards.length, 0);
});
