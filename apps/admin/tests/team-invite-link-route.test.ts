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
  organizationInviteFindMany: vi.fn(),
  organizationInviteCreate: vi.fn(),
  organizationInviteUpdate: vi.fn(),
  organizationInviteDeleteMany: vi.fn(),
  developerFindUnique: vi.fn(),
  developerCount: vi.fn(),
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
      findMany: mocks.organizationInviteFindMany,
      create: mocks.organizationInviteCreate,
      update: mocks.organizationInviteUpdate,
      deleteMany: mocks.organizationInviteDeleteMany,
    },
    developer: {
      findUnique: mocks.developerFindUnique,
      count: mocks.developerCount,
    },
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
    role: "owner",
  });
  mocks.audit.mockResolvedValue(undefined);
  mocks.teamInviteLinkFindUnique.mockResolvedValue(link);
  mocks.organizationFindUnique.mockResolvedValue({
    name: "Acme",
    plan: "community",
    subscriptionStatus: null,
    currentPeriodEnd: null,
  });
  mocks.developerCount.mockResolvedValue(1);
  mocks.userFindUnique.mockResolvedValue({ name: "Owner", email: "owner@example.com" });
  mocks.developerFindUnique.mockResolvedValue(null);
  mocks.organizationInviteFindFirst.mockResolvedValue(null);
  mocks.organizationInviteFindMany.mockResolvedValue([]);
  mocks.organizationInviteCreate.mockResolvedValue({ id: "invite_1" });
  mocks.organizationInviteUpdate.mockResolvedValue({ id: "invite_1" });
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

test("PUT email send records pending OrganizationInvite for Invited tab", async () => {
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com"], sendEmail: true }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.emailResults, [{ email: "alice@acme.com", status: "sent" }]);
  assert.equal(mocks.sendTeamInviteEmail.mock.calls.length, 1);
  assert.equal(mocks.sendTeamInviteEmail.mock.calls[0][0].to, "alice@acme.com");
  assert.equal(mocks.organizationInviteCreate.mock.calls.length, 1);
  assert.equal(mocks.organizationInviteCreate.mock.calls[0][0].data.email, "alice@acme.com");
  assert.equal(mocks.organizationInviteCreate.mock.calls[0][0].data.orgId, "org_1");
  assert.equal(mocks.organizationInviteFindFirst.mock.calls.length, 1);
  assert.equal(mocks.developerFindUnique.mock.calls.length, 1);
});

test("PUT refreshes expiry when a pending invite already exists", async () => {
  mocks.organizationInviteFindFirst.mockResolvedValue({ id: "invite_existing" });
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com"], sendEmail: false }),
  );

  assert.equal(response.status, 200);
  assert.equal(mocks.organizationInviteCreate.mock.calls.length, 0);
  assert.equal(mocks.organizationInviteUpdate.mock.calls.length, 1);
  assert.equal(mocks.organizationInviteUpdate.mock.calls[0][0].where.id, "invite_existing");
});

test("PUT skips pending invite when email is already an active member", async () => {
  mocks.developerFindUnique.mockResolvedValue({ id: "dev_1", removedAt: null });
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com"], sendEmail: false }),
  );

  assert.equal(response.status, 200);
  assert.equal(mocks.organizationInviteCreate.mock.calls.length, 0);
  assert.equal(mocks.organizationInviteUpdate.mock.calls.length, 0);
  assert.equal(mocks.organizationInviteFindFirst.mock.calls.length, 0);
});

test("PUT records invite with requested assignable role", async () => {
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com"], sendEmail: false, role: "manager" }),
  );

  assert.equal(response.status, 200);
  assert.equal(mocks.organizationInviteCreate.mock.calls[0][0].data.role, "manager");
});

test("PUT rejects elevated roles for managers", async () => {
  mocks.requireOrgRole.mockResolvedValue({
    orgId: "org_1",
    userId: "user_2",
    email: "manager@example.com",
    role: "manager",
  });
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com"], sendEmail: false, role: "admin" }),
  );

  assert.equal(response.status, 403);
  assert.equal(mocks.organizationInviteCreate.mock.calls.length, 0);
});

