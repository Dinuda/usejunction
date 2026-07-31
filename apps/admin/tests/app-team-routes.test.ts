import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAppPrincipal: vi.fn(),
  loadTeamUsagePage: vi.fn(),
  loadTeamInvitesPage: vi.fn(),
  loadTeamSyncsPage: vi.fn(),
}));

vi.mock("@/lib/api/app-auth", () => ({
  requireAppPrincipal: mocks.requireAppPrincipal,
}));

vi.mock("@/lib/app-pages/team", () => ({
  loadTeamUsagePage: mocks.loadTeamUsagePage,
  loadTeamInvitesPage: mocks.loadTeamInvitesPage,
  loadTeamSyncsPage: mocks.loadTeamSyncsPage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAppPrincipal.mockResolvedValue({
    orgId: "org-1",
    userId: "owner-1",
    role: "owner",
  });
  mocks.loadTeamInvitesPage.mockResolvedValue({ pendingInvites: [] });
  mocks.loadTeamUsagePage.mockResolvedValue({ planUsage: [] });
  mocks.loadTeamSyncsPage.mockResolvedValue({
    syncs: {
      devices: [],
      totals: { total: 0, online: 0, stale: 0, neverSynced: 0 },
    },
  });
});

test.each([
  {
    path: "/api/app/team/usage",
    module: "@/app/api/app/team/usage/route",
    loader: mocks.loadTeamUsagePage,
    field: "planUsage",
  },
  {
    path: "/api/app/team/invites",
    module: "@/app/api/app/team/invites/route",
    loader: mocks.loadTeamInvitesPage,
    field: "pendingInvites",
  },
  {
    path: "/api/app/team/syncs",
    module: "@/app/api/app/team/syncs/route",
    loader: mocks.loadTeamSyncsPage,
    field: "syncs",
  },
])("$path returns a role-protected org-scoped payload", async ({ path, module, loader, field }) => {
  vi.resetModules();
  const { GET } = await import(module);
  const response = await GET(new NextRequest(`http://localhost${path}`));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(field in body.data);
  assert.deepEqual(mocks.requireAppPrincipal.mock.calls[0]?.[1], ["owner", "admin", "manager"]);
  assert.equal(loader.mock.calls[0]?.[0].orgId, "org-1");
  assert.match(response.headers.get("server-timing") ?? "", /auth;dur=.*data;dur=.*total;dur=/);
});

test.each([
  {
    path: "/api/app/team/usage",
    module: "@/app/api/app/team/usage/route",
    loader: mocks.loadTeamUsagePage,
  },
  {
    path: "/api/app/team/invites",
    module: "@/app/api/app/team/invites/route",
    loader: mocks.loadTeamInvitesPage,
  },
  {
    path: "/api/app/team/syncs",
    module: "@/app/api/app/team/syncs/route",
    loader: mocks.loadTeamSyncsPage,
  },
])("$path forwards authorization failures without loading data", async ({ path, module, loader }) => {
  mocks.requireAppPrincipal.mockResolvedValue(
    NextResponse.json({ error: "forbidden" }, { status: 403 }),
  );
  vi.resetModules();
  const { GET } = await import(module);
  const response = await GET(new NextRequest(`http://localhost${path}`));

  assert.equal(response.status, 403);
  assert.equal(loader.mock.calls.length, 0);
});
