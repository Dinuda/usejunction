import { test, expect } from "vitest";
import {
  normalizeUsageWindowPreference,
  usageWindowDisplayLabel,
  usageWindowPreferenceMatches,
  usageWindowPreferenceLabel,
} from "../lib/quotas/usage-window";
import { deriveSubscription, subscriptionInputSchema } from "../lib/tools/subscriptions";

test("usage window preferences normalize and match provider aliases", () => {
  expect(normalizeUsageWindowPreference(" WEEKLY ")).toBe("weekly");
  expect(usageWindowPreferenceMatches("weekly", "seven_day")).toBe(true);
  expect(usageWindowPreferenceMatches("monthly", "copilot_premium_interactions")).toBe(true);
  expect(usageWindowPreferenceMatches("provider:claude_weekly", "claude_weekly")).toBe(true);
  expect(usageWindowPreferenceMatches("weekly", "session_5h")).toBe(false);
});

test("usage window labels are user-facing and separate from billing terms", () => {
  expect(usageWindowPreferenceLabel("weekly")).toBe("Weekly");
  expect(usageWindowDisplayLabel("seven_day")).toBe("Weekly");
  expect(usageWindowPreferenceLabel("provider:claude_weekly")).toBe("claude weekly");
});

test("subscription payloads default to auto and preserve explicit provider windows", () => {
  const base = {
    toolKey: "chatgpt-codex",
    planKey: "plus",
    billingCadence: "monthly" as const,
    seatCapacity: 1,
  };
  expect(subscriptionInputSchema.parse(base).usageWindowPreference).toBe("auto");
  expect(deriveSubscription({ ...base, usageWindowPreference: "weekly" }).usageWindowPreference).toBe("weekly");
  expect(deriveSubscription({ ...base, usageWindowPreference: "provider:codex_weekly" }).usageWindowPreference).toBe(
    "provider:codex_weekly",
  );
  expect(() => deriveSubscription({ ...base, usageWindowPreference: "no such window" })).toThrow(
    "INVALID_USAGE_WINDOW_PREFERENCE",
  );
});
