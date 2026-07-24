import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  membershipUpsert: vi.fn(),
  linkDeveloperToUser: vi.fn(),
  syncTeamSeatQuantityBestEffort: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    organizationMembership: { upsert: mocks.membershipUpsert },
  },
}));

vi.mock("@/lib/developer-identity", () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  linkDeveloperToUser: mocks.linkDeveloperToUser,
}));

vi.mock("@/lib/saas-billing/quantity", () => ({
  syncTeamSeatQuantityBestEffort: mocks.syncTeamSeatQuantityBestEffort,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.membershipUpsert.mockResolvedValue({ id: "mem_1" });
  mocks.linkDeveloperToUser.mockResolvedValue({ id: "dev_1" });
  mocks.syncTeamSeatQuantityBestEffort.mockResolvedValue(null);
});

test("acceptWorkspaceInvite upserts membership, links developer, and syncs seats", async () => {
  const { acceptWorkspaceInvite } = await import("../lib/workspace-join");
  const result = await acceptWorkspaceInvite({
    orgId: "org_1",
    userId: "user_1",
    email: "Alice@Acme.com",
    name: "Alice",
    role: "admin",
    source: "invite.accepted",
  });

  assert.deepEqual(result, { developerId: "dev_1" });
  assert.deepEqual(mocks.membershipUpsert.mock.calls[0][0], {
    where: { userId_orgId: { userId: "user_1", orgId: "org_1" } },
    update: { role: "admin" },
    create: { userId: "user_1", orgId: "org_1", role: "admin" },
  });
  assert.equal(mocks.linkDeveloperToUser.mock.calls[0][0].email, "alice@acme.com");
  assert.equal(mocks.linkDeveloperToUser.mock.calls[0][0].role, "admin");
  assert.deepEqual(mocks.syncTeamSeatQuantityBestEffort.mock.calls[0], ["org_1", "invite.accepted"]);
});

test("acceptWorkspaceInvite uses provided transaction client", async () => {
  const tx = {
    organizationMembership: { upsert: vi.fn().mockResolvedValue({ id: "mem_tx" }) },
  };
  mocks.linkDeveloperToUser.mockResolvedValue({ id: "dev_tx" });

  const { acceptWorkspaceInvite } = await import("../lib/workspace-join");
  const result = await acceptWorkspaceInvite({
    tx: tx as never,
    orgId: "org_1",
    userId: "user_1",
    email: "bob@acme.com",
    role: "user",
  });

  assert.deepEqual(result, { developerId: "dev_tx" });
  assert.equal(tx.organizationMembership.upsert.mock.calls.length, 1);
  assert.equal(mocks.membershipUpsert.mock.calls.length, 0);
  assert.equal(mocks.linkDeveloperToUser.mock.calls[0][0].tx, tx);
  assert.deepEqual(mocks.syncTeamSeatQuantityBestEffort.mock.calls[0], ["org_1", "workspace.joined"]);
});
