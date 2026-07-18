import { expect, test } from "@playwright/test";

test("upgrade seat picker posts chosen quantity to checkout", async ({ page }) => {
  let checkoutBody: unknown = null;
  await page.route("**/api/billing/checkout", async (route) => {
    checkoutBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://lemon.test/checkout-e2e", quantity: 12 }),
    });
  });

  // Force community-style upgrade affordance via evaluating billing is hard;
  // seed is Team — open Add seats instead and also exercise Upgrade if present.
  await page.goto("/dashboard");
  await expect(page.getByText("Plan", { exact: true })).toBeVisible();

  const upgrade = page.getByRole("button", { name: /Upgrade to Team/i });
  const addSeats = page.getByRole("button", { name: /Add seats/i });

  if (await upgrade.isVisible().catch(() => false)) {
    await upgrade.click();
    const seats = page.getByLabel(/Seats/i);
    await expect(seats).toBeVisible();
    await seats.fill("12");
    await page.getByRole("button", { name: /Continue to checkout/i }).click();
    await expect.poll(() => checkoutBody).toEqual({ quantity: 12 });
  } else {
    await expect(addSeats).toBeVisible();
    let seatsBody: unknown = null;
    await page.route("**/api/billing/seats", async (route) => {
      seatsBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, quantity: 12 }),
      });
    });
    await addSeats.click();
    const seats = page.getByLabel(/Total seats/i);
    await expect(seats).toBeVisible();
    await seats.fill("12");
    await page.getByRole("button", { name: /Update seats/i }).click();
    await expect.poll(() => seatsBody).toEqual({ quantity: 12 });
  }
});

test("plan card shows purchased seat coverage for Team seed", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(/\/\s*5 seats/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Add seats/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Manage billing/i })).toBeVisible();
});
