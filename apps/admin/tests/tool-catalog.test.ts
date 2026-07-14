import assert from "node:assert/strict";
import test from "node:test";
import { TOOL_CATALOG, canonicalToolKey, findCatalogPlan, serializeCatalog } from "../lib/tools/catalog";
import { deriveSubscription } from "../lib/tools/subscriptions";
import { mapVendorPlanToCatalog, hasReportedVendorPlan } from "../lib/tools/sync-detected";

test("catalog contains the four supported branded tools and stable aliases", () => {
  assert.deepEqual(TOOL_CATALOG.map((tool) => tool.key), ["chatgpt-codex", "claude", "cursor", "github-copilot"]);
  assert.equal(canonicalToolKey("chatgpt"), "chatgpt-codex");
  assert.equal(canonicalToolKey("codex"), "chatgpt-codex");
  assert.equal(canonicalToolKey("claude-code"), "claude");
  assert.equal(canonicalToolKey("github-copilot"), "github-copilot");
  for (const tool of TOOL_CATALOG) {
    assert.equal(tool.lastVerifiedAt, "2026-07-10");
    assert.match(tool.sourceUrl, /^https:\/\//);
    assert.ok(tool.plans.length >= 6);
  }
});

test("catalog prices and annual monthly-equivalent prices remain versioned", () => {
  assert.equal(findCatalogPlan("chatgpt-codex", "plus")?.prices.monthly, BigInt(20_000_000));
  assert.equal(findCatalogPlan("chatgpt-codex", "pro")?.prices.monthly, BigInt(200_000_000));
  assert.equal(findCatalogPlan("chatgpt-codex", "business")?.prices.annual, BigInt(20_000_000));
  assert.equal(findCatalogPlan("claude", "team-premium")?.prices.annual, BigInt(100_000_000));
  assert.equal(findCatalogPlan("cursor", "pro-plus")?.prices.monthly, BigInt(60_000_000));
  assert.equal(findCatalogPlan("github-copilot", "pro-plus")?.includedMonthlyMicros, BigInt(70_000_000));
  assert.equal(findCatalogPlan("github-copilot", "max")?.prices.monthly, BigInt(100_000_000));
});

test("fixed subscriptions derive provider and pricing instead of trusting client fields", () => {
  const subscription = deriveSubscription({ toolKey: "cursor", planKey: "pro", billingCadence: "annual", seatCapacity: 3 });
  assert.equal(subscription.provider, "cursor");
  assert.equal(subscription.product, "cursor");
  assert.equal(subscription.monthlySeatMicros, BigInt(16_000_000));
  assert.equal(subscription.customPrice, false);
  assert.equal(subscription.seatCapacity, 3);
});

test("custom and enterprise subscriptions accept explicit editable pricing", () => {
  const subscription = deriveSubscription({ toolKey: "chatgpt-codex", planKey: "enterprise", billingCadence: "custom", seatCapacity: 12, monthlySeatMicros: BigInt(42_500_000) });
  assert.equal(subscription.monthlySeatMicros, BigInt(42_500_000));
  assert.equal(subscription.priceSource, "custom");
  assert.equal(subscription.providerSourceUrl, "https://chatgpt.com/pricing/");
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
