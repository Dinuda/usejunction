import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  developerFindFirst: vi.fn(),
  executeUsageQuery: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireOrgRole: mocks.requireOrgRole,
  rolesFor: () => ["owner", "admin", "manager", "user"],
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    developer: { findFirst: mocks.developerFindFirst },
  },
}));

vi.mock("@/lib/analytics/query", () => ({
  executeUsageQuery: mocks.executeUsageQuery,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgRole.mockResolvedValue({
    orgId: "org-1",
    userId: "owner-1",
    role: "owner",
    email: "owner@example.com",
  });
  mocks.developerFindFirst.mockResolvedValue(null);
  mocks.executeUsageQuery.mockResolvedValue({
    schemaVersion: "1",
    kind: "usage-query",
    generatedAt: "2026-07-15T18:00:00.000Z",
    dataThrough: "2026-07-12T00:00:00.000Z",
    timezone: "UTC",
    window: { from: "2026-06-16", to: "2026-07-15", grain: "day" },
    data: {
      rows: [{
        dimensions: { day: "2026-07-12" },
        measures: { requests: 3, costMicros: "4500000" },
      }],
    },
    meta: { cache: { status: "bypass", expiresAt: null } },
  });
});

test("POST /api/insights/query rejects unauthorized callers", async () => {
  mocks.requireOrgRole.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const { POST } = await import("../app/api/insights/query/route");
  const response = await POST(
    new NextRequest("http://localhost/api/insights/query", {
      method: "POST",
      body: JSON.stringify({ window: { preset: 30 }, measures: ["requests"] }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(mocks.executeUsageQuery.mock.calls.length, 0);
});

test("POST /api/insights/query runs live usage query for owners", async () => {
  const { POST } = await import("../app/api/insights/query/route");
  const response = await POST(
    new NextRequest("http://localhost/api/insights/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        window: { preset: 30 },
        measures: ["requests", "costMicros"],
        dimensions: ["day"],
      }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.kind, "usage-query");
  assert.equal(body.meta.cache.status, "bypass");
  assert.equal(body.meta.cache.expiresAt, null);
  assert.equal(body.data.rows[0].measures.requests, 3);

  assert.equal(mocks.executeUsageQuery.mock.calls.length, 1);
  const [scope, input] = mocks.executeUsageQuery.mock.calls[0];
  assert.equal(scope.orgId, "org-1");
  assert.equal(scope.actorId, "owner-1");
  assert.equal(scope.role, "owner");
  assert.equal(scope.developerId, undefined);
  assert.deepEqual(input.measures, ["requests", "costMicros"]);
});

test("POST /api/insights/query scopes developers to their identity", async () => {
  mocks.requireOrgRole.mockResolvedValue({
    orgId: "org-1",
    userId: "user-1",
    role: "user",
    email: "dev@example.com",
  });
  mocks.developerFindFirst.mockResolvedValue({ id: "dev-99" });

  const { POST } = await import("../app/api/insights/query/route");
  const response = await POST(
    new NextRequest("http://localhost/api/insights/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ window: { preset: 7 }, measures: ["requests"] }),
    }),
  );

  assert.equal(response.status, 200);
  const [scope] = mocks.executeUsageQuery.mock.calls[0];
  assert.equal(scope.developerId, "dev-99");
  assert.equal(scope.role, "user");
});

test("POST /api/insights/query returns 400 for invalid query bodies", async () => {
  const { ZodError } = await import("zod");
  mocks.executeUsageQuery.mockRejectedValueOnce(
    new ZodError([{ code: "custom", message: "bad", path: ["measures"] }]),
  );

  const { POST } = await import("../app/api/insights/query/route");
  const response = await POST(
    new NextRequest("http://localhost/api/insights/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ window: { preset: 30 } }),
    }),
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid query");
});
