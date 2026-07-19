import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  ensureConfigured: vi.fn(),
  getAppBaseUrl: vi.fn(),
  requireLemonEnv: vi.fn(),
}));

vi.mock("@lemonsqueezy/lemonsqueezy.js", () => ({
  createCheckout: mocks.createCheckout,
  getCustomer: vi.fn(),
  getSubscription: vi.fn(),
}));

vi.mock("@/lib/saas-billing/lemonsqueezy-setup", () => ({
  ensureLemonSqueezyConfigured: mocks.ensureConfigured,
  getAppBaseUrl: mocks.getAppBaseUrl,
  requireLemonEnv: mocks.requireLemonEnv,
}));

vi.mock("@/lib/saas-billing/quantity", () => ({
  syncTeamSeatQuantity: vi.fn(),
  syncTeamSeatQuantityBestEffort: vi.fn(),
  syncSubscriptionQuantityForOrg: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppBaseUrl.mockReturnValue("https://app.usejunction.test");
  mocks.requireLemonEnv.mockImplementation((name: string) =>
    name === "LEMONSQUEEZY_STORE_ID" ? "10" : "20",
  );
  mocks.createCheckout.mockResolvedValue({
    error: null,
    data: { data: { attributes: { url: "https://lemon.test/checkout" } } },
  });
});

test("checkout shows the active member quantity in Lemon's product summary", async () => {
  const { createTeamCheckout } = await import("@/lib/saas-billing/lemonsqueezy");

  assert.equal(await createTeamCheckout({
    orgId: "org_1",
    email: "owner@example.com",
    name: "Owner",
    quantity: 3,
  }), "https://lemon.test/checkout");

  const [, , options] = mocks.createCheckout.mock.calls[0];
  assert.equal(options.productOptions.name, "UseJunction Team");
  assert.match(options.productOptions.description, /3 active members/);
  assert.match(options.productOptions.description, /next bill/);
  assert.deepEqual(options.productOptions.enabledVariants, [20]);
  assert.equal(options.checkoutOptions.desc, true);
  assert.deepEqual(options.checkoutData.variantQuantities, [{ variantId: 20, quantity: 3 }]);
});

test("checkout uses singular member copy", async () => {
  const { createTeamCheckout } = await import("@/lib/saas-billing/lemonsqueezy");
  await createTeamCheckout({ orgId: "org_1", email: "owner@example.com", quantity: 1 });

  const [, , options] = mocks.createCheckout.mock.calls[0];
  assert.match(options.productOptions.description, /1 active member<\/strong>/);
});
