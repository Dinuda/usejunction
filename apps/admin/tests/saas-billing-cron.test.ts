import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orgFindMany: vi.fn(),
  syncTeamSeatQuantity: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: { organization: { findMany: mocks.orgFindMany } },
}));

vi.mock("@/lib/saas-billing/quantity", () => ({
  syncTeamSeatQuantity: mocks.syncTeamSeatQuantity,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-cron-secret";
});

test("billing reconciliation cron verifies each active Team quantity remotely", async () => {
  mocks.orgFindMany.mockResolvedValue([{ id: "org_1" }, { id: "org_2" }]);
  mocks.syncTeamSeatQuantity.mockResolvedValue({ status: "unchanged", quantity: 3 });
  const { POST } = await import("@/app/api/cron/billing-seat-sync/route");

  const response = await POST(new Request("http://localhost/api/cron/billing-seat-sync", {
    method: "POST",
    headers: { authorization: "Bearer test-cron-secret" },
  }) as never);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).checked, 2);
  assert.deepEqual(mocks.syncTeamSeatQuantity.mock.calls, [
    ["org_1", { verifyRemote: true }],
    ["org_2", { verifyRemote: true }],
  ]);
});

test("billing reconciliation cron rejects an invalid secret", async () => {
  const { POST } = await import("@/app/api/cron/billing-seat-sync/route");
  const response = await POST(new Request("http://localhost/api/cron/billing-seat-sync", {
    method: "POST",
    headers: { authorization: "Bearer wrong" },
  }) as never);

  assert.equal(response.status, 401);
  assert.equal(mocks.orgFindMany.mock.calls.length, 0);
});
