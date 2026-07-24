import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  hasVerifiedIdentity: vi.fn(),
  getIdentityVerificationStatus: vi.fn(),
  assertCanAddUser: vi.fn(),
  acceptWorkspaceInvite: vi.fn(),
  audit: vi.fn(),
  teamInviteLinkFindUnique: vi.fn(),
  organizationInviteFindFirst: vi.fn(),
  organizationInviteUpdate: vi.fn(),
  organizationMembershipFindUnique: vi.fn(),
  developerFindUniqueOrThrow: vi.fn(),
  transaction: vi.fn(),
  issueEnrollmentToken: vi.fn(),
  hashOpaqueToken: vi.fn((token: string) => `hash:${token}`),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/developer-identity", () => ({
  hasVerifiedIdentity: mocks.hasVerifiedIdentity,
  getIdentityVerificationStatus: mocks.getIdentityVerificationStatus,
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

vi.mock("@/lib/saas-billing/status", () => ({
  assertCanAddUser: mocks.assertCanAddUser,
}));

vi.mock("@/lib/workspace-join", () => ({
  acceptWorkspaceInvite: mocks.acceptWorkspaceInvite,
}));

vi.mock("@/lib/rbac", () => ({
  audit: mocks.audit,
}));

vi.mock("@/lib/security", () => ({
  hashOpaqueToken: mocks.hashOpaqueToken,
}));

vi.mock("@/lib/enrollment-token", () => ({
  issueEnrollmentToken: mocks.issueEnrollmentToken,
}));

vi.mock("@/lib/connect-command", () => ({
  getPublicAppUrl: () => "https://usejunction.dev",
  buildInstallCommand: (token: string) => `install ${token}`,
  buildPlatformInstallCommands: (token: string) => ({ macos: `install ${token}` }),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    teamInviteLink: { findUnique: mocks.teamInviteLinkFindUnique },
    organizationInvite: {
      findFirst: mocks.organizationInviteFindFirst,
      update: mocks.organizationInviteUpdate,
    },
    organizationMembership: { findUnique: mocks.organizationMembershipFindUnique },
    developer: { findUniqueOrThrow: mocks.developerFindUniqueOrThrow },
    $transaction: mocks.transaction,
  },
}));

const link = {
  id: "link_1",
  orgId: "org_1",
  enabled: true,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
  organization: { name: "Acme" },
};

function postParams(token = "uj_team_tok") {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.auth.mockResolvedValue({
    user: { id: "user_1", email: "alice@acme.com", name: "Alice" },
  });
  mocks.hasVerifiedIdentity.mockResolvedValue(true);
  mocks.getIdentityVerificationStatus.mockResolvedValue({ verified: true });
  mocks.assertCanAddUser.mockResolvedValue({ allowed: true });
  mocks.teamInviteLinkFindUnique.mockResolvedValue(link);
  mocks.organizationInviteFindFirst.mockResolvedValue(null);
  mocks.organizationMembershipFindUnique.mockResolvedValue(null);
  mocks.acceptWorkspaceInvite.mockResolvedValue({ developerId: "dev_1" });
  mocks.developerFindUniqueOrThrow.mockResolvedValue({ id: "dev_1" });
  mocks.audit.mockResolvedValue(undefined);
  mocks.issueEnrollmentToken.mockResolvedValue({
    id: "enroll_1",
    token: "uj_enroll_test",
    expiresAt: new Date("2026-07-24T19:00:00.000Z"),
  });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      organizationInvite: { update: mocks.organizationInviteUpdate },
    }),
  );
});

test("POST redeems team invite link via acceptWorkspaceInvite", async () => {
  const { POST } = await import("../app/api/i/[token]/redeem/route");
  const response = await POST(new NextRequest("https://usejunction.dev/api/i/uj_team_tok/redeem"), postParams());

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ready");
  assert.equal(body.orgId, "org_1");
  assert.equal(body.developerId, "dev_1");
  assert.equal(body.role, "user");
  assert.equal(body.enrollmentToken, "uj_enroll_test");
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls.length, 1);
  assert.deepEqual(
    {
      orgId: mocks.acceptWorkspaceInvite.mock.calls[0][0].orgId,
      userId: mocks.acceptWorkspaceInvite.mock.calls[0][0].userId,
      email: mocks.acceptWorkspaceInvite.mock.calls[0][0].email,
      role: mocks.acceptWorkspaceInvite.mock.calls[0][0].role,
      source: mocks.acceptWorkspaceInvite.mock.calls[0][0].source,
    },
    {
      orgId: "org_1",
      userId: "user_1",
      email: "alice@acme.com",
      role: "user",
      source: "team_invite_link.redeemed",
    },
  );
  assert.equal(mocks.issueEnrollmentToken.mock.calls.length, 1);
  assert.deepEqual(mocks.issueEnrollmentToken.mock.calls[0][0], {
    orgId: "org_1",
    developerId: "dev_1",
    rotate: false,
  });
});

test("POST returns the same enrollment token on repeated redeem", async () => {
  const { POST } = await import("../app/api/i/[token]/redeem/route");
  const request = new NextRequest("https://usejunction.dev/api/i/uj_team_tok/redeem");
  const params = postParams();

  const first = await POST(request, params);
  const second = await POST(request, params);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.enrollmentToken, "uj_enroll_test");
  assert.equal(secondBody.enrollmentToken, "uj_enroll_test");
  assert.equal(mocks.issueEnrollmentToken.mock.calls.length, 2);
  assert.deepEqual(mocks.issueEnrollmentToken.mock.calls[1][0], {
    orgId: "org_1",
    developerId: "dev_1",
    rotate: false,
  });
});

test("POST uses pending OrganizationInvite role when present", async () => {
  mocks.organizationInviteFindFirst.mockResolvedValue({
    id: "invite_1",
    role: "admin",
  });
  const { POST } = await import("../app/api/i/[token]/redeem/route");
  const response = await POST(new NextRequest("https://usejunction.dev/api/i/uj_team_tok/redeem"), postParams());

  assert.equal(response.status, 200);
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls[0][0].role, "admin");
  assert.equal(mocks.organizationInviteUpdate.mock.calls.length, 1);
  assert.deepEqual(mocks.organizationInviteUpdate.mock.calls[0][0].where, { id: "invite_1" });
});

test("POST preserves existing membership role when no pending invite", async () => {
  mocks.organizationMembershipFindUnique.mockResolvedValue({ role: "owner" });
  const { POST } = await import("../app/api/i/[token]/redeem/route");
  await POST(new NextRequest("https://usejunction.dev/api/i/uj_team_tok/redeem"), postParams());
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls[0][0].role, "owner");
});

test("POST rejects missing invite link", async () => {
  mocks.teamInviteLinkFindUnique.mockResolvedValue(null);
  const { POST } = await import("../app/api/i/[token]/redeem/route");
  const response = await POST(new NextRequest("https://usejunction.dev/api/i/missing/redeem"), postParams("missing"));
  assert.equal(response.status, 404);
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls.length, 0);
});
