import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import {
  isRecentSignup,
  notifyServerIssue,
  notifySlackBestEffort,
  notifyTeamSeatsAdded,
  notifyUserLoggedIn,
  notifyUserSignedUp,
  sendSlackNotification,
} from "../lib/notifications/slack";

const originalWebhook = process.env.SLACK_WEBHOOK_URL;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalWebhook === undefined) delete process.env.SLACK_WEBHOOK_URL;
  else process.env.SLACK_WEBHOOK_URL = originalWebhook;
  globalThis.fetch = originalFetch;
});

test("sendSlackNotification is a no-op when webhook URL is unset", async () => {
  delete process.env.SLACK_WEBHOOK_URL;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("ok");
  };
  await sendSlackNotification({ text: "hello" });
  assert.equal(called, false);
});

test("sendSlackNotification posts JSON to the configured webhook", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
  const captured: { request: { url: string; init?: RequestInit } | null } = { request: null };
  globalThis.fetch = async (url, init) => {
    captured.request = { url: String(url), init };
    return new Response("ok", { status: 200 });
  };

  await sendSlackNotification({ text: "hello" });
  assert.equal(captured.request?.url, "https://hooks.slack.com/services/test");
  assert.equal(captured.request?.init?.method, "POST");
  assert.equal((captured.request?.init?.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(captured.request?.init?.body)), { text: "hello" });
});

test("isRecentSignup treats accounts created within the last minute as new", () => {
  const now = Date.parse("2026-07-20T12:00:00.000Z");
  assert.equal(isRecentSignup(new Date("2026-07-20T11:59:30.000Z"), now), true);
  assert.equal(isRecentSignup(new Date("2026-07-20T11:58:00.000Z"), now), false);
});

test("auth, seat, and issue helpers enqueue Slack payloads without throwing", async () => {
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";
  const payloads: unknown[] = [];
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return new Response("ok", { status: 200 });
  };

  notifyUserSignedUp({ email: "new@example.com", name: "New User", method: "email" });
  notifyUserLoggedIn({ email: "member@example.com", name: "Member", provider: "google" });
  notifyTeamSeatsAdded({
    organizationName: "Acme",
    orgId: "org_1",
    actorEmail: "owner@example.com",
    emails: ["one@example.com", "two@example.com"],
  });
  notifySlackBestEffort({ text: "fire and forget" });
  notifyServerIssue({
    severity: "error",
    scope: "billing/checkout",
    error: new Error("checkout blew up"),
    details: { orgId: "org_1" },
  });
  notifyServerIssue({
    severity: "warning",
    scope: "webhooks/lemonsqueezy",
    error: "missing org_id",
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(payloads.length, 6);
  assert.match(String((payloads[0] as { text: string }).text), /new@example.com/);
  assert.match(String((payloads[1] as { text: string }).text), /member@example.com/);
  assert.match(String((payloads[2] as { text: string }).text), /Acme/);
  assert.equal((payloads[3] as { text: string }).text, "fire and forget");
  assert.match(String((payloads[4] as { text: string }).text), /billing\/checkout/);
  assert.match(String((payloads[5] as { text: string }).text), /webhooks\/lemonsqueezy/);
});
