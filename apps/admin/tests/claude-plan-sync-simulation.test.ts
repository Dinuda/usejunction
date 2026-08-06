import assert from "node:assert/strict";
import { test } from "vitest";
import {
  accountsInventoryContentHash,
  resolveStickyAccountPlan,
} from "@/lib/sync/accounts-inventory";
import { buildMemberPlanBoard } from "@/lib/quotas/plan-board";
import { mapVendorPlanToCatalog } from "@/lib/tools/sync-detected";

const PASINDU_EMAIL = "pasindu.ratnayake@axio360ventures.io";
const STALE_SYNC = new Date("2026-08-01T12:00:00.000Z");

test("simulation: Desktop-only machine reports team-standard plan, zero quota windows", () => {
  // Agent side (Pasindu machine today): JSON metadata only, no Code OAuth tokens.
  const agentReport = {
    toolName: "claude",
    email: PASINDU_EMAIL,
    plan: "team-standard",
    authPresent: false,
  };

  const catalogKey = mapVendorPlanToCatalog("claude", agentReport.plan);
  assert.equal(catalogKey, "team-standard");

  const cards = buildMemberPlanBoard({
    now: STALE_SYNC,
    accounts: [{ toolName: "claude", plan: agentReport.plan, email: agentReport.email }],
    toolsUsage: [
      {
        toolName: "claude",
        requests: 6100,
        tokens: 3_600_000,
        inputTokens: 43_200,
        outputTokens: 3_600_000,
        cacheReadTokens: 2_000_000_000,
        cacheWriteTokens: 0,
        cost: 812.91,
      },
    ],
    snapshots: [],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.planName, "Team Standard");
  assert.equal(cards[0]?.quotaSyncedAt, null);
  assert.equal(cards[0]?.usage?.cost, 812.91);
  assert.equal(cards[0]?.pace.code, "UNKNOWN");
});

test("simulation: stale DB pro is replaced when agent reports team-standard", () => {
  const existingDbPlan = "pro";
  const incoming = resolveStickyAccountPlan({
    incomingPlan: "team-standard",
    existingPlan: existingDbPlan,
    authPresent: true,
  });
  assert.equal(incoming, "team-standard");

  const proHash = accountsInventoryContentHash([
    { toolName: "claude", email: PASINDU_EMAIL, plan: "pro", authPresent: true },
  ]);
  const teamHash = accountsInventoryContentHash([
    { toolName: "claude", email: PASINDU_EMAIL, plan: "team-standard", authPresent: true },
  ]);
  assert.notEqual(proHash, teamHash, "plan flip must bust content-hash skip");
});

test("simulation: Junction shows Pro when DB still has pro (screenshot state)", () => {
  const cards = buildMemberPlanBoard({
    now: STALE_SYNC,
    accounts: [{ toolName: "claude", plan: "pro", email: PASINDU_EMAIL }],
    toolsUsage: [
      {
        toolName: "claude",
        requests: 6100,
        tokens: 3_600_000,
        inputTokens: 43_200,
        outputTokens: 3_600_000,
        cacheReadTokens: 2_000_000_000,
        cacheWriteTokens: 0,
        cost: 812.91,
      },
    ],
    snapshots: [
      {
        toolName: "claude",
        windowType: "weekly",
        usedPercent: 0,
        creditsRemaining: null,
        resetAt: new Date("2026-08-08T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: STALE_SYNC,
      },
      {
        toolName: "claude",
        windowType: "session_5h",
        usedPercent: 3,
        creditsRemaining: null,
        resetAt: new Date("2026-08-01T18:00:00.000Z"),
        source: "oauth_api",
        updatedAt: STALE_SYNC,
      },
    ],
  });

  assert.equal(cards[0]?.planName, "Pro");
  assert.match(cards[0]?.primary?.windowLabel ?? "", /Weekly/i);
  assert.equal(cards[0]?.primary?.usedPercent, 0);
  assert.equal(cards[0]?.quotaSyncedAt, STALE_SYNC.toISOString());
  // Usage still flows via OTEL even when quota probe is stale.
  assert.equal(cards[0]?.usage?.tokens, 3_600_000);
});

test("simulation: OLD agent (creds-only) kept pro and ignored team JSON — explains screenshot", () => {
  // Pre-merge agent: return OAuth creds plan when present, JSON only as fallback.
  function oldAgentPlan(credsPlan: string | null, jsonPlan: string | null): string | null {
    if (credsPlan?.trim()) return credsPlan.trim();
    return jsonPlan?.trim() || null;
  }

  assert.equal(oldAgentPlan("pro", "team_standard"), "pro");
  assert.equal(oldAgentPlan(null, "team_standard"), "team_standard");

  const cards = buildMemberPlanBoard({
    now: STALE_SYNC,
    accounts: [{ toolName: "claude", plan: oldAgentPlan("pro", "team_standard"), email: PASINDU_EMAIL }],
    snapshots: [
      {
        toolName: "claude",
        windowType: "weekly",
        usedPercent: 0,
        creditsRemaining: null,
        resetAt: new Date("2026-08-08T00:00:00.000Z"),
        source: "oauth_api",
        updatedAt: STALE_SYNC,
      },
    ],
    toolsUsage: [{ toolName: "claude", requests: 6100, tokens: 3_600_000, cost: 812.91 }],
  });

  assert.equal(cards[0]?.planName, "Pro");
});

test("simulation: after sync with team-standard, UI shows Team Standard not Pro", () => {
  const cards = buildMemberPlanBoard({
    now: new Date("2026-08-03T12:00:00.000Z"),
    accounts: [{ toolName: "claude", plan: "team-standard", email: PASINDU_EMAIL }],
    toolsUsage: [
      {
        toolName: "claude",
        requests: 6100,
        tokens: 3_600_000,
        inputTokens: 43_200,
        outputTokens: 3_600_000,
        cacheReadTokens: 2_000_000_000,
        cacheWriteTokens: 0,
        cost: 812.91,
      },
    ],
    snapshots: [],
  });

  assert.equal(cards[0]?.planName, "Team Standard");
});

test("confirmatory chain: pro DB → agent team-standard → Team Standard UI, no quota windows", () => {
  const agentPlan = "team-standard";
  const existingDbPlan = "pro";

  const persistedPlan = resolveStickyAccountPlan({
    incomingPlan: agentPlan,
    existingPlan: existingDbPlan,
    authPresent: true,
  });
  assert.equal(persistedPlan, "team-standard");

  const proHash = accountsInventoryContentHash([
    { toolName: "claude", email: PASINDU_EMAIL, plan: "pro", authPresent: true },
  ]);
  const teamHash = accountsInventoryContentHash([
    { toolName: "claude", email: PASINDU_EMAIL, plan: agentPlan, authPresent: true },
  ]);
  assert.notEqual(proHash, teamHash);

  assert.equal(mapVendorPlanToCatalog("claude", agentPlan), "team-standard");
  assert.notEqual(
    mapVendorPlanToCatalog("claude", existingDbPlan),
    mapVendorPlanToCatalog("claude", agentPlan),
    "detected-seat migration fires when catalogPlanKey changes",
  );

  const cards = buildMemberPlanBoard({
    now: new Date("2026-08-03T12:00:00.000Z"),
    accounts: [{ toolName: "claude", plan: agentPlan, email: PASINDU_EMAIL }],
    toolsUsage: [
      {
        toolName: "claude",
        requests: 6100,
        tokens: 3_600_000,
        inputTokens: 43_200,
        outputTokens: 3_600_000,
        cacheReadTokens: 2_000_000_000,
        cacheWriteTokens: 0,
        cost: 812.91,
      },
    ],
    snapshots: [],
  });

  assert.equal(cards[0]?.planName, "Team Standard");
  assert.equal(cards[0]?.quotaSyncedAt, null);
  assert.equal(cards[0]?.usage?.cost, 812.91);
});
