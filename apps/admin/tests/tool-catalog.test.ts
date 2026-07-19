import assert from "node:assert/strict";
import { test } from "vitest";
import {
  TOOL_CATALOG,
  canonicalToolKey,
  findCatalogPlan,
  findCatalogTool,
  serializeCatalog,
  subscriptionToolKeys,
  toolDisplayName,
  toolUsageNames,
} from "../lib/tools/catalog";
import { deriveSubscription } from "../lib/tools/subscriptions";
import { mapVendorPlanToCatalog, hasReportedVendorPlan } from "../lib/tools/sync-detected";

test("catalog contains the supported branded tools and stable aliases", () => {
  assert.deepEqual(TOOL_CATALOG.map((tool) => tool.key), [
    "chatgpt-codex",
    "claude",
    "cursor",
    "github-copilot",
  ]);
  assert.equal(canonicalToolKey("chatgpt"), "chatgpt-codex");
  assert.equal(canonicalToolKey("codex"), "chatgpt-codex");
  assert.equal(canonicalToolKey("codex-work"), "chatgpt-codex");
  assert.equal(canonicalToolKey("codex_work"), "chatgpt-codex");
  assert.equal(canonicalToolKey("claude-code"), "claude");
  assert.equal(canonicalToolKey("github-copilot"), "github-copilot");
  for (const tool of TOOL_CATALOG) {
    assert.equal(tool.lastVerifiedAt, "2026-07-10");
    assert.match(tool.sourceUrl, /^https:\/\//);
    assert.ok(tool.plans.length >= 4);
  }
});

test("tool display names cover catalog keys, aliases, and fallbacks", () => {
  assert.equal(toolDisplayName("chatgpt-codex"), "ChatGPT");
  assert.equal(toolDisplayName("chatgpt"), "ChatGPT");
  assert.equal(toolDisplayName("codex"), "ChatGPT");
  assert.equal(toolDisplayName("codex-work"), "ChatGPT");
  assert.equal(toolDisplayName("github-copilot"), "Copilot");
  assert.equal(toolDisplayName("copilot"), "Copilot");
  assert.equal(toolDisplayName("claude-code"), "Claude");
  assert.equal(toolDisplayName("unknown-tool"), "Unknown-tool");
  assert.equal(toolDisplayName(""), "Tool");
  assert.equal(toolDisplayName("   "), "Tool");
  assert.equal(toolDisplayName(null), "Tool");
});

test("usage queries include all catalog aliases for a subscription tool", () => {
  assert.deepEqual(
    toolUsageNames("chatgpt-codex").sort(),
    ["chatgpt-codex", "chatgpt", "codex", "codex-work", "codex_work"].sort(),
  );
  assert.deepEqual(
    toolUsageNames("codex-work").sort(),
    ["chatgpt-codex", "chatgpt", "codex", "codex-work", "codex_work"].sort(),
  );
  assert.deepEqual(toolUsageNames("codex").sort(), ["chatgpt-codex", "chatgpt", "codex", "codex-work", "codex_work"].sort());
  assert.deepEqual(toolUsageNames("github-copilot").sort(), ["copilot", "github-copilot"].sort());
  assert.deepEqual(toolUsageNames("unknown-tool"), ["unknown-tool"]);
});

test("codex and work share one catalog subscription surface", () => {
  assert.deepEqual([...subscriptionToolKeys("chatgpt-codex")], ["chatgpt-codex", "codex-work"]);
  assert.deepEqual([...subscriptionToolKeys("codex-work")], ["chatgpt-codex", "codex-work"]);
  assert.equal(findCatalogTool("codex-work")?.key, "chatgpt-codex");
  assert.equal(TOOL_CATALOG.some((tool) => tool.key === "codex-work"), false);
});

test("catalog prices and annual monthly-equivalent prices remain versioned", () => {
  assert.equal(findCatalogPlan("chatgpt-codex", "plus")?.prices.monthly, BigInt(20_000_000));
  assert.equal(findCatalogPlan("chatgpt-codex", "pro")?.prices.monthly, BigInt(200_000_000));
  assert.equal(findCatalogPlan("chatgpt-codex", "business")?.prices.annual, BigInt(20_000_000));
  assert.equal(findCatalogPlan("claude", "team-premium")?.prices.annual, BigInt(100_000_000));
  assert.equal(findCatalogPlan("cursor", "pro-plus")?.prices.monthly, BigInt(60_000_000));
  assert.equal(findCatalogPlan("github-copilot", "pro-plus")?.includedCycleMicros, BigInt(70_000_000));
  assert.equal(findCatalogPlan("github-copilot", "max")?.prices.monthly, BigInt(100_000_000));
});

test("fixed subscriptions derive provider and pricing instead of trusting client fields", () => {
  const subscription = deriveSubscription({ toolKey: "cursor", planKey: "pro", billingCadence: "annual", seatCapacity: 3 });
  assert.equal(subscription.provider, "cursor");
  assert.equal(subscription.product, "cursor");
  assert.equal(subscription.cycleSeatMicros, BigInt(192_000_000));
  assert.equal(subscription.customPrice, false);
  assert.equal(subscription.seatCapacity, 3);
});

test("custom and enterprise subscriptions accept explicit editable pricing", () => {
  const subscription = deriveSubscription({ toolKey: "chatgpt-codex", planKey: "enterprise", billingCadence: "custom", billingCycleDays: 45, seatCapacity: 12, cycleSeatMicros: BigInt(42_500_000) });
  assert.equal(subscription.cycleSeatMicros, BigInt(42_500_000));
  assert.equal(subscription.billingCycleDays, 45);
  assert.equal(subscription.priceSource, "custom");
  assert.equal(subscription.providerSourceUrl, "https://chatgpt.com/pricing/");

  const claudeEnterprise = deriveSubscription({
    toolKey: "claude",
    planKey: "enterprise",
    billingCadence: "monthly",
    seatCapacity: 1,
    cycleSeatMicros: BigInt(31_000_000),
    includedCycleMicros: BigInt(0),
    inputRateMicrosPerMillion: BigInt(2_000_000),
    outputRateMicrosPerMillion: BigInt(4_000_000),
    cacheRateMicrosPerMillion: BigInt(1_000_000),
  });
  assert.equal(claudeEnterprise.name, "Enterprise");
  assert.equal(claudeEnterprise.cycleSeatMicros, BigInt(31_000_000));
  assert.equal(claudeEnterprise.inputRateMicrosPerMillion, BigInt(2_000_000));
  assert.equal(claudeEnterprise.outputRateMicrosPerMillion, BigInt(4_000_000));
  assert.equal(claudeEnterprise.cacheRateMicrosPerMillion, BigInt(1_000_000));
});

test("serialized catalog is JSON-safe", () => {
  const serialized = serializeCatalog();
  assert.doesNotThrow(() => JSON.stringify(serialized));
  assert.equal(serialized[0].plans[2].prices.monthly, "20000000");
});

test("detected seat sync requires a reported vendor plan", () => {
  assert.equal(hasReportedVendorPlan(null), false);
  assert.equal(hasReportedVendorPlan(""), false);
  assert.equal(hasReportedVendorPlan("   "), false);
  assert.equal(hasReportedVendorPlan("pro_plus"), true);
});

test("vendor plan strings map onto catalog plan keys with safe defaults", () => {
  assert.equal(mapVendorPlanToCatalog("cursor", null), "hobby");
  assert.equal(mapVendorPlanToCatalog("cursor", "pro_plus"), "pro-plus");
  assert.equal(mapVendorPlanToCatalog("cursor", "pro+"), "pro-plus");
  assert.equal(mapVendorPlanToCatalog("cursor", "business"), "teams");
  assert.equal(mapVendorPlanToCatalog("chatgpt-codex", "plus"), "plus");
  assert.equal(mapVendorPlanToCatalog("chatgpt-codex", undefined), "free");
  assert.equal(mapVendorPlanToCatalog("claude", "max"), "max-5x");
  assert.equal(mapVendorPlanToCatalog("github-copilot", "Pro Plus"), "pro-plus");
  assert.equal(mapVendorPlanToCatalog("unknown-tool", "pro"), "free");
});
