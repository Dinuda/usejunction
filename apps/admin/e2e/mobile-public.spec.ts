import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/blog",
  "/blog/visibility-before-control",
  "/guides",
  "/guides/see-plan-usage-and-waste",
  "/compare",
  "/compare/wakatime",
  "/for",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password?token=invalid",
  "/contact",
  "/privacy",
  "/terms",
  "/i/invalid-token",
  "/join/invalid-token",
  "/join/company/missing-org",
  "/connect-invite/invalid-token",
];

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const route of routes) {
  test(`${route} fits a mobile viewport`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    await expectNoPageOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("public mobile navigation opens, navigates, and closes", async ({ page }) => {
  await page.goto("/");
  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();
  const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("link", { name: "Guides", exact: true }).click();
  await expect(page).toHaveURL(/\/guides$/);
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toHaveCount(0);
});

test("critical public flows fit at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const route of ["/", "/login", "/signup", "/contact"]) {
    await page.goto(route);
    await expectNoPageOverflow(page);
  }
});
