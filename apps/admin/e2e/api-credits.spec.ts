import { expect, test } from "@playwright/test";

test("owner can inspect provider credits and map an unassigned API key", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/tools");
  await page.getByRole("tab", { name: "API Credits" }).click();

  await expect(page.getByText("Configured credits")).toBeVisible();
  await expect(page.getByText("$150.00").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenAI API credits" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anthropic API credits" })).toBeVisible();
  await expect(page.getByText(/not the provider wallet balance/i).first()).toBeVisible();

  const openAiCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "OpenAI API credits" }) });
  await openAiCard.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "API keys" }).click();
  await expect(openAiCard.getByText("Production backend")).toBeVisible();
  const legacyRow = openAiCard.getByRole("row").filter({ hasText: "Legacy service" });
  await legacyRow.getByRole("combobox").click();
  await page.getByRole("option", { name: /E2E Developer/ }).click();
  await expect(legacyRow.getByRole("combobox")).toContainText("E2E Developer");

  expect(pageErrors, "API credit browser errors").toEqual([]);
});
