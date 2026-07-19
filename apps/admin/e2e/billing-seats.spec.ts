import { expect, test } from "@playwright/test";

test("active paid plan uses a compact workspace sidebar badge", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Plan", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Team plan", { exact: true })).toBeVisible();
  await expect(page.getByText(/active users?/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add seats/i })).toHaveCount(0);
});

test("active paid plan remains manageable from Settings", async ({ page }) => {
  await page.goto("/settings");
  const billing = page.getByRole("region", { name: "Billing" });
  await expect(billing.getByText(/active users?/i).first()).toBeVisible();
  await expect(billing.getByRole("button", { name: /Manage billing/i })).toBeVisible();
});
