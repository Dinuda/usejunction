import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceRole: vi.fn(),
  developerCount: vi.fn(),
  orgFindUnique: vi.fn(),
  createTeamCheckout: vi.fn(),
  setSubscriptionQuantity: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/workspace-context", () => ({
  requireWorkspaceRole: mocks.requireWorkspaceRole,
}));

vi.mock("@/lib/rbac", () => ({
  audit: mocks.audit,
  rolesFor: () => ["owner", "admin"],
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    developer: { count: mocks.developerCount },
    organization: { findUnique: mocks.orgFindUnique },
  },
}));

vi.mock("@/lib/saas-billing/lemonsqueezy", () => ({
  createTeamCheckout: mocks.createTeamCheckout,
}));

vi.mock("@/lib/saas-billing/quantity", async () => {
  const actual = await vi.importActual<typeof import("@/lib/saas-billing/quantity")>(
    "@/lib/saas-billing/quantity",
  );
  return {
    ...actual,
    setSubscriptionQuantity: mocks.setSubscriptionQuantity,
  };
});

vi.mock("@/lib/errors/public", () => ({
  publicErrorResponse: (_route: string, _error: unknown, message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspaceRole.mockResolvedValue({
    orgId: "org_1",
    userId: "user_1",
    email: "owner@example.com",
    name: "Owner",
  });
  mocks.audit.mockResolvedValue(undefined);
});

test("checkout accepts quantity 12 when roster is 10", async () => {
  mocks.developerCount.mockResolvedValue(10);
  mocks.orgFindUnique.mockResolvedValue({
    plan: "community",
    subscriptionStatus: null,
    lemonSqueezyCustomerId: null,
  });
  mocks.createTeamCheckout.mockResolvedValue("https://lemon.test/checkout");

  const { POST } = await import("../app/api/billing/checkout/route");
  const response = await POST(
    new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 12 }),
    }) as never,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.url, "https://lemon.test/checkout");
  assert.equal(body.quantity, 12);
  assert.equal(mocks.createTeamCheckout.mock.calls[0][0].quantity, 12);
});

test("checkout rejects quantity below roster", async () => {
  mocks.developerCount.mockResolvedValue(10);
  mocks.orgFindUnique.mockResolvedValue({
    plan: "community",
    subscriptionStatus: null,
    lemonSqueezyCustomerId: null,
  });

  const { POST } = await import("../app/api/billing/checkout/route");
  const response = await POST(
    new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 8 }),
    }) as never,
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /at least 10/);
  assert.equal(mocks.createTeamCheckout.mock.calls.length, 0);
});

test("checkout 409 for active team subscription", async () => {
  mocks.developerCount.mockResolvedValue(3);
  mocks.orgFindUnique.mockResolvedValue({
    plan: "team",
    subscriptionStatus: "active",
    lemonSqueezyCustomerId: "cust_1",
  });

  const { POST } = await import("../app/api/billing/checkout/route");
  const response = await POST(
    new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      body: "{}",
    }) as never,
  );

  assert.equal(response.status, 409);
});

test("add seats rejects quantity below roster", async () => {
  mocks.developerCount.mockResolvedValue(4);
  mocks.setSubscriptionQuantity.mockResolvedValue(undefined);

  const { POST } = await import("../app/api/billing/seats/route");
  const response = await POST(
    new Request("http://localhost/api/billing/seats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 2 }),
    }) as never,
  );

  assert.equal(response.status, 400);
  assert.equal(mocks.setSubscriptionQuantity.mock.calls.length, 0);
});

test("add seats updates lemon quantity", async () => {
  mocks.developerCount.mockResolvedValue(4);
  mocks.setSubscriptionQuantity.mockResolvedValue(undefined);

  const { POST } = await import("../app/api/billing/seats/route");
  const response = await POST(
    new Request("http://localhost/api/billing/seats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 12 }),
    }) as never,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, quantity: 12 });
  assert.equal(mocks.setSubscriptionQuantity.mock.calls[0][0], "org_1");
  assert.equal(mocks.setSubscriptionQuantity.mock.calls[0][1], 12);
});
