import { expect, test } from "@playwright/test";

test("developer calculation views use personal usage totals", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Your machines, tools, and last 30 days of traffic.")).toBeVisible();
  await expect(page.getByText("10").first()).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByText("Usage cost")).toBeVisible();
  await expect(page.getByText("$6.00").first()).toBeVisible();

  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "Your tools." })).toBeVisible();
});

test("developer is redirected away from owner-only calculation routes", async ({ page }) => {
  for (const route of ["/team", "/tools/cursor", "/signals", "/signals/activity?range=30"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/dashboard/);
  }
});
