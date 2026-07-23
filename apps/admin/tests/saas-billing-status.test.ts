import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deviceFindFirst: vi.fn(),
  developerFindFirst: vi.fn(),
  developerCount: vi.fn(),
  organizationFindUnique: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    device: { findFirst: mocks.deviceFindFirst },
    developer: {
      findFirst: mocks.developerFindFirst,
      count: mocks.developerCount,
    },
    organization: { findUnique: mocks.organizationFindUnique },
  },
}));

vi.mock("@/lib/rbac/permissions", () => ({ canManageSettings: vi.fn(() => false) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deviceFindFirst.mockResolvedValue(null);
  mocks.developerFindFirst.mockResolvedValue(null);
  mocks.developerCount.mockResolvedValue(1);
  mocks.organizationFindUnique.mockResolvedValue({
    plan: "community",
    subscriptionStatus: null,
    currentPeriodEnd: null,
  });
});

test("rejects a second active device for the same user", async () => {
  mocks.deviceFindFirst.mockResolvedValue({ id: "device_1" });
  const { assertCanEnrollDevice } = await import("@/lib/saas-billing/status");

  assert.deepEqual(await assertCanEnrollDevice("org_1", "developer_1"), {
    allowed: false,
    message: "This user already has a device enrolled.",
  });
  assert.deepEqual(mocks.deviceFindFirst.mock.calls[0][0].where, {
    orgId: "org_1",
    userId: "developer_1",
    decommissionedAt: null,
  });
});

test("counts the Community limit by active users", async () => {
  mocks.developerCount.mockResolvedValue(5);
  const { assertCanAddUser } = await import("@/lib/saas-billing/status");

  assert.deepEqual(
    await assertCanAddUser("org_1", { userId: "user_11", email: "new@example.com" }),
    { allowed: false, message: "User limit reached (5). Upgrade to Team to add more users." },
  );
});

test("does not consume another user slot for an existing active member", async () => {
  mocks.developerFindFirst.mockResolvedValue({ id: "developer_1" });
  mocks.developerCount.mockResolvedValue(10);
  const { assertCanAddUser } = await import("@/lib/saas-billing/status");

  assert.deepEqual(
    await assertCanAddUser("org_1", { userId: "user_1", email: "member@example.com" }),
    { allowed: true },
  );
  assert.equal(mocks.developerCount.mock.calls.length, 0);
});
