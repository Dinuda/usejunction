import assert from "node:assert/strict";
import { test } from "vitest";
import {
  DEVICE_ACTIVITY_JSON_CAP_BYTES,
  compactNumber,
  sanitizeActivityPayload,
  uniqueStrings,
} from "../lib/activity/record-device-activity-event";

test("sanitizeActivityPayload redacts secret-looking keys", () => {
  const sanitized = sanitizeActivityPayload({
    hostname: "MacBook-Pro.local",
    deviceToken: "secret-token-value",
    localSyncToken: "sync-secret",
    nested: {
      authorization: "Bearer abc",
      agentVersion: "0.0.1",
    },
  }) as Record<string, unknown>;

  assert.equal(sanitized.hostname, "MacBook-Pro.local");
  assert.equal(sanitized.deviceToken, "[redacted]");
  assert.equal(sanitized.localSyncToken, "[redacted]");
  assert.deepEqual(sanitized.nested, {
    authorization: "[redacted]",
    agentVersion: "0.0.1",
  });
});

test("sanitizeActivityPayload truncates large arrays and oversized JSON", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    toolName: `tool-${index}`,
    model: `model-${index}`,
    blob: "x".repeat(4_000),
  }));
  const sanitized = sanitizeActivityPayload({ rows }, { maxBytes: 2_048 }) as Record<string, unknown>;

  if (sanitized.truncated) {
    assert.equal(sanitized.truncated, true);
    assert.ok(typeof sanitized.preview === "string");
    assert.ok(String(sanitized.preview).length <= 2_048);
    return;
  }

  const list = sanitized.rows as unknown[];
  assert.ok(Array.isArray(list));
  assert.ok(list.length <= 9);
  const encoded = JSON.stringify(sanitized);
  assert.ok(encoded.length <= DEVICE_ACTIVITY_JSON_CAP_BYTES);
});

test("uniqueStrings and compactNumber helpers", () => {
  assert.deepEqual(uniqueStrings(["cursor", "cursor", " codex ", "", null, "claude"]), [
    "cursor",
    "codex",
    "claude",
  ]);
  assert.equal(compactNumber(20_300_000), "20.3M");
});
