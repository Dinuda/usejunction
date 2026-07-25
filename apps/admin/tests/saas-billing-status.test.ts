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

test("assertCanInviteUsers rejects at Community cap", async () => {
  mocks.developerCount.mockResolvedValue(5);
  const { assertCanInviteUsers } = await import("@/lib/saas-billing/status");

  assert.deepEqual(await assertCanInviteUsers("org_1"), {
    allowed: false,
    message: "User limit reached (5). Upgrade to Team to add more users.",
  });
});

test("assertCanInviteUsers allows when under Community cap", async () => {
  mocks.developerCount.mockResolvedValue(3);
  const { assertCanInviteUsers } = await import("@/lib/saas-billing/status");

  assert.deepEqual(await assertCanInviteUsers("org_1"), { allowed: true });
});

test("assertCanInviteUsers allows Team plan above Community cap", async () => {
  mocks.organizationFindUnique.mockResolvedValue({
    plan: "team",
    subscriptionStatus: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
  });
  mocks.developerCount.mockResolvedValue(8);
  const { assertCanInviteUsers } = await import("@/lib/saas-billing/status");

  assert.deepEqual(await assertCanInviteUsers("org_1"), { allowed: true });
  assert.equal(mocks.developerCount.mock.calls.length, 0);
});

test("computeOrgBillingStatus flips from Community limit to Team unlimited", async () => {
  const { computeOrgBillingStatus } = await import("@/lib/saas-billing/status");

  const communityFacts = {
    plan: "community",
    subscriptionStatus: null,
    currentPeriodEnd: null,
    lemonSqueezyCustomerId: null,
    lemonSqueezySubscriptionId: null,
    lemonSqueezyQuantity: null,
    usersUsed: 5,
  };

  const community = computeOrgBillingStatus(communityFacts, "owner");
  assert.equal(community.planLabel, "Community");
  assert.equal(community.isAtUserLimit, true);
  assert.equal(community.usersLimit, 5);

  const team = computeOrgBillingStatus(
    {
      ...communityFacts,
      plan: "team",
      subscriptionStatus: "active",
      lemonSqueezyCustomerId: "cust_1",
      lemonSqueezySubscriptionId: "sub_1",
      lemonSqueezyQuantity: 5,
    },
    "owner",
  );
  assert.equal(team.planLabel, "Team");
  assert.equal(team.isAtUserLimit, false);
  assert.equal(team.usersLimit, null);
});