test("PATCH updates pending invite role", async () => {
  mocks.organizationInviteFindFirst.mockResolvedValue({
    id: "invite_1",
    email: "alice@acme.com",
    role: "user",
  });
  mocks.organizationInviteUpdate.mockResolvedValue({
    id: "invite_1",
    email: "alice@acme.com",
    role: "admin",
  });
  const { PATCH } = await import("../app/api/team/invite-link/route");
  const response = await PATCH(
    new NextRequest("https://usejunction.dev/api/team/invite-link", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@acme.com", role: "admin" }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.role, "admin");
  assert.equal(mocks.organizationInviteUpdate.mock.calls[0][0].data.role, "admin");
  assert.equal(mocks.audit.mock.calls[0][0].action, "invite.role_updated");
});

test("PATCH resend mints a new token for expired invites", async () => {
  mocks.organizationInviteFindMany.mockResolvedValue([
    {
      id: "invite_expired",
      email: "alice@acme.com",
      expiresAt: new Date(Date.now() - 60_000),
    },
  ]);
  const { PATCH } = await import("../app/api/team/invite-link/route");
  const response = await PATCH(
    new NextRequest("https://usejunction.dev/api/team/invite-link", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@acme.com" }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.emailResults, [{ email: "alice@acme.com", status: "sent" }]);
  assert.equal(typeof body.expiresAt, "string");
  assert.equal(mocks.organizationInviteUpdate.mock.calls.length, 1);
  const update = mocks.organizationInviteUpdate.mock.calls[0][0];
  assert.equal(update.where.id, "invite_expired");
  assert.equal(typeof update.data.tokenHash, "string");
  assert.ok(update.data.expiresAt instanceof Date);
  assert.ok(update.data.expiresAt.getTime() > Date.now());
  assert.equal(mocks.sendTeamInviteEmail.mock.calls.length, 1);
  assert.equal(mocks.sendTeamInviteEmail.mock.calls[0][0].to, "alice@acme.com");
});

test("PATCH resend does not remint token for active invites", async () => {
  mocks.organizationInviteFindMany.mockResolvedValue([
    {
      id: "invite_active",
      email: "alice@acme.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    },
  ]);
  const { PATCH } = await import("../app/api/team/invite-link/route");
  const response = await PATCH(
    new NextRequest("https://usejunction.dev/api/team/invite-link", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@acme.com" }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.emailResults, [{ email: "alice@acme.com", status: "sent" }]);
  assert.equal(mocks.organizationInviteUpdate.mock.calls.length, 0);
  assert.equal(mocks.sendTeamInviteEmail.mock.calls.length, 1);
});

test("PUT rejects invites when Community user limit is reached", async () => {
  mocks.developerCount.mockResolvedValue(5);
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com"], sendEmail: false }),
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "User limit reached (5). Upgrade to Team to add more users.");
  assert.equal(mocks.organizationInviteCreate.mock.calls.length, 0);
});

test("PUT allows invites on Team plan even above Community cap", async () => {
  mocks.organizationFindUnique.mockResolvedValue({
    name: "Acme",
    plan: "team",
    subscriptionStatus: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60_000),
  });
  mocks.developerCount.mockResolvedValue(6);
  const { PUT } = await import("../app/api/team/invite-link/route");
  const response = await PUT(
    putRequest({ emails: ["alice@acme.com"], sendEmail: false }),
  );

  assert.equal(response.status, 200);
  assert.equal(mocks.organizationInviteCreate.mock.calls.length, 1);
});

test("PATCH resend rejects when Community user limit is reached", async () => {
  mocks.developerCount.mockResolvedValue(5);
  mocks.organizationInviteFindMany.mockResolvedValue([
    {
      id: "invite_active",
      email: "alice@acme.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    },
  ]);
  const { PATCH } = await import("../app/api/team/invite-link/route");
  const response = await PATCH(
    new NextRequest("https://usejunction.dev/api/team/invite-link", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@acme.com" }),
    }),
  );

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "User limit reached (5). Upgrade to Team to add more users.");
  assert.equal(mocks.sendTeamInviteEmail.mock.calls.length, 0);
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
