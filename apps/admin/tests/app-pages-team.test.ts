import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  getDeveloperRoster: vi.fn(),
  getPlanUsage: vi.fn(),
  getOrgDeviceSyncStatus: vi.fn(),
  deviceFindFirst: vi.fn(),
  organizationInviteFindMany: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    device: { findFirst: mocks.deviceFindFirst },
    organizationInvite: { findMany: mocks.organizationInviteFindMany },
  },
}));

vi.mock("@/lib/tools/subscriptions", () => ({
  listSubscriptions: mocks.listSubscriptions,
}));

vi.mock("@/lib/read-models/developers", () => ({
  getDeveloperRoster: mocks.getDeveloperRoster,
}));

vi.mock("@/lib/insights/queries/get-plan-usage", () => ({
  getPlanUsage: mocks.getPlanUsage,
}));

vi.mock("@/lib/queries/team/device-syncs", () => ({
  getOrgDeviceSyncStatus: mocks.getOrgDeviceSyncStatus,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSubscriptions.mockResolvedValue([]);
  mocks.getDeveloperRoster.mockResolvedValue({ developers: [] });
  mocks.getPlanUsage.mockResolvedValue({ data: { developers: [] } });
  mocks.getOrgDeviceSyncStatus.mockResolvedValue({
    devices: [],
    totals: { total: 0, online: 0, stale: 0, neverSynced: 0 },
  });
  mocks.deviceFindFirst.mockResolvedValue({ id: "device-1" });
  mocks.organizationInviteFindMany.mockResolvedValue([]);
});

describe("loadTeamPage", () => {
  it("returns roster, subscriptions, and plan usage for the report window", async () => {
    const { loadTeamPage } = await import("@/lib/app-pages/team");
    const data = await loadTeamPage(
      {
        userId: "user-1",
        email: "owner@example.test",
        orgId: "org-1",
        role: "owner",
      },
      {},
    );

    expect(mocks.listSubscriptions).toHaveBeenCalledWith("org-1");
    expect(mocks.getDeveloperRoster).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ reportWindow: expect.any(Object) }),
    );
    expect(data).toMatchObject({
      empty: false,
      developers: [],
      subscriptions: [],
      planUsage: [],
      pendingInvites: [],
      syncs: { devices: [], totals: { total: 0, online: 0, stale: 0, neverSynced: 0 } },
    });
    expect(mocks.getOrgDeviceSyncStatus).toHaveBeenCalledWith("org-1", expect.any(Date));
    expect(data.cycleView).toBe("current_cycles");
  });

  it("marks empty when the org has no active device", async () => {
    mocks.deviceFindFirst.mockResolvedValue(null);
    const { loadTeamPage } = await import("@/lib/app-pages/team");
    const data = await loadTeamPage(
      {
        userId: "user-1",
        email: "owner@example.test",
        orgId: "org-1",
        role: "owner",
      },
      {},
    );
    expect(data.empty).toBe(true);
  });

  it("returns pending invites excluding emails already on the roster", async () => {
    mocks.getDeveloperRoster.mockResolvedValue({
      developers: [{ id: "dev-1", email: "joined@example.test", name: "Joined" }],
    });
    mocks.organizationInviteFindMany.mockResolvedValue([
      {
        id: "inv-1",
        email: "pending@example.test",
        role: "user",
        expiresAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
      },
      {
        id: "inv-2",
        email: "joined@example.test",
        role: "user",
        expiresAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-20T00:00:00.000Z"),
      },
      {
        id: "inv-3",
        email: "expired@example.test",
        role: "manager",
        expiresAt: new Date("2026-07-01T00:00:00.000Z"),
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      },
    ]);
    const { loadTeamPage } = await import("@/lib/app-pages/team");
    const data = await loadTeamPage(
      {
        userId: "user-1",
        email: "owner@example.test",
        orgId: "org-1",
        role: "owner",
      },
      {},
    );
    expect(mocks.organizationInviteFindMany.mock.calls[0][0].where).toEqual({
      orgId: "org-1",
      acceptedAt: null,
    });
    expect(data.pendingInvites).toEqual([
      {
        id: "inv-1",
        email: "pending@example.test",
        role: "user",
        expiresAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-07-20T00:00:00.000Z",
      },
      {
        id: "inv-3",
        email: "expired@example.test",
        role: "manager",
        expiresAt: "2026-07-01T00:00:00.000Z",
        createdAt: "2026-06-24T00:00:00.000Z",
      },
    ]);
  });
});
