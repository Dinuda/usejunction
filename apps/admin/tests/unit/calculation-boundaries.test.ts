import { describe, expect, test } from "vitest";
import { calculateBilling } from "@/lib/billing/calculator";
import { deriveSubscription } from "@/lib/tools/subscriptions";
import { inclusiveDayCount, usageDayFilter } from "@/lib/metrics/date-range";

describe("calculation boundaries", () => {
  test("calculateBilling chooses the highest-priority source once per developer/tool/day", () => {
    const assignment = {
      id: "assignment-1",
      developerId: "developer-1",
      provider: "cursor",
      product: "cursor",
      toolName: "cursor",
      planName: "Pro",
      planTier: null,
      currency: "USD",
      billingCadence: "monthly",
      billingCycleAnchorDate: new Date("2026-07-01T00:00:00Z"),
      billingCycleDays: null,
      cycleSeatMicros: BigInt(10_000_000),
      includedCycleMicros: BigInt(1_000_000),
      inputRateMicrosPerMillion: BigInt(2_000_000),
      outputRateMicrosPerMillion: BigInt(4_000_000),
      cacheRateMicrosPerMillion: BigInt(1_000_000),
      seatCount: 1,
      seatStatus: "active",
      startDate: new Date("2026-07-01T00:00:00Z"),
      endDate: null,
      source: "admin_confirmed",
      active: true,
    } as const;
    const rows = [
      { developerId: "developer-1", provider: "cursor", product: "cursor", toolName: "cursor", date: new Date("2026-07-10T00:00:00Z"), source: "estimated", inputTokens: BigInt(100), outputTokens: BigInt(0), cacheReadTokens: BigInt(0), cacheWriteTokens: BigInt(0), costMicros: BigInt(0), observedAt: new Date("2026-07-10T01:00:00Z") },
      { developerId: "developer-1", provider: "cursor", product: "cursor", toolName: "cursor", date: new Date("2026-07-10T00:00:00Z"), source: "vendor_verified", inputTokens: BigInt(1_000_000), outputTokens: BigInt(500_000), cacheReadTokens: BigInt(0), cacheWriteTokens: BigInt(0), costMicros: BigInt(0), observedAt: new Date("2026-07-10T02:00:00Z") },
    ];

    const [line] = calculateBilling({ assignments: [assignment], usage: rows, from: new Date("2026-07-10T00:00:00Z"), to: new Date("2026-07-10T00:00:00Z") });
    expect(line?.usageRows).toBe(1);
    expect(line?.grossUsageMicros).toBe(BigInt(4_000_000));
    expect(line?.includedCreditsMicros).toBe(BigInt(1_000_000));
    expect(line?.netMicros).toBe(BigInt(13_000_000));
  });

  test("date calculations include both calendar endpoints and the next UTC midnight", () => {
    const from = new Date("2026-07-10T23:00:00-04:00");
    const to = new Date("2026-07-13T01:00:00-04:00");
    expect(inclusiveDayCount(from, to)).toBe(3);
    expect(usageDayFilter(from, to)).toEqual({
      gte: new Date("2026-07-11T00:00:00.000Z"),
      lt: new Date("2026-07-14T00:00:00.000Z"),
    });
  });

  test("subscription derivation converts annual catalog price to the selected cycle and validates custom cycles", () => {
    const derived = deriveSubscription({ toolKey: "cursor", planKey: "pro", billingCadence: "annual", seatCapacity: 2 });
    expect(derived.cycleSeatMicros).toBe(BigInt(192_000_000));
    expect(derived.customPrice).toBe(false);
    expect(() => deriveSubscription({ toolKey: "cursor", planKey: "pro", billingCadence: "custom", seatCapacity: 1, cycleSeatMicros: BigInt(50_000_000) })).toThrow("CUSTOM_CYCLE_DAYS_REQUIRED");
  });
});
