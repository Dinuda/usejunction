import assert from "node:assert/strict";
import { test } from "vitest";
import { PLAN_UTILIZATION_POLICY_VERSION } from "../lib/billing/plan-utilization-policy";
import { buildAttentionItems } from "../lib/insights/policies/attention";

test("attention only includes actionable health and plan alerts", () => {
  const items = buildAttentionItems({
    healthIssues: [
      {
        severity: "warning",
        message: "Cursor quota at 90%",
        context: "Ada (laptop)",
      },
    ],
    planVerdicts: [
      {
        id: "plan-1",
        name: "Codex Plus",
        verdict: {
          code: "NEAR_LIMIT",
          severity: "warning",
          reasons: ["Projected usage is near the limit"],
          policyVersion: PLAN_UTILIZATION_POLICY_VERSION,
        },
      },
    ],
  });

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.id),
    ["health-0", "plan-plan-1"],
  );
  assert.equal(items.some((item) => /offline|online|active|inactive/i.test(item.title)), false);
  assert.equal(items[1]?.detail, "Likely to hit the cap before renewal");
});
