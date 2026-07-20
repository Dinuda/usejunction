import { expect, test } from "@playwright/test";

test("API Credits tab shows coming soon", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/tools");
  await page.getByRole("tab", { name: "API Credits" }).click();

  await expect(page.getByText("Coming soon")).toBeVisible();
  await expect(page.getByText(/available in a later release/i)).toBeVisible();

  expect(pageErrors, "API credit browser errors").toEqual([]);
});
