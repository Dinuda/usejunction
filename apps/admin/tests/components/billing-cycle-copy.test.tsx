import { expect, test } from "vitest";
import {
  billingSeatLabel,
  estimatedUsageLabel,
  estimatedUsageWindowTooltip,
} from "@/lib/insights/billing-copy";

test("billing card copy distinguishes monthly dollars from weekly quota usage", () => {
  expect(estimatedUsageLabel()).toBe("Estimated usage");
  expect(billingSeatLabel(20)).toBe("Seat $20.00/mo");
  expect(estimatedUsageWindowTooltip("Weekly", "Jul 26")).toBe(
    "Estimated usage covers Jul 26. The quota meter uses the weekly usage window and resets separately.",
  );
  expect(estimatedUsageWindowTooltip("Mixed usage windows", "selected window")).toContain(
    "combines multiple quota windows",
  );
});
