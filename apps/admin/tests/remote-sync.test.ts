import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    developer: { findFirst: vi.fn() },
    device: { findMany: vi.fn() },
    syncRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    deviceSyncRequestTarget: { updateMany: vi.fn() },
  },
  tx: {
    syncRequest: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  notifyServerIssue: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: mocks.prisma,
  Prisma: {},
}));

vi.mock("@/lib/analytics/snapshots/readiness", () => ({
  getWorkspaceSyncReadiness: vi.fn().mockResolvedValue({
    dashboardReady: true,
    dirtyDayCount: 0,
    snapshotLagSeconds: null,
  }),
}));

vi.mock("@/lib/notifications/slack", () => ({
  notifyServerIssue: mocks.notifyServerIssue,
}));

const principal = {
  userId: "auth-user-1",
  email: "owner@example.test",
  orgId: "org-1",
  role: "owner" as const,
};

function loadedRequest(scope: "team" | "you" = "team") {
  return {
    id: "req-1",
    orgId: "org-1",
    requesterUserId: "auth-user-1",
    scope,
    developerId: scope === "you" ? "dev-linked" : null,
    idempotencyKey: "idem-1",
    realtimeChannel: scope === "you" ? "device-sync:developer:dev-linked" : "device-sync:org:org-1",
    dispatchStatus: "degraded",
    dispatchError: "ABLY_API_KEY is not configured",
    publishedAt: null,
    createdAt: new Date("2026-07-26T12:00:00.000Z"),
    updatedAt: new Date("2026-07-26T12:00:00.000Z"),
    expiresAt: new Date("2026-07-27T12:00:00.000Z"),
    targets: [
      {
        id: "target-1",
        requestId: "req-1",
        orgId: "org-1",
        deviceId: "device-1",
        status: "queued",
        attemptCount: 0,
        leaseToken: null,
        leaseExpiresAt: null,
        claimedAt: null,
        runningAt: null,
        completedAt: null,
        toolsCount: null,
        accountsCount: null,
        quotasCount: null,
        usageRowsCount: null,
        warnings: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date("2026-07-26T12:00:00.000Z"),
        updatedAt: new Date("2026-07-26T12:00:00.000Z"),
        device: {
          id: "device-1",
          hostname: "macbook",
          os: "darwin",
          architecture: "arm64",
          agentVersion: "0.3.5",
          remoteSyncProtocol: 1,
          lastSeenAt: new Date("2026-07-26T11:59:00.000Z"),
          user: { id: "dev-linked", name: "Ada", email: "ada@example.test" },
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ABLY_API_KEY;
  mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.tx));
  mocks.prisma.deviceSyncRequestTarget.updateMany.mockResolvedValue({ count: 0 });
  mocks.prisma.syncRequest.findFirst.mockResolvedValue(null);
  mocks.prisma.syncRequest.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.syncRequest.update.mockResolvedValue({});
  mocks.tx.syncRequest.create.mockResolvedValue({ id: "req-1" });
  mocks.tx.auditLog.create.mockResolvedValue({});
  mocks.prisma.syncRequest.findUnique.mockResolvedValue(loadedRequest("team"));
});

describe("createRemoteSyncRequest", () => {
  it("snapshots every active org device for a team request and remains durable without Ably", async () => {
    mocks.prisma.device.findMany.mockResolvedValue([{ id: "device-1" }, { id: "device-2" }]);

    const { createRemoteSyncRequest } = await import("@/lib/sync/remote-sync");
    const result = await createRemoteSyncRequest({ principal, scope: "team", idempotencyKey: "idem-1" });

    expect(mocks.prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: "org-1", decommissionedAt: null }),
        select: { id: true },
      }),
    );
    expect(mocks.tx.syncRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: "team",
          realtimeChannel: "device-sync:org:org-1",
          targets: { createMany: { data: expect.arrayContaining([
            expect.objectContaining({ deviceId: "device-1" }),
            expect.objectContaining({ deviceId: "device-2" }),
          ]) } },
        }),
      }),
    );
    expect(mocks.prisma.syncRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req-1" },
        data: expect.objectContaining({ dispatchStatus: "degraded" }),
      }),
    );
    expect(result.totals.total).toBe(1);
  });

  it("resolves the signed-in developer for a personal request", async () => {
    mocks.prisma.developer.findFirst.mockResolvedValue({ id: "dev-linked" });
    mocks.prisma.device.findMany.mockResolvedValue([{ id: "device-1" }]);
    mocks.prisma.syncRequest.findUnique.mockResolvedValue(loadedRequest("you"));

    const { createRemoteSyncRequest } = await import("@/lib/sync/remote-sync");
    const result = await createRemoteSyncRequest({ principal, scope: "you", idempotencyKey: "idem-1" });

    expect(mocks.prisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: "org-1", userId: "dev-linked" }),
      }),
    );
    expect(mocks.tx.syncRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: "you",
          developerId: "dev-linked",
          realtimeChannel: "device-sync:developer:dev-linked",
        }),
      }),
    );
    expect(result.scope).toBe("you");
  });

  it("rejects team requests from regular users", async () => {
    const { createRemoteSyncRequest } = await import("@/lib/sync/remote-sync");

    await expect(
      createRemoteSyncRequest({
        principal: { ...principal, role: "user" },
        scope: "team",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toMatchObject({ message: "FORBIDDEN", status: 403 });
    expect(mocks.prisma.device.findMany).not.toHaveBeenCalled();
  });
});
