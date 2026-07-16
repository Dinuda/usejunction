import assert from "node:assert/strict";
import { test } from "vitest";
import {
  activityPriority,
  costKindForRow,
  costPriority,
  isObservedSource,
  isProductivityMetric,
  normalizeSource,
} from "../lib/metrics/source-priority";

test("canonical source aliases retain accounting priority", () => {
  assert.equal(normalizeSource("cursor_usage_events"), "vendor_verified");
  assert.equal(normalizeSource("cursor_local"), "device_observed");
  assert.equal(activityPriority("cursor_usage_events"), activityPriority("vendor_verified"));
  assert.equal(costPriority("local_scan"), costPriority("device_observed"));
});

test("activity and cost use independent source priorities", () => {
  assert.ok(activityPriority("otel_observed") < activityPriority("gateway_observed"));
  assert.ok(costPriority("gateway_observed") < costPriority("otel_observed"));
});

test("productivity and synthetic estimates are not observed model activity", () => {
  assert.equal(isProductivityMetric("usage", "cursor_local"), true);
  assert.equal(isProductivityMetric("productivity", "device_observed"), true);
  assert.equal(isObservedSource("estimated"), false);
  assert.equal(isObservedSource("vendor_verified"), true);
});

test("cost kind classification keeps spend categories separate", () => {
  assert.equal(costKindForRow({ verified: true, source: "device_observed", costMicros: BigInt(1) }), "verified_usage");
  assert.equal(costKindForRow({ verified: false, source: "invoice_imported", costMicros: BigInt(1) }), "actual_spend");
  assert.equal(costKindForRow({ verified: false, source: "otel_observed", costMicros: BigInt(1) }), "estimated_api");
});

test("source policy handles unknown, zero-cost, and non-productivity boundaries", () => {
  assert.equal(normalizeSource("unknown_source"), "unknown_source");
  assert.equal(activityPriority("unknown_source"), 99);
  assert.equal(costPriority("unknown_source"), 99);
  assert.equal(isProductivityMetric(null, "other_source"), false);
  assert.equal(costKindForRow({ verified: false, source: "vendor_verified", costMicros: BigInt(0) }), null);
  assert.equal(isObservedSource("local_scan"), true);
});
