import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  developerCount: vi.fn(),
  orgFindUnique: vi.fn(),
  orgUpdate: vi.fn(),
  getSubscription: vi.fn(),
  updateSubscriptionItem: vi.fn(),
  ensureConfigured: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@usejunction/db", () => ({
  prisma: {
    developer: { count: mocks.developerCount },
    organization: { findUnique: mocks.orgFindUnique, update: mocks.orgUpdate },
  },
}));

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  getSubscription: mocks.getSubscription,
  updateSubscriptionItem: mocks.updateSubscriptionItem,
}));

vi.mock("@/lib/saas-billing/lemonsqueezy-setup", () => ({
  ensureLemonSqueezyConfigured: mocks.ensureConfigured,
}));

vi.mock("@/lib/rbac", () => ({ audit: mocks.audit }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.orgFindUnique.mockResolvedValue({
    plan: "team",
    subscriptionStatus: "active",
    lemonSqueezySubscriptionId: "sub_1",
    lemonSqueezyQuantity: 1,
  });
  mocks.getSubscription.mockResolvedValue({
    error: null,
    data: { data: { attributes: { first_subscription_item: { id: 42, quantity: 1 } } } },
  });
  mocks.updateSubscriptionItem.mockResolvedValue({ error: null });
  mocks.orgUpdate.mockResolvedValue({});
  mocks.audit.mockResolvedValue(undefined);
});

test("syncs the active roster with deferred proration", async () => {
  mocks.developerCount.mockResolvedValue(3);
  const { syncTeamSeatQuantity } = await import("@/lib/saas-billing/quantity");

  assert.deepEqual(await syncTeamSeatQuantity("org_1"), { status: "synced", quantity: 3 });
  assert.deepEqual(mocks.updateSubscriptionItem.mock.calls[0], [42, {
    quantity: 3,
    invoiceImmediately: false,
    disableProrations: false,
  }]);
  assert.deepEqual(mocks.orgUpdate.mock.calls[0][0].data, { lemonSqueezyQuantity: 3 });
});

test("skips Enterprise and inactive subscriptions", async () => {
  mocks.developerCount.mockResolvedValue(5);
  mocks.orgFindUnique.mockResolvedValue({
    plan: "enterprise",
    subscriptionStatus: "active",
    lemonSqueezySubscriptionId: "sub_1",
    lemonSqueezyQuantity: 1,
  });
  const { syncTeamSeatQuantity } = await import("@/lib/saas-billing/quantity");

  assert.deepEqual(await syncTeamSeatQuantity("org_1"), { status: "skipped", quantity: 5 });
  assert.equal(mocks.updateSubscriptionItem.mock.calls.length, 0);
});

test("retries when the roster changes during synchronization", async () => {
  mocks.developerCount
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(3)
    .mockResolvedValue(3);
  mocks.orgFindUnique
    .mockResolvedValueOnce({ plan: "team", subscriptionStatus: "active", lemonSqueezySubscriptionId: "sub_1", lemonSqueezyQuantity: 1 })
    .mockResolvedValueOnce({ plan: "team", subscriptionStatus: "active", lemonSqueezySubscriptionId: "sub_1", lemonSqueezyQuantity: 2 });
  const { syncTeamSeatQuantity } = await import("@/lib/saas-billing/quantity");

  assert.deepEqual(await syncTeamSeatQuantity("org_1"), { status: "synced", quantity: 3 });
  assert.deepEqual(mocks.updateSubscriptionItem.mock.calls.map((call) => call[1].quantity), [2, 3]);
});

test("forced reconciliation repairs remote drift even when the cached quantity matches", async () => {
  mocks.developerCount.mockResolvedValue(3);
  mocks.orgFindUnique.mockResolvedValue({
    plan: "team",
    subscriptionStatus: "active",
    lemonSqueezySubscriptionId: "sub_1",
    lemonSqueezyQuantity: 3,
  });
  mocks.getSubscription.mockResolvedValue({
    error: null,
    data: { data: { attributes: { first_subscription_item: { id: 42, quantity: 2 } } } },
  });
  const { syncTeamSeatQuantity } = await import("@/lib/saas-billing/quantity");

  assert.deepEqual(
    await syncTeamSeatQuantity("org_1", { verifyRemote: true }),
    { status: "synced", quantity: 3 },
  );
  assert.equal(mocks.updateSubscriptionItem.mock.calls[0][1].quantity, 3);
});

test("best-effort sync preserves the caller and audits failures", async () => {
  mocks.developerCount.mockResolvedValue(2);
  mocks.getSubscription.mockResolvedValue({ error: new Error("Lemon unavailable") });
  const { syncTeamSeatQuantityBestEffort } = await import("@/lib/saas-billing/quantity");

  assert.equal(await syncTeamSeatQuantityBestEffort("org_1", "test"), null);
  assert.equal(mocks.audit.mock.calls[0][0].action, "billing.seat_sync_failed");
});
