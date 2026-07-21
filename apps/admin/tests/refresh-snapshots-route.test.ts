import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAppPrincipal: vi.fn(),
  rematerializeOrgSnapshots: vi.fn(),
}));

vi.mock("@/lib/api/app-auth", () => ({
  requireAppPrincipal: mocks.requireAppPrincipal,
}));

vi.mock("@/lib/analytics/snapshots", () => ({
  rematerializeOrgSnapshots: mocks.rematerializeOrgSnapshots,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAppPrincipal.mockResolvedValue({
    orgId: "org-sync-1",
    developerId: "dev-1",
    role: "admin",
  });
  mocks.rematerializeOrgSnapshots.mockResolvedValue({ dirtyDays: 3, rows: 6 });
});

test("sync-now refresh-snapshots rematerializes dirty days for the session org", async () => {
  const { POST } = await import("@/app/api/app/dashboard/refresh-snapshots/route");
  const response = await POST(
    new NextRequest("http://localhost/api/app/dashboard/refresh-snapshots", {
      method: "POST",
      headers: { "x-requested-with": "usejunction-web" },
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.ok, true);
  assert.equal(body.data.dirtyDays, 3);
  assert.equal(mocks.rematerializeOrgSnapshots.mock.calls.length, 1);
  assert.deepEqual(mocks.rematerializeOrgSnapshots.mock.calls[0], [
    "org-sync-1",
    { includeToday: true },
  ]);
});

test("sync-now refresh-snapshots forwards auth failures", async () => {
  mocks.requireAppPrincipal.mockResolvedValue(
    NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );
  vi.resetModules();
  const { POST } = await import("@/app/api/app/dashboard/refresh-snapshots/route");
  const response = await POST(
    new NextRequest("http://localhost/api/app/dashboard/refresh-snapshots", {
      method: "POST",
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(mocks.rematerializeOrgSnapshots.mock.calls.length, 0);
});
