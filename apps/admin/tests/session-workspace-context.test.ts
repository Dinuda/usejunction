import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  updateSession: vi.fn(),
  membershipFindFirst: vi.fn(),
  membershipFindUnique: vi.fn(),
  membershipFindMany: vi.fn(),
  deviceAggregate: vi.fn(),
  toolInstallationCount: vi.fn(),
  legacyOrgId: null as string | null,
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
  updateSession: mocks.updateSession,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => name === "uj_active_org" && mocks.legacyOrgId
      ? { value: mocks.legacyOrgId }
      : undefined,
  })),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    organizationMembership: {
      findFirst: mocks.membershipFindFirst,
      findUnique: mocks.membershipFindUnique,
      findMany: mocks.membershipFindMany,
    },
    device: {
      aggregate: mocks.deviceAggregate,
    },
    toolInstallation: {
      count: mocks.toolInstallationCount,
    },
    analyticsDirtyDay: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    orgUsageDaySnapshot: {
      findMany: vi.fn(async () => []),
    },
    usageDaily: {
      findMany: vi.fn(async () => []),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.legacyOrgId = null;
  mocks.deviceAggregate.mockResolvedValue({
    _count: { id: 0 },
    _max: { lastSeenAt: null, lastUsageSyncAt: null, lastAccountSyncAt: null },
  });
  mocks.toolInstallationCount.mockResolvedValue(0);
  mocks.auth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "user@example.test",
      name: "Test User",
      orgId: "org-1",
      role: "owner",
    },
  });
});

describe("Auth.js workspace session callbacks", () => {
  it("performs no database read during an ordinary JWT decode", async () => {
    const { applyWorkspaceJwtClaims } = await import("@/lib/auth/session-callbacks");
    const token = await applyWorkspaceJwtClaims({
      token: { userId: "user-1", orgId: "org-1", role: "owner" },
    });

    expect(token.orgId).toBe("org-1");
    expect(mocks.membershipFindFirst).not.toHaveBeenCalled();
    expect(mocks.membershipFindUnique).not.toHaveBeenCalled();
  });

  it("resolves an OAuth user's initial workspace only during sign-in", async () => {
    mocks.membershipFindFirst.mockResolvedValue({ orgId: "org-2", role: "user" });
    const { applyWorkspaceJwtClaims } = await import("@/lib/auth/session-callbacks");
    const token = await applyWorkspaceJwtClaims({
      token: {},
      user: { id: "user-1", email: "user@example.test" },
      trigger: "signIn",
    });

    expect(token).toMatchObject({ userId: "user-1", orgId: "org-2", role: "user" });
    expect(mocks.membershipFindFirst).toHaveBeenCalledTimes(1);
  });

  it("uses a current membership role during an explicit workspace update", async () => {
    mocks.membershipFindUnique.mockResolvedValue({ orgId: "org-2", role: "manager" });
    const { applyWorkspaceJwtClaims } = await import("@/lib/auth/session-callbacks");
    const token = await applyWorkspaceJwtClaims({
      token: { userId: "user-1", orgId: "org-1", role: "owner" },
      trigger: "update",
      session: { user: { orgId: "org-2", role: "owner" } },
    });

    expect(token).toMatchObject({ orgId: "org-2", role: "manager" });
    expect(mocks.membershipFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_orgId: { userId: "user-1", orgId: "org-2" } },
    }));
  });
});

describe("workspace context API", () => {
  const org = (id: string, name: string) => ({
    orgId: id,
    role: id === "org-1" ? "owner" : "user",
    onboardingCompletedAt: new Date("2026-01-01T00:00:00.000Z"),
    organization: {
      id,
      name,
      color: null,
      plan: "community",
      subscriptionStatus: null,
      currentPeriodEnd: null,
      lemonSqueezyCustomerId: null,
      lemonSqueezySubscriptionId: null,
      lemonSqueezyQuantity: null,
      _count: { developers: 2 },
    },
  });

  it("loads memberships and billing facts with one Prisma query", async () => {
    mocks.membershipFindMany.mockResolvedValue([org("org-1", "One"), org("org-2", "Two")]);
    const { GET } = await import("@/app/api/app/workspace-context/route");
    const response = await GET(new NextRequest("https://usejunction.dev/api/app/workspace-context"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.membershipFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.membershipFindUnique).not.toHaveBeenCalled();
    expect(payload.data.current).toMatchObject({ id: "org-1", role: "owner" });
    expect(payload.data.billing.usersUsed).toBe(2);
    expect(payload.data.sessionWorkspaceSyncRequired).toBe(false);
    expect(payload.data.sync).toMatchObject({
      deviceCount: 0,
      toolCount: 0,
      watermark: "0|0||||0|1",
      dashboardReady: true,
      dirtyDayCount: 0,
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("server-timing")).toContain("membership");
  });

  it("exposes a sync watermark from device and tool facts", async () => {
    mocks.membershipFindMany.mockResolvedValue([org("org-1", "One")]);
    mocks.deviceAggregate.mockResolvedValue({
      _count: { id: 1 },
      _max: {
        lastSeenAt: new Date("2026-07-21T12:00:00.000Z"),
        lastUsageSyncAt: new Date("2026-07-21T12:05:00.000Z"),
        lastAccountSyncAt: null,
      },
    });
    mocks.toolInstallationCount.mockResolvedValue(3);
    const { GET } = await import("@/app/api/app/workspace-context/route");
    const response = await GET(new NextRequest("https://usejunction.dev/api/app/workspace-context"));
    const payload = await response.json();

    expect(payload.data.sync).toEqual({
      deviceCount: 1,
      toolCount: 3,
      lastSeenAt: "2026-07-21T12:00:00.000Z",
      lastUsageSyncAt: "2026-07-21T12:05:00.000Z",
      lastAccountSyncAt: null,
      watermark: "1|3|2026-07-21T12:00:00.000Z|2026-07-21T12:05:00.000Z||0|1",
      dashboardReady: true,
      dirtyDayCount: 0,
      snapshotLagSeconds: null,
    });
  });

  it("never selects a tampered legacy cookie outside the user's memberships", async () => {
    mocks.legacyOrgId = "org-attacker";
    mocks.membershipFindMany.mockResolvedValue([org("org-1", "One")]);
    const { GET } = await import("@/app/api/app/workspace-context/route");
    const response = await GET(new NextRequest("https://usejunction.dev/api/app/workspace-context"));
    const payload = await response.json();

    expect(payload.data.current.id).toBe("org-1");
    expect(payload.data.sessionWorkspaceSyncRequired).toBe(true);
  });
});

describe("workspace session mutation", () => {
  it("rejects a cross-organization identifier without updating the JWT", async () => {
    mocks.membershipFindUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/me/workspace/route");
    const response = await POST(new NextRequest("https://usejunction.dev/api/me/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId: "org-attacker" }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("updates the signed session only after membership validation", async () => {
    mocks.membershipFindUnique.mockResolvedValue({
      orgId: "org-2",
      role: "manager",
      organization: { name: "Two" },
    });
    mocks.updateSession.mockResolvedValue({ user: { orgId: "org-2" } });
    const { POST } = await import("@/app/api/me/workspace/route");
    const response = await POST(new NextRequest("https://usejunction.dev/api/me/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgId: "org-2", role: "owner" }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updateSession).toHaveBeenCalledWith({ user: { orgId: "org-2" } });
    expect(payload).toMatchObject({ orgId: "org-2", role: "manager" });
  });
});
