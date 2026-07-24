import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

test("getIdentityVerificationStatus returns verified for OAuth users", async () => {
  mocks.userFindUnique.mockResolvedValue({
    emailVerified: null,
    accounts: [{ provider: "google" }],
  });
  const { getIdentityVerificationStatus } = await import("../lib/developer-identity");
  const status = await getIdentityVerificationStatus("user_1");
  assert.deepEqual(status, { verified: true });
});

test("getIdentityVerificationStatus returns 401 when session user is missing", async () => {
  mocks.userFindUnique.mockResolvedValue(null);
  const { getIdentityVerificationStatus } = await import("../lib/developer-identity");
  const status = await getIdentityVerificationStatus("missing");
  assert.equal(status.verified, false);
  if (!status.verified) {
    assert.equal(status.status, 401);
    assert.equal(status.error, "session expired, sign in again");
  }
});

test("getIdentityVerificationStatus returns 403 for unverified email-only users", async () => {
  mocks.userFindUnique.mockResolvedValue({
    emailVerified: null,
    accounts: [],
  });
  const { getIdentityVerificationStatus } = await import("../lib/developer-identity");
  const status = await getIdentityVerificationStatus("user_1");
  assert.equal(status.verified, false);
  if (!status.verified) {
    assert.equal(status.status, 403);
    assert.equal(status.error, "verify your email to continue");
  }
});
