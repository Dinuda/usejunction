import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  audit: vi.fn(),
  teamInviteLinkFindUnique: vi.fn(),
  teamInviteLinkUpdate: vi.fn(),
  teamInviteLinkCreate: vi.fn(),
  teamInviteAllowlistUpsert: vi.fn(),
  teamInviteAllowlistDeleteMany: vi.fn(),
  teamInviteAllowlistFindMany: vi.fn(),
  organizationInviteFindFirst: vi.fn(),
  organizationInviteCreate: vi.fn(),
  organizationInviteDeleteMany: vi.fn(),
  developerFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  organizationFindUnique: vi.fn(),
  sendTeamInviteEmail: vi.fn(),
  notifyTeamSeatsAdded: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireOrgRole: mocks.requireOrgRole,
  audit: mocks.audit,
  rolesFor: () => ["owner", "admin"],
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    teamInviteLink: {
      findUnique: mocks.teamInviteLinkFindUnique,
      update: mocks.teamInviteLinkUpdate,
      create: mocks.teamInviteLinkCreate,
    },
    teamInviteAllowlist: {
      upsert: mocks.teamInviteAllowlistUpsert,
      deleteMany: mocks.teamInviteAllowlistDeleteMany,
      findMany: mocks.teamInviteAllowlistFindMany,
    },
    organizationInvite: {
      findFirst: mocks.organizationInviteFindFirst,
      create: mocks.organizationInviteCreate,
      deleteMany: mocks.organizationInviteDeleteMany,
    },
    developer: { findUnique: mocks.developerFindUnique },
    user: { findUnique: mocks.userFindUnique },
    organization: { findUnique: mocks.organizationFindUnique },
  },
}));

vi.mock("@/lib/auth-actions", () => ({
  sendTeamInviteEmail: mocks.sendTeamInviteEmail,
}));

vi.mock("@/lib/notifications/slack", () => ({
  notifyTeamSeatsAdded: mocks.notifyTeamSeatsAdded,
}));

vi.mock("@/lib/connect-command", () => ({
  getPublicAppUrl: () => "https://usejunction.dev",
  buildTeamInviteLinkUrl: (token: string, base: string) => `${base}/i/${token}`,
}));

vi.mock("@/lib/errors/public", () => ({
  logServerError: vi.fn(),
}));

const link = {
  id: "link_1",
  orgId: "org_1",
  enabled: true,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
  rotatedAt: new Date(),
  createdAt: new Date(),
  tokenReveal: "uj_team_testtoken",
  allowlist: [] as { email: string; createdAt: Date }[],
};

function putRequest(body: unknown) {
  return new NextRequest("https://usejunction.dev/api/team/invite-link", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(email: string) {
  return new NextRequest(
    `https://usejunction.dev/api/team/invite-link?email=${encodeURIComponent(email)}`,
    { method: "DELETE" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.requireOrgRole.mockResolvedValue({
    orgId: "org_1",
    userId: "user_1",
    email: "owner@example.com",
  });
  mocks.audit.mockResolvedValue(undefined);
  mocks.teamInviteLinkFindUnique.mockResolvedValue(link);
  mocks.organizationFindUnique.mockResolvedValue({ name: "Acme" });
  mocks.userFindUnique.mockResolvedValue({ name: "Owner", email: "owner@example.com" });
  mocks.developerFindUnique.mockResolvedValue(null);
  mocks.organizationInviteFindFirst.mockResolvedValue(null);
  mocks.organizationInviteCreate.mockResolvedValue({ id: "invite_1" });
  mocks.sendTeamInviteEmail.mockResolvedValue(undefined);
  mocks.notifyTeamSeatsAdded.mockResolvedValue(undefined);
  mocks.teamInviteAllowlistUpsert.mockImplementation(async ({ create }: { create: { email: string } }) => ({
    email: create.email,
    createdAt: new Date(),
  }));
  mocks.teamInviteAllowlistDeleteMany.mockResolvedValue({ count: 1 });
  mocks.teamInviteAllowlistFindMany.mockResolvedValue([]);
  mocks.organizationInviteDeleteMany.mockResolvedValue({ count: 1 });
});

test("PUT clears allowlist rows for invited emails after processing", async () => {
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com", "bob@acme.com"], sendEmail: false }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.allowlist, []);
  assert.equal(mocks.teamInviteAllowlistDeleteMany.mock.calls.length, 1);
  assert.deepEqual(mocks.teamInviteAllowlistDeleteMany.mock.calls[0][0], {
    where: { linkId: "link_1", email: { in: ["alice@acme.com", "bob@acme.com"] } },
  });
  assert.equal(mocks.organizationInviteCreate.mock.calls.length, 2);
});

test("DELETE removes allowlist entry and revokes pending OrganizationInvite", async () => {
  const { DELETE } = await import("../app/api/team/invite-link/route");
  const response = await DELETE(deleteRequest("alice@acme.com"));

  assert.equal(response.status, 200);
  assert.deepEqual(mocks.teamInviteAllowlistDeleteMany.mock.calls[0][0], {
    where: { linkId: "link_1", email: "alice@acme.com" },
  });
  assert.deepEqual(mocks.organizationInviteDeleteMany.mock.calls[0][0], {
    where: {
      orgId: "org_1",
      email: "alice@acme.com",
      acceptedAt: null,
    },
  });
});

test("DELETE revoke filter only targets unaccepted invites", async () => {
  const { DELETE } = await import("../app/api/team/invite-link/route");
  await DELETE(deleteRequest("alice@acme.com"));

  const where = mocks.organizationInviteDeleteMany.mock.calls[0][0].where;
  assert.equal(where.acceptedAt, null);
  assert.equal(where.orgId, "org_1");
  assert.equal(where.email, "alice@acme.com");
});
