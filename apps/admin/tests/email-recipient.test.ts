import assert from "node:assert/strict";
import { test } from "vitest";
import {
  UndeliverableEmailRecipientError,
  isResendUndeliverableToError,
  isUndeliverableEmailRecipient,
} from "@/lib/email/recipient";

test("flags RFC 2606 and special-use domains as undeliverable", () => {
  assert.equal(isUndeliverableEmailRecipient("owner@example.com"), true);
  assert.equal(isUndeliverableEmailRecipient("owner@example.org"), true);
  assert.equal(isUndeliverableEmailRecipient("owner@example.net"), true);
  assert.equal(isUndeliverableEmailRecipient("ada@example.test"), true);
  assert.equal(isUndeliverableEmailRecipient("ada@example.invalid"), true);
  assert.equal(isUndeliverableEmailRecipient("root@localhost"), true);
});

test("allows normal production domains", () => {
  assert.equal(isUndeliverableEmailRecipient("owner@usejunction.dev"), false);
  assert.equal(isUndeliverableEmailRecipient("Ada Lovelace <ada@acme.co>"), false);
});

test("detects Resend reserved-domain validation errors", () => {
  assert.equal(
    isResendUndeliverableToError({
      message:
        "Invalid `to` field. Please use our testing email address instead of domains like `example.com`. See our documentation for more information.",
    }),
    true,
  );
  assert.equal(isResendUndeliverableToError({ message: "Invalid `to` field. The email address needs to follow the format." }), false);
});

test("UndeliverableEmailRecipientError carries the recipient", () => {
  const error = new UndeliverableEmailRecipientError("owner@example.com");
  assert.equal(error.to, "owner@example.com");
  assert.match(error.message, /owner@example\.com/);
});
