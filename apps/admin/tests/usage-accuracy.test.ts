import assert from "node:assert/strict";
import test from "node:test";
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
