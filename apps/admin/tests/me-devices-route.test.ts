import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAppPrincipal: vi.fn(),
  resolveLinkedDeveloper: vi.fn(),
  deviceFindMany: vi.fn(),
}));

vi.mock("@/lib/api/app-auth", () => ({
  requireAppPrincipal: mocks.requireAppPrincipal,
}));

vi.mock("@/lib/sync/remote-sync-context", () => ({
  resolveLinkedDeveloper: mocks.resolveLinkedDeveloper,
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    device: { findMany: mocks.deviceFindMany },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAppPrincipal.mockResolvedValue({
    userId: "auth_1",
    email: "dev@example.com",
    orgId: "org_1",
    role: "user",
  });
  mocks.resolveLinkedDeveloper.mockResolvedValue({ id: "dev_1" });
  mocks.deviceFindMany.mockResolvedValue([
    {
      id: "device_1",
      hostname: "MacBook-Pro.local",
      os: "darwin",
      architecture: "arm64",
      lastSeenAt: new Date("2026-08-10T10:00:00.000Z"),
    },
  ]);
});

test("GET /api/app/me/devices returns active devices for the linked developer", async () => {
  const { GET } = await import("@/app/api/app/me/devices/route");
  const response = await GET(new Request("https://usejunction.dev/api/app/me/devices") as never);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.devices.length, 1);
  assert.equal(body.data.devices[0].id, "device_1");
  assert.equal(body.data.devices[0].hostname, "MacBook-Pro.local");
  assert.equal(body.data.devices[0].state, "repair_required");
  assert.deepEqual(mocks.deviceFindMany.mock.calls[0]?.[0]?.where, {
    orgId: "org_1",
    userId: "dev_1",
    decommissionedAt: null,
  });
});

test("GET /api/app/me/devices returns 409 when developer profile is missing", async () => {
  mocks.resolveLinkedDeveloper.mockResolvedValue(null);

  const { GET } = await import("@/app/api/app/me/devices/route");
  const response = await GET(new Request("https://usejunction.dev/api/app/me/devices") as never);
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "LINKED_DEVELOPER_REQUIRED");
});

test("GET /api/app/me/devices returns auth errors from principal guard", async () => {
  mocks.requireAppPrincipal.mockResolvedValue(
    NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );

  const { GET } = await import("@/app/api/app/me/devices/route");
  const response = await GET(new Request("https://usejunction.dev/api/app/me/devices") as never);

  assert.equal(response.status, 401);
});
