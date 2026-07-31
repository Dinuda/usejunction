import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    device: { findMany: vi.fn() },
    syncRequest: { findUnique: vi.fn(), update: vi.fn() },
    deviceRecoveryNotice: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  tx: {
    syncRequest: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  sendDeviceRecoveryEmail: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({ prisma: mocks.prisma, Prisma: {} }));
vi.mock("@/lib/analytics/snapshots/readiness", () => ({
  getWorkspaceSyncReadiness: vi.fn().mockResolvedValue({ dashboardReady: true, dirtyDayCount: 0, snapshotLagSeconds: null }),
}));
vi.mock("@/lib/notifications/slack", () => ({ notifyServerIssue: vi.fn() }));
vi.mock("@/lib/email/device-recovery", () => ({
  sendDeviceRecoveryEmail: mocks.sendDeviceRecoveryEmail,
}));

const now = new Date("2026-07-28T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ABLY_API_KEY;
  mocks.prisma.$transaction.mockImplementation((fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.prisma.deviceRecoveryNotice.updateMany.mockResolvedValue({ count: 0 });
  mocks.prisma.syncRequest.update.mockResolvedValue({});
  mocks.tx.syncRequest.create.mockResolvedValue({ id: "auto-1" });
  mocks.tx.auditLog.create.mockResolvedValue({});
  mocks.sendDeviceRecoveryEmail.mockResolvedValue(undefined);
});

describe("reconcileDeviceHealth", () => {
  it("queues only remote-capable stale devices and deduplicates the outage key", async () => {
    const lastSeenAt = new Date(now.getTime() - 60 * 60 * 1000);
    mocks.prisma.device.findMany.mockResolvedValue([
      {
        id: "device-capable",
        orgId: "org-1",
        userId: "dev-1",
        hostname: "macbook",
        os: "darwin",
        architecture: "arm64",
        agentVersion: "0.3.5",
        lastSeenAt,
        remoteSyncProtocol: 1,
        user: { name: "Ada", email: "ada@example.test" },
      },
      {
        id: "device-old",
        orgId: "org-1",
        userId: "dev-2",
        hostname: "old-linux",
        os: "linux",
        architecture: "amd64",
        agentVersion: "0.2.0",
        lastSeenAt,
        remoteSyncProtocol: 0,
        user: { name: "Bob", email: "bob@example.test" },
      },
    ]);
    mocks.prisma.syncRequest.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "auto-1" });

    const { reconcileDeviceHealth } = await import("@/lib/sync/remote-sync");
    const first = await reconcileDeviceHealth({ orgId: "org-1", now, sendNotifications: false });
    const second = await reconcileDeviceHealth({ orgId: "org-1", now, sendNotifications: false });

    expect(first.autoRequestsCreated).toBe(1);
    expect(second.autoRequestsCreated).toBe(0);
    expect(mocks.tx.syncRequest.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.syncRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        trigger: "stale_auto",
        requesterUserId: null,
        automationKey: expect.stringContaining("device-capable"),
        targets: { create: expect.objectContaining({ deviceId: "device-capable" }) },
      }),
    }));
  });

  it("sends one repair notice for a 48-hour outage and skips the sent notice", async () => {
    const lastSeenAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    mocks.prisma.device.findMany.mockResolvedValue([{
      id: "device-repair",
      orgId: "org-1",
      userId: "dev-1",
      hostname: "macbook",
      os: "darwin",
      architecture: "arm64",
      agentVersion: "0.3.5",
      lastSeenAt,
      remoteSyncProtocol: 1,
      user: { name: "Ada", email: "ada@example.test" },
    }]);
    mocks.prisma.deviceRecoveryNotice.upsert
      .mockResolvedValueOnce({ id: "notice-1", status: "pending" })
      .mockResolvedValueOnce({ id: "notice-1", status: "sent" });

    const { reconcileDeviceHealth } = await import("@/lib/sync/remote-sync");
    const first = await reconcileDeviceHealth({ orgId: "org-1", now, sendNotifications: true });
    const second = await reconcileDeviceHealth({ orgId: "org-1", now, sendNotifications: true });

    expect(first.noticesSent).toBe(1);
    expect(second.noticesSent).toBe(0);
    expect(mocks.sendDeviceRecoveryEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendDeviceRecoveryEmail).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: "device-repair",
      hostname: "macbook",
    }));
  });
});
