import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireOrgRole: vi.fn(),
  audit: vi.fn(),
  listPools: vi.fn(),
  connectionFindFirst: vi.fn(),
  poolFindUnique: vi.fn(),
  poolCreate: vi.fn(),
  keyFindFirst: vi.fn(),
  developerFindFirst: vi.fn(),
  keyUpdate: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({
  requireOrgRole: mocks.requireOrgRole,
  rolesFor: () => ["owner", "admin"],
  audit: mocks.audit,
}));

vi.mock("@/lib/api-credits", () => ({
  listApiCreditPools: mocks.listPools,
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    providerConnection: { findFirst: mocks.connectionFindFirst },
    apiCreditPool: { findUnique: mocks.poolFindUnique, create: mocks.poolCreate },
    providerApiKey: { findFirst: mocks.keyFindFirst, update: mocks.keyUpdate },
    developer: { findFirst: mocks.developerFindFirst },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgRole.mockResolvedValue({ orgId: "org-1", userId: "owner-1", role: "owner", email: "owner@example.com" });
  mocks.audit.mockResolvedValue(undefined);
  mocks.listPools.mockResolvedValue([]);
  mocks.poolFindUnique.mockResolvedValue(null);
});

test("API credit routes preserve owner/admin RBAC responses", async () => {
  mocks.requireOrgRole.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const { GET } = await import("../app/api/tools/api-credit-pools/route");
  const response = await GET(new NextRequest("http://localhost/api/tools/api-credit-pools"));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
});

test("pool creation validates input and rejects disconnected or cross-org connections", async () => {
  const { POST } = await import("../app/api/tools/api-credit-pools/route");
  const invalid = await POST(new NextRequest("http://localhost/api/tools/api-credit-pools", {
    method: "POST", body: JSON.stringify({ connectionId: "connection-1", mode: "recurring", budgetMicros: "0", billingCadence: "monthly" }),
  }));
  assert.equal(invalid.status, 400);

  mocks.connectionFindFirst.mockResolvedValue(null);
  const disconnected = await POST(new NextRequest("http://localhost/api/tools/api-credit-pools", {
    method: "POST", body: JSON.stringify({ connectionId: "connection-other-org", mode: "recurring", budgetMicros: "1000000", billingCadence: "monthly" }),
  }));
  assert.equal(disconnected.status, 422);
  assert.equal(mocks.poolCreate.mock.calls.length, 0);
});

test("pool creation stores micros as bigint but returns serialized pool data", async () => {
  const { POST } = await import("../app/api/tools/api-credit-pools/route");
  mocks.connectionFindFirst.mockResolvedValue({ id: "connection-1", provider: "openai", product: "api_platform" });
  mocks.poolCreate.mockResolvedValue({ id: "pool-1", provider: "openai", mode: "recurring", budgetMicros: BigInt(25_000_000) });
  mocks.listPools.mockResolvedValue([{ id: "pool-1", budgetMicros: "25000000" }]);
  const response = await POST(new NextRequest("http://localhost/api/tools/api-credit-pools", {
    method: "POST", body: JSON.stringify({ connectionId: "connection-1", mode: "recurring", budgetMicros: "25000000", billingCadence: "monthly", billingCycleAnchorDate: "2026-07-01" }),
  }));
  assert.equal(response.status, 201);
  assert.equal(mocks.poolCreate.mock.calls[0][0].data.budgetMicros, BigInt(25_000_000));
  assert.equal((await response.json()).pool.budgetMicros, "25000000");
});

test("API key mapping rejects developers outside the organization and preserves manual clears", async () => {
  const { PATCH } = await import("../app/api/integrations/[id]/api-keys/[keyId]/route");
  mocks.keyFindFirst.mockResolvedValue({ id: "key-1" });
  mocks.developerFindFirst.mockResolvedValue(null);
  const invalid = await PATCH(new NextRequest("http://localhost/api/integrations/connection-1/api-keys/key-1", {
    method: "PATCH", body: JSON.stringify({ developerId: "other-org-developer" }),
  }), { params: Promise.resolve({ id: "connection-1", keyId: "key-1" }) });
  assert.equal(invalid.status, 422);

  mocks.keyUpdate.mockResolvedValue({ id: "key-1", developerId: null, mappingSource: "manual" });
  const cleared = await PATCH(new NextRequest("http://localhost/api/integrations/connection-1/api-keys/key-1", {
    method: "PATCH", body: JSON.stringify({ developerId: null }),
  }), { params: Promise.resolve({ id: "connection-1", keyId: "key-1" }) });
  assert.equal(cleared.status, 200);
  assert.deepEqual(mocks.keyUpdate.mock.calls[0][0].data, { developerId: null, mappingSource: "manual" });
});
