import { expect, test } from "@playwright/test";

for (const route of ["/dashboard", "/activity", "/tools", "/onboarding?resume=1"]) {
  test(`developer ${route} fits the mobile viewport`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("developer drawer only shows permitted mobile navigation", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: /My tools|Tools/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
});
