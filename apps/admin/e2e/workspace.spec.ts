import { expect, test } from "@playwright/test";

const workspaceRoutes = [
  "/dashboard",
  "/dashboard?view=current_cycles",
  "/dashboard?view=previous_cycles",
  "/dashboard?view=last_30_days&days=90",
  "/dashboard?view=last_30_days&from=2026-07-01&to=2026-07-16",
  "/activity",
  "/settings",
  "/team",
  "/team/e2e-developer",
  "/team/e2e-developer/work",
  "/team/e2e-developer/coding",
  "/team/e2e-developer/fleet",
  "/tools",
  "/tools/cursor",
  "/signals",
  "/signals/activity?range=30",
  "/signals/journeys?range=30",
  "/signals/journeys/github.com__cursor__slack.com?range=30",
  "/signals/tools?range=30",
  "/signals/settings",
  "/onboarding?resume=1",
];

for (const route of workspaceRoutes) {
  test(`${route} renders without server or browser errors`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status(), `${route} response`).toBeLessThan(500);
    const shell = route.startsWith("/onboarding") ? page.locator("body") : page.locator("main");
    await expect(shell).toBeVisible();
    expect(pageErrors, `${route} page errors`).toEqual([]);
  });
}

test("owner chrome exposes nav, plan status, and workspace switcher", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Signals" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tools", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Plan", { exact: true })).toBeVisible();
  await expect(page.getByText(/\/\s*\d+ seats|devices enrolled|\/\s*10 devices/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Manage billing|Add seats|Upgrade to Team/i }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Workspace" })).toBeVisible();
});

test("dashboard exposes seeded calculation output and all period controls", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Spend, traffic, coverage." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model calls." })).toBeVisible();
  await expect(page.getByText("Subscription commitment")).toBeVisible();
  await expect(page.getByText("purchased seats · current cycle")).toBeVisible();
  await expect(page.getByText("$40.00").first()).toBeVisible();
  await expect(page.getByText("$5.00").first()).toBeVisible();
  await expect(page.getByText("$1.00").first()).toBeVisible();
  await expect(page.getByText("10").first()).toBeVisible();
  await expect(page.getByText("10 calls").first()).toBeVisible();
  await page.getByRole("link", { name: "Previous cycles" }).click();
  await expect(page).toHaveURL(/view=previous_cycles/);
  await page.goto("/dashboard?view=last_30_days");
  await page.getByRole("button", { name: "Adjust rolling period" }).click();
  await page.getByText("Last 90 days").click();
  await expect(page).toHaveURL(/days=90/);
});

test("Signals filters update the URL and preserve selected calculation scope", async ({ page }) => {
  await page.goto("/signals/activity");
  await page.getByRole("link", { name: "Previous cycles" }).click();
  await expect(page).toHaveURL(/view=previous_cycles/);
  await page.goto("/signals/activity?view=last_30_days");
  await page.getByRole("button", { name: "Adjust rolling period" }).click();
  await page.getByRole("menuitem", { name: /Last 90 days/i }).click();
  await expect(page).toHaveURL(/days=90/);
  await page.getByLabel("AI tool").selectOption("cursor");
  await expect(page).toHaveURL(/days=90.*tool=cursor/);
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
});

test("Signals overview shows work-off empty state and Settings CTA", async ({ page }) => {
  await page.goto("/signals");
  await expect(page.getByRole("heading", { name: "Signals" })).toBeVisible();
  await expect(page.getByText(/Turn on work extraction under Settings/i)).toBeVisible();
  await expect(page.getByText(/^Insight$/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Open Settings" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "Signals", level: 2 })).toBeVisible();
});

test("Signals activity is work-only and classic journey routes redirect", async ({ page }) => {
  await page.goto("/signals/activity");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();
  await expect(page.getByText(/Work extraction is off/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /github\.com.*Cursor.*slack\.com/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Current cycles" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous cycles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust rolling period" })).toBeVisible();

  await page.goto("/signals/journeys?range=30");
  await expect(page).toHaveURL(/\/signals\/activity/);

  await page.goto("/signals/tools?range=30");
  await expect(page).toHaveURL(/\/signals\/activity/);
});

test("Signals settings shows work-first retention controls", async ({ page }) => {
  await page.goto("/signals/settings");
  await expect(page.getByRole("heading", { name: "Boundaries", level: 1 })).toBeVisible();
  await expect(page.getByText(/Turn on work extraction under Settings/i)).toBeVisible();
  await expect(page.getByText(/Legacy app & domain sampling/i)).toHaveCount(0);
  await expect(page.locator("#signals-retention")).toContainText("90 days");
});

test("Settings shows workspace, Signals, and activity visibility controls", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings.", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signals", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Activity visibility", level: 2 })).toBeVisible();
  await expect(page.getByLabel("Workspace name")).toBeVisible();
  await expect(page.getByRole("button", { name: /Turn on|Turn off/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Allow for team|Restrict to admins/ }).first()).toBeVisible();
});

