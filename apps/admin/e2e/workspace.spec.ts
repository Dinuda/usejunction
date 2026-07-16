import { expect, test } from "@playwright/test";

const workspaceRoutes = [
  "/dashboard",
  "/dashboard?view=current_cycles",
  "/dashboard?view=previous_cycles",
  "/dashboard?view=last_30_days&days=90",
  "/dashboard?view=last_30_days&from=2026-07-01&to=2026-07-16",
  "/activity",
  "/team",
  "/team/e2e-developer",
  "/tools",
  "/tools/cursor",
  "/signals",
  "/signals/activity?range=30",
  "/signals/journeys?range=30",
  "/signals/journeys/github.com__cursor__slack.com?range=30",
  "/signals/tools?range=30",
  "/signals/settings",
];

for (const route of workspaceRoutes) {
  test(`${route} renders without server or browser errors`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status(), `${route} response`).toBeLessThan(500);
    await expect(page.locator("main")).toBeVisible();
    expect(pageErrors, `${route} page errors`).toEqual([]);
  });
}

test("dashboard exposes seeded calculation output and all period controls", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Spend, traffic, coverage." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model calls." })).toBeVisible();
  await expect(page.getByText("Subscription commitment")).toBeVisible();
  await expect(page.getByText("purchased seats · current cycle")).toBeVisible();
  await expect(page.getByText("$40.00").first()).toBeVisible();
  await expect(page.getByText("$5.00").first()).toBeVisible();
  await expect(page.getByText("$1.00").first()).toBeVisible();
  await expect(page.getByText("10 calls").first()).toBeVisible();
  await page.getByRole("link", { name: "Previous cycles" }).click();
  await expect(page).toHaveURL(/view=previous_cycles/);
  await page.goto("/dashboard?view=last_30_days");
  await page.getByRole("button", { name: "Adjust rolling period" }).click();
  await page.getByText("Last 90 days").click();
  await expect(page).toHaveURL(/days=90/);
});

test("Signals filters update the URL and preserve selected calculation scope", async ({ page }) => {
  await page.goto("/signals/activity?range=30");
  await page.getByLabel("Range").selectOption("90");
  await expect(page).toHaveURL(/range=90/);
  await page.getByLabel("AI tool").selectOption("cursor");
  await expect(page).toHaveURL(/range=90.*tool=cursor/);
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
});

test("Signals settings shows policy calculation boundaries", async ({ page }) => {
  await page.goto("/signals/settings");
  await expect(page.getByRole("heading", { name: "Boundaries", level: 1 })).toBeVisible();
  await expect(page.getByText(/Agents won’t send Signals/)).toBeVisible();
  await expect(page.locator("#signals-retention")).toContainText("90 days");
});

test("seeded usage totals stay consistent across owner calculation views", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByText("Model calls").first()).toBeVisible();
  await expect(page.getByText("$1.00").first()).toBeVisible();
  await expect(page.getByText("$6.00").first()).toBeVisible();

  await page.goto("/tools");
  await page.getByRole("tab", { name: "Subscriptions" }).click();
  await expect(page.getByText("$40.00").first()).toBeVisible();
  await expect(page.getByText("2 Cursor Pro")).toBeVisible();

  await page.goto("/tools/cursor");
  await expect(page.getByText("Usage cost (7d)")).toBeVisible();
  await expect(page.getByText("verified + estimated")).toBeVisible();
  await expect(page.getByText("$6.00").first()).toBeVisible();

  await page.goto("/team/e2e-developer");
  await expect(page.getByText("Usage cost").first()).toBeVisible();
  await expect(page.getByText("$6.00").first()).toBeVisible();
});

test("team member mirrors dashboard rolling and cycle filters", async ({ page }) => {
  await page.goto("/team/e2e-developer?view=last_30_days&days=3");
  await expect(page.getByRole("link", { name: "Last 3 days" })).toBeVisible();
  await expect(page.getByText("last 3 days").first()).toBeVisible();

  await page.goto("/team/e2e-developer?view=current_cycles");
  await expect(page.getByText("current billing cycles").first()).toBeVisible();
  await expect(page.getByText(/2026-07-.*to 2026-08-/).first()).toBeVisible();

  await page.goto("/team/e2e-developer?view=previous_cycles");
  await expect(page.getByText("previous billing cycles").first()).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();
});

test("seeded Signals journey list and detail agree", async ({ page }) => {
  await page.goto("/signals/journeys?range=30");
  const journeyLink = page.getByRole("link", { name: /github\.com.*Cursor.*slack\.com/i }).first();
  await expect(journeyLink).toBeVisible();
  await expect(page.getByText("2m").first()).toBeVisible();
  await journeyLink.click();
  await expect(page).toHaveURL(/github\.com__cursor__slack\.com/);
  await expect(page.getByText("Sessions", { exact: true })).toBeVisible();
  await expect(page.getByText("1").first()).toBeVisible();
  await expect(page.getByText("2m").first()).toBeVisible();
});
