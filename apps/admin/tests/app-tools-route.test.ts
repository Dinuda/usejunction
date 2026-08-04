import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAppPrincipal: vi.fn(),
  loadToolDetailPage: vi.fn(),
}));

vi.mock("@/lib/api/app-auth", () => ({
  requireAppPrincipal: mocks.requireAppPrincipal,
}));

vi.mock("@/lib/app-pages/tool-detail", () => ({
  loadToolDetailPage: mocks.loadToolDetailPage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAppPrincipal.mockResolvedValue({
    orgId: "org-1",
    userId: "user-mgr",
    role: "manager",
  });
});

test("tool detail route forwards slice=shell to loadToolDetailPage", async () => {
  mocks.loadToolDetailPage.mockResolvedValue({
    kind: "organization",
    slice: "shell",
    toolKey: "chatgpt-codex",
    syncContext: { dirtyDayCount: 28, dashboardReady: false },
  });

  const { GET } = await import("@/app/api/app/tools/[toolKey]/route");
  const response = await GET(
    new NextRequest("http://localhost/api/app/tools/chatgpt-codex?slice=shell"),
    { params: Promise.resolve({ toolKey: "chatgpt-codex" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.slice, "shell");
  assert.equal(body.data.syncContext.dirtyDayCount, 28);
  assert.deepEqual(mocks.loadToolDetailPage.mock.calls[0], [
    { orgId: "org-1", userId: "user-mgr", role: "manager" },
    "chatgpt-codex",
    { view: null, days: null, from: null, to: null },
    "shell",
  ]);
  assert.match(response.headers.get("server-timing") ?? "", /auth;dur=.*data;dur=.*total;dur=/);
});

test("tool detail route forwards slice=metrics with period search params", async () => {
  mocks.loadToolDetailPage.mockResolvedValue({
    kind: "organization",
    slice: "metrics",
    toolKey: "chatgpt-codex",
    detail: { kpis: { requests: 33194 } },
  });

  const { GET } = await import("@/app/api/app/tools/[toolKey]/route");
  const response = await GET(
    new NextRequest(
      "http://localhost/api/app/tools/chatgpt-codex?slice=metrics&view=current_cycles&days=30",
    ),
    { params: Promise.resolve({ toolKey: "chatgpt-codex" }) },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.slice, "metrics");
  assert.equal(body.data.detail.kpis.requests, 33194);
  assert.deepEqual(mocks.loadToolDetailPage.mock.calls[0]?.[2], {
    view: "current_cycles",
    days: "30",
    from: null,
    to: null,
  });
  assert.equal(mocks.loadToolDetailPage.mock.calls[0]?.[3], "metrics");
});

test("tool detail route defaults to full slice when slice is missing or unknown", async () => {
  mocks.loadToolDetailPage.mockResolvedValue({
    kind: "organization",
    slice: "full",
    toolKey: "chatgpt-codex",
    syncContext: { dirtyDayCount: 0 },
    detail: { kpis: { requests: 1 } },
  });

  const { GET } = await import("@/app/api/app/tools/[toolKey]/route");
  const response = await GET(
    new NextRequest("http://localhost/api/app/tools/chatgpt-codex?slice=unknown"),
    { params: Promise.resolve({ toolKey: "chatgpt-codex" }) },
  );

  assert.equal(response.status, 200);
  assert.equal(mocks.loadToolDetailPage.mock.calls[0]?.[3], "full");
});

test("tool detail route forwards auth failures", async () => {
  mocks.requireAppPrincipal.mockResolvedValue(
    NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );

  const { GET } = await import("@/app/api/app/tools/[toolKey]/route");
  const response = await GET(
    new NextRequest("http://localhost/api/app/tools/chatgpt-codex?slice=shell"),
    { params: Promise.resolve({ toolKey: "chatgpt-codex" }) },
  );

  assert.equal(response.status, 401);
  assert.equal(mocks.loadToolDetailPage.mock.calls.length, 0);
});