test("settings mutations rename workspace and toggle activity visibility", async ({ page }) => {
  await page.goto("/settings");
  const nameInput = page.getByLabel("Workspace name");
  await nameInput.fill("Calculation E2E Renamed");
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  const visibilityButton = page.getByRole("button", { name: /Allow for team|Restrict to admins/ }).first();
  const before = await visibilityButton.textContent();
  await visibilityButton.click();
  await expect(visibilityButton).not.toHaveText(before ?? "");

  await nameInput.fill("Calculation E2E");
  await page.getByRole("button", { name: "Save workspace" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await visibilityButton.click();
  await expect(visibilityButton).toHaveText(before ?? "");
});

test("seeded usage totals stay consistent across owner calculation views", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByText("Requests").first()).toBeVisible();
  await expect(page.getByText("10").first()).toBeVisible();
  await expect(page.getByText("1.5M").first()).toBeVisible();

  await page.goto("/tools");
  await page.getByRole("tab", { name: "Subscriptions" }).click();
  await expect(page.getByText("$40.00").first()).toBeVisible();
  await expect(page.getByText("2 Cursor Pro")).toBeVisible();

  await page.goto("/tools/cursor");
  await expect(page.getByText(/Usage cost \(/)).toBeVisible();
  await expect(page.getByText("verified + estimated")).toBeVisible();
  await expect(page.getByText("$6.00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust period" })).toBeVisible();

  await page.goto("/tools/cursor?view=last_30_days&days=3");
  await expect(page.getByText("Usage cost (3d)")).toBeVisible();

  await page.goto("/team/e2e-developer");
  await expect(page.getByText("Verified usage").first()).toBeVisible();
  await expect(page.getByText("$5.00").first()).toBeVisible();
  await expect(page.getByText("Estimated API value").first()).toBeVisible();
  await expect(page.getByText("$1.00").first()).toBeVisible();
});

test("team member mirrors dashboard rolling and cycle filters", async ({ page }) => {
  await page.goto("/team/e2e-developer?view=last_30_days&days=3");
  await expect(page.getByText("Last 3 days").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust period" })).toBeVisible();

  await page.goto("/team/e2e-developer?view=current_cycles");
  await expect(page.getByText("Verified usage").first()).toBeVisible();
  await expect(page.getByText("$5.00").first()).toBeVisible();

  await page.goto("/team/e2e-developer?view=previous_cycles");
  await expect(page.getByText("$0.00").first()).toBeVisible();
});

test("team roster lists seeded members and opens invite dialog", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByRole("heading", { name: "Team", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("E2E Developer").first()).toBeVisible();
  await expect(page.getByText("Off", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Invite teammates" }).click();
  await expect(page.getByRole("heading", { name: "Invite teammates." })).toBeVisible();
  await expect(page.getByText(/Share the invite link/i)).toBeVisible();
  await expect(page.getByText(/\/i\//).first()).toBeVisible({ timeout: 15_000 });
});

test("member hub tabs expose work, coding, and fleet", async ({ page }) => {
  await page.goto("/team/e2e-developer");
  await expect(page.getByRole("heading", { name: "E2E Developer." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Member sections" })).toBeVisible();

  await page.getByRole("link", { name: "Work", exact: true }).click();
  await expect(page).toHaveURL(/\/team\/e2e-developer\/work/);
  await expect(page.getByRole("heading", { name: "Extracted work." })).toBeVisible();
  await expect(page.getByText(/Work extraction is off|Open in Signals/i).first()).toBeVisible();

  await page.getByRole("link", { name: "Coding", exact: true }).click();
  await expect(page).toHaveURL(/\/team\/e2e-developer\/coding/);
  await expect(page.getByRole("heading", { name: "AI coding." })).toBeVisible();

  await page.getByRole("link", { name: "Fleet", exact: true }).click();
  await expect(page).toHaveURL(/\/team\/e2e-developer\/fleet/);
  await expect(page.getByRole("heading", { name: "Fleet." })).toBeVisible();
  await expect(page.getByText("e2e-laptop")).toBeVisible();
  await expect(page.getByText("online", { exact: true })).toBeVisible();
  await expect(page.getByText("darwin").first()).toBeVisible();
});

test("classic Signals journey routes redirect to Activity", async ({ page }) => {
  await page.goto("/signals/journeys/github.com__cursor__slack.com?range=30");
  await expect(page).toHaveURL(/\/signals\/activity/);
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
});

test("onboarding resume shows workspace setup choices", async ({ page }) => {
  await page.goto("/onboarding?resume=1");
  await expect(page.getByText("Workspace setup").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect this computer/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Invite the team/i })).toBeVisible();
});
