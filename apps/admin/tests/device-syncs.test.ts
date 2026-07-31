import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEVICE_ACTIVE_WITHIN_MS } from "@/lib/devices/presence";

const mocks = vi.hoisted(() => ({
  deviceFindMany: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    device: { findMany: mocks.deviceFindMany },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrgDeviceSyncStatus", () => {
  it("classifies online, stale, and never-synced machines", async () => {
    const now = new Date("2026-07-25T12:00:00.000Z");
    mocks.deviceFindMany.mockResolvedValue([
      {
        id: "d-online",
        hostname: "macbook-pro",
        os: "darwin",
        architecture: "arm64",
        agentVersion: "0.3.4",
        lastSeenAt: new Date(now.getTime() - 10 * 60 * 1000),
        lastUsageSyncAt: new Date(now.getTime() - 20 * 60 * 1000),
        lastAccountSyncAt: new Date(now.getTime() - 20 * 60 * 1000),
        lastToolsSyncAt: new Date(now.getTime() - 20 * 60 * 1000),
        lastQuotasSyncAt: null,
        localEndpoint: "http://127.0.0.1:47832",
        user: { id: "dev-1", name: "Ada", email: "ada@example.test" },
      },
      {
        id: "d-stale",
        hostname: "desk-linux",
        os: "linux",
        architecture: "x64",
        agentVersion: "0.3.2",
        lastSeenAt: new Date(now.getTime() - DEVICE_ACTIVE_WITHIN_MS - 60_000),
        lastUsageSyncAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lastAccountSyncAt: null,
        lastToolsSyncAt: null,
        lastQuotasSyncAt: null,
        localEndpoint: null,
        user: { id: "dev-2", name: "Bob", email: "bob@example.test" },
      },
      {
        id: "d-never",
        hostname: "new-laptop",
        os: "darwin",
        architecture: "arm64",
        agentVersion: "0.3.4",
        lastSeenAt: new Date(now.getTime() - 5 * 60 * 1000),
        lastUsageSyncAt: null,
        lastAccountSyncAt: null,
        lastToolsSyncAt: null,
        lastQuotasSyncAt: null,
        localEndpoint: null,
        user: { id: "dev-3", name: "Cara", email: "cara@example.test" },
      },
    ]);

    const { getOrgDeviceSyncStatus } = await import("@/lib/queries/team/device-syncs");
    const result = await getOrgDeviceSyncStatus("org-1", now);

    expect(mocks.deviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orgId: "org-1", decommissionedAt: null },
        orderBy: { lastSeenAt: "desc" },
      }),
    );
    expect(result.totals).toEqual({ total: 3, online: 1, stale: 1, neverSynced: 1, repairRequired: 0 });
    expect(result.devices.map((row) => ({ id: row.id, status: row.status }))).toEqual([
      { id: "d-online", status: "online" },
      { id: "d-stale", status: "stale" },
      { id: "d-never", status: "never_synced" },
    ]);
    expect(result.devices[0]?.developer).toEqual({
      id: "dev-1",
      name: "Ada",
      email: "ada@example.test",
    });
    expect(result.devices[0]?.hasLocalEndpoint).toBe(true);
  });
});
