import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSubscriptions: vi.fn(),
  getDeveloperRoster: vi.fn(),
  getPlanUsage: vi.fn(),
  deviceFindFirst: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    device: { findFirst: mocks.deviceFindFirst },
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSubscriptions.mockResolvedValue([]);
  mocks.getDeveloperRoster.mockResolvedValue({ developers: [] });
  mocks.getPlanUsage.mockResolvedValue({ data: { developers: [] } });
  mocks.deviceFindFirst.mockResolvedValue({ id: "device-1" });
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
    });
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
});
