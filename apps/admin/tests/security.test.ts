import assert from "node:assert/strict";
import { test } from "vitest";
import { constantTimeHashMatch, decryptSecret, encryptSecret, hashOpaqueToken } from "../lib/security";

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
