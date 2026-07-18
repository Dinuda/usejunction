import assert from "node:assert/strict";
import { test } from "vitest";
import { buildMemberPlanBoard } from "../lib/quotas/plan-board";

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
