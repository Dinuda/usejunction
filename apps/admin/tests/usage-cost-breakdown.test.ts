import { describe, expect, test } from "vitest";
import { usageCostBreakdownSub } from "@/lib/dashboard/usage-cost-breakdown";

describe("usageCostBreakdownSub", () => {
  test("shows both verified and estimated when both are positive", () => {
    expect(usageCostBreakdownSub(25, 2)).toBe("$25.00 verified · $2.00 estimated");
  });

  test("shows verified only when estimated is zero", () => {
    expect(usageCostBreakdownSub(25, 0)).toBe("$25.00 verified");
    expect(usageCostBreakdownSub(0.5, 0)).toBe("$0.50 verified");
  });

  test("omits sub-line when only estimated is positive", () => {
    expect(usageCostBreakdownSub(0, 983.08)).toBeUndefined();
    expect(usageCostBreakdownSub(0, 2)).toBeUndefined();
  });

  test("omits sub-line when both are zero", () => {
    expect(usageCostBreakdownSub(0, 0)).toBeUndefined();
  });
});
