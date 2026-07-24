import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  requestGroupBy: vi.fn(),
  usageGroupBy: vi.fn(),
  developerFindMany: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireOrgRole: mocks.requireOrgRole,
  rolesFor: () => ["owner", "admin"],
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    requestMetadata: { groupBy: mocks.requestGroupBy },
    usageDaily: { groupBy: mocks.usageGroupBy },
    developer: { findMany: mocks.developerFindMany },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgRole.mockResolvedValue({
    orgId: "org-1",
    userId: "owner-1",
    role: "owner",
    email: "owner@example.com",
  });
  mocks.requestGroupBy.mockResolvedValue([]);
  mocks.usageGroupBy.mockResolvedValue([]);
  mocks.developerFindMany.mockResolvedValue([]);
});

test("GET /api/bypass rejects unauthorized callers", async () => {
  mocks.requireOrgRole.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const { GET } = await import("../app/api/bypass/route");
  const response = await GET(new NextRequest("http://localhost/api/bypass"));
  assert.equal(response.status, 403);
});

test("GET /api/bypass aggregates local usage from usage_daily device sources", async () => {
  mocks.developerFindMany.mockResolvedValue([
    { id: "dev-1", name: "Ada", email: "ada@example.com" },
  ]);
  mocks.requestGroupBy.mockResolvedValue([
    {
      userId: "dev-1",
      _count: { id: 2 },
      _sum: { totalTokens: 100, estimatedCost: 0.1 },
    },
  ]);
  mocks.usageGroupBy.mockResolvedValue([
    {
      developerId: "dev-1",
      _sum: {
        inputTokens: BigInt(800),
        outputTokens: BigInt(200),
        costMicros: BigInt(500_000),
      },
    },
  ]);

  const { GET } = await import("../app/api/bypass/route");
  const response = await GET(new NextRequest("http://localhost/api/bypass"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.period, "30d");
  assert.equal(body.suspects.length, 1);
  assert.equal(body.suspects[0].userId, "dev-1");
  assert.equal(body.suspects[0].gatewayTokens, 100);
  assert.equal(body.suspects[0].localTokens, 1000);
  assert.equal(body.suspects[0].localCost, 0.5);
  assert.equal(body.suspects[0].flagged, false);

  const usageWhere = mocks.usageGroupBy.mock.calls[0][0].where;
  assert.equal(usageWhere.orgId, "org-1");
  assert.ok(Array.isArray(usageWhere.source.in));
  assert.ok(usageWhere.source.in.includes("device_observed"));
  assert.deepEqual(usageWhere.developerId, { not: null });
});

test("GET /api/bypass flags high local-only token volume", async () => {
  mocks.developerFindMany.mockResolvedValue([{ id: "dev-2", name: "Bob", email: "bob@example.com" }]);
  mocks.requestGroupBy.mockResolvedValue([]);
  mocks.usageGroupBy.mockResolvedValue([
    {
      developerId: "dev-2",
      _sum: {
        inputTokens: BigInt(2000),
        outputTokens: BigInt(0),
        costMicros: BigInt(0),
      },
    },
  ]);

  const { GET } = await import("../app/api/bypass/route");
  const response = await GET(new NextRequest("http://localhost/api/bypass"));
  const body = await response.json();
  assert.equal(body.suspects[0].bypassRatio, 100);
  assert.equal(body.suspects[0].flagged, true);
});
