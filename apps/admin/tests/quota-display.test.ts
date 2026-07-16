import assert from "node:assert/strict";
import test from "node:test";
import { quotaResetLabel, quotaWindowLabel } from "../lib/quotas/display";

test("quota window labels distinguish Codex five-hour and weekly limits", () => {
  assert.equal(quotaWindowLabel("session_5h"), "5-hour");
  assert.equal(quotaWindowLabel("weekly"), "Weekly");
});

test("quota reset labels include the exact UTC reset time", () => {
  assert.equal(quotaResetLabel("2026-07-20T14:30:00Z"), "resets Jul 20, 2:30 PM UTC");
  assert.equal(quotaResetLabel("invalid"), null);
  assert.equal(quotaResetLabel(null), null);
});
