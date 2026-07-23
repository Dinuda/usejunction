import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  getOrgActivitySettings: vi.fn(),
  getMeOverview: vi.fn(),
  getLocalSyncContext: vi.fn(),
  resolveLinkedDeveloperId: vi.fn(),
  getOrgOverview: vi.fn(),
}));

vi.mock("@/lib/tools/subscriptions", () => ({
  listSubscriptions: mocks.listSubscriptions,
}));

vi.mock("@/lib/activity/service", () => ({
  getOrgActivitySettings: mocks.getOrgActivitySettings,
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSubscriptions.mockResolvedValue([]);
  mocks.getOrgActivitySettings.mockResolvedValue({
    teamPeriodControlsEnabled: false,
    teamDeviceActivityEnabled: true,
  });
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

  it("forces default 30-day window for developers when period controls are disabled", async () => {
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
      allowPeriodControls: false,
      cycleView: "last_30_days",
      periodLabel: "last 30 days",
    });
    expect(mocks.getOrgActivitySettings).toHaveBeenCalledWith("org-1");
    expect(mocks.getMeOverview).toHaveBeenCalledWith(
      "org-1",
      "user-2",
      "user",
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
    expect(spanDays).toBe(30);
  });

  it("allows developers to use custom days when teamPeriodControlsEnabled", async () => {
    mocks.getOrgActivitySettings.mockResolvedValue({
      teamPeriodControlsEnabled: true,
      teamDeviceActivityEnabled: true,
    });
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
