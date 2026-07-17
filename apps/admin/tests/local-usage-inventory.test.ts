import { describe, expect, it } from "vitest";
import { shouldPreserveProductivityRequests } from "@/lib/metrics/local-usage-inventory";

describe("shouldPreserveProductivityRequests", () => {
  it("keeps tool and flow inventory counts", () => {
    expect(shouldPreserveProductivityRequests("productivity", "tool:imagegen")).toBe(true);
    expect(shouldPreserveProductivityRequests("productivity", "flow:exec>apply_patch")).toBe(true);
  });

  it("still zeros ordinary productivity rows", () => {
    expect(shouldPreserveProductivityRequests("productivity", "ai-lines")).toBe(false);
    expect(shouldPreserveProductivityRequests("usage", "tool:imagegen")).toBe(false);
  });
});
