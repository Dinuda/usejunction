import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  getMeOverview: vi.fn(),
  getLocalSyncContext: vi.fn(),
  resolveLinkedDeveloperId: vi.fn(),
  getOrgOverview: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/tools/subscriptions", () => ({
  listSubscriptions: mocks.listSubscriptions,
}));

vi.mock("@/lib/queries/me/overview", () => ({
  getMeOverview: mocks.getMeOverview,
}));

vi.mock("@/lib/queries/me/local-sync-context", () => ({
  getLocalSyncContext: mocks.getLocalSyncContext,
}));

vi.mock("@/lib/queries/me/resolve-developer", () => ({
  resolveLinkedDeveloperId: mocks.resolveLinkedDeveloperId,
}));

vi.mock("@/lib/insights", () => ({
  getOrgOverview: mocks.getOrgOverview,
  overviewInputFromBounds: vi.fn(),
  overviewInputFromRange: vi.fn((days: number) => ({ rangeDays: days })),
}));

vi.mock("@/lib/errors/public", () => ({
  logServerError: mocks.logServerError,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSubscriptions.mockResolvedValue([]);
  mocks.getMeOverview.mockResolvedValue({
    developer: { id: "dev-1", name: "Ada Lovelace", devices: [{ id: "d1" }] },
    usage30d: { requests: 10 },
  });
  mocks.getLocalSyncContext.mockResolvedValue({
    lastSeenAt: null,
    lastUsageSyncAt: null,
    lastAccountSyncAt: null,
    deviceCount: 1,
    dashboardReady: true,
    dirtyDayCount: 0,
    snapshotLagSeconds: null,
  });
  mocks.resolveLinkedDeveloperId.mockResolvedValue("dev-1");
  mocks.getOrgOverview.mockResolvedValue({ data: { hasActivity: true } });
});

describe("loadDashboardPage personal period window", () => {
  it("passes reportWindow into getMeOverview for owner scope=you with days=14", async () => {
    const { loadDashboardPage } = await import("@/lib/app-pages/dashboard");
    const data = await loadDashboardPage(
      {
        userId: "user-1",
        email: "owner@example.test",
        orgId: "org-1",
        role: "owner",
      },
      { scope: "you", view: "last_30_days", days: "14" },
    );

    expect(data).toMatchObject({
      kind: "personal",
      scope: "you",
      allowPeriodControls: true,
      cycleView: "last_30_days",
      periodLabel: "last 14 days",
    });
    expect(mocks.getMeOverview).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "owner",
      expect.objectContaining({
        reportWindow: expect.any(Object),
        cycleView: "last_30_days",
      }),
    );
    const reportWindow = mocks.getMeOverview.mock.calls[0][3].reportWindow as {
      from: Date;
      to: Date;
    };
    const dayMs = 24 * 60 * 60 * 1000;
    const spanDays = Math.round((reportWindow.to.getTime() - reportWindow.from.getTime()) / dayMs) + 1;
    expect(spanDays).toBe(14);
  });

  it("allows developers to use cycle and rolling period controls", async () => {
    const { loadDashboardPage } = await import("@/lib/app-pages/dashboard");
    const data = await loadDashboardPage(
      {
        userId: "user-2",
        email: "dev@example.test",
        orgId: "org-1",
        role: "user",
      },
      { view: "current_cycles", days: "7" },
    );

    expect(data).toMatchObject({
      kind: "personal",
      allowPeriodControls: true,
      cycleView: "current_cycles",
    });
    expect(mocks.getMeOverview).toHaveBeenCalledWith(
      "org-1",
      "user-2",
      "user",
      expect.objectContaining({
        reportWindow: expect.any(Object),
        cycleView: "current_cycles",
      }),
    );
  });

  it("allows developers to use custom rolling days", async () => {
    const { loadDashboardPage } = await import("@/lib/app-pages/dashboard");
    const data = await loadDashboardPage(
      {
        userId: "user-2",
        email: "dev@example.test",
        orgId: "org-1",
        role: "user",
      },
      { view: "last_30_days", days: "7" },
    );

    expect(data).toMatchObject({
      kind: "personal",
      allowPeriodControls: true,
      periodLabel: "last 7 days",
    });
    const reportWindow = mocks.getMeOverview.mock.calls[0][3].reportWindow as {
      from: Date;
      to: Date;
    };
    const dayMs = 24 * 60 * 60 * 1000;
    const spanDays = Math.round((reportWindow.to.getTime() - reportWindow.from.getTime()) / dayMs) + 1;
    expect(spanDays).toBe(7);
  });
});

describe("loadDashboardPage manager org overview", () => {
  it("loads organization overview for manager with team scope and no audience switcher", async () => {
    const { loadDashboardPage } = await import("@/lib/app-pages/dashboard");
    const data = await loadDashboardPage(
      {
        userId: "user-mgr",
        email: "manager@example.test",
        orgId: "org-1",
        role: "manager",
      },
      { scope: "team" },
    );

    expect(data).toMatchObject({
      kind: "organization",
      scope: "team",
      canSwitchAudience: false,
      error: null,
      overview: { hasActivity: true },
    });
    expect(mocks.getOrgOverview).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-mgr",
        roles: ["manager"],
      }),
      expect.any(Object),
    );
    expect(mocks.getMeOverview).not.toHaveBeenCalled();
  });

  it("surfaces error string when org overview throws", async () => {
    mocks.getOrgOverview.mockRejectedValueOnce(new Error("FORBIDDEN"));
    const { loadDashboardPage } = await import("@/lib/app-pages/dashboard");
    const data = await loadDashboardPage(
      {
        userId: "user-mgr",
        email: "manager@example.test",
        orgId: "org-1",
        role: "manager",
      },
      {},
    );

    expect(data).toMatchObject({
      kind: "organization",
      error: "Could not load dashboard.",
      overview: null,
    });
    expect(mocks.logServerError).toHaveBeenCalledWith("dashboard/overview", expect.any(Error));
  });
});
