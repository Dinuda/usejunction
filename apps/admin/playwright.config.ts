import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const authDir = path.join(__dirname, "e2e", ".auth");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3001/login",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "public",
      testMatch: /(?:^|\/)public\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "owner.json"),
      },
      testIgnore: [/.*\.setup\.ts$/, /(?:^|\/)developer\.spec\.ts$/, /(?:^|\/)public\.spec\.ts$/, /mobile-.*\.spec\.ts$/],
    },
    {
      name: "developer",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "developer.json"),
      },
      testMatch: /(?:^|\/)developer\.spec\.ts$/,
    },
    {
      name: "mobile-public",
      testMatch: /mobile-public\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: "mobile-owner",
      dependencies: ["setup"],
      testMatch: /mobile-workspace\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        storageState: path.join(authDir, "owner.json"),
      },
    },
    {
      name: "mobile-developer",
      dependencies: ["setup"],
      testMatch: /mobile-developer\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        storageState: path.join(authDir, "developer.json"),
      },
    },
  ],
});
