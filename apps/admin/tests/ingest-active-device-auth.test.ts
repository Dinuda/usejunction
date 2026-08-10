import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authMocks = vi.hoisted(() => ({
  findDeviceByBearerToken: vi.fn(),
  requireIngestAuth: vi.fn(),
  deviceFindFirst: vi.fn(),
  resolveUsageIngestContext: vi.fn(),
}));

const syncMocks = vi.hoisted(() => ({
  ingestUsageSyncChunk: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    device: {
      findFirst: authMocks.deviceFindFirst,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  findDeviceByBearerToken: authMocks.findDeviceByBearerToken,
  requireIngestAuth: authMocks.requireIngestAuth,
}));

vi.mock("@/lib/sync/usage-sync", () => ({
  ingestUsageSyncChunk: syncMocks.ingestUsageSyncChunk,
}));

function bearerRequest() {
  return new NextRequest("http://localhost/api/ingest/sync/usage/chunk", {
    headers: { Authorization: "Bearer device-token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INGEST_SECRET = "test-ingest-secret";
});

describe("active ingest device auth", () => {
  it("rejects removed developers from bearer-token ingest", async () => {
    authMocks.findDeviceByBearerToken.mockResolvedValue({
      id: "device-1",
      orgId: "org-1",
      userId: "dev-removed",
      user: { removedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    const { findActiveDeviceForIngest } = await import("@/lib/ingest/device-context");
    const device = await findActiveDeviceForIngest(bearerRequest());

    expect(device).toBeNull();
  });

  it("accepts active developers from bearer-token ingest", async () => {
    authMocks.findDeviceByBearerToken.mockResolvedValue({
      id: "device-1",
      orgId: "org-1",
      userId: "dev-1",
      user: { removedAt: null },
    });

    const { findActiveDeviceForIngest } = await import("@/lib/ingest/device-context");
    const device = await findActiveDeviceForIngest(bearerRequest());

    expect(device).not.toBeNull();
    expect(device?.id).toBe("device-1");
  });

  it("rejects decommissioned devices from legacy ingest context", async () => {
    authMocks.deviceFindFirst.mockResolvedValue(null);

    const { findActiveIngestDeviceContext } = await import("@/lib/ingest/device-context");
    const context = await findActiveIngestDeviceContext({
      orgId: "org-1",
      userId: "dev-1",
      deviceId: "device-1",
    });

    expect(context).toBeNull();
    expect(authMocks.deviceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          decommissionedAt: null,
          user: { removedAt: null },
        }),
      }),
    );
  });
});

describe("usage chunk route", () => {
  it("returns 401 when active ingest context is unavailable", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ingest/device-context", () => ({
      resolveUsageIngestContext: authMocks.resolveUsageIngestContext,
    }));
    authMocks.resolveUsageIngestContext.mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );

    const { POST } = await import("../app/api/ingest/sync/usage/chunk/route");
    const response = await POST(
      new NextRequest("http://localhost/api/ingest/sync/usage/chunk", {
        method: "POST",
        headers: { Authorization: "Bearer device-token", "Content-Type": "application/json" },
        body: JSON.stringify({
          syncRunId: "run-1",
          chunkId: "chunk-1",
          aggregates: [],
        }),
      }),
    );

    assert.equal(response.status, 401);
    expect(syncMocks.ingestUsageSyncChunk).not.toHaveBeenCalled();
  });
});

describe("removed developer spend names", () => {
  it("loads developer names for snapshot activity ids without active-only filter", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/insights/queries/get-org-overview.ts"),
      "utf8",
    );
    assert.match(source, /activityDeveloperIds/);
    assert.match(source, /id: \{ in: activityDeveloperIds \}/);
    assert.doesNotMatch(
      source,
      /id: \{ in: activityDeveloperIds \}[\s\S]{0,80}removedAt: null/,
    );
  });

  it("loads usage developers for tool detail without active-only filter", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/queries/dashboard/tool-detail.ts"),
      "utf8",
    );
    assert.match(source, /id: \{ in: usageDeveloperIds \}/);
    assert.doesNotMatch(
      source,
      /id: \{ in: usageDeveloperIds \}[\s\S]{0,80}removedAt: null/,
    );
  });
});
