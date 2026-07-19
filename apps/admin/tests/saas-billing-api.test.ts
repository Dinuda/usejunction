import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireWorkspaceRole: vi.fn(),
  developerCount: vi.fn(),
  orgFindUnique: vi.fn(),
  createTeamCheckout: vi.fn(),
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

test("checkout derives quantity from the active roster and ignores requested quantity", async () => {
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
  assert.equal(body.quantity, 10);
  assert.equal(mocks.createTeamCheckout.mock.calls[0][0].quantity, 10);
});

test("checkout uses one seat when the roster is empty", async () => {
  mocks.developerCount.mockResolvedValue(0);
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
      body: JSON.stringify({}),
    }) as never,
  );

  assert.equal(response.status, 200);
  assert.equal(mocks.createTeamCheckout.mock.calls[0][0].quantity, 1);
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
