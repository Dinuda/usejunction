import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const notifyServerIssue = vi.fn();

vi.mock("@/lib/notifications/slack", () => ({
  notifyServerIssue: (...args: unknown[]) => notifyServerIssue(...args),
}));

const { logServerError, logServerWarn, publicErrorResponse } = await import("../lib/errors/public");

afterEach(() => {
  notifyServerIssue.mockClear();
});

test("logServerError fans out to Slack with severity error", () => {
  const error = new Error("boom");
  logServerError("billing/checkout", error, { orgId: "org_1" });
  assert.equal(notifyServerIssue.mock.calls.length, 1);
  assert.deepEqual(notifyServerIssue.mock.calls[0][0], {
    severity: "error",
    scope: "billing/checkout",
    error,
    details: { orgId: "org_1" },
  });
});

test("logServerWarn fans out to Slack with severity warning", () => {
  logServerWarn("webhooks/lemonsqueezy", "missing org_id");
  assert.equal(notifyServerIssue.mock.calls.length, 1);
  assert.deepEqual(notifyServerIssue.mock.calls[0][0], {
    severity: "warning",
    scope: "webhooks/lemonsqueezy",
    error: "missing org_id",
    details: undefined,
  });
});

test("publicErrorResponse logs then returns a safe JSON body", async () => {
  const response = publicErrorResponse("billing/portal", new Error("secret"), "Billing portal unavailable.", 500);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Billing portal unavailable." });
  assert.equal(notifyServerIssue.mock.calls.length, 1);
  assert.equal(notifyServerIssue.mock.calls[0][0].scope, "billing/portal");
});
