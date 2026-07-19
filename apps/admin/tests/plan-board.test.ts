import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildMemberPlanBoard,
  planBoardLeadLabel,
} from "../lib/quotas/plan-board";

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
    value: "Pace unavailable for 1 plan",
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
