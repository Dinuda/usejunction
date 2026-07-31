import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  getMeOverview: vi.fn(),
  getRemoteSyncPanelContext: vi.fn(),
  resolveLinkedDeveloperId: vi.fn(),
  getOrgOverview: vi.fn(),
  getOrgOverviewShell: vi.fn(),
  getOrgOverviewMetrics: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/tools/subscriptions", () => ({
  listSubscriptions: mocks.listSubscriptions,
}));

vi.mock("@/lib/queries/me/overview", () => ({
  getMeOverview: mocks.getMeOverview,
}));

vi.mock("@/lib/sync/remote-sync", () => ({
  getRemoteSyncPanelContext: mocks.getRemoteSyncPanelContext,
}));

vi.mock("@/lib/queries/me/resolve-developer", () => ({
  resolveLinkedDeveloperId: mocks.resolveLinkedDeveloperId,
}));

vi.mock("@/lib/insights", () => ({
  getOrgOverview: mocks.getOrgOverview,
  getOrgOverviewShell: mocks.getOrgOverviewShell,
  getOrgOverviewMetrics: mocks.getOrgOverviewMetrics,
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
  mocks.getRemoteSyncPanelContext.mockResolvedValue({
    scope: "team",
    lastSeenAt: null,
    lastUsageSyncAt: null,
    lastAccountSyncAt: null,
    hasLocalEndpoint: false,
    needsPlanSync: false,
    deviceCount: 1,
    remoteCapableDeviceCount: 1,
    dashboardReady: true,
    dirtyDayCount: 0,
    snapshotLagSeconds: null,
  });
  mocks.resolveLinkedDeveloperId.mockResolvedValue("dev-1");
  mocks.getOrgOverview.mockResolvedValue({ data: { hasActivity: true } });
  mocks.getOrgOverviewShell.mockResolvedValue({
    coverage: { developers: 3, devices: 2, configuredTools: 1, trackedTools: 2 },
    health: { issues: [] },
    detectedInstallations: [],
  });
  mocks.getOrgOverviewMetrics.mockResolvedValue({
    data: { hasUsageActivity: true, coverage: { activeDevelopers: 2 } },
  });
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
  it("loads organization overview for manager with team scope and an audience switcher", async () => {
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
      slice: "full",
      scope: "team",
      canSwitchAudience: true,
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
    expect(mocks.getRemoteSyncPanelContext).toHaveBeenCalledWith("org-1", "user-mgr", "team");
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

  it("loads shell slice without metrics or full sync context", async () => {
    const { loadDashboardPage } = await import("@/lib/app-pages/dashboard");
    const data = await loadDashboardPage(
      {
        userId: "user-mgr",
        email: "manager@example.test",
        orgId: "org-1",
        role: "manager",
      },
      {},
      "shell",
    );

    expect(data).toMatchObject({
      kind: "organization",
      slice: "shell",
      shell: { coverage: { developers: 3 } },
    });
    expect(mocks.getOrgOverviewShell).toHaveBeenCalledWith("org-1");
    expect(mocks.getOrgOverviewMetrics).not.toHaveBeenCalled();
    expect(mocks.getOrgOverview).not.toHaveBeenCalled();
    expect(mocks.getRemoteSyncPanelContext).toHaveBeenCalledWith("org-1", "user-mgr", "team");
  });

  it("loads metrics slice without shell or sync context", async () => {
    const { loadDashboardPage } = await import("@/lib/app-pages/dashboard");
    const data = await loadDashboardPage(
      {
        userId: "user-mgr",
        email: "manager@example.test",
        orgId: "org-1",
        role: "manager",
      },
      { view: "previous_cycles" },
      "metrics",
    );

    expect(data).toMatchObject({
      kind: "organization",
      slice: "metrics",
      cycleView: "previous_cycles",
      overview: { hasUsageActivity: true },
    });
    expect(mocks.getOrgOverviewMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1" }),
      expect.objectContaining({ cycleView: "previous_cycles" }),
      expect.objectContaining({ subscriptions: [] }),
    );
    expect(mocks.getOrgOverviewShell).not.toHaveBeenCalled();
    expect(mocks.getRemoteSyncPanelContext).not.toHaveBeenCalled();
  });
});
