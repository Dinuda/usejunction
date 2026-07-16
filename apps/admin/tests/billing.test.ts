import assert from "node:assert/strict";
import test from "node:test";
import { calculateBilling } from "../lib/billing/calculator";
import { assignmentUpdateSchema } from "../lib/billing/validation";

const assignment = {
  id: "assignment-1",
  developerId: "developer-1",
  provider: "openai",
  product: "api_platform",
  toolName: "codex",
  planName: "Enterprise",
  planTier: "Enterprise",
  currency: "USD",
  billingCadence: "monthly",
  billingCycleAnchorDate: new Date("2026-01-01T00:00:00.000Z"),
  billingCycleDays: null,
  cycleSeatMicros: BigInt(31_000_000),
  includedCycleMicros: BigInt(1_000_000),
  inputRateMicrosPerMillion: BigInt(2_000_000),
  outputRateMicrosPerMillion: BigInt(4_000_000),
  cacheRateMicrosPerMillion: BigInt(1_000_000),
  seatCount: 1,
  seatStatus: "active",
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: new Date("2026-02-01T00:00:00.000Z"),
  source: "admin_confirmed",
  active: true,
} as const;

test("manual billing calculates seat, token usage, and included credits", () => {
  const [line] = calculateBilling({
    assignments: [assignment],
    from: new Date("2026-01-01T00:00:00.000Z"),
    to: new Date("2026-01-31T00:00:00.000Z"),
    usage: [{
      developerId: "developer-1", provider: "openai", product: "api_platform", toolName: "codex",
      date: new Date("2026-01-15T00:00:00.000Z"), source: "device_observed", costMicros: BigInt(0),
      inputTokens: BigInt(1_000_000), outputTokens: BigInt(500_000), cacheReadTokens: BigInt(250_000), observedAt: new Date("2026-01-16T00:00:00.000Z"),
    }],
  });
  assert.equal(line.grossSeatMicros, BigInt(31_000_000));
  assert.equal(line.grossUsageMicros, BigInt(4_250_000));
  assert.equal(line.includedCreditsMicros, BigInt(1_000_000));
  assert.equal(line.netMicros, BigInt(34_250_000));
  assert.equal(line.cycleStart, "2026-01-01");
  assert.equal(line.cycleEnd, "2026-02-01");
  assert.equal(line.calculationVersion, "cycle-v1");
});

test("manual billing emits full cycle lines instead of calendar-month proration", () => {
  const [january, february] = calculateBilling({
    assignments: [{ ...assignment, startDate: new Date("2026-01-15T00:00:00.000Z"), endDate: new Date("2026-02-15T00:00:00.000Z") }],
    from: new Date("2026-01-15T00:00:00.000Z"),
    to: new Date("2026-02-14T00:00:00.000Z"),
    usage: [],
  });
  assert.equal(january.cycleStart, "2026-01-01");
  assert.equal(january.grossSeatMicros, BigInt(31_000_000));
  assert.equal(february.cycleStart, "2026-02-01");
  assert.equal(february.grossSeatMicros, BigInt(31_000_000));
});

test("usage outside the assignment window is excluded", () => {
  const [line] = calculateBilling({
    assignments: [assignment],
    from: new Date("2026-01-01T00:00:00.000Z"),
    to: new Date("2026-01-31T00:00:00.000Z"),
    usage: [{
      developerId: "developer-1", provider: "openai", product: "api_platform", toolName: "codex",
      date: new Date("2026-02-02T00:00:00.000Z"), source: "device_observed", costMicros: BigInt(0),
      inputTokens: BigInt(1_000_000), outputTokens: BigInt(0), cacheReadTokens: BigInt(0), observedAt: new Date("2026-02-02T00:00:00.000Z"),
    }],
  });
  assert.equal(line.grossUsageMicros, BigInt(0));
});

test("manual billing prefers one activity source per developer, tool, and day", () => {
  const rows = ["vendor_verified", "device_observed"].map((source) => ({
    developerId: "developer-1", provider: "openai", product: "api_platform", toolName: "codex",
    date: new Date("2026-01-15T00:00:00.000Z"), source, costMicros: BigInt(0),
    inputTokens: BigInt(1_000_000), outputTokens: BigInt(0), cacheReadTokens: BigInt(0), observedAt: new Date("2026-01-16T00:00:00.000Z"),
  }));
  const [line] = calculateBilling({ assignments: [assignment], from: new Date("2026-01-01T00:00:00.000Z"), to: new Date("2026-01-31T00:00:00.000Z"), usage: rows });
  assert.equal(line.grossUsageMicros, BigInt(2_000_000));
});

test("assignment account email can be updated without resubmitting effective dates", () => {
  const parsed = assignmentUpdateSchema.safeParse({ vendorAccountEmail: "alex@example.com" });
  assert.equal(parsed.success, true);
});
