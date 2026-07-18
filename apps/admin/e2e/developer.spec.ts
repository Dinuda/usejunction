import { expect, test } from "@playwright/test";

test("developer calculation views use personal usage totals", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Your machines, tools, and last 30 days of traffic.")).toBeVisible();
  await expect(page.getByText("10").first()).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByText("Verified usage")).toBeVisible();
  await expect(page.getByText("$5.00").first()).toBeVisible();
  await expect(page.getByText("Estimated API value")).toBeVisible();
  await expect(page.getByText("$1.00").first()).toBeVisible();

  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "Your tools." })).toBeVisible();
  await expect(page.locator("main").getByText("cursor", { exact: true })).toBeVisible();
});

test("developer chrome hides owner-only navigation", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("link", { name: /My tools|Tools/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /My activity|Activity/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Signals" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
});

test("developer is redirected away from owner-only calculation routes", async ({ page }) => {
  for (const route of [
    "/team",
    "/team/e2e-developer",
    "/tools/cursor",
    "/signals",
    "/signals/activity?range=30",
    "/signals/settings",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/dashboard/);
  }
});

test("developer onboarding resume opens connect flow", async ({ page }) => {
  await page.goto("/onboarding?resume=1");
  await expect(page.getByText(/e2e-laptop is live|Run this in Terminal|Connected/i).first()).toBeVisible();
});
