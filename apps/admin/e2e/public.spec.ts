import { expect, test } from "@playwright/test";

const teamInviteToken = process.env.E2E_TEAM_INVITE_TOKEN ?? "uj_team_e2e_calculation_invite";
const orgInviteToken = process.env.E2E_ORG_INVITE_TOKEN ?? "uj_invite_e2e_calculation_member";
const connectInviteToken = process.env.E2E_CONNECT_INVITE_TOKEN ?? "uj_connect_e2e_calculation_machine";

const publicRoutes = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/contact",
  "/i/invalid-token",
  "/join/invalid-token",
  "/join/company/missing-org",
  "/connect-invite/invalid-token",
];

for (const route of publicRoutes) {
  test(`${route} renders without server or browser errors`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status(), `${route} response`).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    expect(pageErrors, `${route} page errors`).toEqual([]);
  });
}

test("landing page shows brand and primary CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "UseJunction home" }).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /See how your team uses AI/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Get started/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Self-host UseJunction/i })).toBeVisible();
});

test("homepage product story exposes spend pace and plan runway", async ({ page }) => {
  await page.goto("/");

  const tabs = page.getByRole("tablist", { name: "Product workflows" });
  const seeTab = tabs.getByRole("tab", { name: "See it" });
  const understandTab = tabs.getByRole("tab", { name: "Understand it" });
  const actTab = tabs.getByRole("tab", { name: "Act on it" });

  await expect(seeTab).toHaveAttribute("aria-selected", "true");
  await seeTab.focus();
  await seeTab.press("ArrowRight");
  await expect(understandTab).toHaveAttribute("aria-selected", "true");

  const spendPanel = page.getByRole("tabpanel");
  await expect(spendPanel.getByText("Developer spend watch")).toBeVisible();
  await expect(spendPanel.getByText("Above team baseline")).toBeVisible();
  await expect(spendPanel.getByText("Projected to run out 6 days early")).toBeVisible();
  await expect(spendPanel.getByText("1 plan at risk")).toBeVisible();

  await understandTab.press("End");
  await expect(actTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByText("Claude Max may run out 6 days early")).toBeVisible();
});

test("homepage shows current pricing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /AI spend is data/i })).toBeVisible();
  await expect(page.getByText("Free", { exact: true })).toBeVisible();
  await expect(page.getByText("$8", { exact: true })).toBeVisible();
  await expect(page.getByText("Custom", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Community" })).toBeVisible();
  await expect(page.getByText("Self-hosted", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Managed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get Started" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Self-host UseJunction" })).toBeVisible();
});

test("login form rejects bad credentials and links to recovery", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Sign in to UseJunction/i })).toBeVisible();
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/We could not sign you in/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
});

test("signup form validates password confirmation", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByLabel("Full name")).toBeVisible();
  await page.getByLabel("Full name").fill("E2E Signup");
  await page.getByLabel("Work email").fill("signup-e2e@example.com");
  await page.getByLabel("Password", { exact: true }).fill("long-enough-password");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText(/matching password of at least 12 characters/i),
  ).toBeVisible();
});

test("forgot password shows confirmation after submit", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: /Reset your password/i })).toBeVisible();
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/Check your email for next steps/i)).toBeVisible();
});

test("reset password form is available", async ({ page }) => {
  await page.goto("/reset-password?token=invalid");
  await expect(page.getByRole("heading", { name: /Choose a new password/i })).toBeVisible();
  await expect(page.getByLabel("New password")).toBeVisible();
  await expect(page.getByLabel("Confirm password")).toBeVisible();
});

test("contact form submits a note", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: /Tell us what your team needs/i })).toBeVisible();
  await page.getByLabel("Name").fill("E2E Contact");
  await page.getByLabel("Work email").fill("contact-e2e@example.com");
  await page.getByLabel("Company").fill("Calculation E2E");
  await page.getByLabel("What are you evaluating?").fill("Browser e2e coverage");
  await page.getByRole("button", { name: "Send note" }).click();
  await expect(page.getByText(/Thanks—your note has been received/i)).toBeVisible();
});

test("invalid invite routes show unavailable messaging", async ({ page }) => {
  await page.goto("/i/invalid-token");
  await expect(page.getByRole("heading", { name: /This invite is unavailable/i })).toBeVisible();

  await page.goto("/join/invalid-token");
  await expect(page.getByRole("heading", { name: /This invitation is unavailable/i })).toBeVisible();

  await page.goto("/connect-invite/invalid-token");
  await expect(page.getByRole("heading", { name: /This link is unavailable/i })).toBeVisible();

  await page.goto("/join/company/missing-org");
  await expect(page.getByRole("heading", { name: /Company join is unavailable/i })).toBeVisible();
});

test("seeded invite links render join flows", async ({ page }) => {
  await page.goto(`/i/${teamInviteToken}`);
  await expect(page.getByRole("heading", { name: /Join Calculation E2E/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto(`/join/${orgInviteToken}`);
  await expect(page.getByRole("heading", { name: /Join Calculation E2E/i })).toBeVisible();

  await page.goto(`/connect-invite/${connectInviteToken}`);
  await expect(page.getByRole("heading", { name: /Join Calculation E2E/i })).toBeVisible();
});
