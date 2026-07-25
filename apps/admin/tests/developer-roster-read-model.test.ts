import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  developerFindMany: vi.fn(),
  membershipFindMany: vi.fn(),
  readDeveloperActivityFromSnapshots: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    developer: { findMany: mocks.developerFindMany },
    organizationMembership: { findMany: mocks.membershipFindMany },
  },
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  readDeveloperActivityFromSnapshots: mocks.readDeveloperActivityFromSnapshots,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.readDeveloperActivityFromSnapshots.mockResolvedValue([]);
  mocks.membershipFindMany.mockResolvedValue([]);
});

describe("getDeveloperRoster", () => {
  it("exposes vendorSeats from seatAssignments and omits manualPlans", async () => {
    const seat = {
      provider: "openai",
      product: "chatgpt",
      plan: "Plus",
      status: "active",
      source: "provider_sync",
      lastActivityAt: null,
      observedAt: new Date("2026-07-01T00:00:00.000Z"),
    };
    mocks.developerFindMany.mockResolvedValue([
      {
        id: "dev-1",
        name: "Ada",
        email: "ada@example.test",
        authUserId: null,
        role: "user",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        devices: [],
        seatAssignments: [seat],
        toolClaims: [],
      },
    ]);

    const { getDeveloperRoster } = await import("@/lib/read-models/developers");
    const result = await getDeveloperRoster("org-1");

    expect(result.developers).toHaveLength(1);
    const developer = result.developers[0]!;
    expect(developer.vendorSeats).toEqual([seat]);
    expect(developer).not.toHaveProperty("assignedPlans");
    expect(developer).not.toHaveProperty("manualPlans");
    expect(mocks.membershipFindMany).not.toHaveBeenCalled();
    expect(mocks.readDeveloperActivityFromSnapshots).toHaveBeenCalled();
  });

  it("resolves linked role from OrganizationMembership, not Developer.role", async () => {
    mocks.developerFindMany.mockResolvedValue([
      {
        id: "dev-linked",
        name: "Linked",
        email: "linked@example.test",
        authUserId: "user-1",
        role: "user",
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        devices: [],
        seatAssignments: [],
        toolClaims: [],
      },
      {
        id: "dev-unlinked",
        name: "Vendor",
        email: "vendor@example.test",
        authUserId: null,
        role: "manager",
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
        devices: [],
        seatAssignments: [],
        toolClaims: [],
      },
    ]);
    mocks.membershipFindMany.mockResolvedValue([{ userId: "user-1", role: "admin" }]);

    const { getDeveloperRoster } = await import("@/lib/read-models/developers");
    const result = await getDeveloperRoster("org-1");

    expect(mocks.membershipFindMany).toHaveBeenCalledWith({
      where: { orgId: "org-1", userId: { in: ["user-1"] } },
      select: { userId: true, role: true },
    });
    expect(result.developers.find((row) => row.id === "dev-linked")?.role).toBe("admin");
    expect(result.developers.find((row) => row.id === "dev-unlinked")?.role).toBe("manager");
  });
});
