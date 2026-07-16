import { describe, expect, test } from "vitest";
import { summarizeCanonicalCosts } from "@/lib/metrics/cost-summary";

describe("summarizeCanonicalCosts", () => {
  test("includes estimated source rows while keeping categories separate", () => {
    expect(summarizeCanonicalCosts([
      { costMicros: 5_000_000, costKind: "verified_usage" },
      { costMicros: 1_000_000, costKind: "estimated_api" },
      { costMicros: 2_000_000, costKind: "actual_spend" },
    ])).toEqual({
      verifiedUsageCost: 5,
      estimatedApiCost: 1,
      actualSpendCost: 2,
      totalUsageCost: 8,
    });
  });

  test("ignores null, zero, negative, and non-finite values", () => {
    expect(summarizeCanonicalCosts([
      { costMicros: 0, costKind: "estimated_api" },
      { costMicros: -1_000_000, costKind: "verified_usage" },
      { costMicros: "not-a-number", costKind: "estimated_api" },
      { costMicros: 1_000_000, costKind: null },
    ])).toEqual({
      verifiedUsageCost: 0,
      estimatedApiCost: 0,
      actualSpendCost: 0,
      totalUsageCost: 0,
    });
  });

  test("preserves micros precision at the display boundary", () => {
    expect(summarizeCanonicalCosts([
      { costMicros: BigInt(1), costKind: "estimated_api" },
      { costMicros: BigInt(999_999), costKind: "estimated_api" },
    ]).estimatedApiCost).toBe(1);
  });
});
