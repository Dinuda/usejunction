import assert from "node:assert/strict";
import { test } from "vitest";
import {
  deviceWorkExtractionStartedAt,
  isObservedAtEligible,
  nextWorkExtractionStartedAt,
} from "../lib/signals/collection-window";

test("work extraction enablement creates and preserves a durable epoch", () => {
  const first = new Date("2026-07-19T10:00:00.000Z");
  const later = new Date("2026-07-19T11:00:00.000Z");

  assert.equal(nextWorkExtractionStartedAt({
    wasEnabled: false,
    enabled: true,
    existingStartedAt: null,
    now: first,
  })?.toISOString(), first.toISOString());
  assert.equal(nextWorkExtractionStartedAt({
    wasEnabled: true,
    enabled: true,
    existingStartedAt: first,
    now: later,
  })?.toISOString(), first.toISOString());
  assert.equal(nextWorkExtractionStartedAt({
    wasEnabled: true,
    enabled: false,
    existingStartedAt: first,
    now: later,
  }), null);
  assert.equal(nextWorkExtractionStartedAt({
    wasEnabled: false,
    enabled: true,
    existingStartedAt: null,
    now: later,
  })?.toISOString(), later.toISOString());
});

test("device cutoff is the later of workspace enablement and enrollment", () => {
  const enabled = "2026-07-19T10:00:00.000Z";
  const enrolledEarlier = "2026-07-19T09:00:00.000Z";
  const enrolledLater = "2026-07-19T11:00:00.000Z";
  assert.equal(deviceWorkExtractionStartedAt(enabled, enrolledEarlier)?.toISOString(), enabled);
  assert.equal(deviceWorkExtractionStartedAt(enabled, enrolledLater)?.toISOString(), enrolledLater);
  assert.equal(deviceWorkExtractionStartedAt(null, enrolledLater), null);
});

test("observed-time boundary excludes dormant history and includes exact or later updates", () => {
  const cutoff = "2026-07-19T10:00:00.000Z";
  assert.equal(isObservedAtEligible("2026-07-19T09:59:59.999Z", cutoff), false);
  assert.equal(isObservedAtEligible(cutoff, cutoff), true);
  assert.equal(isObservedAtEligible("2026-07-19T10:00:00.001Z", cutoff), true);
  assert.equal(isObservedAtEligible("invalid", cutoff), false);
});
