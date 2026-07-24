import { expect, test } from "@playwright/test";

test("API Credits tab is absent; subscriptions still work", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/tools");

  await expect(page.getByRole("tab", { name: "API Credits" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Subscriptions" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Activity" })).toBeVisible();

  await page.getByRole("tab", { name: "Subscriptions" }).click();
  await expect(page.getByRole("button", { name: /Add tool/i }).first()).toBeVisible();

  expect(pageErrors, "Tools page browser errors").toEqual([]);
});
