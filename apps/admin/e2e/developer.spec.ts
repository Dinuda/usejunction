import { expect, test } from "@playwright/test";
import { setOnboardingState } from "./onboarding-state";

const developerEmail = process.env.E2E_DEVELOPER_EMAIL ?? "developer@example.com";

test("developer calculation views use personal usage totals", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Your device, tools, and last 30 days of traffic.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Cursor gpt-4\.1 10 .*\$5\.00 Verified/i })).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByRole("heading", { level: 1, name: "Your activity." })).toBeVisible();
  await expect(page.getByText("Requests").first()).toBeVisible();
  await expect(page.getByText("10").first()).toBeVisible();

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
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Billing settings" })).toHaveCount(0);
  // Developers stay personal-only — no Team | You audience switcher.
  await expect(page.getByRole("tablist", { name: "Audience" })).toHaveCount(0);

  await page.goto("/activity");
  await expect(page.getByRole("tablist", { name: "Audience" })).toHaveCount(0);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings." })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Audience" })).toHaveCount(0);

  await page.goto("/reports/daily");
  await expect(page).toHaveURL(/\/activity/);
  await expect(page.getByRole("heading", { name: "Reports." })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Audience" })).toHaveCount(0);
});

test("developer gets a safe forbidden state on owner-only calculation routes", async ({ page }) => {
  for (const route of [
    "/team",
    "/team/e2e-developer",
    "/tools/cursor",
    "/signals",
    "/signals/activity?days=30",
    "/signals/settings",
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("alert").filter({ hasText: "You do not have access to this resource." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  }
});

test("developer onboarding resume opens connect flow", async ({ page }) => {
  setOnboardingState(developerEmail, "incomplete");
  try {
    await page.goto("/onboarding?resume=1");
    await expect(page.getByText(/e2e-laptop is live|Connect this device|Connected/i).first()).toBeVisible();
  } finally {
    setOnboardingState(developerEmail, "complete");
  }
});
