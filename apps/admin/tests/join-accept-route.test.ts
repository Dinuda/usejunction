import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  hasVerifiedIdentity: vi.fn(),
  assertCanAddUser: vi.fn(),
  acceptWorkspaceInvite: vi.fn(),
  audit: vi.fn(),
  organizationInviteFindUnique: vi.fn(),
  organizationInviteUpdate: vi.fn(),
  transaction: vi.fn(),
  hashOpaqueToken: vi.fn((token: string) => `hash:${token}`),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/developer-identity", () => ({
  hasVerifiedIdentity: mocks.hasVerifiedIdentity,
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

vi.mock("@usejunction/db", () => ({
  prisma: {
    organizationInvite: {
      findUnique: mocks.organizationInviteFindUnique,
      update: mocks.organizationInviteUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

const invite = {
  id: "invite_1",
  orgId: "org_1",
  email: "alice@acme.com",
  role: "admin",
  acceptedAt: null as Date | null,
  expiresAt: new Date(Date.now() + 60_000),
  organization: { name: "Acme", slug: "acme" },
};

function postParams(token = "tok_1") {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.auth.mockResolvedValue({
    user: { id: "user_1", email: "alice@acme.com", name: "Alice" },
  });
  mocks.hasVerifiedIdentity.mockResolvedValue(true);
  mocks.assertCanAddUser.mockResolvedValue({ allowed: true });
  mocks.organizationInviteFindUnique.mockResolvedValue(invite);
  mocks.acceptWorkspaceInvite.mockResolvedValue({ developerId: "dev_1" });
  mocks.organizationInviteUpdate.mockResolvedValue({ ...invite, acceptedAt: new Date() });
  mocks.audit.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      organizationInvite: { update: mocks.organizationInviteUpdate },
    }),
  );
});

test("POST accepts a valid invite via acceptWorkspaceInvite", async () => {
  const { POST } = await import("../app/api/join/[token]/accept/route");
  const response = await POST(new NextRequest("https://usejunction.dev/api/join/tok_1/accept"), postParams());

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { orgId: "org_1", developerId: "dev_1", role: "admin" });
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls.length, 1);
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls[0][0].orgId, "org_1");
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls[0][0].userId, "user_1");
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls[0][0].email, "alice@acme.com");
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls[0][0].role, "admin");
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls[0][0].source, "invite.accepted");
  assert.equal(mocks.organizationInviteUpdate.mock.calls.length, 1);
  assert.equal(mocks.audit.mock.calls[0][0].action, "invite.accepted");
});

test("POST rejects unauthenticated requests", async () => {
  mocks.auth.mockResolvedValue(null);
  const { POST } = await import("../app/api/join/[token]/accept/route");
  const response = await POST(new NextRequest("https://usejunction.dev/api/join/tok_1/accept"), postParams());
  assert.equal(response.status, 401);
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls.length, 0);
});

test("POST rejects email mismatch", async () => {
  mocks.auth.mockResolvedValue({
    user: { id: "user_1", email: "other@acme.com", name: "Other" },
  });
  const { POST } = await import("../app/api/join/[token]/accept/route");
  const response = await POST(new NextRequest("https://usejunction.dev/api/join/tok_1/accept"), postParams());
  assert.equal(response.status, 403);
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls.length, 0);
});

test("POST rejects expired invites", async () => {
  mocks.organizationInviteFindUnique.mockResolvedValue({
    ...invite,
    expiresAt: new Date(Date.now() - 60_000),
  });
  const { POST } = await import("../app/api/join/[token]/accept/route");
  const response = await POST(new NextRequest("https://usejunction.dev/api/join/tok_1/accept"), postParams());
  assert.equal(response.status, 410);
  assert.equal(mocks.acceptWorkspaceInvite.mock.calls.length, 0);
});
