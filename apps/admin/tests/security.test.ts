import assert from "node:assert/strict";
import test from "node:test";
import { buildInstallCommand } from "../lib/connect-command";
import { deviceCostKind, normalizeDeviceSource } from "../lib/ingest-trust";
import { canRedeemTeamInvite } from "../lib/invite-policy";
import { consumeRateLimit } from "../lib/rate-limit";
import { PayloadTooLargeError, readJsonWithLimit } from "../lib/request-body";
import { safeAuthNextPath } from "../lib/safe-redirect";
import { constantTimeHashMatch, decryptSecret, encryptSecret, hashOpaqueToken } from "../lib/security";
import { securityHeaders } from "../lib/security-headers";

test("integration credentials round-trip through authenticated encryption", () => {
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptSecret("key_super_secret");
  assert.notEqual(encrypted, "key_super_secret");
  assert.equal(decryptSecret(encrypted), "key_super_secret");
});

test("opaque token comparisons operate on fixed length hashes", () => {
  const hash = hashOpaqueToken("uj_token_value");
  assert.equal(constantTimeHashMatch("uj_token_value", hash), true);
  assert.equal(constantTimeHashMatch("wrong", hash), false);
});

test("post-auth redirects remain same-origin paths", () => {
  assert.equal(safeAuthNextPath("/dashboard?range=7d"), "/dashboard?range=7d");
  assert.equal(safeAuthNextPath("//evil.example"), "/dashboard");
  assert.equal(safeAuthNextPath("https://evil.example"), "/dashboard");
  assert.equal(safeAuthNextPath("/\\evil.example"), "/dashboard");
});

test("rate limiter rejects requests over the configured window", () => {
  const scope = `test-${Date.now()}-${Math.random()}`;
  assert.equal(consumeRateLimit(scope, "subject", 2, 60_000).allowed, true);
  assert.equal(consumeRateLimit(scope, "subject", 2, 60_000).allowed, true);
  assert.equal(consumeRateLimit(scope, "subject", 2, 60_000).allowed, false);
});

test("device telemetry cannot claim trusted provenance", () => {
  assert.equal(normalizeDeviceSource("vendor_verified"), "device_observed");
  assert.equal(normalizeDeviceSource("cursor_usage_events"), "device_observed");
  assert.equal(normalizeDeviceSource("integration_verified"), "device_observed");
  assert.equal(deviceCostKind(12.5), "estimated_api");
  assert.equal(deviceCostKind(0), null);
});

test("team invite links require a pre-authorized identity", () => {
  assert.equal(canRedeemTeamInvite({ allowlisted: false, hasPendingInvite: false }), false);
  assert.equal(canRedeemTeamInvite({ allowlisted: true, hasPendingInvite: false }), true);
  assert.equal(canRedeemTeamInvite({ allowlisted: false, hasPendingInvite: true }), true);
});

test("security headers deny framing and restrict content", () => {
  const headers = new Map(securityHeaders(true).map((header) => [header.key, header.value]));
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("Content-Security-Policy") ?? "", /upgrade-insecure-requests/);
});

test("JSON body reader rejects oversized ingest payloads", async () => {
  const request = new Request("https://example.test/api/ingest", {
    method: "POST",
    body: JSON.stringify({ value: "too-large" }),
  });
  await assert.rejects(() => readJsonWithLimit(request, 4), PayloadTooLargeError);
});

test("generated install commands shell-quote all dynamic values", () => {
  const command = buildInstallCommand("token'$(touch /tmp/pwned)", "https://example.test");
  assert.match(command, /'\"'\"'/);
  assert.doesNotMatch(command, /--token token/);
});
