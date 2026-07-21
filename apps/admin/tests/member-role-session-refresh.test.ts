import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  requireOrgRole: vi.fn(),
  audit: vi.fn(),
  developerFindFirst: vi.fn(),
  membershipFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/auth", () => ({
  updateSession: mocks.updateSession,
}));

vi.mock("@/lib/rbac", async () => {
  const permissions = await import("@/lib/rbac/permissions");
  return {
    ...permissions,
    requireOrgRole: mocks.requireOrgRole,
    audit: mocks.audit,
    rolesFor: permissions.rolesFor,
  };
});

vi.mock("@usejunction/db", () => ({
  prisma: {
    developer: { findFirst: mocks.developerFindFirst },
    organizationMembership: { findUnique: mocks.membershipFindUnique },
    $transaction: mocks.transaction,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgRole.mockResolvedValue({
    email: "admin@example.test",
    userId: "user-1",
    orgId: "org-1",
    role: "admin",
  });
  mocks.audit.mockResolvedValue(undefined);
  mocks.updateSession.mockResolvedValue({ user: { orgId: "org-1", role: "manager" } });
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      developer: { update: vi.fn() },
      organizationMembership: { updateMany: vi.fn() },
    }),
  );
});

describe("PATCH /api/developers/[id]/role", () => {
  it("refreshes JWT claims when the actor updates their own membership role", async () => {
    mocks.developerFindFirst.mockResolvedValue({
      id: "dev-1",
      role: "admin",
      authUserId: "user-1",
      email: "admin@example.test",
    });
    mocks.membershipFindUnique.mockResolvedValue({ role: "admin" });

    const { PATCH } = await import("@/app/api/developers/[id]/role/route");
    const response = await PATCH(
      new NextRequest("https://usejunction.dev/api/developers/dev-1/role", {
        method: "PATCH",
        body: JSON.stringify({ role: "manager" }),
      }),
      { params: Promise.resolve({ id: "dev-1" }) },
    );

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
    expect(mocks.updateSession).toHaveBeenCalledWith({ user: { orgId: "org-1" } });
  });

  it("does not refresh JWT when updating a different member", async () => {
    mocks.developerFindFirst.mockResolvedValue({
      id: "dev-2",
      role: "user",
      authUserId: "user-2",
      email: "member@example.test",
    });
    mocks.membershipFindUnique.mockResolvedValue({ role: "user" });

    const { PATCH } = await import("@/app/api/developers/[id]/role/route");
    const response = await PATCH(
      new NextRequest("https://usejunction.dev/api/developers/dev-2/role", {
        method: "PATCH",
        body: JSON.stringify({ role: "manager" }),
      }),
      { params: Promise.resolve({ id: "dev-2" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });
});
